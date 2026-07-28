const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const { authMiddleware, requireCouple } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware, requireCouple);

// Cek apakah notifikasi dengan link_ref tertentu sudah pernah dibuat untuk user ini
async function belumAda(userId, linkRef) {
    const existing = await db.prepare('SELECT id FROM notifications WHERE user_id = ? AND link_ref = ?').get(userId, linkRef);
    return !existing;
}

async function buatNotifikasi(userId, tipe, judul, pesan, linkRef) {
    if (!(await belumAda(userId, linkRef))) return;
    await db.prepare(`
        INSERT INTO notifications (uuid, user_id, tipe, judul, pesan, link_ref)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(uuidv4(), userId, tipe, judul, pesan, linkRef);
}

// Generate notifikasi otomatis berdasarkan kondisi terkini (dipanggil tiap kali GET /notifications)
async function generateNotifikasi(coupleId) {
    const users = await db.prepare('SELECT id FROM users WHERE couple_id = ?').all(coupleId);
    const today = new Date();
    const tanggalHariIni = today.getDate();
    const bulanIni = today.getMonth() + 1;
    const tahunIni = today.getFullYear();

    // ---- Tagihan mendekati jatuh tempo ----
    const bills = await db.prepare('SELECT * FROM bills WHERE couple_id = ?').all(coupleId);
    for (const bill of bills) {
        const sisaHari = bill.tanggal_jatuh_tempo - tanggalHariIni;
        if (sisaHari >= 0 && sisaHari <= (bill.pengingat_hari_sebelum || 3)) {
            const payment = await db.prepare('SELECT * FROM bill_payments WHERE bill_id = ? AND bulan = ? AND tahun = ?')
                .get(bill.id, bulanIni, tahunIni);
            if (!payment || payment.status !== 'sudah_bayar') {
                const linkRef = `bill_${bill.id}_${bulanIni}_${tahunIni}`;
                for (const u of users) {
                    await buatNotifikasi(
                        u.id, 'tagihan', `Tagihan ${bill.nama_tagihan} segera jatuh tempo`,
                        `Jatuh tempo tanggal ${bill.tanggal_jatuh_tempo} bulan ini`, linkRef
                    );
                }
            }
        }
    }

    // ---- Jadwal servis mendekati waktu ----
    const services = await db.prepare('SELECT * FROM service_schedules WHERE couple_id = ?').all(coupleId);
    for (const s of services) {
        if (!s.tanggal_servis_berikutnya) continue;
        const sisaHari = Math.ceil((new Date(s.tanggal_servis_berikutnya) - today) / (1000 * 60 * 60 * 24));
        if (sisaHari >= 0 && sisaHari <= 7) {
            const linkRef = `service_${s.id}_${s.tanggal_servis_berikutnya}`;
            for (const u of users) {
                await buatNotifikasi(
                    u.id, 'servis', `Jadwal servis ${s.nama_item} segera tiba`,
                    `Direncanakan tanggal ${s.tanggal_servis_berikutnya}`, linkRef
                );
            }
        }
    }

    // ---- Dokumen mendekati kedaluwarsa ----
    const documents = await db.prepare('SELECT * FROM documents WHERE couple_id = ?').all(coupleId);
    for (const d of documents) {
        if (!d.berlaku_sampai) continue;
        const sisaHari = Math.ceil((new Date(d.berlaku_sampai) - today) / (1000 * 60 * 60 * 24));
        if (sisaHari >= 0 && sisaHari <= 30) {
            const linkRef = `document_${d.id}_${d.berlaku_sampai}`;
            for (const u of users) {
                await buatNotifikasi(
                    u.id, 'dokumen', `${d.nama_dokumen} akan kedaluwarsa`,
                    `Berlaku sampai ${d.berlaku_sampai}`, linkRef
                );
            }
        }
    }
}

// ==================== GET NOTIFIKASI (sekaligus generate yang baru) ====================
router.get('/', async (req, res) => {
    try {
        try {
            await generateNotifikasi(req.user.couple_id);
        } catch (err) {
            console.error('Gagal generate notifikasi:', err.message);
        }

        const { unread_only } = req.query;
        let sql = 'SELECT * FROM notifications WHERE user_id = ?';
        const params = [req.user.id];

        if (unread_only === 'true') {
            sql += ' AND is_read = 0';
        }
        sql += ' ORDER BY created_at DESC LIMIT 50';

        const notifications = await db.prepare(sql).all(...params);
        const unreadRow = await db.prepare('SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0').get(req.user.id);

        res.json({ status: 'success', data: notifications, unread_count: Number(unreadRow.count) });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Terjadi kesalahan pada server' });
    }
});

// ==================== TANDAI SUDAH DIBACA ====================
router.put('/:uuid/read', async (req, res) => {
    try {
        const notif = await db.prepare('SELECT * FROM notifications WHERE uuid = ? AND user_id = ?').get(req.params.uuid, req.user.id);

        if (!notif) {
            return res.status(404).json({ status: 'error', message: 'Notifikasi tidak ditemukan' });
        }

        await db.prepare('UPDATE notifications SET is_read = 1 WHERE uuid = ?').run(req.params.uuid);
        res.json({ status: 'success', message: 'Notifikasi ditandai sudah dibaca' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Terjadi kesalahan pada server' });
    }
});

// ==================== TANDAI SEMUA SUDAH DIBACA ====================
router.put('/read-all', async (req, res) => {
    try {
        await db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(req.user.id);
        res.json({ status: 'success', message: 'Semua notifikasi ditandai sudah dibaca' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Terjadi kesalahan pada server' });
    }
});

// ==================== HAPUS NOTIFIKASI ====================
router.delete('/:uuid', async (req, res) => {
    try {
        const notif = await db.prepare('SELECT * FROM notifications WHERE uuid = ? AND user_id = ?').get(req.params.uuid, req.user.id);

        if (!notif) {
            return res.status(404).json({ status: 'error', message: 'Notifikasi tidak ditemukan' });
        }

        await db.prepare('DELETE FROM notifications WHERE uuid = ?').run(req.params.uuid);
        res.json({ status: 'success', message: 'Notifikasi berhasil dihapus' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Terjadi kesalahan pada server' });
    }
});

module.exports = router;
