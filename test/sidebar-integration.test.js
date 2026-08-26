"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const sidebarIntegration = require("../src/ui/sidebar-integration.js");

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
