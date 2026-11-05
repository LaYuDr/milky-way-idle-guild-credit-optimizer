"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { readRecommendation } = require("../src/ui/labyrinth-prefill.js");
function row(text, token = "ready:62:100:65", count = 1) {
  const cell = { textContent: text, getAttribute: (name) => (name.endsWith("token") ? token : "milking") };
  return { querySelectorAll: () => Array(count).fill(cell) };
}
test("直接使用显示设置等级，不对推荐值再次加一，支持零和负数", () => {
  for (const [text, value] of [
    ["+63", "63"],
    ["0", "0"],
    ["-12", "-12"],
    ["999", "999"],
    ["-999", "-999"]
  ])
    assert.equal(readRecommendation(row(text)).value, value);
});
test("缺失、计算中、非整数、越界或重复推荐列不预填", () => {
  for (const text of ["", "--", "计算中", "63.5", "1e2", "+1000", "-1000", "63级", "Infinity"])
    assert.equal(readRecommendation(row(text)), null);
  assert.equal(readRecommendation(row("+63", "status:pending")), null);
  assert.equal(readRecommendation(row("+63", "ready:62", 0)), null);
  assert.equal(readRecommendation(row("+63", "ready:62", 2)), null);
});
