// @ts-check
const { defineConfig, devices } = require('@playwright/test');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const PORT = Number(process.env.PORT) || 3001;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

// 探测系统已安装的 Chrome/Chromium 可执行路径，优先复用系统浏览器，避免下载
function detectSystemChromium() {
  const candidates = ['google-chrome-stable', 'google-chrome', 'chromium-browser', 'chromium'];
  for (const bin of candidates) {
    try {
      const p = execSync(`command -v ${bin}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
      if (p) return p;
    } catch (_) {}
  }
  return undefined;
}

const launchOptions = {};
const systemChromium = detectSystemChromium();
if (systemChromium && !process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH && !process.env.PLAYWRIGHT_CHROMIUM_CHANNEL) {
  launchOptions.executablePath = systemChromium;
} else if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
  launchOptions.executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
}

/**
 * E2E 测试配置（图书管理页面）
 * - 启动 webServer 之前清空 server/data（SQLite 数据文件），保证每次 `npm run e2e` 都从全新 DB 开始；
 * - webServer 自动以生产模式（build + start）启动应用（后端托管 web/dist 静态资源）；
 * - 默认优先复用系统已安装的 Chrome/Chromium；
 * - 测试间通过 beforeEach 调用 resetBooks 软删除数据；ISBN 唯一约束包含软删行，
 *   因此跨用例禁止复用固定 ISBN（由 buildBook() 基于时间戳+随机数生成唯一值）。
 * - 失败时保留 trace / 截图，报告输出到 tests/reports/。
 */

// 配置被 require 时立即清空数据目录：Playwright 在启动 webServer 之前会 require 本文件，
// 从而保证服务启动时 DB 文件已被删除，better-sqlite3 首次访问时会重新建库。
(function cleanDataDir() {
  const dataDir = path.join(__dirname, 'server', 'data');
  try {
    if (fs.existsSync(dataDir)) {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  } catch (err) {
    console.warn('[playwright] clean server/data failed:', err.message);
  }
})();

module.exports = defineConfig({
  testDir: './tests/e2e',
  outputDir: './tests/test-results',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: './tests/reports/html', open: 'never' }],
    ['json', { outputFile: './tests/reports/results.json' }],
  ],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
    launchOptions,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        channel: process.env.PLAYWRIGHT_CHROMIUM_CHANNEL || undefined,
        ...devices['Desktop Chrome'],
        viewport: { width: 1366, height: 900 },
        locale: 'zh-CN',
      },
    },
  ],
  webServer: {
    command: 'npm run build && npm start',
    cwd: __dirname,
    url: `${BASE_URL}/api/health`,
    timeout: 180_000,
    reuseExistingServer: false,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      PORT: String(PORT),
      NODE_ENV: 'production',
    },
  },
});
