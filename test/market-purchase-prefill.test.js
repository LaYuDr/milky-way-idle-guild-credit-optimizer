"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function fixture() {
  let tick = null;
  let now = 0;
  const listeners = new Map();
  const calls = [];
  const controller = { state: { character: { id: 1 } }, handleGoToMarketplace() {} };
  const panel = {
    state: {
      itemHrid: "/items/tea",
      showPostListing: false,
      isSell: false,
      enhancementLevelInput: "0",
      priceInput: "10"
    },
    getMaxQuantity: () => 1000,
    handleQuantityInputChanged: (event) => calls.push(event.target.value)
  };
  const root = {
    __reactContainer$test: { current: { child: { stateNode: controller, sibling: { stateNode: panel } } } }
  };
  const page = {
    WebSocket: class {},
    document: {
      getElementById: () => root,
      addEventListener: (type, fn) => listeners.set(type, fn),
      removeEventListener: (type) => listeners.delete(type)
    },
    setInterval: (fn) => {
      tick = fn;
      return 1;
    },
    clearInterval: () => {
      tick = null;
    }
  };
  vm.runInNewContext(fs.readFileSync(require.resolve("../src/bridge.js"), "utf8"), {
    window: page,
    URL,
    Date: { now: () => now }
  });
  return {
    bridge: page.__mwiGuildCreditBridge,
    panel,
    controller,
    calls,
    listeners,
    tick: () => tick?.(),
    active: () => tick !== null,
    expire: () => {
      now = 120001;
    }
  };
}

test("购买表单出现后只预填一次，受余额上限约束", () => {
  const f = fixture();
  assert.equal(f.bridge.armPurchasePrefill("/items/tea", 167304), true);
  f.tick();
  assert.deepEqual(f.calls, []);
  f.panel.state.showPostListing = true;
  f.tick();
  assert.deepEqual(f.calls, ["1000"]);
  f.tick();
  assert.equal(f.active(), false);
  assert.equal(f.listeners.size, 0);
});

for (const [label, change] of Object.entries({
  sell: (f) => {
    f.panel.state.isSell = true;
  },
  enhanced: (f) => {
    f.panel.state.enhancementLevelInput = "1";
  },
  differentItem: (f) => {
    f.panel.state.itemHrid = "/items/milk";
  },
  character: (f) => {
    f.controller.state.character.id = 2;
  },
  expired: (f) => f.expire(),
  manualInput: (f) => f.listeners.get("input")({ target: { closest: () => ({}) } }),
  noBalance: (f) => {
    f.panel.getMaxQuantity = () => 0;
  }
})) {
  test(`取消不合适的预填：${label}`, () => {
    const f = fixture();
    f.bridge.armPurchasePrefill("/items/tea", 33);
    f.tick();
    f.panel.state.showPostListing = true;
    change(f);
    f.tick();
    assert.deepEqual(f.calls, []);
    assert.equal(f.active(), false);
  });
}

test("新入口取代旧请求，非法或零数量取消预填", () => {
  const f = fixture();
  f.bridge.armPurchasePrefill("/items/tea", 33);
  f.bridge.armPurchasePrefill("/items/tea", 12);
  f.panel.state.showPostListing = true;
  f.tick();
  assert.deepEqual(f.calls, ["12"]);
  for (const quantity of [0, -1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(f.bridge.armPurchasePrefill("/items/tea", quantity), false);
    assert.equal(f.active(), false);
  }
});

test("等待价格时关闭表单会取消，重新打开不再预填", () => {
  const f = fixture();
  f.bridge.armPurchasePrefill("/items/tea", 33);
  f.panel.state.showPostListing = true;
  f.panel.state.priceInput = "";
  f.tick();
  f.panel.state.showPostListing = false;
  f.tick();
  f.panel.state.showPostListing = true;
  f.panel.state.priceInput = "10";
  f.tick();
  assert.deepEqual(f.calls, []);
  assert.equal(f.active(), false);
});
