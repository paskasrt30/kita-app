const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const { authMiddleware, requireCouple } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware, requireCouple);

const KATEGORI_VALID = ['gaji_suami', 'gaji_istri', 'bonus', 'thr', 'freelance', 'investasi', 'hadiah', 'lainnya'];

// ==================== GET DAFTAR PEMASUKAN ====================
router.get('/', (req, res) => {
    const { bulan, tahun, limit } = req.query;

    let sql = `
        SELECT i.*, a.nama_rekening, u.nama as nama_user
        FROM income i
        JOIN accounts a ON i.account_id = a.id
        JOIN users u ON i.user_id = u.id
        WHERE i.couple_id = ?
    `;
    const params = [req.user.couple_id];

    if (bulan && tahun) {
        sql += ` AND strftime('%m', i.tanggal) = ? AND strftime('%Y', i.tanggal) = ?`;
        params.push(String(bulan).padStart(2, '0'), String(tahun));
    }

    sql += ' ORDER BY i.tanggal DESC, i.created_at DESC';

    if (limit) {
        sql += ' LIMIT ?';
        params.push(Number(limit));
    }

    const data = db.prepare(sql).all(...params);
    const total = data.reduce((sum, item) => sum + item.nominal, 0);

    res.json({ status: 'success', data: { items: data, total } });
});

// ==================== TAMBAH PEMASUKAN ====================
router.post('/', (req, res) => {
    const insertTx = db.transaction((body, userId, coupleId) => {
        const { account_id, tanggal, nominal, sumber, kategori, catatan } = body;

        if (!account_id || !tanggal || !nominal) {
            throw { statusCode: 400, message: 'Rekening tujuan, tanggal, dan nominal wajib diisi' };
        }

        if (nominal <= 0) {
            throw { statusCode: 400, message: 'Nominal harus lebih besar dari 0' };
        }

        const account = db.prepare('SELECT * FROM accounts WHERE id = ? AND couple_id = ?').get(account_id, coupleId);
        if (!account) {
            throw { statusCode: 404, message: 'Rekening tidak ditemukan' };
        }

        const incomeUuid = uuidv4();
        const result = db.prepare(`
            INSERT INTO income (uuid, couple_id, user_id, account_id, tanggal, nominal, sumber, kategori, catatan)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(incomeUuid, coupleId, userId, account_id, tanggal, nominal, sumber || null, kategori || null, catatan || null);

        // Update saldo rekening
        db.prepare('UPDATE accounts SET saldo_saat_ini = saldo_saat_ini + ? WHERE id = ?').run(nominal, account_id);

        return result.lastInsertRowid;
    });

    try {
        const newId = insertTx(req.body, req.user.id, req.user.couple_id);
        const newIncome = db.prepare('SELECT * FROM income WHERE id = ?').get(newId);

        res.status(201).json({ status: 'success', message: 'Pemasukan berhasil dicatat', data: newIncome });

    } catch (err) {
        console.error(err);
        const statusCode = err.statusCode || 500;
        res.status(statusCode).json({ status: 'error', message: err.message || 'Terjadi kesalahan pada server' });
    }
});

// ==================== HAPUS PEMASUKAN ====================
router.delete('/:uuid', (req, res) => {
    const deleteTx = db.transaction((uuid, coupleId) => {
        const income = db.prepare('SELECT * FROM income WHERE uuid = ? AND couple_id = ?').get(uuid, coupleId);

        if (!income) {
            throw { statusCode: 404, message: 'Data pemasukan tidak ditemukan' };
        }

        // Kembalikan saldo rekening (kurangi karena pemasukan dibatalkan)
        db.prepare('UPDATE accounts SET saldo_saat_ini = saldo_saat_ini - ? WHERE id = ?')
            .run(income.nominal, income.account_id);

        db.prepare('DELETE FROM income WHERE uuid = ?').run(uuid);
    });

    try {
        deleteTx(req.params.uuid, req.user.couple_id);
        res.json({ status: 'success', message: 'Pemasukan berhasil dihapus' });
    } catch (err) {
        const statusCode = err.statusCode || 500;
        res.status(statusCode).json({ status: 'error', message: err.message || 'Terjadi kesalahan pada server' });
    }
});

module.exports = router;
