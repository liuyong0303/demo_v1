const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'books.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// 初始化 schema
db.exec(`
  CREATE TABLE IF NOT EXISTS books (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT    NOT NULL,
    author      TEXT    NOT NULL,
    isbn        TEXT    NOT NULL UNIQUE,
    category    TEXT    NOT NULL,
    stock       INTEGER NOT NULL DEFAULT 0,
    price_cents INTEGER NOT NULL DEFAULT 0,
    cover_url   TEXT,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    deleted_at  TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_books_deleted_created ON books(deleted_at, created_at DESC);

  -- 读者（最小骨架）
  CREATE TABLE IF NOT EXISTS readers (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    card_no                 TEXT    NOT NULL UNIQUE,
    name                    TEXT    NOT NULL,
    status                  TEXT    NOT NULL DEFAULT 'ACTIVE', -- ACTIVE / SUSPENDED
    is_suspended            INTEGER NOT NULL DEFAULT 0,
    outstanding_fine_cents  INTEGER NOT NULL DEFAULT 0,
    created_at              TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  -- 管理员
  CREATE TABLE IF NOT EXISTS admins (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    username   TEXT    NOT NULL UNIQUE,
    name       TEXT    NOT NULL,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  -- 借阅/归还流水（最小骨架）
  CREATE TABLE IF NOT EXISTS loans (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id     INTEGER NOT NULL,
    reader_id   INTEGER NOT NULL,
    loaned_at   TEXT    NOT NULL DEFAULT (datetime('now')),
    returned_at TEXT,
    FOREIGN KEY (book_id) REFERENCES books(id),
    FOREIGN KEY (reader_id) REFERENCES readers(id)
  );
  CREATE INDEX IF NOT EXISTS idx_loans_book_open ON loans(book_id, returned_at);
  CREATE INDEX IF NOT EXISTS idx_loans_reader_open ON loans(reader_id, returned_at);

  -- 预约单
  CREATE TABLE IF NOT EXISTS reservations (
    id                     INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id                INTEGER NOT NULL,
    reader_id              INTEGER NOT NULL,
    status                 TEXT    NOT NULL, -- WAITING_NOTIFY/READY_FOR_PICKUP/COMPLETED/CANCELLED/EXPIRED
    created_at             TEXT    NOT NULL DEFAULT (datetime('now')),
    notified_at            TEXT,
    expire_at              TEXT,
    completed_at           TEXT,
    completed_by_loan_id   INTEGER,
    cancelled_at           TEXT,
    cancelled_by           INTEGER,
    cancel_reason          TEXT, -- READER_CANCEL / ADMIN_CANCEL
    cancel_note            TEXT,
    expired_at             TEXT,
    idempotency_key        TEXT,
    FOREIGN KEY (book_id) REFERENCES books(id),
    FOREIGN KEY (reader_id) REFERENCES readers(id),
    FOREIGN KEY (completed_by_loan_id) REFERENCES loans(id),
    CHECK (status IN ('WAITING_NOTIFY','READY_FOR_PICKUP','COMPLETED','CANCELLED','EXPIRED'))
  );
  CREATE INDEX IF NOT EXISTS idx_reservations_book_status_created
    ON reservations(book_id, status, created_at ASC);
  CREATE INDEX IF NOT EXISTS idx_reservations_reader_status
    ON reservations(reader_id, status);
  CREATE INDEX IF NOT EXISTS idx_reservations_expire
    ON reservations(status, expire_at);
  -- 同书未完成唯一（REQ-013.1）
  CREATE UNIQUE INDEX IF NOT EXISTS unq_reservation_reader_book_active
    ON reservations(reader_id, book_id)
    WHERE status IN ('WAITING_NOTIFY','READY_FOR_PICKUP');

  -- 预约操作日志/异常备注
  CREATE TABLE IF NOT EXISTS reservation_notes (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    reservation_id INTEGER NOT NULL,
    author_type    TEXT    NOT NULL, -- READER/ADMIN/SYSTEM
    author_id      INTEGER,
    action         TEXT    NOT NULL, -- CREATE/NOTIFY/COMPLETE/CANCEL/EXPIRE/NOTE/RETURN_TRIGGER/LOAN_COMPLETE
    note           TEXT,
    created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (reservation_id) REFERENCES reservations(id)
  );
  CREATE INDEX IF NOT EXISTS idx_reservation_notes_res_created
    ON reservation_notes(reservation_id, created_at ASC);

  -- 站内消息（MVP InAppNotifier）
  CREATE TABLE IF NOT EXISTS messages (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    reader_id            INTEGER NOT NULL,
    type                 TEXT    NOT NULL, -- PICKUP_READY / EXPIRED / SYSTEM
    title                TEXT    NOT NULL,
    body                 TEXT    NOT NULL,
    is_read              INTEGER NOT NULL DEFAULT 0,
    ref_reservation_id   INTEGER,
    created_at           TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (reader_id) REFERENCES readers(id),
    FOREIGN KEY (ref_reservation_id) REFERENCES reservations(id)
  );
  CREATE INDEX IF NOT EXISTS idx_messages_reader_created ON messages(reader_id, created_at DESC);

  -- Outbox 事件表：预约子系统与借还主流程解耦（NFR-002/005/006）
  CREATE TABLE IF NOT EXISTS reservation_events (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id      INTEGER NOT NULL,
    type         TEXT    NOT NULL, -- TRY_NOTIFY / COMPLETE_BY_LOAN / SEND_MESSAGE
    payload      TEXT    NOT NULL, -- JSON
    idem_key     TEXT,
    created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
    processed_at TEXT,
    attempts     INTEGER NOT NULL DEFAULT 0,
    last_error   TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_events_unprocessed ON reservation_events(processed_at, created_at);
  CREATE UNIQUE INDEX IF NOT EXISTS unq_events_idem ON reservation_events(idem_key) WHERE idem_key IS NOT NULL;
`);

// ---------- 种子数据 ----------
function seed() {
  const countAdmins = db.prepare('SELECT COUNT(*) AS c FROM admins').get().c;
  if (countAdmins === 0) {
    db.prepare('INSERT INTO admins (username, name) VALUES (?, ?)').run('admin', '系统管理员');
  }
  const countReaders = db.prepare('SELECT COUNT(*) AS c FROM readers').get().c;
  if (countReaders === 0) {
    const ins = db.prepare('INSERT INTO readers (card_no, name) VALUES (?, ?)');
    ins.run('R0001', '张三');
    ins.run('R0002', '李四');
    ins.run('R0003', '王五');
  }
  // 首次启动时插入几本示例图书与一条在借记录，方便演示预约流程
  const countBooks = db.prepare('SELECT COUNT(*) AS c FROM books').get().c;
  if (countBooks === 0) {
    const insBook = db.prepare(
      `INSERT INTO books (title, author, isbn, category, stock, price_cents, cover_url)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    const books = [
      ['百年孤独', '加西亚·马尔克斯', '9787544253994', '文学', 2, 5500, ''],
      ['三体', '刘慈欣', '9787536692930', '科技', 1, 4800, ''],
      ['人类简史', '尤瓦尔·赫拉利', '9787508647357', '历史', 2, 6800, ''],
      ['小王子', '圣埃克苏佩里', '9787020042494', '童书', 3, 2800, ''],
    ];
    for (const b of books) insBook.run(...b);
    // 张三借走《三体》（id=2, stock=1），这样李四/王五可以对其发起预约演示
    db.prepare('INSERT INTO loans (book_id, reader_id) VALUES (?, ?)').run(2, 1);
  }
}
seed();

module.exports = db;
