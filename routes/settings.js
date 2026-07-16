const express = require('express');
const db = require('../db/database');
const { authMiddleware, requireCouple } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// ==================== GET PENGATURAN SAAT INI ====================
router.get('/', (req, res) => {
    let settings = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(req.user.id);

    if (!settings) {
        db.prepare('INSERT INTO user_settings (user_id) VALUES (?)').run(req.user.id);
        settings = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(req.user.id);
    }

    res.json({ status: 'success', data: settings });
});

// ==================== UPDATE TEMA ====================
router.put('/theme', (req, res) => {
    const { tema } = req.body;

    if (!['light', 'dark'].includes(tema)) {
        return res.status(400).json({ status: 'error', message: "Tema harus 'light' atau 'dark'" });
    }

    db.prepare('UPDATE user_settings SET tema = ? WHERE user_id = ?').run(tema, req.user.id);
    res.json({ status: 'success', message: 'Tema berhasil diperbarui' });
});

// ==================== UPDATE PREFERENSI NOTIFIKASI ====================
router.put('/notifications', (req, res) => {
    const { notifikasi_email, notifikasi_push } = req.body;

    db.prepare(`
        UPDATE user_settings SET
            notifikasi_email = COALESCE(?, notifikasi_email),
            notifikasi_push = COALESCE(?, notifikasi_push)
        WHERE user_id = ?
    `).run(
        notifikasi_email !== undefined ? (notifikasi_email ? 1 : 0) : null,
        notifikasi_push !== undefined ? (notifikasi_push ? 1 : 0) : null,
        req.user.id
    );

    res.json({ status: 'success', message: 'Preferensi notifikasi berhasil diperbarui' });
});

// ==================== KATEGORI KUSTOM: LIST ====================
router.get('/categories', requireCouple, (req, res) => {
    const { tipe } = req.query;

    let sql = 'SELECT * FROM custom_categories WHERE couple_id = ?';
    const params = [req.user.couple_id];

    if (tipe) {
        sql += ' AND tipe = ?';
        params.push(tipe);
    }

    const categories = db.prepare(sql).all(...params);
    res.json({ status: 'success', data: categories });
});

// ==================== KATEGORI KUSTOM: TAMBAH ====================
router.post('/categories', requireCouple, (req, res) => {
    try {
        const { tipe, nama_kategori, icon, warna } = req.body;

        if (!tipe || !nama_kategori) {
            return res.status(400).json({ status: 'error', message: 'Tipe dan nama kategori wajib diisi' });
        }

        if (!['pemasukan', 'pengeluaran'].includes(tipe)) {
            return res.status(400).json({ status: 'error', message: "Tipe harus 'pemasukan' atau 'pengeluaran'" });
        }

        const result = db.prepare(`
            INSERT INTO custom_categories (couple_id, tipe, nama_kategori, icon, warna)
            VALUES (?, ?, ?, ?, ?)
        `).run(req.user.couple_id, tipe, nama_kategori, icon || null, warna || null);

        const newCategory = db.prepare('SELECT * FROM custom_categories WHERE id = ?').get(result.lastInsertRowid);

        res.status(201).json({ status: 'success', message: 'Kategori berhasil ditambahkan', data: newCategory });

    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Terjadi kesalahan pada server' });
    }
});

// ==================== KATEGORI KUSTOM: HAPUS ====================
router.delete('/categories/:id', requireCouple, (req, res) => {
    const category = db.prepare('SELECT * FROM custom_categories WHERE id = ? AND couple_id = ?')
        .get(req.params.id, req.user.couple_id);

    if (!category) {
        return res.status(404).json({ status: 'error', message: 'Kategori tidak ditemukan' });
    }

    db.prepare('DELETE FROM custom_categories WHERE id = ?').run(req.params.id);
    res.json({ status: 'success', message: 'Kategori berhasil dihapus' });
});

// ==================== UPDATE PROFIL (nama, mata uang rumah tangga) ====================
router.put('/profile', (req, res) => {
    const { nama } = req.body;

    if (nama) {
        db.prepare('UPDATE users SET nama = ? WHERE id = ?').run(nama, req.user.id);
    }

    res.json({ status: 'success', message: 'Profil berhasil diperbarui' });
});

router.put('/couple-name', requireCouple, (req, res) => {
    const { nama_rumah_tangga } = req.body;

    if (!nama_rumah_tangga) {
        return res.status(400).json({ status: 'error', message: 'Nama rumah tangga wajib diisi' });
    }

    db.prepare('UPDATE couples SET nama_rumah_tangga = ? WHERE id = ?').run(nama_rumah_tangga, req.user.couple_id);
    res.json({ status: 'success', message: 'Nama rumah tangga berhasil diperbarui' });
});

module.exports = router;
