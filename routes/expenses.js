const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const { authMiddleware, requireCouple } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware, requireCouple);

// ==================== GET DAFTAR PENGELUARAN ====================
router.get('/', async (req, res) => {
    try {
        const { bulan, tahun, kategori, limit } = req.query;

        let sql = `
            SELECT e.*, a.nama_rekening, u.nama as nama_user
            FROM expenses e
            JOIN accounts a ON e.account_id = a.id
            JOIN users u ON e.user_id = u.id
            WHERE e.couple_id = ?
        `;
        const params = [req.user.couple_id];

        if (bulan && tahun) {
            sql += ` AND TO_CHAR(e.tanggal, 'MM') = ? AND TO_CHAR(e.tanggal, 'YYYY') = ?`;
            params.push(String(bulan).padStart(2, '0'), String(tahun));
        }

        if (kategori) {
            sql += ' AND e.kategori = ?';
            params.push(kategori);
        }

        sql += ' ORDER BY e.tanggal DESC, e.created_at DESC';

        if (limit) {
            sql += ' LIMIT ?';
            params.push(Number(limit));
        }

        const data = await db.prepare(sql).all(...params);
        const total = data.reduce((sum, item) => sum + item.nominal, 0);

        res.json({ status: 'success', data: { items: data, total } });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Terjadi kesalahan pada server' });
    }
});

// ==================== RINGKASAN PER KATEGORI (untuk anggaran) ====================
router.get('/summary-by-category', async (req, res) => {
    try {
        const { bulan, tahun } = req.query;
        const now = new Date();
        const targetBulan = bulan || String(now.getMonth() + 1).padStart(2, '0');
        const targetTahun = tahun || String(now.getFullYear());

        const data = await db.prepare(`
            SELECT kategori, SUM(nominal) as total, COUNT(*) as jumlah_transaksi
            FROM expenses
            WHERE couple_id = ?
            AND TO_CHAR(tanggal, 'MM') = ?
            AND TO_CHAR(tanggal, 'YYYY') = ?
            GROUP BY kategori
            ORDER BY total DESC
        `).all(req.user.couple_id, String(targetBulan).padStart(2, '0'), targetTahun);

        res.json({ status: 'success', data });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Terjadi kesalahan pada server' });
    }
});

// ==================== TAMBAH PENGELUARAN ====================
router.post('/', async (req, res) => {
    const insertTx = db.transaction(async (body, userId, coupleId) => {
        const { account_id, tanggal, nominal, kategori, metode_pembayaran, catatan } = body;

        if (!account_id || !tanggal || !nominal || !kategori) {
            throw { statusCode: 400, message: 'Rekening, tanggal, nominal, dan kategori wajib diisi' };
        }

        if (nominal <= 0) {
            throw { statusCode: 400, message: 'Nominal harus lebih besar dari 0' };
        }

        const account = await db.prepare('SELECT * FROM accounts WHERE id = ? AND couple_id = ?').get(account_id, coupleId);
        if (!account) {
            throw { statusCode: 404, message: 'Rekening tidak ditemukan' };
        }

        const expenseUuid = uuidv4();
        const result = await db.prepare(`
            INSERT INTO expenses (uuid, couple_id, user_id, account_id, tanggal, nominal, kategori, metode_pembayaran, catatan)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(expenseUuid, coupleId, userId, account_id, tanggal, nominal, kategori, metode_pembayaran || null, catatan || null);

        // Update saldo rekening (dikurangi)
        await db.prepare('UPDATE accounts SET saldo_saat_ini = saldo_saat_ini - ? WHERE id = ?').run(nominal, account_id);

        return result.lastInsertRowid;
    });

    try {
        const newId = await insertTx(req.body, req.user.id, req.user.couple_id);
        const newExpense = await db.prepare('SELECT * FROM expenses WHERE id = ?').get(newId);

        res.status(201).json({ status: 'success', message: 'Pengeluaran berhasil dicatat', data: newExpense });

    } catch (err) {
        console.error(err);
        const statusCode = err.statusCode || 500;
        res.status(statusCode).json({ status: 'error', message: err.message || 'Terjadi kesalahan pada server' });
    }
});

// ==================== HAPUS PENGELUARAN ====================
router.delete('/:uuid', async (req, res) => {
    const deleteTx = db.transaction(async (uuid, coupleId) => {
        const expense = await db.prepare('SELECT * FROM expenses WHERE uuid = ? AND couple_id = ?').get(uuid, coupleId);

        if (!expense) {
            throw { statusCode: 404, message: 'Data pengeluaran tidak ditemukan' };
        }

        // Kembalikan saldo rekening (ditambah karena pengeluaran dibatalkan)
        await db.prepare('UPDATE accounts SET saldo_saat_ini = saldo_saat_ini + ? WHERE id = ?')
            .run(expense.nominal, expense.account_id);

        await db.prepare('DELETE FROM expenses WHERE uuid = ?').run(uuid);
    });

    try {
        await deleteTx(req.params.uuid, req.user.couple_id);
        res.json({ status: 'success', message: 'Pengeluaran berhasil dihapus' });
    } catch (err) {
        const statusCode = err.statusCode || 500;
        res.status(statusCode).json({ status: 'error', message: err.message || 'Terjadi kesalahan pada server' });
    }
});

module.exports = router;
