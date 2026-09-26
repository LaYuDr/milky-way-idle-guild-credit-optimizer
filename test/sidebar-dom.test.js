"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const sidebarDom = require("../src/ui/sidebar-dom.js");

function createDocument() {
  const documentRef = {
    fullScans: 0,
    createElement(tagName) {
      const attributes = new Map();
      const node = {
        ownerDocument: documentRef,
        tagName: tagName.toUpperCase(),
        className: "",
        id: "",
        textContent: "",
        dataset: {},
        children: [],
        parentElement: null,
        hidden: false,
        inert: false,
        isConnected: true,
        rect: { width: 420, height: 40 },
        append(...children) {
          for (const child of children) {
            child.parentElement = node;
            node.children.push(child);
          }
        },
        getBoundingClientRect: () => node.rect,
        setAttribute(name, value) {
          attributes.set(name, String(value));
          if (name === "id") node.id = String(value);
          if (name.startsWith("data-")) node.dataset[dataKey(name)] = String(value);
        },
        getAttribute(name) {
          if (name === "id") return node.id || null;
          if (name === "class") return node.className;
          if (name.startsWith("data-")) return node.dataset[dataKey(name)] ?? null;
          return attributes.get(name) ?? null;
        },
        hasAttribute: (name) => node.getAttribute(name) !== null,
        removeAttribute(name) {
          attributes.delete(name);
          if (name === "id") node.id = "";
          if (name.startsWith("data-")) delete node.dataset[dataKey(name)];
        },
        querySelectorAll(selector) {
          return descendants(node).filter((candidate) => selector.split(",").some((part) => matches(candidate, part)));
        },
        classList: {
          remove(className) {
            node.className = node.className
              .split(/\s+/)
              .filter((value) => value !== className)
              .join(" ");
          }
        }
      };
      return node;
    },
    querySelectorAll: (selector) => documentRef.body.querySelectorAll(selector),
    getElementsByTagName() {
      documentRef.fullScans += 1;
      return descendants(documentRef.body);
    }
  };
  documentRef.body = documentRef.createElement("body");
  return documentRef;
}

