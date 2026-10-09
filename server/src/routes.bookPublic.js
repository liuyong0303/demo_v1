'use strict';

const express = require('express');
const db = require('./db');
const svc = require('./services/reservations');
const config = require('./config');

const router = express.Router();

// GET /api/books/:id/reservation —— 公开可读（排队人数）；若以读者登录则同时返回 my_reservation
router.get('/:id/reservation', (req, res) => {
  try {
    const bookId = Number(req.params.id);
    if (!Number.isInteger(bookId) || bookId <= 0) {
      return res.status(400).json({ code: 'InvalidParameter', message: '参数非法' });
    }
    const readerId = req.user?.kind === 'reader' ? req.user.id : null;
    const info = svc.getBookReservationInfo(bookId, readerId);
    if (!info) return res.status(404).json({ code: 'BookNotFound', message: '图书不存在' });
    info.enabled = config.RESERVATION_ENABLED;
    res.json(info);
  } catch (err) {
    console.error('[GetBookReservationInfo] error', err);
    res.status(500).json({ code: 'InternalError', message: '获取预约信息失败' });
  }
});

module.exports = router;
