const express = require('express');
const db = require('./db');

const router = express.Router();

// 与 routes.books.js 保持一致的管理员鉴权占位
function requireAdmin(req, res, next) {
  next();
}
router.use(requireAdmin);

// GET /api/reports/overview
// 返回图书总量、已借出数量、借阅量 Top5
router.get('/overview', (req, res) => {
  try {
    const totalBooks =
      db.prepare('SELECT COUNT(*) AS c FROM books WHERE deleted_at IS NULL').get().c || 0;
    const borrowedCount =
      db.prepare('SELECT COUNT(*) AS c FROM borrow_records WHERE returned_at IS NULL').get().c || 0;

    // Top5：按 book_id 分组统计历史借阅次数；已软删图书保留在榜单中，书名作者降级展示
    // 排序：borrow_count DESC, book_id ASC，严格 LIMIT 5
    const topRows = db
      .prepare(
        `SELECT br.book_id,
                b.title,
                b.author,
                b.deleted_at,
                COUNT(*) AS borrow_count
           FROM borrow_records br
           LEFT JOIN books b ON b.id = br.book_id
          GROUP BY br.book_id
          ORDER BY borrow_count DESC, br.book_id ASC
          LIMIT 5`
      )
      .all();

    const topBorrowed = topRows.map((r) => ({
      book_id: r.book_id,
      title: r.deleted_at ? '（图书已删除）' : r.title || '（图书已删除）',
      author: r.deleted_at ? '（图书已删除）' : r.author || '（图书已删除）',
      borrow_count: r.borrow_count || 0,
    }));

    res.json({
      total_books: totalBooks,
      borrowed_count: borrowedCount,
      top_borrowed: topBorrowed,
    });
  } catch (err) {
    console.error('[ReportOverview] error', err);
    res.status(500).json({ code: 'InternalError', message: '报表加载失败，请稍后重试' });
  }
});

module.exports = router;
