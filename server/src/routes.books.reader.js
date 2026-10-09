'use strict';

const express = require('express');
const db = require('./db');
const { CATEGORIES, toExternal } = require('./validators');
const { requireAny } = require('./middleware/auth');

const router = express.Router();
router.use(requireAny);

router.get('/categories', (req, res) => {
  res.json({ list: CATEGORIES });
});

// 列表（与管理员列表逻辑一致，但不暴露软删相关行为）
router.get('/', (req, res) => {
  try {
    const keyword = typeof req.query.keyword === 'string' ? req.query.keyword.trim() : '';
    const category = typeof req.query.category === 'string' ? req.query.category.trim() : '';
    const page = Math.max(1, parseInt(req.query.page || '1', 10) || 1);
    let pageSize = parseInt(req.query.page_size || '10', 10) || 10;
    if (pageSize < 1) pageSize = 10;
    if (pageSize > 100) pageSize = 100;

    if (category && !CATEGORIES.includes(category)) {
      return res.status(400).json({ code: 'InvalidCategory', message: '请选择有效的分类' });
    }
    const where = ['deleted_at IS NULL'];
    const params = [];
    if (keyword) {
      where.push('(title LIKE ? OR author LIKE ? OR isbn LIKE ?)');
      const kw = `%${keyword}%`;
      params.push(kw, kw, kw);
    }
    if (category) {
      where.push('category = ?');
      params.push(category);
    }
    const whereSql = where.join(' AND ');

    const total = db.prepare(`SELECT COUNT(*) AS c FROM books WHERE ${whereSql}`).get(...params).c;
    const rows = db
      .prepare(
        `SELECT id, title, author, isbn, category, stock, price_cents, cover_url, created_at, updated_at
         FROM books WHERE ${whereSql}
         ORDER BY created_at DESC, id DESC
         LIMIT ? OFFSET ?`
      )
      .all(...params, pageSize, (page - 1) * pageSize);
    res.json({ list: rows.map(toExternal), total, page, page_size: pageSize });
  } catch (err) {
    console.error('[ReaderListBooks] error', err);
    res.status(500).json({ code: 'InternalError', message: '获取列表失败' });
  }
});

router.get('/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ code: 'InvalidParameter', message: '参数非法' });
    }
    const row = db.prepare('SELECT * FROM books WHERE id = ? AND deleted_at IS NULL').get(id);
    if (!row) return res.status(404).json({ code: 'BookNotFound', message: '图书不存在' });
    res.json(toExternal(row));
  } catch (err) {
    console.error('[ReaderGetBook] error', err);
    res.status(500).json({ code: 'InternalError', message: '获取详情失败' });
  }
});

module.exports = router;
