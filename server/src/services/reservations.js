'use strict';

const db = require('../db');
const config = require('../config');
const { notify } = require('./notifications');

// ---------- 基础查询 ----------

function availableCopiesOfBook(bookId) {
  const book = db.prepare('SELECT stock, deleted_at FROM books WHERE id = ?').get(bookId);
  if (!book || book.deleted_at) return 0;
  const onLoan = db
    .prepare("SELECT COUNT(*) AS c FROM loans WHERE book_id = ? AND returned_at IS NULL")
    .get(bookId).c;
  const available = Math.max(0, (book.stock || 0) - onLoan);
  return available;
}

function holdCountOfBook(bookId) {
  return db
    .prepare("SELECT COUNT(*) AS c FROM reservations WHERE book_id = ? AND status = 'READY_FOR_PICKUP'")
    .get(bookId).c;
}

function waitingCountOfBook(bookId) {
  return db
    .prepare("SELECT COUNT(*) AS c FROM reservations WHERE book_id = ? AND status = 'WAITING_NOTIFY'")
    .get(bookId).c;
}

function activeCountOfReader(readerId) {
  return db
    .prepare(
      "SELECT COUNT(*) AS c FROM reservations WHERE reader_id = ? AND status IN ('WAITING_NOTIFY','READY_FOR_PICKUP')"
    )
    .get(readerId).c;
}

function getReaderReservationForBook(readerId, bookId) {
  return db
    .prepare(
      "SELECT * FROM reservations WHERE reader_id = ? AND book_id = ? AND status IN ('WAITING_NOTIFY','READY_FOR_PICKUP')"
    )
    .get(readerId, bookId);
}

function getBookReservationInfo(bookId, readerId /* optional */) {
  const book = db.prepare('SELECT id, title, stock, deleted_at FROM books WHERE id = ? AND deleted_at IS NULL').get(bookId);
  if (!book) return null;
  const available = availableCopiesOfBook(bookId);
  const waiting = waitingCountOfBook(bookId);
  const hold = holdCountOfBook(bookId);
  const freeSlots = available - hold;
  // reservable: 无"即来即借"的空余副本时允许排队（所有副本在借或为预约读者保留中）
  const reservable = freeSlots <= 0;
  let myReservation = null;
  if (readerId) {
    const r = getReaderReservationForBook(readerId, bookId);
    if (r) {
      let queue_position = null;
      if (r.status === 'WAITING_NOTIFY') {
        queue_position =
          db
            .prepare(
              "SELECT COUNT(*) AS c FROM reservations WHERE book_id = ? AND status = 'WAITING_NOTIFY' AND created_at <= ?"
            )
            .get(bookId, r.created_at).c;
      }
      myReservation = { id: r.id, status: r.status, queue_position };
    }
  }
  return {
    book_id: book.id,
    available_copies: available,
    hold_count: hold,
    free_slots: freeSlots,
    waiting_count: waiting,
    reservable,
    my_reservation: myReservation,
    pickup_window_hours: config.PICKUP_WINDOW_HOURS,
    active_limit: config.MAX_ACTIVE_RESERVATIONS_PER_READER,
  };
}

// ---------- 预约单创建 ----------

class ReservationError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function writeNote(reservationId, authorType, authorId, action, note) {
  db.prepare(
    `INSERT INTO reservation_notes (reservation_id, author_type, author_id, action, note)
     VALUES (?, ?, ?, ?, ?)`
  ).run(reservationId, authorType, authorId || null, action, note || null);
}

