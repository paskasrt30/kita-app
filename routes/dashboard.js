const express = require('express');
const db = require('../db/database');
const { authMiddleware, requireCouple } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware, requireCouple);

router.get('/', async (req, res) => {
    try {
    const coupleId = req.user.couple_id;
    const now = new Date();
    const bulanIni = String(now.getMonth() + 1).padStart(2, '0');
    const tahunIni = String(now.getFullYear());

    // ---- Total saldo dari semua rekening ----
    const accounts = await db.prepare(`
        SELECT * FROM accounts WHERE couple_id = ? AND is_active = 1
    `).all(coupleId);
    const totalSaldo = accounts.reduce((sum, a) => sum + a.saldo_saat_ini, 0);

    // ---- Pemasukan & pengeluaran bulan berjalan ----
    const totalPemasukanRow = await db.prepare(`
        SELECT COALESCE(SUM(nominal), 0) as total FROM income
        WHERE couple_id = ? AND TO_CHAR(tanggal, 'MM') = ? AND TO_CHAR(tanggal, 'YYYY') = ?
    `).get(coupleId, bulanIni, tahunIni);
    const totalPemasukan = totalPemasukanRow.total;

    const totalPengeluaranRow = await db.prepare(`
        SELECT COALESCE(SUM(nominal), 0) as total FROM expenses
        WHERE couple_id = ? AND TO_CHAR(tanggal, 'MM') = ? AND TO_CHAR(tanggal, 'YYYY') = ?
    `).get(coupleId, bulanIni, tahunIni);
    const totalPengeluaran = totalPengeluaranRow.total;

    // ---- Sisa saldo bulan ini (selisih pemasukan - pengeluaran bulan berjalan) ----
    const sisaSaldoBulanIni = totalPemasukan - totalPengeluaran;

    // ---- Sisa anggaran (total target - total realisasi bulan ini) ----
    const totalTargetAnggaranRow = await db.prepare(`
        SELECT COALESCE(SUM(target_nominal), 0) as total FROM budgets
        WHERE couple_id = ? AND bulan = ? AND tahun = ?
    `).get(coupleId, Number(bulanIni), Number(tahunIni));
    const totalTargetAnggaran = totalTargetAnggaranRow.total;

    const sisaAnggaran = totalTargetAnggaran - totalPengeluaran;

    // ---- Target tabungan aktif ----
    const savingsGoals = await db.prepare(`
        SELECT *, ROUND((nominal_terkumpul * 100.0 / NULLIF(target_nominal, 0))::numeric, 1) as progress_persen
        FROM savings_goals WHERE couple_id = ? AND status = 'active'
        ORDER BY target_tanggal ASC LIMIT 3
    `).all(coupleId);

    // ---- Tagihan yang akan jatuh tempo (7 hari ke depan) ----
    const tanggalHariIni = now.getDate();
    const bills = await db.prepare(`
        SELECT * FROM bills WHERE couple_id = ?
        AND tanggal_jatuh_tempo BETWEEN ? AND ?
        ORDER BY tanggal_jatuh_tempo ASC
    `).all(coupleId, tanggalHariIni, tanggalHariIni + 7);

    // ---- To-do hari ini ----
    // Tugas dengan deadline hari ini selalu tampil (termasuk yang sudah selesai, sebagai tanda centang).
    // Tugas overdue/tanpa deadline hanya tampil selama belum selesai.
    const todosHariIni = await db.prepare(`
        SELECT t.*, u.nama as nama_assigned
        FROM todos t
        LEFT JOIN users u ON t.assigned_to = u.id
        WHERE t.couple_id = ?
        AND (
            t.deadline::date = CURRENT_DATE
            OR (t.status != 'selesai' AND (t.deadline::date < CURRENT_DATE OR t.deadline IS NULL))
        )
        ORDER BY (t.status = 'selesai') ASC, t.prioritas DESC, t.deadline ASC
        LIMIT 5
    `).all(coupleId);

    // ---- Jadwal hari ini s.d. 2 minggu ke depan ----
    const jadwalHariIni = await db.prepare(`
        SELECT * FROM calendar_events
        WHERE couple_id = ? AND tanggal_mulai::date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '14 days'
        ORDER BY tanggal_mulai ASC
        LIMIT 5
    `).all(coupleId);

    res.json({
        status: 'success',
        data: {
            total_saldo: totalSaldo,
            total_pemasukan_bulan_ini: totalPemasukan,
            total_pengeluaran_bulan_ini: totalPengeluaran,
            sisa_saldo_bulan_ini: sisaSaldoBulanIni,
            sisa_anggaran: sisaAnggaran,
            target_tabungan: savingsGoals,
            tagihan_jatuh_tempo: bills,
            todos_hari_ini: todosHariIni,
            jadwal_hari_ini: jadwalHariIni
        }
    });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Terjadi kesalahan pada server' });
    }
});

module.exports = router;
