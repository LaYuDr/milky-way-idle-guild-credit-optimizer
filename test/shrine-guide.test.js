"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const guide = require("../src/shrine-guide.js");
const exchangeAdvisorApi = require("../src/ui/exchange-advisor.js");
const shrineGuideUiApi = require("../src/ui/shrine-guide-ui.js");

const creditOrder = ["/items/green_guild_credit", "/items/blue_guild_credit"];

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

function exchangeInputFixture(labels) {
  const paymentInput = { value: "12" };
  const quantityInput = { value: "30" };
  const fields = [
    {
      querySelector(selector) {
        if (selector === "input") return paymentInput;
        if (selector.includes("GuildPanel_label")) return { textContent: labels[0] };
        return null;
      }
    },
    {
      querySelector(selector) {
        if (selector === "input") return quantityInput;
        if (selector.includes("GuildPanel_label")) return { textContent: labels[1] };
        return null;
      }
    }
  ];
  return {
    paymentInput,
    quantityInput,
    element: {
      querySelectorAll(selector) {
        return selector.includes("GuildPanel_inputContainer") ? fields : [];
      },
      querySelector() {
        return null;
      }
    }
  };
}

test("双数量框按你支付和你获得语义只选择目标获得输入框", () => {
  for (const labels of [
    ["你支付(上限:12)", "你获得"],
    ["You pay (max: 12)", "You receive"]
  ]) {
    const fixture = exchangeInputFixture(labels);
    const result = exchangeAdvisorApi.guildExchangeQuantityInputs(fixture.element);
    assert.equal(result.paymentInput, fixture.paymentInput);
    assert.equal(result.quantityInput, fixture.quantityInput);
  }
});

test("无法读取新版语义容器时仍兼容旧版单数量框", () => {
  const legacyInput = { value: "7" };
  const result = exchangeAdvisorApi.guildExchangeQuantityInputs({
    querySelectorAll() {
      return [];
    },
    querySelector(selector) {
      return selector === 'input[type="number"]' ? legacyInput : null;
    }
  });
  assert.equal(result.paymentInput, null);
  assert.equal(result.quantityInput, legacyInput);
});

test("新版双数量框的兑换批数优先按支付数量和兑换比例换算", () => {
  assert.equal(
    exchangeAdvisorApi.guildExchangeBatches(
      { paymentQuantity: 12, targetQuantity: 30, batches: 30 },
      { itemCount: 4, creditCount: 10 }
    ),
    3
  );
  assert.equal(
    exchangeAdvisorApi.guildExchangeBatches(
      { paymentQuantity: null, targetQuantity: 30, batches: 30 },
      { itemCount: 4, creditCount: 10 }
    ),
    3
  );
});

test("原生数量上限区分缺失值与玩家当前为零", () => {
  assert.equal(exchangeAdvisorApi.inputMaximum({ max: "" }), null);
  assert.equal(exchangeAdvisorApi.inputMaximum({ max: "0" }), 0);
  assert.equal(exchangeAdvisorApi.inputMaximum({ max: "1250" }), 1250);
});

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
      "/items/green_guild_credit": {
        itemHrid: "/items/beast_hide",
        itemCount: 4,
        creditCount: 1,
        batches: 20000,
        requiredItems: 80000,
        actualCredits: 20000
      },
      "/items/blue_guild_credit": {
        itemHrid: "/items/eye_essence",
        itemCount: 10,
        creditCount: 1,
        batches: 22000,
        requiredItems: 220000,
        actualCredits: 22000
      }
    }
  });
  assert.equal(result.status, "choose_credit");
  assert.deepEqual(
    result.missingCredits.map((step) => step.creditItemHrid),
    creditOrder
  );
  assert.equal(result.missingCredits[0].batches, 20000);
  assert.equal(result.missingCredits[0].requiredItems, 80000);
});

