// ============================================
// STATE & KONFIGURASI
// ============================================
const API_BASE = '/api';
let state = {
    token: localStorage.getItem('token') || null,
    user: JSON.parse(localStorage.getItem('user') || 'null'),
    accounts: []
};

const KATEGORI_LABELS = {
    belanja_dapur: 'Belanja Dapur', makan_luar: 'Makan di Luar', listrik: 'Listrik',
    air: 'Air', internet: 'Internet', bpjs: 'BPJS', asuransi: 'Asuransi',
    cicilan: 'Cicilan', transportasi: 'Transportasi', bensin: 'Bensin',
    pulsa: 'Pulsa', hiburan: 'Hiburan', pendidikan: 'Pendidikan',
    kesehatan: 'Kesehatan', donasi: 'Donasi', pajak: 'Pajak', lainnya: 'Lainnya'
};

const SUMBER_LABELS = {
    gaji_suami: 'Gaji Suami', gaji_istri: 'Gaji Istri', bonus: 'Bonus',
    thr: 'THR', freelance: 'Freelance', investasi: 'Investasi',
    hadiah: 'Hadiah', lainnya: 'Lainnya'
};

const TIPE_ICON = { bank: '🏦', ewallet: '📱', tunai: '💵', dana_darurat: '🛟', kas_rt: '🏠' };

// ============================================
// UTILITAS
// ============================================
function formatRupiah(nominal) {
    return 'Rp ' + Number(nominal || 0).toLocaleString('id-ID');
}

function formatTanggal(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

function todayISO() {
    return new Date().toISOString().split('T')[0];
}

function toDatetimeLocalValue(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function apiCall(endpoint, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (state.token) headers['Authorization'] = `Bearer ${state.token}`;

    const res = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
    const data = await res.json();

    if (!res.ok) {
        throw new Error(data.message || 'Terjadi kesalahan');
    }
    return data;
}

// ============================================
// NAVIGASI ANTAR HALAMAN
// ============================================
function showPage(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
    document.getElementById(pageId).classList.remove('hidden');
}

function navigateTo(pageId) {
    showPage(pageId);
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.page === pageId);
    });

    if (pageId === 'page-dashboard') loadDashboard();
    if (pageId === 'page-accounts') loadAccounts();
    if (pageId === 'page-transactions') loadTransactions();
    if (pageId === 'page-budgets') loadBudgets();
    if (pageId === 'page-savings') loadSavings();
    if (pageId === 'page-todos') loadTodos();
    if (pageId === 'page-calendar') loadCalendar();
    if (pageId === 'page-shopping') loadShopping();
    if (pageId === 'page-bills') loadBills();
    if (pageId === 'page-debts') loadDebts();
    if (pageId === 'page-reports') loadReports();
    if (pageId === 'page-transfers') loadTransfers();
    if (pageId === 'page-stock') loadStock();
    if (pageId === 'page-inventory') loadInventory();
    if (pageId === 'page-services') loadServices();
    if (pageId === 'page-documents') loadDocuments();
    if (pageId === 'page-notes') loadNotes();
    if (pageId === 'page-notifications') loadNotifications();
    if (pageId === 'page-settings') loadSettings();
}

function openSheet(sheetId) {
    document.getElementById(sheetId).classList.add('show');
    // Set tanggal default ke hari ini untuk form yang punya field tanggal
    const tanggalInputs = document.getElementById(sheetId).querySelectorAll('input[type="date"]');
    tanggalInputs.forEach(input => { if (!input.value) input.value = todayISO(); });
}

// Sheet form yang dipakai bareng untuk tambah & edit. Field di sini di-reset balik
// ke mode "tambah" setiap sheet ditutup, supaya sisa state edit sebelumnya tidak
// nyangkut ke pemakaian "+" berikutnya.
const SHEET_EDIT_CONFIG = {
    'sheet-add-account': { editField: 'account-edit-uuid', titleEl: 'account-sheet-title', addTitle: 'Tambah Rekening', disableFields: ['account-tipe', 'account-saldo'] },
    'sheet-add-expense': { editField: 'expense-edit-uuid', titleEl: 'expense-sheet-title', addTitle: 'Catat Pengeluaran' },
    'sheet-add-income': { editField: 'income-edit-uuid', titleEl: 'income-sheet-title', addTitle: 'Catat Pemasukan' },
    'sheet-add-budget': { editField: 'budget-edit-mode', titleEl: 'budget-sheet-title', addTitle: 'Atur Anggaran', disableFields: ['budget-kategori'] },
    'sheet-add-savings': { editField: 'savings-edit-uuid', titleEl: 'savings-sheet-title', addTitle: 'Buat Target Tabungan' },
    'sheet-add-todo': { editField: 'todo-edit-uuid', titleEl: 'todo-sheet-title', addTitle: 'Tambah Tugas' },
    'sheet-add-calendar': { editField: 'calendar-edit-uuid', titleEl: 'calendar-sheet-title', addTitle: 'Tambah Jadwal' },
    'sheet-add-shopping-item': { editField: 'shopping-item-edit-id', titleEl: 'shopping-item-sheet-title', addTitle: 'Tambah Barang' },
    'sheet-add-bill': { editField: 'bill-edit-id', titleEl: 'bill-sheet-title', addTitle: 'Tambah Tagihan Rutin' },
    'sheet-add-debt': { editField: 'debt-edit-uuid', titleEl: 'debt-sheet-title', addTitle: 'Tambah Hutang / Piutang', disableFields: ['debt-tipe', 'debt-nominal', 'debt-mulai'] },
    'sheet-add-stock': { editField: 'stock-edit-uuid', titleEl: 'stock-sheet-title', addTitle: 'Tambah Stok Barang', disableFields: ['stock-jumlah'] },
    'sheet-add-inventory': { editField: 'inv-edit-uuid', titleEl: 'inventory-sheet-title', addTitle: 'Tambah Barang Inventaris', disableFields: ['inv-harga', 'inv-tanggal-beli', 'inv-garansi'] },
    'sheet-add-service': { editField: 'service-edit-uuid', titleEl: 'service-sheet-title', addTitle: 'Tambah Jadwal Servis' },
    'sheet-add-document': { editField: 'doc-edit-uuid', titleEl: 'document-sheet-title', addTitle: 'Tambah Dokumen', disableFields: ['doc-jenis'] },
    'sheet-add-note': { editField: 'note-edit-uuid', titleEl: 'note-sheet-title', addTitle: 'Tambah Catatan' }
};

function resetSheetToAddMode(sheetId) {
    const config = SHEET_EDIT_CONFIG[sheetId];
    if (!config) return;
    const editField = document.getElementById(config.editField);
    if (editField) editField.value = '';
    const titleEl = document.getElementById(config.titleEl);
    if (titleEl) titleEl.textContent = config.addTitle;
    (config.disableFields || []).forEach(id => {
        const el = document.getElementById(id);
        if (el) el.disabled = false;
    });
}

function closeSheet(sheetId) {
    document.getElementById(sheetId).classList.remove('show');
    resetSheetToAddMode(sheetId);
}

function closeSheetOnOverlay(event, sheetId) {
    if (event.target.id === sheetId) closeSheet(sheetId);
}

// Sheet detail generik: dipanggil saat item daftar di-tap, tampilkan ringkasan
// dulu baru user pilih Edit atau Hapus dari situ (bukan tombol langsung di daftar).
function openDetailSheet(title, rows, onEdit, onDelete) {
    document.getElementById('detail-sheet-title').textContent = title;
    document.getElementById('detail-sheet-body').innerHTML = rows
        .filter(r => r[1] !== null && r[1] !== undefined && r[1] !== '')
        .map(r => `
            <div class="flex-between mt-md" style="font-size:13px;">
                <span class="text-muted">${r[0]}</span>
                <span style="font-weight:600; text-align:right;">${r[1]}</span>
            </div>
        `).join('');

    const editBtn = document.getElementById('detail-sheet-edit-btn');
    const deleteBtn = document.getElementById('detail-sheet-delete-btn');

    editBtn.style.display = onEdit ? '' : 'none';
    editBtn.onclick = () => { closeSheet('sheet-detail'); if (onEdit) onEdit(); };

    deleteBtn.style.display = onDelete ? '' : 'none';
    deleteBtn.onclick = () => { closeSheet('sheet-detail'); if (onDelete) onDelete(); };

    openSheet('sheet-detail');
}

// ============================================
// AUTH: LOGIN
// ============================================
document.getElementById('form-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('login-error');
    errorEl.classList.remove('show');

    try {
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;

        const res = await apiCall('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });

        state.token = res.data.token;
        state.user = res.data.user;
        localStorage.setItem('token', state.token);
        localStorage.setItem('user', JSON.stringify(state.user));

        afterLogin();

    } catch (err) {
        errorEl.textContent = err.message;
        errorEl.classList.add('show');
    }
});

// ============================================
// AUTH: REGISTER
// ============================================
document.getElementById('form-register').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('register-error');
    errorEl.classList.remove('show');

    try {
        const nama = document.getElementById('register-nama').value;
        const email = document.getElementById('register-email').value;
        const password = document.getElementById('register-password').value;

        await apiCall('/auth/register', {
            method: 'POST',
            body: JSON.stringify({ nama, email, password })
        });

        // Setelah register, langsung login otomatis
        const loginRes = await apiCall('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });

        state.token = loginRes.data.token;
        state.user = loginRes.data.user;
        localStorage.setItem('token', state.token);
        localStorage.setItem('user', JSON.stringify(state.user));

        // Karena baru daftar, arahkan ke halaman hubungkan pasangan
        showPage('page-connect-couple');

    } catch (err) {
        errorEl.textContent = err.message;
        errorEl.classList.add('show');
    }
});

// ============================================
// HUBUNGKAN PASANGAN
// ============================================
document.getElementById('form-invite').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('connect-error');
    const successEl = document.getElementById('connect-success');
    errorEl.classList.remove('show');
    successEl.classList.remove('show');

    try {
        const to_email = document.getElementById('invite-email').value;
        await apiCall('/auth/couple/invite', {
            method: 'POST',
            body: JSON.stringify({ to_email })
        });

        successEl.textContent = `Undangan berhasil dikirim ke ${to_email}`;
        successEl.classList.add('show');

    } catch (err) {
        errorEl.textContent = err.message;
        errorEl.classList.add('show');
    }
});

function skipCoupleConnect() {
    afterLogin();
}

// ============================================
// SETELAH LOGIN BERHASIL
// ============================================
function afterLogin() {
    document.getElementById('bottom-nav').style.display = 'flex';
    navigateTo('page-dashboard');
    updateGreetingHeader();
    checkNotifBadge();
}

function updateGreetingHeader() {
    if (!state.user) return;

    const hour = new Date().getHours();
    const greeting = hour < 11 ? 'Selamat pagi 👋' : hour < 15 ? 'Selamat siang 👋' : hour < 18 ? 'Selamat sore 👋' : 'Selamat malam 👋';

    document.getElementById('greeting-text').textContent = greeting;
    document.getElementById('greeting-nama').textContent = state.user.nama.split(' ')[0];
    document.getElementById('avatar-me').textContent = state.user.nama.charAt(0).toUpperCase();
}