function createReservation(readerId, bookId) {
  if (!config.RESERVATION_ENABLED) {
    throw new ReservationError('ReservationDisabled', '预约功能已关闭');
  }
  const book = db.prepare('SELECT * FROM books WHERE id = ? AND deleted_at IS NULL').get(bookId);
  if (!book) throw new ReservationError('BookNotFound', '图书不存在');

  const reader = db.prepare('SELECT * FROM readers WHERE id = ?').get(readerId);
  if (!reader) throw new ReservationError('ReaderNotFound', '读者不存在');

  const tx = db.transaction(() => {
    // 资格校验（事务内二次校验）
    if (reader.is_suspended || reader.status === 'SUSPENDED') {
      throw new ReservationError('AccountSuspended', '账号已停借，无法预约');
    }
    if ((reader.outstanding_fine_cents || 0) > config.MAX_OUTSTANDING_FINE_CENTS) {
      throw new ReservationError('OutstandingFineExceeded', '存在未缴欠费，请先缴清后再预约');
    }
    const active = activeCountOfReader(readerId);
    if (active >= config.MAX_ACTIVE_RESERVATIONS_PER_READER) {
      throw new ReservationError(
        'ReservationLimitExceeded',
        `未完成预约已达上限 ${config.MAX_ACTIVE_RESERVATIONS_PER_READER} 本`
      );
    }
    const existing = getReaderReservationForBook(readerId, bookId);
    if (existing) {
      throw new ReservationError('AlreadyReserved', '您已预约过该书，请在「我的预约」中查看');
    }
    const available = availableCopiesOfBook(bookId);
    const hold = holdCountOfBook(bookId);
    const freeSlots = available - hold;
    if (freeSlots > 0) {
      throw new ReservationError('BookNotReservable', '该书当前有在馆可借副本，请直接借阅');
    }

    const info = db
      .prepare(
        `INSERT INTO reservations (book_id, reader_id, status) VALUES (?, ?, 'WAITING_NOTIFY')`
      )
      .run(bookId, readerId);
    const newId = info.lastInsertRowid;
    writeNote(newId, 'READER', readerId, 'CREATE', null);

    // 计算排队位置
    const pos =
      db
        .prepare(
          "SELECT COUNT(*) AS c FROM reservations WHERE book_id = ? AND status = 'WAITING_NOTIFY' AND created_at <= (SELECT created_at FROM reservations WHERE id = ?)"
        )
        .get(bookId, newId).c;

    return { id: newId, queue_position: pos };
  });

  try {
    return tx();
  } catch (e) {
    // 唯一索引兜底并发重复预约
    if (String(e.message || '').includes('UNIQUE') && String(e.message).includes('unq_reservation_reader_book_active')) {
      throw new ReservationError('AlreadyReserved', '您已预约过该书，请在「我的预约」中查看');
    }
    throw e;
  }
}

// ---------- 核心状态机：tryNotifyNext ----------

/**
 * 在当前事务中尝试为某书把一个 WAITING_NOTIFY 推进为 READY_FOR_PICKUP。
 * 前提：事务内可分配名额 = available_copies - hold_count 应当 > 0（由调用方在取消/归还/过期后保证 hold_count 已减少）。
 * 返回 { advanced: true, reservation } 或 { advanced: false }。
 *
 * 注意：该函数使用条件 UPDATE（WHERE status='WAITING_NOTIFY'）保证幂等——并发情况下只有一个事务能成功更新。
 * 通知发送必须发生在事务提交*之后*，否则会出现事务回滚但消息已发的不一致。本函数只更新状态并记录 note，通知由外层发送。
 */
