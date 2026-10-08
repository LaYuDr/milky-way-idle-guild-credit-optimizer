#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createDevServer } from "./dev-server.js";

// A fresh localhost context per case; no installed browser profile or game access.
execFileSync(process.execPath, [fileURLToPath(new URL("./build.js", import.meta.url))], {
  env: { ...process.env, MWI_ARCHIVE_RELEASE: "0" },
  stdio: "pipe"
});
const server = createDevServer({ build() {} });
await new Promise((resolve) => {
  server.listen(0, "127.0.0.1", resolve);
});
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const origin = `http://127.0.0.1:${server.address().port}`;
  for (const locale of ["zh", "en"])
    for (const width of [320, 900]) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      await context.route("**/*", (route) =>
        new URL(route.request().url()).origin === origin ? route.continue() : route.abort()
      );
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const base = `${origin}/test-harness.html?sidebarWidth=${width}&locale=${locale}`;
      const panel = page.locator("#mwi-credit-optimizer");
      const role = (name) => panel.locator(`[data-role="${name}"]`);
      const open = async () => {
        await page.locator("#test-exchange-modal").evaluate((node) => node.remove());
        await page.locator('#test-tabs [data-mwi-credit-tab="true"]').click();
        await panel.waitFor({ state: "visible" });
      };
      const click = async (selector) => panel.locator(selector).first().click();
      const readView = () =>
        page.evaluate(() => {
          const key = Object.keys(localStorage).find(
            (key) => key.startsWith("mwi-guild-trial-display-v1:") && key.endsWith(":view")
          );
          return JSON.parse(localStorage.getItem(key));
        });
      try {
        await page.goto(`${base}&trialHistoryAudit=1&resetState=1`);
        await page.waitForFunction(() => globalThis.document.body.dataset.trialHistoryAuditReady === "true", null, {
          timeout: 60000
        });
        const fixture = await page.evaluate(() => globalThis.__mwiTrialHistoryAuditReady);
        assert.ok(
          Object.values(fixture.checks).every((value) => value === true),
          "trial fixture setup"
        );
        // Subsequent loads do not run fixture actions or reset the saved state.
        await page.goto(base);
        await open();
        await role("view-trials").click();
        await click('[data-trial-mode="project"]');
        const choices = panel.locator('[data-trial-choice="project"]');
        await choices.nth(1).click();
        await click('[data-trial-sort="member"]');
        const simple = panel.locator("[data-trial-simple-names]");
        if ((await simple.getAttribute("aria-pressed")) !== "true") await simple.click();
        const screenshot = panel.locator("[data-trial-screenshot-mode]");
        if ((await screenshot.getAttribute("aria-pressed")) !== "true") await screenshot.click();
        if (!(await panel.locator(".mwi-trial-display-settings").evaluate((node) => node.open)))
          await panel.locator(".mwi-trial-display-settings > summary").click();
        const trialExpected = await readView();
        assert.equal(trialExpected.mode, "project");
        assert.ok(trialExpected.tableSorts.length);
        assert.equal(trialExpected.screenshotMode, true);
        assert.equal(trialExpected.simpleNames, true);
        await role("view-construction").click();
        const picker = role("toggle-building-picker");
        if ((await picker.getAttribute("aria-expanded")) !== "true") await picker.click();
        await role("building-tile").first().click();
        const step = role("toggle-building-steps").first();
        if ((await step.getAttribute("aria-expanded")) !== "true") await step.click();
        const buildingHrid = await step.getAttribute("data-building-hrid");
        await role("building-search").fill("persistent search");
        const history = panel.locator(".mwi-guild-point-history");
        if (!(await history.evaluate((node) => node.open))) await history.locator(":scope > summary").click();
        await role("view-upgrade").click();
        if (!(await panel.locator("[data-shrine-steps]").count())) await role("add-upgrade-plan").click();
        const steps = panel.locator("[data-shrine-steps]").first();
        if (!(await steps.evaluate((node) => node.open))) await steps.locator(":scope > summary").click();
        await role("toggle-settings").click();
        const help = panel.locator("[data-settings-help-topic]").first();
        if (!(await help.evaluate((node) => node.open))) await help.locator(":scope > summary").click();
        const topic = await help.getAttribute("data-settings-help-topic");
        await page.waitForFunction(
          (topic) => JSON.parse(localStorage.getItem("mwi-guild-credit-ui-state-v1")).openHelpTopics.includes(topic),
          topic
        );
        await page.reload();
        await open();
        assert.equal(await panel.getAttribute("data-settings-open"), "true");
        assert.ok(await panel.locator(`[data-settings-help-topic="${topic}"]`).evaluate((node) => node.open));
        await role("settings-close").click();
        assert.ok(
          await panel
            .locator("[data-shrine-steps]")
            .first()
            .evaluate((node) => node.open)
        );
        await role("view-construction").click();
        assert.equal(await role("building-search").inputValue(), "persistent search");
        assert.equal(await role("toggle-building-picker").getAttribute("aria-expanded"), "true");
        assert.equal(
          await panel
            .locator(`[data-role="toggle-building-steps"][data-building-hrid="${buildingHrid}"]`)
            .getAttribute("aria-expanded"),
          "true"
        );
        assert.ok(await panel.locator(".mwi-guild-point-history").evaluate((node) => node.open));
        await role("view-trials").click();
        assert.equal(await panel.locator('[data-trial-mode="project"]').getAttribute("aria-pressed"), "true");
        assert.equal(
          await panel.locator('[data-trial-choice="project"][aria-pressed="true"]').getAttribute("value"),
          trialExpected.selectedProject
        );
        assert.equal(await simple.getAttribute("aria-pressed"), "true");
        assert.equal(await screenshot.getAttribute("aria-pressed"), "true");
        assert.ok(await panel.locator(".mwi-trial-display-settings").evaluate((node) => node.open));
        assert.deepEqual((await readView()).tableSorts, trialExpected.tableSorts);
        // Restore a selected player and search without silently issuing a profile request.
        await screenshot.click();
        await click('[data-trial-mode="player"]');
        const playerPicker = panel.locator(".mwi-trial-player-picker");
        if (!(await playerPicker.evaluate((node) => node.open))) await playerPicker.locator(":scope > summary").click();
        await panel.locator("[data-trial-player-search]").fill("Alpha");
        await click('[data-trial-choice="player"]');
        const overview = panel.locator('[data-trial-profile-section="overview"]');
        if (await overview.evaluate((node) => node.open)) await overview.locator(":scope > summary").click();
        await page.waitForFunction(() => {
          const key = Object.keys(localStorage).find(
            (key) => key.endsWith(":view") && key.startsWith("mwi-guild-trial-display-v1:")
          );
          return JSON.parse(localStorage.getItem(key)).profileSectionsOpen.overview === false;
        });
        const playerExpected = await readView();
        assert.equal(playerExpected.playerSearch, "Alpha");
        await page.reload();
        await open();
        assert.equal(await panel.locator('[data-trial-mode="player"]').getAttribute("aria-pressed"), "true");
        assert.ok((await panel.locator("[data-trial-player-title]").textContent()).includes("Alpha"));
        assert.equal(await panel.locator("[data-trial-player-search]").inputValue(), "Alpha");
        assert.equal(await overview.evaluate((node) => node.open), false);
        assert.equal(await panel.locator("[data-trial-profile-refresh]").isDisabled(), false);
        assert.deepEqual((await readView()).selectedMember, playerExpected.selectedMember);
        assert.deepEqual(errors, []);
        console.log(
          `PASS persistence/${locale}/${width}: two reloads, navigation, sorts, searches, disclosures and plans`
        );
      } finally {
        await context.close();
      }
    }
} finally {
  await browser?.close();
  await new Promise((resolve) => {
    server.close(resolve);
  });
}
