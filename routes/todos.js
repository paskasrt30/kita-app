const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const { authMiddleware, requireCouple } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware, requireCouple);

// ==================== GET DAFTAR TUGAS ====================
router.get('/', async (req, res) => {
    try {
        const { status, tanggal } = req.query;

        let sql = `
            SELECT t.*, uc.nama as nama_pembuat, ua.nama as nama_assigned
            FROM todos t
            JOIN users uc ON t.created_by = uc.id
            LEFT JOIN users ua ON t.assigned_to = ua.id
            WHERE t.couple_id = ?
        `;
        const params = [req.user.couple_id];

        if (status) {
            sql += ' AND t.status = ?';
            params.push(status);
        }

        if (tanggal) {
            sql += ' AND t.deadline::date = ?';
            params.push(tanggal);
        }

        sql += ` ORDER BY
            CASE t.prioritas WHEN 'tinggi' THEN 1 WHEN 'sedang' THEN 2 ELSE 3 END,
            t.deadline ASC`;

        const todos = await db.prepare(sql).all(...params);
        res.json({ status: 'success', data: todos });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Terjadi kesalahan pada server' });
    }
});

// ==================== TAMBAH TUGAS ====================
router.post('/', async (req, res) => {
    try {
        const { judul, deskripsi, prioritas, deadline, assigned_to } = req.body;

        if (!judul) {
            return res.status(400).json({ status: 'error', message: 'Judul tugas wajib diisi' });
        }

        const validPrioritas = ['rendah', 'sedang', 'tinggi'];
        if (prioritas && !validPrioritas.includes(prioritas)) {
            return res.status(400).json({ status: 'error', message: `Prioritas harus salah satu dari: ${validPrioritas.join(', ')}` });
        }

        const todoUuid = uuidv4();
        const result = await db.prepare(`
            INSERT INTO todos (uuid, couple_id, created_by, assigned_to, judul, deskripsi, prioritas, deadline)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(todoUuid, req.user.couple_id, req.user.id, assigned_to || null, judul, deskripsi || null, prioritas || 'sedang', deadline || null);

        const newTodo = await db.prepare('SELECT * FROM todos WHERE id = ?').get(result.lastInsertRowid);

        res.status(201).json({ status: 'success', message: 'Tugas berhasil ditambahkan', data: newTodo });

    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Terjadi kesalahan pada server' });
    }
});

// ==================== UPDATE TUGAS (termasuk ubah status) ====================
router.put('/:uuid', async (req, res) => {
    try {
        const todo = await db.prepare('SELECT * FROM todos WHERE uuid = ? AND couple_id = ?')
            .get(req.params.uuid, req.user.couple_id);

        if (!todo) {
            return res.status(404).json({ status: 'error', message: 'Tugas tidak ditemukan' });
        }

        const { judul, deskripsi, prioritas, deadline, assigned_to, status } = req.body;

        if (status) {
            const validStatus = ['belum', 'proses', 'selesai'];
            if (!validStatus.includes(status)) {
                return res.status(400).json({ status: 'error', message: `Status harus salah satu dari: ${validStatus.join(', ')}` });
            }
        }

        await db.prepare(`
            UPDATE todos SET
                judul = COALESCE(?, judul),
                deskripsi = COALESCE(?, deskripsi),
                prioritas = COALESCE(?, prioritas),
                deadline = COALESCE(?, deadline),
                assigned_to = COALESCE(?, assigned_to),
                status = COALESCE(?, status)
            WHERE uuid = ?
        `).run(judul, deskripsi, prioritas, deadline, assigned_to, status, req.params.uuid);

        const updated = await db.prepare('SELECT * FROM todos WHERE uuid = ?').get(req.params.uuid);
        res.json({ status: 'success', message: 'Tugas berhasil diperbarui', data: updated });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Terjadi kesalahan pada server' });
    }
});

// ==================== HAPUS TUGAS ====================
router.delete('/:uuid', async (req, res) => {
    try {
        const todo = await db.prepare('SELECT * FROM todos WHERE uuid = ? AND couple_id = ?')
            .get(req.params.uuid, req.user.couple_id);

        if (!todo) {
            return res.status(404).json({ status: 'error', message: 'Tugas tidak ditemukan' });
        }

        await db.prepare('DELETE FROM todo_comments WHERE todo_id = ?').run(todo.id);
        await db.prepare('DELETE FROM todos WHERE uuid = ?').run(req.params.uuid);

        res.json({ status: 'success', message: 'Tugas berhasil dihapus' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Terjadi kesalahan pada server' });
    }
});

// ==================== KOMENTAR: LIST ====================
router.get('/:uuid/comments', async (req, res) => {
    try {
        const todo = await db.prepare('SELECT * FROM todos WHERE uuid = ? AND couple_id = ?')
            .get(req.params.uuid, req.user.couple_id);

        if (!todo) {
            return res.status(404).json({ status: 'error', message: 'Tugas tidak ditemukan' });
        }

        const comments = await db.prepare(`
            SELECT tc.*, u.nama as nama_user FROM todo_comments tc
            JOIN users u ON tc.user_id = u.id
            WHERE tc.todo_id = ? ORDER BY tc.created_at ASC
        `).all(todo.id);

        res.json({ status: 'success', data: comments });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Terjadi kesalahan pada server' });
    }
});

// ==================== KOMENTAR: TAMBAH ====================
router.post('/:uuid/comments', async (req, res) => {
    try {
        const todo = await db.prepare('SELECT * FROM todos WHERE uuid = ? AND couple_id = ?')
            .get(req.params.uuid, req.user.couple_id);

        if (!todo) {
            return res.status(404).json({ status: 'error', message: 'Tugas tidak ditemukan' });
        }

        const { komentar } = req.body;
        if (!komentar) {
            return res.status(400).json({ status: 'error', message: 'Isi komentar wajib diisi' });
        }

        await db.prepare('INSERT INTO todo_comments (todo_id, user_id, komentar) VALUES (?, ?, ?)')
            .run(todo.id, req.user.id, komentar);

        res.status(201).json({ status: 'success', message: 'Komentar berhasil ditambahkan' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Terjadi kesalahan pada server' });
    }
});

module.exports = router;
