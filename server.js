require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve file statis PWA (HTML, CSS, JS, manifest, service worker)
app.use(express.static(path.join(__dirname, 'public')));

// ==================== ROUTES API ====================
app.use('/api/auth', require('./routes/auth'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/accounts', require('./routes/accounts'));
app.use('/api/income', require('./routes/income'));
app.use('/api/expenses', require('./routes/expenses'));
app.use('/api/budgets', require('./routes/budgets'));
app.use('/api/savings', require('./routes/savings'));
app.use('/api/todos', require('./routes/todos'));
app.use('/api/calendar', require('./routes/calendar'));
app.use('/api/shopping', require('./routes/shopping'));
app.use('/api/bills', require('./routes/bills'));
app.use('/api/debts', require('./routes/debts'));
app.use('/api/transfers', require('./routes/transfers'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/stock', require('./routes/stock'));
app.use('/api/inventory', require('./routes/inventory'));
app.use('/api/services', require('./routes/services'));
app.use('/api/documents', require('./routes/documents'));
app.use('/api/notes', require('./routes/notes'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/settings', require('./routes/settings'));

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'success', message: 'Server berjalan normal', timestamp: new Date().toISOString() });
});

// Fallback: semua route non-API diarahkan ke index.html (SPA behavior)
app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ status: 'error', message: 'Endpoint tidak ditemukan' });
    }
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Global error handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ status: 'error', message: 'Terjadi kesalahan pada server' });
});

app.listen(PORT, () => {
    console.log(`✓ Server berjalan di http://localhost:${PORT}`);
});
