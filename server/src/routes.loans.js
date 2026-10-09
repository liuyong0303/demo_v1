'use strict';

const express = require('express');
const db = require('./db');
const { enqueueTryNotifyNext, enqueueCompleteByLoan } = require('./services/reservations');

const router = express.Router();

// 简易借阅 / 归还（最小骨架，便于演示预约闭环；不做复杂借阅规则校验）
// POST /api/loans/loan  { book_id }  —— 当前登录读者借出一本书（要求有可借副本）
router.post('/loan', (req, res) => {
  try {
    if (!req.user || req.user.kind !== 'reader') {
      return res.status(401).json({ code: 'Unauthorized', message: '请以读者身份登录后再借阅' });
    }
    const readerId = req.user.id;
    const bookId = Number(req.body?.book_id);
    if (!Number.isInteger(bookId) || bookId <= 0) {
      return res.status(400).json({ code: 'InvalidParameter', message: '参数非法' });
    }
    const book = db.prepare('SELECT * FROM books WHERE id = ? AND deleted_at IS NULL').get(bookId);
    if (!book) return res.status(404).json({ code: 'BookNotFound', message: '图书不存在' });

    // 计算当前在借数
    const onLoan = db.prepare("SELECT COUNT(*) AS c FROM loans WHERE book_id=? AND returned_at IS NULL").get(bookId).c;
    if (onLoan >= book.stock) {
      return res.status(409).json({ code: 'NoAvailableCopy', message: '该书无在馆可借副本，可先去预约排队' });
    }
    // 同一读者是否已在借该书（简单去重）
    const existing = db.prepare("SELECT id FROM loans WHERE book_id=? AND reader_id=? AND returned_at IS NULL").get(bookId, readerId);
    if (existing) {
      return res.status(409).json({ code: 'AlreadyLoaned', message: '您已在借该书，请勿重复借阅' });
    }

    const info = db.prepare(`INSERT INTO loans (book_id, reader_id) VALUES (?, ?)`).run(bookId, readerId);
    const loanId = info.lastInsertRowid;

    // NFR-005：借出成功后异步尝试自动完成匹配预约（不阻塞/不回滚主流程）
    try { enqueueCompleteByLoan(loanId, readerId, bookId); } catch (e) { console.error('[loan] enqueue complete failed', e); }

    const loan = db.prepare('SELECT * FROM loans WHERE id = ?').get(loanId);
    res.status(201).json(loan);
  } catch (err) {
    console.error('[LoanBook] error', err);
    res.status(500).json({ code: 'InternalError', message: '借阅失败，请稍后重试' });
  }
});

// POST /api/loans/return { loan_id } —— 归还某条借阅流水；或 { book_id } 归还当前读者最早一本
router.post('/return', (req, res) => {
  try {
    if (!req.user || req.user.kind !== 'reader') {
      return res.status(401).json({ code: 'Unauthorized', message: '请以读者身份登录后再归还' });
    }
    const readerId = req.user.id;
    const loanId = req.body?.loan_id ? Number(req.body.loan_id) : null;
    const bookId = req.body?.book_id ? Number(req.body.book_id) : null;

    let loan;
    if (loanId && Number.isInteger(loanId)) {
      loan = db.prepare('SELECT * FROM loans WHERE id = ? AND returned_at IS NULL').get(loanId);
      if (!loan) return res.status(404).json({ code: 'LoanNotFound', message: '借阅记录不存在或已归还' });
      if (loan.reader_id !== readerId) return res.status(403).json({ code: 'Forbidden', message: '该借阅记录不属于当前读者' });
    } else if (bookId && Number.isInteger(bookId)) {
      loan = db
        .prepare("SELECT * FROM loans WHERE book_id=? AND reader_id=? AND returned_at IS NULL ORDER BY loaned_at ASC, id ASC LIMIT 1")
        .get(bookId, readerId);
      if (!loan) return res.status(404).json({ code: 'LoanNotFound', message: '您没有在借该书' });
    } else {
      return res.status(400).json({ code: 'InvalidParameter', message: '请提供 loan_id 或 book_id' });
    }

    db.prepare(`UPDATE loans SET returned_at=datetime('now') WHERE id=?`).run(loan.id);
    const returned = db.prepare('SELECT * FROM loans WHERE id = ?').get(loan.id);

    // NFR-002/005：归还后异步触发预约顺延/通知（不阻塞主流程）
    try { enqueueTryNotifyNext(loan.book_id, 'RETURN', `return:${loan.id}`); } catch (e) { console.error('[return] enqueue failed', e); }

    res.json(returned);
  } catch (err) {
    console.error('[ReturnBook] error', err);
    res.status(500).json({ code: 'InternalError', message: '归还失败，请稍后重试' });
  }
});

// GET /api/loans/me —— 当前读者的借阅记录
router.get('/me', (req, res) => {
  try {
    if (!req.user || req.user.kind !== 'reader') {
      return res.status(401).json({ code: 'Unauthorized', message: '请以读者身份登录' });
    }
    const readerId = req.user.id;
    const onlyOpen = req.query.open === '1' || req.query.open === 'true';
    const where = ['l.reader_id = ?'];
    const params = [readerId];
    if (onlyOpen) where.push('l.returned_at IS NULL');
    const rows = db.prepare(
      `SELECT l.*, b.title AS book_title, b.author AS book_author, b.cover_url AS book_cover_url
         FROM loans l JOIN books b ON b.id = l.book_id
        WHERE ${where.join(' AND ')}
        ORDER BY l.loaned_at DESC, l.id DESC`
    ).all(...params);
    res.json({ items: rows });
  } catch (err) {
    console.error('[MyLoans] error', err);
    res.status(500).json({ code: 'InternalError', message: '获取借阅记录失败' });
  }
});

module.exports = router;
