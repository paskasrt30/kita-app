const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const { authMiddleware, requireCouple } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware, requireCouple);

// ==================== GET DAFTAR CATATAN ====================
router.get('/', async (req, res) => {
    try {
        const notes = await db.prepare(`
            SELECT n.*, u.nama as nama_pembuat FROM notes n
            JOIN users u ON n.created_by = u.id
            WHERE n.couple_id = ? ORDER BY n.updated_at DESC
        `).all(req.user.couple_id);

        res.json({ status: 'success', data: notes });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Terjadi kesalahan pada server' });
    }
});

// ==================== TAMBAH CATATAN ====================
router.post('/', async (req, res) => {
    try {
        const { judul, isi, kategori } = req.body;

        if (!judul) {
            return res.status(400).json({ status: 'error', message: 'Judul catatan wajib diisi' });
        }

        const noteUuid = uuidv4();
        const result = await db.prepare(`
            INSERT INTO notes (uuid, couple_id, created_by, judul, isi, kategori)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(noteUuid, req.user.couple_id, req.user.id, judul, isi || null, kategori || null);

        const newNote = await db.prepare('SELECT * FROM notes WHERE id = ?').get(result.lastInsertRowid);

        res.status(201).json({ status: 'success', message: 'Catatan berhasil ditambahkan', data: newNote });

    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Terjadi kesalahan pada server' });
    }
});

// ==================== UPDATE CATATAN ====================
router.put('/:uuid', async (req, res) => {
    try {
        const note = await db.prepare('SELECT * FROM notes WHERE uuid = ? AND couple_id = ?')
            .get(req.params.uuid, req.user.couple_id);

        if (!note) {
            return res.status(404).json({ status: 'error', message: 'Catatan tidak ditemukan' });
        }

        const { judul, isi, kategori } = req.body;

        await db.prepare(`
            UPDATE notes SET
                judul = COALESCE(?, judul),
                isi = COALESCE(?, isi),
                kategori = COALESCE(?, kategori),
                updated_at = NOW()
            WHERE uuid = ?
        `).run(judul, isi, kategori, req.params.uuid);

        const updated = await db.prepare('SELECT * FROM notes WHERE uuid = ?').get(req.params.uuid);
        res.json({ status: 'success', message: 'Catatan berhasil diperbarui', data: updated });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Terjadi kesalahan pada server' });
    }
});

// ==================== HAPUS CATATAN ====================
router.delete('/:uuid', async (req, res) => {
    try {
        const note = await db.prepare('SELECT * FROM notes WHERE uuid = ? AND couple_id = ?')
            .get(req.params.uuid, req.user.couple_id);

        if (!note) {
            return res.status(404).json({ status: 'error', message: 'Catatan tidak ditemukan' });
        }

        await db.prepare('DELETE FROM notes WHERE uuid = ?').run(req.params.uuid);
        res.json({ status: 'success', message: 'Catatan berhasil dihapus' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Terjadi kesalahan pada server' });
    }
});

module.exports = router;
