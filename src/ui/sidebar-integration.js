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

  return {
    SIDEBAR_LABELS,
    SIDEBAR_ACTIVATION_EVENT,
    sidebarLocale,
    findSidebarIntegration,
    enableSidebarTabWheelScrolling,
    createActivationCoordinator,
    createDocumentActivationCoordinator,
    integrationForCustomTab
  };
});
