const { Pool, types } = require('pg');
const { AsyncLocalStorage } = require('async_hooks');
const path = require('path');
const fs = require('fs');

// Kembalikan DATE/TIMESTAMP sebagai string mentah (bukan objek Date JS) supaya
// perbandingan string tanggal di routes/*.js tetap berperilaku sama seperti waktu pakai better-sqlite3.
types.setTypeParser(1082, (val) => val); // date
types.setTypeParser(1114, (val) => val); // timestamp without time zone
types.setTypeParser(20, (val) => parseInt(val, 10)); // bigint (mis. hasil COUNT(*)) -> number seperti better-sqlite3

const pool = new Pool({ connectionString: process.env.POSTGRES_URL, max: 5 });
pool.on('error', (err) => console.error('Postgres idle client error:', err)); // cegah proses crash kalau koneksi idle putus
const als = new AsyncLocalStorage(); // menyimpan client aktif selama transaction berlangsung

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');

// Nomor kunci bebas asal konsisten antar proses (dipakai sbg advisory lock, bukan ID data).
const SCHEMA_LOCK_KEY = 727100;

// Serverless => tiap cold start jalanin ulang schema.sql. `CREATE TABLE IF NOT EXISTS`
// tidak aman dari race condition kalau dieksekusi bersamaan oleh beberapa cold start
// (bisa bentrok di katalog sistem Postgres). Advisory lock memastikan cuma satu yang
// jalanin DDL di satu waktu; yang lain nunggu giliran lalu lanjut (aman krn idempotent).
const ready = (async () => {
    const client = await pool.connect();
    try {
        await client.query('SELECT pg_advisory_lock($1)', [SCHEMA_LOCK_KEY]);
        await client.query(schema);
    } finally {
        await client.query('SELECT pg_advisory_unlock($1)', [SCHEMA_LOCK_KEY]);
        client.release();
    }
})();
ready.catch(() => {}); // cegah unhandled rejection men-crash proses; error tetap terlempar ke tiap `await ready` di bawah

function toPgSql(sql) {
    let i = 0;
    return sql.replace(/\?/g, () => `$${++i}`);
}

function executor() {
    return als.getStore() || pool;
}

function prepare(sql) {
    const text = toPgSql(sql);
    const isInsert = /^\s*INSERT/i.test(sql);
    const runText = isInsert && !/RETURNING/i.test(sql) ? `${text} RETURNING id` : text;

    return {
        get: async (...params) => {
            await ready;
            const result = await executor().query(text, params);
            return result.rows[0];
        },
        all: async (...params) => {
            await ready;
            const result = await executor().query(text, params);
            return result.rows;
        },
        run: async (...params) => {
            await ready;
            const result = await executor().query(runText, params);
            return { lastInsertRowid: result.rows[0]?.id, changes: result.rowCount };
        },
    };
}

function transaction(fn) {
    return async (...args) => {
        await ready;
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const result = await als.run(client, () => fn(...args));
            await client.query('COMMIT');
            return result;
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    };
}

module.exports = { prepare, transaction };
