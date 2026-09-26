(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MwiGuildCreditSidebarDom = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const SIDEBAR_LABELS = {
    "zh-CN": ["库存", "装备", "技能", "房屋", "配装", "收获"],
    en: ["Inventory", "Equipment", "Skills", "House", "Loadout", "Loadouts", "Harvest", "Gathering"]
  };
  const EXPECTED_LABELS = new Set(Object.values(SIDEBAR_LABELS).flat());
  const TAB_BAR_SELECTOR =
    '[role="tablist"],.MuiTabs-flexContainer,[class*="TabsComponent_tabsContainer"],[class*="TabsComponent_tabList"]';
  const MAX_SIDEBAR_ANCESTORS = 12;

  function labelForTab(tab) {
    return String(tab.innerText || tab.textContent || "")
      .replaceAll("\n", "")
      .trim();
  }

  function isPanelHost(node) {
    return /tabPanelsContainer/.test(String(node?.className || ""));
  }

  function containsNativeTabBar(node) {
    if (nativeTabs(node).length >= 4) return true;
    return Array.from(node.querySelectorAll?.(`${TAB_BAR_SELECTOR},nav`) || []).some(
      (candidate) => nativeTabs(candidate).length >= 4
    );
  }

  function findPanelHost(tabBar) {
    let branch = tabBar;
    // Resolve the nearest shared container instead of assuming a fixed number
    // of Material UI wrappers. Never escape a panel into an unrelated sidebar.
    for (let depth = 0; depth < MAX_SIDEBAR_ANCESTORS; depth += 1) {
      const parent = branch?.parentElement;
      if (!parent || /^(BODY|HTML|MAIN)$/.test(parent.tagName || "") || isPanelHost(parent)) return null;
      const siblings = Array.from(parent.children || []).filter((node) => node !== branch);
      const panelHosts = siblings.filter(isPanelHost);
      if (siblings.some((node) => !isPanelHost(node) && containsNativeTabBar(node))) return null;
      if (panelHosts.length) return panelHosts.length === 1 ? panelHosts[0] : null;
      branch = parent;
    }
    return null;
  }

  function integrationForCustomTab(tab) {
    const tabBar = tab?.parentElement;
    const panelHost = findPanelHost(tabBar);
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

  function nativeTabs(tabBar) {
    return Array.from(tabBar.children || [], (element) => ({ element, label: labelForTab(element) })).filter((tab) =>
      EXPECTED_LABELS.has(tab.label)
    );
  }

  function visibleTabBar(tabBar) {
    const rect = tabBar?.getBoundingClientRect?.();
    return Boolean(tabBar?.isConnected && rect?.width > 0 && rect?.height > 0);
  }

  function findSidebarIntegration(documentRef, preferredLocale) {
    if (!documentRef) return null;
    let bestIntegration = null;
    const visited = new Set();
    function inspect(candidate) {
      if (visited.has(candidate)) return;
      visited.add(candidate);
      const recognized = nativeTabs(candidate);
      if (recognized.length < 4) return;
      const panelHost = findPanelHost(candidate);
      if (!panelHost) return;
      const detectedLocale = sidebarLocale(recognized.map((tab) => tab.label));
      const prototypeLabels =
        (detectedLocale || preferredLocale) === "zh-CN" ? ["库存", "Inventory"] : ["Inventory", "库存"];
      const prototype = recognized.find((tab) => prototypeLabels.includes(tab.label)) || recognized[0];
      const integration = {
        tabBar: candidate,
        tabPrototype: prototype.element,
        panelHost,
        detectedLocale,
        score: (visibleTabBar(candidate) ? 1000 : 0) + recognized.length
      };
      if (!bestIntegration || integration.score > bestIntegration.score) bestIntegration = integration;
    }
    for (const candidate of documentRef.querySelectorAll?.(TAB_BAR_SELECTOR) || []) inspect(candidate);
    if (bestIntegration?.score >= 1000) return bestIntegration;
    // Older layouts and startup fixtures may not expose tab roles or MUI
    // classes. Keep a recovery scan, including when targeted layouts are hidden.
    for (const candidate of documentRef.getElementsByTagName?.("*") || []) inspect(candidate);
    return bestIntegration;
  }

  function createIntegrationLocator(documentRef, now = Date.now, find = findSidebarIntegration) {
    let cached = null;
    let scannedAt = -Infinity;
    return function locate(locale) {
      const tabBar = cached?.tabBar;
      const current = tabBar && integrationForCustomTab(cached.tabPrototype);
      const valid =
        visibleTabBar(tabBar) &&
        cached.panelHost.isConnected &&
        cached.tabPrototype.parentElement === tabBar &&
        current?.panelHost === cached.panelHost;
      const timestamp = now();
      if (!valid || timestamp - scannedAt >= 30000) {
        cached = find(documentRef, locale);
        scannedAt = timestamp;
      } else {
        cached.detectedLocale = sidebarLocale(Array.from(tabBar.children, labelForTab));
      }
      return cached;
    };
  }

  function hasForeignIdentity(node) {
    return (
      node?.dataset?.mwitoolsCharacterTab === "true" ||
      node?.dataset?.mwiGitTab === "true" ||
      node?.hasAttribute?.("data-mooncake-enhancement-tab-button")
    );
  }

  function isOwnedSidebarTab(node) {
    if (node?.dataset?.mwiCreditTab !== "true" || hasForeignIdentity(node)) return false;
    // External plugins can clone all data attributes. Their own ID or marker
    // takes precedence over inherited ownership and stale-node markers.
    return node.id === "mwi-credit-sidebar-tab" || (!node.id && node.dataset.mwiCreditSuperseded === "true");
  }

  function suppressStaleMounts(integration, tab, panel) {
    let selected = false;
    const documentRef = integration.tabBar.ownerDocument;
    const stale = [
      ...Array.from(documentRef.querySelectorAll('[data-mwi-credit-tab="true"]')).filter(
        (node) => node !== tab && isOwnedSidebarTab(node)
      ),
      ...Array.from(documentRef.querySelectorAll("#mwi-credit-optimizer,[data-mwi-credit-stale-panel]")).filter(
        (node) =>
          node !== panel &&
          !hasForeignIdentity(node) &&
          (node.id === "mwi-credit-optimizer" || (!node.id && node.hasAttribute("data-mwi-credit-stale-panel")))
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

  function createTab(tabPrototype, panel, label) {
    const tab = tabPrototype.ownerDocument.createElement("button");
    tab.type = "button";
    tab.className = String(tabPrototype.className || "")
      .split(/\s+/)
      .filter((className) => className && className !== "Mui-selected")
      .join(" ");
    tab.dataset.mwiCreditTab = "true";
    tab.textContent = String(label ?? "");
    prepareTab(tab, panel);
    return tab;
  }

  return Object.freeze({
    SIDEBAR_LABELS,
    sidebarLocale,
    findSidebarIntegration,
    integrationForCustomTab,
    createIntegrationLocator,
    suppressStaleMounts,
    isOwnedSidebarTab,
    prepareTab,
    createTab
  });
});
