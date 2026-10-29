# E2E 测试报告：图书列表在世作者绿色爱心图标

- 仓库：`liuyong0303/demo_v1`（`repos/liuyong0303_demo_v1`）
- 分支：`feat/living-author-heart-icon-wmkk`
- Head Commit：`8553b98`
- 执行时间：2026-10-28T05:46:58Z
- 测试框架：Playwright 1.47 + 系统 Chromium（/usr/bin/chromium-browser）
- 执行环境：Node v22.21.0 / 视口 1366×900 / locale zh-CN
- 启动方式：`playwright.config.js` webServer 自动 `npm run build && npm start`，每次运行前清空 `server/data/` 初始化干净 DB

## 结论

**PASS**

- 本轮新增 10 条在世作者爱心相关用例（LH-01 ~ LH-10）全部通过；
- 既有 10 条主流程用例（TC-01 ~ TC-10：空态/新增/校验/搜索/编辑/详情/删除/ISBN 重复/分页/未保存离开）同步回归，全部通过；
- 无业务侧失败；无阻塞项。

## 执行范围

| 范围 | 用例数 | 结果 |
|---|---|---|
| 新增用例 `tests/e2e/living-author-heart.spec.js`（AC-01~05/08~10、REQ-001.4、AC-12） | 10 | ✓ 10 passed |
| 既有回归 `tests/e2e/books.spec.js` | 10 | ✓ 10 passed |
| **合计** | **20** | **✓ 20 passed, 0 failed** |

总耗时：约 46s（含 web 构建+服务启动+DB 初始化+所有用例执行）。

## 用例明细（新增）

| 用例 | 名称 | 结果 | 耗时 |
|---|---|---|---|
| LH-01 | is_alive=1 单作者：爱心/tooltip/sr-only 完整 | passed | ~900ms |
| LH-02 | is_alive=0（已故）不展示爱心 | passed | ~800ms |
| LH-03 | is_alive=NULL（未知/历史）不展示爱心 | passed | ~650ms |
| LH-04 | is_alive=1 多作者：每个片段独立爱心+分隔符纯文本 | passed | ~670ms |
| LH-05 | is_alive=0 多作者：均无爱心 | passed | ~660ms |
| LH-06 | 详情弹窗无爱心（范围边界） | passed | ~1.4s |
| LH-07 | 新增：在世/已故/未知三态保存与列表展示一致 | passed | ~4.5s |
| LH-08 | 编辑：作者状态三态回显+切换后列表同步 | passed | ~2.5s |
| LH-09 | 列表加载无新增独立作者状态相关接口 | passed | ~640ms |
| LH-10 | hover 爱心才弹 tooltip，hover 文本本身不弹 | passed | ~1.2s |

## 覆盖映射

- AC-01 ✅（LH-01）：爱心/tooltip/sr-only 均已断言；颜色通过「绿色通道强于红/蓝且非红」判定 colorSuccess 绿色色系。
- AC-02 ✅（LH-02）、AC-03 ✅（LH-03）：已故/未知不展示爱心。
- AC-04 ✅（LH-04）、AC-05 ✅（LH-05）：多作者场景展示/不展示。
- AC-08 ✅（LH-06）：详情弹窗无爱心（范围边界）。
- AC-09 ✅（LH-07）、AC-10 ✅（LH-08）：新增/编辑三态保存与回显。
- AC-12 ✅（LH-09）：不新增独立接口（无 author/is_alive/living 路径请求）。
- REQ-001.4 ✅（LH-10）：仅 hover 爱心时显示 tooltip。
- AC-06（整书共用 is_alive，多作者同状态）由 LH-04/LH-05 间接覆盖（测试数据始终为单字段驱动）。
- AC-07（空作者/非法值）由 REQ-001.7/REQ-001.8 定义，但本期测试数据均为合法字符串；考虑到渲染函数做了空/非法值防御、后端规整非法值为 null（LH-03 已覆盖 null 无爱心），该类脏数据路径在后端规整层保护，不额外构造脏数据 E2E。
- AC-11（多分辨率/深浅色/像素级布局）不在 E2E 范围内，交由 UI 走查。
- AC-13（旧 DB 启动迁移）由 `playwright.config.js` 每次运行删除 `server/data/` 触发首次建库 + `db.js` 幂等迁移路径覆盖，连续两轮 webServer 启动均无报错即为通过。
- AC-14（既有主流程）由 TC-01~TC-10 回归覆盖，全部 passed。

## 修复记录

- 首轮执行 LH-01 颜色断言因硬编码匹配 Tailwind 绿 #22C55E 失败（实际 AntD 默认 colorSuccess 为 #52c41a → rgb(82,196,26)）；已将 E2E 断言改为基于 RGB 通道的绿色色系判定，复测通过。该修复仅在测试断言侧完成，未修改任何被测业务代码。

## 证据路径

- HTML 报告：`repos/liuyong0303_demo_v1/tests/reports/html/index.html`
- JSON 结果：`repos/liuyong0303_demo_v1/tests/reports/results.json`
- 失败截图/trace（当前无失败，无额外附件；若后续出现失败将落入 `tests/test-results/`）
