const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const { authMiddleware, requireCouple } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware, requireCouple);

// ==================== GET RIWAYAT TRANSFER ====================
router.get('/', (req, res) => {
    const { limit } = req.query;

    let sql = `
        SELECT t.*, 
               fa.nama_rekening as nama_dari, 
               ta.nama_rekening as nama_ke,
               u.nama as nama_user
        FROM transfers t
        JOIN accounts fa ON t.from_account_id = fa.id
        JOIN accounts ta ON t.to_account_id = ta.id
        JOIN users u ON t.user_id = u.id
        WHERE t.couple_id = ?
        ORDER BY t.tanggal DESC, t.created_at DESC
    `;
    const params = [req.user.couple_id];

    if (limit) {
        sql += ' LIMIT ?';
        params.push(Number(limit));
    }

    const data = db.prepare(sql).all(...params);
    res.json({ status: 'success', data });
});

// ==================== BUAT TRANSFER BARU ====================
router.post('/', (req, res) => {
    const transferTx = db.transaction((body, userId, coupleId) => {
        const { from_account_id, to_account_id, nominal, tanggal, catatan } = body;

        if (!from_account_id || !to_account_id || !nominal || !tanggal) {
            throw { statusCode: 400, message: 'Rekening asal, rekening tujuan, nominal, dan tanggal wajib diisi' };
        }

        if (from_account_id === to_account_id) {
            throw { statusCode: 400, message: 'Rekening asal dan tujuan tidak boleh sama' };
        }

        if (nominal <= 0) {
            throw { statusCode: 400, message: 'Nominal harus lebih besar dari 0' };
        }

        const fromAccount = db.prepare('SELECT * FROM accounts WHERE id = ? AND couple_id = ?').get(from_account_id, coupleId);
        const toAccount = db.prepare('SELECT * FROM accounts WHERE id = ? AND couple_id = ?').get(to_account_id, coupleId);

        if (!fromAccount || !toAccount) {
            throw { statusCode: 404, message: 'Rekening asal atau tujuan tidak ditemukan' };
        }

        const transferUuid = uuidv4();
        const result = db.prepare(`
            INSERT INTO transfers (uuid, couple_id, user_id, from_account_id, to_account_id, nominal, tanggal, catatan)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(transferUuid, coupleId, userId, from_account_id, to_account_id, nominal, tanggal, catatan || null);

        db.prepare('UPDATE accounts SET saldo_saat_ini = saldo_saat_ini - ? WHERE id = ?').run(nominal, from_account_id);
        db.prepare('UPDATE accounts SET saldo_saat_ini = saldo_saat_ini + ? WHERE id = ?').run(nominal, to_account_id);

        return result.lastInsertRowid;
    });

    try {
        const newId = transferTx(req.body, req.user.id, req.user.couple_id);
        const newTransfer = db.prepare('SELECT * FROM transfers WHERE id = ?').get(newId);

        res.status(201).json({ status: 'success', message: 'Transfer berhasil dilakukan', data: newTransfer });

    } catch (err) {
        console.error(err);
        const statusCode = err.statusCode || 500;
        res.status(statusCode).json({ status: 'error', message: err.message || 'Terjadi kesalahan pada server' });
    }
});

// ==================== BATALKAN TRANSFER ====================
router.delete('/:uuid', (req, res) => {
    const reverseTx = db.transaction((uuid, coupleId) => {
        const transfer = db.prepare('SELECT * FROM transfers WHERE uuid = ? AND couple_id = ?').get(uuid, coupleId);

        if (!transfer) {
            throw { statusCode: 404, message: 'Transfer tidak ditemukan' };
        }

        // Kembalikan saldo seperti semula
        db.prepare('UPDATE accounts SET saldo_saat_ini = saldo_saat_ini + ? WHERE id = ?')
            .run(transfer.nominal, transfer.from_account_id);
        db.prepare('UPDATE accounts SET saldo_saat_ini = saldo_saat_ini - ? WHERE id = ?')
            .run(transfer.nominal, transfer.to_account_id);

        db.prepare('DELETE FROM transfers WHERE uuid = ?').run(uuid);
    });

    try {
        reverseTx(req.params.uuid, req.user.couple_id);
        res.json({ status: 'success', message: 'Transfer berhasil dibatalkan' });
    } catch (err) {
        const statusCode = err.statusCode || 500;
        res.status(statusCode).json({ status: 'error', message: err.message || 'Terjadi kesalahan pada server' });
    }
});

module.exports = router;
