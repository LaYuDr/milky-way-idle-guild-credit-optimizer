"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const api = require("../src/trial-history.js");

function record(key, kind, rows, extra = {}) {
  return { key, kind, schemaVersion: 1, rows, members: { 1: { name: "Alpha" }, 2: { name: "Beta" } }, ...extra };
}

test("排行榜逐项目计次，倍数先在项目内归一化再等权平均", () => {
  const records = [
    record("life1", "skilling", [
      { characterId: 1, workDone: 30 },
      { characterId: 2, workDone: 10 }
    ]),
    record("life2", "skilling", [
      { characterId: 1, workDone: 100 },
      { characterId: 2, workDone: 300 }
    ]),
    record("combat", "combat", [
      { characterId: 1, damageDealt: 30, healingDone: 0, premitigatedDamageTaken: 10 },
      { characterId: 2, damageDealt: 10, healingDone: 20, premitigatedDamageTaken: 30 }
    ])
  ];
  const before = JSON.stringify(records);
  const [alpha, beta] = api.playerRankings(records);
  assert.equal(alpha.participations, 3);
  assert.equal(alpha.skilling.count, 2);
  assert.equal(alpha.skilling.average, 1);
  assert.equal(alpha.combat.average, 2 / 3);
  assert.equal(beta.combat.average, 4 / 3);
  assert.ok(Math.abs(alpha.all.average - 8 / 9) < 1e-12);
  assert.equal(alpha.all.count, 3);
  assert.equal(JSON.stringify(records), before);
});

test("零分母和未知字段不补零，有效零贡献参与平均；重复记录键不重复计次", () => {
  const zero = record("zero", "combat", [{ characterId: 1 }, { characterId: 2 }]);
  const rows = api.playerRankings([
    zero,
    zero,
    record("missing", "skilling", [
      { characterId: 1, workDone: null },
      { characterId: 2, workDone: 10 }
    ]),
    record("valid", "combat", [
      { characterId: 1, damageDealt: 0 },
      { characterId: 2, damageDealt: 10 }
    ]),
    record(
      "manual",
      "combat",
      [
        { characterId: 1, damageDealt: 10 },
        { characterId: 2, damageDealt: 10 }
      ],
      { schemaVersion: 2 }
    )
  ]);
  assert.equal(rows[0].participations, 4);
  assert.equal(rows[0].skilling.average, null);
  assert.equal(rows[0].skilling.count, 0);
  assert.equal(rows[0].combat.count, 2);
  assert.equal(rows[0].combat.average, 0.5);
  assert.equal(rows[1].skilling.average, 1);
  assert.deepEqual(api.playerRankings([]), []);
});

test("角色改名仍按 ID 汇总，同名不同 ID 与无 ID 的记录不合并", () => {
  const rows = api.playerRankings([
    record(
      "new",
      "skilling",
      [
        { characterId: 1, workDone: 1 },
        { characterId: 2, workDone: 1 }
      ],
      { members: { 1: { name: "Same" }, 2: { name: "Same" } } }
    ),
    record("old", "skilling", [{ characterId: 1, workDone: 1 }]),
    record("manual", "skilling", [{ memberKey: "a", workDone: 1 }], {
      schemaVersion: 2,
      members: { a: { name: "Same" } }
    }),
    record("unnamed", "skilling", [{ characterId: 3, workDone: 1 }], { members: {} })
  ]);
  assert.equal(rows.length, 4);
  assert.equal(rows.find((row) => row.id === "1").participations, 2);
  assert.equal(rows.find((row) => row.id === "2").participations, 1);
  assert.equal(rows.find((row) => row.id === null).participations, 1);
  assert.equal(rows.find((row) => row.id === "3").participations, 1);
});
