const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');

const booksRouter = require('./routes.books');
const booksReaderRouter = require('./routes.books.reader');
const bookPublicRouter = require('./routes.bookPublic');
const loansRouter = require('./routes.loans');
const reservationsRouter = require('./routes.reservations');
const messagesRouter = require('./routes.messages');
const adminReservationsRouter = require('./routes.admin.reservations');
const authRouter = require('./routes.auth');
const { attachUser, requireAdmin } = require('./middleware/auth');
const { startOutboxWorker, startExpireSweeper } = require('./services/reservations');

const app = express();
const PORT = process.env.PORT || 3001;
const isProd = process.env.NODE_ENV === 'production';

app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

app.use(attachUser);

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', authRouter);

// 公共/预约相关接口（各路由内部自己做角色校验）
app.use('/api/loans', loansRouter);
app.use('/api/reservations', reservationsRouter);
app.use('/api/messages', messagesRouter);
app.use('/api/admin/reservations', requireAdmin, adminReservationsRouter);

// 图书：读者可读（列表/详情/分类）、预约信息公开；其余 CRUD 为管理员
// express 按挂载顺序匹配：先精确匹配 public 子路由，再是 reader 只读，再是 admin CRUD
app.use('/api/books', bookPublicRouter);
app.use('/api/books', booksReaderRouter);
app.use('/api/books', requireAdmin, booksRouter);

if (isProd) {
  const webDist = path.join(__dirname, '..', '..', 'web', 'dist');
  if (fs.existsSync(webDist)) {
    app.use(express.static(webDist));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(webDist, 'index.html'));
    });
  }
}

app.use((err, _req, res, _next) => {
  console.error('[unhandled]', err);
  res.status(500).json({ code: 'InternalError', message: '服务器异常' });
});

const server = app.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT} (${isProd ? 'production' : 'development'})`);
});

const outboxTimer = startOutboxWorker();
const expireTimer = startExpireSweeper();

function shutdown() {
  clearInterval(outboxTimer);
  clearInterval(expireTimer);
  server.close(() => process.exit(0));
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

module.exports = app;
