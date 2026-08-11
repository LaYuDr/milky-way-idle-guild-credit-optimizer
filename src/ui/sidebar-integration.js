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

  return { SIDEBAR_LABELS, sidebarLocale, findSidebarIntegration };
});
