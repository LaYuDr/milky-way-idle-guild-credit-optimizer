"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const data = require("../src/guild-building-data.js");
const core = require("../src/core.js");
const config = require("../src/runtime/config.js");
const constructionViewApi = require("../src/ui/construction-view.js");

const GUILD_TRIAL_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

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
    guildPointForecastWeeks: 6,
    guildPointPlanningWeeks: 0,
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
    guildTrialFirstStartAt: config.GUILD_TRIAL_FIRST_START_AT,
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

test("公会试炼从首期时间起每 7 天推算一次", () => {
  const expectedStarts = [
    "2026-07-10T00:00:00.000Z",
    "2026-07-17T00:00:00.000Z",
    "2026-07-24T00:00:00.000Z",
    "2026-07-31T00:00:00.000Z",
    "2026-08-07T00:00:00.000Z",
    "2026-08-14T00:00:00.000Z",
    "2026-08-21T00:00:00.000Z",
    "2026-08-28T00:00:00.000Z",
    "2026-09-04T00:00:00.000Z",
    "2026-09-11T00:00:00.000Z",
    "2026-09-18T00:00:00.000Z"
  ];
  const actualStarts = expectedStarts.map((_, index) =>
    new Date(config.GUILD_TRIAL_FIRST_START_AT + index * GUILD_TRIAL_WEEK_MS).toISOString()
  );
  assert.deepEqual(actualStarts, expectedStarts);
});

test("冷启动估算不将尚未结束的本周当作完整周趋势", () => {
  const firstTrial = config.GUILD_TRIAL_FIRST_START_AT;
  const week = 7 * 24 * 60 * 60 * 1000;
  assert.deepEqual(core.estimateGuildPointColdStart(65000, 9000, firstTrial + 7 * week, firstTrial), {
    status: "ok",
    pastWeekCount: 7,
    historicalAveragePoints: 8000,
    currentWeekPoints: 9000,
    historicalMidpoint: 4,
    latestWeekOrdinal: 8,
    weeklyGrowthPoints: null,
    growthRate: null,
    forecastPoints: 8000
  });
  assert.equal(core.estimateGuildPointColdStart(9000, 1000, firstTrial - 1, firstTrial).status, "before_first_trial");
  assert.equal(core.estimateGuildPointColdStart(-1, 0, firstTrial, firstTrial).status, "unavailable");
});

test("缺失历史周按累计点数均匀补齐且不引入本周进度", () => {
  const firstTrial = config.GUILD_TRIAL_FIRST_START_AT;
  const week = 7 * 24 * 60 * 60 * 1000;
  const result = core.supplementGuildPointHistory(null, 65000, 9000, firstTrial + 7 * week, firstTrial);
  const summary = core.summarizeGuildPointHistory(result.history);
  assert.equal(result.status, "ok");
  assert.equal(result.estimatedCount, 7);
  assert.deepEqual(
    summary.weeks.map((record) => record.earnedPoints),
    [8000, 8000, 8000, 8000, 8000, 8000, 8000]
  );
  assert.equal(
    summary.weeks.reduce((total, record) => total + record.earnedPoints, 0),
    56000
  );
  assert.equal(result.averageWeeklyChange, 0);
  assert.equal(result.forecastPoints, 8000);
});

test("本周为 0 或只有少量进度时仍按已结束历史周预测", () => {
  const firstTrial = config.GUILD_TRIAL_FIRST_START_AT;
  const week = 7 * 24 * 60 * 60 * 1000;
  const zero = core.supplementGuildPointHistory(null, 65000, 0, firstTrial + 7 * week, firstTrial);
  const partial = core.supplementGuildPointHistory(null, 65000, 1000, firstTrial + 7 * week, firstTrial);
  assert.equal(zero.status, "ok");
  assert.equal(zero.forecastPoints, 9286);
  assert.equal(partial.forecastPoints, 9143);
  assert.ok(zero.forecastPoints > 0);
  assert.ok(partial.forecastPoints > 0);
});

