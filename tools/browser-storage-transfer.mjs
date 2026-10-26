import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

// All operations run against localhost in the caller's ephemeral browser context.
export async function auditStorageTransfer(page, screenshotPath) {
  await page.locator('[data-mwi-credit-tab="true"]').first().click();
  await page.locator('[data-role="toggle-settings"]').click();
  await page.locator("[data-cache-transfer]").waitFor({ state: "visible" });
  const action = (name) => page.locator(`[data-cache-action="${name}"]`);
  const status = page.locator("[data-cache-status]");
  const seed = await page.evaluate(() => {
    const planner = `mwi-guild-building-planner-v1:${globalThis.location.hostname}:cache-audit`;
    const history = `mwi-guild-trial-history-v1:${planner}:`;
    const keys = {
      game: history + "game-record",
      manual: history + "manual-record",
      damaged: history + "damaged",
      recovery: `mwi-guild-trial-recovery-v1:${planner}:original:uuid`,
      otherCharacter: `mwi-guild-building-planner-v1:${globalThis.location.hostname}:98765`
    };
    const values = {
      [keys.game]: JSON.stringify({ schemaVersion: 1, source: "game", future: "原始采集🐄".repeat(1000) }),
      [keys.manual]: JSON.stringify({ schemaVersion: 2, source: "manual", unknown: null, exact: 9007199254740991 }),
      [keys.damaged]: "MWIGC:1:invalid",
      [keys.recovery]: "original-diagnostic-bytes",
      [keys.otherCharacter]: '{"showZero":false,"zero":0,"future":null}'
    };
    for (const [key, value] of Object.entries(values)) globalThis.localStorage.setItem(key, value);
    globalThis.localStorage.setItem("__cache_game_data", "game-unchanged");
    globalThis.localStorage.setItem("mwi-layu:cache-audit", "other-plugin-unchanged");
    globalThis.window.__cacheOldWriter = globalThis.window.MwiGuildStorageCodec.createStorage(globalThis.localStorage);
    return { keys, values };
  });
  const snapshot = () =>
    page.evaluate(
      () =>
        globalThis.window.MwiGuildStorageTransfer.create({
          storage: globalThis.localStorage,
          origin: globalThis.location.origin,
          version: "1.2.67"
        }).snapshot().entries
    );
  const file = (data) => ({
    name: "full-backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(typeof data === "string" ? data : JSON.stringify(data))
  });
  async function download(name) {
    const waiting = page.waitForEvent("download");
    await action(name).click();
    const result = await waiting;
    assert.equal(await result.failure(), null);
    return JSON.parse(await fs.readFile(await result.path(), "utf8"));
  }
  async function choose(mode, backup) {
    await page.locator(`[data-cache-file="${mode}"]`).setInputFiles(file(backup));
    await page.waitForFunction(
      () => globalThis.document.querySelector("[data-cache-transfer]")?.getAttribute("aria-busy") === "false"
    );
  }
  async function reloadSettings() {
    await page.reload();
    await page.locator('[data-mwi-credit-tab="true"]').first().click();
    const settings = page.locator('[data-role="settings-panel"]');
    if (!(await settings.isVisible())) await page.locator('[data-role="toggle-settings"]').click();
    await page.locator("[data-cache-transfer]").waitFor({ state: "visible" });
  }
  async function layout() {
    const overflowing = await page.locator("[data-cache-transfer]").evaluate((host) => {
      const bounds = host.getBoundingClientRect();
      return [host, ...host.querySelectorAll("p, input, button, ul, li")]
        .filter((element) => element.checkVisibility())
        .filter(
          (element) =>
            element.getBoundingClientRect().right > bounds.right + 1 || element.scrollWidth > element.clientWidth + 1
        )
        .map((element) => element.tagName + ":" + element.textContent.slice(0, 60));
    });
    assert.deepEqual(overflowing, [], "transfer controls must fit the sidebar");
  }
  const checks = {};
  const only = await download("export");
  assert.equal(only.format, "mwi-guild-local-backup");
  for (const [key, rawValue] of Object.entries(seed.values))
    assert.equal(only.entries.find((entry) => entry.key === key)?.rawValue, rawValue);
  assert.ok(!only.entries.some((entry) => entry.key === "__cache_game_data" || entry.key === "mwi-layu:cache-audit"));
  checks.completeExport = true;

  const initial = await snapshot();
  const cancelled = await download("export-clear");
  assert.equal(await action("commit").isEnabled(), false);
  await choose("verify", { ...cancelled, entries: [] });
  assert.equal(await action("commit").isEnabled(), false);
  assert.deepEqual(await snapshot(), initial);
  await action("cancel").click();
  assert.deepEqual(await snapshot(), initial);
  checks.noDeleteBeforeVerifiedConfirmation = true;

  for (const invalid of [
    "invalid JSON",
    { ...only, origin: "https://wrong-region.invalid" },
    { ...only, entries: [{ key: "initClientData", rawValue: "forbidden" }] }
  ]) {
    await choose("import", invalid);
    assert.equal(await page.locator("[data-cache-preview]").count(), 0);
    assert.deepEqual(await snapshot(), initial);
  }
  checks.invalidFilesLeaveDataIntact = true;
  await page.evaluate(() => {
    globalThis.window.__cacheCreateURL = globalThis.URL.createObjectURL;
    globalThis.URL.createObjectURL = () => {
      throw new Error("download blocked");
    };
  });
  await action("export-clear").click();
  assert.equal(await page.locator('[data-cache-file="verify"]').count(), 0);
  assert.deepEqual(await snapshot(), initial);
  await page.evaluate(() => {
    globalThis.URL.createObjectURL = globalThis.window.__cacheCreateURL;
  });
  checks.failedDownloadDoesNotClear = true;

  const stale = await download("export-clear");
  await choose("verify", stale);
  assert.equal(await action("commit").isEnabled(), true);
  await page.evaluate((key) => globalThis.localStorage.setItem(key, "concurrent-new-value"), seed.keys.recovery);
  await action("commit").click();
  assert.equal(await page.locator('[data-cache-file="verify"]').count(), 0);
  assert.equal(
    await page.evaluate((key) => globalThis.localStorage.getItem(key), seed.keys.recovery),
    "concurrent-new-value"
  );
  await page.evaluate(({ key, value }) => globalThis.localStorage.setItem(key, value), {
    key: seed.keys.recovery,
    value: seed.values[seed.keys.recovery]
  });
  checks.changedDataStopsClear = true;

  const saved = await download("export-clear");
  await choose("verify", saved);
  await layout();
  await page.screenshot({ path: screenshotPath });
  await action("commit").click();
  assert.deepEqual(await snapshot(), []);
  assert.equal(await action("reload").isVisible(), true);
  const preserved = await page.evaluate(() => {
    let blocked = false;
    try {
      globalThis.window.__cacheOldWriter.setItem("mwi-credit-price-reference", "stale");
    } catch {
      blocked = true;
    }
    return {
      blocked,
      game: globalThis.localStorage.getItem("__cache_game_data"),
      other: globalThis.localStorage.getItem("mwi-layu:cache-audit")
    };
  });
  assert.deepEqual(preserved, { blocked: true, game: "game-unchanged", other: "other-plugin-unchanged" });
  checks.clearAndNoResurrection = true;

  await reloadSettings();
  await page.evaluate((key) => globalThis.localStorage.setItem(key, "new-existing-conflict"), seed.keys.recovery);
  await choose("import", saved);
  assert.equal(await page.locator("[data-cache-overwrite]").isChecked(), false);
  await layout();
  await page.screenshot({ path: screenshotPath.replace(/\.png$/, "-import.png") });
  await action("import").click();
  assert.equal(await action("reload").isVisible(), true);
  assert.equal(
    await page.evaluate((key) => globalThis.localStorage.getItem(key), seed.keys.recovery),
    "new-existing-conflict"
  );
  for (const key of [seed.keys.game, seed.keys.manual, seed.keys.damaged, seed.keys.otherCharacter])
    assert.equal(await page.evaluate((key) => globalThis.localStorage.getItem(key), key), seed.values[key]);
  checks.importMissingPreservesConflictsAndProvenance = true;

  await reloadSettings();
  await choose("import", saved);
  await page.locator("[data-cache-overwrite]").check();
  const beforeOverwrite = await download("import");
  assert.equal(
    beforeOverwrite.entries.find((entry) => entry.key === seed.keys.recovery)?.rawValue,
    "new-existing-conflict"
  );
  assert.equal(await action("commit").isEnabled(), false);
  await choose("verify", beforeOverwrite);
  await action("commit").click();
  assert.equal(
    await page.evaluate((key) => globalThis.localStorage.getItem(key), seed.keys.recovery),
    seed.values[seed.keys.recovery]
  );
  assert.ok((await status.textContent()).trim());
  checks.overwriteRequiresVerifiedCurrentBackup = true;
  await reloadSettings();
  for (const [key, rawValue] of Object.entries(seed.values))
    assert.equal(await page.evaluate((key) => globalThis.localStorage.getItem(key), key), rawValue);
  await layout();
  checks.reloadKeepsRestoredRawData = true;
  return { checks, backupEntries: saved.entries.length, screenshot: path.basename(screenshotPath) };
}
