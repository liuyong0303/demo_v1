const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'books.db'));
db.pragma('journal_mode = WAL');

// 初始化 schema（幂等）
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

  CREATE TABLE IF NOT EXISTS borrow_records (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id     INTEGER NOT NULL,  -- 逻辑外键指向 books.id，由应用层校验
    borrowed_at TEXT    NOT NULL DEFAULT (datetime('now')),
    returned_at TEXT,               -- NULL 表示在借
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_borrow_book ON borrow_records(book_id);
  CREATE INDEX IF NOT EXISTS idx_borrow_returned ON borrow_records(returned_at);
`);

// 幂等迁移：为 books 表增加 is_alive 列（1=在世, 0=已故, NULL=未知）
(function migrateIsAlive() {
  const cols = db.prepare("PRAGMA table_info(books)").all();
  const has = cols.some((c) => c.name === 'is_alive');
  if (!has) {
    db.exec("ALTER TABLE books ADD COLUMN is_alive TINYINT(1) NULL");
  }
})();

// 种子数据：仅在 books 与 borrow_records 都为空时插入，保证多次启动不漂移
(function seedIfEmpty() {
  const bookCount = db.prepare('SELECT COUNT(*) AS c FROM books').get().c;
  const borrowCount = db.prepare('SELECT COUNT(*) AS c FROM borrow_records').get().c;
  if (bookCount > 0 || borrowCount > 0) return;

  const insertBook = db.prepare(`
    INSERT INTO books (title, author, isbn, category, stock, price_cents, cover_url)
    VALUES (@title, @author, @isbn, @category, @stock, @price_cents, @cover_url)
  `);
  const insertBorrow = db.prepare(`
    INSERT INTO borrow_records (book_id, borrowed_at, returned_at)
    VALUES (?, ?, ?)
  `);

  const seedBooks = [
    { title: '百年孤独', author: '加西亚·马尔克斯', isbn: '9787544253994', category: '文学', stock: 8, price_cents: 3950 },
    { title: '活着', author: '余华', isbn: '9787506365437', category: '文学', stock: 12, price_cents: 2500 },
    { title: '三体', author: '刘慈欣', isbn: '9787536692930', category: '科技', stock: 15, price_cents: 2300 },
    { title: '人类简史', author: '尤瓦尔·赫拉利', isbn: '9787508647357', category: '历史', stock: 10, price_cents: 4500 },
    { title: '小王子', author: '圣埃克苏佩里', isbn: '9787020042494', category: '童书', stock: 20, price_cents: 1800 },
    { title: '围城', author: '钱钟书', isbn: '9787020024759', category: '文学', stock: 6, price_cents: 2200 },
    { title: '深入理解计算机系统', author: 'Randal E. Bryant', isbn: '9787111544937', category: '科技', stock: 5, price_cents: 13900 },
  ];

  const tx = db.transaction(() => {
    const bookIds = seedBooks.map((b) => {
      const info = insertBook.run({ ...b, cover_url: null });
      return info.lastInsertRowid;
    });
    // 借阅历史：覆盖在借、已还、Top1 领先、并列等场景
    // bookIds: 0百年孤独, 1活着, 2三体, 3人类简史, 4小王子, 5围城, 6深入理解
    const plans = [
      // 三体：6 次（Top1）
      [2, '2026-09-01 10:00:00', '2026-09-10 10:00:00'],
      [2, '2026-09-12 09:00:00', '2026-09-20 09:00:00'],
      [2, '2026-09-22 14:00:00', '2026-09-30 14:00:00'],
      [2, '2026-10-01 10:00:00', '2026-10-05 10:00:00'],
      [2, '2026-10-06 11:00:00', '2026-10-08 11:00:00'],
      [2, '2026-10-09 08:00:00', null], // 在借
      // 活着：5 次（Top2）
      [1, '2026-08-15 10:00:00', '2026-08-22 10:00:00'],
      [1, '2026-08-25 10:00:00', '2026-09-01 10:00:00'],
      [1, '2026-09-05 10:00:00', '2026-09-12 10:00:00'],
      [1, '2026-09-18 10:00:00', '2026-09-25 10:00:00'],
      [1, '2026-10-02 10:00:00', null], // 在借
      // 百年孤独：4 次（Top3）
      [0, '2026-09-02 10:00:00', '2026-09-08 10:00:00'],
      [0, '2026-09-15 10:00:00', '2026-09-22 10:00:00'],
      [0, '2026-09-28 10:00:00', '2026-10-03 10:00:00'],
      [0, '2026-10-04 10:00:00', null], // 在借
      // 人类简史：3 次（Top4）
      [3, '2026-09-03 10:00:00', '2026-09-13 10:00:00'],
      [3, '2026-09-20 10:00:00', '2026-09-29 10:00:00'],
      [3, '2026-10-07 10:00:00', null], // 在借
      // 小王子：3 次（Top5，与人类简史并列但 book_id 更大故排后面；按 book_id ASC 稳定排序，人类简史 book_id 较小）
      [4, '2026-09-04 10:00:00', '2026-09-09 10:00:00'],
      [4, '2026-09-14 10:00:00', '2026-09-21 10:00:00'],
      [4, '2026-10-05 10:00:00', '2026-10-08 10:00:00'], // 已还
      // 围城：2 次（不进 Top5）
      [5, '2026-09-10 10:00:00', '2026-09-17 10:00:00'],
      [5, '2026-10-01 10:00:00', null], // 在借
    ];
    for (const [idx, borrowed_at, returned_at] of plans) {
      insertBorrow.run(bookIds[idx], borrowed_at, returned_at);
    }
  });
  tx();
})();

module.exports = db;
