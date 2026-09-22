(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MwiGuildCreditSidebarIntegration = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const SIDEBAR_LABELS = {
    "zh-CN": ["库存", "装备", "技能", "房屋", "配装", "收获"],
    en: ["Inventory", "Equipment", "Skills", "House", "Loadout", "Loadouts", "Harvest", "Gathering"]
  };
  const EXPECTED_LABELS = new Set(Object.values(SIDEBAR_LABELS).flat());
  const SIDEBAR_ACTIVATION_EVENT = "mwi:sidebar-plugin-activated";
  const SIDEBAR_WHEEL_SCROLL_ATTRIBUTE = "data-mwi-sidebar-wheel-scroll";

  function enableSidebarTabWheelScrolling(tabBar) {
    if (!tabBar || typeof tabBar.addEventListener !== "function") return false;
    if (tabBar.getAttribute?.(SIDEBAR_WHEEL_SCROLL_ATTRIBUTE) === "true") return true;

    tabBar.setAttribute?.(SIDEBAR_WHEEL_SCROLL_ATTRIBUTE, "true");
    if (tabBar.style) {
      tabBar.style.maxWidth = "100%";
      tabBar.style.minWidth = "0";
      tabBar.style.overflowX = "auto";
      tabBar.style.overflowY = "hidden";
      tabBar.style.overscrollBehaviorInline = "contain";
      tabBar.style.scrollbarWidth = "none";
    }

    tabBar.addEventListener(
      "wheel",
      (event) => {
        if (event.ctrlKey) return;
        const maxScrollLeft = Math.max(0, Number(tabBar.scrollWidth) - Number(tabBar.clientWidth));
        if (maxScrollLeft <= 0) return;

        let delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
        if (!Number.isFinite(delta) || delta === 0) return;
        if (event.deltaMode === 1) delta *= 16;
        else if (event.deltaMode === 2) delta *= Math.max(1, Number(tabBar.clientWidth));

        const currentScrollLeft = Number(tabBar.scrollLeft) || 0;
        const nextScrollLeft = Math.min(maxScrollLeft, Math.max(0, currentScrollLeft + delta));
        if (nextScrollLeft === currentScrollLeft) return;
        event.preventDefault();
        tabBar.scrollLeft = nextScrollLeft;
      },
      { passive: false }
    );
    return true;
  }

  function createActivationCoordinator(options = {}) {
    const eventTarget = options.eventTarget;
    const CustomEventConstructor = options.CustomEvent;
    const owner = String(options.owner || "").trim();
    const onDeactivate = typeof options.onDeactivate === "function" ? options.onDeactivate : () => {};
    let started = false;

    function handleActivation(event) {
      const activeOwner = typeof event?.detail === "string" ? event.detail : "";
      if (activeOwner && activeOwner !== owner) onDeactivate(activeOwner);
    }

    function start() {
      if (started) return true;
      if (!owner || typeof eventTarget?.addEventListener !== "function") return false;
      eventTarget.addEventListener(SIDEBAR_ACTIVATION_EVENT, handleActivation);
      started = true;
      return true;
    }

    function announce() {
      if (!started) start();
      if (
        !started ||
        typeof eventTarget?.dispatchEvent !== "function" ||
        typeof CustomEventConstructor !== "function"
      ) {
        return false;
      }
      eventTarget.dispatchEvent(new CustomEventConstructor(SIDEBAR_ACTIVATION_EVENT, { detail: owner }));
      return true;
    }

    function destroy() {
      if (!started) return;
      eventTarget.removeEventListener(SIDEBAR_ACTIVATION_EVENT, handleActivation);
      started = false;
    }

    return Object.freeze({ start, announce, destroy });
  }

  function createDocumentActivationCoordinator(windowRef, owner, onDeactivate) {
    const coordinator = createActivationCoordinator({
      eventTarget: windowRef?.document,
      CustomEvent: windowRef?.CustomEvent,
      owner,
      onDeactivate
    });
    coordinator.start();
    return coordinator;
  }

  function integrationForCustomTab(tab) {
    const tabBar = tab?.parentElement;
    const tabsRoot = tabBar?.parentElement?.parentElement?.parentElement;
    const sidebar = tabsRoot?.parentElement;
    const panelHost =
      sidebar && Array.from(sidebar.children || []).find((node) => /tabPanelsContainer/.test(String(node.className)));
    return tabBar && panelHost ? { tabBar, panelHost } : null;
  }

  function sidebarLocale(labels) {
    const counts = { "zh-CN": 0, en: 0 };
    for (const label of Array.isArray(labels) ? labels : []) {
      if (SIDEBAR_LABELS["zh-CN"].includes(label)) counts["zh-CN"] += 1;
      else if (SIDEBAR_LABELS.en.includes(label)) counts.en += 1;
    }
    if (counts["zh-CN"] === counts.en) return null;
    return counts["zh-CN"] > counts.en ? "zh-CN" : "en";
  }

  function findSidebarIntegration(documentRef, preferredLocale) {
    if (!documentRef || typeof documentRef.getElementsByTagName !== "function") return null;
    const elements = documentRef.getElementsByTagName("*");
    let bestIntegration = null;
    for (let index = 0; index < elements.length; index += 1) {
      const candidate = elements[index];
      const children = Array.from(candidate.children || []);
      if (children.length < 4) continue;
      const tabs = children.map((element) => ({
        element,
        label: String(element.innerText || element.textContent || "")
          .replaceAll("\n", "")
          .trim()
      }));
      const recognized = tabs.filter((tab) => EXPECTED_LABELS.has(tab.label));
      if (recognized.length < 4) continue;
      const detectedLocale = sidebarLocale(recognized.map((tab) => tab.label));
      const prototypeLabels =
        (detectedLocale || preferredLocale) === "zh-CN" ? ["库存", "Inventory"] : ["Inventory", "库存"];
      const prototype = recognized.find((tab) => prototypeLabels.includes(tab.label)) || recognized[0];
      const tabsRoot = candidate.parentElement?.parentElement?.parentElement;
      const sidebar = tabsRoot && tabsRoot.parentElement;
      const panelHost =
        sidebar &&
        Array.from(sidebar.children || []).find(
          (node) => node !== tabsRoot && /tabPanelsContainer/.test(String(node.className))
        );
      if (!panelHost) continue;
      const rect = candidate.getBoundingClientRect();
      const visible = candidate.isConnected && rect.width > 0 && rect.height > 0;
      const integration = {
        tabBar: candidate,
        tabPrototype: prototype.element,
        panelHost,
        detectedLocale,
        score: (visible ? 1000 : 0) + recognized.length
      };
      if (!bestIntegration || integration.score > bestIntegration.score) bestIntegration = integration;
    }
    return bestIntegration;
  }

  function createIntegrationLocator(documentRef, now = Date.now, find = findSidebarIntegration) {
    let cached = null;
    let scannedAt = -Infinity;
    return function locate(locale) {
      const tabBar = cached?.tabBar;
      const current = tabBar && integrationForCustomTab(cached.tabPrototype);
      const rect = tabBar?.getBoundingClientRect();
      const valid =
        tabBar?.isConnected &&
        cached.panelHost.isConnected &&
        cached.tabPrototype.parentElement === tabBar &&
        current?.panelHost === cached.panelHost &&
        rect.width > 0 &&
        rect.height > 0;
      if (!valid || now() - scannedAt >= 30000) {
        cached = find(documentRef, locale);
        scannedAt = now();
      } else {
        cached.detectedLocale = sidebarLocale(
          Array.from(tabBar.children, (tab) =>
            String(tab.textContent || "")
              .replaceAll("\n", "")
              .trim()
          )
        );
      }
      return cached;
    };
  }

  function suppressStaleMounts(integration, tab, panel) {
    let selected = false;
    const documentRef = integration.tabBar.ownerDocument;
    const stale = [
      ...Array.from(documentRef.querySelectorAll('[data-mwi-credit-tab="true"]')).filter((node) => node !== tab),
      ...Array.from(documentRef.querySelectorAll("#mwi-credit-optimizer,[data-mwi-credit-stale-panel]")).filter(
        (node) => node !== panel
      )
    ];
    for (const node of stale) {
      selected ||= node.getAttribute("aria-selected") === "true" && !node.hidden;
      if (node.dataset.mwiCreditSuperseded === "true" && node.hidden) continue;
      node.dataset.mwiCreditSuperseded = "true";
      if (node.id === "mwi-credit-optimizer") node.dataset.mwiCreditStalePanel = "true";
      node.hidden = true;
      node.inert = true;
      node.classList.remove("Mui-selected");
      node.setAttribute("aria-hidden", "true");
      node.setAttribute("aria-selected", "false");
      node.setAttribute("tabindex", "-1");
      // Old panel descendants have fixed IDs too; never let them shadow the live panel.
      for (const identified of [node, ...node.querySelectorAll("[id]")]) identified.removeAttribute("id");
    }
    return selected;
  }

  function prepareTab(tab, panel) {
    tab.id = "mwi-credit-sidebar-tab";
    tab.hidden = false;
    tab.inert = false;
    for (const name of ["disabled", "aria-disabled", "aria-hidden", "data-mwi-credit-superseded"])
      tab.removeAttribute(name);
    tab.classList.remove("Mui-selected");
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-selected", "false");
    tab.setAttribute("aria-controls", panel.id);
    tab.tabIndex = -1;
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", tab.id);
    panel.tabIndex = 0;
  }

  function createSelectionController(state) {
    const hiddenNodes = new Map();
    const tabStates = new Map();
    function hide() {
      if (state.panel) state.panel.hidden = true;
      const creditTab = state.creditTab;
      if (creditTab) {
        creditTab.classList.remove("Mui-selected");
        creditTab.setAttribute("aria-selected", "false");
        creditTab.tabIndex = -1;
      }
      for (const [node, display] of hiddenNodes) {
        // A different plugin may have already changed display. Only undo our own write.
        if (node.isConnected && node.style.display === "none") node.style.display = display;
      }
      hiddenNodes.clear();
      const otherSelected = Array.from(creditTab?.parentElement?.children || []).some(
        (tab) =>
          tab !== creditTab && (tab.getAttribute("aria-selected") === "true" || tab.classList.contains("Mui-selected"))
      );
      for (const [tab, previous] of tabStates) {
        if (!tab.isConnected) continue;
        if (tab.tabIndex === -1) {
          if (previous.tabindex === null) tab.removeAttribute("tabindex");
          else tab.setAttribute("tabindex", previous.tabindex);
        }
        if (!otherSelected) {
          tab.classList.toggle("Mui-selected", previous.selected);
          if (previous.aria === null) tab.removeAttribute("aria-selected");
          else tab.setAttribute("aria-selected", previous.aria);
        }
      }
      tabStates.clear();
    }
    function show(panelHost, tabBar) {
      hide();
      for (const node of panelHost.children) {
        if (node === state.panel) continue;
        hiddenNodes.set(node, node.style.display);
        node.style.display = "none";
      }
      for (const tab of tabBar.children) {
        if (tab === state.creditTab || tab.hidden) continue;
        tabStates.set(tab, {
          tabindex: tab.getAttribute("tabindex"),
          aria: tab.getAttribute("aria-selected"),
          selected: tab.classList.contains("Mui-selected")
        });
        tab.classList.remove("Mui-selected");
        tab.setAttribute("aria-selected", "false");
        tab.tabIndex = -1;
      }
      state.panel.hidden = false;
      state.creditTab.classList.add("Mui-selected");
      state.creditTab.setAttribute("aria-selected", "true");
      state.creditTab.tabIndex = 0;
    }
    return { hide, show };
  }

  function createLifecycle(options) {
    const { window: windowRef, state, onActivate, onDeactivate, onChange } = options;
    const documentRef = windowRef.document;
    const locate = createIntegrationLocator(documentRef);
    let integration = null;
    let observer = null;
    let observedRoot = null;
    let destroyed = false;
    const elementTarget = (event) => (event.target?.nodeType === 1 ? event.target : event.target?.parentElement);
    const eligibleTabs = () =>
      Array.from(integration?.tabBar.children || []).filter(
        (tab) =>
          tab.matches('button,[role="tab"]') &&
          !tab.hidden &&
          !tab.disabled &&
          tab.getAttribute("aria-disabled") !== "true" &&
          tab.getClientRects().length
      );
    function clickedTab(event) {
      const target = elementTarget(event);
      return Array.from(integration?.tabBar.children || []).find((tab) => tab.contains(target));
    }
    function leave(event) {
      const tab = clickedTab(event);
      if (tab && tab !== state.creditTab && !tab.hidden && event.button !== 2) onDeactivate();
    }
    function activate(event) {
      const tab = clickedTab(event);
      if (tab !== state.creditTab || !tab || tab.hidden || tab.dataset.mwiCreditSuperseded === "true") return;
      if (event.button > 0 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      tab.focus({ preventScroll: true });
      if (state.panel.hidden || tab.getAttribute("aria-selected") !== "true")
        onActivate(integration.panelHost, integration.tabBar);
    }
    function keydown(event) {
      const tab = clickedTab(event);
      if (!tab || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const tabs = eligibleTabs();
      const index = tabs.indexOf(tab);
      if (index < 0) return;
      let next;
      const rtl = windowRef.getComputedStyle(integration.tabBar).direction === "rtl";
      if (event.key === "ArrowRight") next = tabs[(index + (rtl ? tabs.length - 1 : 1)) % tabs.length];
      else if (event.key === "ArrowLeft") next = tabs[(index + (rtl ? 1 : tabs.length - 1)) % tabs.length];
      else if (event.key === "Home") next = tabs[0];
      else if (event.key === "End") next = tabs.at(-1);
      else if (event.key === "Enter" || event.key === " ") next = tab;
      else return;
      event.preventDefault();
      event.stopImmediatePropagation();
      // Manual activation: moving focus must not invoke another plugin's action.
      for (const candidate of tabs) candidate.tabIndex = candidate === next ? 0 : -1;
      next.focus({ preventScroll: true });
      next.scrollIntoView({ block: "nearest", inline: "nearest" });
      if (event.key === "Enter" || event.key === " ") next.click();
    }
    function watch(found) {
      if (destroyed) return;
      if (integration?.tabBar !== found?.tabBar) {
        for (const type of ["pointerdown", "click"]) integration?.tabBar.removeEventListener(type, activate, true);
        integration?.tabBar.removeEventListener("keydown", keydown, true);
        for (const type of ["pointerdown", "click"]) found?.tabBar.addEventListener(type, activate, true);
        found?.tabBar.addEventListener("keydown", keydown, true);
      }
      integration = found;
      const root = found?.panelHost.parentElement?.parentElement || documentRef.documentElement;
      if (observedRoot === root) return;
      observer?.disconnect();
      observedRoot = root;
      observer = new windowRef.MutationObserver((records) => {
        if (state.creditTab?.dataset.mwiCreditSuperseded === "true") return;
        if (!integration || !state.creditTab?.isConnected || !state.panel?.isConnected) return onChange();
        const relevant = records.some(({ target }) => {
          const element = target.nodeType === 1 ? target : target.parentElement;
          return (
            element === integration.panelHost ||
            element === integration.tabBar ||
            (integration.tabBar.contains(element) &&
              element !== state.creditTab &&
              !state.creditTab?.contains(element)) ||
            element?.contains(integration.tabBar)
          );
        });
        if (!relevant) return;
        const others = Array.from(integration.tabBar.children).some(
          (tab) =>
            tab !== state.creditTab &&
            !tab.hidden &&
            (tab.getAttribute("aria-selected") === "true" || tab.classList.contains("Mui-selected"))
        );
        if (!state.panel.hidden && (others || state.creditTab.getAttribute("aria-selected") !== "true")) onDeactivate();
        onChange();
      });
      observer.observe(root, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["class", "style", "hidden", "aria-selected"]
      });
    }
    // Run before document/target handlers, even when they stop bubbling.
    windowRef.addEventListener("pointerdown", leave, true);
    windowRef.addEventListener("click", leave, true);
    function destroy() {
      destroyed = true;
      observer?.disconnect();
      for (const type of ["pointerdown", "click"]) {
        windowRef.removeEventListener(type, leave, true);
        integration?.tabBar.removeEventListener(type, activate, true);
      }
      integration?.tabBar.removeEventListener("keydown", keydown, true);
      onDeactivate();
    }
    return { locate, watch, destroy };
  }

  return {
    SIDEBAR_LABELS,
    SIDEBAR_ACTIVATION_EVENT,
    sidebarLocale,
    findSidebarIntegration,
    enableSidebarTabWheelScrolling,
    createActivationCoordinator,
    createDocumentActivationCoordinator,
    integrationForCustomTab,
    createIntegrationLocator,
    suppressStaleMounts,
    prepareTab,
    createSelectionController,
    createLifecycle
  };
});
