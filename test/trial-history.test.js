"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const api = require("../src/trial-history.js");
const now = Date.parse("2026-09-18T00:00:00Z");
const week = "2026-09-14T00:00:00Z";
function fixture() {
  return {
    context: {
      guild: {
        id: 7,
        name: "Guild",
        currentWeekStartAt: week,
        currentTrialsData: JSON.stringify({
          skilling: { parties: { milk: { done: true, highestTier: 4 } } },
          combat: { parties: { beast: { done: false } } },
          points: { milk: 99 }
        })
      },
      members: { 1: { name: "Member" } }
    },
    message: {
      type: "guild_trial_stats_updated",
      guildId: 7,
      guildTrialStatList: [
        { trialHrid: "milk", characterId: 1, workDone: 0, futureField: { exact: 123.456 } },
        { trialHrid: "beast", characterId: 1, damageDealt: 321 }
      ]
    }
  };
}
test("试炼归档只接受同公会完成项目，保留零值、完整精度和未知字段", () => {
  const { context, message } = fixture();
  const [record] = api.completedSnapshots(context, message, now);
  assert.equal(api.completedSnapshots(context, message, now).length, 1);
  assert.ok(api.validSnapshot(record));
  assert.equal(record.rows[0].workDone, 0);
  assert.deepEqual(record.rows, [message.guildTrialStatList[0]]);
  assert.equal(record.members[1].name, "Member");
  context.members[1].name = "Changed";
  assert.equal(record.members[1].name, "Member");
  assert.equal(record.points, 99);
  assert.deepEqual(api.completedSnapshots(context, { ...message, guildId: 8 }, now), []);
  assert.deepEqual(api.completedSnapshots(context, { ...message, guildTrialStatList: [] }, now), []);
});
test("未完成、损坏、无公会、未来周和其他消息不归档", () => {
  const { context, message } = fixture();
  for (const currentTrialsData of ["broken", "{}", '{"skilling":{"parties":{"milk":{"done":false}}}}']) {
    assert.deepEqual(
      api.completedSnapshots({ ...context, guild: { ...context.guild, currentTrialsData } }, message, now),
      []
    );
  }
  assert.deepEqual(api.completedSnapshots({}, message, now), []);
  assert.deepEqual(api.completedSnapshots(context, { ...message, type: "guild_updated" }, now), []);
  assert.deepEqual(api.completedSnapshots(context, message, 1), []);
  assert.equal(api.validSnapshot({}), false);
});
test("重复打开标识稳定，跨周、公会不同；退出公会清空成员上下文", () => {
  const { context, message } = fixture();
  const key = api.completedSnapshots(context, message, now)[0].key;
  assert.equal(api.completedSnapshots(context, message, now + 100)[0].key, key);
  const next = api.updateContext(context, { guild: { ...context.guild, currentWeekStartAt: "2026-09-07T00:00:00Z" } });
  assert.notEqual(api.completedSnapshots(next, message, now)[0].key, key);
  assert.deepEqual(api.updateContext(context, { guild: null }).members, {});
  assert.deepEqual(api.updateContext(context, { guild: { id: 8 } }).members, {});
});

const storageApi = require("../src/runtime/storage.js");
const config = require("../src/runtime/config.js");
function storageFixture(values = new Map(), character = "1", hostname = "www.milkywayidle.com") {
  const storage = {
    get length() {
      return values.size;
    },
    key: (i) => Array.from(values.keys())[i],
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value)
  };
  const plugin = storageApi.createPluginStorage({
    storage,
    config,
    trialHistoryApi: api,
    location: { href: `https://${hostname}/game?characterId=${character}`, hostname }
  });
  return { storage, plugin, values };
}
test("归档刷新恢复、重复更新、跨角色和服务器隔离，保留旧成员名", () => {
  const { context, message } = fixture();
  const [record] = api.completedSnapshots(context, message, now);
  const { plugin, values } = storageFixture();
  assert.equal(plugin.saveTrialSnapshot(record), true);
  assert.equal(plugin.saveTrialSnapshot({ ...record, capturedAt: now + 1, members: {} }), true);
  const reloaded = storageFixture(values).plugin.loadTrialHistory();
  assert.equal(reloaded.records.length, 1);
  assert.equal(reloaded.records[0].capturedAt, now + 1);
  assert.equal(reloaded.records[0].members[1].name, "Member");
  assert.equal(storageFixture(values, "2").plugin.loadTrialHistory().records.length, 0);
  assert.equal(storageFixture(values, "1", "www.milkywayidlecn.com").plugin.loadTrialHistory().records.length, 0);
  assert.deepEqual(
    storageApi.normalizePanelOrder(
      ["construction", "credit", "upgrade"],
      config.PANEL_VIEWS,
      config.DEFAULT_PANEL_ORDER
    ),
    ["construction", "credit", "upgrade", "trials"]
  );
});
test("存储失败不覆盖旧记录，损坏条目隔离并明确报告", () => {
  const { context, message } = fixture();
  const [record] = api.completedSnapshots(context, message, now);
  const { storage, plugin, values } = storageFixture();
  plugin.saveTrialSnapshot(record);
  const previous = Array.from(values.values());
  storage.setItem = () => {
    throw new Error("quota");
  };
  assert.equal(plugin.saveTrialSnapshot({ ...record, capturedAt: now + 1 }), false);
  assert.deepEqual(Array.from(values.values()), previous);
  values.set(Array.from(values.keys())[0] + "broken", "{");
  assert.equal(plugin.loadTrialHistory().failed, true);
  assert.equal(plugin.loadTrialHistory().records.length, 1);
});
test("正式消息桥接被动接收统计，并在界面尚未启动时保留快照", () => {
  const vm = require("node:vm");
  const fs = require("node:fs");
  class FakeWebSocket {
    constructor(url) {
      this.url = url;
      this.listeners = new Map();
    }
    addEventListener(type, listener) {
      this.listeners.set(type, listener);
    }
    receive(message) {
      this.listeners.get("message")({ data: JSON.stringify(message) });
    }
  }
  const window = { WebSocket: FakeWebSocket, MwiGuildTrialHistory: api };
  vm.runInNewContext(fs.readFileSync(require.resolve("../src/bridge.js"), "utf8"), { window, URL });
  const socket = new window.WebSocket("wss://api.milkywayidle.com/ws");
  const { context, message } = fixture();
  socket.receive({ type: "guild_updated", guild: context.guild });
  socket.receive({ type: "guild_characters_updated", guildSharableCharacterMap: context.members });
  socket.receive(message);
  const bridge = window.__mwiGuildCreditBridge;
  assert.equal(bridge.pendingTrialSnapshots.length, 1);
  assert.equal(bridge.pendingTrialSnapshots[0].members[1].name, "Member");
  socket.receive({ type: "guild_updated", guild: null });
  socket.receive(message);
  assert.equal(bridge.pendingTrialSnapshots.length, 1);
});
