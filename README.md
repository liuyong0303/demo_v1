# demo_v1 · 图书管理后台

演示仓库：基于 **React + Ant Design + Vite（前端）** 与 **Express + better-sqlite3（后端）** 搭建的轻量后台，提供图书的搜索、筛选、分页浏览、详情查看、新增/编辑（Modal 表单）、软删除等能力。

## 目录结构

```
.
├── server/              # Express + SQLite 后端（REST API）
├── web/                 # Vite + React + AntD 前端
└── tests/e2e/           # Playwright E2E 测试（Page Object + API 助手）
```

## 快速开始

```bash
# 1. 安装依赖（根目录 + server + web）
npm run install:all

# 2. 本地开发（并行启动前后端，后端 :3001，前端 :5173）
npm run dev

# 3. 生产构建 + 启动（后端托管 web/dist 静态资源）
npm run build
npm start
```

打开 http://localhost:3001 即可访问（生产模式由后端托管前端静态资源；开发模式使用 Vite 代理到后端）。

## 功能范围

对应需求《图书管理页面 v1.0》：

- 图书列表：关键字（书名/作者/ISBN）+ 分类筛选 + 分页（默认 10 条/页，按创建时间倒序）
- 新增/编辑：Modal 表单，字段 trim、默认值、按钮 loading、未保存离开二次确认、全字段前后端校验
- 详情查看：Modal 展示完整字段与封面大图，封面加载失败降级为占位图
- 软删除：二次确认，删除后即时隐藏；ISBN 全局唯一（含软删数据，不可复用）
- 状态反馈：加载中 Skeleton/Spin、成功/失败 Toast、无数据空态、无结果空态、网络错误提示
- 权限接入点：后端鉴权中间件与前端路由守卫位置已预留（`TODO(auth):` 注释）

## 技术选型

| 层 | 选型 | 说明 |
|---|---|---|
| 前端 | Vite + React 18 + React Router v6 + Ant Design v5 + Axios | 后台管理典型组合，组件齐全 |
| 后端 | Express 4 + better-sqlite3 + cors | 零外部依赖数据库，开箱即用 |
| 存储 | SQLite 文件（`server/data/books.db`） | 自动建表，无需额外配置 |
| E2E | Playwright（系统 Chromium） | 复用本机 Chrome/Chromium，零浏览器下载 |

## E2E 测试

使用 [Playwright](https://playwright.dev/) 驱动本机已安装的 Chrome/Chromium 进行端到端测试（无需 `playwright install`，配置会自动探测 `google-chrome` / `chromium-browser`）。

- 用例：`tests/e2e/books.spec.js`
- Page Object：`tests/e2e/utils/BooksPage.js`
- API 数据准备助手：`tests/e2e/utils/api.js`（`resetBooks` / `createBook` / `buildBook` / `createNBooks`）
- 配置：`playwright.config.js`（启动前自动清空 `server/data/`，以保证每次运行从全新 DB 开始；webServer 自动执行 `npm run build && npm start` 并等待 `/api/health`）

```bash
# 运行所有 E2E 用例（自动 build + 起服务 + 跑完后关闭）
npm run e2e

# 打开上一次运行的 HTML 报告
npm run e2e:report
```

报告产物：

- HTML 报告：`tests/reports/html/index.html`
- JSON 结果：`tests/reports/results.json`
- 失败截图 / trace：`tests/test-results/`

注意事项：

- ISBN 唯一约束包含软删除数据（`deleted_at IS NOT NULL` 的行仍占据 ISBN），因此跨用例禁止复用固定 ISBN，必须通过 `buildBook()` 基于时间戳+随机数生成唯一值。
- 运行前会自动清空 `server/data/`，确保每次运行互不影响；请不要在运行测试期间手动写入 DB 文件。
- 用例覆盖需求验收标准中的主流程、搜索筛选、分页、新增/编辑/详情/软删除、字段校验、ISBN 重复、未保存离开二次确认等关键路径。