function tryNotifyNextInTx(bookId, context) {
  const available = availableCopiesOfBook(bookId);
  const hold = holdCountOfBook(bookId);
  const freeSlots = available - hold;
  if (freeSlots <= 0) return { advanced: false };

  // 按 created_at 升序取一条 WAITING_NOTIFY
  const next = db
    .prepare(
      "SELECT * FROM reservations WHERE book_id = ? AND status = 'WAITING_NOTIFY' ORDER BY created_at ASC, id ASC LIMIT 1"
    )
    .get(bookId);
  if (!next) return { advanced: false };

  const now = new Date();
  // 使用 SQLite datetime（UTC 字符串）
  const notifiedAt = db.prepare("SELECT datetime('now') AS t").get().t;
  const hours = Number(config.PICKUP_WINDOW_HOURS) | 0;
  const expireAt = db
    .prepare(`SELECT datetime('now', '+' || ? || ' hours') AS t`)
    .get(hours).t;

  // 条件 UPDATE：幂等 + 并发安全
  const info = db
    .prepare(
      `UPDATE reservations
         SET status='READY_FOR_PICKUP', notified_at=?, expire_at=?
       WHERE id=? AND status='WAITING_NOTIFY'`
    )
    .run(notifiedAt, expireAt, next.id);

  if (info.changes === 0) {
    // 被并发处理；调用方可再次尝试
    return { advanced: false };
  }
  writeNote(next.id, 'SYSTEM', null, 'NOTIFY', context?.note || null);

  const updated = db.prepare('SELECT * FROM reservations WHERE id = ?').get(next.id);
  return { advanced: true, reservation: updated };
}

/**
 * 对外入口：事务 + 通知。可能推进多个（比如批量归还多本）；默认推进 1 个（REQ-005：一次归还最多通知 1 人）。
 * @param {number} bookId
 * @param {object} opts { maxAdvances?: number, reason?: string }
 * @returns {Array<object>} 被推进的预约列表
 */
function tryNotifyNext(bookId, opts = {}) {
  const maxAdvances = opts.maxAdvances || 1;
  const advanced = [];
  const runTx = db.transaction(() => {
    for (let i = 0; i < maxAdvances; i++) {
      const r = tryNotifyNextInTx(bookId, { note: opts.reason || 'TRY_NOTIFY' });
      if (!r.advanced) break;
      advanced.push(r.reservation);
    }
  });
  runTx();

  // 事务提交后再发送通知（NFR-006）
  for (const r of advanced) {
    try {
      const book = db.prepare('SELECT title FROM books WHERE id = ?').get(r.book_id);
      notify(r.reader_id, {
        type: 'PICKUP_READY',
        title: '取书通知',
        body: `您预约的《${book ? book.title : ''}》已归还，请在 ${r.expire_at} 前到馆取书。`,
        ref_reservation_id: r.id,
      });
    } catch (e) {
      // 通知失败：写入 outbox 异步补偿（进程内触发，不阻塞主流程）
      enqueueSendMessage(r.reader_id, {
        type: 'PICKUP_READY',
        title: '取书通知',
        body: '您预约的图书已归还，请尽快到馆取书。',
        ref_reservation_id: r.id,
      }, `msg:pickup:${r.id}`);
      console.error('[tryNotifyNext] notify failed, enqueued', e.message);
    }
  }
  return advanced;
}

// ---------- 取消 ----------

function cancelReservation(reservation, opts) {
  const { by, byId, reason, note } = opts || {};
  if (!reservation) throw new ReservationError('NotFound', '预约不存在');
  if (['COMPLETED', 'CANCELLED', 'EXPIRED'].includes(reservation.status)) {
    throw new ReservationError('AlreadyFinished', '该预约已结束，无需取消');
  }
  if (reservation.completed_by_loan_id) {
    throw new ReservationError('AlreadyCompleted', '该预约已完成取书，不可取消');
  }
  const isHold = reservation.status === 'READY_FOR_PICKUP';

  let advanced = [];
  const tx = db.transaction(() => {
    const now = db.prepare("SELECT datetime('now') AS t").get().t;
    db.prepare(
      `UPDATE reservations
         SET status='CANCELLED', cancelled_at=?, cancelled_by=?, cancel_reason=?, cancel_note=?
       WHERE id=?`
    ).run(now, byId, reason, note || null, reservation.id);
    writeNote(
      reservation.id,
      by === 'reader' ? 'READER' : 'ADMIN',
      byId,
      'CANCEL',
      note || (by === 'admin' ? '管理员取消' : '读者取消')
    );
    // REQ-004.2 / REQ-006.1：仅 READY_FOR_PICKUP 取消时释放保留名额并触发顺延
    if (isHold) {
      const res = tryNotifyNextInTx(reservation.book_id, { note: 'CANCEL_HANDOFF' });
      if (res.advanced) advanced.push(res.reservation);
    }
  });
  tx();

  // 事务提交后发送顺延通知
  for (const r of advanced) {
    try {
      const book = db.prepare('SELECT title FROM books WHERE id = ?').get(r.book_id);
      notify(r.reader_id, {
        type: 'PICKUP_READY',
        title: '取书通知',
        body: `您预约的《${book ? book.title : ''}》已可取书，请在 ${r.expire_at} 前到馆取书。`,
        ref_reservation_id: r.id,
      });
    } catch (e) {
      enqueueSendMessage(r.reader_id, {
        type: 'PICKUP_READY', title: '取书通知', body: '您预约的图书已可取书，请尽快到馆取书。',
        ref_reservation_id: r.id,
      }, `msg:pickup:${r.id}`);
    }
  }
  return { advanced };
}

