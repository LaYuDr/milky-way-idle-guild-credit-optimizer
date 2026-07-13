"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const core = require("../src/core.js");
const localization = require("../src/localization.js");
const chineseItemNames = require("../src/zh-cn-items.js");

test("按价格逐档累计订单簿成本", () => {
  const quote = core.quoteAsks({ asks: [{ price: 10, quantity: 3 }, { price: 12, quantity: 8 }] }, 7);
  assert.deepEqual(quote, {
    status: "ok", requestedQuantity: 7, availableQuantity: 11, cost: 78,
    fills: [{ price: 10, quantity: 3 }, { price: 12, quantity: 4 }]
  });
});

test("订单簿不足时不虚报总价", () => {
  const quote = core.quoteAsks({ asks: [{ price: 10, quantity: 3 }] }, 4);
  assert.equal(quote.status, "insufficient_depth");
  assert.equal(quote.cost, null);
  assert.equal(quote.availableQuantity, 3);
});

test("目标信用点按兑换批次向上取整且买方手续费为零", () => {
  const result = core.evaluateConversion(
    { itemHrid: "/items/cheese", itemName: "奶酪", itemCount: 10, creditCount: 3, creditItemHrid: "/items/green_guild_credit" },
    { asks: [{ price: 5, quantity: 400 }] },
    101
  );
  assert.equal(result.batches, 34);
  assert.equal(result.requiredItems, 340);
  assert.equal(result.actualCredits, 102);
  assert.equal(result.cost, 1700);
  assert.equal(result.buyerFee, 0);
});

test("完整方案优先于市场深度不足的更低理论单价", () => {
  const results = core.rankConversions([
    { itemHrid: "/items/a", itemName: "A", itemCount: 1, creditCount: 1 },
    { itemHrid: "/items/b", itemName: "B", itemCount: 1, creditCount: 1 }
  ], {
    "/items/a": { asks: [{ price: 1, quantity: 2 }] },
    "/items/b": { asks: [{ price: 2, quantity: 10 }] }
  }, 5);
  assert.equal(results[0].itemHrid, "/items/b");
  assert.equal(results[1].status, "insufficient_depth");
});

test("卖出后按预算回购时按可兑换批次计算信用点", () => {
  const result = core.evaluateBudgetConversion(
    { itemHrid: "/items/cheese", itemName: "奶酪", itemCount: 4, creditCount: 3, creditItemHrid: "/items/green_guild_credit" },
    5,
    43
  );
  assert.equal(result.status, "ok");
  assert.equal(result.batches, 2);
  assert.equal(result.requiredItems, 8);
  assert.equal(result.actualCredits, 6);
  assert.equal(result.cost, 40);
  assert.equal(result.remainingBudget, 3);
  assert.equal(result.buyerFee, 0);
});

test("卖出后回购优先选择可获得信用点最多的物品", () => {
  const best = core.bestConversionForBudget([
    { itemHrid: "/items/a", itemName: "A", itemCount: 10, creditCount: 1 },
    { itemHrid: "/items/b", itemName: "B", itemCount: 3, creditCount: 2 },
    { itemHrid: "/items/c", itemName: "C", itemCount: 1, creditCount: 1 }
  ], {
    "/items/a": 4,
    "/items/b": 5,
    "/items/c": 30
  }, 45);
  assert.equal(best.itemHrid, "/items/b");
  assert.equal(best.actualCredits, 6);
  assert.equal(best.remainingBudget, 0);
});

test("卖出估算扣除百分之二市场税", () => {
  const result = core.calculateSaleProceeds(3, 1450, 0.02);
  assert.deepEqual(result, {
    status: "ok",
    quantity: 3,
    sellPrice: 1450,
    sellerTaxRate: 0.02,
    gross: 4350,
    tax: 87,
    net: 4263
  });
});

test("强化装备使用对应强化等级的公开市场价格", () => {
  const snapshot = {
    marketData: {
      "/items/cheese_boots": {
        "0": { b: 100 },
        "5": { a: 900, b: 800 }
      }
    }
  };
  assert.equal(core.snapshotMarketPrice(snapshot, "/items/cheese_boots", 5, "b"), 800);
  assert.equal(core.snapshotMarketPrice(snapshot, "/items/cheese_boots", 5, "a"), 900);
  assert.equal(core.snapshotMarketPrice(snapshot, "/items/cheese_boots", 6, "b"), null);
  assert.equal(core.snapshotMarketPrice(snapshot, "/items/cheese_boots", 0, "b"), 100);
});

