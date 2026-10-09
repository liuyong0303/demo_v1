export const CATEGORY_OPTIONS = ['文学', '科技', '历史', '童书', '其他'];

export const DEFAULT_PAGE_SIZE = 10;

export const FIELD_LABELS = {
  title: '书名',
  author: '作者',
  isbn: 'ISBN',
  category: '分类',
  stock: '库存',
  price: '价格',
  cover_url: '封面',
};

// 轻量占位图（data URI, 灰色 40x56），作为封面加载失败的降级
export const PLACEHOLDER_COVER =
  'data:image/svg+xml;charset=utf-8,' +
  encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="120" height="168" viewBox="0 0 120 168">
    <rect width="120" height="168" fill="#f0f0f0"/>
    <text x="60" y="88" font-size="14" text-anchor="middle" fill="#bfbfbf" font-family="sans-serif">无封面</text>
  </svg>`);

// 预约状态
export const RESERVATION_STATUS = {
  WAITING_NOTIFY: { label: '待通知', color: 'default' },
  READY_FOR_PICKUP: { label: '待取书', color: 'processing' },
  COMPLETED: { label: '已完成', color: 'success' },
  CANCELLED: { label: '已取消', color: 'default' },
  EXPIRED: { label: '已过期', color: 'warning' },
};

export const RESERVATION_STATUS_OPTIONS = Object.entries(RESERVATION_STATUS).map(([value, v]) => ({
  label: v.label,
  value,
}));
