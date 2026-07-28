const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const { authMiddleware, requireCouple } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware, requireCouple);

const JENIS_VALID = ['ktp', 'kk', 'npwp', 'bpjs', 'sim', 'stnk', 'bpkb', 'sertifikat', 'polis', 'lainnya'];

// ==================== GET DAFTAR DOKUMEN ====================
router.get('/', async (req, res) => {
    try {
        const items = await db.prepare('SELECT * FROM documents WHERE couple_id = ? ORDER BY berlaku_sampai ASC').all(req.user.couple_id);

        const today = new Date();
        const data = items.map(i => {
            let sisaHari = null;
            if (i.berlaku_sampai) {
                sisaHari = Math.ceil((new Date(i.berlaku_sampai) - today) / (1000 * 60 * 60 * 24));
            }
            return { ...i, sisa_hari: sisaHari, akan_kedaluwarsa: sisaHari !== null && sisaHari <= 30 && sisaHari >= 0, sudah_kedaluwarsa: sisaHari !== null && sisaHari < 0 };
        });

        res.json({ status: 'success', data });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Terjadi kesalahan pada server' });
    }
});

// ==================== TAMBAH DOKUMEN ====================
router.post('/', async (req, res) => {
    try {
        const { jenis_dokumen, nama_dokumen, nomor_dokumen, berlaku_sampai, catatan } = req.body;

        if (!jenis_dokumen || !nama_dokumen) {
            return res.status(400).json({ status: 'error', message: 'Jenis dan nama dokumen wajib diisi' });
        }

        if (!JENIS_VALID.includes(jenis_dokumen)) {
            return res.status(400).json({ status: 'error', message: `Jenis dokumen harus salah satu dari: ${JENIS_VALID.join(', ')}` });
        }

        const docUuid = uuidv4();
        const result = await db.prepare(`
            INSERT INTO documents (uuid, couple_id, jenis_dokumen, nama_dokumen, nomor_dokumen, berlaku_sampai, catatan)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(docUuid, req.user.couple_id, jenis_dokumen, nama_dokumen, nomor_dokumen || null, berlaku_sampai || null, catatan || null);

        const newDoc = await db.prepare('SELECT * FROM documents WHERE id = ?').get(result.lastInsertRowid);

        res.status(201).json({ status: 'success', message: 'Dokumen berhasil ditambahkan', data: newDoc });

    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Terjadi kesalahan pada server' });
    }
});

// ==================== UPDATE DOKUMEN ====================
router.put('/:uuid', async (req, res) => {
    try {
        const doc = await db.prepare('SELECT * FROM documents WHERE uuid = ? AND couple_id = ?')
            .get(req.params.uuid, req.user.couple_id);

        if (!doc) {
            return res.status(404).json({ status: 'error', message: 'Dokumen tidak ditemukan' });
        }

        const { nama_dokumen, nomor_dokumen, berlaku_sampai, catatan } = req.body;

        await db.prepare(`
            UPDATE documents SET
                nama_dokumen = COALESCE(?, nama_dokumen),
                nomor_dokumen = COALESCE(?, nomor_dokumen),
                berlaku_sampai = COALESCE(?, berlaku_sampai),
                catatan = COALESCE(?, catatan)
            WHERE uuid = ?
        `).run(nama_dokumen, nomor_dokumen, berlaku_sampai, catatan, req.params.uuid);

        const updated = await db.prepare('SELECT * FROM documents WHERE uuid = ?').get(req.params.uuid);
        res.json({ status: 'success', message: 'Dokumen berhasil diperbarui', data: updated });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Terjadi kesalahan pada server' });
    }
});

// ==================== HAPUS DOKUMEN ====================
router.delete('/:uuid', async (req, res) => {
    try {
        const doc = await db.prepare('SELECT * FROM documents WHERE uuid = ? AND couple_id = ?')
            .get(req.params.uuid, req.user.couple_id);

        if (!doc) {
            return res.status(404).json({ status: 'error', message: 'Dokumen tidak ditemukan' });
        }

        await db.prepare('DELETE FROM documents WHERE uuid = ?').run(req.params.uuid);
        res.json({ status: 'success', message: 'Dokumen berhasil dihapus' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Terjadi kesalahan pada server' });
    }
});

module.exports = router;
