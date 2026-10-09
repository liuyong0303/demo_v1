'use strict';

const db = require('../db');

/**
 * 极简鉴权中间件（demo 用）
 * 通过请求头 X-User-Id + X-User-Role（reader/admin）识别当前用户。
 * 无请求头时：后端默认以 admin 身份放行（保持原有 books CRUD 对未改造前端的兼容）；
 *           但面向预约/借阅等新接口时要求前端显式传递身份。
 */
function getCurrentUser(req) {
  const role = req.header('X-User-Role');
  const id = Number(req.header('X-User-Id'));
  if (role === 'reader' && Number.isInteger(id) && id > 0) {
    const r = db.prepare('SELECT * FROM readers WHERE id = ?').get(id);
    if (r) return { kind: 'reader', id: r.id, name: r.name, card_no: r.card_no, record: r };
  }
  if (role === 'admin' && Number.isInteger(id) && id > 0) {
    const a = db.prepare('SELECT * FROM admins WHERE id = ?').get(id);
    if (a) return { kind: 'admin', id: a.id, name: a.name, username: a.username };
  }
  // 未显式指定身份：默认管理员（保持向后兼容）
  const firstAdmin = db.prepare('SELECT * FROM admins ORDER BY id ASC LIMIT 1').get();
  if (firstAdmin) return { kind: 'admin', id: firstAdmin.id, name: firstAdmin.name, username: firstAdmin.username, implicit: true };
  return null;
}

function attachUser(req, _res, next) {
  req.user = getCurrentUser(req);
  next();
}

function requireReader(req, res, next) {
  if (!req.user || req.user.kind !== 'reader') {
    return res.status(401).json({ code: 'Unauthorized', message: '请先登录读者账号' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.kind !== 'admin') {
    return res.status(403).json({ code: 'Forbidden', message: '你没有访问该页面的权限' });
  }
  next();
}

function requireAny(req, res, next) {
  if (!req.user) return res.status(401).json({ code: 'Unauthorized', message: '未登录' });
  next();
}

module.exports = { attachUser, requireReader, requireAdmin, requireAny };