// ============================================
// DASHBOARD
// ============================================
async function loadDashboard() {
    try {
        const res = await apiCall('/dashboard');
        const d = res.data;

        document.getElementById('dash-total-saldo').textContent = formatRupiah(d.total_saldo);
        document.getElementById('dash-pemasukan').textContent = formatRupiah(d.total_pemasukan_bulan_ini);
        document.getElementById('dash-pengeluaran').textContent = formatRupiah(d.total_pengeluaran_bulan_ini);

        // Todos
        const todosEl = document.getElementById('dash-todos');
        if (d.todos_hari_ini.length === 0) {
            todosEl.innerHTML = '<div class="empty-state"><div class="emoji">✅</div><p>Belum ada tugas hari ini</p></div>';
        } else {
            todosEl.innerHTML = d.todos_hari_ini.map(t => `
                <div class="list-item">
                    <div class="list-item-icon" style="background:#F3EFF6;">📋</div>
                    <div class="list-item-body">
                        <div class="list-item-title">${t.judul}</div>
                        <div class="list-item-subtitle">${t.nama_assigned || 'Belum ditugaskan'}</div>
                    </div>
                </div>
            `).join('');
        }

        // Bills
        const billsEl = document.getElementById('dash-bills');
        if (d.tagihan_jatuh_tempo.length === 0) {
            billsEl.innerHTML = '<div class="empty-state"><div class="emoji">🎉</div><p>Tidak ada tagihan mendesak</p></div>';
        } else {
            billsEl.innerHTML = d.tagihan_jatuh_tempo.map(b => `
                <div class="list-item">
                    <div class="list-item-icon" style="background:#FFF3E0;">🧾</div>
                    <div class="list-item-body">
                        <div class="list-item-title">${b.nama_tagihan}</div>
                        <div class="list-item-subtitle">Jatuh tempo tanggal ${b.tanggal_jatuh_tempo}</div>
                    </div>
                    <div class="list-item-value">${formatRupiah(b.nominal)}</div>
                </div>
            `).join('');
        }

        // Savings
        const savingsEl = document.getElementById('dash-savings');
        if (d.target_tabungan.length === 0) {
            savingsEl.innerHTML = '<div class="empty-state"><div class="emoji">🐷</div><p>Belum ada target tabungan</p></div>';
        } else {
            savingsEl.innerHTML = d.target_tabungan.map(s => `
                <div class="card full-width mt-md">
                    <div class="flex-between">
                        <span class="list-item-title">${s.nama_target}</span>
                        <span class="text-muted" style="font-size:12px;">${s.progress_persen || 0}%</span>
                    </div>
                    <div class="progress-track"><div class="progress-fill" style="width:${Math.min(s.progress_persen || 0, 100)}%"></div></div>
                    <div class="text-muted mt-md" style="font-size:12px;">${formatRupiah(s.nominal_terkumpul)} dari ${formatRupiah(s.target_nominal)}</div>
                </div>
            `).join('');
        }

        // Activity
        const activityEl = document.getElementById('dash-activity');
        if (d.aktivitas_pasangan.length === 0) {
            activityEl.innerHTML = '<div class="empty-state"><div class="emoji">💬</div><p>Belum ada aktivitas terbaru</p></div>';
        } else {
            activityEl.innerHTML = d.aktivitas_pasangan.map(a => `
                <div class="list-item">
                    <div class="list-item-icon" style="background:${a.tipe === 'pemasukan' ? '#E6FAF5' : '#FEEBEF'};">${a.tipe === 'pemasukan' ? '💰' : '💸'}</div>
                    <div class="list-item-body">
                        <div class="list-item-title">${a.nama_user} mencatat ${a.tipe}</div>
                        <div class="list-item-subtitle">${KATEGORI_LABELS[a.detail] || SUMBER_LABELS[a.detail] || a.detail || '-'}</div>
                    </div>
                    <div class="list-item-value ${a.tipe === 'pemasukan' ? 'income' : 'expense'}">${formatRupiah(a.nominal)}</div>
                </div>
            `).join('');
        }

    } catch (err) {
        console.error('Gagal memuat dashboard:', err.message);
        if (err.message.includes('pasangan')) {
            showPage('page-connect-couple');
        }
    }
}

// ============================================
// REKENING
// ============================================
async function loadAccounts() {
    try {
        const res = await apiCall('/accounts');
        state.accounts = res.data.accounts;

        const listEl = document.getElementById('accounts-list');
        if (state.accounts.length === 0) {
            listEl.innerHTML = '<div class="empty-state"><div class="emoji">🏦</div><p>Belum ada rekening. Tambah rekening pertama kamu!</p></div>';
            return;
        }

        listEl.innerHTML = state.accounts.map(a => `
            <div class="list-item" onclick="showAccountDetail('${a.uuid}')">
                <div class="list-item-icon" style="background:${a.warna}22;">${TIPE_ICON[a.tipe] || '💼'}</div>
                <div class="list-item-body">
                    <div class="list-item-title">${a.nama_rekening}</div>
                    <div class="list-item-subtitle">${a.nama_bank || a.tipe}</div>
                </div>
                <div class="list-item-value">${formatRupiah(a.saldo_saat_ini)}</div>
            </div>
        `).join('');

    } catch (err) {
        console.error('Gagal memuat rekening:', err.message);
    }
}

function showAccountDetail(uuid) {
    const account = state.accounts.find(a => a.uuid === uuid);
    if (!account) return;

    const rows = [
        ['Tipe', TIPE_ICON[account.tipe] ? account.tipe : account.tipe],
        ['Saldo Saat Ini', formatRupiah(account.saldo_saat_ini)],
        ['Bank', account.nama_bank],
        ['Nomor Rekening', account.nomor_rekening]
    ];

    openDetailSheet(
        account.nama_rekening,
        rows,
        () => editAccount(uuid),
        () => deleteAccount(uuid)
    );
}

function editAccount(uuid) {
    const account = state.accounts.find(a => a.uuid === uuid);
    if (!account) return;

    document.getElementById('account-edit-uuid').value = uuid;
    document.getElementById('account-nama').value = account.nama_rekening;
    document.getElementById('account-tipe').value = account.tipe;
    document.getElementById('account-tipe').disabled = true;
    document.getElementById('account-saldo').value = account.saldo_awal;
    document.getElementById('account-saldo').disabled = true;
    document.getElementById('account-sheet-title').textContent = 'Edit Rekening';
    openSheet('sheet-add-account');
}

async function deleteAccount(uuid) {
    if (!confirm('Hapus rekening ini? Riwayat transaksi yang sudah tercatat tidak akan terhapus.')) return;
    try {
        await apiCall(`/accounts/${uuid}`, { method: 'DELETE' });
        loadAccounts();
        loadDashboard();
    } catch (err) {
        alert(err.message);
    }
}

document.getElementById('form-add-account').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
        const editUuid = document.getElementById('account-edit-uuid').value;

        if (editUuid) {
            await apiCall(`/accounts/${editUuid}`, {
                method: 'PUT',
                body: JSON.stringify({ nama_rekening: document.getElementById('account-nama').value })
            });
        } else {
            await apiCall('/accounts', {
                method: 'POST',
                body: JSON.stringify({
                    nama_rekening: document.getElementById('account-nama').value,
                    tipe: document.getElementById('account-tipe').value,
                    saldo_awal: Number(document.getElementById('account-saldo').value)
                })
            });
        }

        closeSheet('sheet-add-account');
        e.target.reset();
        loadAccounts();

    } catch (err) {
        alert(err.message);
    }
});

// ============================================
// TRANSAKSI (Pengeluaran & Pemasukan)
// ============================================
let activeTransactionTab = 'expense';

function switchTransactionTab(tab) {
    activeTransactionTab = tab;
    document.getElementById('tab-expense').classList.toggle('btn-primary', tab === 'expense');
    document.getElementById('tab-expense').classList.toggle('btn-secondary', tab !== 'expense');
    document.getElementById('tab-income').classList.toggle('btn-primary', tab === 'income');
    document.getElementById('tab-income').classList.toggle('btn-secondary', tab !== 'income');
    loadTransactions();
}

let currentTransactionItems = [];

async function loadTransactions() {
    try {
        const endpoint = activeTransactionTab === 'expense' ? '/expenses' : '/income';
        const res = await apiCall(endpoint);
        const items = res.data.items;
        currentTransactionItems = items;

        const listEl = document.getElementById('transactions-list');
        if (items.length === 0) {
            listEl.innerHTML = '<div class="empty-state"><div class="emoji">📭</div><p>Belum ada transaksi</p></div>';
            return;
        }

        let html = '';
        let lastTanggal = null;
        items.forEach(item => {
            if (item.tanggal !== lastTanggal) {
                html += `<div class="section-header mt-md"><h2>${formatTanggal(item.tanggal)}</h2></div>`;
                lastTanggal = item.tanggal;
            }
            const namaTransaksi = item.catatan || KATEGORI_LABELS[item.kategori] || SUMBER_LABELS[item.sumber] || item.kategori || item.sumber || 'Lainnya';
            const kategoriLabel = KATEGORI_LABELS[item.kategori] || SUMBER_LABELS[item.sumber] || item.kategori || item.sumber || '';
            html += `
                <div class="list-item" onclick="showTransactionDetail('${item.uuid}', '${activeTransactionTab}')">
                    <div class="list-item-icon" style="background:${activeTransactionTab === 'expense' ? '#FEEBEF' : '#E6FAF5'};">
                        ${activeTransactionTab === 'expense' ? '💸' : '💰'}
                    </div>
                    <div class="list-item-body">
                        <div class="list-item-title">${namaTransaksi}</div>
                        <div class="list-item-subtitle">${kategoriLabel}</div>
                    </div>
                    <div class="list-item-value ${activeTransactionTab === 'expense' ? 'expense' : 'income'}">
                        ${activeTransactionTab === 'expense' ? '-' : '+'}${formatRupiah(item.nominal)}
                    </div>
                </div>
            `;
        });
        listEl.innerHTML = html;

    } catch (err) {
        console.error('Gagal memuat transaksi:', err.message);
    }
}

function showTransactionDetail(uuid, tipe) {
    const item = currentTransactionItems.find(i => i.uuid === uuid);
    if (!item) return;

    const kategoriLabel = KATEGORI_LABELS[item.kategori] || SUMBER_LABELS[item.sumber] || item.kategori || item.sumber || '-';
    const rows = [
        ['Keterangan', item.catatan || '-'],
        [tipe === 'expense' ? 'Kategori' : 'Sumber', kategoriLabel],
        ['Nominal', formatRupiah(item.nominal)],
        ['Tanggal', formatTanggal(item.tanggal)],
        ['Rekening', item.nama_rekening || null]
    ];

    openDetailSheet(
        tipe === 'expense' ? 'Detail Pengeluaran' : 'Detail Pemasukan',
        rows,
        () => editTransaction(uuid, tipe),
        () => deleteTransaction(uuid, tipe)
    );
}

function editTransaction(uuid, tipe) {
    const item = currentTransactionItems.find(i => i.uuid === uuid);
    if (!item) return;

    if (tipe === 'expense') {
        document.getElementById('expense-edit-uuid').value = uuid;
        document.getElementById('expense-nominal').value = item.nominal;
        document.getElementById('expense-kategori').value = item.kategori;
        document.getElementById('expense-tanggal').value = item.tanggal;
        document.getElementById('expense-catatan').value = item.catatan || '';
        document.getElementById('expense-sheet-title').textContent = 'Edit Pengeluaran';
        openSheet('sheet-add-expense');
    } else {
        document.getElementById('income-edit-uuid').value = uuid;
        document.getElementById('income-nominal').value = item.nominal;
        document.getElementById('income-sumber').value = item.sumber;
        document.getElementById('income-tanggal').value = item.tanggal;
        document.getElementById('income-catatan').value = item.catatan || '';
        document.getElementById('income-sheet-title').textContent = 'Edit Pemasukan';
        openSheet('sheet-add-income');
    }
}

