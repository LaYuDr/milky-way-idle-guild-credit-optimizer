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
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key)
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

function manualFixture() {
  return {
    schemaVersion: 2,
    source: "manual",
    recordId: "sample-milking",
    key: '["manual","sample-milking"]',
    guildId: null,
    guildName: null,
    weekStartAt: null,
    trialDate: null,
    capturedAt: null,
    trialHrid: "/guild_skilling/milking",
    kind: "skilling",
    points: null,
    party: { done: true, highestTier: null },
    rows: [{ trialHrid: "/guild_skilling/milking", characterId: null, memberKey: "entry-1", workDone: 85470 }],
    members: { "entry-1": { name: "5321" } },
    sourceNote: "09-10; extra tokens retained"
  };
}
const importText = (records, schemaVersion = 2) => JSON.stringify({ schemaVersion, records });
test("导入兼容旧导出和手动整理格式，缺失信息保持未知，名称可为纯数字", () => {
  const manual = manualFixture();
  assert.ok(api.validSnapshot(manual));
  assert.deepEqual(api.parseImport("\uFEFF" + importText([manual])), [manual]);
  const { context, message } = fixture();
  const records = api.completedSnapshots(context, message, now);
  assert.deepEqual(api.parseImport(importText(records, 1)), records);
  assert.equal(api.parseImport(importText([manual]))[0].rows[0].characterId, null);
});
test("导入完整验证，非法日期、负数、缺字段、重复成员和不安全键全部拒绝", () => {
  for (const change of [
    (record) => {
      record.trialDate = "2026-02-30";
    },
    (record) => {
      record.rows[0].workDone = -1;
    },
    (record) => {
      record.rows[0].workDone = "85470";
    },
    (record) => {
      delete record.rows[0].workDone;
    },
    (record) => {
      record.rows.push({ ...record.rows[0] });
    },
    (record) => {
      record.members = null;
    },
    (record) => {
      record.key = "fake";
    },
    (record) => {
      record.guildId = "made-up";
    }
  ]) {
    const record = manualFixture();
    change(record);
    assert.throws(
      () => api.parseImport(importText([record])),
      (error) => error.code === "trialImportInvalidRecord" && error.recordIndex === 1
    );
  }
  assert.throws(() => api.parseImport('{"__proto__":{}}'), /trialImportInvalidJson/);
  assert.throws(() => api.parseImport("broken"), /trialImportInvalidJson/);
  assert.throws(() => api.parseImport(importText([])), /trialImportInvalidFile/);
  assert.throws(() => api.parseImport(importText([manualFixture()], 99)), /trialImportInvalidFile/);
  assert.throws(() => api.parseImport(importText([manualFixture(), manualFixture()])), /trialImportDuplicateKey/);
  assert.throws(() => api.parseImport(" ".repeat(api.MAX_IMPORT_BYTES + 1)), /trialImportTooLarge/);
});
test("导入预览区分新增、同内容重复和同键冲突，不依赖对象键顺序", () => {
  const record = manualFixture();
  const reordered = Object.fromEntries(Object.entries(record).reverse());
  assert.equal(api.previewImport([record], [reordered])[0].status, "duplicate");
  const changed = { ...record, points: 10 };
  assert.equal(api.previewImport([changed], [record])[0].status, "conflict");
  assert.equal(api.previewImport([record], [])[0].status, "new");
  assert.deepEqual(record, manualFixture());
});

test("导入落盘重新检查重复与冲突，绝不覆盖已有记录或其他角色数据", () => {
  const { plugin, values } = storageFixture();
  const record = manualFixture();
  assert.deepEqual(plugin.importTrialHistory([record]), { status: "imported", added: 1, duplicates: 0, conflicts: 0 });
  assert.deepEqual(plugin.importTrialHistory([record]), { status: "imported", added: 0, duplicates: 1, conflicts: 0 });
  assert.deepEqual(plugin.importTrialHistory([{ ...record, points: 100 }]), {
    status: "imported",
    added: 0,
    duplicates: 0,
    conflicts: 1
  });
  assert.equal(plugin.loadTrialHistory().records[0].points, null);
  assert.equal(storageFixture(values, "another").plugin.loadTrialHistory().records.length, 0);
  assert.deepEqual(storageFixture(values).plugin.loadTrialHistory().records, [record]);
});
test("导入整批先验证，写入失败撤回本次新增；撤回失败如实报告部分保存", () => {
  const record = manualFixture();
  const second = { ...record, recordId: "second", key: '["manual","second"]' };
  const { plugin, storage, values } = storageFixture();
  assert.equal(plugin.importTrialHistory([record, { ...second, trialDate: "invalid" }]).status, "failed");
  assert.equal(values.size, 0);
  const write = storage.setItem;
  storage.setItem = (key, text) => {
    if (values.size) throw new Error("quota");
    write(key, text);
  };
  assert.equal(plugin.importTrialHistory([record, second]).status, "failed");
  assert.equal(values.size, 0);
  storage.removeItem = () => {
    throw new Error("blocked");
  };
  assert.equal(plugin.importTrialHistory([record, second]).status, "partial");
  assert.equal(values.size, 1);
});

test("已有游戏导出的零值省略字段仍可导入，保留原始结构", () => {
  const { context, message } = fixture();
  const [record] = api.completedSnapshots(context, message, now);
  delete record.rows[0].workDone;
  assert.deepEqual(api.parseImport(importText([record], 1)), [record]);
  assert.throws(() => api.parseImport(importText([{ ...record, source: "manual" }])), /trialImportInvalidRecord/);
});
