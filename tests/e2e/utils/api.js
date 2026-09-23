// 测试用 API 助手：通过全局 fetch 与后端 REST 接口交互
// 注意：后端 ISBN 唯一约束包含软删数据（deleted_at IS NOT NULL 的行仍占据 ISBN），
// 因此 resetBooks 只能"软清空"列表可见数据；跨用例禁止复用固定 ISBN，必须由 buildBook() 生成唯一值。
const CATEGORIES = ['文学', '科技', '历史', '童书', '其他'];

function buildBook(overrides = {}) {
  const ts = Date.now();
  const suffix = Math.floor(Math.random() * 100000);
  // isbn 取 13 位时间戳+随机数，确保跨用例/跨运行唯一
  const raw = `${ts}${suffix}`.padStart(13, '0');
  const isbn = raw.slice(-13);
  return {
    title: `测试图书-${ts}-${suffix}`,
    author: `测试作者-${suffix}`,
    isbn,
    category: '科技',
    stock: 10,
    price: 39.9,
    cover_url: '',
    ...overrides,
  };
}

async function listAll(baseURL) {
  const all = [];
  let page = 1;
  while (true) {
    const res = await fetch(`${baseURL}/api/books?page=${page}&page_size=100&_t=${Date.now()}`);
    if (!res.ok) throw new Error(`list page ${page} failed: ${res.status}`);
    const data = await res.json();
    const list = data.list || [];
    all.push(...list);
    if (list.length === 0 || all.length >= (data.total || 0)) break;
    page += 1;
    if (page > 20) break;
  }
  return all;
}

async function resetBooks(baseURL) {
  // 反复拉取+软删除直到列表完全清空；每轮之间留出让 better-sqlite3 完成 WAL 持久化的时间
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const list = await listAll(baseURL);
    if (list.length === 0) break;
    // 顺序删除（避免并发写 better-sqlite3 导致 SQLITE_BUSY），每本之间小延迟
    for (const b of list) {
      const r = await fetch(`${baseURL}/api/books/${b.id}`, { method: 'DELETE' });
      try { await r.text(); } catch (_) {}
      await new Promise(res => setTimeout(res, 30));
    }
    // 轮间等待，保证软删事务可见
    await new Promise(res => setTimeout(res, 200));
  }
  // 最终校验
  for (let verify = 0; verify < 5; verify += 1) {
    const remaining = await listAll(baseURL);
    if (remaining.length === 0) return;
    await new Promise(res => setTimeout(res, 300));
  }
  const remaining = await listAll(baseURL);
  if (remaining.length > 0) {
    const ids = remaining.map(b => `${b.id}:${b.title}`).join(',');
    throw new Error(`resetBooks failed: still ${remaining.length} books remaining: ${ids}`);
  }
}

async function createBook(baseURL, payload) {
  const res = await fetch(`${baseURL}/api/books`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`createBook failed (${res.status}): ${t}`);
  }
  return res.json();
}

async function createNBooks(baseURL, n, overridesFn) {
  const results = [];
  for (let i = 0; i < n; i++) {
    const base = buildBook();
    const data = overridesFn ? overridesFn(i, base) : base;
    // 若 overridesFn 未提供 isbn，使用 base.isbn（已唯一）；若提供了，以提供为准
    results.push(await createBook(baseURL, data));
    await new Promise(res => setTimeout(res, 20));
  }
  return results;
}

module.exports = { CATEGORIES, buildBook, resetBooks, createBook, createNBooks, listAll };
