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

function createConstructionHarness({
  guildBuildingLevels = null,
  guildBuildingLevelsComplete = false,
  confirmResult = true
} = {}) {
  const state = {
    guildBuildingLevels,
    guildBuildingLevelsComplete,
    buildingPlans: [],
    nextBuildingPlanId: 1,
    buildingPlanNotice: "",
    manualGuildPoints: null,
    buildingSearch: "",
    buildingCategory: "all",
    guildPointSummary: null,
    guildWeekStartAt: null,
    guildPointHistory: { guildId: "", lastObservation: null, weeks: [] }
  };
  let persistCount = 0;
  let confirmCount = 0;
  const downloadState = { blob: null, clicked: false, fileName: "" };
  const view = constructionViewApi.createConstructionView({
    state,
    buildingDataApi: data,
    core,
    t: (key) => key,
    ui: () => ({ locale: "zh-CN" }),
    escapeHtml: String,
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
    document: {
      body: { appendChild() {} },
      createElement() {
        return {
          href: "",
          download: "",
          click() {
            downloadState.clicked = true;
            downloadState.fileName = this.download;
          },
          remove() {}
        };
      }
    },
    URL: {
      createObjectURL(blob) {
        downloadState.blob = blob;
        return "blob:test";
      },
      revokeObjectURL() {}
    },
    Blob,
    guildTrialFirstStartAt: Date.parse("2026-07-13T00:00:00Z"),
    pageWindow: {
      clearTimeout() {},
      setTimeout() {},
      confirm() {
        confirmCount += 1;
        return confirmResult;
      }
    }
  });
  return { state, view, downloadState, persistCount: () => persistCount, confirmCount: () => confirmCount };
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

test("公会点数按官方周起点累计，消费可用点数不会被误认为收益", () => {
  const week = Date.parse("2026-09-01T02:00:00Z");
  const observe = (history, lifetimePoints, availablePoints, weekStartAt, day) =>
    core.recordGuildPointObservation(history, {
      guildId: "guild-1",
      lifetimePoints,
      availablePoints,
      weekStartAt,
      observedAt: week + day * 24 * 60 * 60 * 1000
    });

  const baseline = observe(null, 1000, 200, week, 1);
  assert.equal(baseline.changed, true);
  assert.deepEqual(baseline.history.weeks, []);

  const firstGain = observe(baseline.history, 1100, 300, week, 2);
  assert.equal(firstGain.recordedPoints, 100);
  assert.equal(firstGain.history.weeks[0].complete, false);

  const afterSpend = observe(firstGain.history, 1100, 50, week, 3);
  assert.equal(afterSpend.changed, false);
  assert.deepEqual(afterSpend.history.weeks, firstGain.history.weeks);

  const nextWeek = week + 7 * 24 * 60 * 60 * 1000;
  const closed = observe(afterSpend.history, 1250, 200, nextWeek, 8);
  assert.equal(closed.recordedPoints, 150);
  assert.deepEqual(
    closed.history.weeks.map(({ weekStartAt, earnedPoints, complete }) => ({
      weekStartAt,
      earnedPoints,
      complete
    })),
    [{ weekStartAt: week, earnedPoints: 250, complete: true }]
  );
  assert.equal(core.summarizeGuildPointHistory(closed.history).latest.earnedPoints, 250);
});

test("周环比增长率和下周预测只使用已结束的连续周", () => {
  const week = Date.parse("2026-09-01T02:00:00Z");
  const day = 24 * 60 * 60 * 1000;
  let history = null;
  const record = (lifetimePoints, weekStartAt, observedAt) => {
    const result = core.recordGuildPointObservation(history, {
      guildId: "guild-1",
      lifetimePoints,
      availablePoints: lifetimePoints,
      weekStartAt,
      observedAt
    });
    history = result.history;
  };
  record(1000, week, week + day);
  record(1250, week + 7 * day, week + 8 * day);
  record(1550, week + 14 * day, week + 15 * day);
  record(1750, week + 14 * day, week + 16 * day);

  const summary = core.summarizeGuildPointHistory(history);
  assert.deepEqual(
    summary.weeks.map((entry) => entry.earnedPoints),
    [250, 300]
  );
  assert.equal(summary.trackedWeeks.at(-1).complete, false);
  assert.equal(summary.growthRate, 0.2);
  assert.equal(summary.averageWeeklyChange, 50);
  assert.equal(summary.forecastPoints, 350);
  assert.equal(summary.forecastSampleCount, 2);
});

test("施工 ETA 使用当前缺口和周预测向上取整", () => {
  assert.deepEqual(core.estimateGuildConstructionWeeks(13975, 5000, 420), {
    status: "ok",
    shortfall: 8975,
    weeks: 22,
    weeklyForecast: 420
  });
  assert.equal(core.estimateGuildConstructionWeeks(5000, 5000, 420).status, "covered");
  assert.equal(core.estimateGuildConstructionWeeks(5000, null, 420).status, "missing_balance");
  assert.equal(core.estimateGuildConstructionWeeks(5000, 1000, null).status, "missing_forecast");
  assert.equal(core.estimateGuildConstructionWeeks(5000, 1000, 0).status, "no_growth");
  assert.equal(core.estimateGuildConstructionWeeks(0, 1000, 420).status, "no_plan");
});

test("冷启动估算以历史中点和最新周拟合线性增长并外推下一周", () => {
  const firstTrial = Date.parse("2026-07-13T00:00:00Z");
  const week = 7 * 24 * 60 * 60 * 1000;
  assert.deepEqual(core.estimateGuildPointColdStart(65000, 9000, firstTrial + 7 * week, firstTrial), {
    status: "ok",
    pastWeekCount: 7,
    historicalAveragePoints: 8000,
    currentWeekPoints: 9000,
    historicalMidpoint: 4,
    latestWeekOrdinal: 8,
    weeklyGrowthPoints: 250,
    growthRate: 0.03125,
    forecastPoints: 9250
  });
  assert.equal(core.estimateGuildPointColdStart(9000, 1000, firstTrial - 1, firstTrial).status, "before_first_trial");
  assert.equal(core.estimateGuildPointColdStart(-1, 0, firstTrial, firstTrial).status, "unavailable");
});

test("周记录可导出带 BOM 的 CSV，并标记完整周与追踪中记录", async () => {
  const harness = createConstructionHarness();
  const week = Date.parse("2026-09-01T02:00:00Z");
  harness.state.guildPointHistory.weeks = [
    { weekStartAt: week, earnedPoints: 360, complete: true, observedAt: week + 7 },
    { weekStartAt: week + 7 * 24 * 60 * 60 * 1000, earnedPoints: 120, complete: false, observedAt: week + 8 }
  ];
  const csv = harness.view.guildPointHistoryCsv();
  assert.ok(csv.startsWith("\uFEFF"));
  assert.match(csv, /"guildPointCsvWeekStart","guildPointCsvEarned","guildPointCsvStatus"\r\n/);
  assert.match(csv, /"2026-09-01T02:00:00.000Z","360","guildPointCsvComplete"/);
  assert.match(csv, /"2026-09-08T02:00:00.000Z","120","guildPointCsvTracking"/);
  assert.equal(harness.view.exportGuildPointHistoryCsv(), true);
  assert.equal(harness.downloadState.clicked, true);
  assert.equal(harness.downloadState.fileName, "guildPointCsvFileName");
  const blobBytes = Buffer.from(await harness.downloadState.blob.arrayBuffer());
  assert.deepEqual(Array.from(blobBytes.subarray(0, 3)), [0xef, 0xbb, 0xbf]);
  assert.equal(blobBytes.subarray(3).toString("utf8"), csv.slice(1));
});

test("重置周记录需要确认，只清除历史并立即建立新基线", () => {
  const cancelled = createConstructionHarness({ confirmResult: false });
  cancelled.state.guildPointHistory.weeks = [{ weekStartAt: 1, earnedPoints: 10, complete: true, observedAt: 1 }];
  assert.equal(cancelled.view.resetGuildPointHistory(), false);
  assert.equal(cancelled.state.guildPointHistory.weeks.length, 1);
  assert.equal(cancelled.persistCount(), 0);

  const harness = createConstructionHarness();
  harness.state.guildPointSummary = { guildId: "guild-1", lifetimePoints: 2000, availablePoints: 250 };
  harness.state.guildWeekStartAt = Date.parse("2026-09-08T02:00:00Z");
  harness.state.guildPointHistory = {
    guildId: "guild-1",
    lastObservation: {
      guildId: "guild-1",
      lifetimePoints: 1500,
      availablePoints: 100,
      weekStartAt: Date.parse("2026-09-01T02:00:00Z"),
      observedAt: Date.parse("2026-09-02T02:00:00Z")
    },
    weeks: [{ weekStartAt: 1, earnedPoints: 10, complete: true, observedAt: 1 }]
  };
  assert.equal(harness.view.resetGuildPointHistory(), true);
  assert.equal(harness.confirmCount(), 1);
  assert.equal(harness.persistCount(), 1);
  assert.deepEqual(harness.state.guildPointHistory.weeks, []);
  assert.equal(harness.state.guildPointHistory.lastObservation.lifetimePoints, 2000);
  assert.equal(harness.state.buildingPlanNotice, "guildPointHistoryReset");
});

test("跨越多个官方周时跳过无法拆分的增量，换公会时重置历史", () => {
  const week = Date.parse("2026-09-01T02:00:00Z");
  const day = 24 * 60 * 60 * 1000;
  const baseline = core.recordGuildPointObservation(null, {
    guildId: "guild-1",
    lifetimePoints: 1000,
    availablePoints: 100,
    weekStartAt: week,
    observedAt: week + day
  });
  const gap = core.recordGuildPointObservation(baseline.history, {
    guildId: "guild-1",
    lifetimePoints: 1400,
    availablePoints: 500,
    weekStartAt: week + 14 * day,
    observedAt: week + 15 * day
  });
  assert.equal(gap.skippedAmbiguousIncrease, 400);
  assert.deepEqual(gap.history.weeks, []);

  const changedGuild = core.recordGuildPointObservation(gap.history, {
    guildId: "guild-2",
    lifetimePoints: 50,
    availablePoints: 50,
    weekStartAt: week + 14 * day,
    observedAt: week + 16 * day
  });
  assert.equal(changedGuild.history.guildId, "guild-2");
  assert.deepEqual(changedGuild.history.weeks, []);
});

test("整周没有获得公会点数时会保存为 0，而首次补齐周起点不会伪造记录", () => {
  const week = Date.parse("2026-09-01T02:00:00Z");
  const day = 24 * 60 * 60 * 1000;
  const baseline = core.recordGuildPointObservation(null, {
    guildId: "guild-1",
    lifetimePoints: 1000,
    availablePoints: 100,
    weekStartAt: null,
    observedAt: week + day
  });
  const identifiedWeek = core.recordGuildPointObservation(baseline.history, {
    guildId: "guild-1",
    lifetimePoints: 1000,
    availablePoints: 100,
    weekStartAt: week,
    observedAt: week + 2 * day
  });
  assert.deepEqual(identifiedWeek.history.weeks, []);
  const closed = core.recordGuildPointObservation(identifiedWeek.history, {
    guildId: "guild-1",
    lifetimePoints: 1000,
    availablePoints: 100,
    weekStartAt: week + 7 * day,
    observedAt: week + 8 * day
  });
  assert.deepEqual(
    closed.history.weeks.map(({ earnedPoints, complete }) => ({ earnedPoints, complete })),
    [{ earnedPoints: 0, complete: true }]
  );
});

test("周点数追踪可在不渲染建设页时独立落盘", () => {
  const harness = createConstructionHarness();
  harness.state.guildPointSummary = { guildId: "guild-1", lifetimePoints: 1000, availablePoints: 200 };
  harness.state.guildWeekStartAt = Date.parse("2026-09-01T02:00:00Z");
  const baseline = harness.view.syncGuildPointHistory();
  assert.equal(baseline.weeks.length, 0);
  assert.equal(harness.persistCount(), 1);

  harness.state.guildPointSummary = { guildId: "guild-1", lifetimePoints: 1100, availablePoints: 300 };
  const tracked = harness.view.syncGuildPointHistory();
  assert.equal(tracked.trackedWeeks[0].earnedPoints, 100);
  assert.equal(tracked.trackedWeeks[0].complete, false);
  assert.equal(harness.persistCount(), 2);
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

test("局部建筑等级帧缺少的建筑按 0 级直接加入计划", () => {
  const hall = data.definitions().find((entry) => entry.hrid === "/guild_buildings/guild_hall");
  const harness = createConstructionHarness({
    guildBuildingLevels: {
      "/guild_buildings/gym": { guildBuildingHrid: "/guild_buildings/gym", level: 2 }
    },
    guildBuildingLevelsComplete: false
  });
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

test("完全未读取建筑等级时也按 0 级规划，真实等级到达后优先使用真实值", () => {
  const hall = data.definitions().find((entry) => entry.hrid === "/guild_buildings/guild_hall");
  const harness = createConstructionHarness();
  assert.equal(harness.view.currentGuildBuildingLevel(hall), 0);

  harness.state.guildBuildingLevels = {
    [hall.hrid]: { guildBuildingHrid: hall.hrid, level: 4 }
  };
  assert.equal(harness.view.currentGuildBuildingLevel(hall), 4);
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
  assert.match(bridge, /lifetimeGuildPoints/);
  assert.match(bridge, /currentWeekStartAt/);
  assert.match(userscript, /data-role="view-construction"/);
  assert.match(userscript, /buildGuildConstructionPlan/);
  assert.match(userscript, /mwi-guild-building-planner-v1/);
  assert.match(userscript, /exportGuildConstructionCsv/);
  assert.match(userscript, /mwi-building-grid/);
  assert.match(userscript, /mwi-building-tile/);
  assert.match(userscript, /mwi-building-picker/);
  assert.match(userscript, /data-role="toggle-building-picker"/);
  assert.doesNotMatch(userscript, /data-role="pending-building-start"/);
  assert.doesNotMatch(userscript, /data-role="pending-building-start-level"/);
  assert.match(userscript, /mwi-construction-group/);
  assert.match(userscript, /data-role="building-target"/);
  assert.match(userscript, /data-role="toggle-building-steps"/);
  assert.match(userscript, /mwi-construction-group-steps/);
  assert.match(userscript, /mwi-construction-drag-handle/);
  assert.match(userscript, /data-role="construction-affordable"/);
  assert.match(userscript, /data-role="construction-budget-summary"/);
  assert.match(userscript, /data-role="next-week-guild-point-forecast"/);
  assert.match(userscript, /recordGuildPointObservation/);
  assert.match(userscript, /constructionView\.syncGuildPointHistory\(\)/);
  assert.match(userscript, /data-known-count=/);
  assert.match(userscript, /data-role="construction-status-text" role="status" aria-live="polite" aria-atomic="true"/);
  assert.match(userscript, /data-role="undo-clear-building-plans"/);
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
    "guildPointTrend",
    "guildPointTrendHint",
    "guildPointAutoSaved",
    "currentAvailableGuildPoints",
    "currentWeekGuildPoints",
    "latestWeeklyGuildPoints",
    "weeklyGuildPointGrowth",
    "guildPointEstimatedGrowth",
    "nextWeekGuildPointForecast",
    "guildPointHistoryUnavailable",
    "guildPointHistoryBaseline",
    "guildPointForecastNeedsHistory",
    "guildPointForecastColdStart",
    "guildPointForecastMethod",
    "recentGuildPointHistory",
    "constructionEta",
    "constructionEtaWeeks",
    "constructionEtaDetail",
    "constructionEtaDetailEstimated",
    "exportGuildPointHistory",
    "resetGuildPointHistory",
    "resetGuildPointHistoryConfirm",
    "guildPointHistoryReset",
    "guildPointCsvWeekStart",
    "guildPointCsvEarned",
    "guildPointCsvStatus",
    "guildPointCsvComplete",
    "guildPointCsvTracking",
    "guildPointCsvFileName",
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
    "buildingTileDefaultZeroLabel",
    "buildingTilePlannedLabel",
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
