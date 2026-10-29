# 测试用例：图书列表在世作者绿色爱心图标

- 需求/规格：Spec「图书列表在世作者姓名右上角展示绿色爱心图标」（spec_id=spec-living-author-heart-001）
- 被测入口：图书管理后台 `/books` 列表页作者列、`BookFormModal`「作者状态」字段
- 测试类型：E2E（Playwright + Chromium）
- 用例文件：`repos/liuyong0303_demo_v1/tests/e2e/living-author-heart.spec.js`
- 配套 Page Object：`tests/e2e/utils/BooksPage.js`（新增作者状态单选选择器与辅助方法）
- 前置条件：服务通过 `npm run build && npm start` 启动（`playwright.config.js` 自动完成），SQLite DB 全新初始化

## 用例清单

| 用例 ID | 对应 AC | 场景 | 关键断言 |
|---|---|---|---|
| LH-01 | AC-01 | `is_alive=1` 单作者：姓名右上角出现绿色爱心、hover 显示 tooltip「该作者仍在世」、存在 sr-only「（在世）」 | 爱心元素存在；`aria-hidden="true"`；颜色落在绿色色系（G 分量最大且非红/灰）；存在 sr-only 文本「（在世）」；hover 爱心出现 tooltip |
| LH-02 | AC-02 | `is_alive=0`（已故）：作者列无爱心、无 sr-only | `.author-segment--alive`/`.anticon-heart`/`.sr-only` 数量均为 0；存在普通 `.author-segment` |
| LH-03 | AC-03 | `is_alive=NULL`（历史数据/未知/未传字段）：不展示爱心且不报错 | 无爱心、无 sr-only，行正常渲染 |
| LH-04 | AC-04 | `is_alive=1` 多作者（`金庸 / 古龙`）：两个片段各自独立爱心，分隔符纯文本 | `.author-segment--alive` 为 2；爱心/sr-only 各 2；片段文本分别为「金庸」「古龙」；单元格含「 / 」分隔符 |
| LH-05 | AC-05 | `is_alive=0` 多作者：均不展示爱心 | `.author-segment--alive` 与爱心均为 0 |
| LH-06 | AC-08 | 范围边界：打开详情弹窗时作者字段为纯文本，**不出现**爱心或 `.author-segment--alive` | 详情 Modal 内 `.anticon-heart` 为 0 |
| LH-07 | AC-09 | 新增图书选择「在世/已故/未知」保存后列表展示与状态一致 | 选「在世」→ 列表有爱心；选「已故/未知」→ 无爱心 |
| LH-08 | AC-10 | 编辑打开时「作者状态」按 1/0/NULL 正确回显，修改保存后列表同步 | 初始 is_alive=1 时「在世」radio 选中；改为「已故」保存后列表爱心消失；再次编辑时「已故」被选中 |
| LH-09 | AC-12 | 性能/接口：列表加载不新增独立作者状态接口，仅走既有 `/api/books` | 监听到 `/api/books`；未出现包含 `author/is_alive/living` 的独立路径 |
| LH-10 | REQ-001.4 | 交互：hover 作者文字本身不弹 tooltip，hover 爱心才弹 | hover 文本区域时 tooltip 不可见；hover 爱心时 tooltip 可见 |

## 非自动化/人工走查项（AC-11 等视觉项）

- AC-11 多分辨率（1366×900 / 1440×900 / 1920×1080）与深浅色主题下的像素级视觉、对比度、换行行为由 UI 走查确认（当前 E2E 使用 1366×900 视口，断言颜色为绿色色系但不比对具体像素偏移）。
- 图标精确尺寸/偏移（10–12px、top -2~-3px、right -7~-9px）在实现层通过 `fontSize: 11` 等 inline 样式保证，E2E 不做像素断言。

## 测试数据准备策略

- 复用现有 `tests/e2e/utils/api.js` 的 `createBook(baseURL, buildBook({...}}))` 通过 REST API 创建图书，`is_alive` 作为 payload 字段透传；
- 每个用例 `beforeEach` 调用 `resetBooks(baseURL)` 软删除残留数据，避免 ISBN 唯一约束冲突；
- ISBN 继续使用 `buildBook()` 基于时间戳+随机数生成的 13 位唯一串，满足跨用例/跨运行唯一要求。
