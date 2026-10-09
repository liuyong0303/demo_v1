'use strict';

const express = require('express');
const db = require('./db');
const svc = require('./services/reservations');
const config = require('./config');

const router = express.Router();

const STATUS_ENUM = ['WAITING_NOTIFY', 'READY_FOR_PICKUP', 'COMPLETED', 'CANCELLED', 'EXPIRED'];

function parsePagination(query) {
  const page = Math.max(1, parseInt(query.page || '1', 10) || 1);
  let pageSize = parseInt(query.page_size || '10', 10) || 10;
  if (pageSize < 1) pageSize = 10;
  if (pageSize > 50) pageSize = 50;
  return { page, pageSize };
}

function parseStatusFilter(raw, allowMulti = true) {
  if (!raw) return '';
  const parts = String(raw).split(',').map((s) => s.trim()).filter(Boolean);
  const invalid = parts.find((s) => !STATUS_ENUM.includes(s));
  if (invalid) return { error: invalid };
  if (!allowMulti && parts.length > 1) return { error: parts[1] };
  return { value: parts.join(',') };
}

// POST /api/reservations  —— 读者发起预约
router.post('/', (req, res) => {
  try {
    if (!req.user || req.user.kind !== 'reader') {
      return res.status(401).json({ code: 'Unauthorized', message: '请先登录读者账号' });
    }
    const bookId = Number(req.body?.book_id);
    if (!Number.isInteger(bookId) || bookId <= 0) {
      return res.status(400).json({ code: 'InvalidParameter', message: '参数非法' });
    }
    const { id, queue_position } = svc.createReservation(req.user.id, bookId);
    const row = db.prepare('SELECT * FROM reservations WHERE id = ?').get(id);
    res.status(201).json({
      id: row.id, book_id: row.book_id, reader_id: row.reader_id,
      status: row.status, created_at: row.created_at, queue_position,
    });
  } catch (err) {
    if (err instanceof svc.ReservationError) {
      const statusMap = {
        BookNotFound: 404,
        ReaderNotFound: 404,
        ReservationDisabled: 503,
        AccountSuspended: 403,
        OutstandingFineExceeded: 403,
        ReservationLimitExceeded: 403,
        AlreadyReserved: 409,
        BookNotReservable: 400,
      };
      return res.status(statusMap[err.code] || 400).json({ code: err.code, message: err.message });
    }
    console.error('[CreateReservation] error', err);
    res.status(500).json({ code: 'InternalError', message: '预约失败，请稍后重试' });
  }
});

// GET /api/reservations/me  —— 读者查看本人预约列表
router.get('/me', (req, res) => {
  try {
    if (!req.user || req.user.kind !== 'reader') {
      return res.status(401).json({ code: 'Unauthorized', message: '请先登录读者账号' });
    }
    const { page, pageSize } = parsePagination(req.query);
    const parsed = parseStatusFilter(req.query.status);
    if (parsed && parsed.error) {
      return res.status(400).json({ code: 'InvalidStatus', message: `非法的状态值：${parsed.error}` });
    }
    const result = svc.listReaderReservations(req.user.id, { status: parsed.value, page, pageSize });
    res.json(result);
  } catch (err) {
    console.error('[ListMyReservations] error', err);
    res.status(500).json({ code: 'InternalError', message: '获取预约列表失败' });
  }
});

// POST /api/reservations/:id/cancel  —— 读者取消本人预约
router.post('/:id/cancel', (req, res) => {
  try {
    if (!req.user || req.user.kind !== 'reader') {
      return res.status(401).json({ code: 'Unauthorized', message: '请先登录读者账号' });
    }
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ code: 'InvalidParameter', message: '参数非法' });
    }
    const r = db.prepare('SELECT * FROM reservations WHERE id = ?').get(id);
    if (!r) return res.status(404).json({ code: 'NotFound', message: '预约不存在' });
    if (r.reader_id !== req.user.id) return res.status(403).json({ code: 'NotOwner', message: '无权操作他人的预约' });
    svc.cancelReservation(r, { by: 'reader', byId: req.user.id, reason: 'READER_CANCEL' });
    const updated = db.prepare('SELECT * FROM reservations WHERE id = ?').get(id);
    res.json({ id: updated.id, status: updated.status });
  } catch (err) {
    if (err instanceof svc.ReservationError) {
      const statusMap = { NotFound: 404, AlreadyFinished: 409, AlreadyCompleted: 409 };
      return res.status(statusMap[err.code] || 400).json({ code: err.code, message: err.message });
    }
    console.error('[CancelMyReservation] error', err);
    res.status(500).json({ code: 'InternalError', message: '取消失败，请稍后重试' });
  }
});

module.exports = router;
