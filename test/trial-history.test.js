"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const api = require("../src/trial-history.js");
const now = Date.parse("2026-09-18T00:00:00Z");
const week = "2026-09-14T00:00:00Z";
test("原始明细保留官方省略零值与手动未知值的区别", () => {
  for (const field of ["workDone", "damageDealt", "healingDone", "premitigatedDamageTaken"]) {
    assert.equal(api.metricValue({ schemaVersion: 1 }, {}, field), 0);
    assert.equal(api.metricValue({ schemaVersion: 2 }, {}, field), null);
    for (const schemaVersion of [1, 2]) {
      for (const value of [0, 123456789.125])
        assert.equal(api.metricValue({ schemaVersion }, { [field]: value }, field), value);
      for (const value of [null, -1, Infinity, NaN, "12"])
        assert.equal(api.metricValue({ schemaVersion }, { [field]: value }, field), null);
    }
  }
});

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

test("离会提示只使用同公会已读取的名单，按 ID 匹配且不改历史名字", () => {
  const { context, message } = fixture();
  const [record] = api.completedSnapshots(context, message, now);
  const row = record.rows[0];
  const original = JSON.stringify(record);
  assert.equal(api.memberAbsent(record, row, context), false);
  const present = api.updateContext(context, {
    type: "guild_characters_updated",
    guildId: 7,
    guildCharacterMap: { 1: {} },
    guildSharableCharacterMap: { 1: { name: "Renamed" } }
  });
  assert.equal(api.memberAbsent(record, row, present), false);
  const absent = api.updateContext(present, {
    type: "guild_characters_updated",
    guildId: 7,
    guildCharacterMap: {},
    guildSharableCharacterMap: {}
  });
  assert.equal(api.memberAbsent(record, row, absent), true);
  assert.equal(JSON.stringify(record), original);
  assert.equal(api.memberAbsent(record, row, api.updateContext(absent, { guild: { id: 8 } })), false);
  assert.equal(api.memberAbsent(record, row, api.updateContext(absent, { guild: null })), false);
  assert.equal(api.memberAbsent({ ...record, guildId: "8" }, row, absent), false);
  const otherGuild = api.updateContext(present, {
    type: "guild_characters_updated",
    guildId: 8,
    guildSharableCharacterMap: {}
  });
  assert.equal(api.memberAbsent(record, row, otherGuild), false);
  assert.equal(otherGuild.roster, present.roster);
  const statsNames = api.updateContext(absent, { ...message, guildSharableCharacterMap: context.members });
  assert.equal(api.memberAbsent(record, row, statsNames), true);
  assert.equal(
    api.memberAbsent(record, row, api.updateContext(context, { ...message, guildSharableCharacterMap: {} })),
    false
  );
  assert.equal(
    api.memberAbsent(
      record,
      row,
      api.updateContext(context, { type: "guild_characters_updated", guildSharableCharacterMap: [] })
    ),
    false
  );
});