test("预测回看周数只限制最近连续完整周", () => {
  const firstTrial = config.GUILD_TRIAL_FIRST_START_AT;
  const week = 7 * 24 * 60 * 60 * 1000;
  const history = {
    weeks: Array.from({ length: 8 }, (_, index) => ({
      weekStartAt: firstTrial + index * week,
      earnedPoints: index === 7 ? 800 : 100,
      complete: true,
      observedAt: firstTrial + (index + 1) * week
    }))
  };
  const threeWeeks = core.summarizeGuildPointHistory(history, { forecastWeekCount: 3 });
  const sixWeeks = core.summarizeGuildPointHistory(history, { forecastWeekCount: 6 });
  assert.equal(threeWeeks.forecastPoints, 1150);
  assert.equal(threeWeeks.forecastSampleCount, 3);
  assert.equal(sixWeeks.forecastPoints, 940);
  assert.equal(sixWeeks.forecastSampleCount, 6);
});

test("历史已知点数超过游戏累计值时停止预测", () => {
  const firstTrial = config.GUILD_TRIAL_FIRST_START_AT;
  const week = 7 * 24 * 60 * 60 * 1000;
  const result = core.supplementGuildPointHistory(
    { weeks: [{ weekStartAt: firstTrial, earnedPoints: 10000, complete: true, observedAt: firstTrial + week }] },
    12000,
    5000,
    firstTrial + 2 * week,
    firstTrial
  );
  assert.equal(result.status, "known_points_exceed_total");
  assert.equal(result.forecastPoints, null);
  assert.equal(result.forecastSampleCount, 0);
});

test("建设页在历史冲突时同时停止未来预算和 ETA", () => {
  const harness = createConstructionHarness();
  const firstTrial = config.GUILD_TRIAL_FIRST_START_AT;
  const week = 7 * 24 * 60 * 60 * 1000;
  harness.state.guildPointPlanningWeeks = 4;
  harness.state.guildPointSummary = {
    guildId: "guild-1",
    lifetimePoints: 12000,
    availablePoints: 1000,
    currentWeekPoints: 5000
  };
  harness.state.guildPointHistory.weeks = [
    { weekStartAt: firstTrial, earnedPoints: 10000, complete: true, observedAt: firstTrial + week }
  ];
  const history = harness.view.guildPointHistorySummary();
  const planning = harness.view.guildPointPlanningBudget(history);
  const eta = harness.view.guildPointEta({ totalCost: 5000, planning }, history);
  assert.equal(history.supplemented.status, "known_points_exceed_total");
  assert.equal(history.forecastPoints, null);
  assert.equal(planning.status, "missing_forecast");
  assert.equal(planning.budget, 1000);
  assert.equal(eta.status, "history_conflict");
});

test("建设页将本周 0 显示为历史预测而非实际周样本", () => {
  const harness = createConstructionHarness();
  harness.state.guildPointSummary = {
    guildId: "guild-1",
    lifetimePoints: 65000,
    availablePoints: 1000,
    currentWeekPoints: 0
  };
  const history = harness.view.guildPointHistorySummary();
  const planning = harness.view.guildPointPlanningBudget(history);
  const markup = harness.view.renderGuildPointForecast(history, { totalCost: 5000, planning });
  assert.match(markup, /predictedCurrentWeekGuildPoints/);
  assert.doesNotMatch(markup, />0<\/strong>/);
  assert.match(markup, /data-source="currentEstimated" data-current-week="true"/);
  assert.match(markup, /data-role="current-week-guild-points">\d+<\/strong>/);
});

test("当前周实际点数以只读行显示在历史表最底部", () => {
  const harness = createConstructionHarness();
  const firstTrial = config.GUILD_TRIAL_FIRST_START_AT;
  const week = 7 * 24 * 60 * 60 * 1000;
  const currentWeekStartAt = firstTrial + Math.floor((Date.now() - firstTrial) / week) * week;
  harness.state.guildPointSummary = {
    guildId: "guild-1",
    lifetimePoints: 65000,
    availablePoints: 1000,
    currentWeekPoints: 4321
  };
  harness.state.guildWeekStartAt = currentWeekStartAt + 2 * 60 * 60 * 1000;
  const history = harness.view.guildPointHistorySummary();
  const planning = harness.view.guildPointPlanningBudget(history);
  const markup = harness.view.renderGuildPointForecast(history, { totalCost: 5000, planning });
  assert.match(markup, /data-source="current" data-current-week="true"/);
  assert.match(markup, /data-role="current-week-guild-points">4321<\/strong>/);
  assert.match(markup, /guildPointSourceCurrent/);
  assert.match(markup, /guildPointWeekWithDate/);
  assert.match(markup, /data-current-week="true"[\s\S]*<\/tr><\/tbody>/);
  assert.match(markup, /data-role="guild-point-forecast-weeks" type="number" min="2" max="12" step="1"/);
  assert.match(markup, /data-role="guild-point-planning-weeks" type="number" min="0" max="12" step="1"/);
  assert.match(markup, /data-input-role="guild-point-forecast-weeks" data-direction="1"/);
  assert.match(markup, /data-input-role="guild-point-planning-weeks" data-direction="-1"/);
  assert.doesNotMatch(markup, /<select data-role="guild-point-(?:forecast|planning)-weeks"/);
});

