"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const display = require("../src/trial-display.js");

test("旧版成组设置迁移为独立列，新字段优先且拒绝非布尔值", () => {
  const result = display.normalize({
    combatShare: true,
    combatMultiple: false,
    levelSummary: false,
    workSummary: false,
    healingDoneShare: false,
    level_average: true,
    member: "false"
  });
  assert.equal(result.damageDealtShare, true);
  assert.equal(result.healingDoneShare, false);
  assert.equal(result.premitigatedDamageTakenShare, true);
  assert.equal(result.level_total, false);
  assert.equal(result.level_average, true);
  assert.equal(result.workDone_median, false);
  assert.equal(result.member, true);
  assert.equal(Object.hasOwn(result, "combatShare"), false);
  assert.deepEqual(display.normalize(result), result);
  assert.deepEqual(display.normalize({ undefined: false, extra: true }), display.defaults);
});

test("每个成员列可独立开关，包括成员名和战斗原始值，允许全部隐藏", () => {
  for (const kind of ["combat", "skilling"]) {
    const all = display.fields(kind, display.preset("all"));
    for (const field of all) {
      assert.deepEqual(
        display.fields(kind, { ...display.preset("all"), [field]: false }),
        all.filter((key) => key !== field)
      );
    }
    assert.deepEqual(display.fields(kind, Object.fromEntries(all.map((field) => [field, false]))), []);
  }
});

test("预设返回独立副本且默认显示兼容旧版", () => {
  assert.deepEqual(display.fields("combat", display.preset("default")), [
    "member",
    "level",
    "damageDealt",
    "healingDone",
    "premitigatedDamageTaken"
  ]);
  assert.equal(display.preset("compact").level_total, false);
  assert.equal(display.preset("all").healingDoneMultiple, true);
  const copy = display.preset("default");
  copy.member = false;
  assert.equal(display.defaults.member, true);
  assert.equal(display.preset("unknown"), null);
});
