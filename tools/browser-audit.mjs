#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDevServer } from "./dev-server.js";
import { runSteps } from "./check.mjs";

const WIDTHS = [320, 360, 420, 460, 480, 520, 560, 610, 720, 900, 1200];
const SMALL = [320, 420, 610, 900];
const suite = (flag, widths = WIDTHS, english = [320, 610, 900]) => ({ flag, widths, english });
export const SUITES = {
  layout: suite("layoutAudit", WIDTHS, []),
  credit: suite("creditAudit", WIDTHS, [1200]),
  construction: suite("constructionAudit"),
  settings: suite("settingsAudit"),
  trials: suite("trialHistoryAudit"),
  "shrine-upgrade": suite("shrineUpgradeAudit"),
  "upgrade-empty": suite("upgradeEmptyAudit", SMALL, [320, 610]),
  "market-filter": suite("marketFilterAudit", SMALL, [320, 610]),
  "locale-race": suite("localeRaceAudit", SMALL, []),
  "sidebar-resize": suite("sidebarResizeAudit", SMALL, []),
  "sidebar-integration": suite("sidebarIntegrationAudit", SMALL, [320, 610]),
  "sidebar-startup": suite("sidebarStartupAudit", [420], []),
  "construction-snapshot": suite("constructionSnapshotAudit", [420], []),
  "token-guide": suite("tokenGuideAudit", [420], [])
};

export function auditPlan(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!["--suite", "--widths", "--locales", "--channel"].includes(key) || options[key] !== undefined) {
      throw new Error(`未知或重复参数：${key}`);
    }
    const value = argv[++index];
    if (!value || value.startsWith("--")) throw new Error(`参数缺少值：${key}`);
    options[key] = value;
  }
  if (!options["--suite"]) throw new Error("请指定 --suite；可选：" + Object.keys(SUITES).join(", ") + ", all");
  const names = options["--suite"] === "all" ? Object.keys(SUITES) : options["--suite"].split(",");
  if (names.some((name) => !Object.hasOwn(SUITES, name))) throw new Error("未知浏览器审计项目。");
  const widths = options["--widths"]?.split(",").map(Number);
  if (widths?.some((width) => !Number.isInteger(width) || width < 280 || width > 2400)) {
    throw new Error("宽度必须是 280～2400 的整数，用逗号分隔。");
  }
  const locales = options["--locales"]?.split(",");
  if (locales?.some((locale) => !["zh", "en"].includes(locale))) throw new Error("语言仅支持 zh,en。");
  const channel = options["--channel"] || "chromium";
  if (!["chromium", "chrome", "msedge"].includes(channel)) throw new Error("浏览器仅支持 chromium、chrome、msedge。");
  const cases = [];
  for (const name of new Set(names)) {
    const spec = SUITES[name];
    for (const locale of new Set(locales || ["zh", "en"])) {
      for (const width of new Set(widths || (locale === "en" ? spec.english : spec.widths))) {
        cases.push({ name, flag: spec.flag, locale, width });
      }
    }
  }
  if (!cases.length) throw new Error("所选条件没有审计案例；请明确指定宽度。");
  return { cases, channel, custom: Boolean(widths || locales) };
}

export function reportFailures(name, report) {
  const failures = [];
  const requireValue = (condition, label) => {
    if (!condition) failures.push(label);
  };
  const checkGroup = (group, label) => {
    requireValue(
      group && typeof group === "object" && !Array.isArray(group) && Object.keys(group).length > 0,
      `${label}: missing/empty`
    );
    for (const [key, value] of Object.entries(group || {})) requireValue(value === true, `${label}.${key}`);
  };
  const empty = (value, label) => requireValue(Array.isArray(value) && value.length === 0, label);
  if (!report || typeof report !== "object" || Array.isArray(report)) return ["missing report"];
  if (report.error) failures.push(`error: ${JSON.stringify(report.error)}`);
  if (name === "layout" || name === "construction") {
    requireValue(
      Number.isFinite(report.panel?.clientWidth) &&
        report.panel.clientWidth > 0 &&
        Number.isFinite(report.panel?.scrollWidth) &&
        report.panel.scrollWidth <= report.panel.clientWidth,
      "panel overflow/missing"
    );
    empty(report.controlOverlaps, "controlOverlaps");
    if (name === "layout") {
      empty(report.overflow, "overflow");
      empty(report.boundaryOverflow, "boundaryOverflow");
      requireValue(report.shrine?.count === 4, "shrine.count");
    } else {
      empty(report.horizontalOverflow, "horizontalOverflow");
      checkGroup(report.interactions?.checks, "interactions.checks");
      checkGroup(report.readability, "readability");
      for (const key of ["readableNames", "visibleLevels", "readableNextLevelCosts", "defaultZeroLabels"]) {
        requireValue(report.cards?.[key] === true, `cards.${key}`);
      }
      requireValue(report.catalog?.gameIconCount === 28, "catalog.gameIconCount");
      requireValue(
        report.catalog?.knownLevelCount === 3 && report.catalog?.unknownLevelCount === 25,
        "catalog.levelCounts"
      );
      requireValue(report.queue?.visibleStepCount === 0, "queue.visibleStepCount");
    }
  } else {
    checkGroup(report.checks, "checks");
    if (name === "shrine-upgrade") {
      empty(report.layout?.overflow, "layout.overflow");
      empty(report.layout?.boundaryOverflow, "layout.boundaryOverflow");
      empty(report.layout?.controlOverlaps, "layout.controlOverlaps");
      requireValue(report.layout?.panel?.scrollWidth <= report.layout?.panel?.clientWidth, "layout.panel overflow");
    }
    if (name === "settings") {
      empty(report.layout?.horizontalOverflow, "layout.horizontalOverflow");
      empty(report.layout?.boundaryOverflow, "layout.boundaryOverflow");
      empty(report.layout?.controlOverlaps, "layout.controlOverlaps");
      requireValue(report.layout?.rootOverflow === 0, "layout.rootOverflow");
    }
  }
  return failures;
}

