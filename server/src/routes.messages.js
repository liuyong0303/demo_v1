'use strict';

const express = require('express');
const db = require('./db');

const router = express.Router();

// GET /api/messages/me
router.get('/me', (req, res) => {
  try {
    if (!req.user || req.user.kind !== 'reader') {
      return res.status(401).json({ code: 'Unauthorized', message: '请先登录读者账号' });
    }
    const unreadOnly = req.query.unread === '1' || req.query.unread === 'true';
    const where = ['reader_id = ?'];
    const params = [req.user.id];
    if (unreadOnly) where.push('is_read = 0');
    const rows = db.prepare(
      `SELECT * FROM messages WHERE ${where.join(' AND ')} ORDER BY created_at DESC, id DESC LIMIT 200`
    ).all(...params);
    const unread = db.prepare('SELECT COUNT(*) AS c FROM messages WHERE reader_id = ? AND is_read = 0').get(req.user.id).c;
    res.json({ items: rows, unread_count: unread });
  } catch (err) {
    console.error('[ListMessages] error', err);
    res.status(500).json({ code: 'InternalError', message: '获取消息失败' });
  }
});

// POST /api/messages/:id/read
router.post('/:id/read', (req, res) => {
  try {
    if (!req.user || req.user.kind !== 'reader') {
      return res.status(401).json({ code: 'Unauthorized', message: '请先登录读者账号' });
    }
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ code: 'InvalidParameter', message: '参数非法' });
    const m = db.prepare('SELECT * FROM messages WHERE id = ?').get(id);
    if (!m) return res.status(404).json({ code: 'NotFound', message: '消息不存在' });
    if (m.reader_id !== req.user.id) return res.status(403).json({ code: 'Forbidden', message: '无权操作' });
    db.prepare('UPDATE messages SET is_read = 1 WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (err) {
    console.error('[ReadMessage] error', err);
    res.status(500).json({ code: 'InternalError', message: '操作失败' });
  }
});

// POST /api/messages/read_all
router.post('/read_all', (req, res) => {
  try {
    if (!req.user || req.user.kind !== 'reader') {
      return res.status(401).json({ code: 'Unauthorized', message: '请先登录读者账号' });
    }
    db.prepare('UPDATE messages SET is_read = 1 WHERE reader_id = ?').run(req.user.id);
    res.json({ success: true });
  } catch (err) {
    console.error('[ReadAllMessages] error', err);
    res.status(500).json({ code: 'InternalError', message: '操作失败' });
  }
});

module.exports = router;
