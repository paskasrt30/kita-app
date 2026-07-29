-- ============================================
-- SCHEMA: Aplikasi Manajemen Rumah Tangga
-- ============================================

-- ---------- 1. USERS & PASANGAN ----------
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    uuid TEXT UNIQUE NOT NULL,
    nama TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    email_verified INTEGER DEFAULT 0,
    verification_token TEXT,
    google_id TEXT,
    avatar_url TEXT,
    couple_id INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS couples (
    id SERIAL PRIMARY KEY,
    uuid TEXT UNIQUE NOT NULL,
    nama_rumah_tangga TEXT DEFAULT 'Keluarga Kami',
    mata_uang TEXT DEFAULT 'IDR',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Kode pendek yang bisa dibagikan supaya orang lain langsung gabung ke rumah
-- tangga yang sama saat mendaftar (alternatif dari alur undangan via email).
ALTER TABLE couples ADD COLUMN IF NOT EXISTS kode_undangan TEXT UNIQUE;

CREATE TABLE IF NOT EXISTS couple_invitations (
    id SERIAL PRIMARY KEY,
    uuid TEXT UNIQUE NOT NULL,
    from_user_id INTEGER NOT NULL,
    to_email TEXT NOT NULL,
    status TEXT DEFAULT 'pending', -- pending, accepted, rejected
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (from_user_id) REFERENCES users(id)
);

-- ---------- 3. REKENING ----------
CREATE TABLE IF NOT EXISTS accounts (
    id SERIAL PRIMARY KEY,
    uuid TEXT UNIQUE NOT NULL,
    couple_id INTEGER NOT NULL,
    nama_rekening TEXT NOT NULL,
    tipe TEXT NOT NULL, -- bank, ewallet, tunai, dana_darurat, kas_rt
    nama_bank TEXT,
    nomor_rekening TEXT,
    saldo_awal REAL DEFAULT 0,
    saldo_saat_ini REAL DEFAULT 0,
    warna TEXT DEFAULT '#5B4B8A',
    icon TEXT DEFAULT 'wallet',
    is_active INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (couple_id) REFERENCES couples(id)
);

-- ---------- 4. PEMASUKAN ----------
CREATE TABLE IF NOT EXISTS income (
    id SERIAL PRIMARY KEY,
    uuid TEXT UNIQUE NOT NULL,
    couple_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    account_id INTEGER,
    tanggal DATE NOT NULL,
    nominal REAL NOT NULL,
    sumber TEXT, -- gaji_suami, gaji_istri, bonus, thr, freelance, investasi, hadiah, lainnya
    kategori TEXT,
    catatan TEXT,
    lampiran_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (couple_id) REFERENCES couples(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (account_id) REFERENCES accounts(id)
);

-- Tabel income sudah pernah dibuat dengan account_id NOT NULL sebelum pemasukan
-- dilepas dari keterikatan rekening -> longgarkan constraint-nya di database yang sudah ada
ALTER TABLE income ALTER COLUMN account_id DROP NOT NULL;

-- ---------- 5. PENGELUARAN ----------
CREATE TABLE IF NOT EXISTS expenses (
    id SERIAL PRIMARY KEY,
    uuid TEXT UNIQUE NOT NULL,
    couple_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    account_id INTEGER,
    tanggal DATE NOT NULL,
    nominal REAL NOT NULL,
    kategori TEXT NOT NULL, -- belanja_dapur, makan_luar, listrik, air, internet, bpjs, dst
    metode_pembayaran TEXT,
    catatan TEXT,
    foto_struk_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (couple_id) REFERENCES couples(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (account_id) REFERENCES accounts(id)
);

-- Tabel expenses sudah pernah dibuat dengan account_id NOT NULL sebelum pengeluaran
-- dilepas dari keterikatan rekening -> longgarkan constraint-nya di database yang sudah ada
ALTER TABLE expenses ALTER COLUMN account_id DROP NOT NULL;

-- ---------- 6. TRANSFER ----------
CREATE TABLE IF NOT EXISTS transfers (
    id SERIAL PRIMARY KEY,
    uuid TEXT UNIQUE NOT NULL,
    couple_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    from_account_id INTEGER NOT NULL,
    to_account_id INTEGER NOT NULL,
    nominal REAL NOT NULL,
    tanggal DATE NOT NULL,
    catatan TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (couple_id) REFERENCES couples(id),
    FOREIGN KEY (from_account_id) REFERENCES accounts(id),
    FOREIGN KEY (to_account_id) REFERENCES accounts(id)
);

-- ---------- 7. ANGGARAN BULANAN ----------
CREATE TABLE IF NOT EXISTS budgets (
    id SERIAL PRIMARY KEY,
    uuid TEXT UNIQUE NOT NULL,
    couple_id INTEGER NOT NULL,
    kategori TEXT NOT NULL,
    bulan INTEGER NOT NULL, -- 1-12
    tahun INTEGER NOT NULL,
    target_nominal REAL NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (couple_id) REFERENCES couples(id),
    UNIQUE(couple_id, kategori, bulan, tahun)
);

-- ---------- 8. TABUNGAN ----------
CREATE TABLE IF NOT EXISTS savings_goals (
    id SERIAL PRIMARY KEY,
    uuid TEXT UNIQUE NOT NULL,
    couple_id INTEGER NOT NULL,
    nama_target TEXT NOT NULL,
    target_nominal REAL NOT NULL,
    target_tanggal DATE,
    nominal_terkumpul REAL DEFAULT 0,
    icon TEXT DEFAULT 'piggy-bank',
    status TEXT DEFAULT 'active', -- active, completed, cancelled
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (couple_id) REFERENCES couples(id)
);

CREATE TABLE IF NOT EXISTS savings_deposits (
    id SERIAL PRIMARY KEY,
    uuid TEXT UNIQUE NOT NULL,
    savings_goal_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    nominal REAL NOT NULL,
    tanggal DATE NOT NULL,
    catatan TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (savings_goal_id) REFERENCES savings_goals(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- ---------- 9. HUTANG & PIUTANG ----------
CREATE TABLE IF NOT EXISTS debts (
    id SERIAL PRIMARY KEY,
    uuid TEXT UNIQUE NOT NULL,
    couple_id INTEGER NOT NULL,
    tipe TEXT NOT NULL, -- hutang, piutang
    nama_pihak TEXT NOT NULL,
    nominal_total REAL NOT NULL,
    nominal_terbayar REAL DEFAULT 0,
    tanggal_mulai DATE NOT NULL,
    jatuh_tempo DATE,
    status TEXT DEFAULT 'belum_lunas', -- belum_lunas, lunas
    catatan TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (couple_id) REFERENCES couples(id)
);

CREATE TABLE IF NOT EXISTS debt_payments (
    id SERIAL PRIMARY KEY,
    uuid TEXT UNIQUE NOT NULL,
    debt_id INTEGER NOT NULL,
    nominal REAL NOT NULL,
    tanggal DATE NOT NULL,
    catatan TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (debt_id) REFERENCES debts(id)
);

-- ---------- 10. TAGIHAN RUTIN ----------
CREATE TABLE IF NOT EXISTS bills (
    id SERIAL PRIMARY KEY,
    uuid TEXT UNIQUE NOT NULL,
    couple_id INTEGER NOT NULL,
    nama_tagihan TEXT NOT NULL, -- PLN, PDAM, Internet, Netflix, dst
    nominal REAL,
    tanggal_jatuh_tempo INTEGER, -- tanggal dalam bulan (1-31)
    pengingat_hari_sebelum INTEGER DEFAULT 3,
    is_recurring INTEGER DEFAULT 1,
    icon TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (couple_id) REFERENCES couples(id)
);

CREATE TABLE IF NOT EXISTS bill_payments (
    id SERIAL PRIMARY KEY,
    uuid TEXT UNIQUE NOT NULL,
    bill_id INTEGER NOT NULL,
    bulan INTEGER NOT NULL,
    tahun INTEGER NOT NULL,
    nominal REAL NOT NULL,
    tanggal_bayar DATE,
    status TEXT DEFAULT 'belum_bayar', -- belum_bayar, sudah_bayar
    FOREIGN KEY (bill_id) REFERENCES bills(id),
    UNIQUE(bill_id, bulan, tahun)
);

-- ---------- 11. KALENDER ----------
CREATE TABLE IF NOT EXISTS calendar_events (
    id SERIAL PRIMARY KEY,
    uuid TEXT UNIQUE NOT NULL,
    couple_id INTEGER NOT NULL,
    created_by INTEGER NOT NULL,
    judul TEXT NOT NULL,
    tipe TEXT, -- kerja, cuti, dokter, liburan, keluarga, ulang_tahun, anniversary
    tanggal_mulai TIMESTAMP NOT NULL,
    tanggal_selesai TIMESTAMP,
    lokasi TEXT,
    catatan TEXT,
    is_recurring_yearly INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (couple_id) REFERENCES couples(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
);

-- ---------- 12. TO DO LIST ----------
CREATE TABLE IF NOT EXISTS todos (
    id SERIAL PRIMARY KEY,
    uuid TEXT UNIQUE NOT NULL,
    couple_id INTEGER NOT NULL,
    created_by INTEGER NOT NULL,
    assigned_to INTEGER,
    judul TEXT NOT NULL,
    deskripsi TEXT,
    prioritas TEXT DEFAULT 'sedang', -- rendah, sedang, tinggi
    deadline TIMESTAMP,
    status TEXT DEFAULT 'belum', -- belum, proses, selesai
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (couple_id) REFERENCES couples(id),
    FOREIGN KEY (created_by) REFERENCES users(id),
    FOREIGN KEY (assigned_to) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS todo_comments (
    id SERIAL PRIMARY KEY,
    todo_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    komentar TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (todo_id) REFERENCES todos(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- ---------- 13. SHOPPING LIST ----------
CREATE TABLE IF NOT EXISTS shopping_lists (
    id SERIAL PRIMARY KEY,
    uuid TEXT UNIQUE NOT NULL,
    couple_id INTEGER NOT NULL,
    nama_list TEXT DEFAULT 'Belanja Bulanan',
    status TEXT DEFAULT 'aktif', -- aktif, selesai
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (couple_id) REFERENCES couples(id)
);

CREATE TABLE IF NOT EXISTS shopping_items (
    id SERIAL PRIMARY KEY,
    shopping_list_id INTEGER NOT NULL,
    nama_barang TEXT NOT NULL,
    jumlah TEXT,
    estimasi_harga REAL DEFAULT 0,
    checked INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (shopping_list_id) REFERENCES shopping_lists(id)
);

-- ---------- 14. STOK RUMAH ----------
CREATE TABLE IF NOT EXISTS stock_items (
    id SERIAL PRIMARY KEY,
    uuid TEXT UNIQUE NOT NULL,
    couple_id INTEGER NOT NULL,
    nama_barang TEXT NOT NULL,
    jumlah_saat_ini REAL DEFAULT 0,
    satuan TEXT, -- kg, liter, pcs, dll
    ambang_batas_minimum REAL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (couple_id) REFERENCES couples(id)
);

-- ---------- 15. INVENTARIS RUMAH ----------
CREATE TABLE IF NOT EXISTS inventory_items (
    id SERIAL PRIMARY KEY,
    uuid TEXT UNIQUE NOT NULL,
    couple_id INTEGER NOT NULL,
    nama_barang TEXT NOT NULL,
    lokasi TEXT,
    harga_beli REAL,
    tanggal_beli DATE,
    garansi_sampai DATE,
    kondisi TEXT DEFAULT 'baik', -- baik, rusak_ringan, rusak_berat
    foto_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (couple_id) REFERENCES couples(id)
);

-- ---------- 16. JADWAL SERVIS ----------
CREATE TABLE IF NOT EXISTS service_schedules (
    id SERIAL PRIMARY KEY,
    uuid TEXT UNIQUE NOT NULL,
    couple_id INTEGER NOT NULL,
    nama_item TEXT NOT NULL, -- mobil, motor, ac, water_heater, mesin_cuci
    jenis_servis TEXT,
    tanggal_servis_terakhir DATE,
    interval_hari INTEGER, -- untuk hitung jatuh tempo berikutnya
    tanggal_servis_berikutnya DATE,
    catatan TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (couple_id) REFERENCES couples(id)
);

-- ---------- 17. DOKUMEN PENTING ----------
CREATE TABLE IF NOT EXISTS documents (
    id SERIAL PRIMARY KEY,
    uuid TEXT UNIQUE NOT NULL,
    couple_id INTEGER NOT NULL,
    jenis_dokumen TEXT NOT NULL, -- ktp, kk, npwp, bpjs, sim, stnk, bpkb, sertifikat, polis
    nama_dokumen TEXT NOT NULL,
    nomor_dokumen TEXT,
    berlaku_sampai DATE,
    file_url TEXT,
    catatan TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (couple_id) REFERENCES couples(id)
);

-- ---------- 18. CATATAN BEBAS ----------
CREATE TABLE IF NOT EXISTS notes (
    id SERIAL PRIMARY KEY,
    uuid TEXT UNIQUE NOT NULL,
    couple_id INTEGER NOT NULL,
    created_by INTEGER NOT NULL,
    judul TEXT NOT NULL,
    isi TEXT,
    kategori TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (couple_id) REFERENCES couples(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
);

-- ---------- 21. NOTIFIKASI ----------
CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    uuid TEXT UNIQUE NOT NULL,
    user_id INTEGER NOT NULL,
    tipe TEXT NOT NULL, -- tagihan, tabungan, anggaran, servis, tugas, aktivitas_pasangan
    judul TEXT NOT NULL,
    pesan TEXT,
    is_read INTEGER DEFAULT 0,
    link_ref TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- ---------- 22. PENGATURAN ----------
CREATE TABLE IF NOT EXISTS user_settings (
    id SERIAL PRIMARY KEY,
    user_id INTEGER UNIQUE NOT NULL,
    tema TEXT DEFAULT 'light', -- light, dark
    notifikasi_email INTEGER DEFAULT 1,
    notifikasi_push INTEGER DEFAULT 1,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS custom_categories (
    id SERIAL PRIMARY KEY,
    couple_id INTEGER NOT NULL,
    tipe TEXT NOT NULL, -- pemasukan, pengeluaran
    nama_kategori TEXT NOT NULL,
    icon TEXT,
    warna TEXT,
    FOREIGN KEY (couple_id) REFERENCES couples(id)
);

-- ---------- INDEXES untuk performa query ----------
CREATE INDEX IF NOT EXISTS idx_income_couple_tanggal ON income(couple_id, tanggal);
CREATE INDEX IF NOT EXISTS idx_expenses_couple_tanggal ON expenses(couple_id, tanggal);
CREATE INDEX IF NOT EXISTS idx_todos_couple_status ON todos(couple_id, status);
CREATE INDEX IF NOT EXISTS idx_calendar_couple_tanggal ON calendar_events(couple_id, tanggal_mulai);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
