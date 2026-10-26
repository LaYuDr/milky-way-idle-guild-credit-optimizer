"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const history = require("../src/trial-history.js");
const storageApi = require("../src/runtime/storage.js");
const codec = require("../src/runtime/storage-codec.js");
const config = require("../src/runtime/config.js");

const host = "www.milkywayidlecn.com";
function fixture() {
  const values = new Map();
  const raw = {
    get length() {
      return values.size;
    },
    key: (index) => [...values.keys()][index] ?? null,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key)
  };
  const create = (character = "123", hostname = host) =>
    storageApi.createPluginStorage({
      storage: raw,
      config,
      trialHistoryApi: history,
      location: { hostname, href: `https://${hostname}/game?characterId=${character}` }
    });
  const plugin = create();
  const key = (r) =>
    config.TRIAL_HISTORY_STORAGE_PREFIX +
    ":" +
    plugin.guildBuildingPlannerStorageKey() +
    ":" +
    encodeURIComponent(r.key);
  return { values, raw, plugin, key, create };
}
function record(trialHrid = "/guild_skilling/milking") {
  const weekStartAt = config.GUILD_TRIAL_FIRST_START_AT + 13 * 604800000;
  const kind = trialHrid.startsWith("/guild_combat/") ? "combat" : "skilling";
  return {
    schemaVersion: 1,
    key: JSON.stringify(["guild", weekStartAt, trialHrid]),
    guildId: "guild",
    guildName: "Test",
    weekStartAt,
    capturedAt: weekStartAt + 1,
    trialHrid,
    kind,
    party: { done: true, highestTier: 3 },
    points: 0,
    rows: [
      {
        characterId: 1,
        trialHrid,
        ...(kind === "skilling" ? { workDone: 0 } : { damageDealt: 0, healingDone: 0, premitigatedDamageTaken: 1 })
      }
    ],
    members: { 1: { name: "测试成员" } },
    future: { note: "保持完整原始字段".repeat(1000) }
  };
}
const approval = (plan) => ({
  recoveries: plan
    .filter((e) => e.status === "recoverable")
    .map((e) => ({ key: e.record.key, previousRaw: e.previousRaw }))
});

test("同周生活仍在时缺失战斗按项目恢复，损坏项明确预览并保留原始字节", () => {
  const battle = record("/guild_combat/badger");
  for (const damaged of [
    null,
    "",
    "{",
    "{}",
    JSON.stringify({ ...battle, rows: [] }),
    codec.encode(JSON.stringify(battle)).slice(0, -10)
  ]) {
    const { plugin, raw, key } = fixture();
    const life = record();
    assert.equal(plugin.saveTrialSnapshot(life), true);
    if (damaged !== null) raw.setItem(key(battle), damaged);
    const plan = plugin.previewTrialImport([life, battle], plugin.loadTrialHistory().records);
    assert.deepEqual(
      plan.map((e) => e.status),
      ["duplicate", damaged === null ? "new" : "recoverable"]
    );
    const incoming = plan.filter((e) => ["new", "recoverable"].includes(e.status)).map((e) => e.record);
    const result = plugin.importTrialHistory(incoming, approval(plan));
    assert.equal(result.status, "imported");
    assert.equal(damaged === null ? result.added : result.recovered, 1);
    const loaded = plugin.loadTrialHistory();
    assert.equal(loaded.failed, false);
    assert.deepEqual(loaded.records, [life, battle].sort(history.compareSnapshots));
    const backups = plugin.loadTrialRecoveryBackups();
    assert.equal(backups.length, damaged === null ? 0 : 1);
    if (damaged !== null) {
      assert.equal(backups[0].rawValue, damaged);
      assert.equal(backups[0].storageKey, key(battle));
    }
  }
});

test("未明确批准时不覆盖损坏值；有效冲突与错放键的有效记录始终保留", () => {
  const { plugin, raw, key } = fixture();
  const r = record();
  raw.setItem(key(r), "{");
  assert.equal(plugin.importTrialHistory([r]).conflicts, 1);
  assert.equal(raw.getItem(key(r)), "{");
  assert.equal(plugin.trialRecoveryBackupCount(), 0);
  const other = record("/guild_combat/badger");
  for (const previous of [{ ...r, points: 100 }, other]) {
    const text = JSON.stringify(previous);
    raw.setItem(key(r), text);
    const plan = plugin.previewTrialImport([r]);
    assert.equal(plan[0].status, "conflict");
    assert.equal(plugin.importTrialHistory([r], { recoveries: [{ key: r.key, previousRaw: text }] }).conflicts, 1);
    assert.equal(raw.getItem(key(r)), text);
  }
});

test("待保存的游戏采集优先于损坏磁盘条目，不允许备份覆盖内存记录", () => {
  const { plugin, raw, key } = fixture();
  const r = record();
  raw.setItem(key(r), "{");
  assert.equal(plugin.previewTrialImport([r], [r])[0].status, "duplicate");
  assert.equal(plugin.previewTrialImport([r], [{ ...r, points: 10 }])[0].status, "conflict");
});

