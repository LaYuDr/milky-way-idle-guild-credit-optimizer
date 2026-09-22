"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const api = require("../src/trial-history.js");
const storageApi = require("../src/runtime/storage.js");
const config = require("../src/runtime/config.js");

const names = [
  [6, "000wy", "kwy"],
  [11, "BS000", "BSK"],
  [14, "ABCDEFGHIJ000MLN", "ABCDEFGHIJKMLN"],
  [19, "BigBa000a", "BigBaKa"],
  [29, "catcoo000ie", "catcookie"],
  [32, "tian000ongyiran", "tiankongyiran"],
  [35, "000aela", "Kaela"],
  [37, "su000hoiwham", "sukhoiwham"],
  [42, "Ryuu000u2", "Ryuuku2"],
  [47, "000ali000uno", "kalikuno"]
];
function legacyRecord() {
  const recordId = "7b1591d8-9b9c-5aaf-9552-39dcebea9277";
  const trialHrid = "/guild_combat/swarm";
  return {
    schemaVersion: 2,
    source: "manual",
    recordId,
    key: JSON.stringify(["manual", recordId]),
    sourceSha256: "f85b3a0c18ad9217bae121da5eeba254922f4907fa7a683a752f99025f68f1e8",
    guildId: null,
    guildName: null,
    trialDate: "2026-09-04",
    weekStartAt: Date.parse("2026-09-04"),
    capturedAt: null,
    trialHrid,
    kind: "combat",
    points: null,
    party: { done: true, highestTier: null },
    members: Object.fromEntries(names.map(([row, name]) => [`excel-row-${row}`, { name }])),
    rows: names.map(([row, name]) => ({
      characterId: null,
      memberKey: `excel-row-${row}`,
      trialHrid,
      damageDealt: row * 100,
      healingDone: 0,
      premitigatedDamageTaken: row,
      sourceCells: { [`J${row}`]: { value: name, formula: null } }
    }))
  };
}

test("已确认的旧 Excel 名字损坏按来源和行号精确修复，保留原名与原始单元格", () => {
  const record = legacyRecord();
  const before = JSON.stringify(record);
  const fixed = api.normalizeSnapshot(record);
  for (const [row, original, expected] of names) {
    const member = fixed.members[`excel-row-${row}`];
    assert.equal(member.name, expected);
    assert.equal(member.nameCorrection.originalName, original);
  }
  assert.deepEqual(fixed.rows, record.rows);
  assert.equal(JSON.stringify(record), before);
  assert.deepEqual(api.normalizeSnapshot(fixed), fixed);
  assert.equal(api.validSnapshot(fixed), true);
});

test("相似名字不触发全局替换，非指定来源、行号、原文或带数字 ID 的记录不修复", () => {
  const original = legacyRecord();
  for (const changes of [
    { sourceSha256: "another-file" },
    { recordId: "another-record" },
    { source: "automatic" },
    { schemaVersion: 1 },
    { trialHrid: "/guild_combat/badger" },
    { kind: "skilling" }
  ]) {
    const input = { ...original, ...changes };
    assert.deepEqual(api.normalizeSnapshot(input).members, input.members);
  }
  for (const change of [
    (r) => {
      r.rows[0].characterId = 123;
    },
    (r) => {
      r.rows[0].sourceCells.J6.value = "different";
    },
    (r) => {
      r.rows[0].memberKey = "another-row";
    },
    (r) => {
      r.members["excel-row-6"].name = "000wyEdited";
    }
  ]) {
    const input = legacyRecord();
    change(input);
    assert.deepEqual(api.normalizeSnapshot(input).members["excel-row-6"], input.members["excel-row-6"]);
  }
});

test("已保存旧记录、导入预览及导出重导入得到一致名字，读取不改写浏览器原始备份", () => {
  const record = legacyRecord();
  const text = JSON.stringify(record);
  const key = `${config.TRIAL_HISTORY_STORAGE_PREFIX}:${config.GUILD_BUILDING_PLAN_STORAGE_PREFIX}:www.milkywayidle.com:1:${encodeURIComponent(record.key)}`;
  const values = new Map([[key, text]]);
  const storage = {
    get length() {
      return values.size;
    },
    key: (i) => [...values.keys()][i],
    getItem: (k) => values.get(k) ?? null,
    setItem: (k, v) => values.set(k, v)
  };
  const plugin = storageApi.createPluginStorage({
    storage,
    config,
    trialHistoryApi: api,
    location: { href: "https://www.milkywayidle.com/game?characterId=1", hostname: "www.milkywayidle.com" }
  });
  const parsed = api.parseImport(JSON.stringify({ schemaVersion: 2, records: [record] }))[0];
  assert.deepEqual(plugin.loadTrialHistory().records, [parsed]);
  assert.equal(values.get(key), text);
  assert.equal(api.previewImport([parsed], [record])[0].status, "duplicate");
  assert.deepEqual(api.parseImport(JSON.stringify({ schemaVersion: 2, records: [parsed] })), [parsed]);
  const official = {
    ...record,
    schemaVersion: 1,
    source: undefined,
    key: "official",
    rows: [{ characterId: 315187 }],
    members: { 315187: { name: "tiankongyiran" } }
  };
  assert.equal(api.historyMembers([parsed, official]).filter((m) => m.name === "tiankongyiran").length, 1);
  assert.equal(
    api.memberHistory([parsed, official], { id: "315187", name: "tiankongyiran" }).flatMap((w) => w.records).length,
    2
  );
});
