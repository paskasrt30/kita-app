const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const { authMiddleware, requireCouple } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware, requireCouple);

const KATEGORI_VALID = ['gaji_suami', 'gaji_istri', 'bonus', 'thr', 'freelance', 'investasi', 'hadiah', 'lainnya'];

// ==================== GET DAFTAR PEMASUKAN ====================
router.get('/', async (req, res) => {
    try {
        const { bulan, tahun, limit } = req.query;

        let sql = `
            SELECT i.*, a.nama_rekening, u.nama as nama_user
            FROM income i
            LEFT JOIN accounts a ON i.account_id = a.id
            JOIN users u ON i.user_id = u.id
            WHERE i.couple_id = ?
        `;
        const params = [req.user.couple_id];

        if (bulan && tahun) {
            sql += ` AND TO_CHAR(i.tanggal, 'MM') = ? AND TO_CHAR(i.tanggal, 'YYYY') = ?`;
            params.push(String(bulan).padStart(2, '0'), String(tahun));
        }

        sql += ' ORDER BY i.tanggal DESC, i.created_at DESC';

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

// ==================== TAMBAH PEMASUKAN ====================
router.post('/', async (req, res) => {
    const insertTx = db.transaction(async (body, userId, coupleId) => {
        const { account_id, tanggal, nominal, sumber, kategori, catatan } = body;

        if (!tanggal || !nominal) {
            throw { statusCode: 400, message: 'Tanggal dan nominal wajib diisi' };
        }

        if (nominal <= 0) {
            throw { statusCode: 400, message: 'Nominal harus lebih besar dari 0' };
        }

        if (account_id) {
            const account = await db.prepare('SELECT * FROM accounts WHERE id = ? AND couple_id = ?').get(account_id, coupleId);
            if (!account) {
                throw { statusCode: 404, message: 'Rekening tidak ditemukan' };
            }
        }

        const incomeUuid = uuidv4();
        const result = await db.prepare(`
            INSERT INTO income (uuid, couple_id, user_id, account_id, tanggal, nominal, sumber, kategori, catatan)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(incomeUuid, coupleId, userId, account_id || null, tanggal, nominal, sumber || null, kategori || null, catatan || null);

        // Update saldo rekening (kalau pemasukan ini dikaitkan dengan rekening)
        if (account_id) {
            await db.prepare('UPDATE accounts SET saldo_saat_ini = saldo_saat_ini + ? WHERE id = ?').run(nominal, account_id);
        }

        return result.lastInsertRowid;
    });

    try {
        const newId = await insertTx(req.body, req.user.id, req.user.couple_id);
        const newIncome = await db.prepare('SELECT * FROM income WHERE id = ?').get(newId);

        res.status(201).json({ status: 'success', message: 'Pemasukan berhasil dicatat', data: newIncome });

    } catch (err) {
        console.error(err);
        const statusCode = err.statusCode || 500;
        res.status(statusCode).json({ status: 'error', message: err.message || 'Terjadi kesalahan pada server' });
    }
});

// ==================== EDIT PEMASUKAN ====================
router.put('/:uuid', async (req, res) => {
    const updateTx = db.transaction(async (uuid, coupleId, body) => {
        const income = await db.prepare('SELECT * FROM income WHERE uuid = ? AND couple_id = ?').get(uuid, coupleId);
        if (!income) {
            throw { statusCode: 404, message: 'Data pemasukan tidak ditemukan' };
        }

        const { tanggal, nominal, sumber, kategori, catatan } = body;

        if (nominal !== undefined && nominal <= 0) {
            throw { statusCode: 400, message: 'Nominal harus lebih besar dari 0' };
        }

        // Sesuaikan saldo rekening kalau nominal berubah dan data ini terkait rekening
        if (income.account_id && nominal !== undefined && Number(nominal) !== income.nominal) {
            const delta = Number(nominal) - income.nominal;
            await db.prepare('UPDATE accounts SET saldo_saat_ini = saldo_saat_ini + ? WHERE id = ?').run(delta, income.account_id);
        }

        await db.prepare(`
            UPDATE income SET
                tanggal = COALESCE(?, tanggal),
                nominal = COALESCE(?, nominal),
                sumber = COALESCE(?, sumber),
                kategori = COALESCE(?, kategori),
                catatan = COALESCE(?, catatan)
            WHERE uuid = ?
        `).run(tanggal, nominal, sumber, kategori, catatan, uuid);
    });

    try {
        await updateTx(req.params.uuid, req.user.couple_id, req.body);
        const updated = await db.prepare('SELECT * FROM income WHERE uuid = ?').get(req.params.uuid);
        res.json({ status: 'success', message: 'Pemasukan berhasil diperbarui', data: updated });
    } catch (err) {
        console.error(err);
        const statusCode = err.statusCode || 500;
        res.status(statusCode).json({ status: 'error', message: err.message || 'Terjadi kesalahan pada server' });
    }
});

// ==================== HAPUS PEMASUKAN ====================
router.delete('/:uuid', async (req, res) => {
    const deleteTx = db.transaction(async (uuid, coupleId) => {
        const income = await db.prepare('SELECT * FROM income WHERE uuid = ? AND couple_id = ?').get(uuid, coupleId);

        if (!income) {
            throw { statusCode: 404, message: 'Data pemasukan tidak ditemukan' };
        }

        // Kembalikan saldo rekening (kurangi karena pemasukan dibatalkan), kalau ada rekening terkait
        if (income.account_id) {
            await db.prepare('UPDATE accounts SET saldo_saat_ini = saldo_saat_ini - ? WHERE id = ?')
                .run(income.nominal, income.account_id);
        }

        await db.prepare('DELETE FROM income WHERE uuid = ?').run(uuid);
    });

    try {
        await deleteTx(req.params.uuid, req.user.couple_id);
        res.json({ status: 'success', message: 'Pemasukan berhasil dihapus' });
    } catch (err) {
        const statusCode = err.statusCode || 500;
        res.status(statusCode).json({ status: 'error', message: err.message || 'Terjadi kesalahan pada server' });
    }
});

module.exports = router;
