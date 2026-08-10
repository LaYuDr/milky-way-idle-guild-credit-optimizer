"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const data = require("../src/guild-building-data.js");
const core = require("../src/core.js");
const constructionViewApi = require("../src/ui/construction-view.js");

const projectFile = (relativePath) => fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8");
const projectRuntimeSource = () => {
  const sourceRoot = path.join(__dirname, "..", "src");
  const files = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile() && entry.name.endsWith(".js")) files.push(file);
    }
  };
  visit(sourceRoot);
  return files
    .sort()
    .map((file) => fs.readFileSync(file, "utf8"))
    .join("\n");
};

function createConstructionHarness({ guildBuildingLevels = null, guildBuildingLevelsComplete = false } = {}) {
  const state = {
    guildBuildingLevels,
    guildBuildingLevelsComplete,
    buildingPlans: [],
    nextBuildingPlanId: 1,
    buildingPlanNotice: ""
  };
  let persistCount = 0;
  const view = constructionViewApi.createConstructionView({
    state,
    buildingDataApi: data,
    t: (key) => key,
    titleCase: (value) => value,
    simpleItemName: (hrid) =>
      String(hrid || "")
        .split("/")
        .pop(),
    shrineIdentityValues: (record, fallbackHrid) =>
      [
        record && record.guildBuildingHrid,
        record && record.guildShrineHrid,
        record && record.hrid,
        fallbackHrid
      ].filter(Boolean),
    shrineLevelValue: (record) => {
      const level = Number(record && (record.level ?? record.currentLevel));
      return Number.isSafeInteger(level) && level >= 0 ? level : null;
    },
    formatNumber: String,
    persistGuildBuildingPlannerState: () => {
      persistCount += 1;
    },
    pageWindow: {
      clearTimeout() {},
      setTimeout() {}
    }
  });
  return { state, view, persistCount: () => persistCount };
}

test("公会建筑规则覆盖 28 座建筑与神龛的 1 至 20 级", () => {
  const definitions = data.definitions();
  assert.equal(definitions.length, 28);
  assert.equal(definitions.filter((entry) => entry.costMultiplier === 1).length, 9);
  assert.equal(definitions.filter((entry) => entry.costMultiplier === 0.5).length, 19);
  assert.ok(definitions.every((entry) => entry.levelCosts.length === 21));
  assert.equal(
    definitions.find((entry) => entry.hrid === "/guild_buildings/guild_hall").levelCosts[20].guildPointCost,
    299450
  );
  assert.equal(
    definitions.find((entry) => entry.hrid === "/guild_buildings/gym").levelCosts[20].guildPointCost,
    149725
  );
});