test("目标成本按完整数值、k 与 m 紧凑显示", () => {
  assert.equal(core.formatCompactCost(1231), "1231");
  assert.equal(core.formatCompactCost(12000), "12k");
  assert.equal(core.formatCompactCost(1233000), "1233k");
  assert.equal(core.formatCompactCost(12000000), "12m");
  assert.equal(core.formatCompactCost(1234000000), "1234m");
});

test("神龛增益从起始等级到目标等级逐级累计信用点", () => {
  const result = core.aggregateGuildBuffLevelCosts([
    null,
    { guildTokenCost: 400, creditCosts: [{ itemHrid: "/items/brown_guild_credit", count: 2000 }] },
    { guildTokenCost: 800, creditCosts: [{ itemHrid: "/items/brown_guild_credit", count: 3000 }, { itemHrid: "/items/red_guild_credit", count: 100 }] },
    { guildTokenCost: 1600, creditCosts: [{ itemHrid: "/items/red_guild_credit", count: 500 }] }
  ], 0, 3);
  assert.deepEqual(result, {
    status: "ok",
    startLevel: 0,
    targetLevel: 3,
    maxLevel: 3,
    totals: [
      { itemHrid: "/items/brown_guild_credit", count: 5000 },
      { itemHrid: "/items/guild_token", count: 2800 },
      { itemHrid: "/items/red_guild_credit", count: 600 }
    ]
  });
});

test("神龛增益从二级升到三级只计入三级成本", () => {
  const result = core.aggregateGuildBuffLevelCosts([
    null,
    { guildTokenCost: 10, creditCosts: [{ itemHrid: "/items/green_guild_credit", count: 20 }] },
    { guildTokenCost: 30, creditCosts: [{ itemHrid: "/items/green_guild_credit", count: 40 }] },
    { guildTokenCost: 50, creditCosts: [{ itemHrid: "/items/green_guild_credit", count: 60 }] }
  ], 2, 3);
  assert.deepEqual(result.totals, [
    { itemHrid: "/items/green_guild_credit", count: 60 },
    { itemHrid: "/items/guild_token", count: 50 }
  ]);
});

test("多项神龛升级合并相同材料", () => {
  const result = core.aggregateGuildBuffPlans([
    {
      id: "force-combat",
      guildBuffHrid: "/guild_buffs/force_combat",
      startLevel: 0,
      targetLevel: 1,
      levelCosts: [null, { guildTokenCost: 400, creditCosts: [{ itemHrid: "/items/green_guild_credit", count: 2000 }] }]
    },
    {
      id: "tempo-life",
      guildBuffHrid: "/guild_buffs/tempo_life",
      startLevel: 2,
      targetLevel: 3,
      levelCosts: [null, null, null, { guildTokenCost: 600, creditCosts: [{ itemHrid: "/items/green_guild_credit", count: 500 }, { itemHrid: "/items/red_guild_credit", count: 100 }] }]
    }
  ]);
  assert.equal(result.status, "ok");
  assert.deepEqual(result.totals, [
    { itemHrid: "/items/green_guild_credit", count: 2500 },
    { itemHrid: "/items/guild_token", count: 1000 },
    { itemHrid: "/items/red_guild_credit", count: 100 }
  ]);
});

test("中文物品本地化覆盖究极茶和全等级护符", () => {
  assert.equal(localization.localizeItemName({ itemName: "Ultra Brewing Tea", locale: "zh-CN", chineseNames: chineseItemNames }), "究极冲泡茶");
  assert.equal(localization.localizeItemName({ itemName: "Expert Attack Charm", locale: "zh-CN", chineseNames: chineseItemNames }), "专家攻击护符");
  assert.equal(localization.localizeItemName({ itemName: "Master Intelligence Charm", locale: "zh-CN", chineseNames: chineseItemNames }), "大师智力护符");
  assert.equal(localization.localizeItemName({ itemName: "Master Intelligence Charm", locale: "en", chineseNames: chineseItemNames }), "Master Intelligence Charm");
});

test("支持游戏初始化消息使用的 itemDetailMap 对象结构", () => {
  const conversions = core.conversionsFromItemDetails({
    "/items/cheese": {
      guildCreditConversions: [{ creditItemHrid: "/items/green_guild_credit", itemCount: 10, creditCount: 1 }]
    }
  }, "/items/green_guild_credit");
  assert.deepEqual(conversions, [{
    itemHrid: "/items/cheese", itemName: "/items/cheese", creditItemHrid: "/items/green_guild_credit", itemCount: 10, creditCount: 1
  }]);
});

