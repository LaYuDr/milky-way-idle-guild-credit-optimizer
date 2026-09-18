"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const api = require("../src/trial-analytics.js");
function record(key, week, people, options = {}) {
  return {
    key,
    weekStartAt: week,
    guildId: null,
    guildName: null,
    source: "manual",
    schemaVersion: 2,
    kind: "skilling",
    trialHrid: "milk",
    ...options,
    rows: people.map(([_name, value, id], i) => ({ memberKey: String(i), characterId: id ?? null, workDone: value })),
    members: Object.fromEntries(people.map(([name, , id], i) => [id ?? String(i), { name }]))
  };
}
test("分析保留零与缺失，排名并列、占比和中位数准确", () => {
  const r = record("a", 1, [
    ["A", 10],
    ["B", 10],
    ["C", 0],
    ["D", null]
  ]);
  const stats = api.summary(api.entries(r), "workDone");
  assert.deepEqual(stats, { count: 4, known: 3, total: 20, mean: 20 / 3, median: 10, top5Share: 1 });
  const ranked = api.ranking(api.entries(r), "workDone");
  assert.deepEqual(
    ranked.map((r) => [r.rank, r.share]),
    [
      [1, 0.5],
      [1, 0.5],
      [3, 0],
      [null, null]
    ]
  );
  assert.equal(api.summary(api.entries(record("z", 1, [["A", 0]])), "workDone").top5Share, null);
  assert.equal(api.summary([], "workDone").total, null);
  assert.equal(api.metricValue({ schemaVersion: 1 }, {}, "damageDealt"), 0);
  assert.equal(api.metricValue({ schemaVersion: 1 }, { damageDealt: null }, "damageDealt"), null);
});
test("身份按ID延续改名，纯姓名精确匹配，重名和前成员不跨记录关联", () => {
  const a = record("a", 1, [
    ["A", 1, 7],
    ["Same", 2],
    ["Same", 3],
    ["前成员", 4]
  ]);
  const b = record("b", 2, [
    ["Renamed", 1, 7],
    ["same", 2],
    ["前成员", 4]
  ]);
  const ae = api.entries(a),
    be = api.entries(b);
  assert.equal(ae[0].identity, be[0].identity);
  assert.notEqual(ae[1].identity, ae[2].identity);
  assert.notEqual(ae[3].identity, be[2].identity);
  assert.equal(ae[1].match, "isolated");
  assert.notEqual(api.entries(record("c", 1, [["Same", 2]]))[0].identity, be[1].identity);
  assert.notEqual(api.scopeKey({ ...a, guildId: "7" }), api.scopeKey({ ...a, guildId: "8" }));
});
test("跨周范围隔离公会和项目，跳过未选中的重复周，按共同成员计算", () => {
  const a = record("a", 1, [
      ["A", 10],
      ["B", 20]
    ]),
    b = record("b", 2, [
      ["A", 30],
      ["C", 50]
    ]);
  const other = record("other", 3, [["A", 999]], { guildId: "other" });
  let result = api.comparison([a, b, other], b, "workDone", "shared", 1);
  assert.equal(result.sharedCount, 1);
  assert.deepEqual(
    result.points.map((p) => p.stats.total),
    [10, 30]
  );
  assert.deepEqual(api.change(10, 30), { absolute: 20, percent: 2 });
  assert.deepEqual(api.change(0, 30), { absolute: 30, percent: null });
  result = api.comparison([a, { ...a, key: "duplicate" }, b], b, "workDone", "all", 1);
  assert.equal(result.ambiguousWeeks, 1);
  assert.equal(result.points.length, 1);
  assert.equal(api.comparison([a, b], { ...b, weekStartAt: null }, "workDone", "all", 1).points.length, 0);
});
test("记录分布区分无记录、未知数值、明确零和正贡献", () => {
  const r = record("a", 1, [
    ["A", 0],
    ["B", null],
    ["C", 3]
  ]);
  const e = api.entries(r);
  assert.equal(api.coverage(r, e[0].identity).state, "zero");
  assert.equal(api.coverage(r, e[1].identity).state, "unknown");
  assert.equal(api.coverage(r, e[2].identity).state, "positive");
  assert.equal(api.coverage(r, "absent").state, "absent");
});
test("成员历史保留不同项目及名次，缺席不补零", () => {
  const a = record("a", 1, [
      ["A", 5],
      ["B", 10]
    ]),
    b = record("b", 2, [["B", 10]]);
  const c = record("c", 3, [["A", 20]], { trialHrid: "enhance" });
  const identity = api.entries(a)[0].identity;
  const history = api.memberHistory([a, b, c], identity, "workDone");
  assert.deepEqual(
    history.map((h) => [h.record.key, h.entry.rank]),
    [
      ["a", 2],
      ["c", 1]
    ]
  );
  assert.equal(api.members([a, b, c]).length, 2);
});

module.exports = { record };
