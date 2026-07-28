const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const { authMiddleware, requireCouple } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware, requireCouple);

function addDays(dateStr, days) {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
}

// ==================== GET DAFTAR JADWAL SERVIS ====================
router.get('/', async (req, res) => {
    try {
        const items = await db.prepare('SELECT * FROM service_schedules WHERE couple_id = ? ORDER BY tanggal_servis_berikutnya ASC').all(req.user.couple_id);

        const today = new Date().toISOString().split('T')[0];
        const data = items.map(i => {
            let sisaHari = null;
            if (i.tanggal_servis_berikutnya) {
                sisaHari = Math.ceil((new Date(i.tanggal_servis_berikutnya) - new Date(today)) / (1000 * 60 * 60 * 24));
            }
            return { ...i, sisa_hari: sisaHari, sudah_lewat: sisaHari !== null && sisaHari < 0 };
        });

        res.json({ status: 'success', data });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Terjadi kesalahan pada server' });
    }
});

// ==================== TAMBAH JADWAL SERVIS ====================
router.post('/', async (req, res) => {
    try {
        const { nama_item, jenis_servis, tanggal_servis_terakhir, interval_hari, catatan } = req.body;

        if (!nama_item) {
            return res.status(400).json({ status: 'error', message: 'Nama item wajib diisi' });
        }

        let tanggalBerikutnya = null;
        if (tanggal_servis_terakhir && interval_hari) {
            tanggalBerikutnya = addDays(tanggal_servis_terakhir, Number(interval_hari));
        }

        const itemUuid = uuidv4();
        const result = await db.prepare(`
            INSERT INTO service_schedules (uuid, couple_id, nama_item, jenis_servis, tanggal_servis_terakhir, interval_hari, tanggal_servis_berikutnya, catatan)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(itemUuid, req.user.couple_id, nama_item, jenis_servis || null, tanggal_servis_terakhir || null, interval_hari || null, tanggalBerikutnya, catatan || null);

        const newItem = await db.prepare('SELECT * FROM service_schedules WHERE id = ?').get(result.lastInsertRowid);

        res.status(201).json({ status: 'success', message: 'Jadwal servis berhasil ditambahkan', data: newItem });

    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Terjadi kesalahan pada server' });
    }
});

// ==================== TANDAI SUDAH DISERVIS (reset jadwal berikutnya) ====================
router.put('/:uuid/done', async (req, res) => {
    try {
        const item = await db.prepare('SELECT * FROM service_schedules WHERE uuid = ? AND couple_id = ?')
            .get(req.params.uuid, req.user.couple_id);

        if (!item) {
            return res.status(404).json({ status: 'error', message: 'Jadwal servis tidak ditemukan' });
        }

        const { tanggal_servis } = req.body;
        const tanggalServisBaru = tanggal_servis || new Date().toISOString().split('T')[0];
        const tanggalBerikutnya = item.interval_hari ? addDays(tanggalServisBaru, item.interval_hari) : null;

        await db.prepare(`
            UPDATE service_schedules SET tanggal_servis_terakhir = ?, tanggal_servis_berikutnya = ? WHERE uuid = ?
        `).run(tanggalServisBaru, tanggalBerikutnya, req.params.uuid);

        const updated = await db.prepare('SELECT * FROM service_schedules WHERE uuid = ?').get(req.params.uuid);
        res.json({ status: 'success', message: 'Jadwal servis berhasil diperbarui', data: updated });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Terjadi kesalahan pada server' });
    }
});

// ==================== HAPUS JADWAL SERVIS ====================
router.delete('/:uuid', async (req, res) => {
    try {
        const item = await db.prepare('SELECT * FROM service_schedules WHERE uuid = ? AND couple_id = ?')
            .get(req.params.uuid, req.user.couple_id);

        if (!item) {
            return res.status(404).json({ status: 'error', message: 'Jadwal servis tidak ditemukan' });
        }

        await db.prepare('DELETE FROM service_schedules WHERE uuid = ?').run(req.params.uuid);
        res.json({ status: 'success', message: 'Jadwal servis berhasil dihapus' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Terjadi kesalahan pada server' });
    }
});

module.exports = router;