async function deleteTransaction(uuid, tipe) {
    if (!confirm('Hapus transaksi ini?')) return;
    try {
        const endpoint = tipe === 'expense' ? '/expenses' : '/income';
        await apiCall(`${endpoint}/${uuid}`, { method: 'DELETE' });
        loadTransactions();
        loadDashboard();
        loadAccounts();
    } catch (err) {
        alert(err.message);
    }
}

document.getElementById('form-add-expense').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
        const editUuid = document.getElementById('expense-edit-uuid').value;
        const payload = {
            nominal: Number(document.getElementById('expense-nominal').value),
            kategori: document.getElementById('expense-kategori').value,
            tanggal: document.getElementById('expense-tanggal').value,
            catatan: document.getElementById('expense-catatan').value
        };

        if (editUuid) {
            await apiCall(`/expenses/${editUuid}`, { method: 'PUT', body: JSON.stringify(payload) });
        } else {
            await apiCall('/expenses', { method: 'POST', body: JSON.stringify(payload) });
        }

        closeSheet('sheet-add-expense');
        e.target.reset();
        loadDashboard();
        loadAccounts();
        if (document.getElementById('page-transactions').classList.contains('hidden') === false) loadTransactions();

    } catch (err) {
        alert(err.message);
    }
});

document.getElementById('form-add-income').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
        const editUuid = document.getElementById('income-edit-uuid').value;
        const payload = {
            nominal: Number(document.getElementById('income-nominal').value),
            sumber: document.getElementById('income-sumber').value,
            tanggal: document.getElementById('income-tanggal').value,
            catatan: document.getElementById('income-catatan').value
        };

        if (editUuid) {
            await apiCall(`/income/${editUuid}`, { method: 'PUT', body: JSON.stringify(payload) });
        } else {
            await apiCall('/income', { method: 'POST', body: JSON.stringify(payload) });
        }

        closeSheet('sheet-add-income');
        e.target.reset();
        loadDashboard();
        loadAccounts();
        if (document.getElementById('page-transactions').classList.contains('hidden') === false) loadTransactions();

    } catch (err) {
        alert(err.message);
    }
});

// ============================================
// ANGGARAN
// ============================================
let currentBudgets = [];

async function loadBudgets() {
    try {
        const res = await apiCall('/budgets');
        const budgets = res.data;
        currentBudgets = budgets;

        const listEl = document.getElementById('budgets-list');
        if (budgets.length === 0) {
            listEl.innerHTML = '<div class="empty-state"><div class="emoji">🎯</div><p>Belum ada anggaran bulan ini. Yuk buat target pertama!</p></div>';
            return;
        }

        listEl.innerHTML = budgets.map(b => {
            const barClass = b.status === 'melebihi' ? 'danger' : b.status === 'hampir_habis' ? 'warning' : '';
            return `
                <div class="card full-width mt-md" onclick="showBudgetDetail(${b.id})">
                    <div class="flex-between">
                        <span class="list-item-title">${KATEGORI_LABELS[b.kategori] || b.kategori}</span>
                        <span class="text-muted" style="font-size:12px;">${b.persentase}%</span>
                    </div>
                    <div class="progress-track"><div class="progress-fill ${barClass}" style="width:${Math.min(b.persentase, 100)}%"></div></div>
                    <div class="flex-between mt-md" style="font-size:12px;">
                        <span class="text-muted">${formatRupiah(b.realisasi)} dari ${formatRupiah(b.target_nominal)}</span>
                        <span style="color:${b.sisa < 0 ? 'var(--color-danger)' : 'var(--color-shared)'}; font-weight:600;">
                            ${b.sisa < 0 ? 'Lebih ' + formatRupiah(Math.abs(b.sisa)) : 'Sisa ' + formatRupiah(b.sisa)}
                        </span>
                    </div>
                </div>
            `;
        }).join('');

    } catch (err) {
        console.error('Gagal memuat anggaran:', err.message);
    }
}

function showBudgetDetail(id) {
    const b = currentBudgets.find(x => x.id === id);
    if (!b) return;

    const rows = [
        ['Target / Bulan', formatRupiah(b.target_nominal)],
        ['Realisasi', formatRupiah(b.realisasi)],
        [b.sisa < 0 ? 'Lebih' : 'Sisa', formatRupiah(Math.abs(b.sisa))],
        ['Persentase', `${b.persentase}%`]
    ];

    openDetailSheet(
        KATEGORI_LABELS[b.kategori] || b.kategori,
        rows,
        () => editBudget(b.id, b.kategori, b.target_nominal),
        () => deleteBudget(b.id)
    );
}

function editBudget(id, kategori, targetNominal) {
    document.getElementById('budget-edit-mode').value = 'edit';
    document.getElementById('budget-kategori').value = kategori;
    document.getElementById('budget-kategori').disabled = true;
    document.getElementById('budget-target').value = targetNominal;
    document.getElementById('budget-sheet-title').textContent = 'Edit Anggaran';
    openSheet('sheet-add-budget');
}

async function deleteBudget(id) {
    if (!confirm('Hapus anggaran kategori ini?')) return;
    try {
        await apiCall(`/budgets/${id}`, { method: 'DELETE' });
        loadBudgets();
    } catch (err) {
        alert(err.message);
    }
}

document.getElementById('form-add-budget').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
        const now = new Date();
        await apiCall('/budgets', {
            method: 'POST',
            body: JSON.stringify({
                kategori: document.getElementById('budget-kategori').value,
                target_nominal: Number(document.getElementById('budget-target').value),
                bulan: now.getMonth() + 1,
                tahun: now.getFullYear()
            })
        });

        closeSheet('sheet-add-budget');
        e.target.reset();
        loadBudgets();

    } catch (err) {
        alert(err.message);
    }
});

// ============================================
// TABUNGAN
// ============================================
let currentSavingsGoals = [];

async function loadSavings() {
    try {
        const res = await apiCall('/savings');
        const goals = res.data.filter(g => g.status !== 'cancelled');
        currentSavingsGoals = goals;

        const listEl = document.getElementById('savings-list');
        if (goals.length === 0) {
            listEl.innerHTML = '<div class="empty-state"><div class="emoji">🐷</div><p>Belum ada target tabungan. Yuk buat target pertama!</p></div>';
            return;
        }

        listEl.innerHTML = goals.map(g => {
            const barClass = g.status === 'completed' ? '' : '';
            return `
                <div class="card full-width mt-md" onclick="showSavingsDetail('${g.uuid}')">
                    <div class="flex-between">
                        <span class="list-item-title">${g.status === 'completed' ? '🎉 ' : ''}${g.nama_target}</span>
                        <span class="text-muted" style="font-size:12px;">${g.progress_persen}%</span>
                    </div>
                    <div class="progress-track"><div class="progress-fill" style="width:${Math.min(g.progress_persen, 100)}%"></div></div>
                    <div class="flex-between mt-md" style="font-size:12px;">
                        <span class="text-muted">${formatRupiah(g.nominal_terkumpul)} dari ${formatRupiah(g.target_nominal)}</span>
                        ${g.target_tanggal ? `<span class="text-muted">Target: ${formatTanggal(g.target_tanggal)}</span>` : ''}
                    </div>
                    ${g.status !== 'completed' ? `<button class="btn btn-secondary btn-block mt-md" onclick="event.stopPropagation(); openDepositSheet('${g.uuid}')">+ Setor Tabungan</button>` : ''}
                </div>
            `;
        }).join('');

    } catch (err) {
        console.error('Gagal memuat tabungan:', err.message);
    }
}

function showSavingsDetail(uuid) {
    const goal = currentSavingsGoals.find(g => g.uuid === uuid);
    if (!goal) return;

    const rows = [
        ['Target', formatRupiah(goal.target_nominal)],
        ['Terkumpul', formatRupiah(goal.nominal_terkumpul)],
        ['Progress', `${goal.progress_persen}%`],
        ['Target Tanggal', goal.target_tanggal ? formatTanggal(goal.target_tanggal) : null]
    ];

    openDetailSheet(
        goal.nama_target,
        rows,
        () => editSavings(uuid),
        () => deleteSavings(uuid)
    );
}

function editSavings(uuid) {
    const goal = currentSavingsGoals.find(g => g.uuid === uuid);
    if (!goal) return;

    document.getElementById('savings-edit-uuid').value = uuid;
    document.getElementById('savings-nama').value = goal.nama_target;
    document.getElementById('savings-target').value = goal.target_nominal;
    document.getElementById('savings-tanggal').value = goal.target_tanggal || '';
    document.getElementById('savings-sheet-title').textContent = 'Edit Target Tabungan';
    openSheet('sheet-add-savings');
}

async function deleteSavings(uuid) {
    if (!confirm('Batalkan target tabungan ini?')) return;
    try {
        await apiCall(`/savings/${uuid}`, { method: 'DELETE' });
        loadSavings();
    } catch (err) {
        alert(err.message);
    }
}

function openDepositSheet(goalUuid) {
    document.getElementById('deposit-goal-uuid').value = goalUuid;
    const options = '<option value="">Tidak mengurangi saldo rekening</option>' +
        state.accounts.map(a => `<option value="${a.id}">${a.nama_rekening}</option>`).join('');
    document.getElementById('deposit-account').innerHTML = options;
    openSheet('sheet-deposit-savings');
}

document.getElementById('form-add-savings').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
        const editUuid = document.getElementById('savings-edit-uuid').value;
        const payload = {
            nama_target: document.getElementById('savings-nama').value,
            target_nominal: Number(document.getElementById('savings-target').value),
            target_tanggal: document.getElementById('savings-tanggal').value || null
        };

        if (editUuid) {
            await apiCall(`/savings/${editUuid}`, { method: 'PUT', body: JSON.stringify(payload) });
        } else {
            await apiCall('/savings', { method: 'POST', body: JSON.stringify(payload) });
        }

        closeSheet('sheet-add-savings');
        e.target.reset();
        loadSavings();

    } catch (err) {
        alert(err.message);
    }
});

document.getElementById('form-deposit-savings').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
        const goalUuid = document.getElementById('deposit-goal-uuid').value;
        const accountId = document.getElementById('deposit-account').value;

        const res = await apiCall(`/savings/${goalUuid}/deposit`, {
            method: 'POST',
            body: JSON.stringify({
                nominal: Number(document.getElementById('deposit-nominal').value),
                tanggal: document.getElementById('deposit-tanggal').value,
                account_id: accountId ? Number(accountId) : null
            })
        });

        closeSheet('sheet-deposit-savings');
        e.target.reset();
        if (res.data.tercapai) alert('🎉 Selamat! Target tabungan tercapai!');
        loadSavings();
        loadAccounts();

    } catch (err) {
        alert(err.message);
    }
});

// ============================================
// TO-DO LIST
// ============================================
let activeTodoFilter = '';

function switchTodoFilter(filter) {
    activeTodoFilter = filter;
    document.querySelectorAll('.todo-filter').forEach((btn, idx) => {
        const filters = ['', 'belum', 'selesai'];
        btn.classList.toggle('btn-primary', filters[idx] === filter);
        btn.classList.toggle('btn-secondary', filters[idx] !== filter);
    });
    loadTodos();
}

let currentTodos = [];

