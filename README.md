# demo_v1 · 图书管理后台

演示仓库：基于 **React + Ant Design + Vite（前端）** 与 **Express + better-sqlite3（后端）** 搭建的轻量后台，提供图书的搜索、筛选、分页浏览、详情查看、新增/编辑（Modal 表单）、软删除等能力。

## 目录结构

```
.
├── server/   # Express + SQLite 后端（REST API）
└── web/      # Vite + React + AntD 前端
```

## 快速开始

```bash
# 1. 安装依赖
npm run install:all

# 2. 本地开发（并行启动前后端，后端 :3001，前端 :5173）
npm run dev

# 3. 仅构建前端
npm run build

# 4. 生产启动（启动后端，并由后端托管 web/dist 静态资源）
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
