const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { OAuth2Client } = require('google-auth-library');
const db = require('../db/database');
const { JWT_SECRET, authMiddleware } = require('../middleware/auth');
const { kirimEmailVerifikasi } = require('./_email');

const router = express.Router();
const googleClient = process.env.GOOGLE_CLIENT_ID ? new OAuth2Client(process.env.GOOGLE_CLIENT_ID) : null;

// ==================== REGISTER ====================
router.post('/register', async (req, res) => {
    try {
        const { nama, email, password } = req.body;

        if (!nama || !email || !password) {
            return res.status(400).json({
                status: 'error',
                message: 'Nama, email, dan password wajib diisi'
            });
        }

        if (password.length < 6) {
            return res.status(400).json({
                status: 'error',
                message: 'Password minimal 6 karakter'
            });
        }

        const existing = await db.prepare('SELECT id FROM users WHERE email = ?').get(email);
        if (existing) {
            return res.status(409).json({
                status: 'error',
                message: 'Email sudah terdaftar'
            });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const userUuid = uuidv4();
        const verificationToken = crypto.randomBytes(32).toString('hex');

        const result = await db.prepare(`
            INSERT INTO users (uuid, nama, email, password_hash, verification_token)
            VALUES (?, ?, ?, ?, ?)
        `).run(userUuid, nama, email, passwordHash, verificationToken);

        // Buat pengaturan default untuk user baru
        await db.prepare('INSERT INTO user_settings (user_id) VALUES (?)').run(result.lastInsertRowid);

        const appUrl = `${req.protocol}://${req.get('host')}`;
        const emailResult = await kirimEmailVerifikasi(email, nama, verificationToken, appUrl);

        res.status(201).json({
            status: 'success',
            message: emailResult.sent
                ? 'Registrasi berhasil. Silakan cek email kamu untuk verifikasi.'
                : 'Registrasi berhasil. Email verifikasi belum terkirim (SMTP belum dikonfigurasi) — kamu tetap bisa login.',
            data: {
                id: result.lastInsertRowid,
                nama,
                email,
                email_sent: emailResult.sent
            }
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Terjadi kesalahan pada server' });
    }
});

// ==================== VERIFIKASI EMAIL ====================
router.get('/verify-email', async (req, res) => {
    try {
        const { token } = req.query;

        if (!token) {
            return res.status(400).json({ status: 'error', message: 'Token verifikasi wajib diisi' });
        }

        const user = await db.prepare('SELECT id FROM users WHERE verification_token = ?').get(token);

        if (!user) {
            return res.status(400).json({ status: 'error', message: 'Token verifikasi tidak valid' });
        }

        await db.prepare('UPDATE users SET email_verified = 1, verification_token = NULL WHERE id = ?').run(user.id);

        res.json({ status: 'success', message: 'Email berhasil diverifikasi' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Terjadi kesalahan pada server' });
    }
});

// ==================== KIRIM ULANG EMAIL VERIFIKASI ====================
router.post('/resend-verification', authMiddleware, async (req, res) => {
    try {
    const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);

    if (user.email_verified) {
        return res.status(400).json({ status: 'error', message: 'Email kamu sudah terverifikasi' });
    }

    let token = user.verification_token;
    if (!token) {
        token = crypto.randomBytes(32).toString('hex');
        await db.prepare('UPDATE users SET verification_token = ? WHERE id = ?').run(token, user.id);
    }

    const appUrl = `${req.protocol}://${req.get('host')}`;
    const emailResult = await kirimEmailVerifikasi(user.email, user.nama, token, appUrl);

    res.json({
        status: 'success',
        message: emailResult.sent ? 'Email verifikasi berhasil dikirim ulang' : 'SMTP belum dikonfigurasi, cek log server untuk tautan verifikasi'
    });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Terjadi kesalahan pada server' });
    }
});

// ==================== LOGIN DENGAN GOOGLE ====================
router.post('/google', async (req, res) => {
    try {
        if (!googleClient) {
            return res.status(501).json({
                status: 'error',
                message: 'Login Google belum dikonfigurasi. Tambahkan GOOGLE_CLIENT_ID di .env'
            });
        }

        const { id_token } = req.body;
        if (!id_token) {
            return res.status(400).json({ status: 'error', message: 'id_token wajib diisi' });
        }

        const ticket = await googleClient.verifyIdToken({
            idToken: id_token,
            audience: process.env.GOOGLE_CLIENT_ID
        });
        const payload = ticket.getPayload();

        let user = await db.prepare('SELECT * FROM users WHERE email = ?').get(payload.email);

        if (!user) {
            // Belum punya akun -> buat otomatis
            const userUuid = uuidv4();
            const randomPassword = await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 10);

            const result = await db.prepare(`
                INSERT INTO users (uuid, nama, email, password_hash, email_verified, google_id, avatar_url)
                VALUES (?, ?, ?, ?, 1, ?, ?)
            `).run(userUuid, payload.name || payload.email.split('@')[0], payload.email, randomPassword, payload.sub, payload.picture || null);

            await db.prepare('INSERT INTO user_settings (user_id) VALUES (?)').run(result.lastInsertRowid);
            user = await db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
        } else if (!user.google_id) {
            // Akun sudah ada (dari email/password) -> tautkan google_id
            await db.prepare('UPDATE users SET google_id = ?, email_verified = 1 WHERE id = ?').run(payload.sub, user.id);
        }

        const token = jwt.sign(
            { id: user.id, email: user.email, couple_id: user.couple_id },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            status: 'success',
            message: 'Login dengan Google berhasil',
            data: {
                token,
                user: { id: user.id, nama: user.nama, email: user.email, couple_id: user.couple_id, email_verified: true }
            }
        });

    } catch (err) {
        console.error('Google login error:', err.message);
        res.status(401).json({ status: 'error', message: 'Verifikasi token Google gagal' });
    }
});

// ==================== LOGIN ====================
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ status: 'error', message: 'Email dan password wajib diisi' });
        }

        const user = await db.prepare('SELECT * FROM users WHERE email = ?').get(email);

        if (!user) {
            return res.status(401).json({ status: 'error', message: 'Email atau password salah' });
        }

        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            return res.status(401).json({ status: 'error', message: 'Email atau password salah' });
        }

        const token = jwt.sign(
            { id: user.id, email: user.email, couple_id: user.couple_id },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            status: 'success',
            message: 'Login berhasil',
            data: {
                token,
                user: {
                    id: user.id,
                    nama: user.nama,
                    email: user.email,
                    couple_id: user.couple_id,
                    email_verified: !!user.email_verified
                }
            }
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Terjadi kesalahan pada server' });
    }
});

