"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const api = require("../src/trial-history.js");
const storageApi = require("../src/runtime/storage.js");
const config = require("../src/runtime/config.js");
const start = Date.parse("2026-08-31T00:00:00Z");
const week = 7 * 24 * 3600 * 1000;
const hrid = "/guild_skilling/milking";
const combatHrid = "/guild_combat/badger";
const evidence = (id = "1", joinedAt = start - week, observedAt = start + 3 * week) => ({
  characterId: id,
  name: `P${id}`,
  joinedAt,
  observedAt
});
function record(index, multiple, extra = {}) {
  return {
    schemaVersion: 1,
    guildId: "7",
    guildName: "Guild",
    weekStartAt: start + index * week,
    key: JSON.stringify(["7", start + index * week, hrid]),
    trialHrid: hrid,
    kind: "skilling",
    capturedAt: start + (index + 1) * week,
    points: 1,
    party: { done: true },
    weekTrials: { skilling: [hrid], combat: [] },
    membershipEvidence: [evidence()],
    members: { 1: { name: "P1" }, 2: { name: "P2" }, 3: { name: "P3" } },
    rows: (multiple === null
      ? [
          { characterId: 2, workDone: 10 },
          { characterId: 3, workDone: 10 }
        ]
      : [
          { characterId: 1, workDone: multiple * 10 },
          { characterId: 2, workDone: (3 - multiple) * 5 },
          { characterId: 3, workDone: (3 - multiple) * 5 }
        ]
    ).map((row) => ({ ...row, trialHrid: hrid })),
    ...extra
  };
}
const player = (records) => api.playerRankings(records).find((p) => p.id === "1");
test("用户示例：三周 1.5、2.2、0.8 为 1.5；在会缺席一周后为 1", () => {
  const a = player([record(0, 1.5), record(1, 2.2), record(2, 0.8)]);
  const b = player([record(0, null), record(1, 2.2), record(2, 0.8)]);
  assert.ok(Math.abs(a.skilling.average - 1.5) < 1e-12);
  assert.ok(Math.abs(b.skilling.average - 1) < 1e-12);
  assert.equal(b.skilling.count, 3);
  assert.equal(b.skilling.absentWeeks, 1);
  assert.equal(b.participations, 2);
  assert.equal(b.all.total, b.skilling.average);
});
test("只计入会前已具资格的周；从未参试的已知在会成员仍为零", () => {
  const membershipEvidence = [evidence("1", start)];
  const result = player([
    record(0, null, { membershipEvidence }),
    record(1, null, { membershipEvidence }),
    record(2, null, { membershipEvidence })
  ]);
  assert.equal(result.skilling.count, 2);
  assert.equal(result.skilling.average, 0);
  assert.equal(result.participations, 0);
});
test("不依据现在的名单猜测旧周：未知在会状态和未完整采集的类别不扣零", () => {
  const result = player([
    record(0, null, { membershipEvidence: [] }),
    record(1, 2.2, { membershipEvidence: [] }),
    record(2, 0.8, { membershipEvidence: [] })
  ]);
  assert.equal(result.skilling.count, 2);
  assert.ok(Math.abs(result.skilling.average - 1.5) < 1e-12);
  assert.equal(result.skilling.unknownWeeks, 1);
  const partial = player([
    record(0, null, { weekTrials: { skilling: [hrid, "/guild_skilling/foraging"], combat: [] } }),
    record(1, 1)
  ]);
  assert.equal(partial.skilling.count, 1);
  assert.equal(partial.skilling.unknownWeeks, 1);
});
test("一周多个项目只增加一次分母；另一类的参试可证明当周在会", () => {
  const first = record(0, 1.5, { membershipEvidence: [] });
  const another = record(0, 0.5, { key: "other", trialHrid: "/guild_skilling/foraging", membershipEvidence: [] });
  const combat = record(0, null, {
    key: "combat",
    kind: "combat",
    trialHrid: combatHrid,
    rows: [{ characterId: 2, damageDealt: 10 }],
    membershipEvidence: [],
    weekTrials: { skilling: [hrid, "/guild_skilling/foraging"], combat: [combatHrid] }
  });
  const result = player([first, first, another, combat]);
  assert.equal(result.skilling.count, 1);
  assert.equal(result.skilling.average, 1);
  assert.equal(result.combat.count, 1);
  assert.equal(result.combat.average, 0);
  assert.equal(result.all.total, 1);
});
test("手动导入不参与名单、资格、类别完整性或缺席判断；证据按公会隔离", () => {
  const current = record(1, 1, { membershipEvidence: [] });
  const manual = record(0, null, { schemaVersion: 2, source: "manual" });
  const spoof = record(0, null, { source: "manual" });
  assert.deepEqual(api.playerRankings([manual, spoof, current]), api.playerRankings([current]));
  const foreign = record(0, null, { guildId: "8", key: "foreign", membershipEvidence: [evidence()] });
  const result = player([record(0, null, { membershipEvidence: [] }), current, foreign]);
  assert.equal(result.skilling.unknownWeeks, 1);
  assert.equal(result.skilling.count, 2); // foreign guild has its own confirmed membership
});
test("离会再加入之间的未知空档不推断为在会；改名和重复证据不改变分母", () => {
  const intervals = [
    evidence("1", start - week, start + 1),
    { ...evidence("1", start + week + 1, start + 3 * week), name: "Renamed" }
  ];
  const result = player([
    record(0, 1, { membershipEvidence: intervals }),
    record(1, null, { membershipEvidence: intervals }),
    record(2, 1, { membershipEvidence: intervals })
  ]);
  assert.equal(result.skilling.count, 2);
  assert.equal(result.skilling.unknownWeeks, 1);
  assert.equal(api.mergeMembershipEvidence(intervals, intervals).length, 2);
});
test("原生 joinTime 被动保存，历史快照补充不覆盖未知入会时间或跨公会", () => {
  const context = api.updateContext(
    { guild: { id: 7 }, members: { 1: { name: "P1" } } },
    {
      type: "guild_characters_updated",
      guildCharacterMap: { 1: { joinTime: new Date(start - week).toISOString() }, 2: {}, 3: { joinTime: "invalid" } }
    },
    start + week
  );
  assert.deepEqual(context.membershipEvidence, [evidence("1", start - week, start + week)]);
  const raw = record(0, 1, { membershipEvidence: undefined });
  const enriched = api.withMembershipEvidence(raw, context);
  assert.equal(enriched.membershipEvidence.length, 1);
  assert.equal(api.withMembershipEvidence(enriched, context), enriched);
  assert.equal(api.withMembershipEvidence({ ...raw, guildId: "8" }, context).membershipEvidence, undefined);
  assert.deepEqual(api.updateContext(context, { guild: { id: 8 } }).membershipEvidence, []);
});
test("名册证据导入校验、旧格式兼容，重复采集不能抹掉历史在会证据", () => {
  const original = record(0, 1);
  const text = (records) => JSON.stringify({ schemaVersion: 2, records });
  assert.equal(api.parseImport(text([original]))[0].membershipEvidence.length, 1);
  for (const membershipEvidence of [[{ ...evidence(), joinedAt: -1 }], [{ ...evidence(), observedAt: 0 }], {}])
    assert.throws(() => api.parseImport(text([{ ...original, membershipEvidence }])));
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
    key: (i) => [...values.keys()][i],
    get length() {
      return values.size;
    }
  };
  const plugin = storageApi.createPluginStorage({
    storage,
    location: { hostname: "www.milkywayidle.com", href: "https://www.milkywayidle.com/game?characterId=1" },
    config,
    trialHistoryApi: api
  });
  assert.equal(plugin.saveTrialSnapshot(original), true);
  assert.equal(plugin.saveTrialSnapshot({ ...original, membershipEvidence: undefined, weekTrials: undefined }), true);
  const saved = JSON.parse([...values.values()][0]);
  assert.deepEqual(saved.membershipEvidence, original.membershipEvidence);
  assert.deepEqual(saved.weekTrials, original.weekTrials);
});