test("存储不可读取时预览为不可用，不误判损坏或导致界面异常", () => {
  const { plugin, raw } = fixture();
  raw.getItem = () => {
    throw Error("blocked");
  };
  assert.equal(plugin.previewTrialImport([record()])[0].status, "unavailable");
  assert.equal(plugin.importTrialHistory([record()]).status, "failed");
});

test("备份配额不足时不替换损坏原值", () => {
  const { plugin, raw, key } = fixture();
  const r = record();
  raw.setItem(key(r), "bad");
  const plan = plugin.previewTrialImport([r]);
  const set = raw.setItem;
  raw.setItem = (k, v) => {
    if (k.startsWith("mwi-guild-trial-recovery-v1:")) throw Error("quota");
    set(k, v);
  };
  assert.equal(plugin.importTrialHistory([r], approval(plan)).status, "failed");
  assert.equal(raw.getItem(key(r)), "bad");
  assert.equal(plugin.trialRecoveryBackupCount(), 0);
});

test("恢复写入失败时保留备份，重试不累积相同备份", () => {
  const { plugin, raw, key } = fixture();
  const r = record();
  raw.setItem(key(r), "bad");
  const plan = plugin.previewTrialImport([r]);
  const set = raw.setItem;
  raw.setItem = (k, v) => {
    if (k === key(r)) throw Error("quota");
    set(k, v);
  };
  assert.equal(plugin.importTrialHistory([r], approval(plan)).status, "failed");
  assert.equal(plugin.trialRecoveryBackupCount(), 1);
  assert.equal(raw.getItem(key(r)), "bad");
  raw.setItem = set;
  assert.equal(plugin.importTrialHistory([r], approval(plan)).recovered, 1);
  assert.equal(plugin.trialRecoveryBackupCount(), 1);
});

test("批次后续写入失败会精确回滚损坏压缩原值，备份仍可导出", () => {
  const { plugin, raw, key } = fixture();
  const first = record();
  const second = record("/guild_combat/badger");
  const broken = codec.encode(JSON.stringify(first)).slice(0, -10);
  raw.setItem(key(first), broken);
  const plan = plugin.previewTrialImport([first, second]);
  const set = raw.setItem;
  raw.setItem = (k, v) => {
    if (k === key(second)) throw Error("quota");
    set(k, v);
  };
  const result = plugin.importTrialHistory([first, second], approval(plan));
  assert.equal(result.status, "failed");
  assert.equal(result.recovered, undefined);
  assert.equal(raw.getItem(key(first)), broken);
  assert.equal(raw.getItem(key(second)), null);
  assert.equal(plugin.loadTrialRecoveryBackups()[0].rawValue, broken);
});

test("回滚失败如实报告仍保留的恢复项", () => {
  const { plugin, raw, key } = fixture();
  const first = record();
  const second = record("/guild_combat/badger");
  raw.setItem(key(first), "broken");
  const plan = plugin.previewTrialImport([first, second]);
  const set = raw.setItem;
  raw.setItem = (k, v) => {
    if (k === key(second) || v === "broken") throw Error("quota");
    set(k, v);
  };
  const result = plugin.importTrialHistory([first, second], approval(plan));
  assert.equal(result.status, "partial");
  assert.equal(result.recovered, 1);
  assert.deepEqual(plugin.loadTrialHistory().records, [first]);
});

test("预览后原值变化或备份时出现新写入都会停止，不覆盖其他页面", () => {
  for (const when of ["before", "during-backup"]) {
    const { plugin, raw, key } = fixture();
    const r = record();
    raw.setItem(key(r), "old");
    const plan = plugin.previewTrialImport([r]);
    const set = raw.setItem;
    if (when === "before") raw.setItem(key(r), "new damaged value");
    else
      raw.setItem = (k, v) => {
        set(k, v);
        if (k.startsWith("mwi-guild-trial-recovery-v1:")) set(key(r), "new damaged value");
      };
    assert.equal(plugin.importTrialHistory([r], approval(plan)).status, "stale");
    assert.equal(raw.getItem(key(r)), "new damaged value");
  }
});

test("恢复备份按角色与服务器隔离，不能被当成普通试炼记录", () => {
  const { plugin, raw, key, create } = fixture();
  const r = record();
  raw.setItem(key(r), "broken");
  plugin.importTrialHistory([r], approval(plugin.previewTrialImport([r])));
  assert.equal(plugin.trialRecoveryBackupCount(), 1);
  assert.equal(create("456").trialRecoveryBackupCount(), 0);
  assert.deepEqual(create("123", "www.milkywayidle.com").loadTrialRecoveryBackups(), []);
  assert.equal(plugin.loadTrialHistory().records.length, 1);
});