async function loadTodos() {
    try {
        const endpoint = activeTodoFilter ? `/todos?status=${activeTodoFilter}` : '/todos';
        const res = await apiCall(endpoint);
        const todos = res.data;
        currentTodos = todos;

        const listEl = document.getElementById('todos-list');
        if (todos.length === 0) {
            listEl.innerHTML = '<div class="empty-state"><div class="emoji">✅</div><p>Tidak ada tugas di sini</p></div>';
            return;
        }

        listEl.innerHTML = todos.map(t => `
            <div class="checklist-item ${t.status === 'selesai' ? 'done' : ''}" onclick="showTodoDetail('${t.uuid}')">
                <div class="checklist-checkbox ${t.status === 'selesai' ? 'checked' : ''}" onclick="event.stopPropagation(); toggleTodoStatus('${t.uuid}', '${t.status}')">
                    ${t.status === 'selesai' ? '✓' : ''}
                </div>
                <div class="list-item-body">
                    <div class="list-item-title">${t.judul}</div>
                    <div class="list-item-subtitle">${t.nama_assigned || 'Belum ditugaskan'}${t.deadline ? ' · ' + formatTanggal(t.deadline) : ''}</div>
                </div>
                <span class="priority-badge ${t.prioritas}">${t.prioritas}</span>
            </div>
        `).join('');

    } catch (err) {
        console.error('Gagal memuat tugas:', err.message);
    }
}

function showTodoDetail(uuid) {
    const todo = currentTodos.find(t => t.uuid === uuid);
    if (!todo) return;

    const rows = [
        ['Status', todo.status === 'selesai' ? 'Selesai' : 'Belum selesai'],
        ['Prioritas', todo.prioritas],
        ['Ditugaskan ke', todo.nama_assigned],
        ['Deadline', todo.deadline ? formatTanggal(todo.deadline) : null],
        ['Deskripsi', todo.deskripsi]
    ];

    openDetailSheet(
        todo.judul,
        rows,
        () => editTodo(uuid),
        () => deleteTodo(uuid)
    );
}

async function deleteTodo(uuid) {
    if (!confirm('Hapus tugas ini?')) return;
    try {
        await apiCall(`/todos/${uuid}`, { method: 'DELETE' });
        loadTodos();
    } catch (err) {
        alert(err.message);
    }
}

async function toggleTodoStatus(uuid, currentStatus) {
    try {
        const newStatus = currentStatus === 'selesai' ? 'belum' : 'selesai';
        await apiCall(`/todos/${uuid}`, {
            method: 'PUT',
            body: JSON.stringify({ status: newStatus })
        });
        loadTodos();
        if (document.getElementById('page-dashboard').classList.contains('hidden') === false) loadDashboard();
    } catch (err) {
        alert(err.message);
    }
}

async function populateTodoAssignedOptions() {
    try {
        const me = await apiCall('/auth/me');
        const options = ['<option value="">Belum ditugaskan</option>', `<option value="${me.data.id}">Saya (${me.data.nama})</option>`];
        if (me.data.pasangan) {
            options.push(`<option value="${me.data.pasangan.id}">${me.data.pasangan.nama}</option>`);
        }
        document.getElementById('todo-assigned').innerHTML = options.join('');
    } catch (err) {
        console.error('Gagal memuat data pasangan:', err.message);
    }
}

async function openTodoSheet() {
    await populateTodoAssignedOptions();
    openSheet('sheet-add-todo');
}

async function editTodo(uuid) {
    const todo = currentTodos.find(t => t.uuid === uuid);
    if (!todo) return;

    await populateTodoAssignedOptions();
    document.getElementById('todo-edit-uuid').value = uuid;
    document.getElementById('todo-judul').value = todo.judul;
    document.getElementById('todo-assigned').value = todo.assigned_to || '';
    document.getElementById('todo-prioritas').value = todo.prioritas;
    document.getElementById('todo-deadline').value = toDatetimeLocalValue(todo.deadline);
    document.getElementById('todo-sheet-title').textContent = 'Edit Tugas';
    openSheet('sheet-add-todo');
}

document.getElementById('form-add-todo').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
        const editUuid = document.getElementById('todo-edit-uuid').value;
        const assignedTo = document.getElementById('todo-assigned').value;
        const payload = {
            judul: document.getElementById('todo-judul').value,
            assigned_to: assignedTo ? Number(assignedTo) : null,
            prioritas: document.getElementById('todo-prioritas').value,
            deadline: document.getElementById('todo-deadline').value || null
        };

        if (editUuid) {
            await apiCall(`/todos/${editUuid}`, { method: 'PUT', body: JSON.stringify(payload) });
        } else {
            await apiCall('/todos', { method: 'POST', body: JSON.stringify(payload) });
        }

        closeSheet('sheet-add-todo');
        e.target.reset();
        loadTodos();

    } catch (err) {
        alert(err.message);
    }
});

// ============================================
// KALENDER
// ============================================
let currentCalendarEvents = [];
const TIPE_ICON_CAL = {
    kerja: '💼', cuti: '🏖️', dokter: '🩺', liburan: '✈️',
    keluarga: '👨‍👩‍👧', ulang_tahun: '🎂', anniversary: '💑', lainnya: '📌'
};

async function loadCalendar() {
    try {
        const res = await apiCall('/calendar?upcoming_limit=30');
        const events = res.data;
        currentCalendarEvents = events;

        const listEl = document.getElementById('calendar-list');
        if (events.length === 0) {
            listEl.innerHTML = '<div class="empty-state"><div class="emoji">📅</div><p>Belum ada jadwal mendatang</p></div>';
            return;
        }

        listEl.innerHTML = events.map(ev => `
            <div class="list-item" onclick="showCalendarDetail('${ev.uuid}')">
                <div class="list-item-icon" style="background:#F3EFF6;">${TIPE_ICON_CAL[ev.tipe] || '📌'}</div>
                <div class="list-item-body">
                    <div class="list-item-title">${ev.judul}</div>
                    <div class="list-item-subtitle">${new Date(ev.tanggal_mulai).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}${ev.lokasi ? ' · ' + ev.lokasi : ''}</div>
                </div>
            </div>
        `).join('');

    } catch (err) {
        console.error('Gagal memuat kalender:', err.message);
    }
}

function showCalendarDetail(uuid) {
    const ev = currentCalendarEvents.find(e => e.uuid === uuid);
    if (!ev) return;

    const rows = [
        ['Tipe', TIPE_ICON_CAL[ev.tipe] ? ev.tipe : ev.tipe],
        ['Waktu', new Date(ev.tanggal_mulai).toLocaleString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })],
        ['Lokasi', ev.lokasi],
        ['Catatan', ev.catatan]
    ];

    openDetailSheet(
        ev.judul,
        rows,
        () => editCalendarEvent(uuid),
        () => deleteCalendarEvent(uuid)
    );
}

function editCalendarEvent(uuid) {
    const ev = currentCalendarEvents.find(e => e.uuid === uuid);
    if (!ev) return;

    document.getElementById('calendar-edit-uuid').value = uuid;
    document.getElementById('calendar-judul').value = ev.judul;
    document.getElementById('calendar-tipe').value = ev.tipe;
    document.getElementById('calendar-mulai').value = toDatetimeLocalValue(ev.tanggal_mulai);
    document.getElementById('calendar-lokasi').value = ev.lokasi || '';
    document.getElementById('calendar-sheet-title').textContent = 'Edit Jadwal';
    openSheet('sheet-add-calendar');
}

async function deleteCalendarEvent(uuid) {
    if (!confirm('Hapus jadwal ini?')) return;
    try {
        await apiCall(`/calendar/${uuid}`, { method: 'DELETE' });
        loadCalendar();
        if (document.getElementById('page-dashboard').classList.contains('hidden') === false) loadDashboard();
    } catch (err) {
        alert(err.message);
    }
}

document.getElementById('form-add-calendar').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
        const editUuid = document.getElementById('calendar-edit-uuid').value;
        const payload = {
            judul: document.getElementById('calendar-judul').value,
            tipe: document.getElementById('calendar-tipe').value,
            tanggal_mulai: document.getElementById('calendar-mulai').value,
            lokasi: document.getElementById('calendar-lokasi').value || null
        };

        if (editUuid) {
            await apiCall(`/calendar/${editUuid}`, { method: 'PUT', body: JSON.stringify(payload) });
        } else {
            await apiCall('/calendar', { method: 'POST', body: JSON.stringify(payload) });
        }

        closeSheet('sheet-add-calendar');
        e.target.reset();
        loadCalendar();
        if (document.getElementById('page-dashboard').classList.contains('hidden') === false) loadDashboard();

    } catch (err) {
        alert(err.message);
    }
});

// ============================================
// SHOPPING LIST
// ============================================
let currentShoppingListUuid = null;

let currentShoppingItems = [];

async function loadShopping() {
    try {
        const res = await apiCall('/shopping/active');
        const list = res.data;
        currentShoppingListUuid = list.uuid;
        currentShoppingItems = list.items;

        document.getElementById('shopping-list-nama').textContent = list.nama_list;

        const summaryEl = document.getElementById('shopping-summary');
        summaryEl.innerHTML = `
            <div class="flex-between">
                <span class="text-muted" style="font-size:13px;">Estimasi Total</span>
                <span class="list-item-title">${formatRupiah(list.total_estimasi)}</span>
            </div>
            <div class="flex-between mt-md" style="font-size:12px;">
                <span class="text-muted">Sudah dibeli</span>
                <span style="color:var(--color-shared); font-weight:600;">${formatRupiah(list.total_terbeli)}</span>
            </div>
        `;

        const itemsEl = document.getElementById('shopping-items-list');
        if (list.items.length === 0) {
            itemsEl.innerHTML = '<div class="empty-state"><div class="emoji">🛒</div><p>Daftar belanja masih kosong</p></div>';
            return;
        }

        itemsEl.innerHTML = list.items.map(item => `
            <div class="checklist-item ${item.checked ? 'done' : ''}" onclick="showShoppingItemDetail(${item.id})">
                <div class="checklist-checkbox ${item.checked ? 'checked' : ''}" onclick="event.stopPropagation(); toggleShoppingItem(${item.id})">
                    ${item.checked ? '✓' : ''}
                </div>
                <div class="list-item-body">
                    <div class="list-item-title">${item.nama_barang}${item.jumlah ? ' (' + item.jumlah + ')' : ''}</div>
                </div>
                ${item.estimasi_harga ? `<div class="list-item-value">${formatRupiah(item.estimasi_harga)}</div>` : ''}
            </div>
        `).join('');

    } catch (err) {
        console.error('Gagal memuat shopping list:', err.message);
    }
}

function showShoppingItemDetail(itemId) {
    const item = currentShoppingItems.find(i => i.id === itemId);
    if (!item) return;

    const rows = [
        ['Jumlah', item.jumlah],
        ['Estimasi Harga', item.estimasi_harga ? formatRupiah(item.estimasi_harga) : null],
        ['Status', item.checked ? 'Sudah dibeli' : 'Belum dibeli']
    ];

    openDetailSheet(
        item.nama_barang,
        rows,
        () => editShoppingItem(itemId),
        () => deleteShoppingItem(itemId)
    );
}

function editShoppingItem(itemId) {
    const item = currentShoppingItems.find(i => i.id === itemId);
    if (!item) return;

    document.getElementById('shopping-item-edit-id').value = itemId;
    document.getElementById('shopping-item-nama').value = item.nama_barang;
    document.getElementById('shopping-item-jumlah').value = item.jumlah || '';
    document.getElementById('shopping-item-harga').value = item.estimasi_harga || '';
    document.getElementById('shopping-item-sheet-title').textContent = 'Edit Barang';
    openSheet('sheet-add-shopping-item');
}

async function toggleShoppingItem(itemId) {
    try {
        await apiCall(`/shopping/items/${itemId}/toggle`, { method: 'PUT' });
        loadShopping();
    } catch (err) {
        alert(err.message);
    }
}

async function deleteShoppingItem(itemId) {
    try {
        await apiCall(`/shopping/items/${itemId}`, { method: 'DELETE' });
        loadShopping();
    } catch (err) {
        alert(err.message);
    }
}

