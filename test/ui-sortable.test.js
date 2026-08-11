"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const sortable = require("../src/ui/sortable.js");

function keyboardSortableFixture(axis = "x") {
  const listeners = new Map();
  const classList = { add() {}, remove() {} };
  const container = {
    classList,
    querySelectorAll(selector) {
      return selector === ".item" ? items : [];
    }
  };
  const items = ["first", "second"].map((key) => ({
    classList,
    dataset: { sortKey: key },
    parentElement: container,
    closest(selector) {
      return selector === ".item" ? this : selector === ".container" ? container : null;
    }
  }));
  const handle = {
    nodeType: 1,
    closest(selector) {
      return selector === ".handle" ? this : selector === ".item" ? items[0] : null;
    }
  };
  const commits = [];
  const root = {
    ownerDocument: null,
    querySelectorAll(selector) {
      return selector === ".container" ? [container] : [];
    },
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    removeEventListener() {},
    contains(candidate) {
      return candidate === container;
    }
  };
  const controller = sortable.createPointerSortable({
    root,
    containerSelector: ".container",
    itemSelector: ".item",
    handleSelector: ".handle",
    axis,
    onCommit(change) {
      commits.push(change);
    }
  });

  return {
    commits,
    dispatchKey(key, altKey = true) {
      let defaultPrevented = false;
      listeners.get("keydown")({
        key,
        altKey,
        target: handle,
        preventDefault() {
          defaultPrevented = true;
        }
      });
      return defaultPrevented;
    },
    destroy: () => controller.destroy()
  };
}

test("排序纯函数支持首尾与中间移动且不修改原数组", () => {
  const source = ["upgrade", "credit", "construction"];
  assert.deepEqual(sortable.reorderByIndex(source, 0, 2), ["credit", "construction", "upgrade"]);
  assert.deepEqual(sortable.reorderByIndex(source, 2, 0), ["construction", "upgrade", "credit"]);
  assert.deepEqual(sortable.reorderByIndex(source, 1, 2), ["upgrade", "construction", "credit"]);
  assert.deepEqual(source, ["upgrade", "credit", "construction"]);
});

test("无效或未变化的排序索引保持内容不变", () => {
  const source = ["a", "b", "c"];
  assert.deepEqual(sortable.reorderByIndex(source, 1, 1), source);
  assert.deepEqual(sortable.reorderByIndex(source, -1, 1), source);
  assert.deepEqual(sortable.reorderByIndex(source, 1, 8), source);
});

test("只重排可见项并保留隐藏项在完整顺序中的槽位", () => {
  const fullOrder = ["upgrade", "construction", "credit"];
  assert.deepEqual(sortable.reorderVisibleByIndex(fullOrder, ["upgrade", "credit"], "credit", 0), [
    "credit",
    "construction",
    "upgrade"
  ]);
  assert.deepEqual(fullOrder, ["upgrade", "construction", "credit"]);
  assert.deepEqual(sortable.reorderVisibleByIndex(fullOrder, ["upgrade", "credit"], "construction", 0), fullOrder);
});

test("持久化顺序会去重、忽略未知项并按默认顺序补齐", () => {
  const allowed = ["credit", "upgrade", "construction"];
  const fallback = ["upgrade", "credit", "construction"];
  assert.deepEqual(sortable.normalizeOrder(["construction", "construction", "unknown", "upgrade"], allowed, fallback), [
    "construction",
    "upgrade",
    "credit"
  ]);
  assert.deepEqual(sortable.normalizeOrder(null, allowed, fallback), fallback);
});

test("排序快捷键在首尾边界仍阻止浏览器默认导航", () => {
  const fixture = keyboardSortableFixture("x");
  assert.equal(fixture.dispatchKey("ArrowLeft"), true);
  assert.equal(fixture.commits.length, 0);
  assert.equal(fixture.dispatchKey("ArrowUp"), false);
  assert.equal(fixture.dispatchKey("ArrowRight", false), false);
  fixture.destroy();
});

test("排序快捷键在可移动方向提交一次变更", () => {
  const fixture = keyboardSortableFixture("x");
  assert.equal(fixture.dispatchKey("ArrowRight"), true);
  assert.equal(fixture.commits.length, 1);
  assert.deepEqual(
    { key: fixture.commits[0].key, fromIndex: fixture.commits[0].fromIndex, toIndex: fixture.commits[0].toIndex },
    { key: "first", fromIndex: 0, toIndex: 1 }
  );
  fixture.destroy();
});
