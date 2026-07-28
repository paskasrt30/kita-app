const express = require('express');
const db = require('../db/database');
const { authMiddleware, requireCouple } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// ==================== GET PENGATURAN SAAT INI ====================
router.get('/', async (req, res) => {
    try {
        let settings = await db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(req.user.id);

        if (!settings) {
            await db.prepare('INSERT INTO user_settings (user_id) VALUES (?)').run(req.user.id);
            settings = await db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(req.user.id);
        }

        res.json({ status: 'success', data: settings });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Terjadi kesalahan pada server' });
    }
});

// ==================== UPDATE TEMA ====================
router.put('/theme', async (req, res) => {
    try {
        const { tema } = req.body;

        if (!['light', 'dark'].includes(tema)) {
            return res.status(400).json({ status: 'error', message: "Tema harus 'light' atau 'dark'" });
        }

        await db.prepare('UPDATE user_settings SET tema = ? WHERE user_id = ?').run(tema, req.user.id);
        res.json({ status: 'success', message: 'Tema berhasil diperbarui' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Terjadi kesalahan pada server' });
    }
});

// ==================== UPDATE PREFERENSI NOTIFIKASI ====================
router.put('/notifications', async (req, res) => {
    try {
        const { notifikasi_email, notifikasi_push } = req.body;

        await db.prepare(`
            UPDATE user_settings SET
                notifikasi_email = COALESCE(?, notifikasi_email),
                notifikasi_push = COALESCE(?, notifikasi_push)
            WHERE user_id = ?
        `).run(
            notifikasi_email !== undefined ? (notifikasi_email ? 1 : 0) : null,
            notifikasi_push !== undefined ? (notifikasi_push ? 1 : 0) : null,
            req.user.id
        );

        res.json({ status: 'success', message: 'Preferensi notifikasi berhasil diperbarui' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Terjadi kesalahan pada server' });
    }
});

// ==================== KATEGORI KUSTOM: LIST ====================
router.get('/categories', requireCouple, async (req, res) => {
    try {
        const { tipe } = req.query;

        let sql = 'SELECT * FROM custom_categories WHERE couple_id = ?';
        const params = [req.user.couple_id];

        if (tipe) {
            sql += ' AND tipe = ?';
            params.push(tipe);
        }

        const categories = await db.prepare(sql).all(...params);
        res.json({ status: 'success', data: categories });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Terjadi kesalahan pada server' });
    }
});

// ==================== KATEGORI KUSTOM: TAMBAH ====================
router.post('/categories', requireCouple, async (req, res) => {
    try {
        const { tipe, nama_kategori, icon, warna } = req.body;

        if (!tipe || !nama_kategori) {
            return res.status(400).json({ status: 'error', message: 'Tipe dan nama kategori wajib diisi' });
        }

        if (!['pemasukan', 'pengeluaran'].includes(tipe)) {
            return res.status(400).json({ status: 'error', message: "Tipe harus 'pemasukan' atau 'pengeluaran'" });
        }

        const result = await db.prepare(`
            INSERT INTO custom_categories (couple_id, tipe, nama_kategori, icon, warna)
            VALUES (?, ?, ?, ?, ?)
        `).run(req.user.couple_id, tipe, nama_kategori, icon || null, warna || null);

        const newCategory = await db.prepare('SELECT * FROM custom_categories WHERE id = ?').get(result.lastInsertRowid);

        res.status(201).json({ status: 'success', message: 'Kategori berhasil ditambahkan', data: newCategory });

    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Terjadi kesalahan pada server' });
    }
});

// ==================== KATEGORI KUSTOM: HAPUS ====================
router.delete('/categories/:id', requireCouple, async (req, res) => {
    try {
        const category = await db.prepare('SELECT * FROM custom_categories WHERE id = ? AND couple_id = ?')
            .get(req.params.id, req.user.couple_id);

        if (!category) {
            return res.status(404).json({ status: 'error', message: 'Kategori tidak ditemukan' });
        }

        await db.prepare('DELETE FROM custom_categories WHERE id = ?').run(req.params.id);
        res.json({ status: 'success', message: 'Kategori berhasil dihapus' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Terjadi kesalahan pada server' });
    }
});

// ==================== UPDATE PROFIL (nama, mata uang rumah tangga) ====================
router.put('/profile', async (req, res) => {
    try {
        const { nama } = req.body;

        if (nama) {
            await db.prepare('UPDATE users SET nama = ? WHERE id = ?').run(nama, req.user.id);
        }

        res.json({ status: 'success', message: 'Profil berhasil diperbarui' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Terjadi kesalahan pada server' });
    }
});

router.put('/couple-name', requireCouple, async (req, res) => {
    try {
        const { nama_rumah_tangga } = req.body;

        if (!nama_rumah_tangga) {
            return res.status(400).json({ status: 'error', message: 'Nama rumah tangga wajib diisi' });
        }

        await db.prepare('UPDATE couples SET nama_rumah_tangga = ? WHERE id = ?').run(nama_rumah_tangga, req.user.couple_id);
        res.json({ status: 'success', message: 'Nama rumah tangga berhasil diperbarui' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Terjadi kesalahan pada server' });
    }
});

module.exports = router;
