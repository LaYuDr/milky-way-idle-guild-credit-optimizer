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
      renderSettingsMarkup,
      refreshSettings,
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

    function panelViewEnabled(view) {
      return view !== "construction" || state.showConstructionView !== false;
    }

    function normalizedPanelOrder() {
      state.panelOrder = sortableApi.normalizeOrder(state.panelOrder, PANEL_VIEWS, DEFAULT_PANEL_ORDER);
      return state.panelOrder;
    }

    function visiblePanelOrder() {
      return normalizedPanelOrder().filter(panelViewEnabled);
    }

    function nearestVisiblePanelView(view) {
      const order = normalizedPanelOrder();
      const index = order.indexOf(view);
      for (let distance = 1; distance < order.length; distance += 1) {
        const after = order[index + distance];
        if (after && panelViewEnabled(after)) return after;
        const before = order[index - distance];
        if (before && panelViewEnabled(before)) return before;
      }
      return visiblePanelOrder()[0] || "credit";
    }

    function renderPanelTabs() {
      return normalizedPanelOrder()
        .map(
          (view) =>
            `<span class="mwi-view-tab-item" data-sort-key="${view}"${panelViewEnabled(view) ? "" : " hidden"}><button id="mwi-view-tab-${view}" class="mwi-view-tab${state.activeView === view ? " mwi-view-tab-active" : ""}" data-role="view-${view}" role="tab" aria-controls="mwi-view-panel-${view}" aria-selected="${String(state.activeView === view)}" tabindex="${state.activeView === view ? "0" : "-1"}" type="button">${escapeHtml(t(panelViewLabels[view]))}</button></span>`
        )
        .join("");
    }

    function reorderPanelView(panel, view, targetIndex) {
      const visibleOrder = visiblePanelOrder();
      const nextOrder = sortableApi.reorderVisibleByIndex(state.panelOrder, visibleOrder, view, targetIndex);
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
      const visibleOrder = visiblePanelOrder();
      const index = visibleOrder.indexOf(state.activeView);
      const previous = panel.querySelector('[data-role="move-active-view"][data-direction="-1"]');
      const next = panel.querySelector('[data-role="move-active-view"][data-direction="1"]');
      if (previous) previous.disabled = index <= 0;
      if (next) next.disabled = index < 0 || index >= visibleOrder.length - 1;
    }

    function syncPanelViewVisibility(panel) {
      for (const candidate of PANEL_VIEWS) {
        const enabled = panelViewEnabled(candidate);
        const item = panel.querySelector(`.mwi-view-tab-item[data-sort-key="${candidate}"]`);
        const tab = panel.querySelector(`[data-role="view-${candidate}"]`);
        const content = panel.querySelector(`[data-role="${candidate}-view"]`);
        if (item) item.hidden = !enabled;
        if (!enabled && tab) {
          tab.setAttribute("aria-selected", "false");
          tab.setAttribute("tabindex", "-1");
          tab.classList.remove("mwi-view-tab-active");
        }
        if (!enabled && content) content.hidden = true;
      }
      updatePanelOrderButtons(panel);
    }

    function findConstructionControl(panel, target) {
      if (!target || !target.role) return null;
      return Array.from(panel.querySelectorAll(`[data-role="${target.role}"]`)).find((element) => {
        if (target.buildingHrid && element.dataset.buildingHrid !== target.buildingHrid) return false;
        if (target.direction !== undefined && element.dataset.direction !== String(target.direction)) return false;
        if (target.delta !== undefined && element.dataset.delta !== String(target.delta)) return false;
        return !element.disabled && !element.hidden && !element.closest("[hidden]");
      });
    }

    function focusConstructionControl(panel, target, reveal = true) {
      const control = findConstructionControl(panel, target);
      if (!control) return false;
      try {
        control.focus({ preventScroll: true });
      } catch (_) {
        control.focus();
      }
      if (reveal && typeof control.scrollIntoView === "function") {
        control.scrollIntoView({ block: "nearest", inline: "nearest" });
        const controlRect = control.getBoundingClientRect();
        const panelRect = panel.getBoundingClientRect();
        const viewportHeight = document.defaultView ? document.defaultView.innerHeight : panelRect.bottom;
        const visibleTop = Math.max(0, panelRect.top);
        const visibleBottom = Math.min(viewportHeight, panelRect.bottom);
        if (controlRect.top < visibleTop) panel.scrollTop += controlRect.top - visibleTop;
        else if (controlRect.bottom > visibleBottom) panel.scrollTop += controlRect.bottom - visibleBottom;
      }
      return true;
    }

    function refreshConstructionAndFocus(panel, target, fallbackTarget = null) {
      refreshGuildConstruction(panel);
      return focusConstructionControl(panel, target) || focusConstructionControl(panel, fallbackTarget);
    }

    function setGuildPointBudgetValidity(panel, input, valid) {
      const error = panel.querySelector("#mwi-guild-point-budget-error");
      if (valid) input.removeAttribute("aria-invalid");
      else input.setAttribute("aria-invalid", "true");
      if (error) error.hidden = valid;
    }

    function guildPointBudgetInputValue(input) {
      const raw = input.value.trim();
      if (raw === "") return { valid: true, value: null };
      const value = Number(raw);
      return Number.isSafeInteger(value) && value >= 0
        ? { valid: true, value }
        : { valid: false, value: state.manualGuildPoints };
    }

    function clearConstructionNotice(panel) {
      state.buildingPlanNotice = "";
      const status = panel.querySelector('[data-role="construction-status"]');
      const statusText = status && status.querySelector('[data-role="construction-status-text"]');
      if (statusText) statusText.textContent = "";
      if (status) status.hidden = !hasGuildBuildingClearUndo();
    }

    function setPanelView(panel, view) {
      const selectedView = normalizePanelView(view);
      if (!panelViewEnabled(selectedView)) return false;
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
      const persisted = persistPluginUiState();
      updatePanelOrderButtons(panel);
      if (selectedView === "upgrade") refreshGuildUpgrade(panel);
      else if (selectedView === "construction") refreshGuildConstruction(panel);
      else refreshPanel(panel);
      return persisted;
    }

    function setSettingsStatus(panel, key) {
      const status = panel.querySelector('[data-role="settings-status"]');
      if (status) {
        status.textContent = key ? t(key) : "";
        status.dataset.error = String(key === "settingsSaveFailed");
      }
    }

    function setSettingsOpen(panel, open, { restoreFocus = false } = {}) {
      state.settingsOpen = Boolean(open);
      const trigger = panel.querySelector('[data-role="toggle-settings"]');
      const settings = panel.querySelector('[data-role="settings-panel"]');
      if (settings) settings.hidden = !state.settingsOpen;
      if (trigger) {
        trigger.setAttribute("aria-expanded", String(state.settingsOpen));
        const label = t(state.settingsOpen ? "closeInterfaceSettings" : "openInterfaceSettings");
        trigger.setAttribute("aria-label", label);
        trigger.setAttribute("title", label);
      }
      if (state.settingsOpen) {
        const refreshedSettings = refreshSettings(panel);
        const firstControl =
          refreshedSettings &&
          (refreshedSettings.querySelector('[data-role="settings-shrine-autofill"]') ||
            refreshedSettings.querySelector('[data-role="settings-show-construction"]') ||
            refreshedSettings.querySelector('[data-role="settings-close"]'));
        if (firstControl) {
          try {
            firstControl.focus({ preventScroll: true });
          } catch (_) {
            firstControl.focus();
          }
          if (typeof firstControl.scrollIntoView === "function")
            firstControl.scrollIntoView({ block: "nearest", inline: "nearest" });
        }
      }
      if (restoreFocus && trigger) trigger.focus();
    }

    function setConstructionViewVisibility(panel, visible) {
      state.showConstructionView = Boolean(visible);
      if (!state.showConstructionView && state.activeView === "construction") {
        setPanelView(panel, nearestVisiblePanelView("construction"));
      }
      syncPanelViewVisibility(panel);
      const persisted = persistPluginUiState();
      setSettingsStatus(
        panel,
        persisted === false
          ? "settingsSaveFailed"
          : state.showConstructionView
            ? "constructionViewShown"
            : "constructionViewHidden"
      );
    }

    function updatePriceReferenceButtons(panel) {
      for (const button of panel.querySelectorAll('[data-role="price-reference"]')) {
        const active = button.dataset.priceReference === state.priceReference;
        button.dataset.active = String(active);
        button.setAttribute("aria-pressed", String(active));
      }
    }

    function createPanel() {
      const savedActiveView = state.activeView;
      normalizedPanelOrder();
      if (!panelViewEnabled(state.activeView)) state.activeView = nearestVisiblePanelView(state.activeView);
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
          <button class="mwi-icon-button mwi-settings-trigger" data-role="toggle-settings" type="button" aria-expanded="${String(state.settingsOpen)}" aria-controls="mwi-settings-panel" aria-label="${escapeHtml(t(state.settingsOpen ? "closeInterfaceSettings" : "openInterfaceSettings"))}" title="${escapeHtml(t(state.settingsOpen ? "closeInterfaceSettings" : "openInterfaceSettings"))}"><span aria-hidden="true">&#9881;</span></button>
        </div>
        ${renderSettingsMarkup()}
        <div id="mwi-view-panel-credit" data-role="credit-view" role="tabpanel" aria-labelledby="mwi-view-tab-credit"${state.activeView === "credit" ? "" : " hidden"}>
          <div class="mwi-controls">
            <label>${escapeHtml(t("targetCredits"))}<input data-role="target" type="number" min="1" step="1" value="${state.targetCredit}"></label>
            <div class="mwi-price-reference" role="group" aria-label="${escapeHtml(t("marketReference"))}"><span class="mwi-price-reference-label">${escapeHtml(t("priceReference"))}</span><button data-role="price-reference" data-price-reference="a" type="button" title="${escapeHtml(priceReference("a").title)}">${escapeHtml(priceReference("a").label)}</button><button data-role="price-reference" data-price-reference="b" type="button" title="${escapeHtml(priceReference("b").title)}">${escapeHtml(priceReference("b").label)}</button></div>
            <button data-role="refresh" type="button">${escapeHtml(t("refreshEstimate"))}</button>
            <label class="mwi-inline-filter" title="${escapeHtml(t("excludeSageItemsHint"))}"><input data-role="exclude-sage-items" type="checkbox"${state.excludeSageItems ? " checked" : ""}><span>${escapeHtml(t("excludeSageItems"))}</span></label>
          </div>
          <div class="mwi-status" data-role="status">${escapeHtml(t("waitingExchangeRules"))}</div>
          <div data-role="results"></div>
        </div>
        <div id="mwi-view-panel-upgrade" data-role="upgrade-view" role="tabpanel" aria-labelledby="mwi-view-tab-upgrade"${state.activeView === "upgrade" ? "" : " hidden"}>
          <section class="mwi-upgrade-planner" aria-label="${escapeHtml(t("guildShrineBatchPlan"))}">
            <div class="mwi-upgrade-preset">
              <div class="mwi-upgrade-preset-copy"><strong>${escapeHtml(t("guildShrineBatchPlan"))}</strong><small data-role="guild-shrine-target-status" role="status" aria-live="polite">${escapeHtml(t("shrineLevelsReading"))}</small></div>
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
          <div class="mwi-status mwi-construction-status" data-role="construction-status" hidden><span data-role="construction-status-text" role="status" aria-live="polite" aria-atomic="true"></span><button data-role="undo-clear-building-plans" type="button" hidden>${escapeHtml(t("undoClearBuildingPlans"))}</button></div>
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
      panel.querySelector('[data-role="exclude-sage-items"]').addEventListener("change", (event) => {
        state.excludeSageItems = event.target.checked;
        persistPluginUiState();
        refreshPanel(panel);
        refreshGuildUpgrade(panel);
        refreshGuildExchangeAdvisor(true);
      });
      const settingsTrigger = panel.querySelector('[data-role="toggle-settings"]');
      const settingsPanel = panel.querySelector('[data-role="settings-panel"]');
      settingsTrigger.addEventListener("click", () => setSettingsOpen(panel, !state.settingsOpen));
      settingsPanel.querySelector('[data-role="settings-close"]').addEventListener("click", () => {
        setSettingsOpen(panel, false, { restoreFocus: true });
      });
      settingsPanel.addEventListener("keydown", (event) => {
        if (event.key !== "Escape" || !state.settingsOpen) return;
        event.preventDefault();
        event.stopPropagation();
        setSettingsOpen(panel, false, { restoreFocus: true });
      });
      settingsPanel.addEventListener("change", (event) => {
        if (event.target.matches('[data-role="settings-shrine-autofill"]')) {
          const guildBuffHrid = event.target.dataset.guildBuffHrid;
          if (!guildBuffEntries().some((entry) => entry.hrid === guildBuffHrid)) return;
          if (event.target.checked) state.guildShrineAutofillExcludedBuffHrids.delete(guildBuffHrid);
          else state.guildShrineAutofillExcludedBuffHrids.add(guildBuffHrid);
          const persisted = persistPluginUiState();
          setSettingsStatus(panel, persisted === false ? "settingsSaveFailed" : "settingsSaved");
          if (state.activeView === "upgrade") refreshGuildUpgrade(panel);
          return;
        }
        if (event.target.matches('[data-role="settings-show-construction"]')) {
          setConstructionViewVisibility(panel, event.target.checked);
        }
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
        const index = visiblePanelOrder().indexOf(state.activeView);
        reorderPanelView(panel, state.activeView, index + Number(button.dataset.direction));
      });
      updatePanelOrderButtons(panel);
      panel.querySelector(".mwi-view-tabs").addEventListener("keydown", (event) => {
        if (event.altKey) return;
        const tabs = Array.from(panel.querySelectorAll(".mwi-view-tab-item:not([hidden]) .mwi-view-tab"));
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
          const parsed = guildPointBudgetInputValue(event.target);
          setGuildPointBudgetValidity(panel, event.target, parsed.valid);
          if (!parsed.valid) return;
          state.manualGuildPoints = parsed.value;
          clearConstructionNotice(panel);
          refreshGuildConstructionBudgetPreview(panel);
          return;
        }
        if (event.target.matches('[data-role="pending-building-start-level"]')) {
          setPendingGuildBuildingStartValue(event.target.value);
          event.target.removeAttribute("aria-invalid");
          const error = panel.querySelector("#mwi-pending-building-level-error");
          if (error) error.hidden = true;
          return;
        }
        if (event.target.matches('[data-role="building-search"]')) {
          state.buildingSearch = event.target.value;
          applyGuildBuildingFilters(constructionResults);
        }
      });
      constructionResults.addEventListener("change", (event) => {
        if (event.target.matches('[data-role="guild-point-budget"]')) {
          const parsed = guildPointBudgetInputValue(event.target);
          setGuildPointBudgetValidity(panel, event.target, parsed.valid);
          if (!parsed.valid) return;
          state.manualGuildPoints = parsed.value;
          clearConstructionNotice(panel);
          persistGuildBuildingPlannerState();
          refreshConstructionAndFocus(panel, { role: "guild-point-budget" }, null);
          return;
        }
        if (event.target.matches('[data-role="building-search"]')) {
          state.buildingSearch = event.target.value;
          applyGuildBuildingFilters(constructionResults);
          return;
        }
        if (event.target.matches('[data-role="building-target"]')) {
          const buildingHrid = event.target.dataset.buildingHrid;
          setGuildBuildingTarget(guildBuildingDefinitions(), buildingHrid, Number(event.target.value));
          refreshConstructionAndFocus(panel, { role: "building-target", buildingHrid });
        }
      });
      constructionResults.addEventListener("submit", (event) => {
        const form = event.target.closest('[data-role="pending-building-start"]');
        if (!form) return;
        event.preventDefault();
        const input = form.querySelector('[data-role="pending-building-start-level"]');
        if (!input) return;
        setPendingGuildBuildingStartValue(input.value);
        const buildingHrid = form.dataset.buildingHrid;
        const result = addGuildBuildingPlan(guildBuildingDefinitions(), buildingHrid, input.value);
        if (result.status === "added") {
          refreshConstructionAndFocus(panel, { role: "building-target", buildingHrid });
          return;
        }
        refreshConstructionAndFocus(panel, { role: "pending-building-start-level", buildingHrid });
      });
      constructionResults.addEventListener("keydown", (event) => {
        if (event.key !== "Escape" || !event.target.closest(".mwi-building-picker-body")) return;
        event.preventDefault();
        setGuildBuildingPickerOpen(false);
        refreshConstructionAndFocus(panel, { role: "toggle-building-picker" });
      });
      constructionResults.addEventListener("click", (event) => {
        const button = event.target.closest("button");
        if (!button) return;
        const definitions = guildBuildingDefinitions();
        if (button.matches('[data-role="toggle-building-picker"]')) {
          const open = button.getAttribute("aria-expanded") !== "true";
          setGuildBuildingPickerOpen(open);
          refreshConstructionAndFocus(panel, { role: open ? "building-search" : "toggle-building-picker" });
          return;
        }
        if (button.matches('[data-role="building-tile"]')) {
          const buildingHrid = button.dataset.buildingHrid;
          const result = addGuildBuildingPlan(definitions, buildingHrid);
          if (result.status === "added") {
            refreshConstructionAndFocus(panel, { role: "building-target", buildingHrid });
            return;
          }
          if (result.status === "already_planned") {
            focusConstructionControl(panel, { role: "building-target", buildingHrid });
            return;
          }
          if (result.status === "requires_start_level")
            refreshConstructionAndFocus(panel, { role: "pending-building-start-level", buildingHrid });
          return;
        }
        if (button.matches('[data-role="cancel-pending-building"]')) {
          const buildingHrid = button.dataset.buildingHrid;
          clearPendingGuildBuilding();
          const focused = refreshConstructionAndFocus(
            panel,
            { role: "building-tile", buildingHrid },
            { role: "building-search" }
          );
          if (!focused) focusConstructionControl(panel, { role: "toggle-building-picker" });
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
          if (!existing) return;
          const delta = Number(button.dataset.delta || 0);
          const targetLevel = Math.min(definition.maxLevel, existing.targetLevel + delta);
          setGuildBuildingTarget(definitions, definition.hrid, targetLevel);
          refreshConstructionAndFocus(
            panel,
            { role: "adjust-building-target", buildingHrid: definition.hrid, delta },
            { role: "building-target", buildingHrid: definition.hrid }
          );
          return;
        }
        if (button.matches('[data-role="remove-building-plan"]')) {
          const result = removeGuildBuildingPlan(definitions, button.dataset.buildingHrid);
          if (result.status !== "removed") return;
          const neighbor = state.buildingPlans[Math.min(result.removedIndex, state.buildingPlans.length - 1)];
          refreshConstructionAndFocus(
            panel,
            neighbor
              ? { role: "building-target", buildingHrid: neighbor.buildingHrid }
              : { role: "toggle-building-picker" }
          );
          return;
        }
        if (button.matches('[data-role="move-building-plan"]')) {
          const buildingHrid = button.dataset.buildingHrid;
          if (moveGuildBuildingPlan(buildingHrid, Number(button.dataset.direction)))
            refreshConstructionAndFocus(panel, { role: "construction-drag-handle", buildingHrid });
          return;
        }
        if (button.matches('[data-role="toggle-building-steps"]')) {
          const buildingHrid = button.dataset.buildingHrid;
          const definition = definitions.find((entry) => entry.hrid === buildingHrid);
          if (!definition) return;
          const expanded = toggleGuildBuildingSteps(buildingHrid);
          const group = button.closest(".mwi-construction-group");
          const details = group && group.querySelector(".mwi-construction-group-steps");
          if (group) group.dataset.expanded = String(expanded);
          if (details) details.hidden = !expanded;
          button.setAttribute("aria-expanded", String(expanded));
          button.setAttribute(
            "aria-label",
            t(expanded ? "collapseBuildingSteps" : "expandBuildingSteps", {
              building: definitions.find((entry) => entry.hrid === buildingHrid)?.nameKey
                ? t(definition.nameKey)
                : buildingHrid
            })
          );
          button.setAttribute("title", button.getAttribute("aria-label"));
          const icon = button.querySelector("span");
          if (icon) icon.textContent = expanded ? "▴" : "▾";
          return;
        }
        if (button.matches('[data-role="clear-building-plans"]')) {
          if (
            clearGuildBuildingPlans(() => {
              const undo = panel.querySelector('[data-role="undo-clear-building-plans"]');
              if (!undo) return;
              if (document.activeElement === undo) {
                const restored = focusConstructionControl(panel, { role: "toggle-building-picker" });
                if (!restored) panel.querySelector('[data-role="view-construction"]')?.focus();
              }
              undo.hidden = true;
            })
          )
            refreshConstructionAndFocus(panel, { role: "undo-clear-building-plans" });
          return;
        }
        if (button.matches('[data-role="copy-building-plan"]')) {
          void copyGuildConstructionPlan(panel).then(() => {
            if (state.activeView !== "construction") return;
            if (document.activeElement && document.activeElement !== document.body) return;
            focusConstructionControl(panel, { role: "copy-building-plan" });
          });
          return;
        }
        if (button.matches('[data-role="export-building-plan"]')) exportGuildConstructionCsv();
      });
      panel.querySelector('[data-role="undo-clear-building-plans"]').addEventListener("click", () => {
        if (!undoClearGuildBuildingPlans()) return;
        const firstPlan = state.buildingPlans[0];
        refreshConstructionAndFocus(
          panel,
          firstPlan
            ? { role: "building-target", buildingHrid: firstPlan.buildingHrid }
            : { role: "toggle-building-picker" }
        );
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
        itemSelector: ".mwi-view-tab-item:not([hidden])",
        handleSelector: ".mwi-view-tab-item:not([hidden])",
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
          refreshConstructionAndFocus(panel, { role: "construction-drag-handle", buildingHrid: key });
        }
      });
      panel.__mwiSortableControllers = [tabSortable, constructionSortable];
      sortableControllers.push(tabSortable, constructionSortable);
      if (state.activeView !== savedActiveView) persistPluginUiState();
      checkPluginUpdate(panel);
      return panel;
    }

    function destroyPanel(panel) {
      const controllers = Array.isArray(panel && panel.__mwiSortableControllers) ? panel.__mwiSortableControllers : [];
      for (const controller of controllers) {
        const index = sortableControllers.indexOf(controller);
        if (index >= 0) sortableControllers.splice(index, 1);
        controller.destroy();
      }
      if (panel) delete panel.__mwiSortableControllers;
    }

    function recreatePanel(previousPanel) {
      const active = previousPanel && previousPanel.contains(document.activeElement) ? document.activeElement : null;
      const focusSnapshot = active
        ? { id: active.id || "", role: active.dataset.role || "", dataset: { ...active.dataset } }
        : null;
      const scrollTop = previousPanel ? previousPanel.scrollTop : 0;
      destroyPanel(previousPanel);
      if (previousPanel) previousPanel.remove();
      const panel = createPanel();
      Promise.resolve().then(() => {
        if (!panel.isConnected) return;
        panel.scrollTop = scrollTop;
        if (!focusSnapshot) return;
        const candidates = Array.from(panel.querySelectorAll(focusSnapshot.role ? "[data-role]" : "[id]"));
        const target = candidates.find((candidate) => {
          if (focusSnapshot.role && candidate.dataset.role !== focusSnapshot.role) return false;
          if (!focusSnapshot.role && candidate.id !== focusSnapshot.id) return false;
          return Object.entries(focusSnapshot.dataset).every(([key, value]) => candidate.dataset[key] === value);
        });
        if (!target || target.disabled || target.closest("[hidden]")) return;
        try {
          target.focus({ preventScroll: true });
        } catch (_) {
          target.focus();
        }
      });
      return panel;
    }

    function dispose() {
      for (const controller of sortableControllers.splice(0)) controller.destroy();
    }

    return { createPanel, recreatePanel, dispose };
  }

  return { createPanelShell };
});
