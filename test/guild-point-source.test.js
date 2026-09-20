"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const gameStateApi = require("../src/runtime/game-state.js");
const gameDataApi = require("../src/runtime/game-data.js");

const week = "2026-09-18T00:00:00Z";
const nextWeek = "2026-09-25T00:00:00Z";
const guild = { guildID: "guild-1", lifetimeGuildPoints: 100000, guildPoints: 633 };

function stateHarness() {
  const state = { guildPointSummary: null, guildWeekStartAt: null };
  const adapter = gameStateApi.createGameStateAdapter(state);
  return {
    state,
    adapter,
    receive(source) {
      adapter.setGuildPointSummaryFrom(source);
      adapter.setGuildWeekStartAtFrom(source);
    }
  };
}

test("桥接到运行时的实时更新保留零值并传播跨周失效", (t) => {
  const bridge = bridgeHarness();
  const { state, adapter } = stateHarness();
  const previousWindow = global.window;
  global.window = { __mwiGuildCreditBridge: bridge.state };
  t.after(() => {
    if (previousWindow === undefined) delete global.window;
    else global.window = previousWindow;
  });
  const gameData = gameDataApi.createGameData({
    state,
    ...adapter,
    pageWindow: {},
    document: {},
    core: {},
    marketDataApi: {},
    scheduleGuildDataRefresh() {},
    scheduleInventoryDataRefresh() {}
  });
  gameData.hydrateBridgeData();
  bridge.receive({ ...guild, currentWeekStartAt: week, currentWeekGuildPoints: 0 });
  bridge.receive({ ...guild, currentWeekStartAt: week });
  assert.equal(state.guildPointSummary.currentWeekPoints, 0);
  bridge.receive({ currentWeekStartAt: week, currentWeekGuildPoints: 450 });
  assert.equal(state.guildPointSummary.currentWeekPoints, 450);
  bridge.receive({ currentWeekStartAt: nextWeek });
  assert.equal(state.guildPointSummary.currentWeekPoints, undefined);
  assert.equal(state.guildWeekStartAt, Date.parse(nextWeek));
  bridge.receive({ ...guild, currentWeekStartAt: nextWeek });
  assert.equal(state.guildPointSummary.currentWeekPoints, undefined);
});

function bridgeHarness() {
  class FakeWebSocket {
    constructor(url) {
      this.url = url;
      this.listeners = new Map();
    }
    addEventListener(type, listener) {
      this.listeners.set(type, listener);
    }
    receive(source) {
      this.listeners.get("message")({ data: JSON.stringify(source) });
    }
  }
  const page = { WebSocket: FakeWebSocket };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../src/bridge.js"), "utf8"), { window: page, URL });
  const socket = new page.WebSocket("wss://api.milkywayidle.com/ws");
  return { state: page.__mwiGuildCreditBridge, receive: (source) => socket.receive(source) };
}

for (const [name, createHarness] of [
  ["状态层", stateHarness],
  ["桥接层", bridgeHarness]
]) {
  test(`${name}余额不能初始化本周点数或覆盖真实的零值`, () => {
    const { state, receive } = createHarness();
    receive({ ...guild, currentWeekStartAt: week });
    assert.equal(state.guildPointSummary.availablePoints, 633);
    assert.equal(state.guildPointSummary.currentWeekPoints, undefined);
    receive({ currentWeekStartAt: week, currentWeekGuildPoints: 0 });
    receive({ ...guild, currentWeekStartAt: week });
    assert.equal(state.guildPointSummary.currentWeekPoints, 0);
    receive({ ...guild, guildPoints: 33, currentWeekStartAt: week });
    assert.equal(state.guildPointSummary.currentWeekPoints, 0);
    assert.equal(state.guildPointSummary.availablePoints, 33);
  });

  test(`${name}跨周缺失点数时清除旧值且迟到旧周数据不能恢复它`, () => {
    const { state, receive } = createHarness();
    receive({ ...guild, currentWeekStartAt: week, currentWeekGuildPoints: 9000 });
    receive({ currentWeekStartAt: nextWeek });
    assert.equal(state.guildPointSummary.currentWeekPoints, undefined);
    receive({ currentWeekStartAt: week, currentWeekGuildPoints: 9000 });
    assert.equal(state.guildPointSummary.currentWeekPoints, undefined);
    assert.equal(state.guildWeekStartAt, Date.parse(nextWeek));
    receive({ currentWeekStartAt: nextWeek, currentWeekGuildPoints: 0 });
    assert.equal(state.guildPointSummary.currentWeekPoints, 0);
  });

  test(`${name}余额与新周真实点数同帧时保留真实点数`, () => {
    const { state, receive } = createHarness();
    receive({ ...guild, currentWeekStartAt: week, currentWeekGuildPoints: 9000 });
    receive({ ...guild, currentWeekStartAt: nextWeek, currentWeekGuildPoints: 0 });
    assert.equal(state.guildPointSummary.currentWeekPoints, 0);
    receive({ currentWeekStartAt: nextWeek, currentWeekGuildPoints: 450 });
    receive(guild);
    assert.equal(state.guildPointSummary.currentWeekPoints, 450);
  });

  test(`${name}空值与非点数字段不能制造本周零值`, () => {
    for (const value of [null, "", " ", false, [], -1, 1.5]) {
      const { state, receive } = createHarness();
      receive(guild);
      receive({ currentWeekStartAt: week, currentWeekGuildPoints: value });
      assert.equal(state.guildPointSummary.currentWeekPoints, undefined, JSON.stringify(value));
    }
    const { state, receive } = createHarness();
    receive(guild);
    receive({ guildPointsEarned: 250 });
    assert.equal(state.guildPointSummary.currentWeekPoints, undefined);
  });

  test(`${name}旧周余额帧不能覆盖新周零值，切换公会不能继承点数`, () => {
    const { state, receive } = createHarness();
    receive({ ...guild, currentWeekStartAt: nextWeek, currentWeekGuildPoints: 0 });
    receive({ ...guild, currentWeekStartAt: week, currentWeekGuildPoints: 9000 });
    assert.equal(state.guildPointSummary.currentWeekPoints, 0);
    receive({ ...guild, guildID: "guild-2", currentWeekStartAt: nextWeek });
    assert.equal(state.guildPointSummary.guildId, "guild-2");
    assert.equal(state.guildPointSummary.currentWeekPoints, undefined);
  });
}
