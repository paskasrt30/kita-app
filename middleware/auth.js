const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'ganti_dengan_secret_key_yang_aman';

function authMiddleware(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Format: "Bearer <token>"

    if (!token) {
        return res.status(401).json({
            status: 'error',
            message: 'Token tidak ditemukan, silakan login kembali'
        });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded; // { id, email, couple_id }
        next();
    } catch (err) {
        return res.status(401).json({
            status: 'error',
            message: 'Token tidak valid atau sudah kedaluwarsa'
        });
    }
}

// Middleware tambahan: pastikan user sudah terhubung dengan pasangan
function requireCouple(req, res, next) {
    if (!req.user.couple_id) {
        return res.status(403).json({
            status: 'error',
            message: 'Kamu belum terhubung dengan pasangan. Hubungkan dulu untuk mengakses fitur ini.'
        });
    }
    next();
}

module.exports = { authMiddleware, requireCouple, JWT_SECRET };
