"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const interaction = require("../src/ui/sidebar-interaction.js");

function fakeStyle(initial = {}) {
  const values = new Map(Object.entries(initial).map(([name, value]) => [name, { value, priority: "" }]));
  const writes = [];
  return {
    writes,
    getPropertyValue: (name) => values.get(name)?.value || "",
    getPropertyPriority: (name) => values.get(name)?.priority || "",
    setProperty(name, value, priority = "") {
      values.set(name, { value, priority });
      writes.push([name, value, priority]);
    },
    removeProperty(name) {
      values.delete(name);
      writes.push([name, "", ""]);
    }
  };
}

function fakeElement(initial = {}) {
  const attributes = new Map(Object.entries(initial));
  const classes = new Set();
  const listeners = new Map();
  return {
    style: fakeStyle(),
    children: [],
    hidden: false,
    isConnected: true,
    listeners,
    getAttribute: (name) => attributes.get(name) ?? null,
    setAttribute: (name, value) => attributes.set(name, String(value)),
    removeAttribute: (name) => attributes.delete(name),
    get tabIndex() {
      return Number(attributes.get("tabindex") ?? -1);
    },
    set tabIndex(value) {
      attributes.set("tabindex", String(value));
    },
    classList: {
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
      contains: (name) => classes.has(name)
    },
    addEventListener(type, listener, options) {
      if (!listeners.has(type)) listeners.set(type, new Map());
      listeners.get(type).set(listener, options);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
    dispatchEvent(event) {
      for (const listener of listeners.get(event.type)?.keys() || []) listener(event);
    }
  };
}

function wheelBar(direction = "ltr") {
  return Object.assign(fakeElement(), {
    scrollWidth: 720,
    clientWidth: 320,
    scrollLeft: 0,
    ownerDocument: { defaultView: { getComputedStyle: () => ({ direction }) } }
  });
}

function wheel(bar, changes = {}) {
  const event = {
    type: "wheel",
    deltaX: 0,
    deltaY: 120,
    deltaMode: 0,
    prevented: false,
    preventDefault() {
      this.prevented = true;
    },
    ...changes
  };
  bar.dispatchEvent(event);
  return event;
}

function selectionFixture() {
  const nativeTab = fakeElement({ "aria-selected": "true", tabindex: "0" });
  nativeTab.classList.add("Mui-selected");
  const foreignTab = fakeElement({ "aria-selected": "false", "data-mwitools-character-tab": "true" });
  const creditTab = fakeElement({ "aria-selected": "false", tabindex: "-1" });
  const nativePanel = fakeElement();
  nativePanel.style.setProperty("display", "flex", "important");
  const foreignPanel = fakeElement();
  const panel = fakeElement();
  panel.hidden = true;
  const panelHost = { children: [nativePanel, foreignPanel, panel] };
  const tabBar = { children: [nativeTab, foreignTab, creditTab] };
  const selection = interaction.createSelectionController({ panel, creditTab });
  return { selection, nativeTab, foreignTab, creditTab, nativePanel, foreignPanel, panel, panelHost, tabBar };
}

test("wheel binding uses node identity even when a clone already carries the marker", () => {
  const bar = wheelBar();
  bar.setAttribute("data-mwi-sidebar-wheel-scroll", "true");
  assert.equal(interaction.enableSidebarTabWheelScrolling(bar), true);
  assert.equal(interaction.enableSidebarTabWheelScrolling(bar), true);
  assert.equal(bar.listeners.get("wheel").size, 1);
  assert.equal([...bar.listeners.get("wheel").values()][0].passive, false);
  assert.equal(wheel(bar).prevented, true);
  assert.equal(bar.scrollLeft, 120);
});

test("wheel detach restores original inline priorities, preserves foreign changes and can reattach", () => {
  const bar = wheelBar();
  bar.style.setProperty("max-width", "640px", "important");
  interaction.enableSidebarTabWheelScrolling(bar);
  bar.style.setProperty("overflow-x", "scroll", "important");
  assert.equal(interaction.disableSidebarTabWheelScrolling(bar), true);
  assert.equal(bar.listeners.get("wheel").size, 0);
  assert.equal(bar.getAttribute("data-mwi-sidebar-wheel-scroll"), null);
  assert.equal(bar.style.getPropertyValue("max-width"), "640px");
  assert.equal(bar.style.getPropertyPriority("max-width"), "important");
  assert.equal(bar.style.getPropertyValue("overflow-x"), "scroll");
  assert.equal(bar.style.getPropertyPriority("overflow-x"), "important");
  assert.equal(bar.style.getPropertyValue("min-width"), "");
  assert.equal(wheel(bar).prevented, false);
  assert.equal(interaction.disableSidebarTabWheelScrolling(bar), false);
  interaction.enableSidebarTabWheelScrolling(bar);
  assert.equal(wheel(bar).prevented, true);
  interaction.disableSidebarTabWheelScrolling(bar);
  assert.equal(bar.style.getPropertyValue("overflow-x"), "scroll");
});

test("wheel conversion handles line/page units and passes through overflow boundaries", () => {
  const bar = wheelBar();
  interaction.enableSidebarTabWheelScrolling(bar);
  assert.equal(wheel(bar, { deltaY: -20 }).prevented, false);
  assert.equal(wheel(bar, { deltaY: 2, deltaMode: 1 }).prevented, true);
  assert.equal(bar.scrollLeft, 32);
  wheel(bar, { deltaY: 1, deltaMode: 2 });
  assert.equal(bar.scrollLeft, 352);
  wheel(bar, { deltaY: 1, deltaMode: 2 });
  assert.equal(bar.scrollLeft, 400);
  assert.equal(wheel(bar).prevented, false);
  wheel(bar, { deltaX: -30, deltaY: 10 });
  assert.equal(bar.scrollLeft, 370);
  bar.scrollWidth = 320;
  assert.equal(wheel(bar).prevented, false);
});

test("wheel does not intercept zoom, cancelled gestures, zero or invalid movement", () => {
  const bar = wheelBar();
  interaction.enableSidebarTabWheelScrolling(bar);
  for (const changes of [
    { ctrlKey: true },
    { defaultPrevented: true },
    { cancelable: false },
    { deltaX: 0, deltaY: 0 },
    { deltaY: NaN },
    { deltaY: Infinity }
  ]) {
    assert.equal(wheel(bar, changes).prevented, false);
    assert.equal(bar.scrollLeft, 0);
  }
});

test("RTL wheel uses negative scrollLeft without trapping the page at either boundary", () => {
  const bar = wheelBar("rtl");
  interaction.enableSidebarTabWheelScrolling(bar);
  assert.equal(wheel(bar, { deltaY: -1 }).prevented, false);
  assert.equal(wheel(bar).prevented, true);
  assert.equal(bar.scrollLeft, -120);
  wheel(bar, { deltaX: 40, deltaY: 0 });
  assert.equal(bar.scrollLeft, -80);
  wheel(bar, { deltaY: 900 });
  assert.equal(bar.scrollLeft, -400);
  assert.equal(wheel(bar).prevented, false);
  wheel(bar, { deltaY: -900 });
  assert.equal(bar.scrollLeft, 0);
  assert.equal(wheel(bar, { deltaY: -1 }).prevented, false);
});

test("selection hide restores disconnected panel display and important priority", () => {
  const fixture = selectionFixture();
  const { selection, panelHost, tabBar, nativePanel, foreignPanel, nativeTab, panel } = fixture;
  assert.equal(selection.show(panelHost, tabBar), true);
  assert.equal(nativePanel.style.getPropertyValue("display"), "none");
  assert.equal(nativePanel.style.getPropertyPriority("display"), "important");
  assert.equal(panel.hidden, false);
  nativePanel.isConnected = false;
  selection.hide();
  assert.equal(nativePanel.style.getPropertyValue("display"), "flex");
  assert.equal(nativePanel.style.getPropertyPriority("display"), "important");
  assert.equal(foreignPanel.style.getPropertyValue("display"), "");
  assert.equal(nativeTab.getAttribute("aria-selected"), "true");
  assert.equal(nativeTab.classList.contains("Mui-selected"), true);
  assert.equal(nativeTab.tabIndex, 0);
  assert.equal(panel.hidden, true);
  assert.equal(selection.isActive(), false);
});

test("selection restores only display values and priorities still owned by this controller", () => {
  const { selection, panelHost, tabBar, nativePanel, foreignPanel } = selectionFixture();
  selection.show(panelHost, tabBar);
  nativePanel.style.setProperty("display", "grid", "important");
  // Even an identical value with a changed priority is a foreign write.
  foreignPanel.style.setProperty("display", "none");
  selection.hide();
  assert.equal(nativePanel.style.getPropertyValue("display"), "grid");
  assert.equal(nativePanel.style.getPropertyPriority("display"), "important");
  assert.equal(foreignPanel.style.getPropertyValue("display"), "none");
  assert.equal(foreignPanel.style.getPropertyPriority("display"), "");
});

test("repeated show does not restore and hide panels or override foreign writes", () => {
  const { selection, panelHost, tabBar, nativePanel, foreignPanel, panel } = selectionFixture();
  selection.show(panelHost, tabBar);
  const writes = nativePanel.style.writes.length;
  foreignPanel.style.setProperty("display", "block");
  assert.equal(selection.show(panelHost, tabBar), true);
  assert.equal(nativePanel.style.writes.length, writes);
  assert.equal(foreignPanel.style.getPropertyValue("display"), "block");
  assert.equal(panel.hidden, false);
});

test("sync hides newly mounted panels only while our selection still owns the sidebar", () => {
  const { selection, panelHost, tabBar, nativePanel, foreignTab } = selectionFixture();
  const later = fakeElement();
  later.style.setProperty("display", "grid");
  assert.equal(selection.sync(panelHost, tabBar), false);
  selection.show(panelHost, tabBar);
  panelHost.children.push(later);
  const writes = nativePanel.style.writes.length;
  assert.equal(selection.sync(panelHost, tabBar), true);
  assert.equal(later.style.getPropertyValue("display"), "none");
  assert.equal(nativePanel.style.writes.length, writes);
  const external = fakeElement();
  panelHost.children.push(external);
  foreignTab.setAttribute("aria-selected", "true");
  assert.equal(selection.sync(panelHost, tabBar), false);
  assert.equal(external.style.getPropertyValue("display"), "");
  selection.hide();
  assert.equal(later.style.getPropertyValue("display"), "grid");
});

test("explicit show reclaims the panel after external visibility or selection changes", () => {
  const { selection, panelHost, tabBar, panel, creditTab } = selectionFixture();
  selection.show(panelHost, tabBar);
  panel.hidden = true;
  assert.equal(selection.sync(panelHost, tabBar), false);
  assert.equal(selection.show(panelHost, tabBar), true);
  assert.equal(panel.hidden, false);
  creditTab.setAttribute("aria-selected", "false");
  assert.equal(selection.sync(panelHost, tabBar), false);
  assert.equal(selection.show(panelHost, tabBar), true);
  assert.equal(creditTab.getAttribute("aria-selected"), "true");
  assert.equal(creditTab.classList.contains("Mui-selected"), true);
});

test("hide preserves another plugin's selection and identity without reviving native selection", () => {
  const { selection, panelHost, tabBar, foreignTab, nativeTab, creditTab } = selectionFixture();
  foreignTab.setAttribute("id", "mwitools-planning-tab");
  selection.show(panelHost, tabBar);
  foreignTab.setAttribute("aria-selected", "true");
  foreignTab.classList.add("Mui-selected");
  foreignTab.tabIndex = 0;
  selection.hide();
  assert.equal(foreignTab.getAttribute("aria-selected"), "true");
  assert.equal(foreignTab.classList.contains("Mui-selected"), true);
  assert.equal(foreignTab.tabIndex, 0);
  assert.equal(foreignTab.getAttribute("data-mwitools-character-tab"), "true");
  assert.equal(foreignTab.getAttribute("id"), "mwitools-planning-tab");
  assert.equal(nativeTab.getAttribute("aria-selected"), "false");
  assert.equal(nativeTab.classList.contains("Mui-selected"), false);
  assert.equal(nativeTab.tabIndex, -1);
  assert.equal(creditTab.getAttribute("aria-selected"), "false");
});

test("hide releases snapshots so a later activation captures new display and selection", () => {
  const { selection, panelHost, tabBar, nativePanel, nativeTab, foreignTab } = selectionFixture();
  selection.show(panelHost, tabBar);
  selection.hide();
  const writes = nativePanel.style.writes.length;
  selection.hide();
  assert.equal(nativePanel.style.writes.length, writes);
  nativePanel.style.setProperty("display", "grid");
  nativeTab.setAttribute("aria-selected", "false");
  nativeTab.classList.remove("Mui-selected");
  nativeTab.tabIndex = -1;
  foreignTab.setAttribute("aria-selected", "true");
  foreignTab.classList.add("Mui-selected");
  foreignTab.tabIndex = 0;
  selection.show(panelHost, tabBar);
  selection.hide();
  assert.equal(nativePanel.style.getPropertyValue("display"), "grid");
  assert.equal(nativePanel.style.getPropertyPriority("display"), "");
  assert.equal(foreignTab.getAttribute("aria-selected"), "true");
  assert.equal(nativeTab.getAttribute("aria-selected"), "false");
});

test("document coordinator retains string-detail contract and removes its listener on destroy", () => {
  const document = fakeElement();
  class CustomEvent {
    constructor(type, options) {
      this.type = type;
      this.detail = options.detail;
    }
  }
  const owners = [];
  const coordinator = interaction.createDocumentActivationCoordinator({ document, CustomEvent }, "credit", (owner) =>
    owners.push(owner)
  );
  coordinator.start();
  assert.equal(document.listeners.get(interaction.SIDEBAR_ACTIVATION_EVENT).size, 1);
  assert.equal(coordinator.announce(), true);
  for (const detail of [{ owner: "invite" }, null, "", "credit", "invite"])
    document.dispatchEvent(new CustomEvent(interaction.SIDEBAR_ACTIVATION_EVENT, { detail }));
  assert.deepEqual(owners, ["invite"]);
  coordinator.destroy();
  coordinator.destroy();
  document.dispatchEvent(new CustomEvent(interaction.SIDEBAR_ACTIVATION_EVENT, { detail: "mwitools" }));
  assert.deepEqual(owners, ["invite"]);
  assert.equal(document.listeners.get(interaction.SIDEBAR_ACTIVATION_EVENT).size, 0);
});
