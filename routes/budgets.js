const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const { authMiddleware, requireCouple } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware, requireCouple);

// ==================== GET ANGGARAN + REALISASI BULAN INI ====================
router.get('/', async (req, res) => {
    try {
        const now = new Date();
        const bulan = req.query.bulan || String(now.getMonth() + 1).padStart(2, '0');
        const tahun = req.query.tahun || String(now.getFullYear());

        const budgets = await db.prepare(`
            SELECT * FROM budgets WHERE couple_id = ? AND bulan = ? AND tahun = ?
        `).all(req.user.couple_id, Number(bulan), Number(tahun));

        // Hitung realisasi tiap kategori dari tabel expenses
        const result = await Promise.all(budgets.map(async b => {
            const realisasi = await db.prepare(`
                SELECT COALESCE(SUM(nominal), 0) as total FROM expenses
                WHERE couple_id = ? AND kategori = ?
                AND TO_CHAR(tanggal, 'MM') = ? AND TO_CHAR(tanggal, 'YYYY') = ?
            `).get(req.user.couple_id, b.kategori, String(bulan).padStart(2, '0'), String(tahun));

            const realisasiNominal = realisasi.total;
            const sisa = b.target_nominal - realisasiNominal;
            const persentase = b.target_nominal > 0 ? (realisasiNominal / b.target_nominal) * 100 : 0;

            return {
                ...b,
                realisasi: realisasiNominal,
                sisa,
                persentase: Math.round(persentase * 10) / 10,
                status: persentase >= 100 ? 'melebihi' : persentase >= 80 ? 'hampir_habis' : 'aman'
            };
        }));

        res.json({ status: 'success', data: result });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Terjadi kesalahan pada server' });
    }
});

// ==================== SET / UPDATE ANGGARAN ====================
router.post('/', async (req, res) => {
    try {
        const { kategori, bulan, tahun, target_nominal } = req.body;

        if (!kategori || !bulan || !tahun || target_nominal === undefined) {
            return res.status(400).json({
                status: 'error',
                message: 'Kategori, bulan, tahun, dan target nominal wajib diisi'
            });
        }

        const existing = await db.prepare(`
            SELECT id FROM budgets WHERE couple_id = ? AND kategori = ? AND bulan = ? AND tahun = ?
        `).get(req.user.couple_id, kategori, bulan, tahun);

        if (existing) {
            await db.prepare('UPDATE budgets SET target_nominal = ? WHERE id = ?').run(target_nominal, existing.id);
        } else {
            const budgetUuid = uuidv4();
            await db.prepare(`
                INSERT INTO budgets (uuid, couple_id, kategori, bulan, tahun, target_nominal)
                VALUES (?, ?, ?, ?, ?, ?)
            `).run(budgetUuid, req.user.couple_id, kategori, bulan, tahun, target_nominal);
        }

        res.status(201).json({ status: 'success', message: 'Anggaran berhasil disimpan' });

    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Terjadi kesalahan pada server' });
    }
});

// ==================== HAPUS ANGGARAN ====================
router.delete('/:id', async (req, res) => {
    try {
        const budget = await db.prepare('SELECT * FROM budgets WHERE id = ? AND couple_id = ?')
            .get(req.params.id, req.user.couple_id);

        if (!budget) {
            return res.status(404).json({ status: 'error', message: 'Anggaran tidak ditemukan' });
        }

        await db.prepare('DELETE FROM budgets WHERE id = ?').run(req.params.id);
        res.json({ status: 'success', message: 'Anggaran berhasil dihapus' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Terjadi kesalahan pada server' });
    }
});

module.exports = router;
