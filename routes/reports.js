const express = require('express');
const db = require('../db/database');
const { authMiddleware, requireCouple } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware, requireCouple);

const BULAN_LABEL = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

// Helper: hasilkan daftar {bulan, tahun} untuk N bulan terakhir (termasuk bulan ini)
function getLastNMonths(n) {
    const result = [];
    const now = new Date();
    for (let i = n - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        result.push({ bulan: d.getMonth() + 1, tahun: d.getFullYear() });
    }
    return result;
}

// ==================== CASH FLOW (N bulan terakhir) ====================
router.get('/cashflow', (req, res) => {
    const n = Number(req.query.months) || 6;
    const months = getLastNMonths(n);
    const coupleId = req.user.couple_id;

    const data = months.map(({ bulan, tahun }) => {
        const bulanStr = String(bulan).padStart(2, '0');

        const pemasukan = db.prepare(`
            SELECT COALESCE(SUM(nominal), 0) as total FROM income
            WHERE couple_id = ? AND strftime('%m', tanggal) = ? AND strftime('%Y', tanggal) = ?
        `).get(coupleId, bulanStr, String(tahun)).total;

        const pengeluaran = db.prepare(`
            SELECT COALESCE(SUM(nominal), 0) as total FROM expenses
            WHERE couple_id = ? AND strftime('%m', tanggal) = ? AND strftime('%Y', tanggal) = ?
        `).get(coupleId, bulanStr, String(tahun)).total;

        return {
            label: `${BULAN_LABEL[bulan - 1]} ${tahun}`,
            bulan, tahun,
            pemasukan, pengeluaran,
            net: pemasukan - pengeluaran
        };
    });

    res.json({ status: 'success', data });
});

// ==================== BREAKDOWN PENGELUARAN PER KATEGORI ====================
router.get('/expense-breakdown', (req, res) => {
    const now = new Date();
    const bulan = String(req.query.bulan || now.getMonth() + 1).padStart(2, '0');
    const tahun = String(req.query.tahun || now.getFullYear());

    const data = db.prepare(`
        SELECT kategori, SUM(nominal) as total, COUNT(*) as jumlah_transaksi
        FROM expenses
        WHERE couple_id = ? AND strftime('%m', tanggal) = ? AND strftime('%Y', tanggal) = ?
        GROUP BY kategori
        ORDER BY total DESC
    `).all(req.user.couple_id, bulan, tahun);

    const grandTotal = data.reduce((sum, d) => sum + d.total, 0);
    const withPercentage = data.map(d => ({
        ...d,
        persentase: grandTotal > 0 ? Math.round((d.total / grandTotal) * 1000) / 10 : 0
    }));

    res.json({ status: 'success', data: withPercentage, total: grandTotal });
});

// ==================== BREAKDOWN PEMASUKAN PER SUMBER ====================
router.get('/income-breakdown', (req, res) => {
    const now = new Date();
    const bulan = String(req.query.bulan || now.getMonth() + 1).padStart(2, '0');
    const tahun = String(req.query.tahun || now.getFullYear());

    const data = db.prepare(`
        SELECT sumber, SUM(nominal) as total, COUNT(*) as jumlah_transaksi
        FROM income
        WHERE couple_id = ? AND strftime('%m', tanggal) = ? AND strftime('%Y', tanggal) = ?
        GROUP BY sumber
        ORDER BY total DESC
    `).all(req.user.couple_id, bulan, tahun);

    const grandTotal = data.reduce((sum, d) => sum + d.total, 0);
    const withPercentage = data.map(d => ({
        ...d,
        persentase: grandTotal > 0 ? Math.round((d.total / grandTotal) * 1000) / 10 : 0
    }));

    res.json({ status: 'success', data: withPercentage, total: grandTotal });
});

// ==================== RINGKASAN + PERBANDINGAN BULAN LALU ====================
router.get('/overview', (req, res) => {
    const now = new Date();
    const bulanIni = now.getMonth() + 1;
    const tahunIni = now.getFullYear();
    const bulanLaluDate = new Date(tahunIni, bulanIni - 2, 1);
    const bulanLalu = bulanLaluDate.getMonth() + 1;
    const tahunLalu = bulanLaluDate.getFullYear();
    const coupleId = req.user.couple_id;

    function getTotal(table, bulan, tahun) {
        return db.prepare(`
            SELECT COALESCE(SUM(nominal), 0) as total FROM ${table}
            WHERE couple_id = ? AND strftime('%m', tanggal) = ? AND strftime('%Y', tanggal) = ?
        `).get(coupleId, String(bulan).padStart(2, '0'), String(tahun)).total;
    }

    const pemasukanIni = getTotal('income', bulanIni, tahunIni);
    const pengeluaranIni = getTotal('expenses', bulanIni, tahunIni);
    const pemasukanLalu = getTotal('income', bulanLalu, tahunLalu);
    const pengeluaranLalu = getTotal('expenses', bulanLalu, tahunLalu);

    function hitungPerubahan(sekarang, lalu) {
        if (lalu === 0) return sekarang > 0 ? 100 : 0;
        return Math.round(((sekarang - lalu) / lalu) * 1000) / 10;
    }

    const totalTabungan = db.prepare(`
        SELECT COALESCE(SUM(nominal_terkumpul), 0) as total FROM savings_goals
        WHERE couple_id = ? AND status = 'active'
    `).get(coupleId).total;

    const persentaseTabungan = pemasukanIni > 0 ? Math.round((pemasukanIni - pengeluaranIni) / pemasukanIni * 1000) / 10 : 0;

    res.json({
        status: 'success',
        data: {
            pemasukan_bulan_ini: pemasukanIni,
            pengeluaran_bulan_ini: pengeluaranIni,
            net_bulan_ini: pemasukanIni - pengeluaranIni,
            perubahan_pemasukan_persen: hitungPerubahan(pemasukanIni, pemasukanLalu),
            perubahan_pengeluaran_persen: hitungPerubahan(pengeluaranIni, pengeluaranLalu),
            total_tabungan_terkumpul: totalTabungan,
            persentase_tabungan_dari_pemasukan: persentaseTabungan
        }
    });
});

