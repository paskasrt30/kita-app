const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const { authMiddleware, requireCouple } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware, requireCouple);

// ==================== GET LIST BELANJA AKTIF (auto-buat jika belum ada) ====================
router.get('/active', async (req, res) => {
    try {
        let list = await db.prepare(`
            SELECT * FROM shopping_lists WHERE couple_id = ? AND status = 'aktif'
            ORDER BY created_at DESC LIMIT 1
        `).get(req.user.couple_id);

        if (!list) {
            const listUuid = uuidv4();
            const result = await db.prepare(`
                INSERT INTO shopping_lists (uuid, couple_id, nama_list) VALUES (?, ?, ?)
            `).run(listUuid, req.user.couple_id, 'Belanja Bulanan');
            list = await db.prepare('SELECT * FROM shopping_lists WHERE id = ?').get(result.lastInsertRowid);
        }

        const items = await db.prepare(`
            SELECT * FROM shopping_items WHERE shopping_list_id = ? ORDER BY checked ASC, created_at ASC
        `).all(list.id);

        const totalEstimasi = items.reduce((sum, i) => sum + (i.estimasi_harga || 0), 0);
        const totalTerbeli = items.filter(i => i.checked).reduce((sum, i) => sum + (i.estimasi_harga || 0), 0);

        res.json({
            status: 'success',
            data: { ...list, items, total_estimasi: totalEstimasi, total_terbeli: totalTerbeli }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Terjadi kesalahan pada server' });
    }
});

// ==================== TAMBAH ITEM BELANJA ====================
router.post('/:list_uuid/items', async (req, res) => {
    try {
        const { nama_barang, jumlah, estimasi_harga } = req.body;

        if (!nama_barang) {
            return res.status(400).json({ status: 'error', message: 'Nama barang wajib diisi' });
        }

        const list = await db.prepare('SELECT * FROM shopping_lists WHERE uuid = ? AND couple_id = ?')
            .get(req.params.list_uuid, req.user.couple_id);

        if (!list) {
            return res.status(404).json({ status: 'error', message: 'Daftar belanja tidak ditemukan' });
        }

        const result = await db.prepare(`
            INSERT INTO shopping_items (shopping_list_id, nama_barang, jumlah, estimasi_harga)
            VALUES (?, ?, ?, ?)
        `).run(list.id, nama_barang, jumlah || null, estimasi_harga || 0);

        const newItem = await db.prepare('SELECT * FROM shopping_items WHERE id = ?').get(result.lastInsertRowid);

        res.status(201).json({ status: 'success', message: 'Barang berhasil ditambahkan', data: newItem });

    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Terjadi kesalahan pada server' });
    }
});

// ==================== TOGGLE CHECKLIST ITEM ====================
router.put('/items/:id/toggle', async (req, res) => {
    try {
        const item = await db.prepare(`
            SELECT si.* FROM shopping_items si
            JOIN shopping_lists sl ON si.shopping_list_id = sl.id
            WHERE si.id = ? AND sl.couple_id = ?
        `).get(req.params.id, req.user.couple_id);

        if (!item) {
            return res.status(404).json({ status: 'error', message: 'Barang tidak ditemukan' });
        }

        await db.prepare('UPDATE shopping_items SET checked = ? WHERE id = ?').run(item.checked ? 0 : 1, item.id);
        res.json({ status: 'success', message: 'Status barang diperbarui' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Terjadi kesalahan pada server' });
    }
});

// ==================== UPDATE ITEM (nama, jumlah, estimasi harga) ====================
router.put('/items/:id', async (req, res) => {
    try {
        const item = await db.prepare(`
            SELECT si.* FROM shopping_items si
            JOIN shopping_lists sl ON si.shopping_list_id = sl.id
            WHERE si.id = ? AND sl.couple_id = ?
        `).get(req.params.id, req.user.couple_id);

        if (!item) {
            return res.status(404).json({ status: 'error', message: 'Barang tidak ditemukan' });
        }

        const { nama_barang, jumlah, estimasi_harga } = req.body;

        await db.prepare(`
            UPDATE shopping_items SET
                nama_barang = COALESCE(?, nama_barang),
                jumlah = COALESCE(?, jumlah),
                estimasi_harga = COALESCE(?, estimasi_harga)
            WHERE id = ?
        `).run(nama_barang, jumlah, estimasi_harga, req.params.id);

        res.json({ status: 'success', message: 'Barang berhasil diperbarui' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Terjadi kesalahan pada server' });
    }
});

// ==================== HAPUS ITEM ====================
router.delete('/items/:id', async (req, res) => {
    try {
        const item = await db.prepare(`
            SELECT si.* FROM shopping_items si
            JOIN shopping_lists sl ON si.shopping_list_id = sl.id
            WHERE si.id = ? AND sl.couple_id = ?
        `).get(req.params.id, req.user.couple_id);

        if (!item) {
            return res.status(404).json({ status: 'error', message: 'Barang tidak ditemukan' });
        }

        await db.prepare('DELETE FROM shopping_items WHERE id = ?').run(req.params.id);
        res.json({ status: 'success', message: 'Barang berhasil dihapus' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Terjadi kesalahan pada server' });
    }
});

// ==================== SELESAIKAN LIST (mulai list baru berikutnya) ====================
router.post('/:uuid/complete', async (req, res) => {
    try {
        const list = await db.prepare('SELECT * FROM shopping_lists WHERE uuid = ? AND couple_id = ?')
            .get(req.params.uuid, req.user.couple_id);

        if (!list) {
            return res.status(404).json({ status: 'error', message: 'Daftar belanja tidak ditemukan' });
        }

        await db.prepare("UPDATE shopping_lists SET status = 'selesai' WHERE uuid = ?").run(req.params.uuid);
        res.json({ status: 'success', message: 'Belanja selesai! Daftar baru akan dibuat otomatis' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Terjadi kesalahan pada server' });
    }
});

module.exports = router;