async function completeShoppingList() {
    if (!confirm('Selesaikan belanja ini? Daftar baru akan dibuat otomatis untuk belanja berikutnya.')) return;
    try {
        await apiCall(`/shopping/${currentShoppingListUuid}/complete`, { method: 'POST' });
        loadShopping();
    } catch (err) {
        alert(err.message);
    }
}

document.getElementById('form-add-shopping-item').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
        const editId = document.getElementById('shopping-item-edit-id').value;
        const payload = {
            nama_barang: document.getElementById('shopping-item-nama').value,
            jumlah: document.getElementById('shopping-item-jumlah').value || null,
            estimasi_harga: Number(document.getElementById('shopping-item-harga').value) || 0
        };

        if (editId) {
            await apiCall(`/shopping/items/${editId}`, { method: 'PUT', body: JSON.stringify(payload) });
        } else {
            await apiCall(`/shopping/${currentShoppingListUuid}/items`, { method: 'POST', body: JSON.stringify(payload) });
        }

        closeSheet('sheet-add-shopping-item');
        e.target.reset();
        loadShopping();

    } catch (err) {
        alert(err.message);
    }
});

// ============================================
// TAGIHAN RUTIN
// ============================================
let currentBills = [];

async function loadBills() {
    try {
        const res = await apiCall('/bills');
        const bills = res.data;
        currentBills = bills;

        const listEl = document.getElementById('bills-list');
        if (bills.length === 0) {
            listEl.innerHTML = '<div class="empty-state"><div class="emoji">🧾</div><p>Belum ada tagihan rutin. Tambah tagihan pertama!</p></div>';
            return;
        }

        listEl.innerHTML = bills.map(b => `
            <div class="list-item" onclick="showBillDetail(${b.id})">
                <div class="list-item-icon" style="background:${b.status_bulan_ini === 'sudah_bayar' ? '#E6FAF5' : '#FFF3E0'};">
                    ${b.status_bulan_ini === 'sudah_bayar' ? '✅' : '🧾'}
                </div>
                <div class="list-item-body">
                    <div class="list-item-title">${b.nama_tagihan}</div>
                    <div class="list-item-subtitle">Jatuh tempo tanggal ${b.tanggal_jatuh_tempo} · ${b.status_bulan_ini === 'sudah_bayar' ? 'Sudah dibayar' : 'Belum dibayar'}</div>
                </div>
                ${b.status_bulan_ini !== 'sudah_bayar'
                    ? `<button class="btn btn-secondary" style="width:auto;padding:8px 14px;font-size:12px;" onclick="event.stopPropagation(); openPayBillSheet(${b.id}, ${b.nominal || 0})">Bayar</button>`
                    : `<div class="list-item-value income">${formatRupiah(b.nominal_dibayar)}</div>`
                }
            </div>
        `).join('');

    } catch (err) {
        console.error('Gagal memuat tagihan:', err.message);
    }
}

function showBillDetail(billId) {
    const bill = currentBills.find(b => b.id === billId);
    if (!bill) return;

    const rows = [
        ['Nominal', bill.nominal ? formatRupiah(bill.nominal) : 'Berubah tiap bulan'],
        ['Jatuh Tempo', `Tanggal ${bill.tanggal_jatuh_tempo}`],
        ['Pengingat', `${bill.pengingat_hari_sebelum} hari sebelumnya`],
        ['Status Bulan Ini', bill.status_bulan_ini === 'sudah_bayar' ? 'Sudah dibayar' : 'Belum dibayar']
    ];

    openDetailSheet(
        bill.nama_tagihan,
        rows,
        () => editBill(billId),
        () => deleteBill(billId)
    );
}

function editBill(billId) {
    const bill = currentBills.find(b => b.id === billId);
    if (!bill) return;

    document.getElementById('bill-edit-id').value = billId;
    document.getElementById('bill-nama').value = bill.nama_tagihan;
    document.getElementById('bill-nominal').value = bill.nominal || '';
    document.getElementById('bill-tanggal').value = bill.tanggal_jatuh_tempo;
    document.getElementById('bill-reminder').value = bill.pengingat_hari_sebelum;
    document.getElementById('bill-sheet-title').textContent = 'Edit Tagihan Rutin';
    openSheet('sheet-add-bill');
}

async function deleteBill(billId) {
    if (!confirm('Hapus tagihan rutin ini?')) return;
    try {
        await apiCall(`/bills/${billId}`, { method: 'DELETE' });
        loadBills();
    } catch (err) {
        alert(err.message);
    }
}

function openPayBillSheet(billId, nominalDefault) {
    document.getElementById('pay-bill-id').value = billId;
    document.getElementById('pay-bill-nominal').value = nominalDefault || '';
    const options = '<option value="">Tidak mengurangi saldo rekening</option>' +
        state.accounts.map(a => `<option value="${a.id}">${a.nama_rekening}</option>`).join('');
    document.getElementById('pay-bill-account').innerHTML = options;
    openSheet('sheet-pay-bill');
}

document.getElementById('form-add-bill').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
        const editId = document.getElementById('bill-edit-id').value;
        const payload = {
            nama_tagihan: document.getElementById('bill-nama').value,
            nominal: Number(document.getElementById('bill-nominal').value) || null,
            tanggal_jatuh_tempo: Number(document.getElementById('bill-tanggal').value),
            pengingat_hari_sebelum: Number(document.getElementById('bill-reminder').value) || 3
        };

        if (editId) {
            await apiCall(`/bills/${editId}`, { method: 'PUT', body: JSON.stringify(payload) });
        } else {
            await apiCall('/bills', { method: 'POST', body: JSON.stringify(payload) });
        }

        closeSheet('sheet-add-bill');
        e.target.reset();
        loadBills();

    } catch (err) {
        alert(err.message);
    }
});

document.getElementById('form-pay-bill').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
        const billId = document.getElementById('pay-bill-id').value;
        const accountId = document.getElementById('pay-bill-account').value;

        await apiCall(`/bills/${billId}/pay`, {
            method: 'POST',
            body: JSON.stringify({
                nominal: Number(document.getElementById('pay-bill-nominal').value),
                tanggal_bayar: document.getElementById('pay-bill-tanggal').value,
                account_id: accountId ? Number(accountId) : null
            })
        });

        closeSheet('sheet-pay-bill');
        e.target.reset();
        loadBills();
        loadAccounts();
        if (document.getElementById('page-dashboard').classList.contains('hidden') === false) loadDashboard();

    } catch (err) {
        alert(err.message);
    }
});

// ============================================
// HUTANG & PIUTANG
// ============================================
let activeDebtFilter = '';

function switchDebtFilter(filter) {
    activeDebtFilter = filter;
    document.querySelectorAll('.debt-filter').forEach((btn, idx) => {
        const filters = ['', 'hutang', 'piutang'];
        btn.classList.toggle('btn-primary', filters[idx] === filter);
        btn.classList.toggle('btn-secondary', filters[idx] !== filter);
    });
    loadDebts();
}

let currentDebts = [];

