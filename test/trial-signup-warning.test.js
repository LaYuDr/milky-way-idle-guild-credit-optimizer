"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { create } = require("../src/ui/trial-signup-warning.js");

test("报名提醒可在 body 创建前启动，并处理稍后出现的报名窗口及清理", () => {
  let onMutation;
  let watched;
  let disconnected = false;
  let queued;
  let modals = [];
  const document = { nodeType: 9, body: null, querySelectorAll: () => modals };
  const attrs = new Map([["title", "原有提示"]]);
  const member = {
    textContent: "Member",
    getAttribute: (name) => attrs.get(name) ?? null,
    setAttribute: (name, value) => attrs.set(name, value),
    removeAttribute: (name) => attrs.delete(name)
  };
  const modal = {
    nodeType: 1,
    matches: () => true,
    querySelector: () => ({ textContent: "挤奶" }),
    querySelectorAll: () => [member]
  };
  const warning = create({
    document,
    pageWindow: {
      MutationObserver: class {
        constructor(callback) {
          onMutation = callback;
        }
        observe(target) {
          assert.ok(target?.nodeType, "启动时必须提供有效 DOM 节点，不能传入尚不存在的 body");
          watched = target;
        }
        disconnect() {
          disconnected = true;
        }
      },
      requestAnimationFrame(callback) {
        queued = callback;
        return 1;
      },
      cancelAnimationFrame() {
        queued = null;
      }
    },
    trialHistoryApi: {
      signupWorkWarnings: () => new Map([["7", { share: 0.02, weekStartAt: 1 }]]),
      weekNumber: () => 11
    },
    getRecords: () => [],
    getContext: () => ({
      signups: { 7: { signedUpSkillingTrialHrid: "/guild_trials/milking" } },
      roster: { 7: { name: "Member" } }
    }),
    t: (key) => (key === "trialName_milking" ? "挤奶" : "低工作量提醒")
  });
  warning.start();
  assert.equal(watched, document);
  document.body = { nodeType: 1 };
  modals = [modal];
  onMutation([{ target: document, addedNodes: [modal], removedNodes: [] }]);
  queued();
  assert.equal(attrs.get("data-mwi-trial-low-work"), "true");
  assert.equal(attrs.get("title"), "低工作量提醒");
  warning.dispose();
  assert.equal(disconnected, true);
  assert.equal(attrs.has("data-mwi-trial-low-work"), false);
  assert.equal(attrs.get("title"), "原有提示");
  assert.equal(attrs.has("aria-description"), false);
});
