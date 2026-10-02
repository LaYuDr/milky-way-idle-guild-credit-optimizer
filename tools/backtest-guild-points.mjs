#!/usr/bin/env node
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import core from "../src/core.js";

const WEEK = 7 * 24 * 60 * 60 * 1000;

// Accept the plugin's three-column CSV. Older "Complete week" rows do not prove coverage.
export function parseGuildPointHistory(text, csv = false) {
  let entries;
  if (csv) {
    const rows = [];
    let row = [],
      cell = "",
      quoted = false;
    const input = text.replace(/^\uFEFF/, "");
    for (let i = 0; i < input.length; i += 1) {
      const char = input[i];
      if (char === '"') {
        if (quoted && input[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = !quoted;
      } else if (!quoted && (char === "," || char === "\n" || char === "\r")) {
        row.push(cell);
        cell = "";
        if (char !== ",") {
          if (row.some(Boolean)) rows.push(row);
          row = [];
          if (char === "\r" && input[i + 1] === "\n") i += 1;
        }
      } else cell += char;
    }
    if (quoted) throw new Error("CSV 引号未闭合。");
    if (cell || row.length) {
      row.push(cell);
      rows.push(row);
    }
    entries = rows.slice(1).map(([date, points, status, ...extra]) => {
      if (extra.length || !date || !points?.trim() || !status) throw new Error("CSV 必须包含周起点、点数和来源三列。");
      const manual = ["手动录入", "Manual"].includes(status);
      const verified = manual || ["已核实完整周", "Verified complete week"].includes(status);
      return {
        weekStartAt: Date.parse(date),
        earnedPoints: Number(points),
        complete: true,
        source: manual ? "manual" : "tracked",
        coverage: verified ? "verified" : "partial"
      };
    });
  } else {
    const value = JSON.parse(text);
    const history = value.guildPointHistory || value;
    entries = Array.isArray(history) ? history : history.weeks;
    if (!Array.isArray(entries)) throw new Error("JSON 需要 weeks 数组或周记录数组。");
    const manual = Array.isArray(history.manualWeeks) ? history.manualWeeks : [];
    const starts = new Set(manual.map((record) => record.weekStartAt));
    entries = [
      ...entries.filter((record) => !starts.has(record.weekStartAt)),
      ...manual.map((record) => ({ ...record, source: "manual", complete: true, coverage: "verified" }))
    ];
  }
  if (entries.length > 104) throw new Error("最多接受 104 周记录。");
  const starts = new Set();
  for (const record of entries) {
    if (
      !Number.isSafeInteger(record.weekStartAt) ||
      record.weekStartAt <= 0 ||
      !Number.isSafeInteger(record.earnedPoints) ||
      record.earnedPoints < 0 ||
      starts.has(record.weekStartAt)
    )
      throw new Error("周记录包含无效日期、无效点数或重复周。");
    starts.add(record.weekStartAt);
  }
  return { weeks: entries };
}

export function demoHistories() {
  const series = {
    stable: [800, 820, 780, 800, 810, 790, 800, 820, 780, 800],
    growing: [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000],
    declining: [1000, 900, 800, 700, 600, 500, 400, 300, 200, 100],
    outlier: [800, 800, 800, 800, 2400, 800, 800, 800, 800, 800],
    zeroWeeks: [800, 800, 0, 800, 800, 0, 800, 800, 0, 800]
  };
  return Object.fromEntries(
    Object.entries(series).map(([name, points]) => [
      name,
      {
        weeks: points.map((earnedPoints, i) => ({
          weekStartAt: Date.UTC(2026, 6, 10) + i * WEEK,
          earnedPoints,
          complete: true,
          source: "manual"
        }))
      }
    ])
  );
}

function main(args) {
  const [file, rawLookback = "6", ...extra] = args;
  const lookback = Number(rawLookback);
  if (!file || extra.length || !Number.isInteger(lookback) || lookback < 2 || lookback > 12)
    throw new Error("用法：node tools/backtest-guild-points.mjs <历史.csv|历史.json|--demo> [回看周数2–12]");
  if (file === "--demo") {
    console.log(
      JSON.stringify(
        {
          evidence: "synthetic-only",
          results: Object.fromEntries(
            Object.entries(demoHistories()).map(([name, history]) => [
              name,
              core.backtestGuildPointForecast(history, { forecastWeekCount: lookback })
            ])
          )
        },
        null,
        2
      )
    );
    return;
  }
  if (fs.statSync(file).size > 10 * 1024 * 1024) throw new Error("输入文件超过 10 MB。");
  const history = parseGuildPointHistory(fs.readFileSync(file, "utf8"), /\.csv$/i.test(file));
  const result = core.backtestGuildPointForecast(history, { forecastWeekCount: lookback });
  console.log(
    JSON.stringify(
      {
        evidence: "provided-history",
        inputWeeks: history.weeks.length,
        note: "使用已核实周及非零追踪周，逐周向前回测；固定使用线性回归，其他方法仅作比较。保存后的手动更正无法还原当时已知的信息；结果不保证未来准确。",
        ...result
      },
      null,
      2
    )
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
