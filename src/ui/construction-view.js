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
      return null;
    }

    function reconcileGuildBuildingPlans(definitions) {
      const byHrid = new Map(definitions.map((definition) => [definition.hrid, definition]));
      let changed = false;
      const reconciled = [];
      for (const plan of state.buildingPlans) {
        const definition = byHrid.get(plan.buildingHrid);
        if (!definition) {
          changed = true;
          continue;
        }
        const liveLevel = currentGuildBuildingLevel(definition);
        const startLevel =
          liveLevel === null ? Math.max(0, Math.min(definition.maxLevel, Number(plan.startLevel) || 0)) : liveLevel;
        const targetLevel = Math.max(0, Math.min(definition.maxLevel, Number(plan.targetLevel) || 0));
        if (targetLevel <= startLevel) {
          changed = true;
          continue;
        }
        if (startLevel !== plan.startLevel || targetLevel !== plan.targetLevel) changed = true;
        reconciled.push({ ...plan, startLevel, targetLevel });
      }
      if (changed) {
        state.buildingPlans = reconciled;
        persistGuildBuildingPlannerState();
      }
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

    function setGuildBuildingTarget(definitions, buildingHrid, targetLevel) {
      const definition = definitions.find((entry) => entry.hrid === buildingHrid);
      if (!definition) return false;
      const existingIndex = state.buildingPlans.findIndex((plan) => plan.buildingHrid === buildingHrid);
      const existing = existingIndex >= 0 ? state.buildingPlans[existingIndex] : null;
      const liveLevel = currentGuildBuildingLevel(definition);
      const startLevel = liveLevel === null ? (existing && existing.startLevel) || 0 : liveLevel;
      const target = Math.max(startLevel, Math.min(definition.maxLevel, Number(targetLevel) || startLevel));
      if (target <= startLevel) {
        if (existingIndex >= 0) state.buildingPlans.splice(existingIndex, 1);
      } else if (existing) {
        state.buildingPlans[existingIndex] = { ...existing, startLevel, targetLevel: target };
      } else {
        state.buildingPlans.push({
          id: `building-plan-${state.nextBuildingPlanId++}`,
          buildingHrid,
          startLevel,
          targetLevel: target
        });
      }
      state.buildingPlanNotice = "";
      persistGuildBuildingPlannerState();
      return true;
    }

    function moveGuildBuildingPlan(buildingHrid, direction) {
      const index = state.buildingPlans.findIndex((plan) => plan.buildingHrid === buildingHrid);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= state.buildingPlans.length) return false;
      const [plan] = state.buildingPlans.splice(index, 1);
      state.buildingPlans.splice(nextIndex, 0, plan);
      persistGuildBuildingPlannerState();
      return true;
    }

    function reorderGuildBuildingPlan(buildingHrid, targetIndex) {
      const index = state.buildingPlans.findIndex((plan) => plan.buildingHrid === buildingHrid);
      const nextIndex = Math.max(0, Math.min(state.buildingPlans.length - 1, Number(targetIndex)));
      if (index < 0 || !Number.isInteger(nextIndex) || index === nextIndex) return false;
      const [plan] = state.buildingPlans.splice(index, 1);
      state.buildingPlans.splice(nextIndex, 0, plan);
      state.buildingPlanNotice = t("buildingPlanReordered");
      persistGuildBuildingPlannerState();
      return true;
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

    function renderGuildBuildingBudget(plan) {
      const hasBudget = plan.availableGuildPoints !== null;
      const remaining = plan.remainingGuildPoints;
      const percentage =
        !hasBudget || plan.availableGuildPoints <= 0
          ? plan.totalCost > 0 && hasBudget
            ? 100
            : 0
          : Math.min(100, Math.round((plan.totalCost / plan.availableGuildPoints) * 100));
      const remainingLabel = !hasBudget ? "-" : formatNumber(Math.abs(remaining));
      const remainingTitle = hasBudget && remaining < 0 ? t("overBudgetBy") : t("remainingPoints");
      return `<section class="mwi-construction-budget" data-over-budget="${String(Boolean(plan.overBudget))}">
        <div class="mwi-construction-budget-input"><label><span>${escapeHtml(t("guildPointBudget"))}</span><input data-role="guild-point-budget" type="number" min="0" step="1" placeholder="${escapeHtml(t("budgetOptional"))}" value="${state.manualGuildPoints === null ? "" : state.manualGuildPoints}"></label><small>${escapeHtml(t("manualBudget"))}</small></div>
        <div class="mwi-construction-metric"><small>${escapeHtml(t("plannedSpend"))}</small><strong data-role="construction-planned-spend">${formatNumber(plan.totalCost)}</strong></div>
        <div class="mwi-construction-metric" data-role="construction-balance-metric" data-state="${hasBudget && remaining < 0 ? "danger" : "safe"}"><small data-role="construction-balance-label">${escapeHtml(remainingTitle)}</small><strong data-role="construction-balance">${remainingLabel}</strong></div>
        <div class="mwi-construction-metric"><small>${escapeHtml(t("constructionQueue"))}</small><strong data-role="construction-plan-scale">${escapeHtml(t("constructionPlanScale", { buildings: formatNumber(plan.plans.length), steps: formatNumber(plan.steps.length) }))}</strong></div>
        <div class="mwi-construction-meter" role="progressbar" aria-label="${escapeHtml(t("plannedSpend"))}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percentage}"><span style="width:${percentage}%"></span></div>
      </section>`;
    }

    function renderGuildBuildingTile(definition, plan, spriteBaseHref) {
      const liveLevel = currentGuildBuildingLevel(definition);
      const startLevel = liveLevel === null ? (plan && plan.startLevel) || 0 : liveLevel;
      const targetLevel = plan ? plan.targetLevel : startLevel;
      const currentLabel = liveLevel === null ? "?" : formatNumber(startLevel);
      const label = guildBuildingLabel(definition);
      const searchText =
        `${label} ${constructionCategoryLabel(definition.category)} ${definition.hrid}`.toLocaleLowerCase(ui().locale);
      const accessibleLabel = t("buildingTileLabel", {
        building: label,
        current: currentLabel,
        target: plan ? formatNumber(targetLevel) : t("notPlanned")
      });
      return `<button class="mwi-building-tile" data-role="select-building" data-building-hrid="${escapeHtml(definition.hrid)}" data-category="${definition.category}" data-planned="${String(Boolean(plan))}" data-selected="${String(state.selectedBuildingHrid === definition.hrid)}" data-building-search="${escapeHtml(searchText)}" aria-pressed="${String(state.selectedBuildingHrid === definition.hrid)}" aria-label="${escapeHtml(accessibleLabel)}" title="${escapeHtml(accessibleLabel)}" type="button">${guildBuildingIconMarkup(definition, spriteBaseHref)}<span class="mwi-building-level-badge" data-level-known="${String(liveLevel !== null)}">${currentLabel}</span>${plan ? `<span class="mwi-building-target-badge">${formatNumber(targetLevel)}</span>` : ""}<span class="mwi-building-tile-name">${escapeHtml(label)}</span></button>`;
    }

    function renderGuildBuildingEditor(definition, plan) {
      if (!definition)
        return `<div class="mwi-building-editor mwi-building-editor-empty">${escapeHtml(t("selectBuildingPrompt"))}</div>`;
      const liveLevel = currentGuildBuildingLevel(definition);
      const startLevel = liveLevel === null ? (plan && plan.startLevel) || 0 : liveLevel;
      const targetLevel = plan ? plan.targetLevel : startLevel;
      const cost = plan ? core.aggregateGuildBuildingLevelCosts(definition.levelCosts, startLevel, targetLevel) : null;
      const options = Array.from({ length: definition.maxLevel - startLevel + 1 }, (_, index) => startLevel + index)
        .map(
          (level) =>
            `<option value="${level}"${level === targetLevel ? " selected" : ""}>${escapeHtml(t("level", { level: formatNumber(level) }))}</option>`
        )
        .join("");
      const planIndex = state.buildingPlans.findIndex((candidate) => candidate.buildingHrid === definition.hrid);
      const fullLevel = startLevel >= definition.maxLevel;
      return `<section class="mwi-building-editor" data-building-hrid="${escapeHtml(definition.hrid)}" aria-label="${escapeHtml(t("buildingEditor"))}">
        <div class="mwi-building-editor-title"><strong>${escapeHtml(guildBuildingLabel(definition))}</strong><small>${escapeHtml(constructionCategoryLabel(definition.category))}</small></div>
        <span class="mwi-building-editor-metric"><small>${escapeHtml(t("currentLevel"))}</small><b>${liveLevel === null ? "?" : formatNumber(startLevel)}</b></span>
        <label class="mwi-building-editor-target"><small>${escapeHtml(t("targetLevel"))}</small><select data-role="building-target" data-building-hrid="${escapeHtml(definition.hrid)}"${fullLevel ? " disabled" : ""}>${options}</select></label>
        <span class="mwi-building-editor-metric"><small>${escapeHtml(t("buildingPlanCost"))}</small><b>${cost && cost.status === "ok" ? formatNumber(cost.totalCost) : "-"}</b></span>
        <div class="mwi-building-editor-actions"><button data-role="adjust-building-target" data-building-hrid="${escapeHtml(definition.hrid)}" data-delta="1" type="button"${targetLevel >= definition.maxLevel ? " disabled" : ""}>+1</button><button data-role="adjust-building-target" data-building-hrid="${escapeHtml(definition.hrid)}" data-delta="5" type="button"${targetLevel >= definition.maxLevel ? " disabled" : ""}>+5</button>${plan ? `<button class="mwi-icon-button mwi-icon-up" data-role="move-building-plan" data-building-hrid="${escapeHtml(definition.hrid)}" data-direction="-1" type="button" aria-label="${escapeHtml(t("movePlanUp"))}" title="${escapeHtml(t("movePlanUp"))}"${planIndex <= 0 ? " disabled" : ""}></button><button class="mwi-icon-button mwi-icon-down" data-role="move-building-plan" data-building-hrid="${escapeHtml(definition.hrid)}" data-direction="1" type="button" aria-label="${escapeHtml(t("movePlanDown"))}" title="${escapeHtml(t("movePlanDown"))}"${planIndex >= state.buildingPlans.length - 1 ? " disabled" : ""}></button><button class="mwi-building-remove" data-role="remove-building-plan" data-building-hrid="${escapeHtml(definition.hrid)}" type="button">${escapeHtml(t("removeBuildingPlan"))}</button>` : fullLevel ? `<span class="mwi-building-full-level">${escapeHtml(t("buildingMaxLevel"))}</span>` : ""}</div>
      </section>`;
    }

    function renderGuildConstructionQueue(plan, definitions) {
      if (!plan.steps.length)
        return `<section class="mwi-construction-queue"><h4>${escapeHtml(t("constructionQueue"))}</h4><div class="mwi-empty">${escapeHtml(t("constructionQueueEmpty"))}</div></section>`;
      const byHrid = new Map(definitions.map((definition) => [definition.hrid, definition]));
      let globalIndex = 0;
      const groups = plan.plans.map((buildingPlan) => {
        const definition = byHrid.get(buildingPlan.buildingHrid);
        const groupSteps = plan.steps.filter((step) => step.buildingHrid === buildingPlan.buildingHrid);
        const steps = groupSteps.map((step) => {
          const index = globalIndex++;
          const cutoff =
            index === plan.firstOverBudgetIndex
              ? `<div class="mwi-budget-cutoff"><span>${escapeHtml(t("constructionBudgetCutoff", { count: formatNumber(Math.max(0, plan.availableGuildPoints - (step.cumulativeCost - step.cost))) }))}</span></div>`
              : "";
          const status = step.fitsBudget === false ? t("constructionOverBudget") : t("constructionWithinBudget");
          return `${cutoff}<div class="mwi-construction-step" data-over-budget="${String(step.fitsBudget === false)}"><span class="mwi-construction-step-index">${formatNumber(index + 1)}</span><span class="mwi-construction-step-copy"><small>${formatNumber(step.fromLevel)} → ${formatNumber(step.toLevel)} · ${escapeHtml(status)}</small></span><span class="mwi-construction-step-cost">${formatNumber(step.cost)}</span></div>`;
        });
        return `<article class="mwi-construction-group" data-sort-key="${escapeHtml(buildingPlan.buildingHrid)}" data-building-hrid="${escapeHtml(buildingPlan.buildingHrid)}"><header><button class="mwi-construction-drag-handle" data-role="construction-drag-handle" type="button" aria-label="${escapeHtml(t("dragConstructionPlan", { building: guildBuildingLabel(definition) }))}" title="${escapeHtml(t("dragConstructionPlan", { building: guildBuildingLabel(definition) }))}"><span aria-hidden="true"></span></button><button class="mwi-construction-group-select" data-role="select-building" data-building-hrid="${escapeHtml(buildingPlan.buildingHrid)}" type="button"><strong>${escapeHtml(guildBuildingLabel(definition))}</strong><small>${formatNumber(buildingPlan.startLevel)} → ${formatNumber(buildingPlan.targetLevel)}</small></button><strong>${formatNumber(buildingPlan.totalCost)}</strong></header><div class="mwi-construction-group-steps">${steps.join("")}</div></article>`;
      });
      return `<section class="mwi-construction-queue"><div class="mwi-construction-queue-heading"><span><h4>${escapeHtml(t("constructionQueue"))}</h4><small>${escapeHtml(t("constructionQueueDragHint"))}</small></span><small>${escapeHtml(t("constructionSummary", { buildings: formatNumber(plan.plans.length), steps: formatNumber(plan.steps.length) }))}</small></div><div class="mwi-construction-rail" data-role="construction-sort-list">${groups.join("")}</div></section>`;
    }

    function renderGuildConstructionActions(plan) {
      return `<div class="mwi-construction-actions"><button data-role="copy-building-plan" type="button"${plan.steps.length ? "" : " disabled"}>${escapeHtml(t("copyBuildingPlan"))}</button><button data-role="export-building-plan" type="button"${plan.steps.length ? "" : " disabled"}>${escapeHtml(t("exportBuildingCsv"))}</button><button class="mwi-clear-building-plans" data-role="clear-building-plans" type="button"${plan.steps.length ? "" : " disabled"}>${escapeHtml(t("clearBuildingPlans"))}</button></div>`;
    }

    function renderGuildConstruction(plan, definitions) {
      const plansByHrid = new Map(state.buildingPlans.map((entry) => [entry.buildingHrid, entry]));
      const categories = ["all", "core", "life", "combat", "shrine"]
        .map(
          (category) =>
            `<button data-role="building-category" data-category="${category}" data-active="${String(category === state.buildingCategory)}" aria-pressed="${String(category === state.buildingCategory)}" type="button">${escapeHtml(constructionCategoryLabel(category))}</button>`
        )
        .join("");
      const spriteBaseHref = guildBuildingSpriteBaseHref();
      if (!definitions.some((definition) => definition.hrid === state.selectedBuildingHrid))
        state.selectedBuildingHrid = state.buildingPlans[0]?.buildingHrid || definitions[0]?.hrid || "";
      const tiles = definitions
        .map((definition) => renderGuildBuildingTile(definition, plansByHrid.get(definition.hrid), spriteBaseHref))
        .join("");
      const selectedDefinition = definitions.find((definition) => definition.hrid === state.selectedBuildingHrid);
      return `${renderGuildBuildingBudget(plan)}<div class="mwi-construction-layout"><section class="mwi-building-pane" aria-label="${escapeHtml(t("buildingCatalog"))}"><div class="mwi-building-pane-heading"><span><span class="mwi-building-heading-line"><h4>${escapeHtml(t("buildingCatalog"))}</h4><small class="mwi-building-level-status" data-levels-read="${String(Boolean(state.guildBuildingLevels))}">${escapeHtml(state.guildBuildingLevels ? t("buildingLevelsReadCompact") : t("buildingLevelsUnknownCompact"))}</small></span><small>${escapeHtml(t("buildingCatalogHint"))}</small></span><input data-role="building-search" type="search" placeholder="${escapeHtml(t("searchBuildings"))}" aria-label="${escapeHtml(t("searchBuildings"))}" value="${escapeHtml(state.buildingSearch)}"></div><div class="mwi-building-categories">${categories}</div><div class="mwi-building-grid">${tiles}</div><div class="mwi-empty" data-role="building-filter-empty" hidden>${escapeHtml(t("noBuildingMatches"))}</div>${renderGuildBuildingEditor(selectedDefinition, plansByHrid.get(state.selectedBuildingHrid))}</section><div class="mwi-construction-queue-pane">${renderGuildConstructionQueue(plan, definitions)}${renderGuildConstructionActions(plan)}</div></div>`;
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
      if (empty) empty.hidden = visibleCount !== 0;
      const selectedTile = results.querySelector(
        `.mwi-building-tile[data-building-hrid="${String(state.selectedBuildingHrid).replaceAll('"', '\\"')}"]`
      );
      const editor = results.querySelector(".mwi-building-editor");
      if (editor) editor.hidden = Boolean(selectedTile && selectedTile.hidden);
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
        const percentage =
          !hasBudget || plan.availableGuildPoints <= 0
            ? plan.totalCost > 0 && hasBudget
              ? 100
              : 0
            : Math.min(100, Math.round((plan.totalCost / plan.availableGuildPoints) * 100));
        budget.dataset.overBudget = String(Boolean(plan.overBudget));
        const spend = budget.querySelector('[data-role="construction-planned-spend"]');
        const balanceLabel = budget.querySelector('[data-role="construction-balance-label"]');
        const balance = budget.querySelector('[data-role="construction-balance"]');
        const balanceMetric = budget.querySelector('[data-role="construction-balance-metric"]');
        const scale = budget.querySelector('[data-role="construction-plan-scale"]');
        const meter = budget.querySelector(".mwi-construction-meter");
        if (spend) spend.textContent = formatNumber(plan.totalCost);
        if (balanceLabel)
          balanceLabel.textContent = hasBudget && remaining < 0 ? t("overBudgetBy") : t("remainingPoints");
        if (balance) balance.textContent = hasBudget ? formatNumber(Math.abs(remaining)) : "-";
        if (balanceMetric) balanceMetric.dataset.state = hasBudget && remaining < 0 ? "danger" : "safe";
        if (scale)
          scale.textContent = t("constructionPlanScale", {
            buildings: formatNumber(plan.plans.length),
            steps: formatNumber(plan.steps.length)
          });
        if (meter) {
          meter.setAttribute("aria-valuenow", String(percentage));
          const fill = meter.querySelector("span");
          if (fill) fill.style.width = `${percentage}%`;
        }
      }
      const queuePane = results.querySelector(".mwi-construction-queue-pane");
      if (queuePane)
        queuePane.innerHTML = `${renderGuildConstructionQueue(plan, definitions)}${renderGuildConstructionActions(plan)}`;
    }

    function refreshGuildConstruction(panel) {
      hydrateBridgeData();
      extractItemDetailsFromReact();
      hydrateLocalInitData();
      const definitions = guildBuildingDefinitions();
      const plan = guildBuildingPlan(definitions);
      const status = panel.querySelector('[data-role="construction-status"]');
      const results = panel.querySelector('[data-role="construction-results"]');
      status.textContent = state.buildingPlanNotice || "";
      status.hidden = !state.buildingPlanNotice;
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

    return {
      guildBuildingDefinitions,
      currentGuildBuildingLevel,
      setGuildBuildingTarget,
      moveGuildBuildingPlan,
      reorderGuildBuildingPlan,
      applyGuildBuildingFilters,
      refreshGuildConstructionBudgetPreview,
      refreshGuildConstruction,
      copyGuildConstructionPlan,
      exportGuildConstructionCsv
    };
  }

  return { createConstructionView };
});
