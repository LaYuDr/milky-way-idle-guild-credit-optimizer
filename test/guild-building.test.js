"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const data = require("../src/guild-building-data.js");
const core = require("../src/core.js");

const projectFile = (relativePath) => fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8");

test("公会建筑规则覆盖 28 座建筑与神龛的 1 至 20 级", () => {
  const definitions = data.definitions();
  assert.equal(definitions.length, 28);
  assert.equal(definitions.filter((entry) => entry.costMultiplier === 1).length, 9);
  assert.equal(definitions.filter((entry) => entry.costMultiplier === 0.5).length, 19);
  assert.ok(definitions.every((entry) => entry.levelCosts.length === 21));
  assert.equal(definitions.find((entry) => entry.hrid === "/guild_buildings/guild_hall").levelCosts[20].guildPointCost, 299450);
  assert.equal(definitions.find((entry) => entry.hrid === "/guild_buildings/gym").levelCosts[20].guildPointCost, 149725);
});

test("公会建筑从当前等级到目标等级逐级累计公会点数", () => {
  const hall = data.definitions().find((entry) => entry.hrid === "/guild_buildings/guild_hall");
  const result = core.aggregateGuildBuildingLevelCosts(hall.levelCosts, 0, 2);
  assert.equal(result.status, "ok");
  assert.equal(result.totalCost, 2350);
  assert.deepEqual(result.steps, [
    { fromLevel: 0, toLevel: 1, cost: 1000 },
    { fromLevel: 1, toLevel: 2, cost: 1350 }
  ]);
});

test("半价建筑使用精确的逐级费用", () => {
  const gym = data.definitions().find((entry) => entry.hrid === "/guild_buildings/gym");
  const result = core.aggregateGuildBuildingLevelCosts(gym.levelCosts, 0, 2);
  assert.equal(result.status, "ok");
  assert.equal(result.totalCost, 1175);
});

test("施工队列标记预算截止步骤并保留超预算项目", () => {
  const definitions = data.definitions();
  const hall = definitions.find((entry) => entry.hrid === "/guild_buildings/guild_hall");
  const gym = definitions.find((entry) => entry.hrid === "/guild_buildings/gym");
  const result = core.buildGuildConstructionPlan([
    { id: "hall", buildingHrid: hall.hrid, startLevel: 0, targetLevel: 2, levelCosts: hall.levelCosts },
    { id: "gym", buildingHrid: gym.hrid, startLevel: 0, targetLevel: 2, levelCosts: gym.levelCosts }
  ], 2500);
  assert.equal(result.status, "ok");
  assert.equal(result.totalCost, 3525);
  assert.equal(result.affordableStepCount, 2);
  assert.equal(result.firstOverBudgetIndex, 2);
  assert.equal(result.steps[1].fitsBudget, true);
  assert.equal(result.steps[2].fitsBudget, false);
  assert.equal(result.remainingGuildPoints, -1025);
});

test("缺少单级费用时不伪造建筑规划总计", () => {
  const result = core.aggregateGuildBuildingLevelCosts([null, { guildPointCost: 1000 }, null], 0, 2);
  assert.equal(result.status, "missing_cost");
  assert.equal(result.missingLevel, 2);
  assert.equal(result.totalCost, 0);
  assert.deepEqual(result.steps, []);
});

test("公会建设模块进入构建、桥接、界面与响应式测试链路", () => {
  const build = projectFile("tools/build.js");
  const bridge = projectFile("src/bridge.js");
  const userscript = projectFile("src/userscript.js");
  const harness = projectFile("tools/test-harness.html");
  assert.match(build, /src\/guild-building-data\.js/);
  assert.match(bridge, /guildBuildingLevels/);
  assert.match(bridge, /guildBuildingDetails/);
  assert.match(userscript, /data-role="view-construction"/);
  assert.match(userscript, /buildGuildConstructionPlan/);
  assert.match(userscript, /mwi-guild-building-planner-v1/);
  assert.match(userscript, /exportGuildConstructionCsv/);
  assert.match(userscript, /mwi-building-row/);
  assert.match(userscript, /mwi-building-list-head/);
  assert.match(userscript, /data-role="construction-plan-scale"/);
  assert.match(userscript, /function applyGuildBuildingFilters/);
  assert.doesNotMatch(userscript, /mwi-building-card-heading/);
  assert.match(harness, /constructionAudit/);
  assert.match(harness, /constructionAuditReady/);
});

test("公会建设关键文案同时覆盖中文与英文", () => {
  const localization = projectFile("src/localization.js");
  for (const key of ["guildConstruction", "guildPointBudget", "manualBudget", "buildingCatalog", "constructionQueue", "constructionQueueHint", "copyBuildingPlan", "exportBuildingCsv"]) {
    assert.equal((localization.match(new RegExp(`${key}:`, "g")) || []).length, 2, `${key} should exist in both locales`);
  }
});
