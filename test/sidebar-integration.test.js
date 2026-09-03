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
