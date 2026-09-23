const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const booksRouter = require('./routes.books');

const app = express();
const PORT = process.env.PORT || 3001;
const isProd = process.env.NODE_ENV === 'production';

app.use(cors());
app.use(express.json({ limit: '1mb' }));

// 简单访问日志
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/books', booksRouter);

// 生产模式下托管前端构建产物
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

app.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT} (${isProd ? 'production' : 'development'})`);
});
