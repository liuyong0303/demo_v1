// @ts-check
const { test, expect } = require('@playwright/test');
const { resetBooks, createBook, createNBooks, buildBook } = require('./utils/api');
const { BooksPage, BookFormModal, BookDetailModal } = require('./utils/BooksPage');

test.describe('图书管理页面 E2E', () => {
  test.beforeEach(async ({ baseURL }) => {
    await resetBooks(baseURL);
  });

  test('TC-01 空态：无图书时展示空态文案与「新增图书」按钮', async ({ page }) => {
    const bp = new BooksPage(page);
    await bp.goto();
    await bp.waitForListLoaded();

    await expect(bp.empty).toBeVisible();
    await expect(bp.empty).toContainText('暂无图书');
    await expect(bp.emptyCreateBtn).toBeVisible();

    await bp.empty.locator('button', { hasText: /新\s*增\s*图\s*书/ }).click();
    const form = new BookFormModal(page);
    await form.waitVisible();
  });

  test('TC-02 新增图书：合法填写后保存成功并出现在列表', async ({ page }) => {
    const bp = new BooksPage(page);
    await bp.goto();
    await bp.waitForListLoaded();

    await bp.clickCreate();
    const form = new BookFormModal(page);
    // 使用 buildBook 生成唯一 ISBN（后端 ISBN 唯一约束包含软删数据），仅覆盖人读字段
    const book = buildBook({
      title: '三体',
      author: '刘慈欣',
      category: '文学',
      stock: 20,
      price: 59.9,
      cover_url: '',
    });
    await form.fill(book);
    await form.submit();
    await form.waitHidden();

    await bp.waitForToast('保存成功');
    await bp.waitForListLoaded();
    const row = bp.rowByTitle('三体');
    await expect(row).toBeVisible();
    await expect(row).toContainText('刘慈欣');
    await expect(row).toContainText(book.isbn);
    await expect(row).toContainText('文学');
    await expect(row).toContainText('20');
    await expect(row).toContainText('59.90');
  });

  test('TC-03 字段校验：必填项为空/非法输入时展示错误', async ({ page }) => {
    const bp = new BooksPage(page);
    await bp.goto();
    await bp.waitForListLoaded();
    await bp.clickCreate();
    const form = new BookFormModal(page);
    // 直接保存，应触发必填错误
    await form.submit();
    await expect(form.modal.locator('.ant-form-item-explain-error').first()).toBeVisible();
    await expect(form.modal).toBeVisible();

    // 取消当前表单（不保存）
    await form.cancelBtn.click();
    // 等待表单消失（如果有未保存确认也处理）
    try {
      await form.waitHidden();
    } catch (_) {
      // 若有未保存确认（因校验错误也算 dirty），点确定离开
      const confirm = page.locator('.ant-modal-confirm:visible').last();
      if (await confirm.isVisible().catch(() => false)) {
        await confirm.locator('button', { hasText: /确\s*定\s*离\s*开/ }).click().catch(() => {});
      }
    }

    // 重新打开，填入合法+部分非法字段，验证错误提示
    await bp.clickCreate();
    const form2 = new BookFormModal(page);
    await form2.fill({ title: '测试书', author: '测试作者', isbn: '12345abcde', cover_url: 'notaurl' });
    // 清空库存字段
    await form2.stockInput.fill('');
    await form2.submit();
    await expect(form2.modal.getByText(/ISBN.*10.*13.*数字/)).toBeVisible();
    await expect(form2.modal.getByText(/请输入库存/)).toBeVisible();
    await expect(form2.modal.getByText(/http.*s.*图片链接/)).toBeVisible();
    await form2.cancelBtn.click();
    try { await form2.waitHidden(); } catch (_) {}
  });

  test('TC-04 搜索与分类筛选：关键字+分类组合生效，重置后恢复', async ({ page, baseURL }) => {
    // 三本书使用 buildBook 生成唯一 ISBN，仅覆盖人读字段
    const b1 = await createBook(baseURL, buildBook({ title: '三体', author: '刘慈欣', category: '文学' }));
    const b2 = await createBook(baseURL, buildBook({ title: '红楼梦', author: '曹雪芹', category: '文学' }));
    const b3 = await createBook(baseURL, buildBook({ title: '算法导论', author: 'Cormen', category: '科技' }));
    void b1; void b2; void b3;

    const bp = new BooksPage(page);
    await bp.goto();
    await bp.waitForListLoaded();
    await expect(bp.rows).toHaveCount(3);

    // 关键字搜索"三体"
    await bp.search('三体');
    await bp.waitForListLoaded();
    await expect(bp.rowByTitle('三体')).toBeVisible();
    await expect(bp.rows).toHaveCount(1);

    // 重置
    await bp.resetBtn.click();
    await bp.waitForListLoaded();
    await expect(bp.rows).toHaveCount(3);

    // 分类筛选「文学」
    await bp.selectCategory('文学');
    await bp.waitForListLoaded();
    await expect(bp.rows).toHaveCount(2);

    // 叠加搜索「红楼」
    await bp.search('红楼');
    await bp.waitForListLoaded();
    await expect(bp.rows).toHaveCount(1);
    await expect(bp.rowByTitle('红楼梦')).toBeVisible();

    // 清空搜索条件显示无结果态
    await bp.search('xyznoresult');
    await bp.waitForListLoaded();
    await expect(bp.empty).toBeVisible();
    await expect(bp.empty).toContainText('没有找到匹配');
    await bp.empty.locator('button', { hasText: /清\s*空\s*条\s*件/ }).click();
    await bp.waitForListLoaded();
    await expect(bp.rows).toHaveCount(3);
  });

  test('TC-05 编辑图书：预填充、修改后保存成功并更新列表', async ({ page, baseURL }) => {
    const original = await createBook(baseURL, buildBook({ title: '待编辑图书', author: '原作者', category: '其他', stock: 1, price: 10 }));
    const bp = new BooksPage(page);
    await bp.goto();
    await bp.waitForListLoaded();
    await bp.clickEdit('待编辑图书');
    const form = new BookFormModal(page);
    await expect(form.titleInput).toHaveValue('待编辑图书');
    await expect(form.authorInput).toHaveValue('原作者');
    await expect(form.isbnInput).toHaveValue(original.isbn);
    await form.fill({ title: '已编辑图书', stock: 5, price: 19.9 });
    await form.submit();
    await form.waitHidden();
    await bp.waitForToast('保存成功');
    await bp.waitForListLoaded();
    await expect(bp.rowByTitle('已编辑图书')).toBeVisible();
    await expect(bp.rowByTitle('待编辑图书')).toHaveCount(0);
    const editedRow = bp.rowByTitle('已编辑图书');
    await expect(editedRow).toContainText('5');
    await expect(editedRow).toContainText('19.90');
  });

  test('TC-06 详情查看：打开详情 Modal，展示全字段，可进入编辑', async ({ page, baseURL }) => {
    const book = await createBook(baseURL, buildBook({ title: '详情测试', author: '作者A', category: '历史', stock: 7, price: 30, cover_url: '' }));
    const bp = new BooksPage(page);
    await bp.goto();
    await bp.waitForListLoaded();
    await bp.clickDetail('详情测试');
    const det = new BookDetailModal(page);
    await det.waitVisible();
    await expect(det.modal).toContainText('详情测试');
    await expect(det.modal).toContainText('作者A');
    await expect(det.modal).toContainText(book.isbn);
    await expect(det.modal).toContainText('历史');
    await expect(det.modal).toContainText('7');
    await expect(det.modal).toContainText('30.00');
    await expect(det.coverImg).toBeVisible();
    // 点击编辑按钮，应打开编辑 Modal
    await det.editBtn.click();
    // 等待编辑 Modal 打开（不严格等详情关闭）
    const form = new BookFormModal(page);
    await form.waitVisible();
    await expect(form.titleInput).toHaveValue('详情测试');
  });

  test('TC-07 软删除：二次确认含书名，删除后从列表隐藏且 Toast 提示', async ({ page, baseURL }) => {
    await createBook(baseURL, buildBook({ title: '删除测试书', author: '作者B', category: '科技', stock: 0, price: 0 }));
    const bp = new BooksPage(page);
    await bp.goto();
    await bp.waitForListLoaded();
    await expect(bp.rowByTitle('删除测试书')).toBeVisible();

    // 先点取消，数据仍在
    await bp.clickDeleteAndCancel('删除测试书');
    await expect(bp.rowByTitle('删除测试书')).toBeVisible();

    // 确认删除
    await bp.clickDeleteAndConfirm('删除测试书');
    await bp.waitForToast('删除成功');
    await bp.waitForListLoaded();
    await expect(bp.empty).toBeVisible();
    await expect(bp.empty).toContainText('暂无图书');
  });

  test('TC-08 ISBN 重复：保存时提示重复错误并保持 Modal 打开', async ({ page, baseURL }) => {
    const existing = await createBook(baseURL, buildBook({ title: '已有图书', author: '某作者' }));
    const bp = new BooksPage(page);
    await bp.goto();
    await bp.waitForListLoaded();
    await bp.clickCreate();
    const form = new BookFormModal(page);
    // 使用已存在图书的 ISBN 触发后端唯一性校验
    await form.fill(buildBook({ title: '重复ISBN图书', author: '另一位', isbn: existing.isbn }));
    await form.submit();
    await expect(form.modal.getByText(new RegExp(`该 ISBN 已存在.*${existing.title}`))).toBeVisible({ timeout: 8000 });
    await expect(form.modal).toBeVisible();
  });

  test('TC-09 分页：超过 10 条时展示分页，切换到第 2 页并保留筛选条件', async ({ page, baseURL }) => {
    // 使用 buildBook 生成唯一 ISBN，仅覆盖 title/category
    await createNBooks(baseURL, 12, (_i, base) => ({ ...base, title: `科技书-${_i + 1}`, category: '科技' }));
    await createNBooks(baseURL, 3, (_i, base) => ({ ...base, title: `文学书-${_i + 1}`, category: '文学' }));

    const bp = new BooksPage(page);
    await bp.goto();
    await bp.waitForListLoaded();
    await expect(bp.pagination).toBeVisible();
    await expect(bp.totalText).toContainText('共 15 条');
    await expect(bp.rows).toHaveCount(10);

    // 筛选「科技」
    await bp.selectCategory('科技');
    await bp.waitForListLoaded();
    await expect(bp.totalText).toContainText('共 12 条');
    await expect(bp.rows).toHaveCount(10);

    // 翻到第 2 页
    await bp.goToPage(2);
    await bp.waitForListLoaded();
    await expect(bp.rows).toHaveCount(2);
  });

  test('TC-10 未保存离开二次确认：表单已修改时关闭 Modal 弹出确认', async ({ page }) => {
    const bp = new BooksPage(page);
    await bp.goto();
    await bp.waitForListLoaded();
    await bp.clickCreate();
    const form = new BookFormModal(page);
    // 未输入任何内容时直接取消，不弹确认
    await form.cancelBtn.click();
    try { await form.waitHidden({ timeout: 3000 }); } catch (_) {}
    // 重新打开并输入内容再取消，应弹确认
    await bp.clickCreate();
    await form.fill({ title: '未保存测试' });
    await form.cancelBtn.click();
    const leaveConfirm = page.locator('.ant-modal-confirm:visible').last();
    await expect(leaveConfirm).toBeVisible();
    await expect(leaveConfirm).toContainText('尚未保存');
    // 点继续编辑，Modal 仍在
    await leaveConfirm.locator('button', { hasText: /继\s*续\s*编\s*辑/ }).click();
    await expect(form.modal).toBeVisible();
  });
});