async function loadDebts() {
    try {
        const endpoint = activeDebtFilter ? `/debts?tipe=${activeDebtFilter}` : '/debts';
        const res = await apiCall(endpoint);
        const debts = res.data;
        currentDebts = debts;

        const listEl = document.getElementById('debts-list');
        if (debts.length === 0) {
            listEl.innerHTML = '<div class="empty-state"><div class="emoji">💳</div><p>Belum ada catatan hutang/piutang</p></div>';
            return;
        }

        listEl.innerHTML = debts.map(d => `
            <div class="card full-width mt-md" onclick="showDebtDetail('${d.uuid}')">
                <div class="flex-between">
                    <span class="list-item-title">${d.tipe === 'hutang' ? '📤' : '📥'} ${d.nama_pihak}</span>
                    <span class="priority-badge ${d.status === 'lunas' ? 'rendah' : 'tinggi'}">${d.status === 'lunas' ? 'Lunas' : 'Berjalan'}</span>
                </div>
                <div class="progress-track"><div class="progress-fill" style="width:${Math.min(d.persentase_terbayar, 100)}%"></div></div>
                <div class="flex-between mt-md" style="font-size:12px;">
                    <span class="text-muted">${formatRupiah(d.nominal_terbayar)} dari ${formatRupiah(d.nominal_total)}</span>
                    <span style="font-weight:600;">Sisa ${formatRupiah(d.sisa)}</span>
                </div>
                ${d.jatuh_tempo ? `<div class="text-muted mt-md" style="font-size:12px;">Jatuh tempo: ${formatTanggal(d.jatuh_tempo)}</div>` : ''}
                ${d.status !== 'lunas' ? `<button class="btn btn-secondary btn-block mt-md" onclick="event.stopPropagation(); openPayDebtSheet('${d.uuid}', '${d.tipe}', '${d.nama_pihak.replace(/'/g, "\\'")}')">+ Catat Pembayaran</button>` : ''}
            </div>
        `).join('');

    } catch (err) {
        console.error('Gagal memuat hutang/piutang:', err.message);
    }
}

function showDebtDetail(uuid) {
    const debt = currentDebts.find(d => d.uuid === uuid);
    if (!debt) return;

    const rows = [
        ['Tipe', debt.tipe === 'hutang' ? 'Hutang' : 'Piutang'],
        ['Total', formatRupiah(debt.nominal_total)],
        ['Terbayar', formatRupiah(debt.nominal_terbayar)],
        ['Sisa', formatRupiah(debt.sisa)],
        ['Tanggal Mulai', formatTanggal(debt.tanggal_mulai)],
        ['Jatuh Tempo', debt.jatuh_tempo ? formatTanggal(debt.jatuh_tempo) : null],
        ['Catatan', debt.catatan]
    ];

    openDetailSheet(
        debt.nama_pihak,
        rows,
        () => editDebt(uuid),
        () => deleteDebt(uuid)
    );
}

function editDebt(uuid) {
    const debt = currentDebts.find(d => d.uuid === uuid);
    if (!debt) return;

    document.getElementById('debt-edit-uuid').value = uuid;
    document.getElementById('debt-tipe').value = debt.tipe;
    document.getElementById('debt-tipe').disabled = true;
    document.getElementById('debt-pihak').value = debt.nama_pihak;
    document.getElementById('debt-nominal').value = debt.nominal_total;
    document.getElementById('debt-nominal').disabled = true;
    document.getElementById('debt-mulai').value = debt.tanggal_mulai;
    document.getElementById('debt-mulai').disabled = true;
    document.getElementById('debt-jatuh-tempo').value = debt.jatuh_tempo || '';
    document.getElementById('debt-catatan').value = debt.catatan || '';
    document.getElementById('debt-sheet-title').textContent = 'Edit Hutang / Piutang';
    openSheet('sheet-add-debt');
}

async function deleteDebt(uuid) {
    if (!confirm('Hapus catatan hutang/piutang ini beserta riwayat pembayarannya?')) return;
    try {
        await apiCall(`/debts/${uuid}`, { method: 'DELETE' });
        loadDebts();
    } catch (err) {
        alert(err.message);
    }
}

function openPayDebtSheet(debtUuid, tipe, namaPihak) {
    document.getElementById('pay-debt-uuid').value = debtUuid;
    document.getElementById('pay-debt-title').textContent = tipe === 'hutang' ? `Bayar Hutang ke ${namaPihak}` : `Terima Pembayaran dari ${namaPihak}`;
    document.getElementById('pay-debt-account-label').textContent = tipe === 'hutang' ? 'Bayar dari Rekening (opsional)' : 'Masuk ke Rekening (opsional)';

    const options = '<option value="">Tidak melibatkan rekening</option>' +
        state.accounts.map(a => `<option value="${a.id}">${a.nama_rekening}</option>`).join('');
    document.getElementById('pay-debt-account').innerHTML = options;
    openSheet('sheet-pay-debt');
}

document.getElementById('form-add-debt').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
        const editUuid = document.getElementById('debt-edit-uuid').value;

        if (editUuid) {
            await apiCall(`/debts/${editUuid}`, {
                method: 'PUT',
                body: JSON.stringify({
                    nama_pihak: document.getElementById('debt-pihak').value,
                    jatuh_tempo: document.getElementById('debt-jatuh-tempo').value || null,
                    catatan: document.getElementById('debt-catatan').value || null
                })
            });
        } else {
            await apiCall('/debts', {
                method: 'POST',
                body: JSON.stringify({
                    tipe: document.getElementById('debt-tipe').value,
                    nama_pihak: document.getElementById('debt-pihak').value,
                    nominal_total: Number(document.getElementById('debt-nominal').value),
                    tanggal_mulai: document.getElementById('debt-mulai').value,
                    jatuh_tempo: document.getElementById('debt-jatuh-tempo').value || null,
                    catatan: document.getElementById('debt-catatan').value || null
                })
            });
        }

        closeSheet('sheet-add-debt');
        e.target.reset();
        loadDebts();

    } catch (err) {
        alert(err.message);
    }
});

document.getElementById('form-pay-debt').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
        const debtUuid = document.getElementById('pay-debt-uuid').value;
        const accountId = document.getElementById('pay-debt-account').value;

        const res = await apiCall(`/debts/${debtUuid}/payment`, {
            method: 'POST',
            body: JSON.stringify({
                nominal: Number(document.getElementById('pay-debt-nominal').value),
                tanggal: document.getElementById('pay-debt-tanggal').value,
                account_id: accountId ? Number(accountId) : null
            })
        });

        closeSheet('sheet-pay-debt');
        e.target.reset();
        if (res.data.lunas) alert('🎉 Lunas!');
        loadDebts();
        loadAccounts();

    } catch (err) {
        alert(err.message);
    }
});

// ============================================
// TRANSFER ANTAR REKENING
// ============================================
function openTransferSheet() {
    const options = state.accounts.map(a => `<option value="${a.id}">${a.nama_rekening}</option>`).join('');
    document.getElementById('transfer-from').innerHTML = options;
    document.getElementById('transfer-to').innerHTML = options;
    openSheet('sheet-transfer');
}

let currentTransfers = [];

async function loadTransfers() {
    try {
        const res = await apiCall('/transfers');
        const transfers = res.data;
        currentTransfers = transfers;

        const listEl = document.getElementById('transfers-list');
        if (transfers.length === 0) {
            listEl.innerHTML = '<div class="empty-state"><div class="emoji">⇄</div><p>Belum ada riwayat transfer</p></div>';
            return;
        }

        listEl.innerHTML = transfers.map(t => `
            <div class="list-item" onclick="showTransferDetail('${t.uuid}')">
                <div class="list-item-icon" style="background:#F3EFF6;">⇄</div>
                <div class="list-item-body">
                    <div class="list-item-title">${t.nama_dari} → ${t.nama_ke}</div>
                    <div class="list-item-subtitle">${t.nama_user} · ${formatTanggal(t.tanggal)}</div>
                </div>
                <div class="list-item-value">${formatRupiah(t.nominal)}</div>
            </div>
        `).join('');

    } catch (err) {
        console.error('Gagal memuat transfer:', err.message);
    }
}

function showTransferDetail(uuid) {
    const t = currentTransfers.find(x => x.uuid === uuid);
    if (!t) return;

    const rows = [
        ['Dari', t.nama_dari],
        ['Ke', t.nama_ke],
        ['Nominal', formatRupiah(t.nominal)],
        ['Tanggal', formatTanggal(t.tanggal)],
        ['Oleh', t.nama_user],
        ['Catatan', t.catatan]
    ];

    openDetailSheet(
        `${t.nama_dari} → ${t.nama_ke}`,
        rows,
        null,
        () => deleteTransfer(uuid)
    );
}

async function deleteTransfer(uuid) {
    if (!confirm('Batalkan transfer ini? Saldo kedua rekening akan dikembalikan seperti semula.')) return;
    try {
        await apiCall(`/transfers/${uuid}`, { method: 'DELETE' });
        loadTransfers();
        loadAccounts();
    } catch (err) {
        alert(err.message);
    }
}

document.getElementById('form-transfer').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
        const fromId = document.getElementById('transfer-from').value;
        const toId = document.getElementById('transfer-to').value;

        if (fromId === toId) {
            alert('Rekening asal dan tujuan tidak boleh sama');
            return;
        }

        await apiCall('/transfers', {
            method: 'POST',
            body: JSON.stringify({
                from_account_id: Number(fromId),
                to_account_id: Number(toId),
                nominal: Number(document.getElementById('transfer-nominal').value),
                tanggal: document.getElementById('transfer-tanggal').value,
                catatan: document.getElementById('transfer-catatan').value || null
            })
        });

        closeSheet('sheet-transfer');
        e.target.reset();
        loadAccounts();
        if (document.getElementById('page-transfers').classList.contains('hidden') === false) loadTransfers();

    } catch (err) {
        alert(err.message);
    }
});

// ============================================
// LAPORAN KEUANGAN
// ============================================
let cashflowChartInstance = null;
let expenseCategoryChartInstance = null;

async function loadReports() {
    try {
        const [overviewRes, cashflowRes, breakdownRes, analysisRes] = await Promise.all([
            apiCall('/reports/overview'),
            apiCall('/reports/cashflow?months=6'),
            apiCall('/reports/expense-breakdown'),
            apiCall('/reports/analysis')
        ]);

        const overview = overviewRes.data;
        document.getElementById('report-pemasukan').textContent = formatRupiah(overview.pemasukan_bulan_ini);
        document.getElementById('report-pengeluaran').textContent = formatRupiah(overview.pengeluaran_bulan_ini);

        renderChangeIndicator('report-pemasukan-change', overview.perubahan_pemasukan_persen, true);
        renderChangeIndicator('report-pengeluaran-change', overview.perubahan_pengeluaran_persen, false);

        // Chart.js dimuat dari CDN eksternal — kalau gagal dimuat/render, jangan sampai
        // bagian laporan lain (breakdown, analisis) ikut kosong karena exception di sini.
        try {
            renderCashflowChart(cashflowRes.data);
            renderExpenseCategoryChart(breakdownRes.data);
        } catch (chartErr) {
            console.error('Gagal render chart:', chartErr.message);
        }

        const breakdownListEl = document.getElementById('expense-breakdown-list');
        if (breakdownRes.data.length === 0) {
            breakdownListEl.innerHTML = '<div class="empty-state"><div class="emoji">📊</div><p>Belum ada pengeluaran bulan ini</p></div>';
        } else {
            breakdownListEl.innerHTML = breakdownRes.data.map(d => `
                <div class="list-item">
                    <div class="list-item-body">
                        <div class="list-item-title">${KATEGORI_LABELS[d.kategori] || d.kategori}</div>
                        <div class="list-item-subtitle">${d.jumlah_transaksi} transaksi · ${d.persentase}%</div>
                    </div>
                    <div class="list-item-value expense">${formatRupiah(d.total)}</div>
                </div>
            `).join('');
        }

        const analysis = analysisRes.data;
        const TREN_LABEL = { naik: '↑ Naik', turun: '↓ Turun', stabil: '→ Stabil' };
        document.getElementById('analysis-rasio-cicilan').textContent = `${analysis.rasio_cicilan_persen}%`;
        document.getElementById('analysis-tren').textContent = TREN_LABEL[analysis.tren_pengeluaran] || analysis.tren_pengeluaran;
        document.getElementById('analysis-rata-rata').textContent = formatRupiah(analysis.rata_rata_pengeluaran_bulanan);
        document.getElementById('analysis-estimasi-saldo').textContent = formatRupiah(analysis.estimasi_saldo_akhir_bulan);
        document.getElementById('analysis-hari-tersisa').textContent = `${analysis.hari_tersisa_bulan_ini} hari tersisa bulan ini`;

    } catch (err) {
        console.error('Gagal memuat laporan:', err.message);
    }
}

function renderChangeIndicator(elId, persen, isIncomeMetric) {
    const el = document.getElementById(elId);
    const naik = persen > 0;
    // Untuk pemasukan, naik itu bagus (hijau). Untuk pengeluaran, naik itu kurang ideal (merah).
    const warnaBaik = isIncomeMetric ? naik : !naik;
    const warna = persen === 0 ? 'var(--color-text-muted)' : (warnaBaik ? 'var(--color-shared)' : 'var(--color-danger)');
    const panah = persen === 0 ? '' : (naik ? '↑' : '↓');
    el.style.color = warna;
    el.textContent = `${panah} ${Math.abs(persen)}% dari bulan lalu`;
}

function renderCashflowChart(data) {
    const ctx = document.getElementById('chart-cashflow');
    if (cashflowChartInstance) cashflowChartInstance.destroy();

    cashflowChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.map(d => d.label),
            datasets: [
                {
                    label: 'Pemasukan',
                    data: data.map(d => d.pemasukan),
                    backgroundColor: '#6C5CE7',
                    borderRadius: 6
                },
                {
                    label: 'Pengeluaran',
                    data: data.map(d => d.pengeluaran),
                    backgroundColor: '#FF7F6B',
                    borderRadius: 6
                }
            ]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { position: 'bottom', labels: { font: { family: 'Plus Jakarta Sans', size: 11 } } }
            },
            scales: {
                y: { ticks: { callback: (v) => 'Rp' + (v / 1000) + 'rb', font: { size: 10 } } },
                x: { ticks: { font: { size: 10 } } }
            }
        }
    });
}

function renderExpenseCategoryChart(data) {
    const ctx = document.getElementById('chart-expense-category');
    if (expenseCategoryChartInstance) expenseCategoryChartInstance.destroy();

    if (data.length === 0) {
        ctx.getContext('2d').clearRect(0, 0, ctx.width, ctx.height);
        return;
    }

    const palet = ['#6C5CE7', '#FF7F6B', '#1EC9A5', '#FFB84D', '#A29BFE', '#FFB4A6', '#F0506E', '#74B9FF'];

    expenseCategoryChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: data.map(d => KATEGORI_LABELS[d.kategori] || d.kategori),
            datasets: [{
                data: data.map(d => d.total),
                backgroundColor: data.map((_, i) => palet[i % palet.length]),
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { position: 'bottom', labels: { font: { family: 'Plus Jakarta Sans', size: 10 }, boxWidth: 12 } }
            }
        }
    });
}

// ============================================
// STOK RUMAH
// ============================================
let currentStockItems = [];

async function loadStock() {
    try {
        const res = await apiCall('/stock');
        const items = res.data;
        currentStockItems = items;

        const listEl = document.getElementById('stock-list');
        if (items.length === 0) {
            listEl.innerHTML = '<div class="empty-state"><div class="emoji">📦</div><p>Belum ada barang yang dicatat</p></div>';
            return;
        }

        listEl.innerHTML = items.map(i => `
            <div class="list-item" onclick="showStockDetail('${i.uuid}')">
                <div class="list-item-icon" style="background:${i.is_low ? '#FEEBEF' : '#F3EFF6'};">${i.is_low ? '⚠️' : '📦'}</div>
                <div class="list-item-body">
                    <div class="list-item-title">${i.nama_barang}</div>
                    <div class="list-item-subtitle">${i.jumlah_saat_ini} ${i.satuan || ''} ${i.is_low ? '· Stok menipis!' : ''}</div>
                </div>
                <div class="flex gap-sm">
                    <button class="btn-icon" style="width:32px;height:32px;font-size:16px;" onclick="event.stopPropagation(); adjustStock('${i.uuid}', -1)">−</button>
                    <button class="btn-icon" style="width:32px;height:32px;font-size:16px;" onclick="event.stopPropagation(); adjustStock('${i.uuid}', 1)">＋</button>
                </div>
            </div>
        `).join('');

    } catch (err) {
        console.error('Gagal memuat stok:', err.message);
    }
}

function showStockDetail(uuid) {
    const item = currentStockItems.find(i => i.uuid === uuid);
    if (!item) return;

    const rows = [
        ['Jumlah', `${item.jumlah_saat_ini} ${item.satuan || ''}`],
        ['Ambang Batas Minimum', `${item.ambang_batas_minimum} ${item.satuan || ''}`],
        ['Status', item.is_low ? 'Stok menipis' : 'Cukup']
    ];

    openDetailSheet(
        item.nama_barang,
        rows,
        () => editStock(uuid),
        () => deleteStock(uuid)
    );
}

async function adjustStock(uuid, delta) {
    try {
        await apiCall(`/stock/${uuid}/adjust`, { method: 'PUT', body: JSON.stringify({ delta }) });
        loadStock();
    } catch (err) {
        alert(err.message);
    }
}

function editStock(uuid) {
    const item = currentStockItems.find(i => i.uuid === uuid);
    if (!item) return;

    document.getElementById('stock-edit-uuid').value = uuid;
    document.getElementById('stock-nama').value = item.nama_barang;
    document.getElementById('stock-jumlah').value = item.jumlah_saat_ini;
    document.getElementById('stock-jumlah').disabled = true;
    document.getElementById('stock-satuan').value = item.satuan || '';
    document.getElementById('stock-ambang').value = item.ambang_batas_minimum;
    document.getElementById('stock-sheet-title').textContent = 'Edit Stok Barang';
    openSheet('sheet-add-stock');
}

async function deleteStock(uuid) {
    if (!confirm('Hapus barang stok ini?')) return;
    try {
        await apiCall(`/stock/${uuid}`, { method: 'DELETE' });
        loadStock();
    } catch (err) {
        alert(err.message);
    }
}

document.getElementById('form-add-stock').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
        const editUuid = document.getElementById('stock-edit-uuid').value;
        const payload = {
            nama_barang: document.getElementById('stock-nama').value,
            jumlah_saat_ini: Number(document.getElementById('stock-jumlah').value) || 0,
            satuan: document.getElementById('stock-satuan').value || null,
            ambang_batas_minimum: Number(document.getElementById('stock-ambang').value) || 0
        };

        if (editUuid) {
            await apiCall(`/stock/${editUuid}`, { method: 'PUT', body: JSON.stringify(payload) });
        } else {
            await apiCall('/stock', { method: 'POST', body: JSON.stringify(payload) });
        }

        closeSheet('sheet-add-stock');
        e.target.reset();
        loadStock();
    } catch (err) {
        alert(err.message);
    }
});

// ============================================
// INVENTARIS RUMAH
// ============================================
let currentInventoryItems = [];

async function loadInventory() {
    try {
        const res = await apiCall('/inventory');
        const items = res.data;
        currentInventoryItems = items;

        const listEl = document.getElementById('inventory-list');
        if (items.length === 0) {
            listEl.innerHTML = '<div class="empty-state"><div class="emoji">🛋️</div><p>Belum ada barang inventaris</p></div>';
            return;
        }

        listEl.innerHTML = items.map(i => `
            <div class="list-item" onclick="showInventoryDetail('${i.uuid}')">
                <div class="list-item-icon" style="background:#F3EFF6;">🛋️</div>
                <div class="list-item-body">
                    <div class="list-item-title">${i.nama_barang}</div>
                    <div class="list-item-subtitle">${i.lokasi || '-'} ${i.harga_beli ? '· ' + formatRupiah(i.harga_beli) : ''}</div>
                </div>
                ${i.garansi_sampai ? `<span class="priority-badge ${i.garansi_masih_berlaku ? 'rendah' : 'tinggi'}">${i.garansi_masih_berlaku ? 'Garansi aktif' : 'Garansi habis'}</span>` : ''}
            </div>
        `).join('');

    } catch (err) {
        console.error('Gagal memuat inventaris:', err.message);
    }
}

function showInventoryDetail(uuid) {
    const item = currentInventoryItems.find(i => i.uuid === uuid);
    if (!item) return;

    const rows = [
        ['Lokasi', item.lokasi],
        ['Harga Beli', item.harga_beli ? formatRupiah(item.harga_beli) : null],
        ['Tanggal Beli', item.tanggal_beli ? formatTanggal(item.tanggal_beli) : null],
        ['Garansi Sampai', item.garansi_sampai ? formatTanggal(item.garansi_sampai) : null]
    ];

    openDetailSheet(
        item.nama_barang,
        rows,
        () => editInventory(uuid),
        () => deleteInventory(uuid)
    );
}

function editInventory(uuid) {
    const item = currentInventoryItems.find(i => i.uuid === uuid);
    if (!item) return;

    document.getElementById('inv-edit-uuid').value = uuid;
    document.getElementById('inv-nama').value = item.nama_barang;
    document.getElementById('inv-lokasi').value = item.lokasi || '';
    document.getElementById('inv-harga').value = item.harga_beli || '';
    document.getElementById('inv-harga').disabled = true;
    document.getElementById('inv-tanggal-beli').value = item.tanggal_beli || '';
    document.getElementById('inv-tanggal-beli').disabled = true;
    document.getElementById('inv-garansi').value = item.garansi_sampai || '';
    document.getElementById('inv-garansi').disabled = true;
    document.getElementById('inventory-sheet-title').textContent = 'Edit Barang Inventaris';
    openSheet('sheet-add-inventory');
}

async function deleteInventory(uuid) {
    if (!confirm('Hapus barang inventaris ini?')) return;
    try {
        await apiCall(`/inventory/${uuid}`, { method: 'DELETE' });
        loadInventory();
    } catch (err) {
        alert(err.message);
    }
}

document.getElementById('form-add-inventory').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
        const editUuid = document.getElementById('inv-edit-uuid').value;
        const payload = {
            nama_barang: document.getElementById('inv-nama').value,
            lokasi: document.getElementById('inv-lokasi').value || null,
            harga_beli: Number(document.getElementById('inv-harga').value) || null,
            tanggal_beli: document.getElementById('inv-tanggal-beli').value || null,
            garansi_sampai: document.getElementById('inv-garansi').value || null
        };

        if (editUuid) {
            await apiCall(`/inventory/${editUuid}`, { method: 'PUT', body: JSON.stringify(payload) });
        } else {
            await apiCall('/inventory', { method: 'POST', body: JSON.stringify(payload) });
        }

        closeSheet('sheet-add-inventory');
        e.target.reset();
        loadInventory();
    } catch (err) {
        alert(err.message);
    }
});

// ============================================
// JADWAL SERVIS
// ============================================
let currentServices = [];

async function loadServices() {
    try {
        const res = await apiCall('/services');
        const items = res.data;
        currentServices = items;

        const listEl = document.getElementById('services-list');
        if (items.length === 0) {
            listEl.innerHTML = '<div class="empty-state"><div class="emoji">🔧</div><p>Belum ada jadwal servis</p></div>';
            return;
        }

        listEl.innerHTML = items.map(i => `
            <div class="list-item" onclick="showServiceDetail('${i.uuid}')">
                <div class="list-item-icon" style="background:${i.sudah_lewat ? '#FEEBEF' : '#F3EFF6'};">🔧</div>
                <div class="list-item-body">
                    <div class="list-item-title">${i.nama_item}${i.jenis_servis ? ' — ' + i.jenis_servis : ''}</div>
                    <div class="list-item-subtitle">${i.tanggal_servis_berikutnya ? 'Berikutnya: ' + formatTanggal(i.tanggal_servis_berikutnya) : 'Belum dijadwalkan'}</div>
                </div>
                <button class="btn btn-secondary" style="width:auto;padding:8px 12px;font-size:12px;" onclick="event.stopPropagation(); markServiceDone('${i.uuid}')">Selesai</button>
            </div>
        `).join('');

    } catch (err) {
        console.error('Gagal memuat jadwal servis:', err.message);
    }
}

function showServiceDetail(uuid) {
    const item = currentServices.find(i => i.uuid === uuid);
    if (!item) return;

    const rows = [
        ['Jenis Servis', item.jenis_servis],
        ['Servis Terakhir', item.tanggal_servis_terakhir ? formatTanggal(item.tanggal_servis_terakhir) : null],
        ['Servis Berikutnya', item.tanggal_servis_berikutnya ? formatTanggal(item.tanggal_servis_berikutnya) : null],
        ['Interval', item.interval_hari ? `${item.interval_hari} hari` : null]
    ];

    openDetailSheet(
        item.nama_item,
        rows,
        () => editService(uuid),
        () => deleteService(uuid)
    );
}

async function markServiceDone(uuid) {
    try {
        await apiCall(`/services/${uuid}/done`, { method: 'PUT', body: JSON.stringify({}) });
        loadServices();
    } catch (err) {
        alert(err.message);
    }
}

function editService(uuid) {
    const item = currentServices.find(i => i.uuid === uuid);
    if (!item) return;

    document.getElementById('service-edit-uuid').value = uuid;
    document.getElementById('service-nama').value = item.nama_item;
    document.getElementById('service-jenis').value = item.jenis_servis || '';
    document.getElementById('service-terakhir').value = item.tanggal_servis_terakhir || '';
    document.getElementById('service-interval').value = item.interval_hari || '';
    document.getElementById('service-sheet-title').textContent = 'Edit Jadwal Servis';
    openSheet('sheet-add-service');
}

async function deleteService(uuid) {
    if (!confirm('Hapus jadwal servis ini?')) return;
    try {
        await apiCall(`/services/${uuid}`, { method: 'DELETE' });
        loadServices();
    } catch (err) {
        alert(err.message);
    }
}

document.getElementById('form-add-service').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
        const editUuid = document.getElementById('service-edit-uuid').value;
        const payload = {
            nama_item: document.getElementById('service-nama').value,
            jenis_servis: document.getElementById('service-jenis').value || null,
            tanggal_servis_terakhir: document.getElementById('service-terakhir').value || null,
            interval_hari: Number(document.getElementById('service-interval').value) || null
        };

        if (editUuid) {
            await apiCall(`/services/${editUuid}`, { method: 'PUT', body: JSON.stringify(payload) });
        } else {
            await apiCall('/services', { method: 'POST', body: JSON.stringify(payload) });
        }

        closeSheet('sheet-add-service');
        e.target.reset();
        loadServices();
    } catch (err) {
        alert(err.message);
    }
});

// ============================================
// DOKUMEN PENTING
// ============================================
const JENIS_DOKUMEN_LABEL = { ktp: 'KTP', kk: 'KK', npwp: 'NPWP', bpjs: 'BPJS', sim: 'SIM', stnk: 'STNK', bpkb: 'BPKB', sertifikat: 'Sertifikat', polis: 'Polis Asuransi', lainnya: 'Lainnya' };

let currentDocuments = [];

async function loadDocuments() {
    try {
        const res = await apiCall('/documents');
        const items = res.data;
        currentDocuments = items;

        const listEl = document.getElementById('documents-list');
        if (items.length === 0) {
            listEl.innerHTML = '<div class="empty-state"><div class="emoji">📄</div><p>Belum ada dokumen tersimpan</p></div>';
            return;
        }

        listEl.innerHTML = items.map(i => `
            <div class="list-item" onclick="showDocumentDetail('${i.uuid}')">
                <div class="list-item-icon" style="background:${i.sudah_kedaluwarsa ? '#FEEBEF' : i.akan_kedaluwarsa ? '#FFF3E0' : '#F3EFF6'};">📄</div>
                <div class="list-item-body">
                    <div class="list-item-title">${i.nama_dokumen}</div>
                    <div class="list-item-subtitle">${JENIS_DOKUMEN_LABEL[i.jenis_dokumen] || i.jenis_dokumen}${i.berlaku_sampai ? ' · Berlaku sampai ' + formatTanggal(i.berlaku_sampai) : ''}</div>
                </div>
                ${i.sudah_kedaluwarsa ? '<span class="priority-badge tinggi">Kedaluwarsa</span>' : i.akan_kedaluwarsa ? '<span class="priority-badge sedang">Segera habis</span>' : ''}
            </div>
        `).join('');

    } catch (err) {
        console.error('Gagal memuat dokumen:', err.message);
    }
}

function showDocumentDetail(uuid) {
    const doc = currentDocuments.find(i => i.uuid === uuid);
    if (!doc) return;

    const rows = [
        ['Jenis', JENIS_DOKUMEN_LABEL[doc.jenis_dokumen] || doc.jenis_dokumen],
        ['Nomor Dokumen', doc.nomor_dokumen],
        ['Berlaku Sampai', doc.berlaku_sampai ? formatTanggal(doc.berlaku_sampai) : null],
        ['Catatan', doc.catatan]
    ];

    openDetailSheet(
        doc.nama_dokumen,
        rows,
        () => editDocument(uuid),
        () => deleteDocument(uuid)
    );
}

function editDocument(uuid) {
    const doc = currentDocuments.find(i => i.uuid === uuid);
    if (!doc) return;

    document.getElementById('doc-edit-uuid').value = uuid;
    document.getElementById('doc-jenis').value = doc.jenis_dokumen;
    document.getElementById('doc-jenis').disabled = true;
    document.getElementById('doc-nama').value = doc.nama_dokumen;
    document.getElementById('doc-nomor').value = doc.nomor_dokumen || '';
    document.getElementById('doc-berlaku').value = doc.berlaku_sampai || '';
    document.getElementById('document-sheet-title').textContent = 'Edit Dokumen';
    openSheet('sheet-add-document');
}

async function deleteDocument(uuid) {
    if (!confirm('Hapus dokumen ini?')) return;
    try {
        await apiCall(`/documents/${uuid}`, { method: 'DELETE' });
        loadDocuments();
    } catch (err) {
        alert(err.message);
    }
}

document.getElementById('form-add-document').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
        const editUuid = document.getElementById('doc-edit-uuid').value;
        const payload = {
            jenis_dokumen: document.getElementById('doc-jenis').value,
            nama_dokumen: document.getElementById('doc-nama').value,
            nomor_dokumen: document.getElementById('doc-nomor').value || null,
            berlaku_sampai: document.getElementById('doc-berlaku').value || null
        };

        if (editUuid) {
            await apiCall(`/documents/${editUuid}`, { method: 'PUT', body: JSON.stringify(payload) });
        } else {
            await apiCall('/documents', { method: 'POST', body: JSON.stringify(payload) });
        }

        closeSheet('sheet-add-document');
        e.target.reset();
        loadDocuments();
    } catch (err) {
        alert(err.message);
    }
});

// ============================================
// CATATAN BEBAS
// ============================================
let currentNotes = [];

async function loadNotes() {
    try {
        const res = await apiCall('/notes');
        const notes = res.data;
        currentNotes = notes;

        const listEl = document.getElementById('notes-list');
        if (notes.length === 0) {
            listEl.innerHTML = '<div class="empty-state"><div class="emoji">📝</div><p>Belum ada catatan</p></div>';
            return;
        }

        listEl.innerHTML = notes.map(n => `
            <div class="card full-width mt-md" onclick="showNoteDetail('${n.uuid}')">
                <div class="flex-between">
                    <span class="list-item-title">${n.judul}</span>
                </div>
                ${n.isi ? `<p class="text-muted mt-md" style="font-size:13px;">${n.isi}</p>` : ''}
                <div class="text-muted mt-md" style="font-size:11px;">oleh ${n.nama_pembuat}</div>
            </div>
        `).join('');

    } catch (err) {
        console.error('Gagal memuat catatan:', err.message);
    }
}

function showNoteDetail(uuid) {
    const note = currentNotes.find(n => n.uuid === uuid);
    if (!note) return;

    const rows = [
        ['Isi', note.isi ? `<span style="font-weight:400;">${note.isi}</span>` : null],
        ['Dibuat oleh', note.nama_pembuat]
    ];

    openDetailSheet(
        note.judul,
        rows,
        () => editNote(uuid),
        () => deleteNote(uuid)
    );
}

function editNote(uuid) {
    const note = currentNotes.find(n => n.uuid === uuid);
    if (!note) return;

    document.getElementById('note-edit-uuid').value = uuid;
    document.getElementById('note-judul').value = note.judul;
    document.getElementById('note-isi').value = note.isi || '';
    document.getElementById('note-sheet-title').textContent = 'Edit Catatan';
    openSheet('sheet-add-note');
}

async function deleteNote(uuid) {
    if (!confirm('Hapus catatan ini?')) return;
    try {
        await apiCall(`/notes/${uuid}`, { method: 'DELETE' });
        loadNotes();
    } catch (err) {
        alert(err.message);
    }
}

document.getElementById('form-add-note').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
        const editUuid = document.getElementById('note-edit-uuid').value;
        const payload = {
            judul: document.getElementById('note-judul').value,
            isi: document.getElementById('note-isi').value || null
        };

        if (editUuid) {
            await apiCall(`/notes/${editUuid}`, { method: 'PUT', body: JSON.stringify(payload) });
        } else {
            await apiCall('/notes', { method: 'POST', body: JSON.stringify(payload) });
        }

        closeSheet('sheet-add-note');
        e.target.reset();
        loadNotes();
    } catch (err) {
        alert(err.message);
    }
});

// ============================================
// NOTIFIKASI
// ============================================
const NOTIF_ICON = { tagihan: '🧾', servis: '🔧', dokumen: '📄', tabungan: '🐷', anggaran: '🎯', tugas: '✅', aktivitas_pasangan: '💬' };

async function checkNotifBadge() {
    try {
        const res = await apiCall('/notifications?unread_only=true');
        const badge = document.getElementById('notif-badge');
        if (res.unread_count > 0) badge.classList.remove('hidden');
        else badge.classList.add('hidden');
    } catch (err) {
        console.error('Gagal cek notifikasi:', err.message);
    }
}

async function loadNotifications() {
    try {
        const res = await apiCall('/notifications');
        const notifications = res.data;

        const listEl = document.getElementById('notifications-list');
        if (notifications.length === 0) {
            listEl.innerHTML = '<div class="empty-state"><div class="emoji">🔔</div><p>Belum ada notifikasi</p></div>';
            return;
        }

        listEl.innerHTML = notifications.map(n => `
            <div class="list-item" style="${n.is_read ? 'opacity:0.6;' : ''}" onclick="markNotificationRead('${n.uuid}')">
                <div class="list-item-icon" style="background:#F3EFF6;">${NOTIF_ICON[n.tipe] || '🔔'}</div>
                <div class="list-item-body">
                    <div class="list-item-title">${n.judul}</div>
                    <div class="list-item-subtitle">${n.pesan || ''}</div>
                </div>
                ${!n.is_read ? '<div class="notif-badge" style="position:static;"></div>' : ''}
            </div>
        `).join('');

        checkNotifBadge();

    } catch (err) {
        console.error('Gagal memuat notifikasi:', err.message);
    }
}

async function markNotificationRead(uuid) {
    try {
        await apiCall(`/notifications/${uuid}/read`, { method: 'PUT' });
        loadNotifications();
    } catch (err) {
        console.error(err.message);
    }
}

async function markAllNotificationsRead() {
    try {
        await apiCall('/notifications/read-all', { method: 'PUT' });
        loadNotifications();
    } catch (err) {
        alert(err.message);
    }
}

// ============================================
// PENGATURAN
// ============================================
async function loadSettings() {
    try {
        const [settingsRes, meRes] = await Promise.all([apiCall('/settings'), apiCall('/auth/me')]);
        const settings = settingsRes.data;
        const me = meRes.data;

        document.getElementById('toggle-theme').classList.toggle('on', settings.tema === 'dark');
        document.getElementById('toggle-notif-push').classList.toggle('on', !!settings.notifikasi_push);
        document.getElementById('toggle-notif-email').classList.toggle('on', !!settings.notifikasi_email);

        document.getElementById('settings-nama').textContent = me.nama;
        document.getElementById('settings-email').textContent = me.email;
        document.getElementById('settings-verified').textContent = me.email_verified ? '✓ Terverifikasi' : 'Belum diverifikasi';

    } catch (err) {
        console.error('Gagal memuat pengaturan:', err.message);
    }
}

async function toggleTheme() {
    const toggle = document.getElementById('toggle-theme');
    const isDark = !toggle.classList.contains('on');
    toggle.classList.toggle('on', isDark);
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');

    try {
        await apiCall('/settings/theme', { method: 'PUT', body: JSON.stringify({ tema: isDark ? 'dark' : 'light' }) });
    } catch (err) {
        console.error('Gagal menyimpan tema:', err.message);
    }
}

async function toggleNotifSetting(jenis) {
    const toggleId = jenis === 'push' ? 'toggle-notif-push' : 'toggle-notif-email';
    const toggle = document.getElementById(toggleId);
    const newValue = !toggle.classList.contains('on');
    toggle.classList.toggle('on', newValue);

    try {
        const body = jenis === 'push' ? { notifikasi_push: newValue } : { notifikasi_email: newValue };
        await apiCall('/settings/notifications', { method: 'PUT', body: JSON.stringify(body) });
    } catch (err) {
        alert(err.message);
    }
}

function logout() {
    if (!confirm('Yakin ingin keluar?')) return;
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    state.token = null;
    state.user = null;
    document.getElementById('bottom-nav').style.display = 'none';
    showPage('page-login');
}

// ============================================
// LOGIN DENGAN GOOGLE
// ============================================
const GOOGLE_CLIENT_ID = ''; // Isi dengan Client ID dari Google Cloud Console untuk mengaktifkan

function initGoogleSignIn() {
    if (!GOOGLE_CLIENT_ID) {
        document.getElementById('google-signin-note').classList.remove('hidden');
        return;
    }
    if (typeof google === 'undefined') return;

    google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleGoogleCredential
    });
    google.accounts.id.renderButton(
        document.getElementById('google-signin-login'),
        { theme: 'outline', size: 'large', width: 280, text: 'continue_with' }
    );
}

async function handleGoogleCredential(response) {
    try {
        const res = await apiCall('/auth/google', {
            method: 'POST',
            body: JSON.stringify({ id_token: response.credential })
        });

        state.token = res.data.token;
        state.user = res.data.user;
        localStorage.setItem('token', state.token);
        localStorage.setItem('user', JSON.stringify(state.user));

        afterLogin();

    } catch (err) {
        alert(err.message);
    }
}

// ============================================
// INISIALISASI SAAT APP DIMUAT
// ============================================
window.addEventListener('DOMContentLoaded', () => {
    // Terapkan tema tersimpan (sebelum login pun sudah bisa diterapkan)
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');

    if (state.token && state.user) {
        afterLogin();
        loadAccounts(); // supaya dropdown rekening terisi untuk quick-add
    } else {
        showPage('page-login');
        initGoogleSignIn();
    }

    // Registrasi service worker untuk PWA
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch(err => console.error('SW gagal:', err));
    }
});
