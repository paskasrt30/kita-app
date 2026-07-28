const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const { authMiddleware, requireCouple } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware, requireCouple);

// ==================== GET SEMUA TARGET TABUNGAN ====================
router.get('/', async (req, res) => {
    try {
        const { status } = req.query;

        let sql = 'SELECT * FROM savings_goals WHERE couple_id = ?';
        const params = [req.user.couple_id];

        if (status) {
            sql += ' AND status = ?';
            params.push(status);
        }

        sql += ' ORDER BY created_at DESC';

        const goals = await db.prepare(sql).all(...params);

        const data = goals.map(g => ({
            ...g,
            progress_persen: g.target_nominal > 0
                ? Math.round((g.nominal_terkumpul / g.target_nominal) * 1000) / 10
                : 0
        }));

        res.json({ status: 'success', data });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Terjadi kesalahan pada server' });
    }
});

// ==================== DETAIL + RIWAYAT SETORAN ====================
router.get('/:uuid', async (req, res) => {
    try {
        const goal = await db.prepare('SELECT * FROM savings_goals WHERE uuid = ? AND couple_id = ?')
            .get(req.params.uuid, req.user.couple_id);

        if (!goal) {
            return res.status(404).json({ status: 'error', message: 'Target tabungan tidak ditemukan' });
        }

        const deposits = await db.prepare(`
            SELECT sd.*, u.nama as nama_user FROM savings_deposits sd
            JOIN users u ON sd.user_id = u.id
            WHERE sd.savings_goal_id = ?
            ORDER BY sd.tanggal DESC, sd.created_at DESC
        `).all(goal.id);

        res.json({
            status: 'success',
            data: {
                ...goal,
                progress_persen: goal.target_nominal > 0
                    ? Math.round((goal.nominal_terkumpul / goal.target_nominal) * 1000) / 10
                    : 0,
                riwayat: deposits
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Terjadi kesalahan pada server' });
    }
});

// ==================== BUAT TARGET TABUNGAN BARU ====================
router.post('/', async (req, res) => {
    try {
        const { nama_target, target_nominal, target_tanggal, icon } = req.body;

        if (!nama_target || !target_nominal) {
            return res.status(400).json({ status: 'error', message: 'Nama target dan target nominal wajib diisi' });
        }

        if (target_nominal <= 0) {
            return res.status(400).json({ status: 'error', message: 'Target nominal harus lebih besar dari 0' });
        }

        const goalUuid = uuidv4();
        const result = await db.prepare(`
            INSERT INTO savings_goals (uuid, couple_id, nama_target, target_nominal, target_tanggal, icon)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(goalUuid, req.user.couple_id, nama_target, target_nominal, target_tanggal || null, icon || 'piggy-bank');

        const newGoal = await db.prepare('SELECT * FROM savings_goals WHERE id = ?').get(result.lastInsertRowid);

        res.status(201).json({ status: 'success', message: 'Target tabungan berhasil dibuat', data: newGoal });

    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Terjadi kesalahan pada server' });
    }
});

// ==================== SETOR TABUNGAN ====================
router.post('/:uuid/deposit', async (req, res) => {
    const depositTx = db.transaction(async (uuid, coupleId, userId, body) => {
        const { nominal, tanggal, catatan, account_id } = body;

        if (!nominal || nominal <= 0) {
            throw { statusCode: 400, message: 'Nominal setoran harus lebih besar dari 0' };
        }

        if (!tanggal) {
            throw { statusCode: 400, message: 'Tanggal wajib diisi' };
        }

        const goal = await db.prepare('SELECT * FROM savings_goals WHERE uuid = ? AND couple_id = ?').get(uuid, coupleId);
        if (!goal) {
            throw { statusCode: 404, message: 'Target tabungan tidak ditemukan' };
        }

        // Jika disertakan rekening sumber, kurangi saldo rekening tsb (uang "dipindah" ke tabungan)
        if (account_id) {
            const account = await db.prepare('SELECT * FROM accounts WHERE id = ? AND couple_id = ?').get(account_id, coupleId);
            if (!account) {
                throw { statusCode: 404, message: 'Rekening sumber tidak ditemukan' };
            }
            await db.prepare('UPDATE accounts SET saldo_saat_ini = saldo_saat_ini - ? WHERE id = ?').run(nominal, account_id);
        }

        const depositUuid = uuidv4();
        await db.prepare(`
            INSERT INTO savings_deposits (uuid, savings_goal_id, user_id, nominal, tanggal, catatan)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(depositUuid, goal.id, userId, nominal, tanggal, catatan || null);

        const nominalBaru = goal.nominal_terkumpul + nominal;
        const statusBaru = nominalBaru >= goal.target_nominal ? 'completed' : goal.status;

        await db.prepare('UPDATE savings_goals SET nominal_terkumpul = ?, status = ? WHERE id = ?')
            .run(nominalBaru, statusBaru, goal.id);

        return { nominalBaru, statusBaru, tercapai: statusBaru === 'completed' };
    });

    try {
        const result = await depositTx(req.params.uuid, req.user.couple_id, req.user.id, req.body);
        res.status(201).json({
            status: 'success',
            message: result.tercapai ? '🎉 Target tabungan tercapai!' : 'Setoran berhasil dicatat',
            data: result
        });
    } catch (err) {
        const statusCode = err.statusCode || 500;
        res.status(statusCode).json({ status: 'error', message: err.message || 'Terjadi kesalahan pada server' });
    }
});

// ==================== UPDATE TARGET TABUNGAN ====================
router.put('/:uuid', async (req, res) => {
    try {
        const goal = await db.prepare('SELECT * FROM savings_goals WHERE uuid = ? AND couple_id = ?')
            .get(req.params.uuid, req.user.couple_id);

        if (!goal) {
            return res.status(404).json({ status: 'error', message: 'Target tabungan tidak ditemukan' });
        }

        const { nama_target, target_nominal, target_tanggal } = req.body;

        await db.prepare(`
            UPDATE savings_goals SET
                nama_target = COALESCE(?, nama_target),
                target_nominal = COALESCE(?, target_nominal),
                target_tanggal = COALESCE(?, target_tanggal)
            WHERE uuid = ?
        `).run(nama_target, target_nominal, target_tanggal, req.params.uuid);

        const updated = await db.prepare('SELECT * FROM savings_goals WHERE uuid = ?').get(req.params.uuid);
        res.json({ status: 'success', message: 'Target tabungan berhasil diperbarui', data: updated });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Terjadi kesalahan pada server' });
    }
});

// ==================== HAPUS / BATALKAN TARGET TABUNGAN ====================
router.delete('/:uuid', async (req, res) => {
    try {
        const goal = await db.prepare('SELECT * FROM savings_goals WHERE uuid = ? AND couple_id = ?')
            .get(req.params.uuid, req.user.couple_id);

        if (!goal) {
            return res.status(404).json({ status: 'error', message: 'Target tabungan tidak ditemukan' });
        }

        await db.prepare("UPDATE savings_goals SET status = 'cancelled' WHERE uuid = ?").run(req.params.uuid);
        res.json({ status: 'success', message: 'Target tabungan dibatalkan' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Terjadi kesalahan pada server' });
    }
});

module.exports = router;