// ==================== ANALISIS KEUANGAN LANJUTAN ====================
router.get('/analysis', (req, res) => {
    const coupleId = req.user.couple_id;
    const now = new Date();
    const bulanIni = now.getMonth() + 1;
    const tahunIni = now.getFullYear();
    const bulanStr = String(bulanIni).padStart(2, '0');

    function getTotal(table, bulan, tahun) {
        return db.prepare(`
            SELECT COALESCE(SUM(nominal), 0) as total FROM ${table}
            WHERE couple_id = ? AND strftime('%m', tanggal) = ? AND strftime('%Y', tanggal) = ?
        `).get(coupleId, String(bulan).padStart(2, '0'), String(tahun)).total;
    }

    const pemasukanIni = getTotal('income', bulanIni, tahunIni);
    const pengeluaranIni = getTotal('expenses', bulanIni, tahunIni);

    // ---- Rasio cicilan terhadap pemasukan ----
    const totalCicilan = db.prepare(`
        SELECT COALESCE(SUM(nominal), 0) as total FROM expenses
        WHERE couple_id = ? AND kategori = 'cicilan' AND strftime('%m', tanggal) = ? AND strftime('%Y', tanggal) = ?
    `).get(coupleId, bulanStr, String(tahunIni)).total;

    const rasioCicilan = pemasukanIni > 0 ? Math.round((totalCicilan / pemasukanIni) * 1000) / 10 : 0;

    // ---- Tren pengeluaran 3 bulan terakhir ----
    const bulanTerakhir3 = getLastNMonths(3).map(({ bulan, tahun }) => getTotal('expenses', bulan, tahun));
    let trenPengeluaran = 'stabil';
    if (bulanTerakhir3[2] > bulanTerakhir3[1] && bulanTerakhir3[1] > bulanTerakhir3[0]) trenPengeluaran = 'naik';
    else if (bulanTerakhir3[2] < bulanTerakhir3[1] && bulanTerakhir3[1] < bulanTerakhir3[0]) trenPengeluaran = 'turun';

    // ---- Rata-rata pengeluaran bulanan (6 bulan terakhir) ----
    const bulanTerakhir6 = getLastNMonths(6).map(({ bulan, tahun }) => getTotal('expenses', bulan, tahun));
    const rataRataPengeluaran = Math.round(bulanTerakhir6.reduce((a, b) => a + b, 0) / bulanTerakhir6.length);

    // ---- Estimasi saldo akhir bulan (berdasarkan rata-rata harian bulan berjalan) ----
    const totalSaldo = db.prepare(`
        SELECT COALESCE(SUM(saldo_saat_ini), 0) as total FROM accounts WHERE couple_id = ? AND is_active = 1
    `).get(coupleId).total;

    const hariBerjalan = now.getDate();
    const hariDalamBulan = new Date(tahunIni, bulanIni, 0).getDate();
    const hariTersisa = hariDalamBulan - hariBerjalan;

    const avgPemasukanHarian = hariBerjalan > 0 ? pemasukanIni / hariBerjalan : 0;
    const avgPengeluaranHarian = hariBerjalan > 0 ? pengeluaranIni / hariBerjalan : 0;

    const estimasiSaldoAkhirBulan = Math.round(
        totalSaldo + (avgPemasukanHarian * hariTersisa) - (avgPengeluaranHarian * hariTersisa)
    );

    res.json({
        status: 'success',
        data: {
            rasio_cicilan_persen: rasioCicilan,
            tren_pengeluaran: trenPengeluaran,
            rata_rata_pengeluaran_bulanan: rataRataPengeluaran,
            estimasi_saldo_akhir_bulan: estimasiSaldoAkhirBulan,
            hari_tersisa_bulan_ini: hariTersisa
        }
    });
});

module.exports = router;
