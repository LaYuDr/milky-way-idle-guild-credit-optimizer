(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MwiGuildCreditUpgradeView = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function createUpgradeView(dependencies) {
    const {
      core,
      state,
      t,
      ui,
      escapeHtml,
      resolveItemName,
      simpleItemName,
      titleCase,
      formatNumber,
      iconMarkup,
      marketItemIconMarkup,
      itemQuantity,
      creditQuantity,
      snapshotOrderBook,
      allConversions,
      CREDIT_TYPES,
      GUILD_TOKEN_CREDIT_CONVERSIONS,
      GUILD_TOKEN_BUDGET_SNAP_PERCENTAGES,
      GUILD_TOKEN_BUDGET_SNAP_THRESHOLD_PERCENTAGE,
      GUILD_SHRINE_NAME_KEYS,
      SHOW_ALL_CREDIT_TOKEN_TOGGLE,
      guildShrineLevelRecordKey,
      persistPluginUiState,
      updateRenderedMarkup,
      hydrateBridgeData,
      extractItemDetailsFromReact,
      hydrateLocalInitData,
      loadSnapshot,
      refreshOfficialItemNameCatalog,
      scheduleShrineGuide,
      guildTokenBudgetRefreshTask
    } = dependencies;

    function guildBuffEntries() {
      hydrateBridgeData();
      extractItemDetailsFromReact();
      hydrateLocalInitData();
      const details = Array.isArray(state.guildBuffDetails)
        ? state.guildBuffDetails.map((detail) => [detail && (detail.hrid || detail.guildBuffHrid), detail])
        : Object.entries(state.guildBuffDetails || {});
      return details
        .map(([hrid, detail]) => ({ hrid: (detail && (detail.hrid || detail.guildBuffHrid)) || hrid, detail }))
        .filter(({ hrid, detail }) => hrid && detail && detail.levelCosts)
        .map(({ hrid, detail }) => ({
          hrid,
          detail,
          maxLevel: Array.isArray(detail.levelCosts)
            ? detail.levelCosts.length - 1
            : Math.max(...Object.keys(detail.levelCosts).map(Number).filter(Number.isSafeInteger))
        }))
        .filter(({ maxLevel }) => Number.isSafeInteger(maxLevel) && maxLevel > 0)
        .sort((left, right) =>
          guildBuffLabel(left.detail, left.hrid).localeCompare(guildBuffLabel(right.detail, right.hrid), ui().locale)
        );
    }

    function guildBuffLabel(detail, fallbackHrid) {
      const shrineKey = GUILD_SHRINE_NAME_KEYS[detail && detail.shrineHrid];
      const shrineName = shrineKey
        ? t(shrineKey)
        : titleCase(simpleItemName((detail && detail.shrineHrid) || fallbackHrid));
      const domain =
        detail && detail.isCombat === true
          ? t("domainCombat")
          : detail && detail.isCombat === false
            ? t("domainLife")
            : "";
      return domain ? t("shrineWithDomain", { shrine: shrineName, domain }) : shrineName;
    }

    function itemNameForMaterial(itemHrid) {
      const details = Array.isArray(state.itemDetails)
        ? state.itemDetails.map((detail) => [detail && (detail.itemHrid || detail.hrid), detail])
        : Object.entries(state.itemDetails || {});
      const detail = details.find(([hrid]) => hrid === itemHrid);
      return resolveItemName(itemHrid, detail && detail[1] && detail[1].name);
    }

    function materialOrder(left, right) {
      if (left.itemHrid === "/items/guild_token") return -1;
      if (right.itemHrid === "/items/guild_token") return 1;
      const leftCredit = CREDIT_TYPES.findIndex(([hrid]) => hrid === left.itemHrid);
      const rightCredit = CREDIT_TYPES.findIndex(([hrid]) => hrid === right.itemHrid);
      if (leftCredit >= 0 && rightCredit >= 0) return leftCredit - rightCredit;
      if (leftCredit >= 0) return -1;
      if (rightCredit >= 0) return 1;
      return itemNameForMaterial(left.itemHrid).localeCompare(itemNameForMaterial(right.itemHrid), ui().locale);
    }

    function inventoryItemCounts() {
      hydrateBridgeData();
      extractItemDetailsFromReact();
      hydrateLocalInitData();
      const counts = Object.create(null);
      for (const item of state.characterItems || []) {
        if (!item || item.itemLocationHrid !== "/item_locations/inventory") continue;
        const count = Number(item.count);
        if (!item.itemHrid || !Number.isFinite(count) || count <= 0) continue;
        counts[item.itemHrid] = (counts[item.itemHrid] || 0) + count;
      }
      return counts;
    }

    function bestCreditConversions(targetCreditsByHrid) {
      return Object.fromEntries(
        CREDIT_TYPES.map(([creditItemHrid]) => {
          const targetCredits = targetCreditsByHrid ? Number(targetCreditsByHrid[creditItemHrid]) : 1;
          if (!Number.isSafeInteger(targetCredits) || targetCredits <= 0) return [creditItemHrid, null];
          const conversions = allConversions(creditItemHrid);
          const books = Object.fromEntries(
            conversions.map((conversion) => [conversion.itemHrid, snapshotOrderBook(conversion.itemHrid)])
          );
          return [
            creditItemHrid,
            core.rankConversions(conversions, books, targetCredits).find((row) => row.status === "ok") || null
          ];
        })
      );
    }

    function bestCreditUnitCosts() {
      const tokenCreditTargets = Object.fromEntries(
        GUILD_TOKEN_CREDIT_CONVERSIONS.map((rule) => [rule.creditItemHrid, rule.creditCount])
      );
      return Object.fromEntries(
        Object.entries(bestCreditConversions(tokenCreditTargets)).map(([creditItemHrid, best]) => [
          creditItemHrid,
          best ? best.costPerCredit : null
        ])
      );
    }

    function bestCreditMaterialPlans(estimate) {
      const missingCredits = Object.fromEntries(
        ((estimate && estimate.rows) || []).map((row) => [row.itemHrid, row.remainingMissing ?? row.missing])
      );
      return bestCreditConversions(missingCredits);
    }

    function currentGuildBuffLevel(entry) {
      const stored = Array.isArray(state.guildBuffLevels)
        ? state.guildBuffLevels.find((value) => value && (value.guildBuffHrid || value.hrid) === entry.hrid)
        : state.guildBuffLevels && state.guildBuffLevels[entry.hrid];
      const value = stored && typeof stored === "object" ? (stored.level ?? stored.currentLevel) : stored;
      const level = Number(value);
      return Number.isSafeInteger(level) && level >= 0 ? Math.min(level, entry.maxLevel) : 0;
    }

    function shrineLevelValue(value) {
      const raw =
        value && typeof value === "object"
          ? (value.level ?? value.currentLevel ?? value.guildBuildingLevel ?? value.buildingLevel)
          : value;
      const level = Number(raw);
      return Number.isSafeInteger(level) && level >= 0 ? level : null;
    }

    function shrineIdentityValues(record, fallbackHrid) {
      const values = [fallbackHrid];
      if (!record || typeof record !== "object") return values;
      for (const key of [
        "guildShrineHrid",
        "shrineHrid",
        "guildBuildingHrid",
        "hrid",
        "id",
        "guildBuffHrid",
        "name",
        "displayName",
        "label"
      ]) {
        if (typeof record[key] === "string") values.push(record[key]);
      }
      return values;
    }

    function guildShrineDetailFor(record, fallbackHrid) {
      const source = state.guildShrineDetails;
      const entries = Array.isArray(source)
        ? source.map((detail, index) => [guildShrineLevelRecordKey(detail, index), detail])
        : Object.entries(source || {});
      const identityValues = new Set(shrineIdentityValues(record, fallbackHrid));
      for (const [detailKey, detail] of entries) {
        const detailValues = shrineIdentityValues(detail, detailKey);
        if (detailValues.some((value) => identityValues.has(value))) return detail;
      }
      return null;
    }

    function shrineLevelRecordMatches(record, fallbackHrid, shrineHrid) {
      const shrineKey = String(shrineHrid || "")
        .split("/")
        .pop()
        .toLowerCase();
      if (!shrineKey) return false;
      const detail = guildShrineDetailFor(record, fallbackHrid);
      const candidates = [...shrineIdentityValues(record, fallbackHrid), ...shrineIdentityValues(detail, "")].filter(
        (value) => typeof value === "string"
      );
      return candidates.some((value) => {
        const normalized = value.toLowerCase();
        // Older and newer game payloads use both `tempo_shrine` and simply
        // `tempo` as guild-building IDs. This value is only inspected inside
        // the captured guild-shrine/building maps, so an exact HRID segment is
        // sufficient and avoids silently omitting valid shrine levels.
        return normalized === shrineHrid || new RegExp(`(^|[/_-])${shrineKey}([/_-]|$)`).test(normalized);
      });
    }

    function guildShrineLevelByHrid(shrineHrid) {
      const source = state.guildShrineLevels;
      const entries = Array.isArray(source)
        ? source.map((record) => [
            record && (record.guildShrineHrid || record.shrineHrid || record.guildBuildingHrid || record.hrid),
            record
          ])
        : Object.entries(source || {});
      for (const [fallbackHrid, record] of entries) {
        if (!shrineLevelRecordMatches(record, fallbackHrid, shrineHrid)) continue;
        const level = shrineLevelValue(record);
        if (level !== null) return level;
      }
      // The game only includes built (non-zero) guild shrine buildings in this
      // map. Once a guild-building snapshot exists, a missing shrine is the
      // game's representation of level 0, not an unreadable level.
      return source ? 0 : null;
    }

    function guildShrineTargetLevels(entries) {
      const targets = Object.create(null);
      for (const entry of entries) {
        const shrineHrid = entry && entry.detail && entry.detail.shrineHrid;
        if (!shrineHrid || Object.hasOwn(targets, shrineHrid)) continue;
        const level = guildShrineLevelByHrid(shrineHrid);
        if (level !== null) targets[shrineHrid] = Math.min(level, entry.maxLevel);
      }
      return targets;
    }

    function isCombatGuildBuff(entry) {
      return entry && entry.detail && entry.detail.isCombat === true;
    }

    function applyGuildShrineTargets(entries, domain) {
      const combat = domain === "combat";
      const domainEntries = entries.filter((entry) => isCombatGuildBuff(entry) === combat);
      const targets = guildShrineTargetLevels(domainEntries);
      if (!domainEntries.length || domainEntries.some((entry) => !Object.hasOwn(targets, entry.detail.shrineHrid)))
        return false;
      const entriesByHrid = new Map(entries.map((entry) => [entry.hrid, entry]));
      const preservedPlans = state.upgradePlans.filter((plan) => {
        const entry = entriesByHrid.get(plan.guildBuffHrid);
        return !entry || isCombatGuildBuff(entry) !== combat;
      });
      const planned = domainEntries
        .map((entry) => {
          const startLevel = currentGuildBuffLevel(entry);
          const targetLevel = targets[entry.detail.shrineHrid];
          return targetLevel > startLevel
            ? { id: `plan-${state.nextUpgradePlanId++}`, guildBuffHrid: entry.hrid, startLevel, targetLevel }
            : null;
        })
        .filter(Boolean);
      state.upgradePlans = [...preservedPlans, ...planned];
      state.suppressUpgradePlanAutofill = true;
      const targetDomain = combat ? t("domainCombat") : t("domainLife");
      state.upgradePresetNotice = planned.length
        ? t("guildTargetApplied", { domain: targetDomain, count: formatNumber(planned.length) })
        : t("guildTargetComplete", { domain: targetDomain });
      return true;
    }

    function normalizeUpgradePlan(plan, entries) {
      const entry = entries.find((candidate) => candidate.hrid === plan.guildBuffHrid);
      if (!entry) return null;
      const currentLevel = currentGuildBuffLevel(entry);
      const rawStart = Number(plan.startLevel);
      const startLevel =
        Number.isSafeInteger(rawStart) && rawStart >= 0 && rawStart < entry.maxLevel ? rawStart : currentLevel;
      const rawTarget = Number(plan.targetLevel);
      const targetLevel =
        Number.isSafeInteger(rawTarget) && rawTarget > startLevel && rawTarget <= entry.maxLevel
          ? rawTarget
          : Math.min(startLevel + 1, entry.maxLevel);
      return { ...plan, guildBuffHrid: entry.hrid, startLevel, targetLevel };
    }

    function addGuildUpgradePlan(entries) {
      const plannedHrids = new Set(state.upgradePlans.map((plan) => plan.guildBuffHrid));
      const entry = entries.find(
        (candidate) => !plannedHrids.has(candidate.hrid) && currentGuildBuffLevel(candidate) < candidate.maxLevel
      );
      if (!entry) return false;
      const startLevel = currentGuildBuffLevel(entry);
      state.upgradePlans.push({
        id: `plan-${state.nextUpgradePlanId++}`,
        guildBuffHrid: entry.hrid,
        startLevel,
        targetLevel: startLevel + 1
      });
      state.suppressUpgradePlanAutofill = false;
      state.upgradePresetNotice = "";
      return true;
    }

    function clearGuildUpgradePlans() {
      state.upgradePlans = [];
      // Keep the cleared state visible instead of immediately restoring the
      // default plan during the next refresh.
      state.suppressUpgradePlanAutofill = true;
      state.upgradePresetNotice = t("plansCleared");
    }

    function removeGuildUpgradePlan(planId) {
      const previousLength = state.upgradePlans.length;
      state.upgradePlans = state.upgradePlans.filter((plan) => plan.id !== planId);
      if (state.upgradePlans.length === previousLength) return false;
      const removedLastPlan = state.upgradePlans.length === 0;
      // Removing plans one by one must be able to reach the same empty state as
      // the dedicated clear button instead of immediately adding a default row.
      state.suppressUpgradePlanAutofill = removedLastPlan;
      state.upgradePresetNotice = removedLastPlan ? t("plansCleared") : "";
      return true;
    }

    function ensureGuildUpgradePlans(entries) {
      state.upgradePlans = state.upgradePlans.map((plan) => normalizeUpgradePlan(plan, entries)).filter(Boolean);
      if (!state.upgradePlans.length && !state.suppressUpgradePlanAutofill) addGuildUpgradePlan(entries);
      persistPluginUiState();
    }

    function levelOptionMarkup(start, end, selected) {
      return Array.from({ length: Math.max(end - start + 1, 0) }, (_, index) => start + index)
        .map(
          (level) =>
            `<option value="${level}" ${level === selected ? "selected" : ""}>${escapeHtml(t("level", { level: formatNumber(level) }))}</option>`
        )
        .join("");
    }

    function updateGuildShrineTargetActions(panel, entries) {
      const targets = guildShrineTargetLevels(entries);
      const summaries = [];
      for (const domain of ["life", "combat"]) {
        const combat = domain === "combat";
        const domainEntries = entries.filter((entry) => isCombatGuildBuff(entry) === combat);
        const ready =
          domainEntries.length > 0 && domainEntries.every((entry) => Object.hasOwn(targets, entry.detail.shrineHrid));
        const missing = Array.from(
          new Set(
            domainEntries
              .filter((entry) => !Object.hasOwn(targets, entry.detail.shrineHrid))
              .map((entry) => {
                const nameKey = GUILD_SHRINE_NAME_KEYS[entry.detail.shrineHrid];
                return nameKey ? t(nameKey) : entry.detail.shrineHrid;
              })
          )
        );
        const button = panel.querySelector(`[data-role="set-guild-shrine-target"][data-domain="${domain}"]`);
        if (button) {
          button.disabled = !ready;
          button.title = ready
            ? t("targetButtonReady")
            : t("targetButtonMissing", { missing: missing.join(ui().locale === "zh-CN" ? "、" : ", ") });
        }
        const count = Object.keys(targets).filter((shrineHrid) =>
          domainEntries.some((entry) => entry.detail.shrineHrid === shrineHrid)
        ).length;
        const missingText = missing.length
          ? t("targetSummaryMissing", { missing: missing.join(ui().locale === "zh-CN" ? "、" : ", ") })
          : "";
        summaries.push(
          t("targetSummary", {
            domain: combat ? t("domainCombat") : t("domainLife"),
            count: formatNumber(count),
            total: formatNumber(domainEntries.length),
            missing: missingText
          })
        );
      }
      const status = panel.querySelector('[data-role="guild-shrine-target-status"]');
      if (status)
        status.textContent = state.guildShrineLevels
          ? t("shrineLevelsRead", { summaries: summaries.join(" · ") })
          : t("shrineLevelsReading");
    }

    function renderGuildUpgradePlans(panel, entries) {
      const list = panel.querySelector('[data-role="upgrade-plan-list"]');
      const plannedHrids = new Set(state.upgradePlans.map((plan) => plan.guildBuffHrid));
      const plansMarkup = state.upgradePlans
        .map((plan) => {
          const entry = entries.find((candidate) => candidate.hrid === plan.guildBuffHrid);
          if (!entry) return "";
          const buffOptions = entries
            .map(
              (candidate) =>
                `<option value="${escapeHtml(candidate.hrid)}" ${candidate.hrid === plan.guildBuffHrid ? "selected" : ""} ${candidate.hrid !== plan.guildBuffHrid && (plannedHrids.has(candidate.hrid) || currentGuildBuffLevel(candidate) >= candidate.maxLevel) ? "disabled" : ""}>${escapeHtml(guildBuffLabel(candidate.detail, candidate.hrid))}</option>`
            )
            .join("");
          const shrineHrid = (entry.detail && entry.detail.shrineHrid) || "";
          const domain = isCombatGuildBuff(entry) ? "combat" : "life";
          return `<div class="mwi-upgrade-plan" data-plan-id="${escapeHtml(plan.id)}" data-guild-buff-hrid="${escapeHtml(entry.hrid)}" data-shrine-hrid="${escapeHtml(shrineHrid)}" data-domain="${domain}">
          <label class="mwi-upgrade-plan-shrine"><span class="mwi-upgrade-field-label">${escapeHtml(t("shrine"))}</span><select data-role="plan-buff" aria-label="${escapeHtml(t("shrine"))}">${buffOptions}</select></label>
          <label class="mwi-upgrade-plan-start"><span class="mwi-upgrade-field-label">${escapeHtml(t("startLevel"))}</span><select data-role="plan-start" aria-label="${escapeHtml(t("startLevel"))}">${levelOptionMarkup(0, entry.maxLevel - 1, plan.startLevel)}</select></label>
          <span class="mwi-upgrade-level-arrow" aria-hidden="true">→</span>
          <label class="mwi-upgrade-plan-target"><span class="mwi-upgrade-field-label">${escapeHtml(t("targetLevel"))}</span><select data-role="plan-target" aria-label="${escapeHtml(t("targetLevel"))}">${levelOptionMarkup(plan.startLevel + 1, entry.maxLevel, plan.targetLevel)}</select></label>
          <button class="mwi-remove-plan" data-role="remove-plan" type="button" title="${escapeHtml(t("removePlan"))}" aria-label="${escapeHtml(t("removePlan"))}">×</button>
        </div>`;
        })
        .join("");
      const columnHeaders = state.upgradePlans.length
        ? `<div class="mwi-upgrade-plan-columns" aria-hidden="true"><span>${escapeHtml(t("shrine"))}</span><span>${escapeHtml(t("startLevel"))}</span><span></span><span>${escapeHtml(t("targetLevel"))}</span><span></span></div>`
        : "";
      updateRenderedMarkup(list, columnHeaders + plansMarkup);
      const count = panel.querySelector('[data-role="upgrade-plan-count"]');
      if (count) count.textContent = t("selectedUpgradePlanCount", { count: formatNumber(state.upgradePlans.length) });
      updateGuildShrineTargetActions(panel, entries);
    }

    function guildTokenCreditSelectionState() {
      const selectedCount = CREDIT_TYPES.reduce(
        (count, [hrid]) => count + (state.guildTokenCreditHrids.has(hrid) ? 1 : 0),
        0
      );
      return {
        selectedCount,
        allSelected: selectedCount === CREDIT_TYPES.length,
        partiallySelected: selectedCount > 0 && selectedCount < CREDIT_TYPES.length
      };
    }

    function updateGuildTokenCreditPlanButton(panel) {
      const button = panel.querySelector('[data-role="toggle-guild-token-credit-plan"]');
      if (!button) return;
      const selection = guildTokenCreditSelectionState();
      const activeState = selection.allSelected ? "true" : selection.partiallySelected ? "mixed" : "false";
      button.dataset.active = activeState;
      button.setAttribute("aria-pressed", activeState);
      const indicator = button.querySelector(".mwi-token-credit-plan-indicator");
      if (indicator) indicator.textContent = selection.allSelected ? "✓" : selection.partiallySelected ? "−" : "";
    }

    function renderGuildTokenCreditPlanToggle() {
      if (!SHOW_ALL_CREDIT_TOKEN_TOGGLE) return "";
      const selection = guildTokenCreditSelectionState();
      const activeState = selection.allSelected ? "true" : selection.partiallySelected ? "mixed" : "false";
      const indicator = selection.allSelected ? "✓" : selection.partiallySelected ? "−" : "";
      return `<button class="mwi-token-credit-plan-toggle" data-role="toggle-guild-token-credit-plan" data-active="${activeState}" type="button" aria-pressed="${activeState}"><span class="mwi-token-credit-plan-indicator" aria-hidden="true">${indicator}</span><span class="mwi-token-credit-plan-copy"><strong>${escapeHtml(t("useGuildTokensForMissingCredits"))}</strong><small>${escapeHtml(t("useGuildTokensForMissingCreditsHint"))}</small></span></button>`;
    }

    function renderGuildTokenBudgetControl() {
      const snapMarks = GUILD_TOKEN_BUDGET_SNAP_PERCENTAGES.map(
        (percentage) => `<i data-percentage="${percentage}" style="--mwi-snap-position:${percentage}%"></i>`
      ).join("");
      return `<section class="mwi-token-budget" data-role="guild-token-budget-control"><div class="mwi-token-budget-heading"><strong>${escapeHtml(t("autoGuildTokenBudget"))}</strong><small>${escapeHtml(t("autoGuildTokenBudgetHint"))}</small></div><div class="mwi-token-budget-inputs"><span class="mwi-token-budget-range-wrap"><input data-role="guild-token-budget-range" type="range" min="0" max="0" step="1" value="0" disabled aria-label="${escapeHtml(t("autoGuildTokenBudget"))}"><span class="mwi-token-budget-snap-points" aria-hidden="true">${snapMarks}</span></span><output class="mwi-token-budget-percent" data-role="guild-token-budget-percent" aria-live="polite">0%</output><label><input data-role="guild-token-budget-number" type="number" min="0" max="0" step="1" value="0" disabled><span>${escapeHtml(t("guildTokens"))}</span></label></div><span class="mwi-token-budget-available" data-role="guild-token-budget-available">${escapeHtml(t("autoGuildTokenBudgetAvailable", { count: "0" }))}</span></section>`;
    }

    function updateGuildTokenBudgetPercentage(panel, value, max, snappedTo = null) {
      const range = panel.querySelector('[data-role="guild-token-budget-range"]');
      const output = panel.querySelector('[data-role="guild-token-budget-percent"]');
      if (!range || !output) return;
      const percentage = core.guildTokenBudgetPercentage(value, max);
      output.value = `${percentage}%`;
      output.textContent = `${percentage}%`;
      output.dataset.snapped = String(snappedTo !== null);
      range.setAttribute("aria-valuetext", `${percentage}% · ${formatNumber(value)} ${t("guildTokens")}`);
    }

    function updateGuildTokenBudgetControl(panel, estimate, hasInventory) {
      const range = panel.querySelector('[data-role="guild-token-budget-range"]');
      const number = panel.querySelector('[data-role="guild-token-budget-number"]');
      const available = panel.querySelector('[data-role="guild-token-budget-available"]');
      if (!range || !number || !available) return;
      const max =
        hasInventory && estimate ? Math.max(0, Math.floor(Number(estimate.autoGuildTokenBudgetAvailable) || 0)) : 0;
      const effective = state.autoGuildTokenBudget === null ? max : Math.min(max, state.autoGuildTokenBudget);
      for (const input of [range, number]) {
        input.max = String(max);
        input.value = String(effective);
        input.disabled = !hasInventory;
      }
      const effectivePercentage = core.guildTokenBudgetPercentage(effective, max);
      const snappedTo =
        range.dataset.dragging === "true" && GUILD_TOKEN_BUDGET_SNAP_PERCENTAGES.includes(effectivePercentage)
          ? effectivePercentage
          : null;
      updateGuildTokenBudgetPercentage(panel, effective, max, snappedTo);
      available.textContent = t("autoGuildTokenBudgetAvailable", { count: formatNumber(max) });
    }

    function setGuildTokenBudget(panel, rawValue, options = {}) {
      const range = panel.querySelector('[data-role="guild-token-budget-range"]');
      const number = panel.querySelector('[data-role="guild-token-budget-number"]');
      if (!range || !number || rawValue === "") return;
      const max = Math.max(0, Number(range.max) || 0);
      const resolved = options.snap
        ? core.snapGuildTokenBudget(rawValue, max, {
            snapPercentages: GUILD_TOKEN_BUDGET_SNAP_PERCENTAGES,
            thresholdPercentage: GUILD_TOKEN_BUDGET_SNAP_THRESHOLD_PERCENTAGE
          })
        : { value: Math.min(max, Math.max(0, Math.floor(Number(rawValue) || 0))), snappedTo: null };
      const value = resolved.value;
      state.autoGuildTokenBudget = value;
      range.value = String(value);
      number.value = String(value);
      updateGuildTokenBudgetPercentage(panel, value, max, resolved.snappedTo);
      persistPluginUiState();
      guildTokenBudgetRefreshTask.schedule(panel);
    }

    function renderUpgradeCostText(gold, guildTokens, showZeroGuildTokens) {
      const parts = [`${core.formatCompactCost(gold)} ${t("gold")}`];
      if (guildTokens > 0 || showZeroGuildTokens) parts.push(`${formatNumber(guildTokens)} ${t("guildTokens")}`);
      return parts.join(" + ");
    }

    function renderUpgradeCostSummary(estimate, hasInventory) {
      if (!estimate)
        return `<div class="mwi-upgrade-cost-summary mwi-upgrade-cost-unavailable">${escapeHtml(t("noSnapshotEstimate"))}</div>`;
      const partial = estimate.status !== "ok";
      const missingNames = estimate.unpricedItemHrids
        .map(itemNameForMaterial)
        .join(ui().locale === "zh-CN" ? "、" : ", ");
      const totalLabel = partial ? t("partialEstimatedCost") : t("estimatedTotalCost");
      const missingLabel = partial ? t("partialAfterInventory") : t("afterInventory");
      const inventoryNote = hasInventory
        ? ""
        : `<div class="mwi-upgrade-cost-note">${escapeHtml(t("inventoryUnavailable"))}</div>`;
      const priceNote = partial
        ? `<div class="mwi-upgrade-cost-note">${escapeHtml(t("noCreditPrice", { items: missingNames }))}</div>`
        : "";
      const tokenExchangeNote =
        estimate.guildTokenCreditExchangeRequired > 0
          ? `<div class="mwi-upgrade-cost-note mwi-upgrade-token-note">${escapeHtml(t("guildTokenCreditPlanSummary", { count: formatNumber(estimate.guildTokenCreditExchangeRequired) }))}</div>`
          : "";
      const autoTokenNote =
        estimate.autoGuildTokenCreditExchangeUsed > 0
          ? `<div class="mwi-upgrade-cost-note mwi-upgrade-auto-token-note">${escapeHtml(t("autoGuildTokenPlanSummary", { count: formatNumber(estimate.autoGuildTokenCreditExchangeUsed) }))}</div>`
          : "";
      return `<section class="mwi-upgrade-cost-summary"><div class="mwi-upgrade-cost-title">${escapeHtml(t("costSummary"))}</div><div><span>${escapeHtml(totalLabel)}</span><strong>${renderUpgradeCostText(estimate.totalGold, estimate.guildTokensRequired)}</strong></div><div><span>${escapeHtml(missingLabel)}</span><strong>${renderUpgradeCostText(estimate.missingGold, estimate.guildTokensMissing, estimate.guildTokenCreditExchangeRequired > 0)}</strong></div>${tokenExchangeNote}${autoTokenNote}${inventoryNote}${priceNote}</section>`;
    }

    function renderGuildTokenMaterialPlan(exchange, hasInventory, materialInventory, automatic) {
      const requiredGuildTokens = automatic ? exchange.spentGuildTokens : exchange.requiredGuildTokens;
      const detail = automatic
        ? t("autoGuildTokenCoverage", { count: formatNumber(exchange.coveredCredits) })
        : t("backpackInventory", {
            count: hasInventory
              ? formatNumber(Number(materialInventory && materialInventory["/items/guild_token"]) || 0)
              : t("notRead")
          });
      const needLabel = automatic ? t("autoGuildTokenExchangeNeeds") : t("guildTokenExchangeNeeds");
      return `<div class="mwi-material-plan-item" data-guide-item-hrid="/items/guild_token"><span class="mwi-material-plan-icon">${iconMarkup("/items/guild_token", itemNameForMaterial("/items/guild_token"))}</span><span><b>${escapeHtml(itemNameForMaterial("/items/guild_token"))}</b><small>${escapeHtml(detail)}</small></span></div><div class="mwi-material-plan-need"><small>${escapeHtml(needLabel)}</small><strong>${formatNumber(requiredGuildTokens)}</strong></div><span class="mwi-material-plan-rate">${escapeHtml(t("exchangeRate", { items: `${formatNumber(exchange.guildTokenCount)} ${t("guildTokens")}`, credits: creditQuantity(exchange.creditCount) }))}</span>`;
    }

    function renderOptimalMaterialPlan(plan, hasInventory, materialInventory) {
      if (!plan)
        return `<div class="mwi-material-plan-unavailable">${escapeHtml(t("optimalExchangeUnavailable"))}</div>`;
      return `<div class="mwi-material-plan-item" data-guide-item-hrid="${escapeHtml(plan.itemHrid)}"><span class="mwi-material-plan-icon">${marketItemIconMarkup(plan.itemHrid, itemNameForMaterial(plan.itemHrid))}</span><span><b>${escapeHtml(itemNameForMaterial(plan.itemHrid))}</b><small>${escapeHtml(t("backpackInventory", { count: hasInventory ? formatNumber(Number(materialInventory && materialInventory[plan.itemHrid]) || 0) : t("notRead") }))}</small></span></div><div class="mwi-material-plan-need"><small>${escapeHtml(t("optimalExchangeNeeds"))}</small><strong>${formatNumber(plan.requiredItems)}</strong></div><span class="mwi-material-plan-rate">${escapeHtml(t("exchangeRate", { items: itemQuantity(plan.itemCount), credits: creditQuantity(plan.creditCount) }))}</span>`;
    }

    function renderMaterialTotals(results, totals, estimate, hasInventory, creditMaterialPlans, materialInventory) {
      const planSummary = results
        .map((plan) => {
          const entry = guildBuffEntries().find((candidate) => candidate.hrid === plan.guildBuffHrid);
          const label = entry ? guildBuffLabel(entry.detail, entry.hrid) : plan.guildBuffHrid;
          return `<span>${escapeHtml(label)} ${plan.startLevel} -> ${plan.targetLevel}</span>`;
        })
        .join(`<span class="mwi-plan-separator">${ui().locale === "zh-CN" ? "，" : ", "}</span>`);
      const estimateRows = Object.fromEntries(((estimate && estimate.rows) || []).map((row) => [row.itemHrid, row]));
      const displayTotals =
        estimate && estimate.rows.length
          ? estimate.rows.map((row) => ({ itemHrid: row.itemHrid, count: row.required }))
          : totals;
      const materials = [...displayTotals]
        .sort(materialOrder)
        .map((item) => {
          const row = estimateRows[item.itemHrid];
          const inventoryText = row
            ? t("inventoryAndMissing", { owned: formatNumber(row.owned), missing: formatNumber(row.missing) })
            : t("inventoryNotRead");
          const credit = CREDIT_TYPES.find(([creditItemHrid]) => creditItemHrid === item.itemHrid);
          const isGuildCredit = Boolean(credit);
          const useGuildTokens = isGuildCredit && state.guildTokenCreditHrids.has(item.itemHrid);
          const plan = creditMaterialPlans && creditMaterialPlans[item.itemHrid];
          const tokenExchange = row && row.guildTokenExchange;
          const autoTokenExchange = row && row.autoGuildTokenExchange;
          const accent = credit ? credit[1] : item.itemHrid === "/items/guild_token" ? "#e65d68" : "#7778b4";
          const exchangeMode = useGuildTokens ? t("guildTokenCreditMode") : t("optimalItemCreditMode");
          const exchangeModeMarkup = isGuildCredit
            ? `<button class="mwi-material-exchange-mode" data-role="toggle-credit-token-mode" data-credit-hrid="${escapeHtml(item.itemHrid)}" data-active="${String(useGuildTokens)}" type="button" aria-pressed="${String(useGuildTokens)}" title="${escapeHtml(t("creditExchangeModeTitle", { mode: exchangeMode }))}">${escapeHtml(exchangeMode)}</button>`
            : "";
          const conversionPlans = [];
          if (row && row.missing > 0 && isGuildCredit) {
            if (tokenExchange) {
              conversionPlans.push(
                `<div class="mwi-material-plan">${renderGuildTokenMaterialPlan(tokenExchange, hasInventory, materialInventory, false)}</div>`
              );
            } else {
              if (autoTokenExchange)
                conversionPlans.push(
                  `<div class="mwi-material-plan mwi-material-plan-auto">${renderGuildTokenMaterialPlan(autoTokenExchange, hasInventory, materialInventory, true)}</div>`
                );
              if ((row.remainingMissing ?? row.missing) > 0)
                conversionPlans.push(
                  `<div class="mwi-material-plan">${renderOptimalMaterialPlan(plan, hasInventory, materialInventory)}</div>`
                );
            }
          }
          if (row && row.missing <= 0 && isGuildCredit)
            conversionPlans.push(
              `<div class="mwi-material-plan-covered">✓ ${escapeHtml(t("inventoryCoveredNoExchange"))}</div>`
            );
          const rowClass = item.itemHrid === "/items/guild_token" ? " mwi-material-row-token" : "";
          const materialIcon =
            isGuildCredit || item.itemHrid === "/items/guild_token" || item.itemHrid === "/items/coin"
              ? iconMarkup(item.itemHrid, itemNameForMaterial(item.itemHrid))
              : marketItemIconMarkup(item.itemHrid, itemNameForMaterial(item.itemHrid));
          const guideMissing = row ? Math.max(0, Number(row.remainingMissing ?? row.missing) || 0) : 0;
          return `<article class="mwi-material-row${rowClass}" data-item-hrid="${escapeHtml(item.itemHrid)}" data-guide-missing="${escapeHtml(guideMissing)}" style="--mwi-material-accent:${accent}"><div class="mwi-material-credit">${materialIcon}<span class="mwi-material-copy"><span class="mwi-material-name">${escapeHtml(itemNameForMaterial(item.itemHrid))}</span><small>${escapeHtml(hasInventory ? inventoryText : t("inventoryNotRead"))}</small></span></div><div class="mwi-material-required"><small>${escapeHtml(t("requiredThisTime"))}</small><strong>${formatNumber(item.count)}</strong></div>${exchangeModeMarkup || '<span class="mwi-material-exchange-mode-spacer" aria-hidden="true"></span>'}<div class="mwi-material-plans">${conversionPlans.join("")}</div></article>`;
        })
        .join("");
      return `<div class="mwi-plan-summary">${planSummary}</div>${renderUpgradeCostSummary(estimate, hasInventory)}<div class="mwi-material-list">${materials}</div>`;
    }

    function shrineGuidePlans(entries) {
      const byHrid = new Map(entries.map((entry) => [entry.hrid, entry]));
      return state.upgradePlans.flatMap((plan) => {
        const entry = byHrid.get(plan.guildBuffHrid);
        if (!entry || !entry.detail || !entry.detail.shrineHrid) return [];
        return [
          {
            guildBuffHrid: entry.hrid,
            shrineHrid: entry.detail.shrineHrid,
            domain: isCombatGuildBuff(entry) ? "combat" : "life",
            label: guildBuffLabel(entry.detail, entry.hrid),
            currentLevel: currentGuildBuffLevel(entry),
            targetLevel: plan.targetLevel
          }
        ];
      });
    }

    function setShrineGuideContext(context) {
      state.shrineGuideContext = context;
      scheduleShrineGuide();
    }

    async function refreshGuildUpgrade(panel) {
      const refreshId = ++state.upgradeRefreshId;
      updateGuildTokenCreditPlanButton(panel);
      refreshOfficialItemNameCatalog();
      const status = panel.querySelector('[data-role="upgrade-status"]');
      const results = panel.querySelector('[data-role="upgrade-results"]');
      const entries = guildBuffEntries();
      if (!entries.length) {
        setShrineGuideContext(null);
        updateGuildTokenBudgetControl(panel, null, false);
        status.textContent = t("noGuildRules");
        updateRenderedMarkup(results, "");
        return;
      }
      ensureGuildUpgradePlans(entries);
      renderGuildUpgradePlans(panel, entries);
      if (!state.upgradePlans.length) {
        setShrineGuideContext({ plans: [], estimate: { rows: [] }, creditMaterialPlans: {} });
        updateGuildTokenBudgetControl(panel, null, Array.isArray(state.characterItems));
        status.textContent = state.upgradePresetNotice || t("allBuffsMaxed");
        updateRenderedMarkup(
          results,
          `<div class="mwi-empty">${escapeHtml(state.upgradePresetNotice || t("noUpgradeMaterials"))}</div>`
        );
        return;
      }

      const result = core.aggregateGuildBuffPlans(
        state.upgradePlans.map((plan) => {
          const entry = entries.find((candidate) => candidate.hrid === plan.guildBuffHrid);
          return { ...plan, levelCosts: entry && entry.detail.levelCosts };
        })
      );
      if (result.status !== "ok") {
        setShrineGuideContext({ plans: shrineGuidePlans(entries), estimate: null, creditMaterialPlans: {} });
        const failed = result.result || {};
        status.textContent =
          failed.status === "missing_cost"
            ? t("missingLevelCost", { level: formatNumber(failed.missingLevel) })
            : t("invalidLevels");
        updateRenderedMarkup(results, "");
        return;
      }
      let estimate = null;
      let creditMaterialPlans = null;
      let materialInventory = inventoryItemCounts();
      const hasInventory = Array.isArray(state.characterItems);
      let snapshotFailed = false;
      const requiredCreditHrids = result.totals
        .map((item) => item.itemHrid)
        .filter((itemHrid) => CREDIT_TYPES.some(([creditItemHrid]) => creditItemHrid === itemHrid));
      const needsMarketSnapshot = requiredCreditHrids.some((itemHrid) => !state.guildTokenCreditHrids.has(itemHrid));
      let creditUnitCosts = {};
      try {
        if (needsMarketSnapshot) {
          await loadSnapshot(false);
          if (refreshId !== state.upgradeRefreshId) return;
          creditUnitCosts = bestCreditUnitCosts();
        }
      } catch (_) {
        snapshotFailed = true;
      }
      if (refreshId !== state.upgradeRefreshId) return;
      estimate = core.estimateGuildUpgradeCosts(result.totals, creditUnitCosts, materialInventory, {
        guildTokenCreditHrids: Array.from(state.guildTokenCreditHrids),
        guildTokenCreditConversions: GUILD_TOKEN_CREDIT_CONVERSIONS,
        autoAllocateSurplusGuildTokens: hasInventory,
        autoGuildTokenBudget: state.autoGuildTokenBudget
      });
      updateGuildTokenBudgetControl(panel, estimate, hasInventory);
      if (!snapshotFailed && needsMarketSnapshot) creditMaterialPlans = bestCreditMaterialPlans(estimate);
      let guideEstimate = estimate;
      let guideCreditMaterialPlans = creditMaterialPlans;
      const activeGuidePlanInputs = state.upgradePlans.flatMap((plan) => {
        const entry = entries.find((candidate) => candidate.hrid === plan.guildBuffHrid);
        if (!entry) return [];
        const currentLevel = currentGuildBuffLevel(entry);
        if (currentLevel >= plan.targetLevel) return [];
        return [{ ...plan, startLevel: Math.max(currentLevel, plan.startLevel), levelCosts: entry.detail.levelCosts }];
      });
      if (
        activeGuidePlanInputs.length !== state.upgradePlans.length ||
        activeGuidePlanInputs.some((plan) => {
          const original = state.upgradePlans.find((candidate) => candidate.id === plan.id);
          return original && original.startLevel !== plan.startLevel;
        })
      ) {
        const guideResult = core.aggregateGuildBuffPlans(activeGuidePlanInputs);
        if (guideResult.status === "ok") {
          guideEstimate = core.estimateGuildUpgradeCosts(guideResult.totals, creditUnitCosts, materialInventory, {
            guildTokenCreditHrids: Array.from(state.guildTokenCreditHrids),
            guildTokenCreditConversions: GUILD_TOKEN_CREDIT_CONVERSIONS,
            autoAllocateSurplusGuildTokens: hasInventory,
            autoGuildTokenBudget: state.autoGuildTokenBudget
          });
          guideCreditMaterialPlans =
            !snapshotFailed && needsMarketSnapshot ? bestCreditMaterialPlans(guideEstimate) : null;
        } else {
          guideEstimate = null;
          guideCreditMaterialPlans = null;
        }
      }
      setShrineGuideContext({
        plans: shrineGuidePlans(entries),
        estimate: guideEstimate,
        creditMaterialPlans: guideCreditMaterialPlans || {}
      });
      const notices = [
        state.upgradePresetNotice ||
          (state.guildBuffLevels
            ? t("mergedUpgradePlans", { count: formatNumber(result.plans.length) })
            : t("unknownCurrentLevels"))
      ];
      const tokenSelection = guildTokenCreditSelectionState();
      if (tokenSelection.allSelected) notices.push(t("guildTokenCreditPlanActive"));
      else if (tokenSelection.partiallySelected)
        notices.push(t("guildTokenCreditPlanPartialActive", { count: formatNumber(tokenSelection.selectedCount) }));
      if (snapshotFailed) notices.push(t("snapshotFailed"));
      if (!hasInventory) notices.push(t("inventoryUnavailable"));
      status.textContent = notices.join(" ");
      updateRenderedMarkup(
        results,
        renderMaterialTotals(
          result.plans,
          result.totals,
          estimate,
          hasInventory,
          creditMaterialPlans,
          materialInventory
        )
      );
    }

    return {
      guildBuffEntries,
      itemNameForMaterial,
      currentGuildBuffLevel,
      shrineLevelValue,
      shrineIdentityValues,
      applyGuildShrineTargets,
      addGuildUpgradePlan,
      clearGuildUpgradePlans,
      removeGuildUpgradePlan,
      guildTokenCreditSelectionState,
      updateGuildTokenCreditPlanButton,
      renderGuildTokenCreditPlanToggle,
      renderGuildTokenBudgetControl,
      setGuildTokenBudget,
      refreshGuildUpgrade
    };
  }

  return { createUpgradeView };
});
