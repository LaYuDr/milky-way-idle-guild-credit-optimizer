"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const api = require("../src/trial-history.js");
const identity = { id: "1", name: "Alpha" };
const record = (key, skill, values, extra = {}) => ({
  key,
  kind: "skilling",
  schemaVersion: 1,
  trialHrid: `/guild_skilling/${skill}`,
  rows: values.map((value, index) => ({ characterId: index + 1, workDone: value })),
  members: { 1: { name: "Alpha" }, 2: { name: "Beta" } },
  ...extra
});
const project = (records, name, member = identity) =>
  api.playerProjectOverview(records, member).find((p) => p.trialHrid.endsWith(`/${name}`));
test("总览包含所有生活和战斗项目，未采集或未参与显示零次及未知倍数", () => {
  const rows = api.playerProjectOverview([], identity);
  assert.equal(rows.filter((p) => p.kind === "skilling").length, 10);
  assert.equal(rows.filter((p) => p.kind === "combat").length, 5);
  assert.ok(rows.every((p) => p.participations === 0 && p.average === null && p.total === null && p.samples === 0));
  assert.equal(project([record("a", "milking", [1, 2])], "milking", { id: "99", name: "Nobody" }).participations, 0);
});
test("各项目等权平均与排行榜一致，去重并排除手动记录，保留有效零贡献", () => {
  const first = record("a", "milking", [30, 10]);
  const records = [
    first,
    first,
    record("b", "milking", [100, 300]),
    record("c", "foraging", [0, 20]),
    record("d", "milking", [null, 1]),
    record("e", "milking", [0, 0]),
    record("manual", "milking", [900, 1], { schemaVersion: 2 }),
    record("manual1", "milking", [900, 1], { source: "manual" })
  ];
  const before = JSON.stringify(records);
  const milk = project(records, "milking");
  assert.equal(milk.participations, 4);
  assert.equal(milk.average, 1);
  assert.equal(milk.samples, 2);
  assert.equal(milk.total, 2);
  assert.equal(project(records, "foraging").average, 0);
  assert.equal(project(records, "foraging").total, 0);
  assert.equal(JSON.stringify(records), before);
});
test("战斗项目相加伤害、治疗和承伤的有效倍数，不混入其他项目", () => {
  const combat = record("combat", "hedgehog", [], {
    kind: "combat",
    trialHrid: "/guild_combat/hedgehog",
    rows: [
      { characterId: 1, damageDealt: 30, healingDone: 0, premitigatedDamageTaken: 10 },
      { characterId: 2, damageDealt: 10, healingDone: 20, premitigatedDamageTaken: 30 }
    ]
  });
  const row = project([combat, record("life", "milking", [9, 1])], "hedgehog");
  assert.equal(row.participations, 1);
  assert.equal(row.average, 2);
  assert.equal(row.total, 2);
});

test("项目合计按有效样本加权平均，次数含未知贡献但未知贡献不进入倍数分母", () => {
  const projects = [
    { participations: 2, samples: 2, average: 3 },
    { participations: 1, samples: 1, average: 8 },
    { participations: 4, samples: 0, average: null }
  ];
  const before = JSON.stringify(projects);
  assert.deepEqual(api.summarizePlayerProjects(projects), {
    participations: 7,
    samples: 3,
    average: 14 / 3,
    total: 14
  });
  assert.equal(JSON.stringify(projects), before);
});

test("项目合计区分没有有效样本与有效零值，累加溢出不显示 Infinity", () => {
  assert.deepEqual(api.summarizePlayerProjects([]), { participations: 0, samples: 0, average: null, total: null });
  assert.deepEqual(api.summarizePlayerProjects([{ participations: 1, samples: 1, average: 0 }]), {
    participations: 1,
    samples: 1,
    average: 0,
    total: 0
  });
  const overflow = api.summarizePlayerProjects([{ participations: 2, samples: 2, average: Number.MAX_VALUE }]);
  assert.equal(overflow.total, null);
  assert.equal(overflow.average, Number.MAX_VALUE);
});
test("身份按 ID 隔离，改名不丢次数，未知新项目保留，原生详情排序生效", () => {
  const records = [
    record("a", "milking", [2, 2], { members: { 1: { name: "Old" }, 2: { name: "Alpha" } } }),
    record("b", "new_skill", [2, 2])
  ];
  assert.equal(project(records, "milking").participations, 1);
  assert.equal(project(records, "milking", { id: null, name: "Alpha" }).participations, 0);
  assert.equal(project(records, "new_skill").average, 1);
  const rows = api.playerProjectOverview(records, identity, { "/guild_combat/swarm": { sortIndex: -1 } });
  assert.equal(rows.find((p) => p.kind === "combat").trialHrid, "/guild_combat/swarm");
});
