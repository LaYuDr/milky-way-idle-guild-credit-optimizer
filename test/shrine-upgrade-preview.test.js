"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../src/core.js");
const detail = {
  buffs: [{ typeHrid: "/buff_types/efficiency", flatBoost: 0.02, flatBoostLevelBonus: 0.005 }],
  levelCosts: [
    null,
    { guildTokenCost: 10, creditCosts: [{ itemHrid: "green", count: 100 }] },
    { guildTokenCost: 20, creditCosts: [{ itemHrid: "brown", count: 200 }] },
    { guildTokenCost: 30, creditCosts: [{ itemHrid: "green", count: 300 }] }
  ]
};
test("神龛等级效果遵循官方首级公式，0级不套用首级增益", () => {
  const [effect] = core.guildBuffLevelEffects(detail);
  assert.equal(core.guildBuffEffectAtLevel(effect, 0), 0);
  assert.equal(core.guildBuffEffectAtLevel(effect, 1), 0.02);
  assert.equal(core.guildBuffEffectAtLevel(effect, 3), 0.03);
  for (const bad of [null, undefined, -1, 1.5, NaN]) assert.equal(core.guildBuffEffectAtLevel(effect, bad), null);
  assert.equal(core.guildBuffEffectAtLevel({ first: Number.MAX_VALUE, increment: Number.MAX_VALUE }, 3), null);
});
test("升级摘要和逐级花费一致，起始等级费用不重复计入", () => {
  const before = JSON.stringify(detail);
  const preview = core.guildBuffUpgradePreview(detail, 1, 3);
  assert.equal(preview.status, "ok");
  assert.deepEqual(
    preview.steps.map((step) => step.level),
    [2, 3]
  );
  assert.equal(preview.effects[0].start, 0.02);
  assert.equal(preview.effects[0].target, 0.03);
  assert.ok(Math.abs(preview.effects[0].gain - 0.01) < 1e-12);
  const totals = new Map();
  for (const step of preview.steps)
    for (const item of step.totals) totals.set(item.itemHrid, (totals.get(item.itemHrid) || 0) + item.count);
  assert.deepEqual(
    Object.fromEntries(totals),
    Object.fromEntries(preview.totals.map((item) => [item.itemHrid, item.count]))
  );
  assert.equal(JSON.stringify(detail), before);
});
test("缺少效果不伪造数值，缺少任意级费用不能展示部分合计", () => {
  assert.deepEqual(core.guildBuffUpgradePreview({ levelCosts: detail.levelCosts }, 0, 2).effects, []);
  const preview = core.guildBuffUpgradePreview(
    { ...detail, levelCosts: { 1: detail.levelCosts[1], 3: detail.levelCosts[3] } },
    0,
    3
  );
  assert.equal(preview.status, "missing_cost");
  assert.deepEqual(preview.totals, []);
  assert.deepEqual(preview.steps, []);
  assert.equal(core.guildBuffUpgradePreview(detail, 3, 3).status, "invalid_range");
});