// ---------- 过期扫描 ----------

function expireOverdue() {
  const ready = db
    .prepare(
      `SELECT * FROM reservations
        WHERE status='READY_FOR_PICKUP' AND expire_at IS NOT NULL AND expire_at <= datetime('now')`
    )
    .all();
  const advancedAll = [];
  for (const r of ready) {
    let advanced = [];
    const tx = db.transaction(() => {
      const info = db
        .prepare(
          `UPDATE reservations
             SET status='EXPIRED', expired_at=datetime('now')
           WHERE id=? AND status='READY_FOR_PICKUP' AND expire_at <= datetime('now')`
        )
        .run(r.id);
      if (info.changes === 0) return;
      writeNote(r.id, 'SYSTEM', null, 'EXPIRE', '超过取书有效期自动过期');
      // 过期后顺延
      const next = tryNotifyNextInTx(r.book_id, { note: 'EXPIRE_HANDOFF' });
      if (next.advanced) advanced.push(next.reservation);
    });
    tx();

    // 发过期站内信
    try {
      const book = db.prepare('SELECT title FROM books WHERE id = ?').get(r.book_id);
      notify(r.reader_id, {
        type: 'EXPIRED',
        title: '预约过期',
        body: `您预约的《${book ? book.title : ''}》因超时未取已自动取消，名额已顺延给下一位读者。`,
        ref_reservation_id: r.id,
      });
    } catch (e) {
      enqueueSendMessage(r.reader_id, {
        type: 'EXPIRED', title: '预约过期', body: '您的预约因超时未取已自动取消。',
        ref_reservation_id: r.id,
      }, `msg:expired:${r.id}`);
    }
    for (const nx of advanced) {
      try {
        const book = db.prepare('SELECT title FROM books WHERE id = ?').get(nx.book_id);
        notify(nx.reader_id, {
          type: 'PICKUP_READY',
          title: '取书通知',
          body: `您预约的《${book ? book.title : ''}》已可取书，请在 ${nx.expire_at} 前到馆取书。`,
          ref_reservation_id: nx.id,
        });
      } catch (e) {
        enqueueSendMessage(nx.reader_id, {
          type: 'PICKUP_READY', title: '取书通知', body: '您预约的图书已可取书，请尽快到馆取书。',
          ref_reservation_id: nx.id,
        }, `msg:pickup:${nx.id}`);
      }
      advancedAll.push(nx);
    }
  }
  return { expired: ready.length, advanced: advancedAll.length };
}

// ---------- 借出时自动完成匹配的 READY_FOR_PICKUP ----------

/**
 * 读者借出某书时，若该读者对该书存在 READY_FOR_PICKUP 预约，则将其置为 COMPLETED。
 * 不阻塞借出（NFR-005）：由借还接口在 outbox 中派发，worker 消费后调用。
 */
