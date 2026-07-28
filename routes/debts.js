const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const { authMiddleware, requireCouple } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware, requireCouple);

// ==================== GET DAFTAR HUTANG/PIUTANG ====================
router.get('/', async (req, res) => {
    try {
        const { tipe, status } = req.query;

        let sql = 'SELECT * FROM debts WHERE couple_id = ?';
        const params = [req.user.couple_id];

        if (tipe) {
            sql += ' AND tipe = ?';
            params.push(tipe);
        }
        if (status) {
            sql += ' AND status = ?';
            params.push(status);
        }

        sql += ' ORDER BY jatuh_tempo ASC, created_at DESC';

        const debts = await db.prepare(sql).all(...params);

        const data = debts.map(d => ({
            ...d,
            sisa: d.nominal_total - d.nominal_terbayar,
            persentase_terbayar: d.nominal_total > 0 ? Math.round((d.nominal_terbayar / d.nominal_total) * 1000) / 10 : 0
        }));

        res.json({ status: 'success', data });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Terjadi kesalahan pada server' });
    }
});

// ==================== DETAIL + RIWAYAT PEMBAYARAN ====================
router.get('/:uuid', async (req, res) => {
    try {
        const debt = await db.prepare('SELECT * FROM debts WHERE uuid = ? AND couple_id = ?').get(req.params.uuid, req.user.couple_id);

        if (!debt) {
            return res.status(404).json({ status: 'error', message: 'Data hutang/piutang tidak ditemukan' });
        }

        const payments = await db.prepare('SELECT * FROM debt_payments WHERE debt_id = ? ORDER BY tanggal DESC').all(debt.id);

        res.json({
            status: 'success',
            data: {
                ...debt,
                sisa: debt.nominal_total - debt.nominal_terbayar,
                riwayat: payments
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Terjadi kesalahan pada server' });
    }
});

// ==================== TAMBAH HUTANG/PIUTANG ====================
router.post('/', async (req, res) => {
    try {
        const { tipe, nama_pihak, nominal_total, tanggal_mulai, jatuh_tempo, catatan } = req.body;

        if (!tipe || !nama_pihak || !nominal_total || !tanggal_mulai) {
            return res.status(400).json({ status: 'error', message: 'Tipe, nama pihak, nominal, dan tanggal mulai wajib diisi' });
        }

        if (!['hutang', 'piutang'].includes(tipe)) {
            return res.status(400).json({ status: 'error', message: "Tipe harus 'hutang' atau 'piutang'" });
        }

        const debtUuid = uuidv4();
        const result = await db.prepare(`
            INSERT INTO debts (uuid, couple_id, tipe, nama_pihak, nominal_total, tanggal_mulai, jatuh_tempo, catatan)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(debtUuid, req.user.couple_id, tipe, nama_pihak, nominal_total, tanggal_mulai, jatuh_tempo || null, catatan || null);

        const newDebt = await db.prepare('SELECT * FROM debts WHERE id = ?').get(result.lastInsertRowid);

        res.status(201).json({ status: 'success', message: 'Data berhasil ditambahkan', data: newDebt });

    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Terjadi kesalahan pada server' });
    }
});

// ==================== CATAT PEMBAYARAN / CICILAN ====================
router.post('/:uuid/payment', async (req, res) => {
    const payTx = db.transaction(async (uuid, coupleId, body) => {
        const { nominal, tanggal, catatan, account_id } = body;

        if (!nominal || nominal <= 0) {
            throw { statusCode: 400, message: 'Nominal harus lebih besar dari 0' };
        }
        if (!tanggal) {
            throw { statusCode: 400, message: 'Tanggal wajib diisi' };
        }

        const debt = await db.prepare('SELECT * FROM debts WHERE uuid = ? AND couple_id = ?').get(uuid, coupleId);
        if (!debt) {
            throw { statusCode: 404, message: 'Data hutang/piutang tidak ditemukan' };
        }

        const sisaSaatIni = debt.nominal_total - debt.nominal_terbayar;
        if (nominal > sisaSaatIni) {
            throw { statusCode: 400, message: `Nominal melebihi sisa yang harus dibayar (sisa: ${sisaSaatIni})` };
        }

        // Jika hutang (kita berhutang) dan bayar pakai rekening -> saldo berkurang
        // Jika piutang (orang berhutang ke kita) dan mereka bayar ke rekening kita -> saldo bertambah
        if (account_id) {
            const account = await db.prepare('SELECT * FROM accounts WHERE id = ? AND couple_id = ?').get(account_id, coupleId);
            if (!account) {
                throw { statusCode: 404, message: 'Rekening tidak ditemukan' };
            }
            const perubahanSaldo = debt.tipe === 'hutang' ? -nominal : nominal;
            await db.prepare('UPDATE accounts SET saldo_saat_ini = saldo_saat_ini + ? WHERE id = ?').run(perubahanSaldo, account_id);
        }

        const paymentUuid = uuidv4();
        await db.prepare(`
            INSERT INTO debt_payments (uuid, debt_id, nominal, tanggal, catatan)
            VALUES (?, ?, ?, ?, ?)
        `).run(paymentUuid, debt.id, nominal, tanggal, catatan || null);

        const totalTerbayarBaru = debt.nominal_terbayar + nominal;
        const statusBaru = totalTerbayarBaru >= debt.nominal_total ? 'lunas' : 'belum_lunas';

        await db.prepare('UPDATE debts SET nominal_terbayar = ?, status = ? WHERE id = ?')
            .run(totalTerbayarBaru, statusBaru, debt.id);

        return { statusBaru, lunas: statusBaru === 'lunas' };
    });

    try {
        const result = await payTx(req.params.uuid, req.user.couple_id, req.body);
        res.status(201).json({
            status: 'success',
            message: result.lunas ? '🎉 Lunas!' : 'Pembayaran berhasil dicatat',
            data: result
        });
    } catch (err) {
        const statusCode = err.statusCode || 500;
        res.status(statusCode).json({ status: 'error', message: err.message || 'Terjadi kesalahan pada server' });
    }
});

// ==================== UPDATE HUTANG/PIUTANG ====================
router.put('/:uuid', async (req, res) => {
    try {
        const debt = await db.prepare('SELECT * FROM debts WHERE uuid = ? AND couple_id = ?').get(req.params.uuid, req.user.couple_id);

        if (!debt) {
            return res.status(404).json({ status: 'error', message: 'Data tidak ditemukan' });
        }

        const { nama_pihak, jatuh_tempo, catatan } = req.body;

        await db.prepare(`
            UPDATE debts SET
                nama_pihak = COALESCE(?, nama_pihak),
                jatuh_tempo = COALESCE(?, jatuh_tempo),
                catatan = COALESCE(?, catatan)
            WHERE uuid = ?
        `).run(nama_pihak, jatuh_tempo, catatan, req.params.uuid);

        const updated = await db.prepare('SELECT * FROM debts WHERE uuid = ?').get(req.params.uuid);
        res.json({ status: 'success', message: 'Data berhasil diperbarui', data: updated });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Terjadi kesalahan pada server' });
    }
});

// ==================== HAPUS HUTANG/PIUTANG ====================
router.delete('/:uuid', async (req, res) => {
    try {
        const debt = await db.prepare('SELECT * FROM debts WHERE uuid = ? AND couple_id = ?').get(req.params.uuid, req.user.couple_id);

        if (!debt) {
            return res.status(404).json({ status: 'error', message: 'Data tidak ditemukan' });
        }

        await db.prepare('DELETE FROM debt_payments WHERE debt_id = ?').run(debt.id);
        await db.prepare('DELETE FROM debts WHERE uuid = ?').run(req.params.uuid);

        res.json({ status: 'success', message: 'Data berhasil dihapus' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Terjadi kesalahan pada server' });
    }
});

module.exports = router;