test("手动记录只在公会已知且当前姓名完整时匹配原始姓名", () => {
  const record = { ...manualFixture(), guildName: "Guild" };
  const row = record.rows[0];
  const context = api.updateContext(
    { guild: { id: 7, name: "Guild" } },
    {
      type: "guild_characters_updated",
      guildSharableCharacterMap: { 1: { name: "5321" } }
    }
  );
  assert.equal(api.memberAbsent(record, row, context), false);
  assert.equal(api.memberAbsent({ ...record, members: { "entry-1": { name: "Absent" } } }, row, context), true);
  assert.equal(api.memberAbsent({ ...record, guildName: null }, row, context), false);
  assert.equal(api.memberAbsent({ ...record, guildName: "Other Guild" }, row, context), false);
  assert.equal(api.memberAbsent({ ...record, members: {} }, row, context), false);
  const incomplete = api.updateContext(context, { type: "guild_characters_updated", guildCharacterMap: { 2: {} } });
  assert.equal(api.memberAbsent(record, row, incomplete), false);
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
function levelFixture() {
  const { context, message } = fixture();
  context.guild.currentTrialsData = JSON.stringify({
    skilling: { parties: { milk: { done: true } } },
    combat: { parties: { beast: { done: true } } }
  });
  return {
    message,
    context: api.updateContext(context, {
      type: "guild_characters_updated",
      guildCharacterMap: {
        1: { signupWeekStartAt: week, signedUpSkillingTrialHrid: "milk", signedUpCombatTrialHrid: "beast" }
      },
      guildTrialSignupLevelMap: { 1: { skillingTrialLevel: 143, combatLevel: 97.25 } }
    })
  };
}
test("项目等级按成员、周和项目归档，生活和战斗分别保存完整数值", () => {
  const { context, message } = levelFixture();
  const records = api.completedSnapshots(context, message, now);
  assert.equal(api.memberLevel(records[0], records[0].rows[0]), 143);
  assert.equal(api.memberLevel(records[1], records[1].rows[0]), 97.25);
  context.signupLevels[1].skillingTrialLevel = 200;
  assert.equal(api.memberLevel(records[0], records[0].rows[0]), 143);
  assert.deepEqual(records[0].rows, [message.guildTrialStatList[0]]);
  assert.deepEqual(api.parseImport(importText(records)), records);
  const { plugin, values } = storageFixture();
  for (const record of records) assert.equal(plugin.saveTrialSnapshot(record), true);
  plugin.saveTrialSnapshot({ ...records[0], memberLevels: { 1: 200 } });
  plugin.saveTrialSnapshot({ ...records[0], memberLevels: undefined });
  const loaded = storageFixture(values).plugin.loadTrialHistory().records;
  assert.equal(
    api.memberLevel(
      loaded.find((r) => r.kind === "skilling"),
      records[0].rows[0]
    ),
    143
  );
});
test("等级迟到可补齐，但不使用其他周、公会、项目或手动记录的当前等级", () => {
  const { context, message } = levelFixture();
  const [record] = api.completedSnapshots({ ...context, signupLevels: {} }, message, now);
  assert.equal(api.memberLevel(record, record.rows[0]), null);
  assert.equal(api.memberLevel(api.withMemberLevels(record, context), record.rows[0]), 143);
  for (const wrong of [
    { ...context, guild: { ...context.guild, id: 8 } },
    { ...context, guild: { ...context.guild, currentWeekStartAt: "2026-09-07T00:00:00Z" } },
    { ...context, signups: { 1: { ...context.signups[1], signedUpSkillingTrialHrid: "other" } } },
    { ...context, signups: { 1: { ...context.signups[1], signupWeekStartAt: "2026-09-07T00:00:00Z" } } },
    { ...context, signupLevels: {} }
  ])
    assert.equal(api.withMemberLevels(record, wrong), record);
  assert.equal(api.withMemberLevels(manualFixture(), context).memberLevels, undefined);
  const switched = api.updateContext(context, {
    guild: { ...context.guild, currentWeekStartAt: "2026-09-07T00:00:00Z" }
  });
  assert.deepEqual(switched.signupLevels, {});
  assert.deepEqual(switched.signups, {});
  assert.deepEqual(api.updateContext(context, { guild: null }).signupLevels, {});
  assert.deepEqual(
    api.updateContext(context, { type: "guild_characters_updated", guildCharacterMap: context.signups }).signupLevels,
    {}
  );
  const signup = api.updateContext(context, {
    type: "guild_trial_signup_updated",
    characterId: 1,
    ...context.signups[1],
    trialSignupLevels: { skillingTrialLevel: 155 }
  });
  assert.equal(api.memberLevel(api.withMemberLevels(record, signup), record.rows[0]), 155);
});
test("等级缺失保持未知，旧文件兼容，导入拒绝非法等级和无法对应的成员", () => {
  const manual = manualFixture();
  assert.equal(api.memberLevel(manual, manual.rows[0]), null);
  for (const level of [0, 1, 160, 99.125, null]) {
    const record = { ...manual, memberLevels: { "entry-1": level } };
    assert.deepEqual(api.parseImport(importText([record])), [record]);
  }
  for (const memberLevels of [[], "160", { "entry-1": -1 }, { "entry-1": "160" }, { unknown: 100 }]) {
    assert.throws(() => api.parseImport(importText([{ ...manual, memberLevels }])), /trialImportInvalidRecord/);
  }
  const { context, message } = levelFixture();
  for (const level of [null, -1, Infinity, NaN, "160"]) {
    context.signupLevels[1].skillingTrialLevel = level;
    const [record] = api.completedSnapshots(context, message, now);
    assert.equal(api.memberLevel(record, record.rows[0]), null);
  }
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
  let refreshes = 0;
  bridge.onTrialStatsUpdated = () => refreshes++;
  socket.receive({ type: "guild_characters_updated", guildSharableCharacterMap: {} });
  assert.equal(refreshes, 1);
  assert.equal(bridge.pendingTrialSnapshots.length, 1);
  assert.equal(
    api.memberAbsent(bridge.pendingTrialSnapshots[0], message.guildTrialStatList[0], bridge.trialHistoryContext),
    true
  );
  socket.receive({ type: "guild_updated", guild: null });
  assert.equal(refreshes, 2);
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
test("手动日期按周五归周，兼容非补零日期且不依赖当前年份", () => {
  for (const [input, date, start, ordinal] of [
    ["2026-9-3", "2026-09-03", "2026-08-28", 8],
    ["2026-9-10", "2026-09-10", "2026-09-04", 9],
    ["2026-9-4", "2026-09-04", "2026-09-04", 9],
    ["2026-07-10", "2026-07-10", "2026-07-10", 1]
  ]) {
    const record = { ...manualFixture(), trialDate: input };
    const [parsed] = api.parseImport(importText([record]));
    assert.equal(parsed.trialDate, date);
    assert.equal(parsed.weekStartAt, Date.parse(start));
    assert.equal(api.weekNumber(parsed.weekStartAt), ordinal);
    assert.equal(parsed.key, record.key);
    assert.deepEqual(parsed.rows, record.rows);
    assert.deepEqual(api.parseImport(importText([parsed])), [parsed]);
  }
  for (const trialDate of ["9-10", "2026-2-30", "2026-07-09"]) {
    assert.throws(() => api.parseImport(importText([{ ...manualFixture(), trialDate }])), /trialImportInvalidRecord/);
  }
  assert.throws(
    () =>
      api.parseImport(
        importText([
          {
            ...manualFixture(),
            trialDate: "2026-09-03",
            weekStartAt: Date.parse("2026-09-04")
          }
        ])
      ),
    /trialImportInvalidRecord/
  );
});

test("已导入未知日期可补全周次，但不同统计或已有日期仍为冲突", () => {
  const old = manualFixture();
  const [dated] = api.parseImport(importText([{ ...old, trialDate: "2026-9-3" }]));
  assert.equal(api.previewImport([dated], [old])[0].status, "dated");
  assert.equal(api.previewImport([dated], [{ ...old, points: 1 }])[0].status, "conflict");
  const [otherWeek] = api.parseImport(importText([{ ...old, trialDate: "2026-9-10" }]));
  assert.equal(api.previewImport([otherWeek], [dated])[0].status, "conflict");
  assert.equal(api.previewImport([old], [dated])[0].status, "duplicate");
  const { plugin, values } = storageFixture();
  plugin.importTrialHistory([old]);
  assert.equal(plugin.importTrialHistory([dated]).dated, 1);
  assert.equal(values.size, 1);
  assert.deepEqual(plugin.loadTrialHistory().records, [dated]);
  assert.equal(plugin.importTrialHistory([dated]).duplicates, 1);
  assert.equal(plugin.importTrialHistory([old]).duplicates, 1);
  assert.deepEqual(plugin.loadTrialHistory().records, [dated]);
});

test("补全日期后批量写入失败会恢复原始记录", () => {
  const old = manualFixture();
  const [dated] = api.parseImport(importText([{ ...old, trialDate: "2026-9-3" }]));
  const second = { ...old, recordId: "second", key: '["manual","second"]' };
  const { plugin, storage, values } = storageFixture();
  plugin.importTrialHistory([old]);
  const original = Array.from(values.entries());
  const write = storage.setItem;
  storage.setItem = (key, text) => {
    if (key.includes("second")) throw new Error("quota");
    write(key, text);
  };
  assert.equal(plugin.importTrialHistory([dated, second]).status, "failed");
  assert.deepEqual(Array.from(values.entries()), original);
});

test("旧版已知日期记录读取时归周，保留存储原文且再次导入不冲突", () => {
  const old = { ...manualFixture(), trialDate: "2026-09-03" };
  const { plugin, values } = storageFixture();
  plugin.importTrialHistory([old]);
  const key = Array.from(values.keys())[0];
  values.set(key, JSON.stringify(old));
  const [dated] = plugin.loadTrialHistory().records;
  assert.equal(dated.weekStartAt, Date.parse("2026-08-28"));
  assert.equal(values.get(key), JSON.stringify(old));
  assert.equal(plugin.importTrialHistory([dated]).duplicates, 1);
});

test("补全周次撤回失败会明确报告，损坏已有条目不被覆盖", () => {
  const old = manualFixture();
  const [dated] = api.parseImport(importText([{ ...old, trialDate: "2026-09-10" }]));
  const second = { ...old, recordId: "second", key: '["manual","second"]' };
  const { plugin, storage, values } = storageFixture();
  plugin.importTrialHistory([old]);
  const write = storage.setItem;
  let writes = 0;
  storage.setItem = (key, text) => {
    if (writes++ > 0) throw new Error("quota");
    write(key, text);
  };
  assert.deepEqual(plugin.importTrialHistory([dated, second]), {
    status: "partial",
    added: 0,
    dated: 1,
    duplicates: 0,
    conflicts: 0
  });
  assert.deepEqual(plugin.loadTrialHistory().records, [dated]);
  const key = Array.from(values.keys())[0];
  values.set(key, "{");
  assert.equal(plugin.importTrialHistory([dated]).conflicts, 1);
  assert.equal(values.get(key), "{");
});

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
  assert.deepEqual(plugin.importTrialHistory([record]), {
    status: "imported",
    added: 1,
    dated: 0,
    duplicates: 0,
    conflicts: 0
  });
  assert.deepEqual(plugin.importTrialHistory([record]), {
    status: "imported",
    added: 0,
    dated: 0,
    duplicates: 1,
    conflicts: 0
  });
  assert.deepEqual(plugin.importTrialHistory([{ ...record, points: 100 }]), {
    status: "imported",
    added: 0,
    dated: 0,
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

test("历史展示按周倒序归组，日期可补周，未知周置后且不改写记录", () => {
  const base = manualFixture();
  const records = [
    { ...base, key: "unknown" },
    { ...base, key: "week8", trialDate: "2026-09-03" },
    { ...base, key: "week9", weekStartAt: Date.parse("2026-09-04") },
    { ...base, key: "week9-midweek", weekStartAt: Date.parse("2026-09-07") }
  ];
  const before = JSON.stringify(records);
  const weeks = api.historyWeeks(records);
  assert.deepEqual(
    weeks.map((w) => w.key),
    ["9", "8", "unknown"]
  );
  assert.deepEqual(
    weeks[0].records.map((r) => r.key),
    ["week9", "week9-midweek"]
  );
  assert.equal(weeks[0].weekStartAt, Date.parse("2026-09-04"));
  assert.equal(weeks[2].weekNumber, null);
  assert.equal(JSON.stringify(records), before);
  assert.deepEqual(api.historyWeeks([]), []);
});

test("项目展示按项目和类型分组，多公会及同周多记录不丢失、不合并数值", () => {
  const base = manualFixture();
  const records = [
    { ...base, key: "combat", kind: "combat" },
    { ...base, key: "a", guildName: "A" },
    { ...base, key: "b", guildName: "B" },
    { ...base, key: "other", trialHrid: "/guild_skilling/foraging" }
  ];
  const projects = api.historyProjects(records);
  assert.equal(projects.length, 3);
  assert.equal(projects.at(-1).kind, "combat");
  const milk = projects.find((p) => p.key === api.historyProjectKey(base));
  assert.deepEqual(
    milk.records.map((r) => r.key),
    ["a", "b"]
  );
  assert.equal(milk.records[0], records[1]);
  assert.equal(
    projects.reduce((sum, p) => sum + p.records.length, 0),
    records.length
  );
  assert.deepEqual(api.historyProjects([]), []);
});
