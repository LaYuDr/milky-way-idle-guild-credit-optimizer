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
    assert.equal(await tile.locator(".mwi-building-trial-badge").count(), 0);
    const label = await tile.getAttribute("aria-label");
    assert.match(label, /本周生活试炼|This week’s skilling trial/);
    assert.equal(await tile.getAttribute("title"), label);
    const style = await tile.evaluate((element) => ({
      border: globalThis.getComputedStyle(element).borderColor,
      shadow: globalThis.getComputedStyle(element).boxShadow,
      background: globalThis.getComputedStyle(element).backgroundColor,
      planned: element.dataset.planned
    }));
    assert.ok(style.shadow.includes("rgb(114, 184, 255)"));
    assert.ok(style.shadow.includes("inset"));
    if (style.planned === "true") {
      assert.equal(style.background, "rgb(41, 63, 65)");
      assert.equal(style.border, "rgb(82, 123, 115)");
    }
    const geometry = await tile.evaluate((element) => {
      const measure = () => {
        const rect = element.getBoundingClientRect();
        return [rect.x, rect.y, rect.width, rect.height];
      };
      const highlighted = measure();
      element.dataset.currentTrial = "false";
      const plain = measure();
      element.dataset.currentTrial = "true";
      return { highlighted, plain, rows: element.querySelector(".mwi-building-tile-copy").children.length };
    });
    assert.deepEqual(geometry.highlighted, geometry.plain, "Highlight must not change tile geometry");
    assert.equal(geometry.rows, 3, "No extra trial text row");
  }
  const iconSizes = await page.locator(".mwi-building-tile:not([hidden]) .mwi-building-icon").evaluateAll((icons) =>
    icons
      .filter((icon) => icon.getClientRects().length)
      .map((icon) => {
        const rect = icon.getBoundingClientRect();
        const svg = icon.querySelector("svg").getBoundingClientRect();
        return [rect.width, rect.height, svg.width, svg.height];
      })
  );
  assert.ok(iconSizes.length > 0);
  for (const size of iconSizes) assert.deepEqual(size, [30, 30, 30, 30]);
  const wood = page.locator('[data-role="building-tile"][data-building-hrid="/guild_buildings/log_shed"]');
  await wood.hover();
  assert.ok(
    await wood.evaluate((element) => globalThis.getComputedStyle(element).boxShadow.includes("rgb(114, 184, 255)"))
  );
  await page.keyboard.press("Tab");
  await wood.focus();
  const focusStyle = await wood.evaluate((element) => ({
    visible: element.matches(":focus-visible"),
    outline: globalThis.getComputedStyle(element).outlineStyle,
    shadow: globalThis.getComputedStyle(element).boxShadow
  }));
  assert.equal(focusStyle.visible, true);
  assert.notEqual(focusStyle.outline, "none");
  assert.ok(focusStyle.shadow.includes("rgb(114, 184, 255)"));
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
        [...grid.querySelectorAll(".mwi-building-tile")].some(
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
  assert.ok(
    await max.evaluate((element) => globalThis.getComputedStyle(element).boxShadow.includes("rgb(114, 184, 255)"))
  );
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
  await page.evaluate(() => {
    const bridge = globalThis.window.__mwiGuildCreditBridge;
    globalThis.window.__costPreviousLevels = bridge.guildBuildingLevels;
    bridge.guildBuildingLevels = {
      ...bridge.guildBuildingLevels,
      "/guild_buildings/builders_hall": { level: 19 },
      "/guild_buildings/archives": { level: 10 }
    };
    bridge.onGuildBuffLevelsUpdated?.();
    bridge.onTrialStatsUpdated();
  });
  await page.locator('[data-role="building-category"][data-category="all"]').click();
  await page.waitForFunction(
    () =>
      globalThis.document.querySelector(
        '[data-role="building-tile"][data-building-hrid="/guild_buildings/builders_hall"]'
      )?.dataset.currentLevel === "19"
  );
  for (const [building, amount] of [
    ["builders_hall", "299,450"],
    ["archives", "20,100"]
  ]) {
    const cost = page.locator(
      `[data-role="building-tile"][data-building-hrid="/guild_buildings/${building}"] .mwi-building-tile-cost`
    );
    assert.ok((await cost.textContent()).includes(amount));
    const geometry = await cost.evaluate((element) => {
      const range = globalThis.document.createRange();
      range.selectNodeContents(element);
      return {
        lines: range.getClientRects().length,
        width: element.clientWidth,
        textWidth: range.getBoundingClientRect().width,
        font: globalThis.getComputedStyle(element).fontSize,
        whiteSpace: globalThis.getComputedStyle(element).whiteSpace
      };
    });
    assert.equal(geometry.lines, 1, `${building}: full point amount and unit must stay on one line`);
    assert.ok(geometry.textWidth <= geometry.width + 1, `${building}: no clipping or overflow`);
    assert.equal(geometry.font, "12px");
    assert.equal(geometry.whiteSpace, "nowrap");
    assert.ok((await cost.getAttribute("title")).includes(amount));
  }
  await page.screenshot({ path: screenshotPath.replace(/\.png$/, "-large-cost.png") });
  await page.evaluate(() => {
    const bridge = globalThis.window.__mwiGuildCreditBridge;
    bridge.guildBuildingLevels = globalThis.window.__costPreviousLevels;
    bridge.onGuildBuffLevelsUpdated?.();
    bridge.onTrialStatsUpdated();
  });
  return {
    largeCostsSingleLine: true,
    fourProjectsMapped: true,
    registrationLineup: true,
    fallbackParties: true,
    accessibleTrialLabel: true,
    blueInsetOutline: true,
    hoverAndKeyboardFocus: true,
    highlightGeometryUnchanged: true,
    uniformCatalogIcons: true,
    plannedColorKept: true,
    noOverflow: true,
    staleAndGuildChangesClear: true,
    maxAndUnknownLevelMarked: true,
    plansUnchanged: true
  };
}
