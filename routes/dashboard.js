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

    // ---- Sisa anggaran (total target - total realisasi bulan ini) ----
    const totalTargetAnggaranRow = await db.prepare(`
        SELECT COALESCE(SUM(target_nominal), 0) as total FROM budgets
        WHERE couple_id = ? AND bulan = ? AND tahun = ?
    `).get(coupleId, Number(bulanIni), Number(tahunIni));
    const totalTargetAnggaran = totalTargetAnggaranRow.total;

    const sisaAnggaran = totalTargetAnggaran - totalPengeluaran;

    // ---- Target tabungan aktif ----
    const savingsGoals = await db.prepare(`
        SELECT *, ROUND((nominal_terkumpul * 100.0 / NULLIF(target_nominal, 0)), 1) as progress_persen
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
    const todosHariIni = await db.prepare(`
        SELECT t.*, u.nama as nama_assigned
        FROM todos t
        LEFT JOIN users u ON t.assigned_to = u.id
        WHERE t.couple_id = ? AND t.status != 'selesai'
        AND (t.deadline::date <= CURRENT_DATE OR t.deadline IS NULL)
        ORDER BY t.prioritas DESC, t.deadline ASC
        LIMIT 5
    `).all(coupleId);

    // ---- Jadwal hari ini ----
    const jadwalHariIni = await db.prepare(`
        SELECT * FROM calendar_events
        WHERE couple_id = ? AND tanggal_mulai::date = CURRENT_DATE
        ORDER BY tanggal_mulai ASC
    `).all(coupleId);

    // ---- Aktivitas pasangan terbaru (5 transaksi terakhir dari pasangan) ----
    const aktivitasPasangan = await db.prepare(`
        SELECT 'pengeluaran' as tipe, e.nominal, e.kategori as detail, e.tanggal, u.nama as nama_user, e.created_at
        FROM expenses e JOIN users u ON e.user_id = u.id
        WHERE e.couple_id = ? AND e.user_id != ?
        UNION ALL
        SELECT 'pemasukan' as tipe, i.nominal, i.sumber as detail, i.tanggal, u.nama as nama_user, i.created_at
        FROM income i JOIN users u ON i.user_id = u.id
        WHERE i.couple_id = ? AND i.user_id != ?
        ORDER BY created_at DESC LIMIT 5
    `).all(coupleId, req.user.id, coupleId, req.user.id);

    res.json({
        status: 'success',
        data: {
            total_saldo: totalSaldo,
            total_pemasukan_bulan_ini: totalPemasukan,
            total_pengeluaran_bulan_ini: totalPengeluaran,
            sisa_anggaran: sisaAnggaran,
            target_tabungan: savingsGoals,
            tagihan_jatuh_tempo: bills,
            todos_hari_ini: todosHariIni,
            jadwal_hari_ini: jadwalHariIni,
            aktivitas_pasangan: aktivitasPasangan
        }
    });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Terjadi kesalahan pada server' });
    }
});

module.exports = router;
