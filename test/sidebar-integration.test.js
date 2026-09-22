"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const sidebarIntegration = require("../src/ui/sidebar-integration.js");

test("maps wheel movement to an overflowing native sidebar tab bar", () => {
  const listeners = new Map();
  const attributes = new Map();
  const tabBar = {
    style: {},
    scrollWidth: 720,
    clientWidth: 320,
    scrollLeft: 0,
    addEventListener(type, listener, options) {
      listeners.set(type, { listener, options });
    },
    getAttribute(name) {
      return attributes.get(name) || null;
    },
    setAttribute(name, value) {
      attributes.set(name, value);
    }
  };

  assert.equal(sidebarIntegration.enableSidebarTabWheelScrolling(tabBar), true);
  assert.equal(tabBar.style.overflowX, "auto");
  assert.equal(tabBar.style.scrollbarWidth, "none");
  assert.equal(listeners.get("wheel").options.passive, false);

  let prevented = false;
  listeners.get("wheel").listener({
    ctrlKey: false,
    deltaX: 0,
    deltaY: 120,
    deltaMode: 0,
    preventDefault() {
      prevented = true;
    }
  });
  assert.equal(tabBar.scrollLeft, 120);
  assert.equal(prevented, true);

  prevented = false;
  tabBar.scrollLeft = 400;
  listeners.get("wheel").listener({
    ctrlKey: false,
    deltaX: 0,
    deltaY: 120,
    deltaMode: 0,
    preventDefault() {
      prevented = true;
    }
  });
  assert.equal(tabBar.scrollLeft, 400);
  assert.equal(prevented, false);
});

test("does not capture wheel movement when native sidebar tabs do not overflow", () => {
  let wheelListener;
  let listenerCount = 0;
  const attributes = new Map();
  const tabBar = {
    style: {},
    scrollWidth: 320,
    clientWidth: 320,
    scrollLeft: 0,
    addEventListener(type, listener) {
      if (type === "wheel") wheelListener = listener;
      listenerCount += 1;
    },
    getAttribute(name) {
      return attributes.get(name) || null;
    },
    setAttribute(name, value) {
      attributes.set(name, value);
    }
  };

  assert.equal(sidebarIntegration.enableSidebarTabWheelScrolling(tabBar), true);
  assert.equal(sidebarIntegration.enableSidebarTabWheelScrolling(tabBar), true);
  assert.equal(listenerCount, 1);

  let prevented = false;
  wheelListener({
    ctrlKey: false,
    deltaX: 0,
    deltaY: 120,
    deltaMode: 0,
    preventDefault() {
      prevented = true;
    }
  });
  assert.equal(tabBar.scrollLeft, 0);
  assert.equal(prevented, false);
});

test("coordinates custom sidebar tabs across independent userscripts", () => {
  const listeners = new Map();
  const eventTarget = {
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) listeners.delete(type);
    },
    dispatchEvent(event) {
      listeners.get(event.type)?.(event);
    }
  };
  class FakeCustomEvent {
    constructor(type, options) {
      this.type = type;
      this.detail = options.detail;
    }
  }
  const deactivations = [];
  const coordinator = sidebarIntegration.createActivationCoordinator({
    eventTarget,
    CustomEvent: FakeCustomEvent,
    owner: "credit",
    onDeactivate: (owner) => deactivations.push(owner)
  });

  assert.equal(coordinator.start(), true);
  assert.equal(coordinator.announce(), true);
  assert.deepEqual(deactivations, []);

  eventTarget.dispatchEvent(new FakeCustomEvent(sidebarIntegration.SIDEBAR_ACTIVATION_EVENT, { detail: "invite" }));
  assert.deepEqual(deactivations, ["invite"]);

  coordinator.destroy();
  eventTarget.dispatchEvent(new FakeCustomEvent(sidebarIntegration.SIDEBAR_ACTIVATION_EVENT, { detail: "other" }));
  assert.deepEqual(deactivations, ["invite"]);
});