// ==================== KIRIM UNDANGAN PASANGAN ====================
router.post('/couple/invite', authMiddleware, async (req, res) => {
    try {
        const { to_email } = req.body;

        if (!to_email) {
            return res.status(400).json({ status: 'error', message: 'Email pasangan wajib diisi' });
        }

        if (to_email === req.user.email) {
            return res.status(400).json({ status: 'error', message: 'Tidak bisa mengundang diri sendiri' });
        }

        const invitationUuid = uuidv4();
        await db.prepare(`
            INSERT INTO couple_invitations (uuid, from_user_id, to_email)
            VALUES (?, ?, ?)
        `).run(invitationUuid, req.user.id, to_email);

        res.status(201).json({
            status: 'success',
            message: `Undangan berhasil dikirim ke ${to_email}`
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Terjadi kesalahan pada server' });
    }
});

// ==================== TERIMA / TOLAK UNDANGAN ====================
router.post('/couple/respond', authMiddleware, async (req, res) => {
    try {
        const { invitation_uuid, action } = req.body; // action: 'accept' | 'reject'

        const invitation = await db.prepare(`
            SELECT * FROM couple_invitations WHERE uuid = ? AND status = 'pending'
        `).get(invitation_uuid);

        if (!invitation) {
            return res.status(404).json({ status: 'error', message: 'Undangan tidak ditemukan atau sudah diproses' });
        }

        if (invitation.to_email !== req.user.email) {
            return res.status(403).json({ status: 'error', message: 'Undangan ini bukan untuk kamu' });
        }

        if (action === 'reject') {
            await db.prepare('UPDATE couple_invitations SET status = ? WHERE uuid = ?').run('rejected', invitation_uuid);
            return res.json({ status: 'success', message: 'Undangan ditolak' });
        }

        // action === 'accept'
        const coupleUuid = uuidv4();
        const coupleResult = await db.prepare('INSERT INTO couples (uuid) VALUES (?)').run(coupleUuid);
        const coupleId = coupleResult.lastInsertRowid;

        await db.prepare('UPDATE users SET couple_id = ? WHERE id IN (?, ?)')
            .run(coupleId, invitation.from_user_id, req.user.id);

        await db.prepare('UPDATE couple_invitations SET status = ? WHERE uuid = ?').run('accepted', invitation_uuid);

        res.json({
            status: 'success',
            message: 'Berhasil terhubung dengan pasangan!',
            data: { couple_id: coupleId }
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Terjadi kesalahan pada server' });
    }
});

// ==================== PUTUSKAN HUBUNGAN PASANGAN ====================
router.post('/couple/disconnect', authMiddleware, async (req, res) => {
    try {
        const { confirm } = req.body;

        if (confirm !== true) {
            return res.status(400).json({
                status: 'error',
                message: 'Konfirmasi wajib diisi (confirm: true) untuk memutuskan hubungan pasangan'
            });
        }

        if (!req.user.couple_id) {
            return res.status(400).json({ status: 'error', message: 'Kamu belum terhubung dengan pasangan manapun' });
        }

        await db.prepare('UPDATE users SET couple_id = NULL WHERE couple_id = ?').run(req.user.couple_id);

        res.json({ status: 'success', message: 'Hubungan pasangan berhasil diputuskan' });

    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Terjadi kesalahan pada server' });
    }
});

// ==================== GET PROFIL SAAT INI ====================
router.get('/me', authMiddleware, async (req, res) => {
    try {
        const user = await db.prepare(`
            SELECT id, uuid, nama, email, email_verified, avatar_url, couple_id, created_at
            FROM users WHERE id = ?
        `).get(req.user.id);

        let pasangan = null;
        if (user.couple_id) {
            pasangan = await db.prepare(`
                SELECT id, nama, email, avatar_url FROM users
                WHERE couple_id = ? AND id != ?
            `).get(user.couple_id, user.id);
        }

        res.json({
            status: 'success',
            data: { ...user, pasangan }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Terjadi kesalahan pada server' });
    }
});

module.exports = router;