function completeMatchedReservation(loanId, readerId, bookId) {
  const tx = db.transaction(() => {
    const r = db
      .prepare(
        "SELECT * FROM reservations WHERE reader_id=? AND book_id=? AND status='READY_FOR_PICKUP' ORDER BY notified_at ASC, id ASC LIMIT 1"
      )
      .get(readerId, bookId);
    if (!r) return null;
    const info = db
      .prepare(
        `UPDATE reservations
           SET status='COMPLETED', completed_at=datetime('now'), completed_by_loan_id=?
         WHERE id=? AND status='READY_FOR_PICKUP'`
      )
      .run(loanId, r.id);
    if (info.changes === 0) return null;
    writeNote(r.id, 'SYSTEM', null, 'COMPLETE', `借出流水 #${loanId} 完成取书`);
    return r;
  });
  return tx();
}

// ---------- 预约列表查询 ----------

function decorateReservationRow(row) {
  const finished_at = row.completed_at || row.cancelled_at || row.expired_at || null;
  let finish_reason = null;
  if (row.status === 'COMPLETED') finish_reason = '已完成取书';
  else if (row.status === 'CANCELLED') {
    finish_reason = row.cancel_reason === 'ADMIN_CANCEL' ? '管理员取消' : '读者取消';
  } else if (row.status === 'EXPIRED') finish_reason = '超时未取';
  return {
    id: row.id,
    book_id: row.book_id,
    book_title: row.book_title,
    book_author: row.book_author,
    book_cover_url: row.book_cover_url,
    book_isbn: row.book_isbn,
    reader_id: row.reader_id,
    reader_name: row.reader_name,
    reader_card_no: row.reader_card_no,
    status: row.status,
    created_at: row.created_at,
    notified_at: row.notified_at,
    expire_at: row.expire_at,
    completed_at: row.completed_at,
    cancelled_at: row.cancelled_at,
    cancelled_by: row.cancelled_by,
    cancel_reason: row.cancel_reason,
    cancel_note: row.cancel_note,
    expired_at: row.expired_at,
    completed_by_loan_id: row.completed_by_loan_id,
    finished_at,
    finish_reason,
  };
}

function listReaderReservations(readerId, { status, page, pageSize }) {
  const where = ['r.reader_id = ?'];
  const params = [readerId];
  if (status) {
    const list = status.split(',').map((s) => s.trim()).filter(Boolean);
    if (list.length) {
      where.push(`r.status IN (${list.map(() => '?').join(',')})`);
      params.push(...list);
    }
  }
  const whereSql = where.join(' AND ');
  const total = db
    .prepare(`SELECT COUNT(*) AS c FROM reservations r WHERE ${whereSql}`)
    .get(...params).c;
  const rows = db
    .prepare(
      `SELECT r.*, b.title AS book_title, b.author AS book_author, b.cover_url AS book_cover_url, b.isbn AS book_isbn,
              rd.name AS reader_name, rd.card_no AS reader_card_no
         FROM reservations r
         JOIN books b ON b.id = r.book_id
         JOIN readers rd ON rd.id = r.reader_id
        WHERE ${whereSql}
        ORDER BY r.created_at DESC, r.id DESC
        LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, (page - 1) * pageSize);

  // 为 WAITING_NOTIFY 行计算排队位置（n+1：前面同书 WAITING_NOTIFY 中早于它的人数）
  const items = rows.map((row) => {
    const d = decorateReservationRow(row);
    if (d.status === 'WAITING_NOTIFY') {
      d.queue_position =
        db
          .prepare(
            "SELECT COUNT(*) AS c FROM reservations WHERE book_id=? AND status='WAITING_NOTIFY' AND (created_at < ? OR (created_at = ? AND id <= ?))"
          )
          .get(row.book_id, row.created_at, row.created_at, row.id).c;
    } else {
      d.queue_position = null;
    }
    return d;
  });

  return { total, items, page, page_size: pageSize };
}

function listAdminReservations({ readerKeyword, bookKeyword, status, reservedFrom, reservedTo, notifiedFrom, notifiedTo, page, pageSize }) {
  const where = ['1=1'];
  const params = [];
  if (status) {
    const list = status.split(',').map((s) => s.trim()).filter(Boolean);
    if (list.length) { where.push(`r.status IN (${list.map(() => '?').join(',')})`); params.push(...list); }
  }
  if (readerKeyword) {
    where.push('(rd.name LIKE ? OR rd.card_no LIKE ?)');
    const kw = `%${readerKeyword}%`;
    params.push(kw, kw);
  }
  if (bookKeyword) {
    where.push('(b.title LIKE ? OR b.isbn LIKE ?)');
    const kw = `%${bookKeyword}%`;
    params.push(kw, kw);
  }
  if (reservedFrom) { where.push('r.created_at >= ?'); params.push(reservedFrom); }
  if (reservedTo) { where.push('r.created_at <= ?'); params.push(reservedTo); }
  if (notifiedFrom) { where.push('r.notified_at >= ?'); params.push(notifiedFrom); }
  if (notifiedTo) { where.push('r.notified_at <= ?'); params.push(notifiedTo); }
  const whereSql = where.join(' AND ');
  const total = db.prepare(`SELECT COUNT(*) AS c FROM reservations r JOIN books b ON b.id=r.book_id JOIN readers rd ON rd.id=r.reader_id WHERE ${whereSql}`).get(...params).c;
  const rows = db
    .prepare(
      `SELECT r.*, b.title AS book_title, b.author AS book_author, b.cover_url AS book_cover_url, b.isbn AS book_isbn,
              rd.name AS reader_name, rd.card_no AS reader_card_no
         FROM reservations r
         JOIN books b ON b.id = r.book_id
         JOIN readers rd ON rd.id = r.reader_id
        WHERE ${whereSql}
        ORDER BY r.created_at DESC, r.id DESC
        LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, (page - 1) * pageSize);
  return { total, items: rows.map(decorateReservationRow), page, page_size: pageSize };
}

