const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const { authMiddleware, requireCouple } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware, requireCouple);

// ==================== GET SEMUA REKENING ====================
router.get('/', (req, res) => {
    const accounts = db.prepare(`
        SELECT * FROM accounts WHERE couple_id = ? AND is_active = 1 ORDER BY created_at DESC
    `).all(req.user.couple_id);

    const totalSaldo = accounts.reduce((sum, acc) => sum + acc.saldo_saat_ini, 0);

    res.json({
        status: 'success',
        data: { accounts, total_saldo: totalSaldo }
    });
});

// ==================== TAMBAH REKENING ====================
router.post('/', (req, res) => {
    try {
        const { nama_rekening, tipe, nama_bank, nomor_rekening, saldo_awal, warna, icon } = req.body;

        if (!nama_rekening || !tipe) {
            return res.status(400).json({ status: 'error', message: 'Nama rekening dan tipe wajib diisi' });
        }

        const validTipe = ['bank', 'ewallet', 'tunai', 'dana_darurat', 'kas_rt'];
        if (!validTipe.includes(tipe)) {
            return res.status(400).json({
                status: 'error',
                message: `Tipe harus salah satu dari: ${validTipe.join(', ')}`
            });
        }

        const accountUuid = uuidv4();
        const saldo = saldo_awal || 0;

        const result = db.prepare(`
            INSERT INTO accounts (uuid, couple_id, nama_rekening, tipe, nama_bank, nomor_rekening, saldo_awal, saldo_saat_ini, warna, icon)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(accountUuid, req.user.couple_id, nama_rekening, tipe, nama_bank || null, nomor_rekening || null, saldo, saldo, warna || '#5B4B8A', icon || 'wallet');

        const newAccount = db.prepare('SELECT * FROM accounts WHERE id = ?').get(result.lastInsertRowid);

        res.status(201).json({ status: 'success', message: 'Rekening berhasil ditambahkan', data: newAccount });

    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Terjadi kesalahan pada server' });
    }
});

// ==================== UPDATE REKENING ====================
router.put('/:uuid', (req, res) => {
    try {
        const { nama_rekening, nama_bank, nomor_rekening, warna, icon } = req.body;

        const account = db.prepare('SELECT * FROM accounts WHERE uuid = ? AND couple_id = ?')
            .get(req.params.uuid, req.user.couple_id);

        if (!account) {
            return res.status(404).json({ status: 'error', message: 'Rekening tidak ditemukan' });
        }

        db.prepare(`
            UPDATE accounts SET
                nama_rekening = COALESCE(?, nama_rekening),
                nama_bank = COALESCE(?, nama_bank),
                nomor_rekening = COALESCE(?, nomor_rekening),
                warna = COALESCE(?, warna),
                icon = COALESCE(?, icon)
            WHERE uuid = ?
        `).run(nama_rekening, nama_bank, nomor_rekening, warna, icon, req.params.uuid);

        const updated = db.prepare('SELECT * FROM accounts WHERE uuid = ?').get(req.params.uuid);

        res.json({ status: 'success', message: 'Rekening berhasil diperbarui', data: updated });

    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Terjadi kesalahan pada server' });
    }
});

// ==================== HAPUS (NONAKTIFKAN) REKENING ====================
router.delete('/:uuid', (req, res) => {
    const account = db.prepare('SELECT * FROM accounts WHERE uuid = ? AND couple_id = ?')
        .get(req.params.uuid, req.user.couple_id);

    if (!account) {
        return res.status(404).json({ status: 'error', message: 'Rekening tidak ditemukan' });
    }

    db.prepare('UPDATE accounts SET is_active = 0 WHERE uuid = ?').run(req.params.uuid);

    res.json({ status: 'success', message: 'Rekening berhasil dihapus' });
});

module.exports = router;
