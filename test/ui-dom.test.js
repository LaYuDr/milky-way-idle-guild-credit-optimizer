"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const domApi = require("../src/ui/dom.js");

test("DOM 标记仅在内容变化时写入并记录渲染快照", () => {
  const element = { innerHTML: "" };
  assert.equal(domApi.updateRenderedMarkup(element, "<b>one</b>", "__rendered"), true);
  assert.equal(element.innerHTML, "<b>one</b>");
  assert.equal(domApi.updateRenderedMarkup(element, "<b>one</b>", "__rendered"), false);
  assert.equal(domApi.updateRenderedMarkup(element, "<b>two</b>", "__rendered"), true);
});

test("HTML 转义覆盖文本插值所需的五个危险字符", () => {
  assert.equal(domApi.escapeHtml(`<tag a='1' b="2">&`), "&lt;tag a=&#39;1&#39; b=&quot;2&quot;&gt;&amp;");
});

test("物品图标解析保留 HRID 与强化等级边界", () => {
  const icon = {
    querySelector(selector) {
      if (selector === "use") return { getAttribute: (name) => (name === "href" ? "/sprites.svg#sword" : null) };
      return null;
    },
    closest() {
      return { querySelector: () => ({ textContent: "+12" }) };
    }
  };
  assert.equal(domApi.itemHridFromIcon(icon), "/items/sword");
  assert.equal(domApi.enhancementLevelFromIcon(icon), 12);
  assert.equal(domApi.itemHridFromIcon(null), null);
});
