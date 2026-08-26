"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

test("发布脚本按补丁版本递增并拒绝非法版本", async () => {
  const release = await import("../tools/release-current-version.mjs");
  assert.equal(release.bumpPatchVersion("1.1.28"), "1.1.29");
  assert.equal(release.compareSemver("1.2.0", "1.1.99") > 0, true);
  assert.throws(() => release.parseSemver("v1.1.28"), /X\.Y\.Z/);
});

test("发布脚本只允许当前版本归档并排除未跟踪工具草稿", async () => {
  const release = await import("../tools/release-current-version.mjs");
  assert.equal(release.isAllowedReleasePath("src/userscript.js", "1.1.29"), true);
  assert.equal(release.isAllowedReleasePath("eslint.config.mjs", "1.1.29"), true);
  assert.equal(release.isAllowedReleasePath(".prettierignore", "1.1.29"), true);
  assert.equal(release.isAllowedReleasePath(".prettierrc.json", "1.1.29"), true);
  assert.equal(release.isAllowedReleasePath("docs/NEW_PLUGIN_PROJECT_HANDOFF.md", "1.1.29"), true);
  assert.equal(release.releaseArchivePath("1.1.29"), "releases/v1.1/银河奶牛公会信用点性价比-v1.1.29.user.js");
  assert.equal(release.isAllowedReleasePath("releases/v1.1/银河奶牛公会信用点性价比-v1.1.29.user.js", "1.1.29"), true);
  assert.equal(release.isAllowedReleasePath("releases/v1.1/银河奶牛公会信用点性价比-v1.1.28.user.js", "1.1.29"), false);
  assert.equal(release.isAllowedReleasePath("dist/银河奶牛公会信用点性价比-v1.1.29.user.js", "1.1.29"), false);
  assert.equal(release.isAllowedReleasePath("dist/银河奶牛公会信用点性价比-v1.1.28.user.js", "1.1.29"), false);
  assert.equal(release.isAllowedReleasePath("tools/plan-width-preview.html", "1.1.29", false), false);
  assert.equal(release.isAllowedReleasePath("src/userscript.js.rej", "1.1.29", false), false);
  assert.equal(release.isAllowedReleasePath("src/userscript.js.orig", "1.1.29", false), false);
  assert.equal(release.isAllowedReleasePath("tools/dev-server.js", "1.1.29", true), true);
});

test("普通构建不写归档且正式发布只新增不可变归档", () => {
  const buildSource = fs.readFileSync(require.resolve("../tools/build.js"), "utf8");
  const releaseSource = fs.readFileSync(require.resolve("../tools/release-current-version.mjs"), "utf8");
  assert.match(buildSource, /MWI_ARCHIVE_RELEASE === "1"/);
  assert.match(buildSource, /Historical release archive is immutable/);
  assert.doesNotMatch(buildSource, /MWI_OVERWRITE_VERSIONED_ARCHIVE/);
  assert.match(releaseSource, /MWI_ARCHIVE_RELEASE: "1"/);
});