test("规划周数将预测产出加入当前预算且对缺失预测降级", () => {
  assert.deepEqual(core.calculateGuildPointPlanningBudget(5000, 8000, 4), {
    status: "ok",
    basePoints: 5000,
    weeks: 4,
    forecastPoints: 8000,
    budget: 37000
  });
  assert.deepEqual(core.calculateGuildPointPlanningBudget(5000, null, 4), {
    status: "missing_forecast",
    basePoints: 5000,
    weeks: 4,
    forecastPoints: null,
    budget: 5000
  });
});

test("手动历史覆盖估算值且剩余缺口继续自动补充", () => {
  const firstTrial = config.GUILD_TRIAL_FIRST_START_AT;
  const week = 7 * 24 * 60 * 60 * 1000;
  const observedAt = firstTrial + 7 * week;
  const saved = core.setManualGuildPointWeek(null, firstTrial + 3 * week, 8500, observedAt, firstTrial);
  assert.equal(saved.status, "saved");
  const result = core.supplementGuildPointHistory(saved.history, 65000, 9000, observedAt, firstTrial);
  const records = core.summarizeGuildPointHistory(result.history).weeks;
  assert.equal(result.manualCount, 1);
  assert.equal(result.estimatedCount, 6);
  assert.equal(records.find((record) => record.weekStartAt === firstTrial + 3 * week).earnedPoints, 8500);
  assert.equal(records.find((record) => record.weekStartAt === firstTrial + 3 * week).source, "manual");
  assert.equal(
    records.reduce((total, record) => total + record.earnedPoints, 0),
    56000
  );
  const removed = core.removeManualGuildPointWeek(saved.history, firstTrial + 3 * week);
  assert.equal(removed.changed, true);
  assert.deepEqual(removed.history.manualWeeks, []);
});

test("手动历史不能覆盖游戏追踪周或录入当前周", () => {
  const firstTrial = config.GUILD_TRIAL_FIRST_START_AT;
  const week = 7 * 24 * 60 * 60 * 1000;
  const observedAt = firstTrial + 2 * week;
  const tracked = {
    weeks: [{ weekStartAt: firstTrial, earnedPoints: 8000, complete: true, observedAt: firstTrial + week }]
  };
  assert.equal(core.setManualGuildPointWeek(tracked, firstTrial, 9000, observedAt, firstTrial).status, "tracked");
  assert.equal(
    core.setManualGuildPointWeek(tracked, firstTrial + 2 * week, 9000, observedAt, firstTrial).status,
    "invalid"
  );
});

test("建设页可批量保存、修改和清空手动历史，并在 CSV 标注来源", () => {
  const harness = createConstructionHarness();
  const firstTrial = config.GUILD_TRIAL_FIRST_START_AT;
  const secondTrial = firstTrial + 7 * 24 * 60 * 60 * 1000;
  harness.state.guildPointSummary = {
    guildId: "guild-1",
    lifetimePoints: 65000,
    availablePoints: 1000,
    currentWeekPoints: 9000
  };
  assert.equal(
    harness.view.saveManualGuildPointHistory([
      { weekStartAt: firstTrial, earnedPoints: "7600" },
      { weekStartAt: secondTrial, earnedPoints: "8100" }
    ]).status,
    "saved"
  );
  assert.equal(harness.persistCount(), 1);
  assert.match(harness.view.guildPointHistoryCsv(), /"7600","guildPointCsvManual"/);
  assert.match(harness.view.guildPointHistoryCsv(), /"guildPointCsvEstimated"/);
  assert.equal(
    harness.view.saveManualGuildPointHistory([
      { weekStartAt: firstTrial, earnedPoints: "7700" },
      { weekStartAt: secondTrial, earnedPoints: "" }
    ]).status,
    "saved"
  );
  assert.equal(harness.persistCount(), 2);
  assert.deepEqual(
    harness.state.guildPointHistory.manualWeeks.map((record) => [record.weekStartAt, record.earnedPoints]),
    [[firstTrial, 7700]]
  );
});

