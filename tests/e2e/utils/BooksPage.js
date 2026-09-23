const { expect } = require("@playwright/test");
class BooksPage {
  constructor(page) {
    this.page = page;
    this.url = '/books';
    this.filterBar = page.locator('.filter-bar');
    this.pageHeader = page.locator('.page-header');
    this.keywordInput = this.filterBar.getByPlaceholder(/按书名/);
    this.categorySelect = this.filterBar.locator('.ant-select').first();
    this.searchBtn = this.filterBar.locator('button', { hasText: /查\s*询/ });
    this.resetBtn = this.filterBar.locator('button', { hasText: /重\s*置/ });
    this.createBtn = this.pageHeader.locator('button', { hasText: '新增图书' });
    this.table = page.locator('.ant-table');
    this.rows = page.locator('.ant-table-tbody > tr.ant-table-row');
    this.pagination = page.locator('.pagination-wrap .ant-pagination');
    this.totalText = page.locator('.ant-pagination-total-text');
    this.empty = page.locator('.ant-empty');
    this.emptyCreateBtn = this.empty.locator('button', { hasText: '新增图书' });
    this.emptyResetBtn = this.empty.locator('button', { hasText: /清\s*空\s*条\s*件/ });
  }

  async goto() {
    await this.page.goto(this.url);
    await this.page.waitForLoadState('domcontentloaded');
  }

  async waitForListLoaded() {
    await this.page.waitForSelector('.ant-skeleton', { state: 'detached', timeout: 10000 }).catch(() => {});
    await expect_any(this.page, ['.ant-table', '.ant-empty'], 15000);
  }

  async search(keyword) {
    await this.keywordInput.fill(keyword || '');
    await this.searchBtn.click();
  }

  async selectCategory(cat) {
    await this.categorySelect.click();
    await this.page.waitForTimeout(200);
    const dropdown = this.page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last();
    await dropdown.locator('.ant-select-item-option', { hasText: cat }).first().click({ force: true });
  }

  async clickCreate() {
    await this.createBtn.click();
    await this.page.locator('.ant-modal:visible .ant-modal-title', { hasText: '新增图书' }).waitFor({ state: 'visible' });
  }

  rowByTitle(title) {
    return this.rows.filter({ hasText: title }).first();
  }

  async clickEdit(title) {
    const row = this.rowByTitle(title);
    await row.locator('button', { hasText: /编\s*辑/ }).click();
    await this.page.locator('.ant-modal:visible .ant-modal-title', { hasText: '编辑图书' }).waitFor({ state: 'visible' });
  }

  async clickDetail(title) {
    const row = this.rowByTitle(title);
    await row.locator('button', { hasText: /详\s*情/ }).click();
    await this.page.locator('.ant-modal:visible .ant-modal-title', { hasText: '图书详情' }).waitFor({ state: 'visible' });
  }

  async _waitPopconfirm() {
    const pop = this.page.locator('.ant-popover:visible').last();
    await pop.waitFor({ state: 'visible', timeout: 5000 });
    return pop;
  }

  async clickDeleteAndConfirm(title) {
    const row = this.rowByTitle(title);
    await row.locator('button', { hasText: /删\s*除/ }).click();
    const pop = await this._waitPopconfirm();
    await pop.locator('button', { hasText: /确\s*认\s*删\s*除/ }).click();
  }

  async clickDeleteAndCancel(title) {
    const row = this.rowByTitle(title);
    await row.locator('button', { hasText: /删\s*除/ }).click();
    const pop = await this._waitPopconfirm();
    await pop.locator('button', { hasText: /取\s*消/ }).click();
  }

  async goToPage(n) {
    await this.pagination.locator('.ant-pagination-item:visible a', { hasText: String(n) }).click();
  }

  async waitForToast(text) {
    await expect(this.page.locator('.ant-message')).toContainText(text, { timeout: 8000 });
  }
}

class BookFormModal {
  constructor(page) {
    this.page = page;
    // 取当前可见的 .ant-modal
    this.modal = page.locator('.ant-modal:visible').last();
    this.titleInput = this.modal.getByPlaceholder('请输入书名');
    this.authorInput = this.modal.getByPlaceholder('请输入作者');
    this.isbnInput = this.modal.getByPlaceholder(/ISBN/);
    this.categorySelect = this.modal.locator('.ant-select').first();
    const numbers = this.modal.locator('input.ant-input-number-input');
    this.stockInput = numbers.nth(0);
    this.priceInput = numbers.nth(1);
    this.coverInput = this.modal.getByPlaceholder(/封面/);
    // 用 hasText 正则匹配按钮（AntD 按钮内可能被插入空格/span，文本间含空白）
    this.saveBtn = this.modal.locator('.ant-modal-footer button').filter({ hasText: /保\s*存/ });
    this.cancelBtn = this.modal.locator('.ant-modal-footer button').filter({ hasText: /取\s*消/ });
    this.leaveConfirm = page.locator('.ant-modal-confirm:visible').last();
  }
  async waitVisible() { await this.modal.waitFor({ state: 'visible' }); }
  async waitHidden() { await this.modal.waitFor({ state: 'hidden' }); }

  async fill(data) {
    if (data.title !== undefined) await this.titleInput.fill(data.title);
    if (data.author !== undefined) await this.authorInput.fill(data.author);
    if (data.isbn !== undefined) await this.isbnInput.fill(data.isbn);
    if (data.category !== undefined) {
      await this.categorySelect.click();
      await this.page.waitForTimeout(200);
      const dropdown = this.page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last();
      await dropdown.locator('.ant-select-item-option', { hasText: data.category }).first().click({ force: true });
    }
    if (data.stock !== undefined) await this.stockInput.fill(String(data.stock));
    if (data.price !== undefined) await this.priceInput.fill(String(data.price));
    if (data.cover_url !== undefined) await this.coverInput.fill(data.cover_url);
  }
  async submit() { await this.saveBtn.click(); }
  async cancelDirty() {
    await this.cancelBtn.click();
    await this.leaveConfirm.waitFor({ state: 'visible' });
    await this.leaveConfirm.locator('button', { hasText: /确定离开/ }).click();
    await this.waitHidden();
  }
  async cancelClean() {
    await this.cancelBtn.click();
    await this.waitHidden();
  }
}

class BookDetailModal {
  constructor(page) {
    this.page = page;
    this.modal = page.locator('.ant-modal:visible').last();
    this.coverImg = this.modal.locator('img.cover-large');
    this.editBtn = this.modal.locator('.ant-modal-footer button').filter({ hasText: /编\s*辑/ });
    this.closeBtn = this.modal.locator('.ant-modal-footer button').filter({ hasText: /关\s*闭/ });
  }
  async waitVisible() { await this.modal.waitFor({ state: 'visible' }); }
  async waitHidden() { await this.modal.waitFor({ state: 'hidden' }); }
  async close() { await this.closeBtn.click(); await this.waitHidden(); }
}

async function expect_any(page, selectors, timeout = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    for (const s of selectors) {
      if (await page.locator(s).first().isVisible().catch(() => false)) return s;
    }
    await page.waitForTimeout(200);
  }
  throw new Error(`expect_any timeout: none of [${selectors.join(', ')}] visible after ${timeout}ms`);
}

module.exports = { BooksPage, BookFormModal, BookDetailModal };
