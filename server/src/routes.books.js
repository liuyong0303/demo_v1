const express = require('express');
const db = require('./db');
const { CATEGORIES, validateBookPayload, toExternal, normalizeISBN } = require('./validators');

const router = express.Router();

// TODO(auth): 接入管理员鉴权中间件；目前 demo 环境下默认放行，
// 在生产环境应在此处校验登录态与角色，未通过则返回 401/403。
function requireAdmin(req, res, next) {
  // 鉴权接入点示例：
  // const user = req.user;
  // if (!user) return res.status(401).json({ code: 'Unauthorized', message: '未登录' });
  // if (user.role !== 'admin') return res.status(403).json({ code: 'Forbidden', message: '你没有访问该页面的权限' });
  next();
}

router.use(requireAdmin);

// 分类枚举（便于前端拉取）
router.get('/categories', (req, res) => {
  res.json({ list: CATEGORIES });
});

// 列表：GET /api/books?keyword=&category=&page=1&page_size=10
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
      // OR 模糊匹配书名/作者/ISBN；ISBN 支持子串
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

    res.json({
      list: rows.map(toExternal),
      total,
      page,
      page_size: pageSize,
    });
  } catch (err) {
    console.error('[ListBooks] error', err);
    res.status(500).json({ code: 'InternalError', message: '获取列表失败，请稍后重试' });
  }
});

// 详情：GET /api/books/:id
router.get('/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ code: 'InvalidParameter', message: '参数非法' });
    }
    const row = db
      .prepare('SELECT * FROM books WHERE id = ? AND deleted_at IS NULL')
      .get(id);
    if (!row) return res.status(404).json({ code: 'BookNotFound', message: '图书不存在' });
    res.json(toExternal(row));
  } catch (err) {
    console.error('[GetBook] error', err);
    res.status(500).json({ code: 'InternalError', message: '获取详情失败，请稍后重试' });
  }
});

// 创建：POST /api/books
router.post('/', (req, res) => {
  try {
    const { errors, data } = validateBookPayload(req.body || {});
    if (Object.keys(errors).length) {
      return res.status(400).json({ code: 'ValidationError', errors });
    }
    // ISBN 唯一性（含软删）
    const dup = db.prepare('SELECT id, title FROM books WHERE isbn = ? LIMIT 1').get(data.isbn);
    if (dup) {
      return res.status(409).json({
        code: 'DuplicateISBN',
        message: `该 ISBN 已存在（《${dup.title}》），请检查后重试`,
        field: 'isbn',
      });
    }
    const stmt = db.prepare(`
      INSERT INTO books (title, author, isbn, category, stock, price_cents, cover_url)
      VALUES (@title, @author, @isbn, @category, @stock, @price_cents, @cover_url)
    `);
    const info = stmt.run(data);
    const row = db.prepare('SELECT * FROM books WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json(toExternal(row));
  } catch (err) {
    console.error('[CreateBook] error', err);
    res.status(500).json({ code: 'InternalError', message: '保存失败，请稍后重试' });
  }
});

// 更新：PUT /api/books/:id
router.put('/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ code: 'InvalidParameter', message: '参数非法' });
    }
    const exist = db.prepare('SELECT * FROM books WHERE id = ? AND deleted_at IS NULL').get(id);
    if (!exist) return res.status(404).json({ code: 'BookNotFound', message: '图书不存在' });

    const { errors, data } = validateBookPayload(req.body || {});
    if (Object.keys(errors).length) {
      return res.status(400).json({ code: 'ValidationError', errors });
    }
    // ISBN 唯一性（含软删）：排除自身
    const dup = db
      .prepare('SELECT id, title FROM books WHERE isbn = ? AND id != ? LIMIT 1')
      .get(data.isbn, id);
    if (dup) {
      return res.status(409).json({
        code: 'DuplicateISBN',
        message: `该 ISBN 已存在（《${dup.title}》），请检查后重试`,
        field: 'isbn',
      });
    }
    db.prepare(
      `UPDATE books
         SET title=@title, author=@author, isbn=@isbn, category=@category,
             stock=@stock, price_cents=@price_cents, cover_url=@cover_url,
             updated_at=datetime('now')
       WHERE id=@id`
    ).run({ ...data, id });
    const row = db.prepare('SELECT * FROM books WHERE id = ?').get(id);
    res.json(toExternal(row));
  } catch (err) {
    console.error('[UpdateBook] error', err);
    res.status(500).json({ code: 'InternalError', message: '保存失败，请稍后重试' });
  }
});

// 软删除：DELETE /api/books/:id
router.delete('/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ code: 'InvalidParameter', message: '参数非法' });
    }
    // 幂等：若不存在或已删除仍返回 success=true
    const exist = db.prepare('SELECT * FROM books WHERE id = ?').get(id);
    if (!exist || exist.deleted_at) {
      return res.json({ success: true });
    }
    db.prepare(`UPDATE books SET deleted_at=datetime('now'), updated_at=datetime('now') WHERE id=?`).run(id);
    res.json({ success: true });
  } catch (err) {
    console.error('[DeleteBook] error', err);
    res.status(500).json({ code: 'InternalError', message: '删除失败，请稍后重试' });
  }
});

module.exports = router;
