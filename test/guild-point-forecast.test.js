"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../src/core.js");
const storage = require("../src/runtime/storage.js");
const FIRST = Date.UTC(2026, 6, 10);
const WEEK = 604800000;
const history = (points, source = "manual") => ({
  weeks: points.map((earnedPoints, index) => ({
    weekStartAt: FIRST + index * WEEK,
    earnedPoints,
    complete: true,
    source
  }))
});

test("自动补齐与未核实零值不拟合，非零追踪和确认零值参与", () => {
  assert.equal(core.summarizeGuildPointHistory(history([100, 200, 300], "estimated")).forecastSampleCount, 0);
  const tracked = core.summarizeGuildPointHistory(history([0, 100, 200], "tracked"));
  assert.equal(tracked.forecastPoints, 300);
  assert.equal(tracked.forecastSampleCount, 2);
  assert.equal(tracked.verifiedSampleCount, 0);
  const manual = core.summarizeGuildPointHistory(history([0, 100]));
  assert.equal(manual.forecastPoints, 200);
  assert.equal(manual.forecastSampleCount, 2);
});

test("线性回归保留缺失周时间间隔，不从窗口外补样本或回退均值", () => {
  const h = history([100, 800, 300]);
  assert.equal(core.summarizeGuildPointHistory(h).forecastPoints, 600);
  h.weeks[1].earnedPoints = 200;
  assert.equal(core.summarizeGuildPointHistory(h).forecastPoints, 400);
  h.weeks.splice(1, 1);
  assert.equal(core.summarizeGuildPointHistory(h).forecastPoints, 400);
  assert.equal(
    core.summarizeGuildPointHistory(h, { forecastWeekCount: 2, historicalAveragePoints: 8659 }).forecastPoints,
    null
  );
  assert.equal(core.summarizeGuildPointHistory(h, { currentWeekStartAt: FIRST + 20 * WEEK }).forecastPoints, null);
});

test("固定线性回归不再由回测切换成均值，本周和下周分别外推", () => {
  for (const points of [
    [100, 200],
    [800, 820, 780, 800, 810, 790]
  ]) {
    assert.equal(core.summarizeGuildPointHistory(history(points)).forecastMethod, "linear");
  }
  const growing = core.summarizeGuildPointHistory(history([100, 200, 300, 400, 500, 600]));
  assert.equal(growing.forecastPoints, 700);
  assert.equal(growing.nextWeekForecastPoints, 800);
  assert.equal(growing.backtest.metrics[0].count, 4);
});

test("本周结束后的2周窗口使用第11与12周，截图第13周预测为11081", () => {
  const h = {
    weeks: [
      { weekStartAt: FIRST + 9 * WEEK, earnedPoints: 10232, complete: true, source: "tracked" },
      { weekStartAt: FIRST + 10 * WEEK, earnedPoints: 10061, complete: true, source: "tracked" },
      { weekStartAt: FIRST + 11 * WEEK, earnedPoints: 123, complete: false, source: "tracked" },
      { weekStartAt: FIRST + 12 * WEEK, earnedPoints: 999999, complete: true, source: "manual" }
    ]
  };
  const original = JSON.stringify(h);
  const result = core.summarizeGuildPointHistory(h, {
    currentWeekStartAt: FIRST + 11 * WEEK,
    currentWeekPoints: 10571,
    forecastWeekCount: 2
  });
  assert.deepEqual(
    result.forecastSamples.map((r) => r.earnedPoints),
    [10061, 10571]
  );
  assert.equal(result.nextWeekForecastPoints, 11081);
  assert.equal(result.forecastPoints, 10571);
  assert.equal(result.partialSampleCount, 2);
  assert.equal(result.currentWeekComplete, true);
  assert.equal(JSON.stringify(h), original);
  assert.equal(result.trackedWeeks.find((r) => r.weekStartAt === FIRST + 11 * WEEK).earnedPoints, 123);
  for (const currentWeekPoints of [0, null, undefined]) {
    const pending = core.summarizeGuildPointHistory(h, {
      currentWeekStartAt: FIRST + 11 * WEEK,
      currentWeekPoints,
      forecastWeekCount: 2
    });
    assert.deepEqual(
      pending.forecastSamples.map((r) => r.earnedPoints),
      [10232, 10061]
    );
    assert.equal(pending.forecastPoints, 9890);
    assert.equal(pending.nextWeekForecastPoints, 9719);
  }
  h.manualWeeks = [{ weekStartAt: FIRST + 10 * WEEK, earnedPoints: 0 }];
  const overridden = core.summarizeGuildPointHistory(h, {
    currentWeekStartAt: FIRST + 11 * WEEK,
    currentWeekPoints: 10571,
    forecastWeekCount: 2
  });
  assert.deepEqual(
    overridden.forecastSamples.map((r) => r.earnedPoints),
    [0, 10571]
  );
  assert.equal(overridden.nextWeekForecastPoints, 21142);
});

