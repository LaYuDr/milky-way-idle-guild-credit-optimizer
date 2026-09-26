(function (root, factory) {
  const commonjs = typeof module !== "undefined" && module.exports;
  const dom = commonjs ? require("./sidebar-dom.js") : root.MwiGuildCreditSidebarDom;
  const interaction = commonjs ? require("./sidebar-interaction.js") : root.MwiGuildCreditSidebarInteraction;
  const api = factory(dom, interaction);
  if (commonjs) module.exports = api;
  root.MwiGuildCreditSidebarIntegration = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (dom, interaction) {
  "use strict";

  const SIDEBAR_REPLACEMENT_EVENT = "mwi:guild-sidebar-replacing";
  const OWNER = "mwi-guild-credit-optimizer";
  const isSelected = (tab) => tab.getAttribute("aria-selected") === "true" || tab.classList.contains("Mui-selected");
  const ownsSelection = (tab) => tab.getAttribute("aria-selected") === "true" && tab.classList.contains("Mui-selected");
  const isAvailable = (tab) =>
    tab.matches('button,[role="tab"]') &&
    !tab.closest('[hidden],[inert],[aria-hidden="true"]') &&
    !tab.disabled &&
    tab.getAttribute("aria-disabled") !== "true" &&
    tab.getClientRects().length > 0;
  const isPrimaryAction = (event) =>
    !(event.button > 0 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey);

  // Own only the listeners for the current mount. Never reorder native or foreign tabs.
  function createLifecycle(options) {
    const { window: windowRef, state, onActivate, onDeactivate, onChange } = options;
    const documentRef = windowRef.document;
    const locate = dom.createIntegrationLocator(documentRef);
    const focusWrites = new Map();
    let integration = null;
    let observer = null;
    let observedRoot = null;
    let destroyed = false;

    function clickedTab(event) {
      const target = event.target?.nodeType === 1 ? event.target : event.target?.parentElement;
      return Array.from(integration?.tabBar.children || []).find((tab) => tab.contains(target));
    }

    function restoreFocusWrites() {
      for (const [tab, { previous, written }] of focusWrites) {
        if (tab.getAttribute("tabindex") !== written) continue;
        if (previous === null) tab.removeAttribute("tabindex");
        else tab.setAttribute("tabindex", previous);
      }
      focusWrites.clear();
    }

    function leave(event) {
      if (!isPrimaryAction(event)) return;
      const tab = clickedTab(event);
      if (tab && tab !== state.creditTab && isAvailable(tab)) {
        restoreFocusWrites();
        onDeactivate();
      }
    }

    function activate(event) {
      const tab = clickedTab(event);
      if (tab !== state.creditTab || !tab || !isAvailable(tab) || !isPrimaryAction(event)) return;
      if (tab.dataset.mwiCreditSuperseded === "true") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      tab.focus({ preventScroll: true });
      tab.scrollIntoView({ block: "nearest", inline: "nearest" });
      if (state.panel.hidden || !ownsSelection(tab)) onActivate(integration.panelHost, integration.tabBar);
    }

    function keydown(event) {
      const tab = clickedTab(event);
      if (!tab || !isPrimaryAction(event)) return;
      const tabs = Array.from(integration.tabBar.children).filter(isAvailable);
      const index = tabs.indexOf(tab);
      if (index < 0) return;
      const rtl = windowRef.getComputedStyle(integration.tabBar).direction === "rtl";
      let next;
      if (event.key === "ArrowRight") next = tabs[(index + (rtl ? tabs.length - 1 : 1)) % tabs.length];
      else if (event.key === "ArrowLeft") next = tabs[(index + (rtl ? 1 : tabs.length - 1)) % tabs.length];
      else if (event.key === "Home") next = tabs[0];
      else if (event.key === "End") next = tabs.at(-1);
      else if (event.key === "Enter" || event.key === " ") next = tab;
      else return;
      event.preventDefault();
      event.stopImmediatePropagation();
      for (const candidate of tabs) {
        const previous = focusWrites.has(candidate)
          ? focusWrites.get(candidate).previous
          : candidate.getAttribute("tabindex");
        const written = candidate === next ? "0" : "-1";
        focusWrites.set(candidate, { previous, written });
        if (candidate.getAttribute("tabindex") !== written) candidate.setAttribute("tabindex", written);
      }
      next.focus({ preventScroll: true });
      next.scrollIntoView({ block: "nearest", inline: "nearest" });
      // Focus moves without invoking another plugin's action (APG manual activation).
      if (event.key === "Enter" || event.key === " ") next.click();
    }

    function detachBar() {
      if (!integration) return;
      integration.tabBar.removeEventListener("click", activate, true);
      integration.tabBar.removeEventListener("keydown", keydown, true);
      interaction.disableSidebarTabWheelScrolling(integration.tabBar);
      restoreFocusWrites();
    }

    function mutations(records) {
      if (destroyed) return;
      if (state.creditTab?.dataset.mwiCreditSuperseded === "true") return onChange();
      if (!integration || !state.creditTab?.isConnected || !state.panel?.isConnected) return onChange();
      const relevant = records.some(({ target }) => {
        const element = target.nodeType === 1 ? target : target.parentElement;
        return (
          element === integration.panelHost ||
          element === integration.tabBar ||
          element === state.creditTab ||
          (integration.tabBar.contains(element) && !state.creditTab.contains(element)) ||
          element?.contains(integration.tabBar)
        );
      });
      if (!relevant) return;
      const others = Array.from(integration.tabBar.children).some(
        (tab) => tab !== state.creditTab && !tab.hidden && isSelected(tab)
      );
      if (!state.panel.hidden && (others || !ownsSelection(state.creditTab))) onDeactivate();
      onChange();
    }

    function watch(found) {
      if (destroyed) return;
      if (integration?.tabBar !== found?.tabBar) {
        detachBar();
        found?.tabBar.addEventListener("click", activate, true);
        found?.tabBar.addEventListener("keydown", keydown, true);
        if (found) interaction.enableSidebarTabWheelScrolling(found.tabBar);
      }
      integration = found;
      const root = found?.panelHost.parentElement?.parentElement || documentRef.documentElement;
      if (observedRoot === root) return;
      observer?.disconnect();
      observedRoot = root;
      observer = new windowRef.MutationObserver(mutations);
      observer.observe(root, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["class", "style", "hidden", "aria-selected"]
      });
    }

    // Leave before document/target capture handlers can stop event propagation.
    windowRef.addEventListener("click", leave, true);
    function destroy() {
      if (destroyed) return;
      destroyed = true;
      observer?.disconnect();
      detachBar();
      windowRef.removeEventListener("click", leave, true);
      onDeactivate();
      integration = null;
      observedRoot = null;
    }
    return { locate, watch, destroy };
  }

  // One owner for mounting, selection, scheduling and teardown. Feature views are callbacks.
  function createController(options) {
    const { window: windowRef, state, getLocale, getLabel, createPanel, recreatePanel } = options;
    const selection = interaction.createSelectionController(state);
    const coordinator = interaction.createDocumentActivationCoordinator(windowRef, OWNER, selection.hide);
    const lifecycle = createLifecycle({
      window: windowRef,
      state,
      onActivate: show,
      onDeactivate: selection.hide,
      onChange: schedule
    });
    let pending = null;
    let interval = null;
    let started = false;
    let destroyed = false;
    let resumeOpen = false;

    function replacementRequested(event) {
      if (event.detail === OWNER) destroy();
    }

    function show(panelHost, tabBar) {
      if (destroyed || !state.panel?.isConnected) return;
      coordinator.announce();
      selection.show(panelHost, tabBar);
      options.onActivate?.(state.panel);
    }

    function refresh() {
      if (destroyed) return false;
      if (state.creditTab?.dataset.mwiCreditSuperseded === "true") {
        destroy();
        return false;
      }
      const contentChanged = options.beforeRefresh?.();
      const found = lifecycle.locate(getLocale());
      lifecycle.watch(found);
      if (!found) return false;
      const { tabBar, tabPrototype, panelHost, detectedLocale } = found;
      if (detectedLocale) options.onLocale?.(detectedLocale);
      const locale = getLocale();
      const staleSelected = dom.suppressStaleMounts(found, state.creditTab, state.panel) || resumeOpen;
      resumeOpen = false;
      const localeChanged = Boolean(state.panel && state.panelLocale && state.panelLocale !== locale);
      const currentIntegrationMatches = Boolean(
        state.panel?.isConnected &&
        state.panel.parentElement === panelHost &&
        state.creditTab?.isConnected &&
        state.creditTab.parentElement === tabBar
      );
      if (currentIntegrationMatches && !localeChanged) {
        const label = getLabel();
        if (state.creditTab.textContent !== label) state.creditTab.textContent = label;
        if (staleSelected) show(panelHost, tabBar);
        else if (selection.isActive() && !selection.sync(panelHost, tabBar)) selection.hide();
        if (contentChanged && !state.panel.hidden) options.onRefresh?.(state.panel);
        return true;
      }

      const keepPanelOpen =
        staleSelected || Boolean(state.panel && !state.panel.hidden && state.creditTab && isSelected(state.creditTab));
      const tabHadFocus = state.creditTab === windowRef.document.activeElement;
      // Recreate before hide so the panel shell can snapshot its focus and scroll position.
      const replacement = localeChanged && state.panel ? recreatePanel(state.panel) : null;
      selection.hide();
      state.creditTab?.remove();
      const panel = replacement || state.panel || createPanel();
      panel.hidden = true;
      const tab = dom.createTab(tabPrototype, panel, getLabel());
      panelHost.append(panel);
      tabBar.append(tab);
      state.panel = panel;
      state.creditTab = tab;
      state.panelLocale = locale;
      options.onMount?.(panel);
      if (keepPanelOpen) show(panelHost, tabBar);
      if (tabHadFocus) tab.focus({ preventScroll: true });
      return true;
    }

    function schedule() {
      if (destroyed || pending !== null) return;
      pending = windowRef.setTimeout(() => {
        pending = null;
        refresh();
      }, 75);
    }

    function start() {
      if (started || destroyed) return;
      started = true;
      // Release an older controller synchronously, before acquiring any shared
      // styles. Equal inline values cannot prove ownership across instances.
      const documentRef = windowRef.document;
      resumeOpen = Array.from(documentRef.querySelectorAll('[data-mwi-credit-tab="true"]')).some(
        (tab) => dom.isOwnedSidebarTab(tab) && !tab.hidden && isSelected(tab)
      );
      documentRef.dispatchEvent(new windowRef.CustomEvent(SIDEBAR_REPLACEMENT_EVENT, { detail: OWNER }));
      documentRef.addEventListener(SIDEBAR_REPLACEMENT_EVENT, replacementRequested);
      interval = windowRef.setInterval(refresh, 3000);
      windowRef.addEventListener("resize", schedule, { passive: true });
      windowRef.addEventListener("orientationchange", schedule, { passive: true });
      refresh();
    }

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      windowRef.clearTimeout(pending);
      windowRef.clearInterval(interval);
      lifecycle.destroy();
      coordinator.destroy();
      windowRef.document.removeEventListener(SIDEBAR_REPLACEMENT_EVENT, replacementRequested);
      windowRef.removeEventListener("resize", schedule);
      windowRef.removeEventListener("orientationchange", schedule);
      pending = null;
      interval = null;
    }
    return { start, refresh, destroy };
  }

  return { ...dom, ...interaction, SIDEBAR_REPLACEMENT_EVENT, createLifecycle, createController };
});