test("总览界面固定展示八种信用点、前五项、中文名与物品图标", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "userscript.js"), "utf8");
  const buildSource = fs.readFileSync(path.join(__dirname, "..", "tools", "build.js"), "utf8");
  assert.equal((source.match(/guild_credit/g) || []).length >= 8, true);
  assert.match(source, /filter\(\(row\) => row\.status === "ok"\)\.slice\(0, 5\)/);
  assert.match(source, /MwiGuildCreditChineseItems/);
  assert.match(source, /MwiGuildCreditLocalization/);
  assert.match(source, /svg\[role="img"\]\[aria-label\] use/);
  assert.match(source, /state\.pageItemNames\[itemHrid\]/);
  assert.match(source, /use\.closest\("#mwi-credit-optimizer"\)/);
  assert.match(source, /"Philosopher's Mirror": "贤者之镜"/);
  assert.match(source, /items_sprite/);
  assert.match(source, /tabPanelsContainer/);
  assert.match(source, /String\(child\.innerText \|\| child\.textContent \|\| ""\)\.replaceAll/);
  assert.doesNotMatch(source, /child\.innerText\.replaceAll/);
  assert.match(source, /overflow-y:auto/);
  assert.match(source, /repeat\(auto-fit,minmax\(min\(100%,320px\),1fr\)\)/);
  assert.match(source, /data-role="toggle-credit-section"/);
  assert.match(source, /collapsedCreditSections/);
  assert.match(source, /mwi-credit-body/);
  assert.match(source, /classList\.add\("Mui-selected"\)/);
  assert.match(source, /data-role="upgrade-plan-list"/);
  assert.match(source, /mwi-upgrade-actions.*data-role="add-upgrade-plan"/);
  assert.match(source, /data-role="plan-start"/);
  assert.match(source, /data-role="plan-target"/);
  assert.match(source, /\.mwi-upgrade-plan label:first-child\{grid-column:1\/-1;grid-row:1\}/);
  assert.match(source, /\.mwi-upgrade-plan select\{width:100%!important/);
  assert.match(source, /characterGuildBuffMap/);
  assert.match(source, /guildBuffLevelMap/);
  assert.match(source, /stored\.level \?\? stored\.currentLevel/);
  assert.match(source, /未读取当前神龛等级，已按 0 级开始/);
  assert.doesNotMatch(source, /正在读取当前神龛等级，请稍后重新打开此页/);
  assert.match(source, /aggregateGuildBuffPlans/);
  assert.match(source, /core\.formatCompactCost\(row\.cost\)/);
  assert.match(source, /snapshotImmediateSellPrice/);
  assert.match(source, /Item_enhancementLevel/);
  assert.match(source, /selectedEnhancementLevel/);
  assert.match(source, /snapshotImmediateSellPrice\(selectedConversion\.itemHrid, modalData\.selectedEnhancementLevel\)/);
  assert.match(source, /bestConversionForBudget/);
  assert.match(source, /SELLER_TAX_RATE = 0\.02/);
  assert.match(source, /calculateSaleProceeds/);
  assert.match(source, /GuildPanel_exchangeModalContent/);
  assert.match(source, /mwi-guild-exchange-advisor/);
  assert.match(source, /iconMarkup\(data\.bestItemHrid, data\.bestItem\)/);
  assert.match(source, /bestItemHrid: best\.itemHrid/);
  assert.match(source, /const height = Math\.min\(rect\.height, maxHeight\)/);
  assert.doesNotMatch(source, /mwi-advisor-note/);
  assert.doesNotMatch(source, /data-role="note"/);
  assert.match(source, /作者：柆雨/);
  assert.match(source, /有问题请加群反馈：437320340/);
  assert.match(buildSource, /@author       柆雨/);
  assert.match(buildSource, /@license      Copyright 柆雨/);
  assert.doesNotMatch(source, /mwi-credit-tab-active/);
  assert.doesNotMatch(source, /upgrade-refresh/);
  assert.doesNotMatch(source, /get_market_item_order_books/);
  assert.doesNotMatch(source, /window\.WebSocket/);
  assert.doesNotMatch(buildSource, /@downloadURL|@updateURL/);
  assert.match(buildSource, /@match        https:\/\/www\.milkywayidle\.com\/\*/);
  assert.match(buildSource, /@match        https:\/\/www\.milkywayidlecn\.com\/\*/);
});