test("cached sidebar lookup refreshes locale locally and rescans on expiry, removal or hidden layout", () => {
  const labels = ["库存", "装备", "技能", "房屋", "配装"];
  const tabBar = {
    isConnected: true,
    children: labels.map((textContent) => ({ textContent })),
    getBoundingClientRect: () => ({ width: 500, height: 40 })
  };
  const panelHost = { isConnected: true, className: "TabsComponent_tabPanelsContainer" };
  const sidebar = { children: [panelHost] };
  tabBar.parentElement = { parentElement: { parentElement: { parentElement: sidebar } } };
  const tabPrototype = tabBar.children[0];
  tabPrototype.parentElement = tabBar;
  const integration = { tabBar, panelHost, tabPrototype, detectedLocale: "zh-CN" };
  let time = 0;
  let scans = 0;
  const locate = sidebarIntegration.createIntegrationLocator(
    {},
    () => time,
    () => {
      scans++;
      return integration;
    }
  );
  assert.equal(locate("zh-CN"), integration);
  for (let i = 0; i < 10; i++) locate("zh-CN");
  assert.equal(scans, 1);
  ["Inventory", "Equipment", "Skills", "House", "Loadout"].forEach((label, i) => {
    tabBar.children[i].textContent = label;
  });
  assert.equal(locate("en").detectedLocale, "en");
  assert.equal(scans, 1);
  time = 30000;
  locate("en");
  assert.equal(scans, 2);
  tabBar.getBoundingClientRect = () => ({ width: 0, height: 0 });
  locate("en");
  assert.equal(scans, 3);
  tabBar.isConnected = false;
  locate("en");
  assert.equal(scans, 4);
});

test("missing sidebar never caches a negative result across cold-start retries", () => {
  let scans = 0;
  const locate = sidebarIntegration.createIntegrationLocator(
    {},
    () => 0,
    () => {
      scans++;
      return null;
    }
  );
  assert.equal(locate("en"), null);
  assert.equal(locate("en"), null);
  assert.equal(scans, 2);
});

test("stale cleanup preserves foreign tabs cloned from Guild, including already stripped IDs", () => {
  function candidate(id, extra = {}) {
    const attributes = new Map([
      ["id", id],
      ["aria-selected", "false"]
    ]);
    return {
      id,
      hidden: false,
      inert: false,
      dataset: { mwiCreditTab: "true", ...extra },
      getAttribute: (name) => attributes.get(name) ?? null,
      hasAttribute: (name) => attributes.has(name),
      setAttribute: (name, value) => attributes.set(name, value),
      removeAttribute(name) {
        attributes.delete(name);
        if (name === "id") this.id = "";
      },
      classList: { remove() {} },
      querySelectorAll: () => []
    };
  }
  const live = candidate("mwi-credit-sidebar-tab");
  const stale = candidate("mwi-credit-sidebar-tab");
  const asset = candidate("mwitools-asset-history-tab", { mwitoolsCharacterTab: "true" });
  const planning = candidate("mwitools-planning-tab", { mwitoolsCharacterTab: "true" });
  const previouslyDamaged = candidate("", { mwitoolsCharacterTab: "true", mwiCreditSuperseded: "true" });
  const unknown = candidate("another-plugin-tab");
  const unknownWithoutId = candidate("");
  const tabs = [live, stale, asset, planning, previouslyDamaged, unknown, unknownWithoutId];
  const doc = { querySelectorAll: (selector) => (selector.includes("data-mwi-credit-tab") ? tabs : []) };
  sidebarIntegration.suppressStaleMounts({ tabBar: { ownerDocument: doc } }, live, {});
  for (const node of [live, asset, planning, previouslyDamaged, unknown, unknownWithoutId]) {
    assert.equal(node.hidden, false, `${node.id || "unidentified tab"} must not be hidden`);
    assert.equal(node.inert, false);
  }
  assert.equal(asset.id, "mwitools-asset-history-tab");
  assert.equal(planning.id, "mwitools-planning-tab");
  assert.equal(stale.hidden, true);
  assert.equal(stale.inert, true);
  assert.equal(stale.id, "");
  // Reappearing genuine stale nodes are still suppressed after their ID was removed.
  stale.hidden = false;
  sidebarIntegration.suppressStaleMounts({ tabBar: { ownerDocument: doc } }, live, {});
  assert.equal(stale.hidden, true);
});