test("回测不使用未来数据、当前周或自动补齐样本", () => {
  const h = history([100, 200, 300, 400, 500, 600]);
  const before = core.backtestGuildPointForecast(h);
  h.weeks.at(-1).earnedPoints = 999999;
  assert.deepEqual(core.backtestGuildPointForecast(h).predictions.slice(0, -1), before.predictions.slice(0, -1));
  h.weeks.at(-1).source = "estimated";
  assert.equal(core.backtestGuildPointForecast(h).metrics[0].count, 3);
  h.weeks[4].complete = false;
  assert.equal(core.backtestGuildPointForecast(h).metrics[0].count, 2);
  const bounded = core.summarizeGuildPointHistory(h, { currentWeekStartAt: FIRST + 3 * WEEK });
  assert.equal(bounded.forecastSampleCount, 3);
});

test("历史补齐不把未核实值当作已知总量，已确认冲突仍停止预测", () => {
  const h = history([99999], "tracked");
  const result = core.supplementGuildPointHistory(h, 3000, 1000, FIRST + 3 * WEEK, FIRST);
  assert.equal(result.status, "ok");
  assert.equal(result.forecastPoints, 1000);
  assert.equal(result.forecast.forecastMethod, "linear");
  h.manualWeeks = [{ weekStartAt: FIRST, earnedPoints: 99999 }];
  assert.equal(core.supplementGuildPointHistory(h, 3000, 1000, FIRST + 3 * WEEK, FIRST).forecastPoints, null);
  assert.equal(h.weeks[0].earnedPoints, 99999);
});

test("持久化保留104周与完整性标记，旧记录保留数值但不冒充核实记录", () => {
  const original = history(
    Array.from({ length: 30 }, (_, i) => i),
    "tracked"
  );
  original.weeks[0].coverage = "verified";
  const saved = storage.normalizeGuildPointHistory(original);
  assert.equal(saved.weeks.length, 30);
  assert.equal(saved.weeks[0].coverage, "verified");
  assert.equal(saved.weeks[1].coverage, "partial");
  assert.equal(saved.weeks[1].earnedPoints, 1);
  assert.deepEqual(storage.normalizeGuildPointHistory(saved), saved);
});

test("规划与ETA先用本周剩余再用下周产出，本周进度未知不能推测为零", () => {
  const options = { currentWeekRemaining: 2000 };
  assert.equal(core.calculateGuildPointPlanningBudget(1000, 10000, 1, options).budget, 3000);
  assert.equal(core.calculateGuildPointPlanningBudget(1000, 10000, 3, options).budget, 23000);
  assert.equal(core.estimateGuildConstructionWeeks(3000, 1000, 10000, options).weeks, 1);
  assert.equal(core.estimateGuildConstructionWeeks(13001, 1000, 10000, options).weeks, 3);
  assert.equal(core.calculateGuildPointPlanningBudget(1000, 10000, 2, { currentWeekRemaining: null }).budget, 1000);
  assert.equal(core.calculateGuildPointPlanningBudget(1000, null, 0, { currentWeekRemaining: null }).budget, 1000);
  assert.equal(core.estimateGuildConstructionWeeks(2000, 1000, 0, { currentWeekRemaining: 1000 }).weeks, 1);
  assert.equal(core.estimateGuildConstructionWeeks(2001, 1000, 0, { currentWeekRemaining: 1000 }).status, "no_growth");
});

test("CLI读取CSV明确来源，旧版完整周标签不当作完整采集证据", async () => {
  const { parseGuildPointHistory } = await import("../tools/backtest-guild-points.mjs");
  const csv =
    '\uFEFF"周","点数","来源"\r\n"2026-07-10T00:00:00Z","100","完整周"\r\n"2026-07-17T00:00:00Z","200","手动录入"\r\n"2026-07-24T00:00:00Z","300","已核实完整周"';
  const h = parseGuildPointHistory(csv, true);
  assert.equal(h.weeks[0].coverage, "partial");
  assert.equal(core.summarizeGuildPointHistory(h).forecastSampleCount, 3);
  assert.throws(() => parseGuildPointHistory('"unclosed', true), /引号/);
  assert.throws(() => parseGuildPointHistory(JSON.stringify({ weeks: [h.weeks[0], h.weeks[0]] })), /重复周/);
});

test("反转和下降序列仍使用线性回归，预测保持非负", () => {
  const result = core.summarizeGuildPointHistory(history([100, 200, 300, 400, 500, 0]));
  assert.equal(result.forecastMethod, "linear");
  assert.equal(result.forecastPoints, 300);
  const descending = core.summarizeGuildPointHistory(history([500, 400, 300, 200, 100, 0]));
  assert.equal(descending.forecastPoints, 0);
  assert.equal(descending.nextWeekForecastPoints, 0);
});

