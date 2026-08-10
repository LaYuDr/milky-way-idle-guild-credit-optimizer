"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const projectRoot = path.resolve(__dirname, "..");

function runBuild(root, archive) {
  return spawnSync(process.execPath, ["tools/build.js"], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      MWI_VERSION: "9.9.9",
      MWI_ARCHIVE_RELEASE: archive ? "1" : "0"
    }
  });
}

test("构建只在正式发布时创建不可变历史归档", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mwi-build-archive-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));

  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.mkdirSync(path.join(root, "tools"), { recursive: true });
  fs.copyFileSync(path.join(projectRoot, "package.json"), path.join(root, "package.json"));
  fs.cpSync(path.join(projectRoot, "src"), path.join(root, "src"), { recursive: true });
  fs.copyFileSync(path.join(projectRoot, "tools", "build.js"), path.join(root, "tools", "build.js"));
  fs.copyFileSync(path.join(projectRoot, "tools", "test-harness.html"), path.join(root, "tools", "test-harness.html"));

  const normalBuild = runBuild(root, false);
  assert.equal(normalBuild.status, 0, normalBuild.stderr);
  assert.equal(fs.existsSync(path.join(root, "releases")), false);

  const firstReleaseBuild = runBuild(root, true);
  assert.equal(firstReleaseBuild.status, 0, firstReleaseBuild.stderr);
  const archive = path.join(root, "releases", "v9.9", "银河奶牛公会信用点性价比-v9.9.9.user.js");
  assert.equal(fs.existsSync(archive), true);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "releases", "manifest.json"), "utf8"));
  assert.equal(manifest.policy, "append-only");
  assert.deepEqual(
    manifest.releases.map((release) => release.version),
    ["9.9.9"]
  );
  assert.match(manifest.releases[0].sha256, /^[a-f0-9]{64}$/);

  const identicalReleaseBuild = runBuild(root, true);
  assert.equal(identicalReleaseBuild.status, 0, identicalReleaseBuild.stderr);

  fs.appendFileSync(path.join(root, "src", "core.js"), "\n// Immutable archive negative test.\n");
  const conflictingReleaseBuild = runBuild(root, true);
  assert.notEqual(conflictingReleaseBuild.status, 0);
  assert.match(conflictingReleaseBuild.stderr, /Historical release archive is immutable/);
});
