import assert from "node:assert/strict";

export async function auditConstructionTrials(page, screenshotPath) {
  const tiles = page.locator('[data-role="building-tile"][data-current-trial="true"]');
  const marked = async () =>
    (
      await tiles.evaluateAll((elements) => elements.map((element) => element.dataset.buildingHrid.split("/").pop()))
    ).sort();
  const plans = () =>
    page.evaluate(
      () =>
        JSON.parse(
          globalThis.localStorage.getItem(`mwi-guild-building-planner-v1:${globalThis.location.hostname}:default`) ||
            "{}"
        ).plans
    );
  const original = await plans();
  const beforeContext = await page.evaluate(() => globalThis.window.__mwiGuildCreditBridge.trialHistoryContext);
  const send = async (skills, options = {}) => {
    await page.evaluate(
      ({ skills, options }) => {
        const bridge = globalThis.window.__mwiGuildCreditBridge;
        const first = globalThis.window.MwiGuildCreditConfig.GUILD_TRIAL_FIRST_START_AT;
        const weekMs = 604800000;
        const week = first + Math.floor((Date.now() - first) / weekMs) * weekMs;
        bridge.trialHistoryContext = {
          guild: {
            id: options.wrongGuild ? "different-guild" : bridge.guildPointSummary?.guildId || "fixture-guild",
            currentWeekStartAt: week + (options.stale ? -weekMs : 0),
            currentTrialsData: options.fallback
              ? { skilling: { parties: Object.fromEntries(skills.map((key) => [key, { done: false }])) } }
              : null
          },
          weeklyTrialSet:
            options.fallback || options.missing ? null : { skillHrids: skills, combatHrids: ["/guild_combat/badger"] }
        };
        if (options.missing) bridge.trialHistoryContext = {};
        bridge.onTrialStatsUpdated();
      },
      { skills, options }
    );
  };
  async function expect(names) {
    await page.waitForFunction(
      (expected) => {
        const actual = [
          ...globalThis.document.querySelectorAll('[data-role="building-tile"][data-current-trial="true"]')
        ]
          .map((element) => element.dataset.buildingHrid.split("/").pop())
          .sort();
        return JSON.stringify(actual) === JSON.stringify(expected);
      },
      [...names].sort()
    );
    assert.deepEqual(await marked(), [...names].sort());
  }
  const four = ["woodcutting", "tailoring", "brewing", "alchemy"].map((skill) => `/guild_skilling/${skill}`);
  await send(four);
  await expect(["log_shed", "sewing_parlor", "brewery", "laboratory"]);
  await page.locator('[data-role="building-category"][data-category="life"]').click();
  for (const name of ["log_shed", "sewing_parlor", "brewery", "laboratory"]) {
    const tile = page.locator(`[data-role="building-tile"][data-building-hrid="/guild_buildings/${name}"]`);
    assert.equal(await tile.locator(".mwi-building-trial-badge").isVisible(), true);
    assert.ok(
      (await tile.getAttribute("aria-label")).includes(await tile.locator(".mwi-building-trial-badge").textContent())
    );
    const style = await tile.evaluate((element) => ({
      border: globalThis.getComputedStyle(element).borderColor,
      background: globalThis.getComputedStyle(element).backgroundColor,
      planned: element.dataset.planned
    }));
    assert.equal(style.border, "rgb(214, 171, 86)");
    if (style.planned === "true") assert.equal(style.background, "rgb(41, 63, 65)");
  }
  const wood = page.locator('[data-role="building-tile"][data-building-hrid="/guild_buildings/log_shed"]');
  await wood.click();
  await page.waitForFunction(
    () =>
      globalThis.document.querySelector('[data-role="building-tile"][data-building-hrid="/guild_buildings/log_shed"]')
        ?.dataset.planned === "true"
  );
  assert.equal(await wood.getAttribute("data-current-trial"), "true");
  assert.equal(
    await wood.evaluate((element) => globalThis.getComputedStyle(element).backgroundColor),
    "rgb(41, 63, 65)"
  );
  assert.ok(
    await page.locator('[data-role="building-tile"][data-current-trial="true"][data-level-known="false"]').count()
  );
  const overflow = await page
    .locator(".mwi-building-grid")
    .evaluate(
      (grid) =>
        grid.scrollWidth > grid.clientWidth + 1 ||
        [...grid.querySelectorAll(".mwi-building-tile, .mwi-building-trial-badge")].some(
          (element) => element.scrollWidth > element.clientWidth + 1
        )
    );
  assert.equal(overflow, false);
  await page.screenshot({ path: screenshotPath });
  await page.locator('[data-role="remove-building-plan"][data-building-hrid="/guild_buildings/log_shed"]').click();
  assert.deepEqual(await plans(), original);
  await page.evaluate(() => {
    const bridge = globalThis.window.__mwiGuildCreditBridge;
    globalThis.window.__trialBuildingPreviousLevels = bridge.guildBuildingLevels;
    bridge.guildBuildingLevels = { ...bridge.guildBuildingLevels, "/guild_buildings/observatory": { level: 20 } };
    bridge.onGuildBuffLevelsUpdated?.();
  });
  await send(["/guild_skilling/enhancing"]);
  await expect(["observatory"]);
  const max = page.locator('[data-role="building-tile"][data-building-hrid="/guild_buildings/observatory"]');
  assert.equal(await max.getAttribute("data-current-level"), "20");
  assert.equal(await max.isDisabled(), true);
  assert.equal(await max.locator(".mwi-building-trial-badge").count(), 1);
  await page.evaluate(() => {
    const bridge = globalThis.window.__mwiGuildCreditBridge;
    bridge.guildBuildingLevels = globalThis.window.__trialBuildingPreviousLevels;
    bridge.onGuildBuffLevelsUpdated?.();
  });
  await send(["/guild_skilling/milking"], { fallback: true });
  await expect(["dairy_barn"]);
  for (const options of [{ stale: true }, { wrongGuild: true }, { missing: true }]) {
    await send(four, options);
    await expect([]);
  }
  assert.deepEqual(await plans(), original, "Highlighting must not add or change construction plans");
  await page.evaluate((context) => {
    const bridge = globalThis.window.__mwiGuildCreditBridge;
    bridge.trialHistoryContext = context;
    bridge.onTrialStatsUpdated();
  }, beforeContext);
  return {
    fourProjectsMapped: true,
    registrationLineup: true,
    fallbackParties: true,
    accessibleBadge: true,
    plannedColorKept: true,
    noOverflow: true,
    staleAndGuildChangesClear: true,
    maxAndUnknownLevelMarked: true,
    plansUnchanged: true
  };
}
