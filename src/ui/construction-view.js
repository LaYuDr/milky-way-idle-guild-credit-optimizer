(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MwiGuildCreditConstructionView = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function createConstructionView(dependencies) {
    const {
      state,
      buildingDataApi,
      t,
      ui,
      core,
      escapeHtml,
      formatNumber,
      titleCase,
      simpleItemName,
      shrineIdentityValues,
      shrineLevelValue,
      guildBuildingSpriteBaseHref,
      guildBuildingIconMarkup,
      updateRenderedMarkup,
      persistGuildBuildingPlannerState,
      hydrateBridgeData,
      extractItemDetailsFromReact,
      hydrateLocalInitData,
      pageWindow,
      document,
      URL,
      Blob
    } = dependencies;

    const constructionUi = {
      pickerOpen: state.buildingPlans.length === 0,
      pendingBuildingHrid: "",
      pendingStartValue: "",
      pendingStartErrorKey: "",
      expandedBuildingHrids: new Set(),
      clearUndoPlans: null,
      clearUndoTimer: null
    };

    function guildBuildingDefinitions() {
      return buildingDataApi.definitions();
    }

    function guildBuildingLabel(definition) {
      return definition && definition.nameKey
        ? t(definition.nameKey)
        : titleCase(simpleItemName(definition && definition.hrid));
    }

    function guildBuildingLevelRecordMatches(record, fallbackHrid, buildingHrid) {
      const segment = String(buildingHrid || "")
        .split("/")
        .pop()
        .toLowerCase();
      if (!segment) return false;
      const candidates = shrineIdentityValues(record, fallbackHrid).filter((value) => typeof value === "string");
      return candidates.some((value) => {
        const normalized = value.toLowerCase();
        return normalized === buildingHrid || new RegExp(`(^|[/_-])${segment}([/_-]|$)`).test(normalized);
      });
    }

    function currentGuildBuildingLevel(definition) {
      const source = state.guildBuildingLevels;
      if (!source) return null;
      const entries = Array.isArray(source)
        ? source.map((record) => [
            record && (record.guildBuildingHrid || record.guildShrineHrid || record.hrid),
            record
          ])
        : Object.entries(source);
      for (const [fallbackHrid, record] of entries) {
        if (!guildBuildingLevelRecordMatches(record, fallbackHrid, definition.hrid)) continue;
        const level = shrineLevelValue(record);
        if (level !== null) return Math.min(level, definition.maxLevel);
      }
      return state.guildBuildingLevelsComplete === true ? 0 : null;
    }

    function guildBuildingLevelSnapshot(definitions) {
      const levels = new Map(definitions.map((definition) => [definition.hrid, currentGuildBuildingLevel(definition)]));
      const knownCount = Array.from(levels.values()).filter((level) => level !== null).length;
      return { levels, knownCount, totalCount: definitions.length };
    }

    function reconcileGuildBuildingPlans(definitions) {
      const byHrid = new Map(definitions.map((definition) => [definition.hrid, definition]));
      let changed = false;
      let adjustedCount = 0;
      let removedCount = 0;
      const reconciled = [];
      for (const plan of state.buildingPlans) {
        const definition = byHrid.get(plan.buildingHrid);
        if (!definition) {
          changed = true;
          removedCount += 1;
          continue;
        }
        const liveLevel = currentGuildBuildingLevel(definition);
        const startLevel =
          liveLevel === null ? Math.max(0, Math.min(definition.maxLevel, Number(plan.startLevel) || 0)) : liveLevel;
        const targetLevel = Math.max(0, Math.min(definition.maxLevel, Number(plan.targetLevel) || 0));
        if (targetLevel <= startLevel) {
          changed = true;
          removedCount += 1;
          continue;
        }
        if (startLevel !== plan.startLevel || targetLevel !== plan.targetLevel) {
          changed = true;
          adjustedCount += 1;
        }
        reconciled.push({ ...plan, startLevel, targetLevel });
      }
      if (changed) {
        state.buildingPlans = reconciled;
        persistGuildBuildingPlannerState();
        if (!state.buildingPlanNotice)
          state.buildingPlanNotice = t("buildingPlansReconciled", {
            adjusted: formatNumber(adjustedCount),
            removed: formatNumber(removedCount)
          });
      }
      return { changed, adjustedCount, removedCount };
    }

    function guildBuildingPlan(definitions) {
      reconcileGuildBuildingPlans(definitions);
      const byHrid = new Map(definitions.map((definition) => [definition.hrid, definition]));
      return core.buildGuildConstructionPlan(
        state.buildingPlans.map((plan) => ({
          ...plan,
          levelCosts: byHrid.get(plan.buildingHrid) && byHrid.get(plan.buildingHrid).levelCosts
        })),
        state.manualGuildPoints
      );
    }

    function discardGuildBuildingClearUndo() {
      if (constructionUi.clearUndoTimer !== null) pageWindow.clearTimeout(constructionUi.clearUndoTimer);
      constructionUi.clearUndoTimer = null;
      constructionUi.clearUndoPlans = null;
    }

    function clearPendingGuildBuilding() {
      constructionUi.pendingBuildingHrid = "";
      constructionUi.pendingStartValue = "";
      constructionUi.pendingStartErrorKey = "";
    }

    function setGuildBuildingPickerOpen(open) {
      constructionUi.pickerOpen = Boolean(open);
      if (!constructionUi.pickerOpen) clearPendingGuildBuilding();
      return constructionUi.pickerOpen;
    }

    function setPendingGuildBuildingStartValue(value) {
      constructionUi.pendingStartValue = String(value ?? "");
      constructionUi.pendingStartErrorKey = "";
    }

    function addGuildBuildingPlan(definitions, buildingHrid, manualStartLevel) {
      const definition = definitions.find((entry) => entry.hrid === buildingHrid);
      if (!definition) return { status: "not_found", buildingHrid };
      const existing = state.buildingPlans.find((plan) => plan.buildingHrid === buildingHrid);
      if (existing) return { status: "already_planned", buildingHrid, plan: existing };
      const liveLevel = currentGuildBuildingLevel(definition);
      let startLevel = liveLevel;
      if (startLevel === null) {
        if (manualStartLevel === undefined || manualStartLevel === null) {
          constructionUi.pickerOpen = true;
          constructionUi.pendingBuildingHrid = buildingHrid;
          constructionUi.pendingStartValue = "";
          constructionUi.pendingStartErrorKey = "";
          return { status: "requires_start_level", buildingHrid };
        }
        if (String(manualStartLevel).trim() === "") {
          constructionUi.pendingBuildingHrid = buildingHrid;
          constructionUi.pendingStartValue = String(manualStartLevel);
          constructionUi.pendingStartErrorKey = "currentBuildingLevelRequired";
          return { status: "invalid_start_level", buildingHrid };
        }
        startLevel = Number(manualStartLevel);
        constructionUi.pendingStartValue = String(manualStartLevel);
        if (!Number.isSafeInteger(startLevel) || startLevel < 0 || startLevel > definition.maxLevel) {
          constructionUi.pendingStartErrorKey = "currentBuildingLevelRange";
          return { status: "invalid_start_level", buildingHrid };
        }
      }
      if (startLevel >= definition.maxLevel) {
        constructionUi.pendingStartErrorKey = "buildingMaxLevel";
        return { status: "at_max_level", buildingHrid };
      }
      discardGuildBuildingClearUndo();
      const plan = {
        id: `building-plan-${state.nextBuildingPlanId++}`,
        buildingHrid,
        startLevel,
        targetLevel: startLevel + 1
      };
      state.buildingPlans.push(plan);
      state.buildingPlanNotice = t("buildingAddedToPlan", { building: guildBuildingLabel(definition) });
      clearPendingGuildBuilding();
      persistGuildBuildingPlannerState();
      return { status: "added", buildingHrid, plan };
    }

    function setGuildBuildingTarget(definitions, buildingHrid, targetLevel) {
      const definition = definitions.find((entry) => entry.hrid === buildingHrid);
      const planIndex = state.buildingPlans.findIndex((entry) => entry.buildingHrid === buildingHrid);
      if (!definition || planIndex < 0) return false;
      const plan = state.buildingPlans[planIndex];
      const target = Number(targetLevel);
      if (!Number.isSafeInteger(target) || target <= plan.startLevel || target > definition.maxLevel) return false;
      if (target === plan.targetLevel) return false;
      discardGuildBuildingClearUndo();
      state.buildingPlans[planIndex] = { ...plan, targetLevel: target };
      state.buildingPlanNotice = t("buildingTargetUpdated", {
        building: guildBuildingLabel(definition),
        target: formatNumber(target)
      });
      persistGuildBuildingPlannerState();
      return true;
    }

    function removeGuildBuildingPlan(definitions, buildingHrid) {
      const index = state.buildingPlans.findIndex((plan) => plan.buildingHrid === buildingHrid);
      if (index < 0) return { status: "not_found", removedIndex: -1 };
      const definition = definitions.find((entry) => entry.hrid === buildingHrid);
      discardGuildBuildingClearUndo();
      const [removed] = state.buildingPlans.splice(index, 1);
      constructionUi.expandedBuildingHrids.delete(buildingHrid);
      state.buildingPlanNotice = t("buildingRemovedFromPlan", { building: guildBuildingLabel(definition) });
      persistGuildBuildingPlannerState();
      return { status: "removed", removedIndex: index, plan: removed };
    }

    function moveGuildBuildingPlan(buildingHrid, direction) {
      const index = state.buildingPlans.findIndex((plan) => plan.buildingHrid === buildingHrid);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= state.buildingPlans.length) return false;
      discardGuildBuildingClearUndo();
      const [plan] = state.buildingPlans.splice(index, 1);
      state.buildingPlans.splice(nextIndex, 0, plan);
      const definition = guildBuildingDefinitions().find((entry) => entry.hrid === buildingHrid);
      state.buildingPlanNotice = t("buildingPlanMovedToPosition", {
        building: guildBuildingLabel(definition),
        position: formatNumber(nextIndex + 1),
        total: formatNumber(state.buildingPlans.length)
      });
      persistGuildBuildingPlannerState();
      return true;
    }

    function reorderGuildBuildingPlan(buildingHrid, targetIndex) {
      const index = state.buildingPlans.findIndex((plan) => plan.buildingHrid === buildingHrid);
      const nextIndex = Math.max(0, Math.min(state.buildingPlans.length - 1, Number(targetIndex)));
      if (index < 0 || !Number.isInteger(nextIndex) || index === nextIndex) return false;
      discardGuildBuildingClearUndo();
      const [plan] = state.buildingPlans.splice(index, 1);
      state.buildingPlans.splice(nextIndex, 0, plan);
      const definition = guildBuildingDefinitions().find((entry) => entry.hrid === buildingHrid);
      state.buildingPlanNotice = t("buildingPlanMovedToPosition", {
        building: guildBuildingLabel(definition),
        position: formatNumber(nextIndex + 1),
        total: formatNumber(state.buildingPlans.length)
      });
      persistGuildBuildingPlannerState();
      return true;
    }

    function toggleGuildBuildingSteps(buildingHrid) {
      if (constructionUi.expandedBuildingHrids.has(buildingHrid)) {
        constructionUi.expandedBuildingHrids.delete(buildingHrid);
        return false;
      }
      constructionUi.expandedBuildingHrids.add(buildingHrid);
      return true;
    }

    function clearGuildBuildingPlans(onUndoExpired) {
      if (!state.buildingPlans.length) return false;
      discardGuildBuildingClearUndo();
      const plans = state.buildingPlans.map((plan) => ({ ...plan }));
      constructionUi.clearUndoPlans = plans;
      constructionUi.expandedBuildingHrids.clear();
      state.buildingPlans = [];
      constructionUi.pickerOpen = true;
      state.buildingPlanNotice = t("buildingPlanCleared", { count: formatNumber(plans.length) });
      persistGuildBuildingPlannerState();
      constructionUi.clearUndoTimer = pageWindow.setTimeout(() => {
        constructionUi.clearUndoPlans = null;
        constructionUi.clearUndoTimer = null;
        if (typeof onUndoExpired === "function") onUndoExpired();
      }, 8000);
      return true;
    }

    function undoClearGuildBuildingPlans() {
      if (!constructionUi.clearUndoPlans) return false;
      const plans = constructionUi.clearUndoPlans.map((plan) => ({ ...plan }));
      discardGuildBuildingClearUndo();
      state.buildingPlans = plans;
      constructionUi.pickerOpen = false;
      state.buildingPlanNotice = "";
      reconcileGuildBuildingPlans(guildBuildingDefinitions());
      state.buildingPlanNotice = t("buildingPlanRestored", { count: formatNumber(state.buildingPlans.length) });
      persistGuildBuildingPlannerState();
      return true;
    }

    function hasGuildBuildingClearUndo() {
      return Boolean(constructionUi.clearUndoPlans);
    }

    function constructionCategoryLabel(category) {
      return t(
        {
          all: "buildingCategoryAll",
          core: "buildingCategoryCore",
          life: "buildingCategoryLife",
          combat: "buildingCategoryCombat",
          shrine: "buildingCategoryShrine"
        }[category] || "buildingCategoryAll"
      );
    }

    function guildConstructionBudgetSummary(plan, definitions) {
      if (!plan.steps.length) return t("constructionBudgetEmptySummary");
      if (plan.availableGuildPoints === null)
        return t("constructionNoBudgetSummary", { total: formatNumber(plan.steps.length) });
      if (!plan.overBudget) return t("constructionBudgetAllFit", { total: formatNumber(plan.steps.length) });
      const cutoff = plan.steps[plan.firstOverBudgetIndex];
      const definition = definitions.find((entry) => entry.hrid === cutoff.buildingHrid);
      return t("constructionBudgetStopsBefore", {
        affordable: formatNumber(plan.affordableStepCount),
        total: formatNumber(plan.steps.length),
        building: guildBuildingLabel(definition),
        from: formatNumber(cutoff.fromLevel),
        to: formatNumber(cutoff.toLevel),
        count: formatNumber(Math.max(0, -cutoff.remainingGuildPoints))
      });
    }

    function renderGuildBuildingBudget(plan, definitions) {
      const hasBudget = plan.availableGuildPoints !== null;
      const remaining = plan.remainingGuildPoints;
      const remainingLabel = !hasBudget ? "-" : formatNumber(Math.abs(remaining));
      const remainingTitle = hasBudget && remaining < 0 ? t("overBudgetBy") : t("remainingPoints");
      const coverageLabel = hasBudget ? t("affordableUpgrades") : t("plannedUpgrades");
      const coverageValue = hasBudget
        ? `${formatNumber(plan.affordableStepCount)} / ${formatNumber(plan.steps.length)}`
        : formatNumber(plan.steps.length);
      return `<section class="mwi-construction-budget" data-over-budget="${String(Boolean(plan.overBudget))}">
        <div class="mwi-construction-budget-input"><label><span>${escapeHtml(t("guildPointBudget"))}</span><input data-role="guild-point-budget" type="number" min="0" step="1" aria-describedby="mwi-guild-point-budget-help mwi-guild-point-budget-error" placeholder="${escapeHtml(t("budgetOptional"))}" value="${state.manualGuildPoints === null ? "" : state.manualGuildPoints}"></label><small id="mwi-guild-point-budget-help">${escapeHtml(t("manualBudget"))}</small><small id="mwi-guild-point-budget-error" class="mwi-field-error" hidden>${escapeHtml(t("invalidGuildPointBudget"))}</small></div>
        <div class="mwi-construction-metric"><small>${escapeHtml(t("plannedSpend"))}</small><strong data-role="construction-planned-spend">${formatNumber(plan.totalCost)}</strong></div>
        <div class="mwi-construction-metric"><small data-role="construction-affordable-label">${escapeHtml(coverageLabel)}</small><strong data-role="construction-affordable">${coverageValue}</strong></div>
        <div class="mwi-construction-metric" data-role="construction-balance-metric" data-state="${hasBudget && remaining < 0 ? "danger" : "safe"}"><small data-role="construction-balance-label">${escapeHtml(remainingTitle)}</small><strong data-role="construction-balance">${remainingLabel}</strong></div>
        <output class="mwi-construction-budget-summary" data-role="construction-budget-summary">${escapeHtml(guildConstructionBudgetSummary(plan, definitions))}</output>
      </section>`;
    }

    function renderGuildBuildingTile(definition, plan, liveLevel, spriteBaseHref) {
      const displayLevel = liveLevel === null ? (plan ? plan.startLevel : null) : liveLevel;
      const currentLabel = displayLevel === null ? "?" : formatNumber(displayLevel);
      const label = guildBuildingLabel(definition);
      const searchText =
        `${label} ${constructionCategoryLabel(definition.category)} ${definition.hrid}`.toLocaleLowerCase(ui().locale);
      const accessibleLabel = plan
        ? t("buildingTilePlannedLabel", { building: label, target: formatNumber(plan.targetLevel) })
        : liveLevel === null
          ? t("buildingTileUnknownLabel", { building: label })
          : t("buildingTileAddLabel", { building: label, current: formatNumber(liveLevel) });
      const atMaxLevel = !plan && liveLevel !== null && liveLevel >= definition.maxLevel;
      return `<button class="mwi-building-tile" data-role="building-tile" data-building-hrid="${escapeHtml(definition.hrid)}" data-category="${definition.category}" data-planned="${String(Boolean(plan))}" data-level-known="${String(liveLevel !== null)}" data-building-search="${escapeHtml(searchText)}" aria-label="${escapeHtml(atMaxLevel ? t("buildingTileMaxLabel", { building: label }) : accessibleLabel)}" title="${escapeHtml(atMaxLevel ? t("buildingTileMaxLabel", { building: label }) : accessibleLabel)}" type="button"${atMaxLevel ? " disabled" : ""}>${guildBuildingIconMarkup(definition, spriteBaseHref)}<span class="mwi-building-level-badge" data-level-known="${String(liveLevel !== null)}">${currentLabel}</span>${plan ? `<span class="mwi-building-target-badge">${formatNumber(plan.targetLevel)}</span>` : ""}<span class="mwi-building-tile-name">${escapeHtml(label)}</span></button>`;
    }

    function renderPendingGuildBuilding(definitions) {
      const definition = definitions.find((entry) => entry.hrid === constructionUi.pendingBuildingHrid);
      if (!definition) return "";
      const label = guildBuildingLabel(definition);
      const errorId = "mwi-pending-building-level-error";
      const helpId = "mwi-pending-building-level-help";
      const error = constructionUi.pendingStartErrorKey
        ? t(constructionUi.pendingStartErrorKey, { max: formatNumber(Math.max(0, definition.maxLevel - 1)) })
        : "";
      return `<form class="mwi-building-start-form" data-role="pending-building-start" data-building-hrid="${escapeHtml(definition.hrid)}" novalidate><span class="mwi-building-start-copy"><strong>${escapeHtml(label)}</strong><small>${escapeHtml(t("currentBuildingLevelRequired"))}</small></span><label><span>${escapeHtml(t("currentBuildingLevelLabel", { building: label }))}</span><input data-role="pending-building-start-level" data-building-hrid="${escapeHtml(definition.hrid)}" type="number" min="0" max="${definition.maxLevel - 1}" step="1" inputmode="numeric" aria-describedby="${helpId} ${errorId}"${error ? ' aria-invalid="true"' : ""} value="${escapeHtml(constructionUi.pendingStartValue)}"></label><small id="${helpId}">${escapeHtml(t("currentBuildingLevelHelp", { max: formatNumber(Math.max(0, definition.maxLevel - 1)) }))}</small><small id="${errorId}" class="mwi-field-error"${error ? "" : " hidden"}>${escapeHtml(error)}</small><span class="mwi-building-start-actions"><button type="submit">${escapeHtml(t("addBuildingToPlan"))}</button><button class="mwi-secondary-button" data-role="cancel-pending-building" data-building-hrid="${escapeHtml(definition.hrid)}" type="button">${escapeHtml(t("cancel"))}</button></span></form>`;
    }

    function renderGuildBuildingPicker(definitions, levels, plansByHrid, spriteBaseHref) {
      const categories = ["all", "core", "life", "combat", "shrine"]
        .map(
          (category) =>
            `<button data-role="building-category" data-category="${category}" data-active="${String(category === state.buildingCategory)}" aria-pressed="${String(category === state.buildingCategory)}" type="button">${escapeHtml(constructionCategoryLabel(category))}</button>`
        )
        .join("");
      const tiles = definitions
        .map((definition) =>
          renderGuildBuildingTile(
            definition,
            plansByHrid.get(definition.hrid),
            levels.levels.get(definition.hrid),
            spriteBaseHref
          )
        )
        .join("");
      const unknownCount = Math.max(0, levels.totalCount - levels.knownCount);
      const status = t("buildingLevelsCoverage", {
        known: formatNumber(levels.knownCount),
        total: formatNumber(levels.totalCount)
      });
      return `<section class="mwi-building-picker" data-open="${String(constructionUi.pickerOpen)}"><button class="mwi-building-picker-toggle" data-role="toggle-building-picker" type="button" aria-expanded="${String(constructionUi.pickerOpen)}" aria-controls="mwi-building-picker-body"><span class="mwi-building-picker-plus" aria-hidden="true">＋</span><span><strong>${escapeHtml(constructionUi.pickerOpen ? t("closeBuildingPicker") : t("addBuilding"))}</strong><small class="mwi-building-level-status" data-known-count="${levels.knownCount}" data-total-count="${levels.totalCount}" data-complete="${String(levels.knownCount === levels.totalCount)}">${escapeHtml(status)}</small></span><span class="mwi-building-picker-chevron" aria-hidden="true">${constructionUi.pickerOpen ? "▴" : "▾"}</span></button><div id="mwi-building-picker-body" class="mwi-building-picker-body"${constructionUi.pickerOpen ? "" : " hidden"}>${renderPendingGuildBuilding(definitions)}<div class="mwi-building-pane-heading"><span><h4>${escapeHtml(t("buildingCatalog"))}</h4><small>${escapeHtml(unknownCount ? t("buildingLevelsPartialHint", { unknown: formatNumber(unknownCount) }) : t("buildingCatalogHint"))}</small></span><input data-role="building-search" type="search" placeholder="${escapeHtml(t("searchBuildings"))}" aria-label="${escapeHtml(t("searchBuildings"))}" value="${escapeHtml(state.buildingSearch)}"></div><div class="mwi-building-categories" role="group" aria-label="${escapeHtml(t("buildingCategoryFilter"))}">${categories}</div><div class="mwi-building-grid">${tiles}</div><div class="mwi-empty" data-role="building-filter-empty" role="status" aria-live="polite" aria-atomic="true" hidden></div></div></section>`;
    }

    function renderGuildConstructionActions(plan) {
      const disabled = plan.steps.length ? "" : " disabled";
      return `<div class="mwi-construction-actions"><button data-role="copy-building-plan" type="button"${disabled}>${escapeHtml(t("copyBuildingPlan"))}</button><button data-role="export-building-plan" type="button"${disabled}>${escapeHtml(t("exportBuildingCsv"))}</button><details class="mwi-construction-more"${plan.steps.length ? "" : " hidden"}><summary aria-label="${escapeHtml(t("moreConstructionActions"))}" title="${escapeHtml(t("moreConstructionActions"))}">•••</summary><div><button class="mwi-clear-building-plans" data-role="clear-building-plans" type="button">${escapeHtml(t("clearBuildingPlans"))}</button></div></details></div>`;
    }

    function renderGuildConstructionQueue(plan, definitions, spriteBaseHref) {
      const byHrid = new Map(definitions.map((definition) => [definition.hrid, definition]));
      const groups = plan.plans.map((buildingPlan, planIndex) => {
        const definition = byHrid.get(buildingPlan.buildingHrid);
        const label = guildBuildingLabel(definition);
        const expanded = constructionUi.expandedBuildingHrids.has(buildingPlan.buildingHrid);
        const stepsId = `mwi-building-steps-${String(buildingPlan.buildingHrid)
          .split("/")
          .pop()
          .replace(/[^a-z0-9_-]/gi, "-")}`;
        const options = Array.from(
          { length: definition.maxLevel - buildingPlan.startLevel },
          (_, index) => buildingPlan.startLevel + index + 1
        )
          .map(
            (level) =>
              `<option value="${level}"${level === buildingPlan.targetLevel ? " selected" : ""}>${escapeHtml(t("level", { level: formatNumber(level) }))}</option>`
          )
          .join("");
        const cutoffInGroup = buildingPlan.steps.some((step) => step.globalIndex === plan.firstOverBudgetIndex);
        const cutoff = cutoffInGroup
          ? `<div class="mwi-budget-cutoff"><span>${escapeHtml(
              t("constructionGroupBudgetCutoff", {
                level: formatNumber(buildingPlan.affordableTargetLevel),
                count: formatNumber(buildingPlan.nextStepShortfall || 0)
              })
            )}</span></div>`
          : "";
        const budgetStateKey =
          {
            unbudgeted: "constructionBudgetUnbudgeted",
            within: "constructionWithinBudget",
            partial: "constructionPartiallyWithinBudget",
            outside: "constructionOverBudget"
          }[buildingPlan.budgetState] || "constructionBudgetUnbudgeted";
        const steps = buildingPlan.steps
          .map(
            (step) =>
              `<div class="mwi-construction-step" data-over-budget="${String(step.fitsBudget === false)}"><span class="mwi-construction-step-index">${formatNumber(step.globalIndex + 1)}</span><span class="mwi-construction-step-copy"><small>${formatNumber(step.fromLevel)} → ${formatNumber(step.toLevel)} · ${escapeHtml(step.fitsBudget === false ? t("constructionOverBudget") : t("constructionWithinBudget"))}</small></span><span class="mwi-construction-step-cost">${formatNumber(step.cost)}</span></div>`
          )
          .join("");
        return `<li class="mwi-construction-group" data-sort-key="${escapeHtml(buildingPlan.buildingHrid)}" data-building-hrid="${escapeHtml(buildingPlan.buildingHrid)}" data-budget-state="${buildingPlan.budgetState}" data-expanded="${String(expanded)}" aria-posinset="${planIndex + 1}" aria-setsize="${plan.plans.length}"><div class="mwi-construction-row"><button class="mwi-construction-drag-handle" data-role="construction-drag-handle" data-building-hrid="${escapeHtml(buildingPlan.buildingHrid)}" type="button" aria-describedby="mwi-construction-sort-hint" aria-label="${escapeHtml(t("dragConstructionPlan", { building: label }))}" title="${escapeHtml(t("dragConstructionPlan", { building: label }))}"><span aria-hidden="true"></span></button><span class="mwi-construction-building-icon">${guildBuildingIconMarkup(definition, spriteBaseHref)}</span><span class="mwi-construction-identity"><strong title="${escapeHtml(label)}">${escapeHtml(label)}</strong><small>${escapeHtml(t("constructionPlanRowMeta", { position: formatNumber(planIndex + 1), start: formatNumber(buildingPlan.startLevel), target: formatNumber(buildingPlan.targetLevel), count: formatNumber(buildingPlan.steps.length) }))}</small></span><span class="mwi-construction-cost"><small>${escapeHtml(t("buildingPlanCost"))}</small><strong>${formatNumber(buildingPlan.totalCost)}</strong><em>${escapeHtml(t(budgetStateKey))}</em></span><div class="mwi-construction-row-actions"><label class="mwi-construction-target"><span>${escapeHtml(t("targetLevel"))}</span><select data-role="building-target" data-building-hrid="${escapeHtml(buildingPlan.buildingHrid)}" aria-label="${escapeHtml(t("buildingTargetLabel", { building: label }))}">${options}</select></label><button class="mwi-construction-level-button" data-role="adjust-building-target" data-building-hrid="${escapeHtml(buildingPlan.buildingHrid)}" data-delta="1" type="button" aria-label="${escapeHtml(t("increaseBuildingTarget", { building: label, count: formatNumber(1) }))}" title="${escapeHtml(t("increaseBuildingTarget", { building: label, count: formatNumber(1) }))}"${buildingPlan.targetLevel >= definition.maxLevel ? " disabled" : ""}>+1</button><button class="mwi-construction-level-button" data-role="adjust-building-target" data-building-hrid="${escapeHtml(buildingPlan.buildingHrid)}" data-delta="5" type="button" aria-label="${escapeHtml(t("increaseBuildingTarget", { building: label, count: formatNumber(5) }))}" title="${escapeHtml(t("increaseBuildingTarget", { building: label, count: formatNumber(5) }))}"${buildingPlan.targetLevel >= definition.maxLevel ? " disabled" : ""}>+5</button><span class="mwi-construction-order-actions"><button class="mwi-icon-button mwi-icon-up" data-role="move-building-plan" data-building-hrid="${escapeHtml(buildingPlan.buildingHrid)}" data-direction="-1" type="button" aria-label="${escapeHtml(t("movePlanUp", { building: label }))}" title="${escapeHtml(t("movePlanUp", { building: label }))}"${planIndex <= 0 ? " disabled" : ""}></button><button class="mwi-icon-button mwi-icon-down" data-role="move-building-plan" data-building-hrid="${escapeHtml(buildingPlan.buildingHrid)}" data-direction="1" type="button" aria-label="${escapeHtml(t("movePlanDown", { building: label }))}" title="${escapeHtml(t("movePlanDown", { building: label }))}"${planIndex >= plan.plans.length - 1 ? " disabled" : ""}></button></span><button class="mwi-construction-expand" data-role="toggle-building-steps" data-building-hrid="${escapeHtml(buildingPlan.buildingHrid)}" type="button" aria-expanded="${String(expanded)}" aria-controls="${stepsId}" aria-label="${escapeHtml(t(expanded ? "collapseBuildingSteps" : "expandBuildingSteps", { building: label }))}" title="${escapeHtml(t(expanded ? "collapseBuildingSteps" : "expandBuildingSteps", { building: label }))}"><span aria-hidden="true">${expanded ? "▴" : "▾"}</span></button><button class="mwi-construction-remove" data-role="remove-building-plan" data-building-hrid="${escapeHtml(buildingPlan.buildingHrid)}" type="button" aria-label="${escapeHtml(t("removeBuildingFromPlan", { building: label }))}" title="${escapeHtml(t("removeBuildingFromPlan", { building: label }))}">×</button></div></div>${cutoff}<div id="${stepsId}" class="mwi-construction-group-steps"${expanded ? "" : " hidden"}>${steps}</div></li>`;
      });
      return `<section class="mwi-construction-queue" aria-label="${escapeHtml(t("constructionQueue"))}"><div class="mwi-construction-queue-heading"><span><h4>${escapeHtml(t("constructionQueue"))}</h4><small id="mwi-construction-sort-hint">${escapeHtml(t("constructionQueueDragHint"))}</small></span><span class="mwi-construction-queue-meta"><small>${escapeHtml(t("constructionSummary", { buildings: formatNumber(plan.plans.length), steps: formatNumber(plan.steps.length) }))}</small>${renderGuildConstructionActions(plan)}</span></div>${groups.length ? `<ol class="mwi-construction-rail" data-role="construction-sort-list">${groups.join("")}</ol>` : `<div class="mwi-construction-empty"><strong>${escapeHtml(t("constructionQueueEmptyTitle"))}</strong><small>${escapeHtml(t("constructionQueueEmpty"))}</small></div>`}</section>`;
    }

    function renderGuildConstruction(plan, definitions) {
      const plansByHrid = new Map(state.buildingPlans.map((entry) => [entry.buildingHrid, entry]));
      const levels = guildBuildingLevelSnapshot(definitions);
      const spriteBaseHref = guildBuildingSpriteBaseHref();
      return `${renderGuildBuildingBudget(plan, definitions)}<div class="mwi-construction-layout" data-picker-open="${String(constructionUi.pickerOpen)}"><div class="mwi-construction-queue-pane">${renderGuildConstructionQueue(plan, definitions, spriteBaseHref)}</div>${renderGuildBuildingPicker(definitions, levels, plansByHrid, spriteBaseHref)}</div>`;
    }

    function applyGuildBuildingFilters(results) {
      if (!results) return 0;
      const normalizedSearch = state.buildingSearch.trim().toLocaleLowerCase(ui().locale);
      let visibleCount = 0;
      for (const tile of results.querySelectorAll(".mwi-building-tile")) {
        const matchesCategory = state.buildingCategory === "all" || tile.dataset.category === state.buildingCategory;
        const matchesSearch = !normalizedSearch || String(tile.dataset.buildingSearch || "").includes(normalizedSearch);
        tile.hidden = !(matchesCategory && matchesSearch);
        if (!tile.hidden) visibleCount += 1;
      }
      for (const button of results.querySelectorAll('[data-role="building-category"]')) {
        const active = button.dataset.category === state.buildingCategory;
        button.dataset.active = String(active);
        button.setAttribute("aria-pressed", String(active));
      }
      const empty = results.querySelector('[data-role="building-filter-empty"]');
      if (empty) {
        empty.textContent = visibleCount === 0 ? t("noBuildingMatches") : "";
        empty.hidden = visibleCount !== 0;
      }
      return visibleCount;
    }

    function refreshGuildConstructionBudgetPreview(panel) {
      const results = panel && panel.querySelector('[data-role="construction-results"]');
      if (!results) return;
      const definitions = guildBuildingDefinitions();
      const plan = guildBuildingPlan(definitions);
      const budget = results.querySelector(".mwi-construction-budget");
      if (budget) {
        const hasBudget = plan.availableGuildPoints !== null;
        const remaining = plan.remainingGuildPoints;
        budget.dataset.overBudget = String(Boolean(plan.overBudget));
        const spend = budget.querySelector('[data-role="construction-planned-spend"]');
        const affordableLabel = budget.querySelector('[data-role="construction-affordable-label"]');
        const affordable = budget.querySelector('[data-role="construction-affordable"]');
        const balanceLabel = budget.querySelector('[data-role="construction-balance-label"]');
        const balance = budget.querySelector('[data-role="construction-balance"]');
        const balanceMetric = budget.querySelector('[data-role="construction-balance-metric"]');
        const summary = budget.querySelector('[data-role="construction-budget-summary"]');
        if (spend) spend.textContent = formatNumber(plan.totalCost);
        if (affordableLabel) affordableLabel.textContent = hasBudget ? t("affordableUpgrades") : t("plannedUpgrades");
        if (affordable)
          affordable.textContent = hasBudget
            ? `${formatNumber(plan.affordableStepCount)} / ${formatNumber(plan.steps.length)}`
            : formatNumber(plan.steps.length);
        if (balanceLabel)
          balanceLabel.textContent = hasBudget && remaining < 0 ? t("overBudgetBy") : t("remainingPoints");
        if (balance) balance.textContent = hasBudget ? formatNumber(Math.abs(remaining)) : "-";
        if (balanceMetric) balanceMetric.dataset.state = hasBudget && remaining < 0 ? "danger" : "safe";
        if (summary) summary.textContent = guildConstructionBudgetSummary(plan, definitions);
      }
      const queuePane = results.querySelector(".mwi-construction-queue-pane");
      if (queuePane)
        queuePane.innerHTML = renderGuildConstructionQueue(plan, definitions, guildBuildingSpriteBaseHref());
    }

    function refreshGuildConstruction(panel) {
      hydrateBridgeData();
      extractItemDetailsFromReact();
      hydrateLocalInitData();
      const definitions = guildBuildingDefinitions();
      const plan = guildBuildingPlan(definitions);
      const status = panel.querySelector('[data-role="construction-status"]');
      const results = panel.querySelector('[data-role="construction-results"]');
      const statusText = status && status.querySelector('[data-role="construction-status-text"]');
      const undoButton = status && status.querySelector('[data-role="undo-clear-building-plans"]');
      if (statusText) statusText.textContent = state.buildingPlanNotice || "";
      else if (status) status.textContent = state.buildingPlanNotice || "";
      if (undoButton) undoButton.hidden = !hasGuildBuildingClearUndo();
      if (status) status.hidden = !state.buildingPlanNotice && !hasGuildBuildingClearUndo();
      updateRenderedMarkup(results, renderGuildConstruction(plan, definitions));
      applyGuildBuildingFilters(results);
    }

    function guildConstructionText(plan, definitions) {
      const byHrid = new Map(definitions.map((definition) => [definition.hrid, definition]));
      const budget = plan.availableGuildPoints === null ? "-" : formatNumber(plan.availableGuildPoints);
      const remaining = plan.remainingGuildPoints === null ? "-" : formatNumber(plan.remainingGuildPoints);
      return [
        t("guildConstruction"),
        `${t("guildPointBudget")}: ${budget}`,
        `${t("plannedSpend")}: ${formatNumber(plan.totalCost)}`,
        `${t("remainingPoints")}: ${remaining}`,
        "",
        ...plan.steps.map(
          (step, index) =>
            `${formatNumber(index + 1)}. ${guildBuildingLabel(byHrid.get(step.buildingHrid))} ${formatNumber(step.fromLevel)} → ${formatNumber(step.toLevel)} · ${formatNumber(step.cost)}`
        )
      ].join("\n");
    }

    async function copyGuildConstructionPlan(panel) {
      const definitions = guildBuildingDefinitions();
      const plan = guildBuildingPlan(definitions);
      const text = guildConstructionText(plan, definitions);
      try {
        if (
          !pageWindow.navigator ||
          !pageWindow.navigator.clipboard ||
          typeof pageWindow.navigator.clipboard.writeText !== "function"
        )
          throw new Error("clipboard unavailable");
        await pageWindow.navigator.clipboard.writeText(text);
        state.buildingPlanNotice = t("buildingPlanCopied");
      } catch (_) {
        state.buildingPlanNotice = t("buildingPlanCopyFailed");
      }
      refreshGuildConstruction(panel);
    }

    function exportGuildConstructionCsv() {
      const definitions = guildBuildingDefinitions();
      const plan = guildBuildingPlan(definitions);
      const byHrid = new Map(definitions.map((definition) => [definition.hrid, definition]));
      const escapeCsv = (value) => `"${String(value).replaceAll('"', '""')}"`;
      const rows = [
        [
          t("constructionOrder"),
          t("guildConstruction"),
          "HRID",
          t("fromLevel"),
          t("toLevel"),
          t("stepCost"),
          t("cumulativeCost"),
          t("constructionWithinBudget")
        ]
      ];
      for (let index = 0; index < plan.steps.length; index += 1) {
        const step = plan.steps[index];
        rows.push([
          index + 1,
          guildBuildingLabel(byHrid.get(step.buildingHrid)),
          step.buildingHrid,
          step.fromLevel,
          step.toLevel,
          step.cost,
          step.cumulativeCost,
          step.fitsBudget === false ? t("constructionOverBudget") : t("constructionWithinBudget")
        ]);
      }
      const csv = `\uFEFF${rows.map((row) => row.map(escapeCsv).join(",")).join("\r\n")}`;
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = t("buildingCsvFileName");
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      pageWindow.setTimeout(() => URL.revokeObjectURL(url), 0);
    }

    function dispose() {
      discardGuildBuildingClearUndo();
    }

    return {
      guildBuildingDefinitions,
      currentGuildBuildingLevel,
      addGuildBuildingPlan,
      setGuildBuildingTarget,
      removeGuildBuildingPlan,
      moveGuildBuildingPlan,
      reorderGuildBuildingPlan,
      setGuildBuildingPickerOpen,
      setPendingGuildBuildingStartValue,
      clearPendingGuildBuilding,
      toggleGuildBuildingSteps,
      clearGuildBuildingPlans,
      undoClearGuildBuildingPlans,
      hasGuildBuildingClearUndo,
      applyGuildBuildingFilters,
      refreshGuildConstructionBudgetPreview,
      refreshGuildConstruction,
      copyGuildConstructionPlan,
      exportGuildConstructionCsv,
      dispose
    };
  }

  return { createConstructionView };
});
