const nodemailer = require('nodemailer');

const SMTP_CONFIGURED = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

let transporter = null;
if (SMTP_CONFIGURED) {
    transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 587,
        secure: Number(process.env.SMTP_PORT) === 465,
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        }
    });
}

/**
 * Kirim email verifikasi. Jika SMTP belum dikonfigurasi di .env,
 * fungsi ini diam-diam skip (tidak melempar error) supaya development
 * tetap lancar tanpa perlu setup email dulu.
 */
async function kirimEmailVerifikasi(toEmail, nama, verificationToken, appUrl) {
    if (!SMTP_CONFIGURED) {
        console.log(`[EMAIL SKIP] SMTP belum dikonfigurasi. Link verifikasi untuk ${toEmail}: ${appUrl}/api/auth/verify-email?token=${verificationToken}`);
        return { sent: false, reason: 'SMTP belum dikonfigurasi di .env' };
    }

    const verifyUrl = `${appUrl}/api/auth/verify-email?token=${verificationToken}`;

    try {
        await transporter.sendMail({
            from: process.env.SMTP_FROM || process.env.SMTP_USER,
            to: toEmail,
            subject: 'Verifikasi Email — Kita App',
            html: `
                <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
                    <h2 style="color: #6C5CE7;">Halo ${nama}!</h2>
                    <p>Terima kasih sudah mendaftar di Kita. Klik tombol di bawah untuk verifikasi email kamu:</p>
                    <a href="${verifyUrl}" style="display:inline-block; background: linear-gradient(135deg, #6C5CE7, #FF7F6B); color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">Verifikasi Email</a>
                    <p style="color: #6B6778; font-size: 13px; margin-top: 24px;">Jika tombol tidak berfungsi, salin tautan ini: ${verifyUrl}</p>
                </div>
            `
        });
        return { sent: true };
    } catch (err) {
        console.error('Gagal mengirim email verifikasi:', err.message);
        return { sent: false, reason: err.message };
    }
}

module.exports = { kirimEmailVerifikasi, SMTP_CONFIGURED };
