// 字段与校验规则（与前端保持一致）
const CATEGORIES = ['文学', '科技', '历史', '童书', '其他'];

const HTTP_URL_RE = /^https?:\/\/[^\s]+$/i;

function normalizeISBN(raw) {
  if (typeof raw !== 'string') return '';
  return raw.replace(/-/g, '').trim();
}

function validateBookPayload(body) {
  const errors = {};
  const data = {};

  // title
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title) errors.title = '请输入书名';
  else if (title.length > 100) errors.title = '书名长度不能超过 100 个字符';
  else data.title = title;

  // author
  const author = typeof body.author === 'string' ? body.author.trim() : '';
  if (!author) errors.author = '请输入作者';
  else if (author.length > 50) errors.author = '作者长度不能超过 50 个字符';
  else data.author = author;

  // isbn
  const isbn = normalizeISBN(body.isbn);
  if (!isbn) errors.isbn = '请输入ISBN';
  else if (!/^\d{10}$|^\d{13}$/.test(isbn)) errors.isbn = 'ISBN 需为 10 位或 13 位数字';
  else data.isbn = isbn;

  // category
  const category = typeof body.category === 'string' ? body.category : '';
  if (!category) errors.category = '请选择分类';
  else if (!CATEGORIES.includes(category)) errors.category = '请选择有效的分类';
  else data.category = category;

  // stock
  const stockRaw = body.stock;
  const stockNum = Number(stockRaw);
  if (stockRaw === '' || stockRaw === null || stockRaw === undefined || Number.isNaN(stockNum)) {
    errors.stock = '库存需为 ≥ 0 的整数';
  } else if (!Number.isInteger(stockNum) || stockNum < 0) {
    errors.stock = '库存需为 ≥ 0 的整数';
  } else {
    data.stock = stockNum;
  }

  // price （元，≥0，最多2位小数；内部转为分）
  const priceRaw = body.price;
  const priceNum = Number(priceRaw);
  if (priceRaw === '' || priceRaw === null || priceRaw === undefined || Number.isNaN(priceNum)) {
    errors.price = '价格需为 ≥ 0 的数字，最多 2 位小数';
  } else if (priceNum < 0) {
    errors.price = '价格需为 ≥ 0 的数字，最多 2 位小数';
  } else if (!/^\d+(\.\d{1,2})?$/.test(String(priceRaw))) {
    errors.price = '价格需为 ≥ 0 的数字，最多 2 位小数';
  } else {
    data.price_cents = Math.round(priceNum * 100);
  }

  // cover_url （可选）
  const coverUrl = typeof body.cover_url === 'string' ? body.cover_url.trim() : '';
  if (coverUrl) {
    if (!HTTP_URL_RE.test(coverUrl)) errors.cover_url = '请输入合法的 http(s) 图片链接';
    else data.cover_url = coverUrl;
  } else {
    data.cover_url = null;
  }

  return { errors, data };
}

function toExternal(book) {
  if (!book) return null;
  return {
    id: book.id,
    title: book.title,
    author: book.author,
    isbn: book.isbn,
    category: book.category,
    stock: book.stock,
    price: Number((book.price_cents / 100).toFixed(2)),
    cover_url: book.cover_url,
    created_at: book.created_at,
    updated_at: book.updated_at,
  };
}

module.exports = { CATEGORIES, validateBookPayload, toExternal, normalizeISBN };
