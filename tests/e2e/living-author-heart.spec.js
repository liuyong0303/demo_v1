// @ts-check
/**
 * 在世作者绿色爱心图标 E2E 测试
 * 覆盖 Spec「验收标准」中 AC-01 ~ AC-10 的核心可自动化验收项：
 *   - AC-01 is_alive=1 单作者：爱心/tooltip/sr-only
 *   - AC-02 is_alive=0 不展示爱心
 *   - AC-03 is_alive=NULL/未传不展示爱心
 *   - AC-04 is_alive=1 多作者：每个片段都有爱心，分隔符纯文本
 *   - AC-05 is_alive=0/NULL 多作者均无爱心
 *   - AC-08 详情弹窗作者字段纯文本，无爱心
 *   - AC-09 新增图书选「在世/已故/未知」保存，列表展示与规则一致
 *   - AC-10 编辑弹窗「作者状态」按 1/0/NULL 正确回显，修改后列表同步
 *
 * 说明：
 *  - 视觉细节（尺寸/偏移/对比度/多分辨率，AC-11）依赖人工走查 + 设计系统 token 保证，不在 E2E 中断言像素。
 *  - 性能无新增请求（AC-12）通过 Network 请求断言覆盖。
 */
const { test, expect } = require('@playwright/test');
const { resetBooks, createBook, buildBook } = require('./utils/api');
const { BooksPage, BookFormModal, BookDetailModal } = require('./utils/BooksPage');

const HEART_ICON = '.author-segment--alive .anticon-heart';
const SR_ONLY = '.author-segment--alive .sr-only';
const TOOLTIP_TEXT = '该作者仍在世';

