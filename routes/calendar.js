const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const { authMiddleware, requireCouple } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware, requireCouple);

const TIPE_VALID = ['kerja', 'cuti', 'dokter', 'liburan', 'keluarga', 'ulang_tahun', 'anniversary', 'lainnya'];

// ==================== GET DAFTAR JADWAL ====================
router.get('/', async (req, res) => {
    try {
        const { dari, sampai, upcoming_limit } = req.query;

        let sql = `
            SELECT ce.*, u.nama as nama_pembuat FROM calendar_events ce
            JOIN users u ON ce.created_by = u.id
            WHERE ce.couple_id = ?
        `;
        const params = [req.user.couple_id];

        if (dari && sampai) {
            sql += ' AND ce.tanggal_mulai::date BETWEEN ?::date AND ?::date';
            params.push(dari, sampai);
        } else {
            // Default: tampilkan jadwal dari hari ini ke depan (agenda mendatang)
            sql += ' AND ce.tanggal_mulai::date >= CURRENT_DATE';
        }

        sql += ' ORDER BY ce.tanggal_mulai ASC';

        if (upcoming_limit) {
            sql += ' LIMIT ?';
            params.push(Number(upcoming_limit));
        }

        const events = await db.prepare(sql).all(...params);
        res.json({ status: 'success', data: events });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Terjadi kesalahan pada server' });
    }
});

// ==================== TAMBAH JADWAL ====================
router.post('/', async (req, res) => {
    try {
        const { judul, tipe, tanggal_mulai, tanggal_selesai, lokasi, catatan, is_recurring_yearly } = req.body;

        if (!judul || !tanggal_mulai) {
            return res.status(400).json({ status: 'error', message: 'Judul dan tanggal mulai wajib diisi' });
        }

        if (tipe && !TIPE_VALID.includes(tipe)) {
            return res.status(400).json({ status: 'error', message: `Tipe harus salah satu dari: ${TIPE_VALID.join(', ')}` });
        }

        const eventUuid = uuidv4();
        const result = await db.prepare(`
            INSERT INTO calendar_events (uuid, couple_id, created_by, judul, tipe, tanggal_mulai, tanggal_selesai, lokasi, catatan, is_recurring_yearly)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(eventUuid, req.user.couple_id, req.user.id, judul, tipe || 'lainnya', tanggal_mulai, tanggal_selesai || null, lokasi || null, catatan || null, is_recurring_yearly ? 1 : 0);

        const newEvent = await db.prepare('SELECT * FROM calendar_events WHERE id = ?').get(result.lastInsertRowid);

        res.status(201).json({ status: 'success', message: 'Jadwal berhasil ditambahkan', data: newEvent });

    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Terjadi kesalahan pada server' });
    }
});

// ==================== UPDATE JADWAL ====================
router.put('/:uuid', async (req, res) => {
    try {
        const event = await db.prepare('SELECT * FROM calendar_events WHERE uuid = ? AND couple_id = ?')
            .get(req.params.uuid, req.user.couple_id);

        if (!event) {
            return res.status(404).json({ status: 'error', message: 'Jadwal tidak ditemukan' });
        }

        const { judul, tipe, tanggal_mulai, tanggal_selesai, lokasi, catatan } = req.body;

        await db.prepare(`
            UPDATE calendar_events SET
                judul = COALESCE(?, judul),
                tipe = COALESCE(?, tipe),
                tanggal_mulai = COALESCE(?, tanggal_mulai),
                tanggal_selesai = COALESCE(?, tanggal_selesai),
                lokasi = COALESCE(?, lokasi),
                catatan = COALESCE(?, catatan)
            WHERE uuid = ?
        `).run(judul, tipe, tanggal_mulai, tanggal_selesai, lokasi, catatan, req.params.uuid);

        const updated = await db.prepare('SELECT * FROM calendar_events WHERE uuid = ?').get(req.params.uuid);
        res.json({ status: 'success', message: 'Jadwal berhasil diperbarui', data: updated });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Terjadi kesalahan pada server' });
    }
});

// ==================== HAPUS JADWAL ====================
router.delete('/:uuid', async (req, res) => {
    try {
        const event = await db.prepare('SELECT * FROM calendar_events WHERE uuid = ? AND couple_id = ?')
            .get(req.params.uuid, req.user.couple_id);

        if (!event) {
            return res.status(404).json({ status: 'error', message: 'Jadwal tidak ditemukan' });
        }

        await db.prepare('DELETE FROM calendar_events WHERE uuid = ?').run(req.params.uuid);
        res.json({ status: 'success', message: 'Jadwal berhasil dihapus' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Terjadi kesalahan pada server' });
    }
});

module.exports = router;
