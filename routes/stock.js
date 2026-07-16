const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const { authMiddleware, requireCouple } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware, requireCouple);

// ==================== GET DAFTAR STOK ====================
router.get('/', (req, res) => {
    const items = db.prepare('SELECT * FROM stock_items WHERE couple_id = ? ORDER BY nama_barang ASC').all(req.user.couple_id);

    const data = items.map(i => ({
        ...i,
        is_low: i.jumlah_saat_ini <= i.ambang_batas_minimum
    }));

    res.json({ status: 'success', data });
});

// ==================== TAMBAH BARANG STOK ====================
router.post('/', (req, res) => {
    try {
        const { nama_barang, jumlah_saat_ini, satuan, ambang_batas_minimum } = req.body;

        if (!nama_barang) {
            return res.status(400).json({ status: 'error', message: 'Nama barang wajib diisi' });
        }

        const itemUuid = uuidv4();
        const result = db.prepare(`
            INSERT INTO stock_items (uuid, couple_id, nama_barang, jumlah_saat_ini, satuan, ambang_batas_minimum)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(itemUuid, req.user.couple_id, nama_barang, jumlah_saat_ini || 0, satuan || null, ambang_batas_minimum || 0);

        const newItem = db.prepare('SELECT * FROM stock_items WHERE id = ?').get(result.lastInsertRowid);

        res.status(201).json({ status: 'success', message: 'Stok berhasil ditambahkan', data: newItem });

    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Terjadi kesalahan pada server' });
    }
});

// ==================== UPDATE JUMLAH STOK (tambah/kurangi) ====================
router.put('/:uuid/adjust', (req, res) => {
    const item = db.prepare('SELECT * FROM stock_items WHERE uuid = ? AND couple_id = ?')
        .get(req.params.uuid, req.user.couple_id);

    if (!item) {
        return res.status(404).json({ status: 'error', message: 'Barang tidak ditemukan' });
    }

    const { delta } = req.body; // bisa positif (nambah stok) atau negatif (pakai stok)
    if (delta === undefined) {
        return res.status(400).json({ status: 'error', message: 'Delta wajib diisi' });
    }

    const jumlahBaru = Math.max(0, item.jumlah_saat_ini + delta);

    db.prepare("UPDATE stock_items SET jumlah_saat_ini = ?, updated_at = datetime('now') WHERE uuid = ?")
        .run(jumlahBaru, req.params.uuid);

    res.json({ status: 'success', message: 'Stok berhasil diperbarui', data: { jumlah_saat_ini: jumlahBaru } });
});

// ==================== UPDATE DETAIL BARANG ====================
router.put('/:uuid', (req, res) => {
    const item = db.prepare('SELECT * FROM stock_items WHERE uuid = ? AND couple_id = ?')
        .get(req.params.uuid, req.user.couple_id);

    if (!item) {
        return res.status(404).json({ status: 'error', message: 'Barang tidak ditemukan' });
    }

    const { nama_barang, satuan, ambang_batas_minimum } = req.body;

    db.prepare(`
        UPDATE stock_items SET
            nama_barang = COALESCE(?, nama_barang),
            satuan = COALESCE(?, satuan),
            ambang_batas_minimum = COALESCE(?, ambang_batas_minimum),
            updated_at = datetime('now')
        WHERE uuid = ?
    `).run(nama_barang, satuan, ambang_batas_minimum, req.params.uuid);

    const updated = db.prepare('SELECT * FROM stock_items WHERE uuid = ?').get(req.params.uuid);
    res.json({ status: 'success', message: 'Barang berhasil diperbarui', data: updated });
});

// ==================== HAPUS BARANG STOK ====================
router.delete('/:uuid', (req, res) => {
    const item = db.prepare('SELECT * FROM stock_items WHERE uuid = ? AND couple_id = ?')
        .get(req.params.uuid, req.user.couple_id);

    if (!item) {
        return res.status(404).json({ status: 'error', message: 'Barang tidak ditemukan' });
    }

    db.prepare('DELETE FROM stock_items WHERE uuid = ?').run(req.params.uuid);
    res.json({ status: 'success', message: 'Barang berhasil dihapus' });
});

module.exports = router;
