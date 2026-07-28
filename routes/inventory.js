const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const { authMiddleware, requireCouple } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware, requireCouple);

// ==================== GET DAFTAR INVENTARIS ====================
router.get('/', async (req, res) => {
    try {
        const items = await db.prepare('SELECT * FROM inventory_items WHERE couple_id = ? ORDER BY created_at DESC').all(req.user.couple_id);

        const today = new Date().toISOString().split('T')[0];
        const data = items.map(i => ({
            ...i,
            garansi_masih_berlaku: i.garansi_sampai ? i.garansi_sampai >= today : null
        }));

        res.json({ status: 'success', data });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Terjadi kesalahan pada server' });
    }
});

// ==================== TAMBAH BARANG INVENTARIS ====================
router.post('/', async (req, res) => {
    try {
        const { nama_barang, lokasi, harga_beli, tanggal_beli, garansi_sampai, kondisi } = req.body;

        if (!nama_barang) {
            return res.status(400).json({ status: 'error', message: 'Nama barang wajib diisi' });
        }

        const validKondisi = ['baik', 'rusak_ringan', 'rusak_berat'];
        if (kondisi && !validKondisi.includes(kondisi)) {
            return res.status(400).json({ status: 'error', message: `Kondisi harus salah satu dari: ${validKondisi.join(', ')}` });
        }

        const itemUuid = uuidv4();
        const result = await db.prepare(`
            INSERT INTO inventory_items (uuid, couple_id, nama_barang, lokasi, harga_beli, tanggal_beli, garansi_sampai, kondisi)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(itemUuid, req.user.couple_id, nama_barang, lokasi || null, harga_beli || null, tanggal_beli || null, garansi_sampai || null, kondisi || 'baik');

        const newItem = await db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(result.lastInsertRowid);

        res.status(201).json({ status: 'success', message: 'Barang berhasil ditambahkan ke inventaris', data: newItem });

    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Terjadi kesalahan pada server' });
    }
});

// ==================== UPDATE BARANG INVENTARIS ====================
router.put('/:uuid', async (req, res) => {
    try {
        const item = await db.prepare('SELECT * FROM inventory_items WHERE uuid = ? AND couple_id = ?')
            .get(req.params.uuid, req.user.couple_id);

        if (!item) {
            return res.status(404).json({ status: 'error', message: 'Barang tidak ditemukan' });
        }

        const { nama_barang, lokasi, kondisi } = req.body;

        await db.prepare(`
            UPDATE inventory_items SET
                nama_barang = COALESCE(?, nama_barang),
                lokasi = COALESCE(?, lokasi),
                kondisi = COALESCE(?, kondisi)
            WHERE uuid = ?
        `).run(nama_barang, lokasi, kondisi, req.params.uuid);

        const updated = await db.prepare('SELECT * FROM inventory_items WHERE uuid = ?').get(req.params.uuid);
        res.json({ status: 'success', message: 'Barang berhasil diperbarui', data: updated });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Terjadi kesalahan pada server' });
    }
});

// ==================== HAPUS BARANG INVENTARIS ====================
router.delete('/:uuid', async (req, res) => {
    try {
        const item = await db.prepare('SELECT * FROM inventory_items WHERE uuid = ? AND couple_id = ?')
            .get(req.params.uuid, req.user.couple_id);

        if (!item) {
            return res.status(404).json({ status: 'error', message: 'Barang tidak ditemukan' });
        }

        await db.prepare('DELETE FROM inventory_items WHERE uuid = ?').run(req.params.uuid);
        res.json({ status: 'success', message: 'Barang berhasil dihapus dari inventaris' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Terjadi kesalahan pada server' });
    }
});

module.exports = router;