export async function runAuditCase(browser, baseURL, entry, directory, timeout = 30000) {
  const id = `${entry.name}-${entry.locale}-${entry.width}`;
  const context = await browser.newContext({ viewport: { width: Math.max(1440, entry.width + 240), height: 1000 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const result = { ...entry, failures: [], report: null };
  try {
    // Fixture data stays in an ephemeral context; do not contact live game services.
    await context.route("**/*", (route) =>
      new URL(route.request().url()).origin === baseURL ? route.continue() : route.abort()
    );
    const url = new URL("/test-harness.html", baseURL);
    url.search = new URLSearchParams({
      [entry.flag]: "1",
      resetState: "1",
      sidebarWidth: String(entry.width),
      locale: entry.locale,
      auditPlans: "4"
    }).toString();
    await page.goto(url.href, { timeout, waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => Boolean(globalThis.document.querySelector("#layout-audit-output")?.textContent),
      null,
      {
        timeout
      }
    );
    result.report = JSON.parse(await page.locator("#layout-audit-output").textContent());
    result.failures = reportFailures(entry.name, result.report);
  } catch (error) {
    result.failures.push(error.message);
  } finally {
    result.failures.push(...pageErrors.map((message) => `pageerror: ${message}`));
    if (result.failures.length) {
      try {
        await page.screenshot({ path: path.join(directory, `${id}.png`), timeout: 5000 });
      } catch (error) {
        result.screenshotError = error.message;
      }
    }
    fs.writeFileSync(path.join(directory, `${id}.json`), JSON.stringify(result, null, 2) + "\n");
    await context.close();
  }
  return result;
}

async function main() {
  const plan = auditPlan(process.argv.slice(2));
  const build = runSteps(
    [{ name: "build", command: process.execPath, args: ["tools/build.js"], env: { MWI_ARCHIVE_RELEASE: "0" } }],
    { label: "browser" }
  );
  if (build.exitCode) return build.exitCode;
  const directory = build.directory;
  const server = createDevServer();
  let browser;
  const results = [];
  let runError = null;
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const baseURL = `http://127.0.0.1:${server.address().port}`;
    const { chromium } = await import("playwright");
    browser = await chromium.launch({
      headless: true,
      ...(plan.channel === "chromium" ? {} : { channel: plan.channel })
    });
    console.log(`${plan.custom ? "自定义子集（不代表完整矩阵）" : "所选项目的文档矩阵"}：${plan.cases.length} 项`);
    for (const entry of plan.cases) {
      const result = await runAuditCase(browser, baseURL, entry, directory);
      results.push(result);
      console.log(
        `${result.failures.length ? "FAIL" : "PASS"} ${entry.name}/${entry.locale}/${entry.width}${result.failures.length ? ": " + result.failures.join("; ").slice(0, 1200) : ""}`
      );
    }
    const failed = results.filter((result) => result.failures.length).length;
    console.log(`浏览器审计：${results.length - failed}/${results.length} 通过；报告／失败截图：${directory}`);
    return failed ? 1 : 0;
  } catch (error) {
    runError = error.stack || error.message;
    throw error;
  } finally {
    fs.writeFileSync(
      path.join(directory, "matrix.json"),
      JSON.stringify(
        {
          status:
            !runError && results.length === plan.cases.length && results.every((result) => !result.failures.length)
              ? "passed"
              : "failed",
          error: runError,
          plan,
          completed: results.length,
          results
        },
        null,
        2
      ) + "\n"
    );
    try {
      await browser?.close();
    } finally {
      await new Promise((resolve) => {
        server.close(resolve);
      });
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
