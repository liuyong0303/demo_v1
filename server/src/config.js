'use strict';

// 预约系统配置常量
module.exports = {
  // 每位读者同时最多可预约数
  MAX_ACTIVE_RESERVATIONS_PER_READER: 5,
  // 取书有效期（小时），自通知发送起
  PICKUP_WINDOW_HOURS: 7 * 24,
  // 过期扫描间隔（毫秒）
  EXPIRE_SWEEP_INTERVAL_MS: 10 * 60 * 1000,
  // outbox 轮询间隔
  OUTBOX_POLL_INTERVAL_MS: 2 * 1000,
  // 欠费阈值（分）：>0 即视为欠费不可预约
  MAX_OUTSTANDING_FINE_CENTS: 0,
  // 功能开关：紧急回滚时可置为 false 关闭预约入口（API 仍可用以便做数据迁移/查询）
  RESERVATION_ENABLED: true,
};
