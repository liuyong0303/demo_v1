'use strict';

const express = require('express');
const db = require('./db');

const router = express.Router();

// 供 demo 使用的用户列表（无真实登录；前端通过 X-User-Role / X-User-Id 头切换）
router.get('/users', (_req, res) => {
  const admins = db.prepare('SELECT id, username, name FROM admins ORDER BY id ASC').all();
  const readers = db.prepare('SELECT id, card_no, name, status, is_suspended, outstanding_fine_cents FROM readers ORDER BY id ASC').all();
  res.json({
    admins: admins.map((a) => ({ ...a, role: 'admin' })),
    readers: readers.map((r) => ({
      ...r,
      role: 'reader',
      suspended: !!r.is_suspended || r.status === 'SUSPENDED',
      fine_yuan: Number((r.outstanding_fine_cents / 100).toFixed(2)),
    })),
  });
});

module.exports = router;
