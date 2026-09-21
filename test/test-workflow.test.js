"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

test("快速检查拒绝空范围、参数注入和不存在的测试；完整门禁保留所有阶段", async () => {
  const { checkPlan } = await import("../tools/check.mjs");
  assert.throws(() => checkPlan(["quick"]), /明确指定/);
  assert.throws(() => checkPlan(["quick", "--test-name-pattern=skip"]), /有效/);
  assert.throws(() => checkPlan(["quick", "test/../src/core.js"]), /有效/);
  assert.throws(() => checkPlan(["quick", "test/not-a-real-file.test.js"]));
  assert.throws(() => checkPlan(["full", "test/core.test.js"]), /只有 quick/);
  const quick = checkPlan(["quick", "test/core.test.js", "test/core.test.js"]);
  assert.deepEqual(
    quick.steps.map((step) => step.name),
    ["format:check", "lint", "test"]
  );
  assert.deepEqual(quick.steps[2].args, ["--test", "--test-reporter=tap", "test/core.test.js"]);
  const full = ["format:check", "lint", "test", "build", "verify:repo"];
  assert.deepEqual(
    checkPlan(["full"]).steps.map((step) => step.name),
    full
  );
  assert.deepEqual(
    checkPlan(["handoff"]).steps.map((step) => step.name),
    [...full, "diff-check", "release:dry-run"]
  );
  assert.deepEqual(checkPlan(["ci"]).steps.at(-1).args, ["diff", "--exit-code"]);
});

test("检查运行器保留大日志和退出码，失败后不执行后续命令", async (t) => {
  const { runSteps } = await import("../tools/check.mjs");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mwi-check-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const output = [];
  const result = runSteps(
    [
      {
        name: "large",
        command: process.execPath,
        args: [
          "-e",
          'process.stdout.write("x".repeat(2_000_000)); process.stderr.write("failure-marker"); process.exitCode = 7;'
        ]
      },
      {
        name: "never",
        command: process.execPath,
        args: ["-e", 'require("node:fs").writeFileSync("should-not-exist", "bad");']
      }
    ],
    { root, print: (line) => output.push(line) }
  );
  assert.equal(result.exitCode, 7);
  assert.equal(result.results.length, 1);
  assert.equal(fs.existsSync(path.join(root, "should-not-exist")), false);
  const log = fs.readFileSync(result.results[0].log, "utf8");
  assert.equal(log.length, 2_000_014);
  assert.ok(log.endsWith("failure-marker"));
  assert.ok(output.join("\n").length < 8000);
  assert.match(output.join("\n"), /failure-marker/);
  const summary = JSON.parse(fs.readFileSync(path.join(result.directory, "summary.json"), "utf8"));
  assert.equal(summary.planned, 2);
  assert.equal(summary.completed, 1);
});

test("检查运行器将启动失败和超时视为失败，成功保留环境和摘要", async (t) => {
  const { runSteps } = await import("../tools/check.mjs");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mwi-check-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const options = { root, print: () => {} };
  const missing = runSteps([{ name: "missing", command: path.join(root, "missing-command"), args: [] }], options);
  assert.notEqual(missing.exitCode, 0);
  const timeout = runSteps(
    [{ name: "timeout", command: process.execPath, args: ["-e", "setInterval(() => {}, 1000)"], timeout: 100 }],
    options
  );
  assert.notEqual(timeout.exitCode, 0);
  const passed = runSteps(
    [
      {
        name: "env",
        command: process.execPath,
        args: ["-e", "console.log(process.env.MWI_ARCHIVE_RELEASE);"],
        env: { MWI_ARCHIVE_RELEASE: "1" }
      }
    ],
    options
  );
  assert.equal(passed.exitCode, 0);
  assert.equal(fs.readFileSync(passed.results[0].log, "utf8").trim(), "1");
  assert.notEqual(missing.directory, passed.directory);
});

test("浏览器矩阵保留文档宽度和语言组合，明确标记自定义子集", async () => {
  const { auditPlan } = await import("../tools/browser-audit.mjs");
  assert.throws(() => auditPlan([]), /指定/);
  assert.throws(() => auditPlan(["--suite", "unknown"]), /未知/);
  assert.throws(() => auditPlan(["--suite", "trials", "--widths", "320,no"]), /宽度/);
  assert.throws(() => auditPlan(["--suite", "trials", "--locales", "fr"]), /语言/);
  assert.throws(() => auditPlan(["--suite", "layout", "--locales", "en"]), /没有审计/);
  assert.throws(() => auditPlan(["--suite", "trials", "--channel"]), /缺少/);
  const full = auditPlan(["--suite", "trials"]);
  assert.equal(full.custom, false);
  assert.equal(full.cases.length, 14);
  assert.deepEqual(
    full.cases.filter((entry) => entry.locale === "en").map((entry) => entry.width),
    [320, 610, 900]
  );
  const subset = auditPlan(["--suite", "trials,settings", "--widths", "420", "--locales", "zh"]);
  assert.equal(subset.custom, true);
  assert.equal(subset.cases.length, 2);
});

test("浏览器报告拒绝空检查、非布尔真值、初始化错误、溢出和嵌套检查失败", async () => {
  const { reportFailures } = await import("../tools/browser-audit.mjs");
  for (const report of [
    null,
    {},
    { checks: {} },
    { checks: { ready: "true" } },
    { checks: { ready: false } },
    { error: "failed", checks: { ready: true } }
  ]) {
    assert.ok(reportFailures("trials", report).length > 0);
  }
  assert.deepEqual(reportFailures("trials", { checks: { ready: true } }), []);
  const layout = {
    panel: { clientWidth: 400, scrollWidth: 400 },
    overflow: [],
    boundaryOverflow: [],
    controlOverlaps: [],
    shrine: { count: 4 }
  };
  assert.deepEqual(reportFailures("layout", layout), []);
  assert.ok(reportFailures("layout", { ...layout, panel: { clientWidth: 400, scrollWidth: 420 } }).length);
  assert.ok(reportFailures("layout", { ...layout, boundaryOverflow: ["clipped"] }).length);
  const settings = {
    checks: { ready: true },
    layout: { rootOverflow: 0, horizontalOverflow: [], boundaryOverflow: [], controlOverlaps: ["overlap"] }
  };
  assert.ok(reportFailures("settings", settings).includes("layout.controlOverlaps"));
  const construction = {
    panel: layout.panel,
    controlOverlaps: [],
    horizontalOverflow: [],
    interactions: { checks: { drag: false } },
    readability: { primary: true },
    cards: { readableNames: true, visibleLevels: true, readableNextLevelCosts: true, defaultZeroLabels: true },
    catalog: { gameIconCount: 28, knownLevelCount: 3, unknownLevelCount: 25 },
    queue: { visibleStepCount: 0 }
  };
  assert.deepEqual(reportFailures("construction", construction), ["interactions.checks.drag"]);
});
