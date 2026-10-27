"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const config = require("../src/runtime/config.js");

function fixture({ delayed = false, missing = false, fail = false } = {}) {
  const calls = [];
  const guild = {
    props: { guild: {} },
    tabChanged: (tab) => calls.push(["tab", tab]),
    creditTileClicked: (credit) => {
      if (fail) throw new Error("stale UI");
      calls.push(["open", credit]);
    },
    executeExchange: () => assert.fail("must not exchange")
  };
  const game = { handleChangeNavTarget: (target) => calls.push(["navigate", target]) };
  const fiber = { stateNode: game, sibling: delayed || missing ? null : { stateNode: guild } };
  const root = { __reactContainer$test: { current: { child: fiber } } };
  const page = {
    WebSocket: class {},
    document: { getElementById: () => root },
    setTimeout: (fn) => {
      if (!missing) fiber.sibling = { stateNode: guild };
      queueMicrotask(fn);
    }
  };
  vm.runInNewContext(fs.readFileSync(require.resolve("../src/bridge.js"), "utf8"), { window: page, URL });
  return { bridge: page.__mwiGuildCreditBridge, calls };
}

test("八种信用点均只打开公会商店与对应兑换弹窗", async () => {
  for (const [credit] of config.CREDIT_TYPES) {
    const f = fixture();
    assert.equal(await f.bridge.openGuildCreditExchange(credit), true);
    assert.deepEqual(f.calls, [
      ["navigate", "guild"],
      ["tab", "shop"],
      ["open", credit]
    ]);
  }
  const f = fixture();
  for (const value of [null, undefined, {}, "/items/guild_token", "/items/not_guild_credit"]) {
    assert.equal(await f.bridge.openGuildCreditExchange(value), false);
  }
  assert.deepEqual(f.calls, []);
});

test("导航后等待挂载，取消与后续点击不会打开旧弹窗", async () => {
  const f = fixture({ delayed: true });
  assert.equal(await f.bridge.openGuildCreditExchange("/items/brown_guild_credit"), true);
  const cancelled = fixture({ delayed: true });
  const pending = cancelled.bridge.openGuildCreditExchange("/items/white_guild_credit");
  cancelled.bridge.cancelGuildCreditNavigation();
  assert.equal(await pending, false);
  assert.deepEqual(cancelled.calls, [["navigate", "guild"]]);
  const latest = fixture({ delayed: true });
  const first = latest.bridge.openGuildCreditExchange("/items/white_guild_credit");
  const second = latest.bridge.openGuildCreditExchange("/items/blue_guild_credit");
  assert.equal(await first, false);
  assert.equal(await second, true);
  assert.deepEqual(
    latest.calls.filter(([kind]) => kind === "open"),
    [["open", "/items/blue_guild_credit"]]
  );
});

test("组件缺失与原生方法异常安全失败", async () => {
  assert.equal(await fixture({ missing: true }).bridge.openGuildCreditExchange("/items/red_guild_credit"), false);
  assert.equal(await fixture({ fail: true }).bridge.openGuildCreditExchange("/items/red_guild_credit"), false);
});
