(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MwiGuildCreditPanelShell = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function createPanelShell(dependencies) {
    const {
      state,
      document,
      stylesApi,
      sortableApi,
      t,
      escapeHtml,
      PANEL_VIEWS,
      DEFAULT_PANEL_ORDER,
      CREDIT_TYPES,
      FALLBACK_INSTALL_URL,
      priceReference,
      normalizePanelView,
      persistPluginUiState,
      checkPluginUpdate,
      refreshPanel,
      refreshGuildUpgrade,
      refreshGuildConstruction,
      refreshGuildExchangeAdvisor,
      renderGuildTokenCreditPlanToggle,
      renderGuildTokenBudgetControl,
      updateGuildTokenCreditPlanButton,
      setGuildTokenBudget,
      setShrineGuideEnabled,
      guildBuffEntries,
      currentGuildBuffLevel,
      applyGuildShrineTargets,
      addGuildUpgradePlan,
      clearGuildUpgradePlans,
      removeGuildUpgradePlan,
      guildTokenCreditSelectionState,
      guildBuildingDefinitions,
      currentGuildBuildingLevel,
      setGuildBuildingTarget,
      moveGuildBuildingPlan,
      reorderGuildBuildingPlan,
      applyGuildBuildingFilters,
      refreshGuildConstructionBudgetPreview,
      copyGuildConstructionPlan,
      exportGuildConstructionCsv,
      persistGuildBuildingPlannerState,
      setPriceReference,
      openMarketplaceForItem
    } = dependencies;
    const sortableControllers = [];

    const panelViewLabels = {
      upgrade: "shrineUpgrade",
      credit: "creditValue",
      construction: "guildConstruction"
    };

    function renderPanelTabs() {
      state.panelOrder = sortableApi.normalizeOrder(state.panelOrder, PANEL_VIEWS, DEFAULT_PANEL_ORDER);
      return state.panelOrder
        .map(
          (view) =>
            `<span class="mwi-view-tab-item" data-sort-key="${view}"><button id="mwi-view-tab-${view}" class="mwi-view-tab${state.activeView === view ? " mwi-view-tab-active" : ""}" data-role="view-${view}" role="tab" aria-controls="mwi-view-panel-${view}" aria-selected="${String(state.activeView === view)}" tabindex="${state.activeView === view ? "0" : "-1"}" type="button">${escapeHtml(t(panelViewLabels[view]))}</button></span>`
        )
        .join("");
    }

    function reorderPanelView(panel, view, targetIndex) {
      const fromIndex = state.panelOrder.indexOf(view);
      const nextOrder = sortableApi.reorderByIndex(state.panelOrder, fromIndex, targetIndex);
      if (nextOrder.every((candidate, index) => candidate === state.panelOrder[index])) return false;
      state.panelOrder = nextOrder;
      const tabList = panel.querySelector(".mwi-view-tabs");
      for (const candidate of state.panelOrder) {
        const item = tabList.querySelector(`[data-sort-key="${candidate}"]`);
        if (item) tabList.append(item);
      }
      persistPluginUiState();
      updatePanelOrderButtons(panel);
      return true;
    }

    function updatePanelOrderButtons(panel) {
      const index = state.panelOrder.indexOf(state.activeView);
      const previous = panel.querySelector('[data-role="move-active-view"][data-direction="-1"]');
      const next = panel.querySelector('[data-role="move-active-view"][data-direction="1"]');
      if (previous) previous.disabled = index <= 0;
      if (next) next.disabled = index < 0 || index >= state.panelOrder.length - 1;
    }

    function setPanelView(panel, view) {
      const selectedView = normalizePanelView(view);
      for (const candidate of PANEL_VIEWS) {
        const content = panel.querySelector(`[data-role="${candidate}-view"]`);
        const tab = panel.querySelector(`[data-role="view-${candidate}"]`);
        const active = candidate === selectedView;
        if (content) content.hidden = !active;
        if (tab) {
          tab.setAttribute("aria-selected", String(active));
          tab.setAttribute("tabindex", active ? "0" : "-1");
          tab.classList.toggle("mwi-view-tab-active", active);
        }
      }
      panel.dataset.activeView = selectedView;
      state.activeView = selectedView;
      persistPluginUiState();
      updatePanelOrderButtons(panel);
      if (selectedView === "upgrade") refreshGuildUpgrade(panel);
      else if (selectedView === "construction") refreshGuildConstruction(panel);
      else refreshPanel(panel);
    }

    function updatePriceReferenceButtons(panel) {
      for (const button of panel.querySelectorAll('[data-role="price-reference"]')) {
        const active = button.dataset.priceReference === state.priceReference;
        button.dataset.active = String(active);
        button.setAttribute("aria-pressed", String(active));
      }
    }

    function createPanel() {
      const panel = document.createElement("section");
      panel.id = "mwi-credit-optimizer";
      panel.dataset.activeView = state.activeView;
      panel.innerHTML = `
        <style>
          ${stylesApi.PANEL_STYLES}
        </style>
        <h3>${escapeHtml(t("panelTitle"))}</h3>
        <div class="mwi-plugin-version" data-role="version-status" aria-live="polite"></div>
        <div class="mwi-view-tabs-shell">
          <div class="mwi-view-tabs" role="tablist" aria-label="${escapeHtml(t("panelViewOrder"))}">${renderPanelTabs()}</div>
          <div class="mwi-view-order-actions" role="group" aria-label="${escapeHtml(t("panelViewOrder"))}"><button class="mwi-icon-button mwi-icon-left" data-role="move-active-view" data-direction="-1" type="button" aria-label="${escapeHtml(t("moveViewLeft"))}" title="${escapeHtml(t("moveViewLeft"))}"></button><button class="mwi-icon-button mwi-icon-right" data-role="move-active-view" data-direction="1" type="button" aria-label="${escapeHtml(t("moveViewRight"))}" title="${escapeHtml(t("moveViewRight"))}"></button></div>
        </div>
        <div id="mwi-view-panel-credit" data-role="credit-view" role="tabpanel" aria-labelledby="mwi-view-tab-credit"${state.activeView === "credit" ? "" : " hidden"}>
          <div class="mwi-controls">
            <label>${escapeHtml(t("targetCredits"))}<input data-role="target" type="number" min="1" step="1" value="${state.targetCredit}"></label>
            <div class="mwi-price-reference" role="group" aria-label="${escapeHtml(t("marketReference"))}"><span class="mwi-price-reference-label">${escapeHtml(t("priceReference"))}</span><button data-role="price-reference" data-price-reference="a" type="button" title="${escapeHtml(priceReference("a").title)}">${escapeHtml(priceReference("a").label)}</button><button data-role="price-reference" data-price-reference="b" type="button" title="${escapeHtml(priceReference("b").title)}">${escapeHtml(priceReference("b").label)}</button></div>
            <button data-role="refresh" type="button">${escapeHtml(t("refreshEstimate"))}</button>
          </div>
          <div class="mwi-status" data-role="status">${escapeHtml(t("waitingExchangeRules"))}</div>
          <div data-role="results"></div>
        </div>
        <div id="mwi-view-panel-upgrade" data-role="upgrade-view" role="tabpanel" aria-labelledby="mwi-view-tab-upgrade"${state.activeView === "upgrade" ? "" : " hidden"}>
          <section class="mwi-upgrade-planner" aria-label="${escapeHtml(t("guildShrineBatchPlan"))}">
            <div class="mwi-upgrade-preset">
              <div class="mwi-upgrade-preset-copy"><strong>${escapeHtml(t("guildShrineBatchPlan"))}</strong><small data-role="guild-shrine-target-status">${escapeHtml(t("shrineLevelsReading"))}</small></div>
              <div class="mwi-upgrade-preset-buttons"><button data-role="set-guild-shrine-target" data-domain="life" type="button">${escapeHtml(t("setGuildLifeTarget"))}</button><button data-role="set-guild-shrine-target" data-domain="combat" type="button">${escapeHtml(t("setGuildCombatTarget"))}</button></div>
            </div>
            <div class="mwi-upgrade-plan-list" data-role="upgrade-plan-list"></div>
            <div class="mwi-upgrade-actions"><small data-role="upgrade-plan-count">${escapeHtml(t("selectedUpgradePlanCount", { count: "0" }))}</small><span><button data-role="add-upgrade-plan" type="button">＋ ${escapeHtml(t("addShrine"))}</button><button class="mwi-clear-upgrade-plans" data-role="clear-upgrade-plans" type="button">${escapeHtml(t("clearAll"))}</button></span></div>
          </section>
          <section class="mwi-shrine-guide-route" data-role="shrine-guide-route" data-active="${String(state.shrineGuideEnabled)}" data-status="inactive" aria-live="polite">
            <button class="mwi-shrine-guide-toggle" data-role="toggle-shrine-guide" type="button" aria-pressed="${String(state.shrineGuideEnabled)}"><span class="mwi-shrine-guide-beacon" aria-hidden="true"></span><span>${escapeHtml(state.shrineGuideEnabled ? t("guideDisable") : t("guideEnable"))}</span></button>
            <span class="mwi-shrine-guide-copy"><strong data-role="shrine-guide-title">${escapeHtml(t("guideReady"))}</strong><small data-role="shrine-guide-detail">${escapeHtml(t("guideReadyHint"))}</small></span>
          </section>
          ${renderGuildTokenBudgetControl()}
          ${renderGuildTokenCreditPlanToggle()}
          <div class="mwi-status" data-role="upgrade-status">${escapeHtml(t("waitingUpgradeRules"))}</div>
          <div data-role="upgrade-results"></div>
        </div>
        <div id="mwi-view-panel-construction" data-role="construction-view" role="tabpanel" aria-labelledby="mwi-view-tab-construction"${state.activeView === "construction" ? "" : " hidden"}>
          <div class="mwi-status" data-role="construction-status">${escapeHtml(t("constructionReadOnly"))}</div>
          <div data-role="construction-results"></div>
        </div>
        <footer class="mwi-plugin-footer">${escapeHtml(t("author"))}<br>${escapeHtml(t("support"))}<br><a href="${escapeHtml(FALLBACK_INSTALL_URL)}" target="_blank" rel="noopener noreferrer">${escapeHtml(t("fallbackInstaller"))}</a></footer>`;
      panel.querySelector('[data-role="refresh"]').addEventListener("click", () => refreshPanel(panel, true));
      panel.querySelector('[data-role="target"]').addEventListener("change", (event) => {
        const target = Number(event.target.value);
        if (Number.isSafeInteger(target) && target > 0) state.targetCredit = target;
        else event.target.value = String(state.targetCredit);
        persistPluginUiState();
        refreshPanel(panel);
      });
      panel.querySelector(".mwi-price-reference").addEventListener("click", (event) => {
        const button = event.target.closest('[data-role="price-reference"]');
        if (!button || button.dataset.priceReference === state.priceReference) return;
        setPriceReference(button.dataset.priceReference);
        updatePriceReferenceButtons(panel);
        refreshPanel(panel);
        refreshGuildUpgrade(panel);
        refreshGuildExchangeAdvisor();
      });
      updatePriceReferenceButtons(panel);
      panel.querySelector('[data-role="results"]').addEventListener("click", (event) => {
        const target = event.target && (event.target.nodeType === 1 ? event.target : event.target.parentElement);
        if (!target) return;
        const tokenToggle = target.closest('[data-role="toggle-token-values"]');
        if (tokenToggle) {
          const tokenSection = tokenToggle.closest(".mwi-token-value-section");
          const tokenBody = tokenSection && tokenSection.querySelector(".mwi-token-value-body");
          if (!tokenSection || !tokenBody) return;
          state.guildTokenValuesCollapsed = !state.guildTokenValuesCollapsed;
          tokenSection.dataset.collapsed = String(state.guildTokenValuesCollapsed);
          tokenToggle.setAttribute("aria-expanded", String(!state.guildTokenValuesCollapsed));
          const tokenIcon = tokenToggle.querySelector(".mwi-collapse-icon");
          if (tokenIcon) tokenIcon.textContent = state.guildTokenValuesCollapsed ? "▸" : "▾";
          tokenBody.hidden = state.guildTokenValuesCollapsed;
          persistPluginUiState();
          return;
        }
        const toggle = target.closest('[data-role="toggle-credit-section"]');
        const section = toggle && toggle.closest("[data-credit-item-hrid]");
        if (!section) return;
        const creditItemHrid = section.dataset.creditItemHrid;
        const collapsed = !state.collapsedCreditSections.has(creditItemHrid);
        if (collapsed) state.collapsedCreditSections.add(creditItemHrid);
        else state.collapsedCreditSections.delete(creditItemHrid);
        section.dataset.collapsed = String(collapsed);
        toggle.setAttribute("aria-expanded", String(!collapsed));
        const icon = toggle.querySelector(".mwi-collapse-icon");
        if (icon) icon.textContent = collapsed ? "▸" : "▾";
        const body = section.querySelector(".mwi-credit-body");
        if (body) body.hidden = collapsed;
        persistPluginUiState();
      });
      panel.querySelector('[data-role="view-credit"]').addEventListener("click", () => setPanelView(panel, "credit"));
      panel.querySelector('[data-role="view-upgrade"]').addEventListener("click", () => setPanelView(panel, "upgrade"));
      panel
        .querySelector('[data-role="view-construction"]')
        .addEventListener("click", () => setPanelView(panel, "construction"));
      panel.querySelector(".mwi-view-order-actions").addEventListener("click", (event) => {
        const button = event.target.closest('[data-role="move-active-view"]');
        if (!button) return;
        const index = state.panelOrder.indexOf(state.activeView);
        reorderPanelView(panel, state.activeView, index + Number(button.dataset.direction));
      });
      updatePanelOrderButtons(panel);
      panel.querySelector(".mwi-view-tabs").addEventListener("keydown", (event) => {
        if (event.altKey) return;
        const tabs = Array.from(panel.querySelectorAll(".mwi-view-tab"));
        const current = event.target.closest(".mwi-view-tab");
        const index = tabs.indexOf(current);
        if (index < 0) return;
        let nextIndex = index;
        if (event.key === "ArrowLeft") nextIndex = (index - 1 + tabs.length) % tabs.length;
        else if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
        else if (event.key === "Home") nextIndex = 0;
        else if (event.key === "End") nextIndex = tabs.length - 1;
        else return;
        event.preventDefault();
        tabs[nextIndex].focus();
        setPanelView(panel, tabs[nextIndex].dataset.role.replace("view-", ""));
      });
      const constructionResults = panel.querySelector('[data-role="construction-results"]');
      constructionResults.addEventListener("input", (event) => {
        if (event.target.matches('[data-role="guild-point-budget"]')) {
          const raw = event.target.value.trim();
          const value = Number(raw);
          if (raw === "") state.manualGuildPoints = null;
          else if (Number.isSafeInteger(value) && value >= 0) state.manualGuildPoints = value;
          else {
            event.target.setAttribute("aria-invalid", "true");
            return;
          }
          event.target.removeAttribute("aria-invalid");
          state.buildingPlanNotice = "";
          refreshGuildConstructionBudgetPreview(panel);
          return;
        }
        if (event.target.matches('[data-role="building-search"]')) {
          state.buildingSearch = event.target.value;
          applyGuildBuildingFilters(constructionResults);
        }
      });
      constructionResults.addEventListener("change", (event) => {
        if (event.target.matches('[data-role="guild-point-budget"]')) {
          const raw = event.target.value.trim();
          const value = Number(raw);
          if (raw === "") state.manualGuildPoints = null;
          else if (Number.isSafeInteger(value) && value >= 0) state.manualGuildPoints = value;
          else return refreshGuildConstruction(panel);
          state.buildingPlanNotice = "";
          persistGuildBuildingPlannerState();
          refreshGuildConstruction(panel);
          return;
        }
        if (event.target.matches('[data-role="building-search"]')) {
          state.buildingSearch = event.target.value;
          applyGuildBuildingFilters(constructionResults);
          return;
        }
        if (event.target.matches('[data-role="building-target"]')) {
          setGuildBuildingTarget(
            guildBuildingDefinitions(),
            event.target.dataset.buildingHrid,
            Number(event.target.value)
          );
          refreshGuildConstruction(panel);
        }
      });
      constructionResults.addEventListener("click", (event) => {
        const button = event.target.closest("button");
        if (!button) return;
        const definitions = guildBuildingDefinitions();
        if (button.matches('[data-role="select-building"]')) {
          if (!definitions.some((definition) => definition.hrid === button.dataset.buildingHrid)) return;
          state.selectedBuildingHrid = button.dataset.buildingHrid;
          refreshGuildConstruction(panel);
          return;
        }
        if (button.matches('[data-role="building-category"]')) {
          state.buildingCategory = button.dataset.category;
          persistGuildBuildingPlannerState();
          applyGuildBuildingFilters(constructionResults);
          return;
        }
        if (button.matches('[data-role="adjust-building-target"]')) {
          const definition = definitions.find((entry) => entry.hrid === button.dataset.buildingHrid);
          if (!definition) return;
          const existing = state.buildingPlans.find((plan) => plan.buildingHrid === definition.hrid);
          const startLevel = currentGuildBuildingLevel(definition) ?? (existing ? existing.startLevel : 0);
          const currentTarget = existing ? existing.targetLevel : startLevel;
          setGuildBuildingTarget(definitions, definition.hrid, currentTarget + Number(button.dataset.delta || 0));
          refreshGuildConstruction(panel);
          return;
        }
        if (button.matches('[data-role="remove-building-plan"]')) {
          const definition = definitions.find((entry) => entry.hrid === button.dataset.buildingHrid);
          if (!definition) return;
          const startLevel =
            currentGuildBuildingLevel(definition) ??
            state.buildingPlans.find((plan) => plan.buildingHrid === definition.hrid)?.startLevel ??
            0;
          setGuildBuildingTarget(definitions, definition.hrid, startLevel);
          refreshGuildConstruction(panel);
          return;
        }
        if (button.matches('[data-role="move-building-plan"]')) {
          if (moveGuildBuildingPlan(button.dataset.buildingHrid, Number(button.dataset.direction)))
            refreshGuildConstruction(panel);
          return;
        }
        if (button.matches('[data-role="clear-building-plans"]')) {
          state.buildingPlans = [];
          state.buildingPlanNotice = t("buildingPlanCleared");
          persistGuildBuildingPlannerState();
          refreshGuildConstruction(panel);
          return;
        }
        if (button.matches('[data-role="copy-building-plan"]')) {
          copyGuildConstructionPlan(panel);
          return;
        }
        if (button.matches('[data-role="export-building-plan"]')) exportGuildConstructionCsv();
      });
      panel.addEventListener("click", (event) => {
        const modeButton = event.target.closest('[data-role="toggle-credit-token-mode"]');
        if (modeButton) {
          const creditItemHrid = modeButton.dataset.creditHrid;
          if (!CREDIT_TYPES.some(([hrid]) => hrid === creditItemHrid)) return;
          if (state.guildTokenCreditHrids.has(creditItemHrid)) state.guildTokenCreditHrids.delete(creditItemHrid);
          else state.guildTokenCreditHrids.add(creditItemHrid);
          updateGuildTokenCreditPlanButton(panel);
          persistPluginUiState();
          refreshGuildUpgrade(panel);
          return;
        }
        const button = event.target.closest('[data-role="market-item-link"]');
        if (!button) return;
        event.preventDefault();
        event.stopPropagation();
        openMarketplaceForItem(button.dataset.itemHrid, button.dataset.itemName);
      });
      panel.querySelector('[data-role="add-upgrade-plan"]').addEventListener("click", () => {
        addGuildUpgradePlan(guildBuffEntries());
        persistPluginUiState();
        refreshGuildUpgrade(panel);
      });
      panel.querySelector('[data-role="clear-upgrade-plans"]').addEventListener("click", () => {
        clearGuildUpgradePlans();
        persistPluginUiState();
        refreshGuildUpgrade(panel);
      });
      panel
        .querySelector('[data-role="toggle-shrine-guide"]')
        .addEventListener("click", () => setShrineGuideEnabled(panel, !state.shrineGuideEnabled));
      const guildTokenBudgetControl = panel.querySelector('[data-role="guild-token-budget-control"]');
      const guildTokenBudgetRange = panel.querySelector('[data-role="guild-token-budget-range"]');
      guildTokenBudgetControl.addEventListener("input", (event) => {
        if (!event.target.matches('[data-role="guild-token-budget-range"], [data-role="guild-token-budget-number"]'))
          return;
        const snap = event.target === guildTokenBudgetRange && guildTokenBudgetRange.dataset.dragging === "true";
        setGuildTokenBudget(panel, event.target.value, { snap });
      });
      guildTokenBudgetRange.addEventListener("pointerdown", () => {
        guildTokenBudgetRange.dataset.dragging = "true";
      });
      for (const eventName of ["pointerup", "pointercancel", "blur"]) {
        guildTokenBudgetRange.addEventListener(eventName, () => {
          guildTokenBudgetRange.dataset.dragging = "false";
        });
      }
      const guildTokenCreditPlanToggle = panel.querySelector('[data-role="toggle-guild-token-credit-plan"]');
      if (guildTokenCreditPlanToggle) {
        guildTokenCreditPlanToggle.addEventListener("click", () => {
          const selectAll = !guildTokenCreditSelectionState().allSelected;
          state.guildTokenCreditHrids = new Set(selectAll ? CREDIT_TYPES.map(([hrid]) => hrid) : []);
          updateGuildTokenCreditPlanButton(panel);
          persistPluginUiState();
          refreshGuildUpgrade(panel);
        });
      }
      panel.querySelector(".mwi-upgrade-preset-buttons").addEventListener("click", (event) => {
        const button = event.target.closest('[data-role="set-guild-shrine-target"]');
        if (!button || button.disabled) return;
        if (!applyGuildShrineTargets(guildBuffEntries(), button.dataset.domain)) return;
        persistPluginUiState();
        refreshGuildUpgrade(panel);
      });
      panel.querySelector('[data-role="upgrade-plan-list"]').addEventListener("change", (event) => {
        const row = event.target.closest("[data-plan-id]");
        const plan = row && state.upgradePlans.find((candidate) => candidate.id === row.dataset.planId);
        if (!plan) return;
        const entries = guildBuffEntries();
        if (event.target.matches('[data-role="plan-buff"]')) {
          const targetHrid = event.target.value;
          if (
            state.upgradePlans.some((candidate) => candidate.id !== plan.id && candidate.guildBuffHrid === targetHrid)
          )
            return;
          const entry = entries.find((candidate) => candidate.hrid === targetHrid);
          if (!entry || currentGuildBuffLevel(entry) >= entry.maxLevel) return;
          plan.guildBuffHrid = entry.hrid;
          plan.startLevel = currentGuildBuffLevel(entry);
          plan.targetLevel = Math.min(plan.startLevel + 1, entry.maxLevel);
        } else if (event.target.matches('[data-role="plan-start"]')) {
          plan.startLevel = Number(event.target.value);
          const entry = entries.find((candidate) => candidate.hrid === plan.guildBuffHrid);
          plan.targetLevel = Math.max(plan.startLevel + 1, Math.min(plan.targetLevel, entry.maxLevel));
        } else if (event.target.matches('[data-role="plan-target"]')) {
          plan.targetLevel = Number(event.target.value);
        }
        state.suppressUpgradePlanAutofill = false;
        state.upgradePresetNotice = "";
        persistPluginUiState();
        refreshGuildUpgrade(panel);
      });
      panel.querySelector('[data-role="upgrade-plan-list"]').addEventListener("click", (event) => {
        const button = event.target.closest('[data-role="remove-plan"]');
        const row = button && button.closest("[data-plan-id]");
        if (!row) return;
        if (!removeGuildUpgradePlan(row.dataset.planId)) return;
        persistPluginUiState();
        refreshGuildUpgrade(panel);
      });
      const tabSortable = sortableApi.createPointerSortable({
        root: panel,
        containerSelector: ".mwi-view-tabs",
        itemSelector: ".mwi-view-tab-item",
        handleSelector: ".mwi-view-tab-item",
        axis: "x",
        onCommit: ({ key, toIndex }) => reorderPanelView(panel, key, toIndex)
      });
      const constructionSortable = sortableApi.createPointerSortable({
        root: panel,
        containerSelector: '[data-role="construction-sort-list"]',
        itemSelector: ".mwi-construction-group",
        handleSelector: ".mwi-construction-drag-handle",
        axis: "y",
        onCommit: ({ key, toIndex }) => {
          if (!reorderGuildBuildingPlan(key, toIndex)) return;
          refreshGuildConstruction(panel);
          const movedGroup = Array.from(panel.querySelectorAll(".mwi-construction-group")).find(
            (group) => group.dataset.sortKey === key
          );
          movedGroup?.querySelector(".mwi-construction-drag-handle")?.focus();
        }
      });
      panel.__mwiSortableControllers = [tabSortable, constructionSortable];
      sortableControllers.push(tabSortable, constructionSortable);
      checkPluginUpdate(panel);
      return panel;
    }

    function dispose() {
      for (const controller of sortableControllers.splice(0)) controller.destroy();
    }

    return { createPanel, dispose };
  }

  return { createPanelShell };
});
