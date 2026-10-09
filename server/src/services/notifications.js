'use strict';

const db = require('../db');

/**
 * NotificationChannel 抽象（MVP 仅站内信；预留多通道）
 * send(recipient, message) 抛错时调用方负责重试。
 */
class InAppNotifier {
  send(readerId, message) {
    const { type, title, body, ref_reservation_id } = message;
    db.prepare(
      `INSERT INTO messages (reader_id, type, title, body, ref_reservation_id)
       VALUES (?, ?, ?, ?, ?)`
    ).run(readerId, type, title, body, ref_reservation_id || null);
  }
}

const channels = [new InAppNotifier()];

function notify(readerId, message) {
  // 多通道并行发送；任一失败即抛错
  const errors = [];
  for (const ch of channels) {
    try {
      ch.send(readerId, message);
    } catch (e) {
      errors.push(e);
    }
  }
  if (errors.length) {
    const err = new Error(`notify failed: ${errors.map((e) => e.message).join('; ')}`);
    err.errors = errors;
    throw err;
  }
}

module.exports = { notify, InAppNotifier };
