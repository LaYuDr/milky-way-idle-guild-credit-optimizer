#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SCRIPT_PATH), "..");
const RELEASE_FILE_PATTERN = /^银河奶牛公会信用点性价比-v(\d+)\.(\d+)\.(\d+)\.user\.js$/;
const problems = [];

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function userscriptVersion(contents) {
  return /^\/\/ @version\s+(\d+\.\d+\.\d+)$/m.exec(contents)?.[1] || null;
}

function requireFile(relativePath) {
  if (!fs.existsSync(path.join(ROOT, relativePath))) problems.push("Missing required file: " + relativePath);
}

for (const file of [
  ".editorconfig",
  ".gitattributes",
  ".prettierignore",
  ".prettierrc.json",
  "eslint.config.mjs",
  "package-lock.json",
  "AGENTS.md",
  "docs/ARCHITECTURE.md",
  "docs/DEVELOPMENT.md",
  "docs/RELEASING.md",
  "references/README.md",
  "releases/README.md",
  "releases/manifest.json"
]) {
  requireFile(file);
}

const packageVersion = JSON.parse(read("package.json")).version;
if (!/^\d+\.\d+\.\d+$/.test(packageVersion)) problems.push("Invalid package version: " + packageVersion);

const currentBundle = "dist/milky-way-idle-guild-credit-optimizer.user.js";
const loaderBundle = "dist/milky-way-idle-guild-credit-dev-loader.user.js";
const runtimeBundle = "dist/runtime.js";
for (const file of [currentBundle, loaderBundle, runtimeBundle, "dist/test-harness.html"]) requireFile(file);

if (fs.existsSync(path.join(ROOT, currentBundle)) && userscriptVersion(read(currentBundle)) !== packageVersion) {
  problems.push(currentBundle + " does not contain package version " + packageVersion);
}
if (fs.existsSync(path.join(ROOT, loaderBundle)) && userscriptVersion(read(loaderBundle)) !== packageVersion) {
  problems.push(loaderBundle + " does not contain package version " + packageVersion);
}
if (
  fs.existsSync(path.join(ROOT, runtimeBundle)) &&
  !read(runtimeBundle).includes("window.MwiGuildCreditVersion = " + JSON.stringify(packageVersion) + ";")
) {
  problems.push(runtimeBundle + " does not contain package version " + packageVersion);
}

const distEntries = fs.readdirSync(path.join(ROOT, "dist"));
for (const name of distEntries) {
  if (RELEASE_FILE_PATTERN.test(name))
    problems.push("Historical release must not be stored directly in dist/: dist/" + name);
}
if (distEntries.includes("MWI 公会捐献性价比.js")) {
  problems.push("Third-party reference must not be stored in dist/: dist/MWI 公会捐献性价比.js");
}

const releaseVersions = new Set();
const releaseRecords = [];
const releasesRoot = path.join(ROOT, "releases");
if (fs.existsSync(releasesRoot)) {
  for (const directoryEntry of fs.readdirSync(releasesRoot, { withFileTypes: true })) {
    if (!directoryEntry.isDirectory()) continue;
    const directoryMatch = /^v(\d+)\.(\d+)$/.exec(directoryEntry.name);
    if (!directoryMatch) {
      problems.push("Invalid release series directory: releases/" + directoryEntry.name);
      continue;
    }
    const directory = path.join(releasesRoot, directoryEntry.name);
    for (const fileEntry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (!fileEntry.isFile()) {
        problems.push("Unexpected nested release entry: releases/" + directoryEntry.name + "/" + fileEntry.name);
        continue;
      }
      const versionMatch = RELEASE_FILE_PATTERN.exec(fileEntry.name);
      const relativePath = path.posix.join("releases", directoryEntry.name, fileEntry.name);
      if (!versionMatch) {
        problems.push("Invalid historical release filename: " + relativePath);
        continue;
      }
      const version = versionMatch[1] + "." + versionMatch[2] + "." + versionMatch[3];
      if (versionMatch[1] !== directoryMatch[1] || versionMatch[2] !== directoryMatch[2]) {
        problems.push("Release " + version + " is in the wrong series directory: " + relativePath);
      }
      if (releaseVersions.has(version)) problems.push("Duplicate historical release version: " + version);
      releaseVersions.add(version);
      if (userscriptVersion(read(relativePath)) !== version) {
        problems.push("Userscript header does not match archived version: " + relativePath);
      }
      const contents = fs.readFileSync(path.join(ROOT, relativePath));
      releaseRecords.push({
        version,
        path: relativePath,
        sizeBytes: contents.length,
        sha256: crypto.createHash("sha256").update(contents).digest("hex")
      });
    }
  }
}

releaseRecords.sort((left, right) => {
  const a = left.version.split(".").map(Number);
  const b = right.version.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
});
const manifestPath = path.join(ROOT, "releases", "manifest.json");
if (fs.existsSync(manifestPath)) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (manifest.schemaVersion !== 1) problems.push("Unsupported release manifest schema.");
  if (manifest.artifactType !== "tampermonkey-userscript") problems.push("Unexpected release manifest artifact type.");
  if (manifest.policy !== "append-only") problems.push("Release manifest must declare append-only policy.");
  if (JSON.stringify(manifest.releases) !== JSON.stringify(releaseRecords)) {
    problems.push("Release manifest does not match the archived files.");
  }
}

const tracked = execFileSync("git", ["-c", "core.fsmonitor=false", "ls-files", "-z"], {
  cwd: ROOT,
  encoding: "utf8"
})
  .split("\0")
  .filter(Boolean);
for (const file of tracked) {
  if (file === ".DS_Store" || file.endsWith("/.DS_Store")) problems.push("Finder metadata is tracked: " + file);
  if (file === ".workbench" || file.startsWith(".workbench/"))
    problems.push("Local workbench file is tracked: " + file);
  if (file.startsWith("references/local-plugins/")) problems.push("Local reference plugin is tracked: " + file);
  if (/\.(?:orig|rej)$/.test(file)) problems.push("Patch residue is tracked: " + file);
}

if (problems.length) {
  console.error("Repository verification failed:");
  for (const problem of problems) console.error("  - " + problem);
  process.exitCode = 1;
} else {
  console.log("Repository verification passed: " + releaseVersions.size + " immutable historical releases.");
}