function dataKey(attribute) {
  return attribute.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function descendants(node) {
  return node.children.flatMap((child) => [child, ...descendants(child)]);
}

function matches(node, selector) {
  if (/^[a-z]+$/i.test(selector)) return node.tagName === selector.toUpperCase();
  if (selector.startsWith("#")) return node.id === selector.slice(1);
  if (selector.startsWith(".")) return node.className.split(/\s+/).includes(selector.slice(1));
  const attribute = selector.match(/^\[([^=\]*]+)(\*)?(?:="([^"]*)")?\]$/);
  if (!attribute) throw new Error(`Unsupported test selector: ${selector}`);
  const value = node.getAttribute(attribute[1]);
  if (attribute[3] === undefined) return value !== null;
  return attribute[2] ? Boolean(value?.includes(attribute[3])) : value === attribute[3];
}

function createSidebar(documentRef, { locale = "zh-CN", wrappers = 3, role = true, width = 420 } = {}) {
  const container = documentRef.createElement("div");
  const panelHost = documentRef.createElement("section");
  panelHost.className = "TabsComponent_tabPanelsContainer__fixture";
  const tabBar = documentRef.createElement("nav");
  if (role) tabBar.setAttribute("role", "tablist");
  tabBar.rect.width = width;
  for (const label of sidebarDom.SIDEBAR_LABELS[locale].slice(0, 6)) {
    const tab = documentRef.createElement("button");
    tab.textContent = label;
    tabBar.append(tab);
  }
  let branch = tabBar;
  for (let index = 0; index < wrappers; index += 1) {
    const wrapper = documentRef.createElement("div");
    wrapper.append(branch);
    branch = wrapper;
  }
  container.append(branch, panelHost);
  documentRef.body.append(container);
  return { container, panelHost, tabBar, tabPrototype: tabBar.children[0] };
}

test("finds semantic tab lists through additional wrappers without a full-document scan", () => {
  const doc = createDocument();
  const sidebar = createSidebar(doc, { wrappers: 7 });
  const integration = sidebarDom.findSidebarIntegration(doc, "en");
  assert.equal(integration.tabBar, sidebar.tabBar);
  assert.equal(integration.tabPrototype, sidebar.tabPrototype);
  assert.equal(integration.panelHost, sidebar.panelHost);
  assert.equal(integration.detectedLocale, "zh-CN");
  assert.equal(doc.fullScans, 0);
  assert.deepEqual(sidebarDom.integrationForCustomTab(sidebar.tabPrototype), {
    tabBar: sidebar.tabBar,
    panelHost: sidebar.panelHost
  });
});

test("falls back to legacy markup when semantic candidates are hidden and requires four native tabs", () => {
  const doc = createDocument();
  const hidden = createSidebar(doc, { width: 0 });
  const insufficient = createSidebar(doc);
  insufficient.tabBar.children.splice(3);
  const visible = createSidebar(doc, { locale: "en", role: false });
  const integration = sidebarDom.findSidebarIntegration(doc, "zh-CN");
  assert.notEqual(integration.tabBar, hidden.tabBar);
  assert.notEqual(integration.tabBar, insufficient.tabBar);
  assert.equal(integration.tabBar, visible.tabBar);
  assert.equal(integration.detectedLocale, "en");
  assert.equal(doc.fullScans, 1);
});

test("does not claim panel hosts outside the sidebar, inside outer panels, or in ambiguous sibling layouts", () => {
  for (const boundary of ["body", "main", "panel", "ambiguous"]) {
    const doc = createDocument();
    const sidebar = createSidebar(doc);
    sidebar.container.children = sidebar.container.children.filter((node) => node !== sidebar.panelHost);
    if (boundary === "body") doc.body.append(sidebar.panelHost);
    else if (boundary === "main") {
      const main = doc.createElement("main");
      doc.body.children = [];
      main.append(sidebar.container, sidebar.panelHost);
      doc.body.append(main);
    } else if (boundary === "panel") {
      sidebar.container.className = "TabsComponent_tabPanelsContainer";
      sidebar.container.append(sidebar.panelHost);
    } else {
      const duplicate = doc.createElement("section");
      duplicate.className = sidebar.panelHost.className;
      sidebar.container.append(sidebar.panelHost, duplicate);
    }
    assert.equal(sidebarDom.findSidebarIntegration(doc, "zh-CN"), null, boundary);
    assert.equal(sidebarDom.integrationForCustomTab(sidebar.tabPrototype), null, boundary);
  }
});

test("does not associate one sidebar's tabs with a different sidebar's panel at a shared ancestor", () => {
  const doc = createDocument();
  const orphan = createSidebar(doc);
  orphan.container.children = orphan.container.children.filter((node) => node !== orphan.panelHost);
  const neighbor = createSidebar(doc, { role: false });
  const shared = doc.createElement("div");
  const unrelatedPanel = doc.createElement("section");
  unrelatedPanel.className = "TabsComponent_tabPanelsContainer";
  doc.body.children = [];
  shared.append(orphan.container, neighbor.container, unrelatedPanel);
  doc.body.append(shared);
  assert.equal(sidebarDom.integrationForCustomTab(orphan.tabPrototype), null);
  assert.equal(sidebarDom.findSidebarIntegration(doc, "zh-CN").panelHost, neighbor.panelHost);
});

test("locator refreshes labels without scanning and invalidates expired, hidden, moved or disconnected mounts", () => {
  const doc = createDocument();
  const sidebar = createSidebar(doc);
  let time = 0;
  let scans = 0;
  const locate = sidebarDom.createIntegrationLocator(
    doc,
    () => time,
    (documentRef, locale) => {
      scans += 1;
      return sidebarDom.findSidebarIntegration(documentRef, locale);
    }
  );
  assert.equal(locate("zh-CN").tabBar, sidebar.tabBar);
  for (let index = 0; index < 10; index += 1) locate("zh-CN");
  assert.equal(scans, 1);
  sidebar.tabBar.children.forEach((tab, index) => {
    tab.textContent = sidebarDom.SIDEBAR_LABELS.en[index];
  });
  assert.equal(locate("en").detectedLocale, "en");
  assert.equal(scans, 1);
  time = 30000;
  locate("en");
  assert.equal(scans, 2);
  sidebar.tabBar.rect.width = 0;
  locate("en");
  assert.equal(scans, 3);
  sidebar.tabBar.rect.width = 420;
  sidebar.panelHost.isConnected = false;
  locate("en");
  assert.equal(scans, 4);
  sidebar.panelHost.isConnected = true;
  sidebar.tabPrototype.parentElement = doc.body;
  locate("en");
  assert.equal(scans, 5);
});

test("missing sidebar is retried immediately when a cold-start layout appears", () => {
  const doc = createDocument();
  const locate = sidebarDom.createIntegrationLocator(doc, () => 0);
  assert.equal(locate("en"), null);
  const sidebar = createSidebar(doc, { locale: "en" });
  assert.equal(locate("en").tabBar, sidebar.tabBar);
});

test("creates a clean button with shared classes and explicit ARIA relationships", () => {
  const doc = createDocument();
  const prototype = doc.createElement("button");
  prototype.className = "MuiButtonBase-root MuiTab-root Mui-selected Native_tab";
  prototype.id = "native-inventory";
  prototype.dataset.nativeAction = "inventory";
  prototype.dataset.mwiGitTab = "true";
  prototype.setAttribute("disabled", "");
  prototype.setAttribute("onclick", "nativeHandler()");
  prototype.setAttribute("aria-controls", "native-inventory-panel");
  const panel = doc.createElement("section");
  panel.id = "mwi-credit-optimizer";
  const tab = sidebarDom.createTab(prototype, panel, "公会助手");
  assert.equal(tab.ownerDocument, doc);
  assert.equal(tab.tagName, "BUTTON");
  assert.equal(tab.type, "button");
  assert.equal(tab.className, "MuiButtonBase-root MuiTab-root Native_tab");
  assert.equal(tab.textContent, "公会助手");
  assert.deepEqual(tab.dataset, { mwiCreditTab: "true" });
  assert.equal(tab.hasAttribute("onclick"), false);
  assert.equal(tab.hasAttribute("disabled"), false);
  assert.equal(tab.id, "mwi-credit-sidebar-tab");
  assert.equal(tab.getAttribute("role"), "tab");
  assert.equal(tab.getAttribute("aria-selected"), "false");
  assert.equal(tab.getAttribute("aria-controls"), panel.id);
  assert.equal(tab.tabIndex, -1);
  assert.equal(panel.getAttribute("role"), "tabpanel");
  assert.equal(panel.getAttribute("aria-labelledby"), tab.id);
  assert.equal(panel.tabIndex, 0);
  assert.equal(prototype.className.includes("Mui-selected"), true);
});

test("stale cleanup preserves foreign clones and removes genuine stale IDs and keyboard access", () => {
  const doc = createDocument();
  const sidebar = createSidebar(doc);
  const panel = doc.createElement("section");
  panel.id = "mwi-credit-optimizer";
  const live = sidebarDom.createTab(sidebar.tabPrototype, panel, "Guild");
  sidebar.tabBar.append(live);
  sidebar.panelHost.append(panel);
  const stalePanel = doc.createElement("section");
  stalePanel.id = "mwi-credit-optimizer";
  const staleField = doc.createElement("input");
  staleField.id = "mwi-credit-input";
  stalePanel.append(staleField);
  sidebar.panelHost.append(stalePanel);
  const stale = sidebarDom.createTab(sidebar.tabPrototype, stalePanel, "Guild");
  stale.setAttribute("aria-selected", "true");
  sidebar.tabBar.append(stale);
  const foreign = [
    ["mwitools-asset-history-tab", { mwitoolsCharacterTab: "true" }],
    ["mwi-credit-sidebar-tab", { mwiGitTab: "true" }],
    ["", { mwitoolsCharacterTab: "true", mwiCreditSuperseded: "true" }],
    ["mwi-credit-sidebar-tab", { mooncakeEnhancementTabButton: "" }],
    ["unknown-plugin-tab", { mwiCreditSuperseded: "true" }],
    ["", {}]
  ].map(([id, identity]) => {
    const tab = doc.createElement("button");
    tab.id = id;
    tab.dataset = { mwiCreditTab: "true", ...identity };
    sidebar.tabBar.append(tab);
    return tab;
  });
  const foreignPanel = doc.createElement("section");
  foreignPanel.id = "unknown-plugin-panel";
  foreignPanel.dataset.mwiCreditStalePanel = "true";
  sidebar.panelHost.append(foreignPanel);
  assert.equal(sidebarDom.suppressStaleMounts(sidebar, live, panel), true);
  for (const node of [live, panel, foreignPanel, ...foreign]) {
    assert.equal(node.hidden, false, node.id || "unidentified foreign tab");
    assert.equal(node.inert, false);
  }
  for (const node of [stale, stalePanel]) {
    assert.equal(node.hidden, true);
    assert.equal(node.inert, true);
    assert.equal(node.id, "");
    assert.equal(node.getAttribute("tabindex"), "-1");
  }
  assert.equal(staleField.id, "");
  stale.hidden = false;
  assert.equal(sidebarDom.suppressStaleMounts(sidebar, live, panel), false);
  assert.equal(stale.hidden, true);
});
