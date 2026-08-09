"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const guide = require("../src/shrine-guide.js");

const creditOrder = [
  "/items/green_guild_credit",
  "/items/blue_guild_credit"
];

const spiritPlan = {
  guildBuffHrid: "/guild_buffs/spirit_skilling",
  shrineHrid: "/guild_shrines/spirit",
  domain: "life",
  label: "精神神龛（生活）",
  currentLevel: 2,
  targetLevel: 3
};

function derive(overrides = {}) {
  return guide.deriveShrineGuide({
    enabled: true,
    plans: [spiritPlan],
    creditOrder,
    estimate: { rows: [] },
    creditMaterialPlans: {},
    ...overrides
  });
}

test("关闭指引时不派生任何操作", () => {
  const result = derive({ enabled: false });
  assert.equal(result.status, "inactive");
  assert.deepEqual(result.missingCredits, []);
});

test("同时缺少多种信用点时按稳定色序全部列为待处理", () => {
  const result = derive({
    estimate: {
      rows: [
        { itemHrid: "/items/blue_guild_credit", missing: 22000 },
        { itemHrid: "/items/green_guild_credit", missing: 20000 }
      ]
    },
    creditMaterialPlans: {
      "/items/green_guild_credit": { itemHrid: "/items/beast_hide", itemCount: 4, creditCount: 1, batches: 20000, requiredItems: 80000, actualCredits: 20000 },
      "/items/blue_guild_credit": { itemHrid: "/items/eye_essence", itemCount: 10, creditCount: 1, batches: 22000, requiredItems: 220000, actualCredits: 22000 }
    }
  });
  assert.equal(result.status, "choose_credit");
  assert.deepEqual(result.missingCredits.map((step) => step.creditItemHrid), creditOrder);
  assert.equal(result.missingCredits[0].batches, 20000);
  assert.equal(result.missingCredits[0].requiredItems, 80000);
});

test("打开缺少的信用点后先指向推荐物品，再指向批次数量", () => {
  const base = {
    estimate: { rows: [{ itemHrid: "/items/green_guild_credit", missing: 20000 }] },
    creditMaterialPlans: {
      "/items/green_guild_credit": { itemHrid: "/items/beast_hide", itemCount: 4, creditCount: 1, batches: 20000, requiredItems: 80000, actualCredits: 20000 }
    }
  };
  const chooseItem = derive({ ...base, modal: { creditItemHrid: "/items/green_guild_credit", selectedItemHrid: null } });
  assert.equal(chooseItem.status, "choose_item");
  assert.equal(chooseItem.activeCredit.recommendedItemHrid, "/items/beast_hide");

  const differentItem = derive({ ...base, modal: { creditItemHrid: "/items/green_guild_credit", selectedItemHrid: "/items/rainbow_cheese" } });
  assert.equal(differentItem.status, "choose_item");

  const quantity = derive({ ...base, modal: { creditItemHrid: "/items/green_guild_credit", selectedItemHrid: "/items/beast_hide" } });
  assert.equal(quantity.status, "set_quantity");
  assert.equal(quantity.activeCredit.batches, 20000);
  assert.equal(quantity.activeCredit.suggestedBatches, 20000);
  assert.equal(quantity.activeCredit.requiredItems, 80000);
});

test("剩余批数超过原生单次上限时只提示本次可填写数量", () => {
  const result = derive({
    estimate: { rows: [{ itemHrid: "/items/green_guild_credit", missing: 20000 }] },
    creditMaterialPlans: {
      "/items/green_guild_credit": { itemHrid: "/items/beast_hide", itemCount: 4, creditCount: 1, batches: 20000, requiredItems: 80000, actualCredits: 20000 }
    },
    modal: {
      creditItemHrid: "/items/green_guild_credit",
      selectedItemHrid: "/items/beast_hide",
      maxBatches: 9504
    }
  });
  assert.equal(result.status, "set_quantity");
  assert.equal(result.activeCredit.batches, 20000);
  assert.equal(result.activeCredit.suggestedBatches, 9504);
  assert.equal(result.activeCredit.suggestedItems, 38016);
  assert.equal(result.activeCredit.suggestedCredits, 9504);
});

test("一种信用点补齐后只保留另一种待处理", () => {
  const result = derive({
    estimate: {
      rows: [
        { itemHrid: "/items/green_guild_credit", missing: 0 },
        { itemHrid: "/items/blue_guild_credit", missing: 22000 }
      ]
    },
    creditMaterialPlans: {
      "/items/blue_guild_credit": { itemHrid: "/items/eye_essence", itemCount: 10, creditCount: 1, batches: 22000, requiredItems: 220000, actualCredits: 22000 }
    }
  });
  assert.deepEqual(result.missingCredits.map((step) => step.creditItemHrid), ["/items/blue_guild_credit"]);
});

test("公会代币模式不会错误指向市场物品", () => {
  const result = derive({
    estimate: {
      rows: [{
        itemHrid: "/items/green_guild_credit",
        missing: 20,
        guildTokenExchange: { batches: 2, guildTokenCount: 1, creditCount: 10, requiredGuildTokens: 2, actualCredits: 20 }
      }]
    },
    modal: { creditItemHrid: "/items/green_guild_credit", selectedItemHrid: null }
  });
  assert.equal(result.status, "use_guild_token");
  assert.equal(result.activeCredit.recommendedItemHrid, "/items/guild_token");
  assert.equal(result.activeCredit.requiredItems, 2);
});

test("材料齐全后指向神龛，等级达到目标后完成", () => {
  assert.equal(derive().status, "upgrade_shrine");
  assert.equal(derive({ plans: [{ ...spiritPlan, currentLevel: 3 }] }).status, "complete");
});

test("非信用点材料仍有缺口时不误报可以升级", () => {
  const result = derive({ estimate: { rows: [{ itemHrid: "/items/guild_token", missing: 400 }] } });
  assert.equal(result.status, "blocked");
  assert.deepEqual(result.blockers, [{ itemHrid: "/items/guild_token", missing: 400 }]);
});
