"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const core = require("../src/core.js");
const itemNameCatalogApi = require("../src/item-name-catalog.js");

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

test("神龛信用点缺口可换算为最优兑换物品数量", () => {
  const [best] = core.rankConversions([
    { itemHrid: "/items/beast_hide", itemName: "野兽皮", itemCount: 4, creditCount: 1, creditItemHrid: "/items/green_guild_credit" }
  ], {
    "/items/beast_hide": { asks: [{ price: 52, quantity: 100000 }] }
  }, 20000);
  assert.equal(best.status, "ok");
  assert.equal(best.batches, 20000);
  assert.equal(best.requiredItems, 80000);
  assert.equal(best.actualCredits, 20000);
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

test("公会代币兑换价值按每点成本计算，避免整批兑换放大单代币价值", () => {
  const values = core.rankGuildTokenCreditValues([
    { creditItemHrid: "/items/green_guild_credit", guildTokenCount: 1, creditCount: 10 },
    { creditItemHrid: "/items/gold_guild_credit", guildTokenCount: 60, creditCount: 1 },
    { creditItemHrid: "/items/purple_guild_credit", guildTokenCount: 1, creditCount: 1 },
    { creditItemHrid: "/items/red_guild_credit", guildTokenCount: 1, creditCount: 1 }
  ], {
    "/items/green_guild_credit": [{ status: "ok", cost: 2240, costPerCredit: 224, itemHrid: "/items/beast_hide", itemName: "野兽皮" }],
    "/items/gold_guild_credit": [{ status: "ok", cost: 180000000, costPerCredit: 450000, itemHrid: "/items/master_melee_charm", itemName: "大师近战护符" }],
    "/items/purple_guild_credit": [{ status: "ok", cost: 5200000, costPerCredit: 10400, itemHrid: "/items/red_chef_hat", itemName: "红色厨师帽" }],
    "/items/red_guild_credit": []
  });
  assert.equal(values[0].creditItemHrid, "/items/green_guild_credit");
  assert.equal(values[0].goldValuePerToken, 2240);
  assert.equal(values[1].creditItemHrid, "/items/gold_guild_credit");
  assert.equal(values[1].goldValuePerToken, 7500);
  assert.equal(values[2].goldValuePerToken, 10400);
  assert.equal(values[3].status, "unpriced");
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

test("出售当前兑换物品后扣税回购，显示可多获得的信用点", () => {
  const result = core.estimateSaleReplacement({
    selectedConversion: { itemHrid: "/items/hammer", itemName: "重锤", itemCount: 1, creditCount: 3 },
    batches: 22,
    sellPrice: 4500,
    sellerTaxRate: 0.02,
    conversions: [
      { itemHrid: "/items/hammer", itemName: "重锤", itemCount: 1, creditCount: 3 },
      { itemHrid: "/items/shield_bash", itemName: "盾击", itemCount: 1, creditCount: 80 }
    ],
    buyPrices: {
      "/items/hammer": 4500,
      "/items/shield_bash": 41000
    }
  });
  assert.equal(result.status, "ok");
  assert.equal(result.directCredits, 66);
  assert.equal(result.sale.gross, 99000);
  assert.equal(result.sale.tax, 1980);
  assert.equal(result.sale.net, 97020);
  assert.equal(result.best.itemHrid, "/items/shield_bash");
  assert.equal(result.best.actualCredits, 160);
  assert.equal(result.best.remainingBudget, 15020);
  assert.equal(result.creditDifference, 94);
});

test("卖出后回购仍会选择当前物品时标记为已是最优", () => {
  const result = core.estimateSaleReplacement({
    selectedConversion: { itemHrid: "/items/hammer", itemName: "重锤", itemCount: 1, creditCount: 3 },
    batches: 2,
    sellPrice: 4500,
    sellerTaxRate: 0.02,
    conversions: [
      { itemHrid: "/items/hammer", itemName: "重锤", itemCount: 1, creditCount: 3 },
      { itemHrid: "/items/shield_bash", itemName: "盾击", itemCount: 1, creditCount: 1 }
    ],
    buyPrices: {
      "/items/hammer": 4500,
      "/items/shield_bash": 9000
    }
  });
  assert.equal(result.status, "already_optimal");
  assert.equal(result.best.itemHrid, "/items/hammer");
  assert.equal(result.creditDifference, 0);
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

test("官方 i18n 名称目录优先于旧词典或规则翻译", () => {
  const storageValues = new Map();
  const storage = { getItem: (key) => storageValues.get(key) || null, setItem: (key, value) => storageValues.set(key, value) };
  const itemNames = {
    beast_hide: "官方野兽皮",
    grandmaster_cheesesmithing_charm: "官方宗师奶酪锻造护符",
    ultra_brewing_tea: "官方究极冲泡茶"
  };
  const catalog = itemNameCatalogApi.createItemNameCatalog({
    pageWindow: { i18next: { resources: { "zh-CN": { translation: { itemNames } } } } },
    storage,
    version: "test",
    minimumEntries: 3
  });
  catalog.refresh();
  assert.equal(catalog.resolveItemName({ itemHrid: "/items/beast_hide", englishFallback: "Beast Hide", locale: "zh-CN" }), "官方野兽皮");
  assert.equal(catalog.resolveItemName({ itemHrid: "/items/grandmaster_cheesesmithing_charm", englishFallback: "Grandmaster Cheesesmithing Charm", locale: "zh-CN" }), "官方宗师奶酪锻造护符");
  assert.equal(catalog.resolveItemName({ itemHrid: "/items/ultra_brewing_tea", englishFallback: "Ultra Brewing Tea", locale: "zh-CN" }), "官方究极冲泡茶");
  assert.equal(catalog.resolveItemName({ itemHrid: "/items/beast_hide", englishFallback: "Beast Hide", locale: "en" }), "Beast Hide");
  assert.deepEqual(catalog.coverage(["/items/beast_hide", "/items/missing"]), {
    requestedCount: 2, officialHitCount: 1, missingItemHrids: ["/items/missing"], source: "window-i18n", catalogEntryCount: 3
  });
  itemNames.newly_added_item = "官方新增物品";
  catalog.refresh();
  assert.equal(catalog.resolveItemName({ itemHrid: "/items/newly_added_item", englishFallback: "Newly Added Item", locale: "zh-CN" }), "官方新增物品");
});

test("官方名称目录在官方资源暂不可读时使用缓存，否则诚实回退英文", () => {
  const storageValues = new Map();
  const storage = { getItem: (key) => storageValues.get(key) || null, setItem: (key, value) => storageValues.set(key, value) };
  const firstCatalog = itemNameCatalogApi.createItemNameCatalog({
    pageWindow: { i18n: { store: { data: { "zh-CN": { translation: { itemNames: { beast_hide: "官方野兽皮" } } } } } } },
    storage,
    minimumEntries: 1
  });
  firstCatalog.refresh();
  const cachedCatalog = itemNameCatalogApi.createItemNameCatalog({ pageWindow: {}, storage, minimumEntries: 1 });
  assert.equal(cachedCatalog.resolveItemName({ itemHrid: "/items/beast_hide", englishFallback: "Beast Hide", locale: "zh-CN" }), "官方野兽皮");
  const emptyCatalog = itemNameCatalogApi.createItemNameCatalog({ pageWindow: {}, storage: { getItem: () => null, setItem: () => {} }, minimumEntries: 1 });
  assert.equal(emptyCatalog.resolveItemName({ itemHrid: "/items/beast_hide", englishFallback: "Beast Hide", locale: "zh-CN" }), "Beast Hide");
});

test("官方名称目录兼容参考插件使用的 zh-Hans 与 React Provider 资源形状", () => {
  const itemNames = { "/items/beast_hide": "官方野兽皮", "/items/green_guild_credit": "官方绿色公会信用点" };
  const catalog = itemNameCatalogApi.createItemNameCatalog({
    pageWindow: { mwi: { lang: { options: { resources: { "zh-Hans": { itemNames } } } } } },
    storage: { getItem: () => null, setItem: () => {} },
    minimumEntries: 2
  });
  catalog.refresh();
  assert.equal(catalog.resolveItemName({ itemHrid: "/items/beast_hide", englishFallback: "Beast Hide", locale: "zh-CN" }), "官方野兽皮");
  assert.equal(catalog.coverage(["/items/beast_hide", "/items/green_guild_credit"]).officialHitCount, 2);
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
    guildBuildingMap: { "/guild_buildings/tempo_shrine": { level: 4 } },
    characterItems: [{ itemHrid: "/items/green_guild_credit", itemLocationHrid: "/item_locations/inventory", count: 123 }]
  } }));
  assert.equal(page.__mwiGuildCreditBridge.guildBuffLevels["/guild_buffs/tempo_combat"].level, 7);
  assert.equal(page.__mwiGuildCreditBridge.guildShrineLevels["/guild_buildings/tempo_shrine"].level, 4);
  assert.equal(page.__mwiGuildCreditBridge.characterItems[0].count, 123);
  assert.equal(page.__mwiGuildCreditBridge.messages.length, 1);
});

test("正式版桥接会合并分帧到达的公会神龛建筑等级", () => {
  const bridgeSource = fs.readFileSync(path.join(__dirname, "..", "src", "bridge.js"), "utf8");
  class FakeWebSocket {
    constructor() { this.listeners = new Map(); }
    addEventListener(type, listener) { this.listeners.set(type, listener); }
    receive(data) { this.listeners.get("message")({ data }); }
  }
  const page = { WebSocket: FakeWebSocket };
  vm.runInNewContext(bridgeSource, { window: page, JSON, Map, Object, Set, String, Array });
  const socket = new page.WebSocket("wss://example.invalid");
  socket.receive(JSON.stringify({ payload: { guildBuildingMap: { "/guild_buildings/tempo": { level: 3 } } } }));
  socket.receive(JSON.stringify({ payload: { guildBuildingMap: { "/guild_buildings/force": { level: 5 } } } }));
  assert.equal(page.__mwiGuildCreditBridge.guildShrineLevels["/guild_buildings/tempo"].level, 3);
  assert.equal(page.__mwiGuildCreditBridge.guildShrineLevels["/guild_buildings/force"].level, 5);
});

test("正式版桥接保留神龛建筑定义，供等级记录关联", () => {
  const bridgeSource = fs.readFileSync(path.join(__dirname, "..", "src", "bridge.js"), "utf8");
  class FakeWebSocket {
    constructor() { this.listeners = new Map(); }
    addEventListener(type, listener) { this.listeners.set(type, listener); }
    receive(data) { this.listeners.get("message")({ data }); }
  }
  const page = { WebSocket: FakeWebSocket };
  vm.runInNewContext(bridgeSource, { window: page, JSON, Map, Object, Set, String, Array });
  const socket = new page.WebSocket("wss://example.invalid");
  socket.receive(JSON.stringify({ payload: {
    guildBuildingDetailMap: {
      "/guild_buildings/alpha": { guildBuildingHrid: "/guild_buildings/alpha", guildShrineHrid: "/guild_shrines/force" }
    }
  } }));
  assert.equal(page.__mwiGuildCreditBridge.guildShrineDetails["/guild_shrines/force"].guildBuildingHrid, "/guild_buildings/alpha");
});

test("总览界面固定展示八种信用点、前五项、中文名与物品图标", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "userscript.js"), "utf8");
  const bridgeSource = fs.readFileSync(path.join(__dirname, "..", "src", "bridge.js"), "utf8");
  const buildSource = fs.readFileSync(path.join(__dirname, "..", "tools", "build.js"), "utf8");
  assert.equal((source.match(/guild_credit/g) || []).length >= 8, true);
  assert.match(source, /filter\(\(row\) => row\.status === "ok"\)\.slice\(0, 5\)/);
  assert.match(source, /MwiGuildCreditItemNameCatalog/);
  assert.match(source, /GUILD_TOKEN_CREDIT_CONVERSIONS/);
  assert.match(source, /PRICE_REFERENCES/);
  assert.match(source, /data-price-reference="a"/);
  assert.match(source, /data-price-reference="b"/);
  assert.match(source, /snapshotOrderBook\(conversion\.itemHrid\)/);
  assert.match(source, /conversionCache: new Map\(\)/);
  assert.match(source, /state\.conversionCache\.clear\(\)/);
  assert.match(source, /state\.conversionCache\.get\(creditItemHrid\)/);
  assert.match(source, /hydrateBridgeData\(\);\s*extractItemDetailsFromReact\(\);\s*if \(!state\.itemDetails\) hydrateLocalInitData\(\);/);
  assert.match(source, /!state\.itemDetails && setItemDetails\(data\.itemDetailMap \|\| data\.itemDetailDict\)/);
  assert.match(source, /setPriceReference\(button\.dataset\.priceReference\)/);
  assert.match(source, /mwi-credit-price-reference/);
  assert.match(source, /guildTokenCount: 60, creditCount: 1/);
  assert.match(source, /guildTokenName\)}兑换价值/);
  assert.match(source, /rankGuildTokenCreditValues/);
  assert.match(source, /data-role="toggle-token-values"/);
  assert.match(source, /guildTokenValuesCollapsed/);
  assert.match(source, /target\.closest\('\[data-role="toggle-token-values"\]'\)/);
  assert.match(source, /UI_STATE_STORAGE_KEY/);
  assert.match(source, /mwi-guild-credit-ui-state-v1/);
  assert.match(source, /function loadSavedPluginUiState\(\)/);
  assert.match(source, /function persistPluginUiState\(\)/);
  assert.match(source, /collapsedCreditSections: Array\.from\(state\.collapsedCreditSections\)/);
  assert.match(source, /guildTokenValuesCollapsed: state\.guildTokenValuesCollapsed/);
  assert.match(source, /targetCredit: state\.targetCredit/);
  assert.match(source, /value="\$\{state\.targetCredit\}"/);
  assert.match(source, /grid-template-columns:repeat\(auto-fit,minmax\(min\(100%,300px\),1fr\)\)/);
  assert.match(source, /mwi-token-value-exchange/);
  assert.match(source, /mwi-token-value-row/);
  assert.match(source, /\.mwi-token-value-body\[hidden\]\{display:none!important\}/);
  assert.doesNotMatch(source, /mwi-token-value-list table/);
  assert.match(buildSource, /银河奶牛公会信用点性价比-v\$\{version\}\.user\.js/);
  assert.match(buildSource, /src\/item-name-catalog\.js/);
  assert.doesNotMatch(buildSource, /src\/zh-cn-items\.js|src\/localization\.js/);
  assert.doesNotMatch(source, /mwi-token-value-best/);
  assert.doesNotMatch(source, /MwiGuildCreditLocalization|MwiGuildCreditChineseItems|refreshPageItemNames/);
  assert.match(source, /function resolveItemName/);
  assert.match(source, /itemNameCatalog\.resolveItemName/);
  assert.match(source, /data-role="item-name-catalog-status"/);
  assert.match(source, /items_sprite/);
  assert.match(source, /tabPanelsContainer/);
  assert.match(source, /String\(child\.innerText \|\| child\.textContent \|\| ""\)\.replaceAll/);
  assert.doesNotMatch(source, /child\.innerText\.replaceAll/);
  assert.match(source, /overflow-y:auto/);
  assert.equal((source.match(/repeat\(auto-fit,minmax\(min\(100%,300px\),1fr\)\)/g) || []).length >= 2, true);
  assert.match(source, /data-role="toggle-credit-section"/);
  assert.match(source, /collapsedCreditSections/);
  assert.match(source, /mwi-credit-body/);
  assert.match(source, /creditTab\.contains\(target\)/);
  assert.doesNotMatch(source, /const isHit = event\.clientX/);
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
  assert.match(source, /guildShrineMap/);
  assert.match(source, /guildBuildingMap/);
  assert.match(source, /function guildShrineTargetLevels/);
  assert.match(source, /function applyGuildShrineTargets/);
  assert.match(source, /function mergeGuildShrineLevels/);
  assert.match(source, /function guildShrineDetailFor/);
  assert.match(source, /guildBuildingDetailMap/);
  assert.match(source, /missing shrine is the[\s\S]*level 0/);
  assert.match(source, /tempo_shrine.*simply.*tempo/s);
  assert.doesNotMatch(source, /normalized\.includes\("shrine"\) && new RegExp/);
  assert.match(source, /设定当前公会建筑为目标等级（生活）/);
  assert.match(source, /设定当前公会建筑为目标等级（战斗）/);
  assert.match(source, /data-role="set-guild-shrine-target"/);
  assert.match(source, /mwi-upgrade-preset/);
  assert.match(source, /function marketItemIconMarkup/);
  assert.match(source, /function openMarketplaceForItem/);
  assert.match(source, /data-role="market-item-link"/);
  assert.match(source, /在市场中查看/);
  assert.match(source, /stored\.level \?\? stored\.currentLevel/);
  assert.match(source, /未读取当前神龛等级，已按 0 级开始/);
  assert.doesNotMatch(source, /正在读取当前神龛等级，请稍后重新打开此页/);
  assert.match(source, /aggregateGuildBuffPlans/);
  assert.match(source, /estimateGuildUpgradeCosts/);
  assert.match(source, /characterItems/);
  assert.match(source, /库存后仍需/);
  assert.match(source, /core\.formatCompactCost\(row\.cost\)/);
  assert.match(source, /Item_enhancementLevel/);
  assert.match(source, /selectedEnhancementLevel/);
  assert.match(source, /GuildPanel_exchangeModalContent/);
  assert.match(source, /mwi-guild-exchange-advisor/);
  assert.match(source, /GUILD_EXCHANGE_ADVISOR_HOST_ID/);
  assert.match(source, /mwi-guild-exchange-advisor-host/);
  assert.match(source, /attachShadow\(\{ mode: "open" \}\)/);
  assert.match(source, /state\.exchangeAdvisorUi/);
  assert.match(source, /document\.body\.append\(host\)/);
  assert.match(source, /function startGuildExchangeAdvisor\(\)/);
  assert.match(source, /document\.addEventListener\("DOMContentLoaded", startGuildExchangeAdvisor, \{ once: true \}\)/);
  assert.doesNotMatch(source, /event\.target instanceof Element/);
  assert.doesNotMatch(source, /isGuildExchangeCloseGesture/);
  assert.doesNotMatch(source, /suppressGuildExchangeAdvisor/);
  assert.match(source, /兑换最优推荐/);
  assert.match(source, /请选择兑换物品以计算卖出后替代方案/);
  assert.match(source, /\[hidden\]\{display:none!important\}/);
  assert.match(source, /options\.single/);
  assert.match(source, /core\.rankConversions\(conversions, books, targetCredits\)/);
  assert.match(source, /function bestCreditMaterialPlans\(estimate\)/);
  assert.match(source, /marketItemIconMarkup\(plan\.itemHrid/);
  assert.match(source, /materialInventory\[plan\.itemHrid\]/);
  assert.match(source, /库存 \$\{hasInventory/);
  assert.match(source, /mwi-material-required/);
  assert.match(source, /mwi-material-plan-item/);
  assert.match(source, /mwi-material-plan-icon/);
  assert.match(source, /mwi-material-row-token/);
  assert.match(source, /成本概览/);
  assert.match(source, /plan\.requiredItems/);
  assert.match(source, /core\.estimateSaleReplacement/);
  assert.match(source, /SELLER_TAX_RATE = 0\.02/);
  assert.match(source, /卖出后改买可多获得/);
  assert.match(source, /当前物品暂无公开收购价，无法估算卖出后回购。/);
  assert.doesNotMatch(source, /if \(replacement\.status !== "ok"\) \{\s*hideGuildExchangeAdvisor\(\);/);
  assert.match(source, /watchGuildExchangeModals/);
  assert.match(source, /mutationMayAffectGuildExchangeAdvisor/);
  assert.match(source, /state\.exchangeAdvisorUi && state\.exchangeAdvisorUi\.modal/);
  assert.match(source, /style\.display !== "none"/);
  assert.match(source, /style\.pointerEvents !== "none"/);
  assert.match(source, /opacity > 0\.01/);
  assert.match(source, /attributeFilter: \["aria-label", "class", "hidden", "href", "style", "xlink:href"\]/);
  assert.match(source, /window\.requestAnimationFrame/);
  assert.match(source, /exchangeAdvisorForceRender/);
  assert.doesNotMatch(source, /exchangeAdvisorTimer/);
  assert.doesNotMatch(source, /exchangeAdvisorVisibilityTimer/);
  assert.doesNotMatch(source, /watchGuildExchangeAdvisorVisibility/);
  assert.doesNotMatch(source, /scheduleGuildExchangeAdvisor\(80\)/);
  assert.doesNotMatch(source, /document\.addEventListener\("transitionend"/);
  assert.doesNotMatch(source, /window\.setInterval\(refreshGuildExchangeAdvisor, 5000\)/);
  assert.doesNotMatch(source, /卖出税 2%/);
  assert.match(source, /const cardRect = card\.getBoundingClientRect\(\)/);
  assert.match(source, /placement: "bottom"/);
  assert.match(source, /max-height:calc\(100dvh - 24px\)/);
  assert.match(source, /当前选择已是最优物品，无需卖出再回购。/);
  assert.match(source, /option\.best/);
  assert.match(source, /作者：柆雨/);
  assert.match(source, /遇到问题或无法获取最新版，请加群：437320340/);
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
  assert.match(buildSource, /公会信用点兑换与神龛升级的只读计算辅助/);
  assert.match(buildSource, /不会上传账号数据/);
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
