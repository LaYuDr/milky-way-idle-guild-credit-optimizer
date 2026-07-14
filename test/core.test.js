"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
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

test("公会代币兑换价值保留游戏兑换规则顺序", () => {
  const values = core.rankGuildTokenCreditValues([
    { creditItemHrid: "/items/green_guild_credit", guildTokenCount: 1, creditCount: 10 },
    { creditItemHrid: "/items/gold_guild_credit", guildTokenCount: 60, creditCount: 1 },
    { creditItemHrid: "/items/red_guild_credit", guildTokenCount: 1, creditCount: 1 }
  ], {
    "/items/green_guild_credit": [{ status: "ok", cost: 800, itemHrid: "/items/cheese", itemName: "奶酪" }],
    "/items/gold_guild_credit": [{ status: "ok", cost: 900000, itemHrid: "/items/stone", itemName: "贤者之石" }],
    "/items/red_guild_credit": []
  });
  assert.equal(values[0].creditItemHrid, "/items/green_guild_credit");
  assert.equal(values[0].goldValuePerToken, 800);
  assert.equal(values[1].creditItemHrid, "/items/gold_guild_credit");
  assert.equal(values[1].goldValuePerToken, 15000);
  assert.equal(values[2].status, "unpriced");
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

test("版本号比较能识别可用更新", () => {
  assert.equal(core.compareVersions("0.4.24", "0.4.25"), -1);
  assert.equal(core.compareVersions("0.4.25", "0.4.25"), 0);
  assert.equal(core.compareVersions("0.5.0", "0.4.25"), 1);
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

test("神龛升级分别计算全部信用点成本与扣除库存后的缺口成本", () => {
  const estimate = core.estimateGuildUpgradeCosts([
    { itemHrid: "/items/guild_token", count: 40 },
    { itemHrid: "/items/green_guild_credit", count: 200 },
    { itemHrid: "/items/blue_guild_credit", count: 100 }
  ], {
    "/items/green_guild_credit": 10,
    "/items/blue_guild_credit": 20
  }, {
    "/items/guild_token": 5,
    "/items/green_guild_credit": 60,
    "/items/blue_guild_credit": 120
  });
  assert.equal(estimate.status, "ok");
  assert.equal(estimate.totalGold, 4000);
  assert.equal(estimate.missingGold, 1400);
  assert.equal(estimate.guildTokensRequired, 40);
  assert.equal(estimate.guildTokensMissing, 35);
  assert.deepEqual(estimate.rows.find((row) => row.itemHrid === "/items/blue_guild_credit"), {
    itemHrid: "/items/blue_guild_credit", required: 100, owned: 120, missing: 0, unitCost: 20, totalCost: 2000, missingCost: 0
  });
});

test("神龛升级缺少信用点价格时不伪造总价", () => {
  const estimate = core.estimateGuildUpgradeCosts([
    { itemHrid: "/items/red_guild_credit", count: 10 }
  ], {}, {});
  assert.equal(estimate.status, "partial");
  assert.deepEqual(estimate.unpricedItemHrids, ["/items/red_guild_credit"]);
  assert.equal(estimate.totalGold, 0);
  assert.equal(estimate.missingGold, 0);
});

test("中文物品本地化覆盖究极茶、贤者系列和全等级护符", () => {
  assert.equal(localization.localizeItemName({ itemName: "Ultra Brewing Tea", locale: "zh-CN", chineseNames: chineseItemNames }), "究极冲泡茶");
  assert.equal(localization.localizeItemName({ itemName: "Philosopher's Necklace", locale: "zh-CN", chineseNames: { "Philosopher's Necklace": "贤者项链" } }), "贤者项链");
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

test("正式版桥接保留游戏实时神龛等级", () => {
  const bridgeSource = fs.readFileSync(path.join(__dirname, "..", "src", "bridge.js"), "utf8");
  class FakeWebSocket {
    constructor() {
      this.listeners = new Map();
    }

    addEventListener(type, listener) {
      this.listeners.set(type, listener);
    }

    receive(data) {
      this.listeners.get("message")({ data });
    }
  }
  const page = { WebSocket: FakeWebSocket };
  vm.runInNewContext(bridgeSource, { window: page, JSON, Map, Object, Set });
  const socket = new page.WebSocket("wss://example.invalid");
  socket.receive(JSON.stringify({ payload: {
    characterGuildBuffDict: { "/guild_buffs/tempo_combat": { level: 7 } },
    characterItems: [{ itemHrid: "/items/green_guild_credit", itemLocationHrid: "/item_locations/inventory", count: 123 }]
  } }));
  assert.equal(page.__mwiGuildCreditBridge.guildBuffLevels["/guild_buffs/tempo_combat"].level, 7);
  assert.equal(page.__mwiGuildCreditBridge.characterItems[0].count, 123);
  assert.equal(page.__mwiGuildCreditBridge.messages.length, 1);
});

test("总览界面固定展示八种信用点、前五项、中文名与物品图标", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "userscript.js"), "utf8");
  const bridgeSource = fs.readFileSync(path.join(__dirname, "..", "src", "bridge.js"), "utf8");
  const buildSource = fs.readFileSync(path.join(__dirname, "..", "tools", "build.js"), "utf8");
  assert.equal((source.match(/guild_credit/g) || []).length >= 8, true);
  assert.match(source, /filter\(\(row\) => row\.status === "ok"\)\.slice\(0, 5\)/);
  assert.match(source, /MwiGuildCreditChineseItems/);
  assert.match(source, /GUILD_TOKEN_CREDIT_CONVERSIONS/);
  assert.match(source, /guildTokenCount: 60, creditCount: 1/);
  assert.match(source, /公会代币兑换价值/);
  assert.match(source, /rankGuildTokenCreditValues/);
  assert.match(source, /data-role="toggle-token-values"/);
  assert.match(source, /guildTokenValuesCollapsed/);
  assert.match(source, /function bindGuildTokenValueToggle\(results\)/);
  assert.match(source, /bindGuildTokenValueToggle\(results\)/);
  assert.match(source, /grid-template-columns:repeat\(auto-fit,minmax\(min\(100%,300px\),1fr\)\)/);
  assert.match(source, /mwi-token-value-exchange/);
  assert.match(source, /mwi-token-value-row/);
  assert.doesNotMatch(source, /event\.target\.closest\('\[data-role="toggle-token-values"\]'\)/);
  assert.doesNotMatch(source, /mwi-token-value-list table/);
  assert.doesNotMatch(source, /mwi-token-value-best/);
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
  assert.equal((source.match(/repeat\(auto-fit,minmax\(min\(100%,300px\),1fr\)\)/g) || []).length, 3);
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
  assert.match(source, /characterGuildBuffDict/);
  assert.match(source, /characterGuildBuffLevelMap/);
  assert.match(source, /guildBuffLevelMap/);
  assert.match(source, /stored\.level \?\? stored\.currentLevel/);
  assert.match(source, /未读取当前神龛等级，已按 0 级开始/);
  assert.doesNotMatch(source, /正在读取当前神龛等级，请稍后重新打开此页/);
  assert.match(source, /aggregateGuildBuffPlans/);
  assert.match(source, /estimateGuildUpgradeCosts/);
  assert.match(source, /characterItems/);
  assert.match(source, /库存后仍需/);
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
  assert.match(source, /exchangeAdvisorSuppressedModal/);
  assert.match(source, /isGuildExchangeCloseGesture/);
  assert.match(source, /target\.nodeType !== 1/);
  assert.doesNotMatch(source, /event\.target instanceof Element/);
  assert.match(source, /event\.key !== "Escape"/);
  assert.match(source, /iconMarkup\(data\.bestItemHrid, data\.bestItem\)/);
  assert.match(source, /bestItemHrid: best\.itemHrid/);
  assert.match(source, /const height = Math\.min\(rect\.height, maxHeight\)/);
  assert.doesNotMatch(source, /mwi-advisor-note/);
  assert.doesNotMatch(source, /data-role="note"/);
  assert.match(source, /作者：柆雨/);
  assert.match(source, /有问题请加群反馈：437320340/);
  assert.match(source, /updateLink\.textContent = "立即更新"/);
  assert.match(source, /status\.append\(" · ", updateLink\)/);
  assert.doesNotMatch(source, /点击下方链接更新/);
  assert.doesNotMatch(source, /<footer class="mwi-plugin-footer">作者：柆雨<br>有问题请加群反馈：437320340<br>/);
  assert.match(source, /当前版本 v\$\{PLUGIN_VERSION\}/);
  assert.match(source, /最新版本 v\$\{latestVersion\}/);
  assert.match(source, /mwi-update-available/);
  assert.match(source, /raw\.githubusercontent\.com\/LaYuDr\/milky-way-idle-guild-credit-optimizer/);
  assert.match(buildSource, /@author       柆雨/);
  assert.match(buildSource, /@license      Copyright 柆雨/);
  assert.match(buildSource, /MWI_GUILD_CREDIT_RUNTIME/);
  assert.match(buildSource, /window\.MwiGuildCreditVersion/);
  assert.match(buildSource, /source\("src\/bridge\.js"\)/);
  assert.match(bridgeSource, /ObservedWebSocket/);
  assert.match(bridgeSource, /characterGuildBuffDict/);
  assert.doesNotMatch(source, /mwi-credit-tab-active/);
  assert.doesNotMatch(source, /upgrade-refresh/);
  assert.doesNotMatch(source, /get_market_item_order_books/);
  assert.doesNotMatch(source, /window\.WebSocket/);
  assert.doesNotMatch(buildSource, /@downloadURL|@updateURL/);
  assert.match(buildSource, /@match        https:\/\/www\.milkywayidle\.com\/\*/);
  assert.match(buildSource, /@match        https:\/\/www\.milkywayidlecn\.com\/\*/);
});