test("批量历史存在非法值时原子失败，不会部分覆盖已有数据", () => {
  const harness = createConstructionHarness();
  const firstTrial = config.GUILD_TRIAL_FIRST_START_AT;
  harness.view.saveManualGuildPointWeek(firstTrial, 7600);
  const before = structuredClone(harness.state.guildPointHistory);
  const result = harness.view.saveManualGuildPointHistory([
    { weekStartAt: firstTrial, earnedPoints: "8000" },
    { weekStartAt: firstTrial + 1, earnedPoints: "9000" }
  ]);
  assert.equal(result.status, "invalid");
  assert.deepEqual(harness.state.guildPointHistory, before);
  assert.equal(harness.persistCount(), 1);
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
  assert.match(userscript, /data-role="guild-point-forecast-weeks"/);
  assert.match(userscript, /data-role="guild-point-planning-weeks"/);
  assert.match(userscript, /calculateGuildPointPlanningBudget/);
  assert.match(userscript, /recordGuildPointObservation/);
  assert.match(userscript, /save-manual-guild-point-history/);
  assert.match(userscript, /mwi-guild-point-table-scroll/);
  assert.doesNotMatch(userscript, /data-role="manual-guild-point-week"/);
  assert.match(userscript, /supplementGuildPointHistory/);
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
    "guildPointSavedSnapshot",
    "currentAvailableGuildPoints",
    "currentWeekGuildPoints",
    "predictedCurrentWeekGuildPoints",
    "latestWeeklyGuildPoints",
    "weeklyGuildPointGrowth",
    "guildPointEstimatedGrowth",
    "nextWeekGuildPointForecast",
    "guildPointHistoryUnavailable",
    "guildPointHistoryBaseline",
    "guildPointForecastNeedsHistory",
    "guildPointForecastColdStart",
    "guildPointForecastMethod",
    "guildPointForecastEstimatedMethod",
    "guildPointHistoryConflict",
    "guildPointForecastWeeks",
    "guildPointForecastWeeksHint",
    "increaseGuildPointForecastWeeks",
    "decreaseGuildPointForecastWeeks",
    "guildPointPlanningWeeks",
    "guildPointPlanningWeeksHint",
    "increaseGuildPointPlanningWeeks",
    "decreaseGuildPointPlanningWeeks",
    "guildPointPlanningCurrentOnly",
    "guildPointWeekCount",
    "guildPointWeekWithDate",
    "guildPointPlanningBudgetProjected",
    "recentGuildPointHistory",
    "manualGuildPointWeek",
    "manualGuildPointEarned",
    "manualGuildPointEarnedForWeek",
    "guildPointHistorySource",
    "saveManualGuildPointHistory",
    "manualGuildPointHint",
    "manualGuildPointHistoryEmpty",
    "guildPointSourceTracked",
    "guildPointSourceManual",
    "guildPointSourceEstimated",
    "guildPointSourceEmpty",
    "guildPointSourceCurrent",
    "guildPointSourceCurrentEstimated",
    "guildPointSourceCurrentPending",
    "guildPointSourceCurrentUnavailable",
    "currentGuildPointWeek",
    "manualGuildPointWeekSaved",
    "manualGuildPointWeekRemoved",
    "manualGuildPointHistorySaved",
    "constructionEta",
    "constructionEtaWeeks",
    "constructionEtaDetail",
    "constructionEtaDetailEstimated",
    "constructionEtaHistoryConflict",
    "exportGuildPointHistory",
    "resetGuildPointHistory",
    "resetGuildPointHistoryConfirm",
    "guildPointHistoryReset",
    "guildPointCsvWeekStart",
    "guildPointCsvEarned",
    "guildPointCsvStatus",
    "guildPointCsvComplete",
    "guildPointCsvTracking",
    "guildPointCsvManual",
    "guildPointCsvEstimated",
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
