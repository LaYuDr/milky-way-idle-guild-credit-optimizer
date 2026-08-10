"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const sortable = require("../src/ui/sortable.js");

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
