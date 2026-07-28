const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const { authMiddleware, requireCouple } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware, requireCouple);

// ==================== GET DAFTAR TAGIHAN + STATUS BULAN INI ====================
router.get('/', async (req, res) => {
    try {
        const now = new Date();
        const bulan = Number(req.query.bulan) || now.getMonth() + 1;
        const tahun = Number(req.query.tahun) || now.getFullYear();

        const bills = await db.prepare('SELECT * FROM bills WHERE couple_id = ? ORDER BY tanggal_jatuh_tempo ASC').all(req.user.couple_id);

        const data = await Promise.all(bills.map(async bill => {
            const payment = await db.prepare(`
                SELECT * FROM bill_payments WHERE bill_id = ? AND bulan = ? AND tahun = ?
            `).get(bill.id, bulan, tahun);

            return {
                ...bill,
                status_bulan_ini: payment ? payment.status : 'belum_bayar',
                tanggal_bayar: payment ? payment.tanggal_bayar : null,
                nominal_dibayar: payment ? payment.nominal : bill.nominal
            };
        }));

        res.json({ status: 'success', data });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Terjadi kesalahan pada server' });
    }
});

// ==================== TAMBAH TAGIHAN ====================
router.post('/', async (req, res) => {
    try {
        const { nama_tagihan, nominal, tanggal_jatuh_tempo, pengingat_hari_sebelum, icon } = req.body;

        if (!nama_tagihan || !tanggal_jatuh_tempo) {
            return res.status(400).json({ status: 'error', message: 'Nama tagihan dan tanggal jatuh tempo wajib diisi' });
        }

        if (tanggal_jatuh_tempo < 1 || tanggal_jatuh_tempo > 31) {
            return res.status(400).json({ status: 'error', message: 'Tanggal jatuh tempo harus antara 1-31' });
        }

        const billUuid = uuidv4();
        const result = await db.prepare(`
            INSERT INTO bills (uuid, couple_id, nama_tagihan, nominal, tanggal_jatuh_tempo, pengingat_hari_sebelum, icon)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(billUuid, req.user.couple_id, nama_tagihan, nominal || null, tanggal_jatuh_tempo, pengingat_hari_sebelum || 3, icon || null);

        const newBill = await db.prepare('SELECT * FROM bills WHERE id = ?').get(result.lastInsertRowid);

        res.status(201).json({ status: 'success', message: 'Tagihan berhasil ditambahkan', data: newBill });

    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Terjadi kesalahan pada server' });
    }
});

// ==================== BAYAR TAGIHAN ====================
router.post('/:id/pay', async (req, res) => {
    const payTx = db.transaction(async (billId, coupleId, body) => {
        const { nominal, tanggal_bayar, bulan, tahun, account_id } = body;

        const bill = await db.prepare('SELECT * FROM bills WHERE id = ? AND couple_id = ?').get(billId, coupleId);
        if (!bill) {
            throw { statusCode: 404, message: 'Tagihan tidak ditemukan' };
        }

        const nominalBayar = nominal || bill.nominal;
        if (!nominalBayar) {
            throw { statusCode: 400, message: 'Nominal pembayaran wajib diisi' };
        }

        const now = new Date();
        const targetBulan = bulan || now.getMonth() + 1;
        const targetTahun = tahun || now.getFullYear();

        const existing = await db.prepare('SELECT * FROM bill_payments WHERE bill_id = ? AND bulan = ? AND tahun = ?')
            .get(billId, targetBulan, targetTahun);

        if (existing) {
            throw { statusCode: 409, message: 'Tagihan bulan ini sudah dibayar' };
        }

        if (account_id) {
            const account = await db.prepare('SELECT * FROM accounts WHERE id = ? AND couple_id = ?').get(account_id, coupleId);
            if (!account) {
                throw { statusCode: 404, message: 'Rekening tidak ditemukan' };
            }
            await db.prepare('UPDATE accounts SET saldo_saat_ini = saldo_saat_ini - ? WHERE id = ?').run(nominalBayar, account_id);
        }

        const paymentUuid = uuidv4();
        await db.prepare(`
            INSERT INTO bill_payments (uuid, bill_id, bulan, tahun, nominal, tanggal_bayar, status)
            VALUES (?, ?, ?, ?, ?, ?, 'sudah_bayar')
        `).run(paymentUuid, billId, targetBulan, targetTahun, nominalBayar, tanggal_bayar || now.toISOString().split('T')[0]);
    });

    try {
        await payTx(Number(req.params.id), req.user.couple_id, req.body);
        res.status(201).json({ status: 'success', message: 'Tagihan berhasil dibayar' });
    } catch (err) {
        const statusCode = err.statusCode || 500;
        res.status(statusCode).json({ status: 'error', message: err.message || 'Terjadi kesalahan pada server' });
    }
});

// ==================== UPDATE TAGIHAN ====================
router.put('/:id', async (req, res) => {
    try {
        const bill = await db.prepare('SELECT * FROM bills WHERE id = ? AND couple_id = ?').get(req.params.id, req.user.couple_id);

        if (!bill) {
            return res.status(404).json({ status: 'error', message: 'Tagihan tidak ditemukan' });
        }

        const { nama_tagihan, nominal, tanggal_jatuh_tempo, pengingat_hari_sebelum } = req.body;

        await db.prepare(`
            UPDATE bills SET
                nama_tagihan = COALESCE(?, nama_tagihan),
                nominal = COALESCE(?, nominal),
                tanggal_jatuh_tempo = COALESCE(?, tanggal_jatuh_tempo),
                pengingat_hari_sebelum = COALESCE(?, pengingat_hari_sebelum)
            WHERE id = ?
        `).run(nama_tagihan, nominal, tanggal_jatuh_tempo, pengingat_hari_sebelum, req.params.id);

        const updated = await db.prepare('SELECT * FROM bills WHERE id = ?').get(req.params.id);
        res.json({ status: 'success', message: 'Tagihan berhasil diperbarui', data: updated });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Terjadi kesalahan pada server' });
    }
});

// ==================== HAPUS TAGIHAN ====================
router.delete('/:id', async (req, res) => {
    try {
        const bill = await db.prepare('SELECT * FROM bills WHERE id = ? AND couple_id = ?').get(req.params.id, req.user.couple_id);

        if (!bill) {
            return res.status(404).json({ status: 'error', message: 'Tagihan tidak ditemukan' });
        }

        await db.prepare('DELETE FROM bill_payments WHERE bill_id = ?').run(bill.id);
        await db.prepare('DELETE FROM bills WHERE id = ?').run(req.params.id);

        res.json({ status: 'success', message: 'Tagihan berhasil dihapus' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Terjadi kesalahan pada server' });
    }
});

module.exports = router;
