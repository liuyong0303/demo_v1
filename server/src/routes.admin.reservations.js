'use strict';

const express = require('express');
const db = require('./db');
const svc = require('./services/reservations');

const router = express.Router();

function parsePagination(query) {
  const page = Math.max(1, parseInt(query.page || '1', 10) || 1);
  let pageSize = parseInt(query.page_size || '10', 10) || 10;
  if (pageSize < 1) pageSize = 10;
  if (pageSize > 100) pageSize = 100;
  return { page, pageSize };
}

// GET /api/admin/reservations
router.get('/', (req, res) => {
  try {
    const { page, pageSize } = parsePagination(req.query);
    const result = svc.listAdminReservations({
      readerKeyword: typeof req.query.reader_keyword === 'string' ? req.query.reader_keyword.trim() : '',
      bookKeyword: typeof req.query.book_keyword === 'string' ? req.query.book_keyword.trim() : '',
      status: typeof req.query.status === 'string' ? req.query.status.trim() : '',
      reservedFrom: typeof req.query.reserved_from === 'string' ? req.query.reserved_from : '',
      reservedTo: typeof req.query.reserved_to === 'string' ? req.query.reserved_to : '',
      notifiedFrom: typeof req.query.notified_from === 'string' ? req.query.notified_from : '',
      notifiedTo: typeof req.query.notified_to === 'string' ? req.query.notified_to : '',
      page,
      pageSize,
    });
    res.json(result);
  } catch (err) {
    console.error('[AdminListReservations] error', err);
    res.status(500).json({ code: 'InternalError', message: '获取预约列表失败' });
  }
});

// GET /api/admin/reservations/:id
router.get('/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ code: 'InvalidParameter', message: '参数非法' });
    const detail = svc.getReservationDetail(id);
    if (!detail) return res.status(404).json({ code: 'NotFound', message: '预约不存在' });
    res.json(detail);
  } catch (err) {
    console.error('[AdminGetReservation] error', err);
    res.status(500).json({ code: 'InternalError', message: '获取详情失败' });
  }
});

// POST /api/admin/reservations/:id/cancel
router.post('/:id/cancel', (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ code: 'InvalidParameter', message: '参数非法' });
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
    if (!reason) return res.status(400).json({ code: 'ReasonRequired', message: '请填写取消原因' });
    const r = db.prepare('SELECT * FROM reservations WHERE id = ?').get(id);
    if (!r) return res.status(404).json({ code: 'NotFound', message: '预约不存在' });
    svc.cancelReservation(r, {
      by: 'admin',
      byId: req.user.id,
      reason: 'ADMIN_CANCEL',
      note: reason,
    });
    const updated = db.prepare('SELECT * FROM reservations WHERE id = ?').get(id);
    res.json({ id: updated.id, status: updated.status });
  } catch (err) {
    if (err instanceof svc.ReservationError) {
      const statusMap = { NotFound: 404, AlreadyFinished: 409, AlreadyCompleted: 409 };
      return res.status(statusMap[err.code] || 400).json({ code: err.code, message: err.message });
    }
    console.error('[AdminCancelReservation] error', err);
    res.status(500).json({ code: 'InternalError', message: '取消失败，请稍后重试' });
  }
});

// POST /api/admin/reservations/:id/notes
router.post('/:id/notes', (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ code: 'InvalidParameter', message: '参数非法' });
    const content = typeof req.body?.content === 'string' ? req.body.content.trim() : '';
    if (!content) return res.status(400).json({ code: 'ContentRequired', message: '备注内容不能为空' });
    const note = svc.addAdminNote(id, req.user.id, content);
    res.status(201).json(note);
  } catch (err) {
    if (err instanceof svc.ReservationError) {
      return res.status(404).json({ code: 'NotFound', message: err.message });
    }
    console.error('[AdminAddNote] error', err);
    res.status(500).json({ code: 'InternalError', message: '添加备注失败' });
  }
});

module.exports = router;