function getReservationDetail(id) {
  const row = db
    .prepare(
      `SELECT r.*, b.title AS book_title, b.author AS book_author, b.cover_url AS book_cover_url, b.isbn AS book_isbn,
              rd.name AS reader_name, rd.card_no AS reader_card_no
         FROM reservations r
         JOIN books b ON b.id = r.book_id
         JOIN readers rd ON rd.id = r.reader_id
        WHERE r.id = ?`
    )
    .get(id);
  if (!row) return null;
  const notes = db
    .prepare('SELECT * FROM reservation_notes WHERE reservation_id = ? ORDER BY created_at ASC, id ASC')
    .all(id);
  const detail = decorateReservationRow(row);
  if (detail.status === 'WAITING_NOTIFY') {
    detail.queue_position =
      db
        .prepare(
          "SELECT COUNT(*) AS c FROM reservations WHERE book_id=? AND status='WAITING_NOTIFY' AND (created_at < ? OR (created_at = ? AND id <= ?))"
        )
        .get(row.book_id, row.created_at, row.created_at, row.id).c;
  } else {
    detail.queue_position = null;
  }
  return { ...detail, notes };
}

function addAdminNote(reservationId, adminId, content) {
  const r = db.prepare('SELECT id FROM reservations WHERE id = ?').get(reservationId);
  if (!r) throw new ReservationError('NotFound', '预约不存在');
  const info = db
    .prepare(
      `INSERT INTO reservation_notes (reservation_id, author_type, author_id, action, note) VALUES (?, 'ADMIN', ?, 'NOTE', ?)`
    )
    .run(reservationId, adminId, content);
  return db.prepare('SELECT * FROM reservation_notes WHERE id = ?').get(info.lastInsertRowid);
}

// ---------- Outbox ----------

function enqueueEvent(bookId, type, payload, idemKey) {
  try {
    db.prepare(
      `INSERT INTO reservation_events (book_id, type, payload, idem_key) VALUES (?, ?, ?, ?)`
    ).run(bookId, type, JSON.stringify(payload || {}), idemKey || null);
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return; // 幂等
    console.error('[enqueueEvent] failed', e);
  }
}