test("公会建筑 HRID 映射到游戏原生 SVG 精灵图符号", () => {
  const definitions = data.definitions();
  const spriteFixture = projectFile("tools/test-misc-sprite.svg");
  assert.ok(definitions.every((entry) => entry.iconSymbolId));
  assert.ok(definitions.every((entry) => spriteFixture.includes(`id="${entry.iconSymbolId}"`)));
  assert.equal(data.iconSymbolId("/guild_buildings/guild_hall"), "guild_guild_hall");
  assert.equal(data.iconSymbolId("/guild_buildings/builders_hall"), "guild_builders_hall");
  assert.equal(data.iconSymbolId("/guild_shrines/force"), "guild_shrine_force");
  assert.equal(data.iconSymbolId("/items/guild_token"), "");
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

test("完整建筑等级快照中缺少的建筑视为 0 级并可直接规划 0→1", () => {
  const hall = data.definitions().find((entry) => entry.hrid === "/guild_buildings/guild_hall");
  const harness = createConstructionHarness({ guildBuildingLevels: {}, guildBuildingLevelsComplete: true });
  assert.equal(harness.view.currentGuildBuildingLevel(hall), 0);

  const result = harness.view.addGuildBuildingPlan([hall], hall.hrid);
  assert.equal(result.status, "added");
  assert.deepEqual(result.plan, {
    id: "building-plan-1",
    buildingHrid: hall.hrid,
    startLevel: 0,
    targetLevel: 1
  });
  assert.equal(harness.persistCount(), 1);
});

test("局部建筑等级帧缺少的建筑仍要求手动填写起始等级", () => {
  const hall = data.definitions().find((entry) => entry.hrid === "/guild_buildings/guild_hall");
  const harness = createConstructionHarness({
    guildBuildingLevels: {
      "/guild_buildings/gym": { guildBuildingHrid: "/guild_buildings/gym", level: 2 }
    },
    guildBuildingLevelsComplete: false
  });
  assert.equal(harness.view.currentGuildBuildingLevel(hall), null);
  assert.deepEqual(harness.view.addGuildBuildingPlan([hall], hall.hrid), {
    status: "requires_start_level",
    buildingHrid: hall.hrid
  });
  assert.deepEqual(harness.state.buildingPlans, []);
  assert.equal(harness.persistCount(), 0);
});

test("施工队列标记预算截止步骤并保留超预算项目", () => {
  const definitions = data.definitions();
  const hall = definitions.find((entry) => entry.hrid === "/guild_buildings/guild_hall");
  const gym = definitions.find((entry) => entry.hrid === "/guild_buildings/gym");
  const result = core.buildGuildConstructionPlan(
    [
      { id: "hall", buildingHrid: hall.hrid, startLevel: 0, targetLevel: 2, levelCosts: hall.levelCosts },
      { id: "gym", buildingHrid: gym.hrid, startLevel: 0, targetLevel: 2, levelCosts: gym.levelCosts }
    ],
    2500
  );
  assert.equal(result.status, "ok");
  assert.equal(result.totalCost, 3525);
  assert.equal(result.affordableStepCount, 2);
  assert.equal(result.firstOverBudgetIndex, 2);
  assert.equal(result.steps[1].fitsBudget, true);
  assert.equal(result.steps[2].fitsBudget, false);
  assert.equal(result.remainingGuildPoints, -1025);
  assert.deepEqual(
    result.plans.map((plan) => ({
      buildingHrid: plan.buildingHrid,
      budgetState: plan.budgetState,
      affordableStepCount: plan.affordableStepCount,
      affordableTargetLevel: plan.affordableTargetLevel,
      nextStepShortfall: plan.nextStepShortfall
    })),
    [
      {
        buildingHrid: hall.hrid,
        budgetState: "within",
        affordableStepCount: 2,
        affordableTargetLevel: 2,
        nextStepShortfall: null
      },
      {
        buildingHrid: gym.hrid,
        budgetState: "outside",
        affordableStepCount: 0,
        affordableTargetLevel: 0,
        nextStepShortfall: 350
      }
    ]
  );
});

test("调整建筑组顺序后保持逐级依赖并重新计算预算截止位置", () => {
  const definitions = data.definitions();
  const hall = definitions.find((entry) => entry.hrid === "/guild_buildings/guild_hall");
  const gym = definitions.find((entry) => entry.hrid === "/guild_buildings/gym");
  const forward = core.buildGuildConstructionPlan(
    [
      { id: "hall", buildingHrid: hall.hrid, startLevel: 0, targetLevel: 2, levelCosts: hall.levelCosts },
      { id: "gym", buildingHrid: gym.hrid, startLevel: 0, targetLevel: 2, levelCosts: gym.levelCosts }
    ],
    2500
  );
  const reversed = core.buildGuildConstructionPlan(
    [
      { id: "gym", buildingHrid: gym.hrid, startLevel: 0, targetLevel: 2, levelCosts: gym.levelCosts },
      { id: "hall", buildingHrid: hall.hrid, startLevel: 0, targetLevel: 2, levelCosts: hall.levelCosts }
    ],
    2500
  );
  assert.deepEqual(
    reversed.steps.map((step) => [step.buildingHrid, step.fromLevel, step.toLevel]),
    [
      [gym.hrid, 0, 1],
      [gym.hrid, 1, 2],
      [hall.hrid, 0, 1],
      [hall.hrid, 1, 2]
    ]
  );
  assert.equal(forward.firstOverBudgetIndex, 2);
  assert.equal(reversed.firstOverBudgetIndex, 3);
  assert.deepEqual(
    reversed.plans.map((plan) => ({
      buildingHrid: plan.buildingHrid,
      budgetState: plan.budgetState,
      affordableTargetLevel: plan.affordableTargetLevel,
      nextStepShortfall: plan.nextStepShortfall
    })),
    [
      {
        buildingHrid: gym.hrid,
        budgetState: "within",
        affordableTargetLevel: 2,
        nextStepShortfall: null
      },
      {
        buildingHrid: hall.hrid,
        budgetState: "partial",
        affordableTargetLevel: 1,
        nextStepShortfall: 1025
      }
    ]
  );
});

test("未设置预算时每个建筑组保留全部升级且不伪造缺口", () => {
  const hall = data.definitions().find((entry) => entry.hrid === "/guild_buildings/guild_hall");
  const result = core.buildGuildConstructionPlan(
    [{ id: "hall", buildingHrid: hall.hrid, startLevel: 0, targetLevel: 2, levelCosts: hall.levelCosts }],
    null
  );
  assert.equal(result.status, "ok");
  assert.deepEqual(
    result.plans.map((plan) => ({
      budgetState: plan.budgetState,
      affordableStepCount: plan.affordableStepCount,
      affordableTargetLevel: plan.affordableTargetLevel,
      nextStepShortfall: plan.nextStepShortfall
    })),
    [
      {
        budgetState: "unbudgeted",
        affordableStepCount: 2,
        affordableTargetLevel: 2,
        nextStepShortfall: null
      }
    ]
  );
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
  const userscript = projectRuntimeSource();
  const harness = projectFile("tools/test-harness.html");
  assert.match(build, /src\/guild-building-data\.js/);
  assert.match(bridge, /guildBuildingLevels/);
  assert.match(bridge, /guildBuildingDetails/);
  assert.match(userscript, /data-role="view-construction"/);
  assert.match(userscript, /buildGuildConstructionPlan/);
  assert.match(userscript, /mwi-guild-building-planner-v1/);
  assert.match(userscript, /exportGuildConstructionCsv/);
  assert.match(userscript, /mwi-building-grid/);
  assert.match(userscript, /mwi-building-tile/);
  assert.match(userscript, /mwi-building-picker/);
  assert.match(userscript, /data-role="toggle-building-picker"/);
  assert.match(userscript, /data-role="pending-building-start"/);
  assert.match(userscript, /data-role="pending-building-start-level"/);
  assert.match(userscript, /mwi-construction-group/);
  assert.match(userscript, /data-role="building-target"/);
  assert.match(userscript, /data-role="toggle-building-steps"/);
  assert.match(userscript, /mwi-construction-group-steps/);
  assert.match(userscript, /mwi-construction-drag-handle/);
  assert.match(userscript, /data-role="construction-affordable"/);
  assert.match(userscript, /data-role="construction-budget-summary"/);
  assert.match(userscript, /data-known-count=/);
  assert.match(userscript, /data-role="construction-status-text" role="status" aria-live="polite" aria-atomic="true"/);
  assert.match(userscript, /data-role="undo-clear-building-plans"/);
  assert.match(
    userscript,
    /cancel-pending-building[\s\S]*?building-tile[\s\S]*?building-search[\s\S]*?toggle-building-picker/
  );
  assert.match(userscript, /function applyGuildBuildingFilters/);
  assert.match(userscript, /function guildBuildingIconMarkup/);
  assert.match(userscript, /misc_sprite/);
  assert.match(userscript, /mwi-building-icon/);
  assert.doesNotMatch(userscript, /buildingRulesSnapshot/);
  assert.match(harness, /constructionAudit/);
  assert.match(harness, /constructionAuditReady/);
});

test("公会建设关键文案同时覆盖中文与英文", () => {
  const localization = projectFile("src/localization.js");
  for (const key of [
    "guildConstruction",
    "guildPointBudget",
    "manualBudget",
    "affordableUpgrades",
    "constructionBudgetStopsBefore",
    "buildingCatalog",
    "addBuilding",
    "closeBuildingPicker",
    "buildingCategoryFilter",
    "constructionQueue",
    "constructionQueueHint",
    "constructionQueueDragHint",
    "constructionQueueEmptyTitle",
    "buildingTileAddLabel",
    "buildingTileUnknownLabel",
    "buildingTilePlannedLabel",
    "currentBuildingLevelRequired",
    "currentBuildingLevelLabel",
    "currentBuildingLevelRange",
    "addBuildingToPlan",
    "constructionGroupBudgetCutoff",
    "constructionPlanRowMeta",
    "buildingTargetLabel",
    "increaseBuildingTarget",
    "expandBuildingSteps",
    "collapseBuildingSteps",
    "removeBuildingFromPlan",
    "buildingLevelsCoverage",
    "buildingLevelsPartialHint",
    "dragConstructionPlan",
    "undoClearBuildingPlans",
    "buildingPlanRestored",
    "buildingPlanMovedToPosition",
    "copyBuildingPlan",
    "exportBuildingCsv"
  ]) {
    assert.equal(
      (localization.match(new RegExp(`${key}:`, "g")) || []).length,
      2,
      `${key} should exist in both locales`
    );
  }
});
