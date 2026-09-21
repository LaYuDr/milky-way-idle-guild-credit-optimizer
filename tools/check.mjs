#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

export function checkPlan(argv, root = ROOT) {
  const [mode = "full", ...files] = argv;
  if (!["full", "quick", "ci", "handoff"].includes(mode)) throw new Error(`未知检查模式：${mode}`);
  if (mode !== "quick" && files.length) throw new Error("只有 quick 模式接受测试文件参数。");
  if (mode === "quick" && !files.length)
    throw new Error("请明确指定测试文件，例如：npm run check:quick -- test/core.test.js");
  for (const file of files) {
    if (!/^test\/[\w-]+\.test\.js$/.test(file) || !fs.statSync(path.join(root, file)).isFile()) {
      throw new Error(`不是有效的项目测试文件：${file}`);
    }
  }
  const script = (name) => ({ name, command: npm, args: ["run", "--silent", name] });
  const steps = [script("format:check"), script("lint")];
  steps.push(
    mode === "quick"
      ? { name: "test", command: process.execPath, args: ["--test", "--test-reporter=tap", ...new Set(files)] }
      : script("test")
  );
  if (mode !== "quick") steps.push(script("build"), script("verify:repo"));
  if (mode === "ci") steps.push({ name: "clean-diff", command: "git", args: ["diff", "--exit-code"] });
  if (mode === "handoff") {
    steps.push({ name: "diff-check", command: "git", args: ["diff", "--check"] }, script("release:dry-run"));
  }
  return { mode, steps };
}

function logTail(file, maxBytes = 6000) {
  const size = fs.statSync(file).size;
  const buffer = Buffer.alloc(Math.min(size, maxBytes));
  const fd = fs.openSync(file, "r");
  try {
    fs.readSync(fd, buffer, 0, buffer.length, size - buffer.length);
  } finally {
    fs.closeSync(fd);
  }
  return (size > maxBytes ? "…日志已截短，完整内容见日志文件。\n" : "") + buffer.toString("utf8");
}

// Redirect directly to disk: verbose output cannot exhaust a pipe buffer or flood the model context.
export function runSteps(steps, { root = ROOT, label = "check", print = console.log } = {}) {
  const workbench = path.join(root, ".workbench");
  fs.mkdirSync(workbench, { recursive: true });
  const directory = fs.mkdtempSync(path.join(workbench, `${label}-`));
  const results = [];
  let exitCode = 0;
  print(`日志：${directory}`);
  for (const [index, step] of steps.entries()) {
    const log = path.join(directory, `${index + 1}-${step.name}.log`);
    const fd = fs.openSync(log, "w");
    const started = Date.now();
    print(`[${index + 1}/${steps.length}] ${step.name}…`);
    let result;
    try {
      result = spawnSync(step.command, step.args, {
        cwd: root,
        env: { ...process.env, ...step.env },
        stdio: ["ignore", fd, fd],
        timeout: step.timeout ?? 10 * 60 * 1000,
        windowsHide: true
      });
    } finally {
      fs.closeSync(fd);
    }
    exitCode = result.error || result.signal ? 1 : (result.status ?? 1);
    const record = {
      name: step.name,
      exitCode,
      signal: result.signal,
      error: result.error?.message,
      durationMs: Date.now() - started,
      log
    };
    results.push(record);
    const tail = logTail(log);
    const counts = step.name === "test" ? tail.match(/^# (?:tests|pass|fail|skipped|cancelled) \d+$/gm) : null;
    print(
      `${exitCode ? "FAIL" : "PASS"} ${step.name} (${record.durationMs}ms)${counts ? " · " + counts.join("; ") : ""}`
    );
    if (exitCode) {
      print([record.error, record.signal && `signal: ${record.signal}`, tail].filter(Boolean).join("\n"));
      break;
    }
  }
  fs.writeFileSync(
    path.join(directory, "summary.json"),
    JSON.stringify({ exitCode, planned: steps.length, completed: results.length, results }, null, 2) + "\n"
  );
  print(
    `${exitCode ? "检查失败，后续步骤未执行" : "检查通过"}：${results.length}/${steps.length}；完整日志：${directory}`
  );
  return { exitCode, directory, results };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { mode, steps } = checkPlan(process.argv.slice(2));
    if (mode === "quick") console.log("快速检查：只覆盖指定测试；不替代交付／发布前完整检查。");
    process.exitCode = runSteps(steps).exitCode;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