test("LAYU 仅参加生活：生活样本 1、战斗样本 0、合计样本 1，缺席仍参与平均", () => {
  const combat = record(0, null, {
    key: "combat",
    kind: "combat",
    trialHrid: combatHrid,
    rows: [{ characterId: 2, damageDealt: 10 }],
    weekTrials: { skilling: [hrid], combat: [combatHrid] }
  });
  const records = [record(0, 2.54), combat];
  const before = JSON.stringify(records);
  const result = player(records);
  assert.deepEqual([result.skilling.sampleCount, result.combat.sampleCount, result.all.sampleCount], [1, 0, 1]);
  assert.ok(Math.abs(result.skilling.average - 2.54) < 1e-12);
  assert.equal(result.combat.average, 0);
  assert.equal(result.combat.count, 1);
  assert.equal(result.all.total, result.skilling.average);
  assert.equal(JSON.stringify(records), before);
});

test("样本按每周每类去重，跨周累计；实际零贡献参试也计样本", () => {
  const first = record(0, 0);
  const extra = record(0, 1, { key: "other-project", trialHrid: "/guild_skilling/foraging" });
  const combat = record(0, null, {
    key: "combat",
    kind: "combat",
    trialHrid: combatHrid,
    rows: [
      { characterId: 1, damageDealt: 0 },
      { characterId: 2, damageDealt: 10 }
    ],
    weekTrials: { skilling: [hrid], combat: [combatHrid] }
  });
  const result = player([first, first, extra, combat, record(1, 0), record(2, null)]);
  assert.deepEqual([result.skilling.sampleCount, result.combat.sampleCount, result.all.sampleCount], [2, 1, 3]);
  assert.equal(result.skilling.count, 3);
  assert.equal(result.participations, 4);
  assert.equal(result.combat.average, 0);
});

