const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'books.db'));
db.pragma('journal_mode = WAL');

// 初始化 schema
db.exec(`
  CREATE TABLE IF NOT EXISTS books (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT    NOT NULL,
    author      TEXT    NOT NULL,
    isbn        TEXT    NOT NULL UNIQUE,  -- ISBN 全局唯一（含软删数据，不可复用）
    category    TEXT    NOT NULL,
    stock       INTEGER NOT NULL DEFAULT 0,
    price_cents INTEGER NOT NULL DEFAULT 0,  -- 以「分」整数存储，对外以元返回
    cover_url   TEXT,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    deleted_at  TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_books_deleted_created ON books(deleted_at, created_at DESC);
`);

module.exports = db;