function enqueueSendMessage(readerId, message, idemKey) {
  enqueueEvent(null, 'SEND_MESSAGE', { readerId, message }, idemKey);
}

function enqueueTryNotifyNext(bookId, reason, idemKey) {
  enqueueEvent(bookId, 'TRY_NOTIFY', { reason }, idemKey || `try:${bookId}:${Date.now()}:${Math.random()}`);
}

function enqueueCompleteByLoan(loanId, readerId, bookId, idemKey) {
  enqueueEvent(bookId, 'COMPLETE_BY_LOAN', { loanId, readerId, bookId }, idemKey || `loan:${loanId}`);
}

function drainOutboxOnce() {
  // 取最早一条未处理事件
  const ev = db
    .prepare(`SELECT * FROM reservation_events WHERE processed_at IS NULL ORDER BY created_at ASC, id ASC LIMIT 1`)
    .get();
  if (!ev) return false;
  try {
    if (ev.type === 'TRY_NOTIFY') {
      // 注意：归还事件一次最多通知 1 人
      if (ev.book_id) tryNotifyNext(ev.book_id, { maxAdvances: 1, reason: 'OUTBOX' });
    } else if (ev.type === 'COMPLETE_BY_LOAN') {
      const p = JSON.parse(ev.payload);
      completeMatchedReservation(p.loanId, p.readerId, p.bookId);
    } else if (ev.type === 'SEND_MESSAGE') {
      const p = JSON.parse(ev.payload);
      notify(p.readerId, p.message);
    }
    db.prepare(`UPDATE reservation_events SET processed_at=datetime('now'), attempts=attempts+1 WHERE id=?`).run(ev.id);
  } catch (e) {
    console.error('[drainOutbox] event failed', ev.id, e.message);
    db.prepare(
      `UPDATE reservation_events SET attempts=attempts+1, last_error=? WHERE id=?`
    ).run(String(e.message || e), ev.id);
    // 简单指数退避：attempts>=20 就放弃并告警（MVP 仅打日志）
    if (ev.attempts + 1 >= 20) {
      db.prepare(`UPDATE reservation_events SET processed_at=datetime('now'), last_error=? WHERE id=?`)
        .run(`[ABANDONED] ${String(e.message || e)}`, ev.id);
    }
  }
  return true;
}

function startOutboxWorker() {
  return setInterval(() => {
    try {
      // 一次循环处理一批（最多 50 条），避免卡住
      for (let i = 0; i < 50; i++) {
        const had = drainOutboxOnce();
        if (!had) break;
      }
    } catch (e) {
      console.error('[outbox worker] error', e);
    }
  }, config.OUTBOX_POLL_INTERVAL_MS);
}

function startExpireSweeper() {
  // 启动先跑一次
  try { expireOverdue(); } catch (e) { console.error('[expireSweeper] initial run failed', e); }
  return setInterval(() => {
    try { expireOverdue(); } catch (e) { console.error('[expireSweeper] error', e); }
  }, config.EXPIRE_SWEEP_INTERVAL_MS);
}

module.exports = {
  // constants / errors
  ReservationError,
  // queries
  availableCopiesOfBook,
  holdCountOfBook,
  waitingCountOfBook,
  activeCountOfReader,
  getBookReservationInfo,
  getReaderReservationForBook,
  getReservationDetail,
  // commands
  createReservation,
  cancelReservation,
  completeMatchedReservation,
  expireOverdue,
  tryNotifyNext,
  tryNotifyNextInTx,
  listReaderReservations,
  listAdminReservations,
  addAdminNote,
  decorateReservationRow,
  writeNote,
  // outbox / scheduler
  enqueueEvent,
  enqueueTryNotifyNext,
  enqueueCompleteByLoan,
  enqueueSendMessage,
  drainOutboxOnce,
  startOutboxWorker,
  startExpireSweeper,
};
