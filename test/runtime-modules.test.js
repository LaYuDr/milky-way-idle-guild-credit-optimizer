"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const config = require("../src/runtime/config.js");

const root = path.resolve(__dirname, "..");

test("运行时配置集中保留既有信用点、存储键与只读安全边界", () => {
  assert.equal(config.CREDIT_TYPES.length, 8);
  assert.equal(config.GUILD_TOKEN_CREDIT_CONVERSIONS.length, 8);
  assert.equal(config.UI_STATE_STORAGE_KEY, "mwi-guild-credit-ui-state-v1");
  assert.equal(config.MARKET_LIVE_STORAGE_KEY, "mwi-guild-credit-live-market-v1");
  assert.equal(config.SELLER_TAX_RATE, 0.02);
  assert.deepEqual(config.PANEL_VIEWS, ["credit", "upgrade", "construction"]);
  assert.deepEqual(config.DEFAULT_PANEL_ORDER, ["upgrade", "credit", "construction"]);
});

test("构建入口使用显式且无重复的模块清单并最后启动 userscript", () => {
  const source = fs.readFileSync(path.join(root, "tools", "build.js"), "utf8");
  const listMatch = /const SOURCE_FILES = \[([\s\S]*?)\];/.exec(source);
  assert.ok(listMatch, "tools/build.js should declare SOURCE_FILES");
  const files = Array.from(listMatch[1].matchAll(/"([^"]+\.js)"/g), (match) => match[1]);
  assert.equal(files.length, new Set(files).size);
  assert.equal(files.at(-1), "src/userscript.js");
  const requiredModules = [
    "src/runtime/config.js",
    "src/runtime/storage.js",
    "src/runtime/scheduler.js",
    "src/runtime/game-state.js",
    "src/runtime/game-data.js",
    "src/ui/dom.js",
    "src/ui/sortable.js",
    "src/ui/styles.js",
    "src/ui/upgrade-view.js",
    "src/ui/construction-view.js",
    "src/ui/shrine-guide-ui.js",
    "src/ui/exchange-advisor.js",
    "src/ui/panel-shell.js",
    "src/ui/credit-view.js"
  ];
  for (const file of requiredModules) assert.ok(files.includes(file), `missing module entry ${file}`);
  const userscriptIndex = files.indexOf("src/userscript.js");
  assert.ok(requiredModules.every((file) => files.indexOf(file) < userscriptIndex));
  for (const file of files) assert.equal(fs.existsSync(path.join(root, file)), true, `missing ${file}`);
});

test("组合入口保持精简并在页面退出时统一清理运行时资源", () => {
  const source = fs.readFileSync(path.join(root, "src", "userscript.js"), "utf8");
  assert.ok(source.split(/\r?\n/).length <= 1000, "src/userscript.js should remain a composition root");
  assert.match(source, /function disposeRuntime\(\)/);
  assert.match(source, /\.dispose\(\)/);
  assert.match(source, /window\.addEventListener\("pagehide", disposeRuntime/);
});