test("历史缺失周按全部实际周线性回填，保留时间间隔且不受未来预测窗口限制", () => {
  const h = {
    weeks: [
      { weekStartAt: FIRST + 3 * WEEK, earnedPoints: 400, complete: true, source: "tracked" },
      { weekStartAt: FIRST + 5 * WEEK, earnedPoints: 600, complete: true, source: "tracked" }
    ]
  };
  const before = JSON.stringify(h);
  const result = core.supplementGuildPointHistory(h, null, null, FIRST + 10 * WEEK, FIRST, { forecastWeekCount: 2 });
  assert.equal(result.estimationSampleCount, 2);
  assert.equal(result.estimatedCount, 8);
  assert.equal(result.forecastPoints, null);
  assert.deepEqual(
    result.history.weeks.map((r) => r.earnedPoints),
    [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000]
  );
  assert.ok(result.history.weeks.filter((r) => r.source === "estimated").every((r) => r.coverage === "partial"));
  assert.equal(result.history.weeks[3].source, "tracked");
  assert.equal(JSON.stringify(h), before);
  const again = core.supplementGuildPointHistory(result.history, null, null, FIRST + 10 * WEEK, FIRST, {
    forecastWeekCount: 2
  });
  assert.deepEqual(again.history, result.history);
  assert.equal(again.estimationSampleCount, 2);
});

test("已结束本周参与历史回归，旧平均估算被重算且不递归进入样本", () => {
  const h = {
    weeks: [
      { weekStartAt: FIRST, earnedPoints: 8659, complete: true, source: "estimated" },
      { weekStartAt: FIRST + 10 * WEEK, earnedPoints: 10061, complete: true, source: "tracked" },
      { weekStartAt: FIRST + 11 * WEEK, earnedPoints: 123, complete: false, source: "tracked" }
    ]
  };
  const result = core.supplementGuildPointHistory(h, 200000, 10571, FIRST + 11 * WEEK, FIRST, { forecastWeekCount: 2 });
  assert.equal(result.estimationSampleCount, 2);
  assert.equal(result.history.weeks.find((r) => r.weekStartAt === FIRST + 9 * WEEK).earnedPoints, 9551);
  assert.equal(result.history.weeks.find((r) => r.weekStartAt === FIRST + 8 * WEEK).earnedPoints, 9041);
  assert.equal(result.forecast.nextWeekForecastPoints, 11081);
  assert.equal(result.history.weeks.find((r) => r.weekStartAt === FIRST + 11 * WEEK).earnedPoints, 123);
  const again = core.supplementGuildPointHistory(result.history, 200000, 10571, FIRST + 11 * WEEK, FIRST);
  assert.equal(again.estimationSampleCount, 2);
  assert.deepEqual(again.history.weeks, result.history.weeks);
});

test("零或一个有效周保持空缺，旧估算清除，零追踪不作为第二个样本", () => {
  const h = {
    weeks: [
      { weekStartAt: FIRST, earnedPoints: 999, complete: true, source: "estimated" },
      { weekStartAt: FIRST + WEEK, earnedPoints: 0, complete: true, source: "tracked" },
      { weekStartAt: FIRST + 2 * WEEK, earnedPoints: 100, complete: true, source: "tracked" }
    ]
  };
  const result = core.supplementGuildPointHistory(h, 99999, 0, FIRST + 4 * WEEK, FIRST);
  assert.equal(result.estimationSampleCount, 1);
  assert.equal(result.estimatedCount, 0);
  assert.deepEqual(
    result.history.weeks.map((r) => r.earnedPoints),
    [0, 100]
  );
  assert.equal(h.weeks[0].earnedPoints, 999);
});

test("手动覆盖和真实零值保留，未来记录不用于回填，负外推截为零", () => {
  const h = {
    weeks: [
      { weekStartAt: FIRST + WEEK, earnedPoints: 50, complete: true, source: "tracked" },
      { weekStartAt: FIRST + 3 * WEEK, earnedPoints: 999999, complete: true, source: "manual" }
    ],
    manualWeeks: [
      { weekStartAt: FIRST + WEEK, earnedPoints: 0 },
      { weekStartAt: FIRST + 2 * WEEK, earnedPoints: 101 }
    ]
  };
  const result = core.supplementGuildPointHistory(h, null, 0, FIRST + 3 * WEEK, FIRST);
  assert.equal(result.estimationSampleCount, 2);
  assert.equal(result.history.weeks[0].earnedPoints, 0);
  assert.equal(result.history.weeks[0].source, "estimated");
  assert.equal(result.history.weeks[1].earnedPoints, 0);
  assert.equal(result.history.weeks[1].source, "manual");
  assert.equal(result.history.weeks[3].earnedPoints, 999999);
});