test("参试但数值未知仍计样本；只有名册或手动记录不能提供参试样本", () => {
  const unknown = record(0, null, { rows: [{ characterId: 1, workDone: null }] });
  const result = player([unknown, record(1, null), record(2, 1, { source: "manual" })]);
  assert.equal(result.skilling.sampleCount, 1);
  assert.equal(result.skilling.unknownWeeks, 1);
  assert.equal(result.skilling.absentWeeks, 1);
  const absent = player([record(0, null)]);
  assert.equal(absent.skilling.sampleCount, 0);
  assert.equal(absent.all.sampleCount, 0);
});

test("战斗单项榜独立按周取平均，保留综合战斗榜和合计榜", () => {
  const combat = (week, suffix, first, second) =>
    record(week, 1, {
      key: `combat-${week}-${suffix}`,
      kind: "combat",
      trialHrid: "/guild_trials/test",
      weekTrials: { skilling: [], combat: ["/guild_trials/test"] },
      rows: [
        { characterId: 1, ...first },
        { characterId: 2, ...second }
      ]
    });
  const records = [
    combat(
      0,
      "a",
      { damageDealt: 30, healingDone: 0, premitigatedDamageTaken: 10 },
      { damageDealt: 10, healingDone: 20, premitigatedDamageTaken: 10 }
    ),
    combat(
      0,
      "b",
      { damageDealt: 10, healingDone: null, premitigatedDamageTaken: 0 },
      { damageDealt: 10, healingDone: 20, premitigatedDamageTaken: 0 }
    ),
    combat(
      1,
      "a",
      { damageDealt: 0, healingDone: 20, premitigatedDamageTaken: null },
      { damageDealt: 20, healingDone: 0, premitigatedDamageTaken: 10 }
    )
  ];
  const before = JSON.stringify(records);
  const result = player(records);
  assert.equal(result.damageDealt.average, 0.625); // (mean(1.5, 1) + 0) / 2
  assert.equal(result.healingDone.average, 1); // (0 + 2) / 2; missing is not zero
  assert.equal(result.premitigatedDamageTaken.average, 1);
  assert.equal(result.premitigatedDamageTaken.unknownWeeks, 1);
  assert.equal(result.damageDealt.sampleCount, 2);
  assert.equal(result.combat.average, 1.875); // (mean(2.5, 1) + 2) / 2
  assert.equal(result.all.total, result.combat.average);
  assert.equal(JSON.stringify(records), before);
});

test("战斗单项榜保留确认缺席零值，手工记录不参与", () => {
  const source = record(0, 1, {
    kind: "combat",
    trialHrid: combatHrid,
    weekTrials: { skilling: [], combat: [combatHrid] },
    rows: [{ characterId: 2, damageDealt: 10, healingDone: 20, premitigatedDamageTaken: 30 }]
  });
  const result = player([source, { ...source, key: "manual", source: "manual" }]);
  for (const field of ["damageDealt", "healingDone", "premitigatedDamageTaken"]) {
    assert.equal(result[field].average, 0);
    assert.equal(result[field].sampleCount, 0);
    assert.equal(result[field].absentWeeks, 1);
  }
});
