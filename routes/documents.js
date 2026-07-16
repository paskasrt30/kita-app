const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const { authMiddleware, requireCouple } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware, requireCouple);

const JENIS_VALID = ['ktp', 'kk', 'npwp', 'bpjs', 'sim', 'stnk', 'bpkb', 'sertifikat', 'polis', 'lainnya'];

// ==================== GET DAFTAR DOKUMEN ====================
router.get('/', (req, res) => {
    const items = db.prepare('SELECT * FROM documents WHERE couple_id = ? ORDER BY berlaku_sampai ASC').all(req.user.couple_id);

    const today = new Date();
    const data = items.map(i => {
        let sisaHari = null;
        if (i.berlaku_sampai) {
            sisaHari = Math.ceil((new Date(i.berlaku_sampai) - today) / (1000 * 60 * 60 * 24));
        }
        return { ...i, sisa_hari: sisaHari, akan_kedaluwarsa: sisaHari !== null && sisaHari <= 30 && sisaHari >= 0, sudah_kedaluwarsa: sisaHari !== null && sisaHari < 0 };
    });

    res.json({ status: 'success', data });
});

// ==================== TAMBAH DOKUMEN ====================
router.post('/', (req, res) => {
    try {
        const { jenis_dokumen, nama_dokumen, nomor_dokumen, berlaku_sampai, catatan } = req.body;

        if (!jenis_dokumen || !nama_dokumen) {
            return res.status(400).json({ status: 'error', message: 'Jenis dan nama dokumen wajib diisi' });
        }

        if (!JENIS_VALID.includes(jenis_dokumen)) {
            return res.status(400).json({ status: 'error', message: `Jenis dokumen harus salah satu dari: ${JENIS_VALID.join(', ')}` });
        }

        const docUuid = uuidv4();
        const result = db.prepare(`
            INSERT INTO documents (uuid, couple_id, jenis_dokumen, nama_dokumen, nomor_dokumen, berlaku_sampai, catatan)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(docUuid, req.user.couple_id, jenis_dokumen, nama_dokumen, nomor_dokumen || null, berlaku_sampai || null, catatan || null);

        const newDoc = db.prepare('SELECT * FROM documents WHERE id = ?').get(result.lastInsertRowid);

        res.status(201).json({ status: 'success', message: 'Dokumen berhasil ditambahkan', data: newDoc });

    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Terjadi kesalahan pada server' });
    }
});

// ==================== UPDATE DOKUMEN ====================
router.put('/:uuid', (req, res) => {
    const doc = db.prepare('SELECT * FROM documents WHERE uuid = ? AND couple_id = ?')
        .get(req.params.uuid, req.user.couple_id);

    if (!doc) {
        return res.status(404).json({ status: 'error', message: 'Dokumen tidak ditemukan' });
    }

    const { nama_dokumen, nomor_dokumen, berlaku_sampai, catatan } = req.body;

    db.prepare(`
        UPDATE documents SET
            nama_dokumen = COALESCE(?, nama_dokumen),
            nomor_dokumen = COALESCE(?, nomor_dokumen),
            berlaku_sampai = COALESCE(?, berlaku_sampai),
            catatan = COALESCE(?, catatan)
        WHERE uuid = ?
    `).run(nama_dokumen, nomor_dokumen, berlaku_sampai, catatan, req.params.uuid);

    const updated = db.prepare('SELECT * FROM documents WHERE uuid = ?').get(req.params.uuid);
    res.json({ status: 'success', message: 'Dokumen berhasil diperbarui', data: updated });
});

// ==================== HAPUS DOKUMEN ====================
router.delete('/:uuid', (req, res) => {
    const doc = db.prepare('SELECT * FROM documents WHERE uuid = ? AND couple_id = ?')
        .get(req.params.uuid, req.user.couple_id);

    if (!doc) {
        return res.status(404).json({ status: 'error', message: 'Dokumen tidak ditemukan' });
    }

    db.prepare('DELETE FROM documents WHERE uuid = ?').run(req.params.uuid);
    res.json({ status: 'success', message: 'Dokumen berhasil dihapus' });
});

module.exports = router;
