const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const { authMiddleware, requireCouple } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware, requireCouple);

// Cek apakah notifikasi dengan link_ref tertentu sudah pernah dibuat untuk user ini
function belumAda(userId, linkRef) {
    const existing = db.prepare('SELECT id FROM notifications WHERE user_id = ? AND link_ref = ?').get(userId, linkRef);
    return !existing;
}

function buatNotifikasi(userId, tipe, judul, pesan, linkRef) {
    if (!belumAda(userId, linkRef)) return;
    db.prepare(`
        INSERT INTO notifications (uuid, user_id, tipe, judul, pesan, link_ref)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(require('uuid').v4(), userId, tipe, judul, pesan, linkRef);
}

// Generate notifikasi otomatis berdasarkan kondisi terkini (dipanggil tiap kali GET /notifications)
function generateNotifikasi(coupleId) {
    const users = db.prepare('SELECT id FROM users WHERE couple_id = ?').all(coupleId);
    const today = new Date();
    const tanggalHariIni = today.getDate();
    const bulanIni = today.getMonth() + 1;
    const tahunIni = today.getFullYear();

    // ---- Tagihan mendekati jatuh tempo ----
    const bills = db.prepare('SELECT * FROM bills WHERE couple_id = ?').all(coupleId);
    bills.forEach(bill => {
        const sisaHari = bill.tanggal_jatuh_tempo - tanggalHariIni;
        if (sisaHari >= 0 && sisaHari <= (bill.pengingat_hari_sebelum || 3)) {
            const payment = db.prepare('SELECT * FROM bill_payments WHERE bill_id = ? AND bulan = ? AND tahun = ?')
                .get(bill.id, bulanIni, tahunIni);
            if (!payment || payment.status !== 'sudah_bayar') {
                const linkRef = `bill_${bill.id}_${bulanIni}_${tahunIni}`;
                users.forEach(u => buatNotifikasi(
                    u.id, 'tagihan', `Tagihan ${bill.nama_tagihan} segera jatuh tempo`,
                    `Jatuh tempo tanggal ${bill.tanggal_jatuh_tempo} bulan ini`, linkRef
                ));
            }
        }
    });

    // ---- Jadwal servis mendekati waktu ----
    const services = db.prepare('SELECT * FROM service_schedules WHERE couple_id = ?').all(coupleId);
    services.forEach(s => {
        if (!s.tanggal_servis_berikutnya) return;
        const sisaHari = Math.ceil((new Date(s.tanggal_servis_berikutnya) - today) / (1000 * 60 * 60 * 24));
        if (sisaHari >= 0 && sisaHari <= 7) {
            const linkRef = `service_${s.id}_${s.tanggal_servis_berikutnya}`;
            users.forEach(u => buatNotifikasi(
                u.id, 'servis', `Jadwal servis ${s.nama_item} segera tiba`,
                `Direncanakan tanggal ${s.tanggal_servis_berikutnya}`, linkRef
            ));
        }
    });

    // ---- Dokumen mendekati kedaluwarsa ----
    const documents = db.prepare('SELECT * FROM documents WHERE couple_id = ?').all(coupleId);
    documents.forEach(d => {
        if (!d.berlaku_sampai) return;
        const sisaHari = Math.ceil((new Date(d.berlaku_sampai) - today) / (1000 * 60 * 60 * 24));
        if (sisaHari >= 0 && sisaHari <= 30) {
            const linkRef = `document_${d.id}_${d.berlaku_sampai}`;
            users.forEach(u => buatNotifikasi(
                u.id, 'dokumen', `${d.nama_dokumen} akan kedaluwarsa`,
                `Berlaku sampai ${d.berlaku_sampai}`, linkRef
            ));
        }
    });
}

// ==================== GET NOTIFIKASI (sekaligus generate yang baru) ====================
router.get('/', (req, res) => {
    try {
        generateNotifikasi(req.user.couple_id);
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

    const notifications = db.prepare(sql).all(...params);
    const unreadCount = db.prepare('SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0').get(req.user.id).count;

    res.json({ status: 'success', data: notifications, unread_count: unreadCount });
});

// ==================== TANDAI SUDAH DIBACA ====================
router.put('/:uuid/read', (req, res) => {
    const notif = db.prepare('SELECT * FROM notifications WHERE uuid = ? AND user_id = ?').get(req.params.uuid, req.user.id);

    if (!notif) {
        return res.status(404).json({ status: 'error', message: 'Notifikasi tidak ditemukan' });
    }

    db.prepare('UPDATE notifications SET is_read = 1 WHERE uuid = ?').run(req.params.uuid);
    res.json({ status: 'success', message: 'Notifikasi ditandai sudah dibaca' });
});

// ==================== TANDAI SEMUA SUDAH DIBACA ====================
router.put('/read-all', (req, res) => {
    db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(req.user.id);
    res.json({ status: 'success', message: 'Semua notifikasi ditandai sudah dibaca' });
});

// ==================== HAPUS NOTIFIKASI ====================
router.delete('/:uuid', (req, res) => {
    const notif = db.prepare('SELECT * FROM notifications WHERE uuid = ? AND user_id = ?').get(req.params.uuid, req.user.id);

    if (!notif) {
        return res.status(404).json({ status: 'error', message: 'Notifikasi tidak ditemukan' });
    }

    db.prepare('DELETE FROM notifications WHERE uuid = ?').run(req.params.uuid);
    res.json({ status: 'success', message: 'Notifikasi berhasil dihapus' });
});

module.exports = router;