test("打开缺少的信用点后先指向推荐物品，再指向批次数量", () => {
  const base = {
    estimate: { rows: [{ itemHrid: "/items/green_guild_credit", missing: 20000 }] },
    creditMaterialPlans: {
      "/items/green_guild_credit": {
        itemHrid: "/items/beast_hide",
        itemCount: 4,
        creditCount: 1,
        batches: 20000,
        requiredItems: 80000,
        actualCredits: 20000
      }
    }
  };
  const chooseItem = derive({
    ...base,
    modal: { creditItemHrid: "/items/green_guild_credit", selectedItemHrid: null }
  });
  assert.equal(chooseItem.status, "choose_item");
  assert.equal(chooseItem.activeCredit.recommendedItemHrid, "/items/beast_hide");

  const differentItem = derive({
    ...base,
    modal: { creditItemHrid: "/items/green_guild_credit", selectedItemHrid: "/items/rainbow_cheese" }
  });
  assert.equal(differentItem.status, "choose_item");

  const quantity = derive({
    ...base,
    modal: { creditItemHrid: "/items/green_guild_credit", selectedItemHrid: "/items/beast_hide" }
  });
  assert.equal(quantity.status, "set_quantity");
  assert.equal(quantity.activeCredit.batches, 20000);
  assert.equal(quantity.activeCredit.suggestedBatches, 20000);
  assert.equal(quantity.activeCredit.requiredItems, 80000);
});

