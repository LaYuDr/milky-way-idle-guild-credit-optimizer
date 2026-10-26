"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const history = require("../src/trial-history.js");
const storageApi = require("../src/runtime/storage.js");
const config = require("../src/runtime/config.js");
const week = config.GUILD_TRIAL_FIRST_START_AT + 13 * 604800000;
const life = "/guild_skilling/milking";
const battle = "/guild_combat/badger";
function captures() {
  const context = {
    guild: {
      id: 7,
      name: "Test",
      currentWeekStartAt: week,
      currentTrialsData: {
        skilling: { parties: { [life]: { done: true } } },
        combat: { parties: { [battle]: { done: true } } },
        points: { [life]: 100, [battle]: 200 }
      }
    },
    members: { 1: { name: "Low", extra: "保存原字段".repeat(1000) }, 2: { name: "High" } },
    membershipEvidence: [1, 2, 3].map((id) => ({
      characterId: String(id),
      name: `Member ${id}`,
      joinedAt: week - 1,
      observedAt: week + 1
    }))
  };
  return history.completedSnapshots(
    context,
    {
      type: "guild_trial_stats_updated",
      guildId: 7,
      guildTrialStatList: [
        { trialHrid: life, characterId: 1, workDone: 0 },
        { trialHrid: life, characterId: 2, workDone: 10000 },
        { trialHrid: battle, characterId: 2, damageDealt: 100, healingDone: 20, premitigatedDamageTaken: 50 }
      ]
    },
    week + 1000
  );
}
function fixture() {
  const map = new Map();
  const storage = {
    get length() {
      return map.size;
    },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => map.set(k, v),
    removeItem: (k) => map.delete(k)
  };
  return storageApi.createPluginStorage({
    storage,
    config,
    trialHistoryApi: history,
    location: { hostname: "www.milkywayidlecn.com", href: "https://www.milkywayidlecn.com/game?characterId=123" }
  });
}

test("旧/新导出文件恢复游戏采集后，排名、缺席、项目统计和报名提醒保持原结果", () => {
  const captured = captures().sort(history.compareSnapshots);
  const expected = history.playerRankings(captured);
  assert.ok(
    expected.some((player) => player.id === "3"),
    "入会证据支持确认未参加的成员"
  );
  const context = {
    guild: { id: 7, currentWeekStartAt: week + 604800000 },
    signups: { 1: { signedUpSkillingTrialHrid: life, signupWeekStartAt: week + 604800000 } }
  };
  assert.equal(history.signupWorkWarnings(captured, context, life).has("1"), true);
  for (const envelopeVersion of [1, 2]) {
    const parsed = history.parseImport(JSON.stringify({ schemaVersion: envelopeVersion, records: captured }));
    const plugin = fixture();
    assert.equal(plugin.importTrialHistory(parsed).added, 2);
    const restored = plugin.loadTrialHistory().records;
    assert.ok(restored.every(history.isGameCapture));
    assert.ok(restored.every((r) => r.source !== "manual" && r.schemaVersion === 1));
    assert.deepEqual(restored, [...captured].sort(history.compareSnapshots));
    assert.deepEqual(history.playerRankings(restored), expected);
    assert.deepEqual(
      history.signupWorkWarnings(restored, context, life),
      history.signupWorkWarnings(captured, context, life)
    );
    for (const identity of [
      { id: "1", name: "Low" },
      { id: "2", name: "High" },
      { id: "3", name: "Absent" }
    ])
      assert.deepEqual(
        history.playerProjectOverview(restored, identity),
        history.playerProjectOverview(captured, identity)
      );
    const second = history.parseImport(JSON.stringify({ schemaVersion: 2, records: restored }));
    assert.deepEqual(history.playerRankings(second), expected);
  }
});

test("真正的手动整理仍不进入游戏采集专用判断；来源缺失不会被猜成游戏采集", () => {
  const manual = {
    schemaVersion: 2,
    source: "manual",
    recordId: "manual",
    key: '["manual","manual"]',
    guildId: null,
    guildName: null,
    trialDate: null,
    weekStartAt: null,
    capturedAt: null,
    trialHrid: life,
    kind: "skilling",
    points: null,
    party: { done: true, highestTier: null },
    rows: [{ trialHrid: life, characterId: null, memberKey: "1", workDone: 10000 }],
    members: { 1: { name: "Manual" } }
  };
  const plugin = fixture();
  assert.equal(plugin.importTrialHistory([manual]).added, 1);
  const restored = plugin.loadTrialHistory().records;
  assert.equal(history.isGameCapture(restored[0]), false);
  assert.deepEqual(history.playerRankings(restored), []);
  assert.equal(
    history.signupWorkWarnings(restored, { guild: { id: 7, currentWeekStartAt: week + 604800000 } }, life).size,
    0
  );
  assert.equal(history.isGameCapture({}), false);
  assert.throws(
    () =>
      history.parseImport(
        JSON.stringify({ schemaVersion: 2, records: [{ ...manual, schemaVersion: undefined, source: undefined }] })
      ),
    /trialImportInvalidRecord/
  );
});
