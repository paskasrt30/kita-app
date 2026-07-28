const { Pool, types } = require('pg');
const { AsyncLocalStorage } = require('async_hooks');
const path = require('path');
const fs = require('fs');

// Kembalikan DATE/TIMESTAMP sebagai string mentah (bukan objek Date JS) supaya
// perbandingan string tanggal di routes/*.js tetap berperilaku sama seperti waktu pakai better-sqlite3.
types.setTypeParser(1082, (val) => val); // date
types.setTypeParser(1114, (val) => val); // timestamp without time zone
types.setTypeParser(20, (val) => parseInt(val, 10)); // bigint (mis. hasil COUNT(*)) -> number seperti better-sqlite3

const pool = new Pool({ connectionString: process.env.POSTGRES_URL });
const als = new AsyncLocalStorage(); // menyimpan client aktif selama transaction berlangsung

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
const ready = pool.query(schema);
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
