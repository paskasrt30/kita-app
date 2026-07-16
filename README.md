# Kita — Aplikasi Manajemen Rumah Tangga (PWA)

Aplikasi manajemen keuangan & rumah tangga untuk suami & istri. Dibangun dengan Node.js + Express + SQLite, frontend PWA (installable, offline-ready).

## Fitur

- ✅ Registrasi & login (email/password + JWT)
- ✅ Login dengan Google (siap pakai, tinggal isi `GOOGLE_CLIENT_ID` di `.env`)
- ✅ Verifikasi email sungguhan via SMTP/Nodemailer (siap pakai, tinggal isi kredensial SMTP di `.env`)
- ✅ Undang & hubungkan akun pasangan
- ✅ Dashboard (saldo, pemasukan/pengeluaran bulan ini, tugas, tagihan, tabungan, aktivitas pasangan)
- ✅ Manajemen rekening (bank, e-wallet, tunai, dana darurat, kas RT)
- ✅ Pencatatan pemasukan & pengeluaran (otomatis update saldo rekening)
- ✅ Transfer Antar Rekening (dengan riwayat, bisa dibatalkan/reversed)
- ✅ Anggaran bulanan per kategori dengan indikator realisasi
- ✅ Tabungan (target, setor dari rekening opsional, progress otomatis, notifikasi target tercapai)
- ✅ Hutang & Piutang (cicilan bertahap, progress lunas, opsional terhubung ke saldo rekening)
- ✅ Tagihan Rutin (jadwal jatuh tempo per bulan, bayar langsung dari rekening, riwayat status per bulan)
- ✅ Kalender rumah tangga (agenda mendatang, kategori acara)
- ✅ To-do List bersama (prioritas, penanggung jawab, filter status, komentar via API)
- ✅ Shopping List (checklist, estimasi harga, auto-buat daftar baru setelah selesai belanja)
- ✅ Stok Rumah (dengan penanda otomatis saat stok menipis)
- ✅ Inventaris Rumah (barang, lokasi, harga beli, status garansi otomatis)
- ✅ Jadwal Servis (mobil, motor, AC, dll — perhitungan jatuh tempo otomatis dari interval)
- ✅ Dokumen Penting (dengan pengingat 30 hari sebelum kedaluwarsa)
- ✅ Catatan Bebas
- ✅ Laporan Keuangan (grafik cash flow 6 bulan, breakdown pengeluaran per kategori, perbandingan bulan ini vs bulan lalu)
- ✅ Analisis Keuangan Lanjutan (rasio cicilan, tren pengeluaran, rata-rata bulanan, estimasi saldo akhir bulan)
- ✅ Notifikasi (auto-generate dari tagihan, servis, dan dokumen yang mendekati jatuh tempo/kedaluwarsa)
- ✅ Pengaturan (tema gelap/terang, preferensi notifikasi, kategori kustom, profil)
- ✅ PWA installable (manifest + service worker, cache-first untuk aset statis)

**Semua 22 kebutuhan fungsional awal sudah terimplementasi.** 🎉

## Cara Menjalankan

### 1. Install dependencies

```bash
cd kita-app
npm install
```

### 2. Setup environment variable

```bash
cp .env.example .env
```

Buka `.env` dan minimal ganti `JWT_SECRET` dengan string acak yang panjang. Bagian SMTP dan `GOOGLE_CLIENT_ID` **opsional** — app tetap jalan normal tanpa itu (verifikasi email & login Google akan otomatis nonaktif dengan pesan yang jelas).

### 3. Jalankan server

```bash
npm start
```

Atau untuk development (auto-restart saat ada perubahan kode):

```bash
npm run dev
```

### 4. Buka aplikasi

```
http://localhost:3000
```

Database SQLite (`db/rumah_tangga.db`) otomatis dibuat saat pertama kali server dijalankan — tidak perlu setup database server terpisah.

### 5. Install sebagai PWA (opsional)

Buka di Chrome/Edge (desktop atau Android) → klik ikon "Install" di address bar, atau di HP pilih "Add to Home Screen". Di iOS Safari: Share → "Add to Home Screen".

## Mengaktifkan Fitur Opsional

### Login dengan Google
1. Buat kredensial OAuth di [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Tambahkan `http://localhost:3000` sebagai Authorized JavaScript origin
3. Isi `GOOGLE_CLIENT_ID` di `.env`
4. Isi juga konstanta `GOOGLE_CLIENT_ID` di `public/js/app.js` (baris dekat `initGoogleSignIn`)

### Verifikasi Email
1. Siapkan akun SMTP (Gmail App Password, SendGrid, Mailgun, dll)
2. Isi `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` di `.env`
3. Restart server — email verifikasi akan otomatis terkirim saat registrasi

## Struktur Project

```
kita-app/
├── server.js                  # Entry point Express
├── db/
│   ├── schema.sql              # Skema lengkap semua modul
│   └── database.js             # Koneksi SQLite
├── middleware/
│   └── auth.js                  # Verifikasi JWT
├── routes/
│   ├── _email.js                 # Helper kirim email verifikasi (Nodemailer)
│   ├── auth.js                   # Register, login, Google login, koneksi pasangan
│   ├── dashboard.js               # Ringkasan gabungan semua modul
│   ├── accounts.js                # CRUD rekening
│   ├── income.js                  # Pencatatan pemasukan
│   ├── expenses.js                # Pencatatan pengeluaran
│   ├── transfers.js               # Transfer antar rekening
│   ├── budgets.js                 # Anggaran bulanan
│   ├── savings.js                 # Target tabungan & setoran
│   ├── debts.js                   # Hutang & piutang
│   ├── bills.js                   # Tagihan rutin
│   ├── calendar.js                # Kalender rumah tangga
│   ├── todos.js                   # To-do list & komentar
│   ├── shopping.js                # Shopping list
│   ├── stock.js                   # Stok rumah
│   ├── inventory.js               # Inventaris rumah
│   ├── services.js                # Jadwal servis
│   ├── documents.js               # Dokumen penting
│   ├── notes.js                   # Catatan bebas
│   ├── reports.js                 # Laporan keuangan, grafik & analisis
│   ├── notifications.js           # Notifikasi (auto-generate)
│   └── settings.js                # Pengaturan & kategori kustom
└── public/                     # Frontend PWA
    ├── index.html
    ├── manifest.json
    ├── sw.js                     # Service worker
    ├── css/style.css
    ├── js/app.js
    └── icons/
```

## Catatan Keamanan Sebelum Production

- Ganti `JWT_SECRET` di `.env` dengan nilai yang benar-benar acak dan rahasia
- Aktifkan HTTPS (lewat reverse proxy Nginx + Let's Encrypt, atau platform hosting yang sudah menyediakan)
- Pertimbangkan rate-limiting pada endpoint `/auth/login` untuk mencegah brute-force
- Backup berkala file `db/rumah_tangga.db`
- Google Client ID di frontend (`public/js/app.js`) bersifat publik (memang didesain begitu oleh Google), tapi tetap pastikan Authorized origins dikonfigurasi dengan benar di Google Cloud Console

## Pengembangan Lebih Lanjut

Arsitektur ini modular per file route — untuk menambah modul baru, ikuti pola yang sama: tabel di `schema.sql` (kebanyakan sudah tersedia), file route baru di `routes/`, daftarkan di `server.js`, lalu tambahkan halaman + form di `public/index.html` dan logic di `public/js/app.js`.
