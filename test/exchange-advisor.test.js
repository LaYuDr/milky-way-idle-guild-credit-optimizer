"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const exchangeAdvisorApi = require("../src/ui/exchange-advisor.js");

test("侧边空间足够时推荐面板与原生兑换弹窗顶线对齐", () => {
  const position = exchangeAdvisorApi.calculateGuildExchangeAdvisorPosition(
    { top: 32, right: 760, bottom: 410, left: 12, width: 748, height: 378 },
    { width: 400, height: 580 },
    1600,
    640
  );

  assert.deepEqual(position, { placement: "right", left: 772, top: 32 });
});

test("贴近视口顶部的侧边推荐保留安全边距", () => {
  const position = exchangeAdvisorApi.calculateGuildExchangeAdvisorPosition(
    { top: 4, right: 500, bottom: 410, left: 20, width: 480, height: 406 },
    { width: 400, height: 300 },
    1200,
    800
  );

  assert.equal(position.placement, "right");
  assert.equal(position.top, 12);
});

test("收起与展开同步内容可见性及无障碍状态", () => {
  const attributes = {};
  const content = { hidden: false };
  const toggle = {
    title: "",
    setAttribute(name, value) {
      attributes[name] = value;
    }
  };
  const ui = {
    collapsed: false,
    card: {
      dataset: {},
      querySelector(selector) {
        if (selector === '[data-role="advisor-content"]') return content;
        if (selector === '[data-role="toggle-advisor"]') return toggle;
        return null;
      }
    }
  };

  assert.equal(
    exchangeAdvisorApi.setGuildExchangeAdvisorCollapsed(ui, true, {
      collapse: "收起兑换推荐",
      expand: "展开兑换推荐"
    }),
    true
  );
  assert.equal(content.hidden, true);
  assert.equal(ui.card.dataset.collapsed, "true");
  assert.equal(attributes["aria-expanded"], "false");
  assert.equal(attributes["aria-label"], "展开兑换推荐");

  exchangeAdvisorApi.setGuildExchangeAdvisorCollapsed(ui, false, {
    collapse: "收起兑换推荐",
    expand: "展开兑换推荐"
  });
  assert.equal(content.hidden, false);
  assert.equal(ui.card.dataset.collapsed, "false");
  assert.equal(attributes["aria-expanded"], "true");
  assert.equal(attributes["aria-label"], "收起兑换推荐");
});