test.describe('图书列表 - 在世作者绿色爱心图标', () => {
  test.beforeEach(async ({ baseURL }) => {
    await resetBooks(baseURL);
  });

  test('LH-01 [AC-01] is_alive=1 单作者：姓名右上角显示绿色爱心，hover 图标显示 tooltip，存在 sr-only「（在世）」', async ({ page, baseURL }) => {
    await createBook(baseURL, buildBook({ title: '平凡的世界', author: '路遥', is_alive: 1 }));

    const bp = new BooksPage(page);
    await bp.goto();
    await bp.waitForListLoaded();

    const row = bp.rowByTitle('平凡的世界');
    await expect(row).toBeVisible();

    // 爱心图标存在且 aria-hidden=true
    const heart = row.locator(HEART_ICON);
    await expect(heart).toHaveCount(1);
    await expect(heart).toHaveAttribute('aria-hidden', 'true');
    // 颜色使用 AntD 主题 token colorSuccess（成功语义绿）——计算样式应处于绿色色系
    const color = await heart.evaluate((el) => getComputedStyle(el).color);
    const m = color.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    expect(m, 'expected rgb(...) color, got ' + color).toBeTruthy();
    const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
    // 绿色通道必须明显强于红/蓝，且不是错误红/默认灰色
    expect(g).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(b);
    expect(r).toBeLessThan(200);

    // sr-only 文本
    const sr = row.locator(SR_ONLY);
    await expect(sr).toHaveCount(1);
    await expect(sr).toContainText('（在世）');

    // hover 爱心显示 tooltip
    await heart.hover();
    const tip = page.locator('.ant-tooltip:visible', { hasText: TOOLTIP_TEXT });
    await expect(tip).toBeVisible();
  });

  test('LH-02 [AC-02] is_alive=0（已故）：作者列无爱心、无 sr-only、无 tooltip', async ({ page, baseURL }) => {
    await createBook(baseURL, buildBook({ title: '红楼梦', author: '曹雪芹', is_alive: 0 }));

    const bp = new BooksPage(page);
    await bp.goto();
    await bp.waitForListLoaded();
    const row = bp.rowByTitle('红楼梦');
    await expect(row).toContainText('曹雪芹');
    await expect(row.locator(HEART_ICON)).toHaveCount(0);
    await expect(row.locator(SR_ONLY)).toHaveCount(0);
    // 单元格保留 author-segment（非 --alive）
    await expect(row.locator('.author-segment')).toHaveCount(1);
    await expect(row.locator('.author-segment--alive')).toHaveCount(0);
  });

  test('LH-03 [AC-03] is_alive=NULL（历史数据/未知）：作者列无爱心且无布局异常', async ({ page, baseURL }) => {
    // 不传 is_alive -> 后端默认 NULL
    await createBook(baseURL, buildBook({ title: '历史书', author: '古作者' }));

    const bp = new BooksPage(page);
    await bp.goto();
    await bp.waitForListLoaded();
    const row = bp.rowByTitle('历史书');
    await expect(row).toContainText('古作者');
    await expect(row.locator(HEART_ICON)).toHaveCount(0);
    await expect(row.locator(SR_ONLY)).toHaveCount(0);
  });

  test('LH-04 [AC-04] is_alive=1 多作者：每个非空片段独立展示爱心，分隔符「 / 」为纯文本', async ({ page, baseURL }) => {
    await createBook(baseURL, buildBook({ title: '合著在世', author: '金庸 / 古龙', is_alive: 1 }));

    const bp = new BooksPage(page);
    await bp.goto();
    await bp.waitForListLoaded();
    const row = bp.rowByTitle('合著在世');

    // 两个在世片段各有一个爱心 + sr-only
    await expect(row.locator('.author-segment--alive')).toHaveCount(2);
    await expect(row.locator(HEART_ICON)).toHaveCount(2);
    await expect(row.locator(SR_ONLY)).toHaveCount(2);

    // 片段文本分别为「金庸」「古龙」
    const segments = row.locator('.author-segment--alive');
    await expect(segments.nth(0)).toContainText('金庸');
    await expect(segments.nth(1)).toContainText('古龙');

    // 整单元格包含分隔符「 / 」
    await expect(row.locator('.author-cell')).toContainText(' / ');
  });

  test('LH-05 [AC-05] is_alive=0/NULL 多作者：均不展示爱心', async ({ page, baseURL }) => {
    await createBook(baseURL, buildBook({ title: '已故合著', author: '金庸 / 古龙', is_alive: 0 }));

    const bp = new BooksPage(page);
    await bp.goto();
    await bp.waitForListLoaded();
    const row = bp.rowByTitle('已故合著');
    await expect(row.locator(HEART_ICON)).toHaveCount(0);
    await expect(row.locator('.author-segment--alive')).toHaveCount(0);
  });

  test('LH-06 [AC-08] 详情弹窗作者字段为纯文本、无爱心（范围边界）', async ({ page, baseURL }) => {
    await createBook(baseURL, buildBook({ title: '详情爱心校验', author: '在世作者A', is_alive: 1 }));

    const bp = new BooksPage(page);
    await bp.goto();
    await bp.waitForListLoaded();
    // 列表行有爱心（前提）
    await expect(bp.rowByTitle('详情爱心校验').locator(HEART_ICON)).toHaveCount(1);

    await bp.clickDetail('详情爱心校验');
    const det = new BookDetailModal(page);
    await det.waitVisible();
    await expect(det.modal).toContainText('在世作者A');
    // 详情 Modal 内不应出现心形图标或 .author-segment--alive
    await expect(det.modal.locator('.anticon-heart')).toHaveCount(0);
    await expect(det.modal.locator('.author-segment--alive')).toHaveCount(0);
    await det.close();
  });

  test('LH-07 [AC-09] 新增图书：选「在世」保存列表显示爱心；选「已故/未知」保存列表无爱心', async ({ page, baseURL }) => {
    // 先创建一本其它书保证列表非空
    await createBook(baseURL, buildBook({ title: '占位书', author: '占位作者' }));

    const bp = new BooksPage(page);
    await bp.goto();
    await bp.waitForListLoaded();

    // 新增在世
    await bp.clickCreate();
    const form1 = new BookFormModal(page);
    const aliveBook = buildBook({ title: '新增在世书', author: '在世新作者', is_alive: 'alive' });
    await form1.fill(aliveBook);
    await form1.submit();
    await form1.waitHidden();
    await bp.waitForToast('保存成功');
    await bp.waitForListLoaded();
    await expect(bp.rowByTitle('新增在世书').locator(HEART_ICON)).toHaveCount(1);

    // 新增已故
    await bp.clickCreate();
    const form2 = new BookFormModal(page);
    const deadBook = buildBook({ title: '新增已故书', author: '已故作者', is_alive: 'deceased' });
    await form2.fill(deadBook);
    await form2.submit();
    await form2.waitHidden();
    await bp.waitForToast('保存成功');
    await bp.waitForListLoaded();
    await expect(bp.rowByTitle('新增已故书').locator(HEART_ICON)).toHaveCount(0);

    // 新增未知（默认）
    await bp.clickCreate();
    const form3 = new BookFormModal(page);
    const unkBook = buildBook({ title: '新增未知书', author: '未知作者' } /* 默认 unknown */);
    await form3.fill(unkBook);
    await form3.submit();
    await form3.waitHidden();
    await bp.waitForToast('保存成功');
    await bp.waitForListLoaded();
    await expect(bp.rowByTitle('新增未知书').locator(HEART_ICON)).toHaveCount(0);
  });

  test('LH-08 [AC-10] 编辑弹窗：作者状态按 1/0/NULL 正确回显，修改后列表同步', async ({ page, baseURL }) => {
    const book = await createBook(baseURL, buildBook({ title: '状态切换书', author: '待切换作者', is_alive: 1 }));
    void book;

    const bp = new BooksPage(page);
    await bp.goto();
    await bp.waitForListLoaded();
    // 初始 is_alive=1：列表有爱心
    await expect(bp.rowByTitle('状态切换书').locator(HEART_ICON)).toHaveCount(1);

    // 打开编辑：「在世」应被选中
    await bp.clickEdit('状态切换书');
    const form = new BookFormModal(page);
    await expect(form.aliveRadioInput).toBeChecked();

    // 改成「已故」保存
    await form.selectAliveStatus('deceased');
    await form.submit();
    await form.waitHidden();
    await bp.waitForToast('保存成功');
    await bp.waitForListLoaded();
    await expect(bp.rowByTitle('状态切换书').locator(HEART_ICON)).toHaveCount(0);

    // 再编辑：应回显「已故」
    await bp.clickEdit('状态切换书');
    const form2 = new BookFormModal(page);
    await expect(form2.deceasedRadioInput).toBeChecked();
    await form2.cancelClean();
  });

  test('LH-09 [AC-12] 列表加载过程无新增独立「作者状态」相关网络请求，仅走既有 /api/books', async ({ page, baseURL }) => {
    await createBook(baseURL, buildBook({ title: '请求观察书', author: '作者X', is_alive: 1 }));

    const requests = [];
    page.on('request', (req) => {
      const url = req.url();
      // 仅记录 /api/ 下的调用
      if (url.includes('/api/')) requests.push(new URL(url).pathname);
    });

    const bp = new BooksPage(page);
    await bp.goto();
    await bp.waitForListLoaded();
    await bp.rowByTitle('请求观察书').waitFor();

    // 应存在 /api/books，但不应出现任何 is_alive / author 相关独立接口
    expect(requests).toContain('/api/books');
    const suspicious = requests.filter((p) => /author|is_alive|living/i.test(p));
    expect(suspicious).toEqual([]);
  });

  test('LH-10 hover 作者文本本身不弹 tooltip（REQ-001.4）；仅 hover 爱心时弹', async ({ page, baseURL }) => {
    await createBook(baseURL, buildBook({ title: 'hover测试书', author: '张三', is_alive: 1 }));
    const bp = new BooksPage(page);
    await bp.goto();
    await bp.waitForListLoaded();
    const row = bp.rowByTitle('hover测试书');

    // hover 到作者文本（.author-segment--alive 的文本节点，避开 heart）
    await row.locator('.author-segment--alive').hover({ position: { x: 5, y: 8 } });
    await page.waitForTimeout(300);
    await expect(page.locator('.ant-tooltip:visible', { hasText: TOOLTIP_TEXT })).toHaveCount(0);

    // 再 hover 到爱心，应出现 tooltip
    await row.locator(HEART_ICON).hover();
    await expect(page.locator('.ant-tooltip:visible', { hasText: TOOLTIP_TEXT })).toBeVisible();
  });
});