test("剩余批数超过原生单次上限时只提示本次可填写数量", () => {
  const result = derive({
    estimate: { rows: [{ itemHrid: "/items/green_guild_credit", missing: 20000 }] },
    creditMaterialPlans: {
      "/items/green_guild_credit": {
        itemHrid: "/items/beast_hide",
        itemCount: 4,
        creditCount: 1,
        batches: 20000,
        requiredItems: 80000,
        actualCredits: 20000
      }
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

test("规划数量按背包库存封顶并折算为目标信用点输入值", () => {
  const result = derive({
    estimate: { rows: [{ itemHrid: "/items/green_guild_credit", missing: 20000 }] },
    creditMaterialPlans: {
      "/items/green_guild_credit": {
        itemHrid: "/items/beast_hide",
        itemCount: 4,
        creditCount: 10,
        batches: 2000,
        requiredItems: 8000,
        actualCredits: 20000
      }
    },
    characterItems: [{ itemHrid: "/items/beast_hide", itemLocationHrid: "/item_locations/inventory", count: 125 }],
    modal: {
      creditItemHrid: "/items/green_guild_credit",
      selectedItemHrid: "/items/beast_hide",
      maxTargetQuantity: 500
    }
  });
  assert.equal(result.status, "set_quantity");
  assert.equal(result.activeCredit.batches, 2000);
  assert.equal(result.activeCredit.maxBatches, 31);
  assert.equal(result.activeCredit.suggestedBatches, 31);
  assert.equal(result.activeCredit.suggestedItems, 124);
  assert.equal(result.activeCredit.suggestedCredits, 310);
  assert.equal(shrineGuideUiApi.shrineGuideAutofillQuantity(result.activeCredit), 310);
});

test("零库存保留为明确上限而不是误当成无限库存", () => {
  const result = derive({
    estimate: { rows: [{ itemHrid: "/items/green_guild_credit", missing: 20 }] },
    creditMaterialPlans: {
      "/items/green_guild_credit": {
        itemHrid: "/items/beast_hide",
        itemCount: 4,
        creditCount: 1,
        batches: 20,
        requiredItems: 80,
        actualCredits: 20
      }
    },
    characterItems: [],
    modal: {
      creditItemHrid: "/items/green_guild_credit",
      selectedItemHrid: "/items/beast_hide"
    }
  });
  assert.equal(result.activeCredit.maxBatches, 0);
  assert.equal(result.activeCredit.suggestedBatches, 0);
  assert.equal(result.activeCredit.suggestedCredits, 0);
});

test("一次性预填通过原生 setter 触发 input 与 change 且不重复写入", () => {
  const events = [];
  class TestInput {
    constructor() {
      this._value = "1";
      this.ownerDocument = { defaultView: { HTMLInputElement: TestInput, Event } };
    }

    get value() {
      return this._value;
    }

    set value(value) {
      this._value = String(value);
    }

    dispatchEvent(event) {
      events.push(event.type);
      return true;
    }
  }
  const input = new TestInput();
  assert.equal(shrineGuideUiApi.setNativeInputValue(input, 310), true);
  assert.equal(input.value, "310");
  assert.deepEqual(events, ["input", "change"]);
  assert.equal(shrineGuideUiApi.setNativeInputValue(input, 310), false);
  assert.deepEqual(events, ["input", "change"]);
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
      "/items/blue_guild_credit": {
        itemHrid: "/items/eye_essence",
        itemCount: 10,
        creditCount: 1,
        batches: 22000,
        requiredItems: 220000,
        actualCredits: 22000
      }
    }
  });
  assert.deepEqual(
    result.missingCredits.map((step) => step.creditItemHrid),
    ["/items/blue_guild_credit"]
  );
});

test("公会代币未选中时提示选币，选中后进入数量步骤", () => {
  const base = {
    estimate: {
      rows: [
        {
          itemHrid: "/items/green_guild_credit",
          missing: 20,
          guildTokenExchange: {
            batches: 2,
            guildTokenCount: 1,
            creditCount: 10,
            requiredGuildTokens: 2,
            actualCredits: 20
          }
        }
      ]
    }
  };
  const chooseToken = derive({
    ...base,
    modal: { creditItemHrid: "/items/green_guild_credit", selectedItemHrid: null }
  });
  assert.equal(chooseToken.status, "use_guild_token");
  assert.equal(chooseToken.activeCredit.recommendedItemHrid, "/items/guild_token");
  assert.equal(chooseToken.activeCredit.requiredItems, 2);

  const quantity = derive({
    ...base,
    modal: { creditItemHrid: "/items/green_guild_credit", selectedItemHrid: "/items/guild_token" }
  });
  assert.equal(quantity.status, "set_quantity");
  assert.equal(quantity.activeCredit.suggestedBatches, 2);
  assert.equal(quantity.activeCredit.suggestedItems, 2);
});

test("公会代币非一比一兑换同时区分总批数、本次批数与代币枚数", () => {
  const result = derive({
    estimate: {
      rows: [
        {
          itemHrid: "/items/green_guild_credit",
          missing: 70,
          guildTokenExchange: {
            batches: 7,
            guildTokenCount: 3,
            creditCount: 10,
            requiredGuildTokens: 21,
            actualCredits: 70
          }
        }
      ]
    },
    modal: {
      creditItemHrid: "/items/green_guild_credit",
      selectedItemHrid: "/items/guild_token",
      maxBatches: 4
    }
  });
  assert.equal(result.status, "set_quantity");
  assert.equal(result.activeCredit.batches, 7);
  assert.equal(result.activeCredit.requiredItems, 21);
  assert.equal(result.activeCredit.suggestedBatches, 4);
  assert.equal(result.activeCredit.suggestedItems, 12);
  assert.equal(result.activeCredit.suggestedCredits, 40);
});

test("兑换建议仅为已开启指引且当前估算选择代币的信用点返回高亮状态", () => {
  const state = {
    shrineGuideEnabled: true,
    shrineGuideContext: {
      estimate: {
        rows: [
          {
            itemHrid: "/items/green_guild_credit",
            missing: 20,
            guildTokenExchange: { requiredGuildTokens: 2 }
          },
          { itemHrid: "/items/blue_guild_credit", missing: 20 }
        ]
      }
    }
  };
  const advisor = exchangeAdvisorApi.createExchangeAdvisor({ state });
  assert.equal(advisor.shrineGuideUsesGuildTokensFor("/items/green_guild_credit"), true);
  assert.equal(advisor.shrineGuideUsesGuildTokensFor("/items/blue_guild_credit"), false);
  assert.equal(advisor.shrineGuideUsesGuildTokensFor("/items/red_guild_credit"), false);

  state.shrineGuideEnabled = false;
  assert.equal(advisor.shrineGuideUsesGuildTokensFor("/items/green_guild_credit"), false);
});

test("公会代币推荐会进入原生物品高亮，并提供双语代币数量详情", () => {
  const projectFile = (relativePath) => fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8");
  const shrineGuideUi = projectFile("src/ui/shrine-guide-ui.js");
  const localization = projectFile("src/localization.js");
  assert.match(shrineGuideUi, /for \(const item of nativeRecommendedItems\(step\.recommendedItemHrid\)\)/);
  assert.doesNotMatch(
    shrineGuideUi,
    /if \(step\.method === "market_item"\)\s*\{\s*for \(const item of nativeRecommendedItems/
  );
  assert.match(shrineGuideUi, /t\("guideTokenQuantityDetail"/);
  assert.equal((localization.match(/guideTokenQuantityDetail:/g) || []).length, 2);
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
