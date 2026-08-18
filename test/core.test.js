"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const core = require("../src/core.js");
const marketDataApi = require("../src/market-data.js");
const marketDomApi = require("../src/market-dom.js");
const itemNameCatalogApi = require("../src/item-name-catalog.js");
const releaseInfoApi = require("../src/release-info.js");
const localizationApi = require("../src/localization.js");
const sidebarIntegrationApi = require("../src/ui/sidebar-integration.js");

function projectRuntimeSource() {
  const sourceRoot = path.join(__dirname, "..", "src");
  const files = [path.join(sourceRoot, "userscript.js")];
  const visit = (directory) => {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile() && entry.name.endsWith(".js")) files.push(file);
    }
  };
  visit(path.join(sourceRoot, "runtime"));
  visit(path.join(sourceRoot, "ui"));
  return files
    .sort()
    .map((file) => fs.readFileSync(file, "utf8"))
    .join("\n");
}

test("英文游戏环境使用完整英文 UI 文案与英文数字格式", () => {
  const localizer = localizationApi.createLocalizer("en-US");
  assert.equal(localizer.locale, "en");
  assert.equal(localizer.t("panelTitle"), "Guild Assistant");
  assert.equal(localizer.t("setGuildLifeTarget"), "Fill Life levels");
  assert.equal(localizer.t("useGuildTokensForMissingCredits"), "Use guild tokens for every credit");
  assert.equal(
    localizer.t("creditExchangeModeTitle", { mode: "Best item" }),
    "Current mode: Best item. Click to switch."
  );
  assert.equal(localizer.quantity("itemQuantity", 1), "1 item");
  assert.equal(localizer.quantity("itemQuantity", 2), "2 items");
  assert.equal(localizer.quantity("creditQuantity", 2), "2 credits");
  assert.equal(localizer.number(1234567), "1,234,567");
  assert.equal(localizer.itemName("/items/green_guild_credit"), "Green Guild Credit");
  assert.equal(localizer.itemName("/items/guild_token"), "Guild Token");
  assert.equal(localizer.itemName("/items/beast_hide"), "");
  assert.equal(
    localizer.t("noAffordableReplacement", { gold: "4,312 gold" }),
    "Selling this quantity yields 4,312 gold after tax, which is not enough to buy an alternative exchange item."
  );
});

test("中文游戏环境保留中文 UI 文案与数量格式", () => {
  const localizer = localizationApi.createLocalizer("zh-CN");
  assert.equal(localizer.locale, "zh-CN");
  assert.equal(localizer.t("panelTitle"), "公会助手");
  assert.equal(localizer.t("guildTargetComplete", { domain: "生活" }), "当前已达到最大等级（生活）。");
  assert.equal(localizer.t("guildTokenCreditPlanSummary", { count: "1,200" }), "其中 1,200 公会代币用于兑换信用点。");
  assert.equal(
    localizer.t("guildTokenCreditPlanPartialActive", { count: "3" }),
    "已选择 3 种信用点按公会代币兑换计算。"
  );
  assert.equal(localizer.quantity("itemQuantity", 4), "4 个");
  assert.equal(localizer.quantity("creditQuantity", 1), "1 点");
  assert.equal(localizer.itemName("/items/green_guild_credit"), "绿色公会信用点");
  assert.equal(localizer.itemName("/items/guild_token"), "公会代币");
  assert.equal(localizer.itemName("/items/beast_hide"), "");
});

test("语言候选只接受受支持的字符串，并优先使用可见界面语言", () => {
  assert.equal(
    localizationApi.resolveLocaleCandidates([{}, () => "zh-CN", "", "   ", "ja-JP", "en-US"], "zh-CN"),
    "en"
  );
  assert.equal(localizationApi.resolveLocaleCandidates(["zh-CN", "en-US"]), "zh-CN");
  assert.equal(localizationApi.resolveLocaleCandidates([null, "zh-Hans", "en-US"]), "zh-CN");
  assert.equal(localizationApi.resolveLocaleCandidates(["en-US"]), "en");
  assert.equal(localizationApi.resolveLocaleCandidates([{}, " ", "fr-FR"], "en_US"), "en");
});

test("运行时 UI 不保留写死中文，原生页面识别仅保留中英文别名", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "userscript.js"), "utf8");
  const directChinese = Array.from(source.matchAll(/[\u4e00-\u9fff]+/g), (match) => match[0]);
  assert.deepEqual(directChinese, ["物品搜索", "市场"]);
  assert.match(source, /\["市场", "Marketplace", "Market"\]/);
  assert.deepEqual(sidebarIntegrationApi.SIDEBAR_LABELS["zh-CN"], ["库存", "装备", "技能", "房屋", "配装", "收获"]);
  assert.equal(sidebarIntegrationApi.sidebarLocale(["库存", "装备", "技能", "房屋"]), "zh-CN");
  assert.equal(sidebarIntegrationApi.sidebarLocale(["Inventory", "Equipment", "Skills", "House"]), "en");
  assert.equal(sidebarIntegrationApi.sidebarLocale(["库存", "Inventory"]), null);
});

test("按价格逐档累计订单簿成本", () => {
  const quote = core.quoteAsks(
    {
      asks: [
        { price: 10, quantity: 3 },
        { price: 12, quantity: 8 }
      ]
    },
    7
  );
  assert.deepEqual(quote, {
    status: "ok",
    requestedQuantity: 7,
    availableQuantity: 11,
    cost: 78,
    fills: [
      { price: 10, quantity: 3 },
      { price: 12, quantity: 4 }
    ]
  });
});

test("订单簿不足时不虚报总价", () => {
  const quote = core.quoteAsks({ asks: [{ price: 10, quantity: 3 }] }, 4);
  assert.equal(quote.status, "insufficient_depth");
  assert.equal(quote.cost, null);
  assert.equal(quote.availableQuantity, 3);
});

test("实时市场订单簿提取最低卖价、最高买价并保留无报价状态", () => {
  const update = marketDataApi.normalizeMarketOrderBooksUpdate({
    type: "market_item_order_books_updated",
    marketItemOrderBooks: {
      itemHrid: "/items/beast_hide",
      priceBandMins: { 0: 49, 1: 60 },
      priceBandMaxs: { 0: 61, 1: 75 },
      orderBooks: {
        0: {
          asks: [
            { price: 53, quantity: 4 },
            { price: 51, quantity: 2 }
          ],
          bids: [
            { price: 48, quantity: 9 },
            { price: 50, quantity: 1 }
          ]
        },
        1: { asks: [], bids: [] }
      }
    }
  });
  assert.equal(update.itemHrid, "/items/beast_hide");
  assert.deepEqual({ ...update.levels["0"] }, { a: 51, b: 50, min: 49, max: 61 });
  assert.deepEqual({ ...update.levels["1"] }, { a: -1, b: -1, min: 60, max: 75 });
});

test("右一价格低于官方可交易区间时视为无效报价", () => {
  const liveData = Object.create(null);
  marketDataApi.applyLiveMarketUpdate(
    liveData,
    { itemHrid: "/items/beast_hide", levels: { 0: { a: 52, b: 48, min: 49, max: 61 } } },
    { revision: 1, receivedAt: 1000 }
  );
  assert.equal(marketDataApi.resolveMarketPrice(null, liveData, "/items/beast_hide", 0, "a"), 52);
  assert.equal(marketDataApi.resolveMarketPrice(null, liveData, "/items/beast_hide", 0, "b"), null);
  assert.deepEqual(marketDataApi.resolveTradableRange(liveData, "/items/beast_hide", 0), { min: 49, max: 61 });

  liveData["/items/beast_hide"].levels["0"].b = 49;
  assert.equal(marketDataApi.resolveMarketPrice(null, liveData, "/items/beast_hide", 0, "b"), 49);
  delete liveData["/items/beast_hide"].levels["0"].min;
  liveData["/items/beast_hide"].levels["0"].b = 1;
  assert.equal(marketDataApi.resolveMarketPrice(null, liveData, "/items/beast_hide", 0, "b"), 1);
});

test("原生市场 DOM 价格支持完整数值与 K/M/B/T 缩写", () => {
  assert.equal(marketDomApi.parseCompactMarketValue("2,450"), 2450);
  assert.equal(marketDomApi.parseCompactMarketValue("2400K"), 2400000);
  assert.equal(marketDomApi.parseCompactMarketValue("2.35M"), 2350000);
  assert.equal(marketDomApi.parseCompactMarketValue("1.2B"), 1200000000);
  assert.equal(marketDomApi.parseCompactMarketValue("-"), null);
});

test("原生市场 DOM 可兜底读取当前商品的可交易区间", () => {
  const documentRef = {
    querySelectorAll(selector) {
      assert.equal(selector, '[class*="MarketplacePanel_"]');
      return [{ textContent: "可交易区间：4730M – 5780M" }];
    }
  };
  assert.deepEqual(marketDomApi.tradableRange(documentRef), {
    min: 4_730_000_000,
    max: 5_780_000_000
  });
});

test("原生市场 DOM 兜底会识别商品 HRID 并保留完整 ask/bid 深度", () => {
  const row = (quantity, price) => ({
    querySelectorAll(selector) {
      return selector === "td" ? [{ textContent: quantity }, { textContent: price }] : [];
    }
  });
  const table = (action, entries) => ({
    querySelectorAll(selector) {
      if (selector === "button") return [{ textContent: action }];
      if (selector === "tbody tr") return entries.map(([quantity, price]) => row(quantity, price));
      return [];
    },
    querySelector() {
      return null;
    }
  });
  const currentItem = {
    querySelector(selector) {
      if (selector.includes("Item_itemContainer")) {
        return {
          getAttribute(name) {
            return name === "href" ? "/static/media/items_sprite.svg#basic_brewing_charm" : null;
          }
        };
      }
      return null;
    }
  };
  const booksContainer = {
    querySelectorAll() {
      return [
        table("购买", [
          ["7", "2400K"],
          ["1", "2450K"]
        ]),
        table("出售", [
          ["10", "2350K"],
          ["2", "2300K"]
        ])
      ];
    }
  };
  const documentRef = {
    querySelector(selector) {
      if (selector.includes("MarketplacePanel_currentItem")) return currentItem;
      if (selector.includes("MarketplacePanel_orderBooksContainer")) return booksContainer;
      return null;
    }
  };
  const snapshot = marketDomApi.readMarketDomSnapshot(documentRef);
  assert.equal(snapshot.itemHrid, "/items/basic_brewing_charm");
  assert.equal(snapshot.enhancementLevel, 0);
  assert.deepEqual(snapshot.asks, [
    { price: 2400000, quantity: 7 },
    { price: 2450000, quantity: 1 }
  ]);
  assert.deepEqual(snapshot.bids, [
    { price: 2350000, quantity: 10 },
    { price: 2300000, quantity: 2 }
  ]);
  const update = marketDataApi.normalizeMarketOrderBooksUpdate(marketDomApi.createMarketMessage(snapshot));
  assert.equal(update.levels["0"].a, 2400000);
  assert.equal(update.levels["0"].b, 2350000);
});

test("实时市场价格覆盖历史 API，并避免 API 与 WebSocket 并发时过早清理", () => {
  const snapshot = {
    timestamp: "2026-07-26T00:00:00Z",
    marketData: { "/items/beast_hide": { 0: { a: 60, b: 55 } } }
  };
  const liveData = Object.create(null);
  marketDataApi.applyLiveMarketUpdate(
    liveData,
    {
      itemHrid: "/items/beast_hide",
      levels: { 0: { a: 51, b: 50, min: 40 } }
    },
    { revision: 1, receivedAt: 1000 }
  );
  assert.equal(marketDataApi.resolveMarketPrice(snapshot, liveData, "/items/beast_hide", 0, "a"), 51);

  assert.equal(
    marketDataApi.expireLiveMarketData(liveData, {
      previousSnapshotTimestamp: snapshot.timestamp,
      nextSnapshotTimestamp: snapshot.timestamp,
      coveredRevision: 1,
      snapshotData: snapshot.marketData
    }),
    false
  );
  assert.equal(marketDataApi.resolveMarketPrice(snapshot, liveData, "/items/beast_hide", 0, "a"), 51);

  marketDataApi.applyLiveMarketUpdate(
    liveData,
    {
      itemHrid: "/items/beast_hide",
      levels: { 0: { a: 49, b: 48 } }
    },
    { revision: 2, receivedAt: 2000 }
  );
  assert.equal(
    marketDataApi.expireLiveMarketData(liveData, {
      previousSnapshotTimestamp: snapshot.timestamp,
      nextSnapshotTimestamp: "2026-07-26T00:30:00Z",
      coveredRevision: 1,
      snapshotData: snapshot.marketData
    }),
    false
  );
  assert.equal(marketDataApi.resolveMarketPrice(snapshot, liveData, "/items/beast_hide", 0, "a"), 49);

  assert.equal(
    marketDataApi.expireLiveMarketData(liveData, {
      previousSnapshotTimestamp: "2026-07-26T00:30:00Z",
      nextSnapshotTimestamp: "2026-07-26T01:00:00Z",
      coveredRevision: 2,
      snapshotData: snapshot.marketData
    }),
    true
  );
  assert.equal(marketDataApi.resolveMarketPrice(snapshot, liveData, "/items/beast_hide", 0, "a"), 60);
});

test("实时市场缓存序列化后可在页面重载时恢复", () => {
  const liveData = Object.create(null);
  marketDataApi.applyLiveMarketUpdate(
    liveData,
    {
      itemHrid: "/items/beast_hide",
      levels: { 0: { a: 51, b: 50, min: 49, max: 61 } }
    },
    {
      revision: 7,
      receivedAt: 2000,
      snapshotTimestamp: "2026-07-26T00:00:00Z"
    }
  );
  const serialized = marketDataApi.serializeLiveMarketData(liveData, {
    revision: 7,
    storedAt: 3000
  });
  const restored = marketDataApi.restoreLiveMarketData(JSON.stringify(serialized));
  assert.equal(restored.valid, true);
  assert.equal(restored.revision, 7);
  assert.deepEqual(
    { ...restored.liveData["/items/beast_hide"].snapshotTimestampByLevel["0"] },
    { a: Date.parse("2026-07-26T00:00:00Z"), b: Date.parse("2026-07-26T00:00:00Z") }
  );
  assert.equal(marketDataApi.resolveMarketPrice(null, restored.liveData, "/items/beast_hide", 0, "a"), 51);
  assert.deepEqual(marketDataApi.resolveTradableRange(restored.liveData, "/items/beast_hide", 0), {
    min: 49,
    max: 61
  });
});

test("再次打开同一商品市场时以新订单簿替换持久缓存", () => {
  const liveData = Object.create(null);
  marketDataApi.applyLiveMarketUpdate(
    liveData,
    {
      itemHrid: "/items/beast_hide",
      levels: { 0: { a: 51, b: 50 } }
    },
    { revision: 1, receivedAt: 1000, snapshotTimestamp: "2026-07-26T00:00:00Z" }
  );
  marketDataApi.applyLiveMarketUpdate(
    liveData,
    {
      itemHrid: "/items/beast_hide",
      levels: { 0: { a: 49, b: -1 } }
    },
    { revision: 2, receivedAt: 2000, snapshotTimestamp: "2026-07-26T00:00:00Z" }
  );
  const restored = marketDataApi.restoreLiveMarketData(
    JSON.stringify(marketDataApi.serializeLiveMarketData(liveData, { revision: 2 }))
  );
  assert.deepEqual({ ...restored.liveData["/items/beast_hide"].levels["0"] }, { a: 49, b: -1 });
  assert.deepEqual({ ...restored.liveData["/items/beast_hide"].receivedAtByLevel["0"] }, { a: 2000, b: 2000 });
});

test("只返回单边订单簿时仅更新对应报价字段", () => {
  const liveData = Object.create(null);
  marketDataApi.applyLiveMarketUpdate(
    liveData,
    {
      itemHrid: "/items/beast_hide",
      levels: { 0: { a: 51, b: 50 } }
    },
    { revision: 1, receivedAt: 1000 }
  );
  marketDataApi.applyLiveMarketUpdate(
    liveData,
    {
      itemHrid: "/items/beast_hide",
      levels: { 0: { a: 49, min: -1 } }
    },
    { revision: 2, receivedAt: 2000 }
  );
  assert.deepEqual({ ...liveData["/items/beast_hide"].levels["0"] }, { a: 49, b: 50 });
  assert.deepEqual({ ...liveData["/items/beast_hide"].revisionByLevel["0"] }, { a: 2, b: 1 });
});

test("重载后的实时缓存遇到冲突快照时延迟一次再淘汰", () => {
  const liveData = Object.create(null);
  marketDataApi.applyLiveMarketUpdate(
    liveData,
    {
      itemHrid: "/items/beast_hide",
      levels: { 0: { a: 51, b: 50 } }
    },
    { revision: 1, receivedAt: 1000, snapshotTimestamp: "2026-07-26T00:00:00Z" }
  );
  const restored = marketDataApi.restoreLiveMarketData(
    JSON.stringify(marketDataApi.serializeLiveMarketData(liveData, { revision: 1 }))
  );
  assert.deepEqual(
    marketDataApi.reconcileLiveMarketData(restored.liveData, {
      previousSnapshotTimestamp: 0,
      nextSnapshotTimestamp: "2026-07-26T00:00:00Z",
      coveredRevision: restored.revision,
      snapshotData: { "/items/beast_hide": { 0: { a: 60, b: 55 } } }
    }),
    { changed: false, expired: false }
  );
  assert.equal(marketDataApi.resolveMarketPrice(null, restored.liveData, "/items/beast_hide", 0, "a"), 51);
  assert.deepEqual(
    marketDataApi.reconcileLiveMarketData(restored.liveData, {
      previousSnapshotTimestamp: 0,
      nextSnapshotTimestamp: "2026-07-26T00:30:00Z",
      coveredRevision: restored.revision,
      snapshotData: { "/items/beast_hide": { 0: { a: 60, b: 55 } } }
    }),
    { changed: true, expired: false }
  );
  assert.equal(marketDataApi.resolveMarketPrice(null, restored.liveData, "/items/beast_hide", 0, "a"), 51);
  assert.deepEqual(
    marketDataApi.reconcileLiveMarketData(restored.liveData, {
      previousSnapshotTimestamp: "2026-07-26T00:30:00Z",
      nextSnapshotTimestamp: "2026-07-26T01:00:00Z",
      coveredRevision: restored.revision,
      snapshotData: { "/items/beast_hide": { 0: { a: 61, b: 56 } } }
    }),
    { changed: true, expired: true }
  );
  assert.equal(Object.keys(restored.liveData).length, 0);
});

test("首次 API 快照为无基线实时缓存建立基线而不误删", () => {
  const liveData = Object.create(null);
  marketDataApi.applyLiveMarketUpdate(
    liveData,
    {
      itemHrid: "/items/beast_hide",
      levels: { 0: { a: 51, b: 50 } }
    },
    { revision: 1, receivedAt: 1000 }
  );
  assert.deepEqual(
    marketDataApi.reconcileLiveMarketData(liveData, {
      previousSnapshotTimestamp: 0,
      nextSnapshotTimestamp: "2026-07-26T00:00:00Z",
      coveredRevision: 1
    }),
    { changed: true, expired: false }
  );
  assert.deepEqual(
    { ...liveData["/items/beast_hide"].snapshotTimestampByLevel["0"] },
    { a: Date.parse("2026-07-26T00:00:00Z"), b: Date.parse("2026-07-26T00:00:00Z") }
  );
  assert.equal(marketDataApi.resolveMarketPrice(null, liveData, "/items/beast_hide", 0, "a"), 51);
});

test("旧版实时市场缓存会迁移为逐字段元数据", () => {
  const restored = marketDataApi.restoreLiveMarketData({
    schemaVersion: 1,
    revision: 4,
    items: {
      "/items/beast_hide": {
        levels: { 0: { a: 51, b: 50 } },
        revisionByLevel: { 0: 4 },
        receivedAtByLevel: { 0: 2000 },
        snapshotTimestampByLevel: { 0: Date.parse("2026-07-26T00:00:00Z") },
        revision: 4,
        receivedAt: 2000
      }
    }
  });
  assert.equal(restored.valid, true);
  assert.deepEqual({ ...restored.liveData["/items/beast_hide"].revisionByLevel["0"] }, { a: 4, b: 4 });
});

test("缺项市场快照结构可被识别，避免不完整 API 覆盖完整数据", () => {
  const confirmed = marketDataApi.sanitizeMarketData({
    "/items/beast_hide": { 0: { a: 51, b: 50 } },
    "/items/snake_fang": { 0: { a: 7600, b: 7200 } }
  });
  const incomplete = marketDataApi.sanitizeMarketData({
    "/items/beast_hide": { 0: { a: 51, b: 50 } }
  });
  assert.equal(marketDataApi.countMissingMarketEntries(confirmed, incomplete) > 0, true);
  assert.equal(marketDataApi.countMissingMarketEntries(confirmed, confirmed), 0);
});

test("损坏或旧版本的实时市场缓存会被安全忽略", () => {
  assert.deepEqual(marketDataApi.restoreLiveMarketData("{broken"), {
    liveData: Object.create(null),
    revision: 0,
    valid: false
  });
  assert.deepEqual(
    marketDataApi.restoreLiveMarketData(
      JSON.stringify({
        schemaVersion: 999,
        items: {}
      })
    ),
    {
      liveData: Object.create(null),
      revision: 0,
      valid: false
    }
  );
});

test("更新信息只解析 Userscript 头中的版本号", () => {
  assert.equal(
    releaseInfoApi.parseUserScriptVersion("// @name Test\n// @version      1.0.0\n// ==/UserScript=="),
    "1.0.0"
  );
  assert.equal(releaseInfoApi.parseUserScriptVersion("// @name Test\n"), null);
});

test("更新检查复用五分钟内的成功结果", async () => {
  let calls = 0;
  const checker = releaseInfoApi.createVersionChecker({
    url: "https://example.invalid/script.user.js",
    fetchImpl: async () => {
      calls += 1;
      return { ok: true, status: 200, text: async () => "// @version 1.0.1" };
    }
  });
  assert.equal(await checker.latestVersion(), "1.0.1");
  assert.equal(await checker.latestVersion(), "1.0.1");
  assert.equal(calls, 1);
});

test("更新检查在请求长期无响应时超时", async () => {
  let timeoutCallback;
  const checker = releaseInfoApi.createVersionChecker({
    url: "https://example.invalid/script.user.js",
    fetchImpl: () => new Promise(() => {}),
    setTimeout: (callback) => {
      timeoutCallback = callback;
      return 1;
    },
    clearTimeout: () => {}
  });
  const request = checker.latestVersion();
  timeoutCallback();
  await assert.rejects(request, /更新检查超时/);
});

test("目标信用点按兑换批次向上取整且买方手续费为零", () => {
  const result = core.evaluateConversion(
    {
      itemHrid: "/items/cheese",
      itemName: "奶酪",
      itemCount: 10,
      creditCount: 3,
      creditItemHrid: "/items/green_guild_credit"
    },
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
  const [best] = core.rankConversions(
    [
      {
        itemHrid: "/items/beast_hide",
        itemName: "野兽皮",
        itemCount: 4,
        creditCount: 1,
        creditItemHrid: "/items/green_guild_credit"
      }
    ],
    {
      "/items/beast_hide": { asks: [{ price: 52, quantity: 100000 }] }
    },
    20000
  );
  assert.equal(best.status, "ok");
  assert.equal(best.batches, 20000);
  assert.equal(best.requiredItems, 80000);
  assert.equal(best.actualCredits, 20000);
});

test("完整方案优先于市场深度不足的更低理论单价", () => {
  const results = core.rankConversions(
    [
      { itemHrid: "/items/a", itemName: "A", itemCount: 1, creditCount: 1 },
      { itemHrid: "/items/b", itemName: "B", itemCount: 1, creditCount: 1 }
    ],
    {
      "/items/a": { asks: [{ price: 1, quantity: 2 }] },
      "/items/b": { asks: [{ price: 2, quantity: 10 }] }
    },
    5
  );
  assert.equal(results[0].itemHrid, "/items/b");
  assert.equal(results[1].status, "insufficient_depth");
});

test("公会代币兑换价值按每点成本计算，避免整批兑换放大单代币价值", () => {
  const values = core.rankGuildTokenCreditValues(
    [
      { creditItemHrid: "/items/green_guild_credit", guildTokenCount: 1, creditCount: 10 },
      { creditItemHrid: "/items/gold_guild_credit", guildTokenCount: 60, creditCount: 1 },
      { creditItemHrid: "/items/purple_guild_credit", guildTokenCount: 1, creditCount: 1 },
      { creditItemHrid: "/items/red_guild_credit", guildTokenCount: 1, creditCount: 1 }
    ],
    {
      "/items/green_guild_credit": [
        { status: "ok", cost: 2240, costPerCredit: 224, itemHrid: "/items/beast_hide", itemName: "野兽皮" }
      ],
      "/items/gold_guild_credit": [
        {
          status: "ok",
          cost: 180000000,
          costPerCredit: 450000,
          itemHrid: "/items/master_melee_charm",
          itemName: "大师近战护符"
        }
      ],
      "/items/purple_guild_credit": [
        { status: "ok", cost: 5200000, costPerCredit: 10400, itemHrid: "/items/red_chef_hat", itemName: "红色厨师帽" }
      ],
      "/items/red_guild_credit": []
    }
  );
  assert.equal(values[0].creditItemHrid, "/items/green_guild_credit");
  assert.equal(values[0].goldValuePerToken, 2240);
  assert.equal(values[1].creditItemHrid, "/items/gold_guild_credit");
  assert.equal(values[1].goldValuePerToken, 7500);
  assert.equal(values[2].goldValuePerToken, 10400);
  assert.equal(values[3].status, "unpriced");
});

test("卖出后按预算回购时按可兑换批次计算信用点", () => {
  const result = core.evaluateBudgetConversion(
    {
      itemHrid: "/items/cheese",
      itemName: "奶酪",
      itemCount: 4,
      creditCount: 3,
      creditItemHrid: "/items/green_guild_credit"
    },
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
  const best = core.bestConversionForBudget(
    [
      { itemHrid: "/items/a", itemName: "A", itemCount: 10, creditCount: 1 },
      { itemHrid: "/items/b", itemName: "B", itemCount: 3, creditCount: 2 },
      { itemHrid: "/items/c", itemName: "C", itemCount: 1, creditCount: 1 }
    ],
    {
      "/items/a": 4,
      "/items/b": 5,
      "/items/c": 30
    },
    45
  );
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

test("单批售出已有公开收购价但金额不足回购时，不误判为无市场价", () => {
  const result = core.estimateSaleReplacement({
    selectedConversion: { itemHrid: "/items/minor_heal", itemName: "Minor Heal", itemCount: 1, creditCount: 3 },
    batches: 1,
    sellPrice: 4400,
    sellerTaxRate: 0.02,
    conversions: [
      { itemHrid: "/items/minor_heal", itemName: "Minor Heal", itemCount: 1, creditCount: 3 },
      { itemHrid: "/items/snake_fang", itemName: "Snake Fang", itemCount: 1, creditCount: 10 }
    ],
    buyPrices: {
      "/items/minor_heal": 4400,
      "/items/snake_fang": 7800
    }
  });
  assert.equal(result.status, "no_affordable_conversion");
  assert.equal(result.sale.status, "ok");
  assert.equal(result.sale.net, 4312);
});

test("强化装备使用对应强化等级的公开市场价格", () => {
  const snapshot = {
    marketData: {
      "/items/cheese_boots": {
        0: { b: 100 },
        5: { a: 900, b: 800 }
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

test("神龛一键填充只替换同域未排除计划", () => {
  const lifeIncluded = { hrid: "/guild_buffs/force_life", detail: { isCombat: false } };
  const lifeExcluded = { hrid: "/guild_buffs/spirit_life", detail: { isCombat: false } };
  const combatIncluded = { hrid: "/guild_buffs/force_combat", detail: { isCombat: true } };
  const entries = [lifeIncluded, lifeExcluded, combatIncluded];
  const lifeIncludedPlan = { id: "replace-life", guildBuffHrid: lifeIncluded.hrid };
  const lifeExcludedPlan = { id: "keep-excluded", guildBuffHrid: lifeExcluded.hrid };
  const combatPlan = { id: "keep-other-domain", guildBuffHrid: combatIncluded.hrid };
  const unknownPlan = { id: "keep-unknown", guildBuffHrid: "/guild_buffs/removed_from_game" };

  const result = core.selectGuildShrineAutofillScope({
    entries,
    plans: [lifeIncludedPlan, lifeExcludedPlan, combatPlan, unknownPlan],
    domain: "life",
    excludedGuildBuffHrids: new Set([lifeExcluded.hrid])
  });

  assert.deepEqual(result.eligibleEntries, [lifeIncluded]);
  assert.deepEqual(result.preservedPlans, [lifeExcludedPlan, combatPlan, unknownPlan]);
});

test("神龛一键填充的未知域不删除任何旧计划", () => {
  const entry = { hrid: "/guild_buffs/force_life", detail: { isCombat: false } };
  const plans = [{ id: "keep", guildBuffHrid: entry.hrid }];
  assert.deepEqual(core.selectGuildShrineAutofillScope({ entries: [entry], plans, domain: "unknown" }), {
    eligibleEntries: [],
    preservedPlans: plans
  });
});

test("神龛增益从起始等级到目标等级逐级累计信用点", () => {
  const result = core.aggregateGuildBuffLevelCosts(
    [
      null,
      { guildTokenCost: 400, creditCosts: [{ itemHrid: "/items/brown_guild_credit", count: 2000 }] },
      {
        guildTokenCost: 800,
        creditCosts: [
          { itemHrid: "/items/brown_guild_credit", count: 3000 },
          { itemHrid: "/items/red_guild_credit", count: 100 }
        ]
      },
      { guildTokenCost: 1600, creditCosts: [{ itemHrid: "/items/red_guild_credit", count: 500 }] }
    ],
    0,
    3
  );
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
  const result = core.aggregateGuildBuffLevelCosts(
    [
      null,
      { guildTokenCost: 10, creditCosts: [{ itemHrid: "/items/green_guild_credit", count: 20 }] },
      { guildTokenCost: 30, creditCosts: [{ itemHrid: "/items/green_guild_credit", count: 40 }] },
      { guildTokenCost: 50, creditCosts: [{ itemHrid: "/items/green_guild_credit", count: 60 }] }
    ],
    2,
    3
  );
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
      levelCosts: [
        null,
        null,
        null,
        {
          guildTokenCost: 600,
          creditCosts: [
            { itemHrid: "/items/green_guild_credit", count: 500 },
            { itemHrid: "/items/red_guild_credit", count: 100 }
          ]
        }
      ]
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
  const estimate = core.estimateGuildUpgradeCosts(
    [
      { itemHrid: "/items/guild_token", count: 40 },
      { itemHrid: "/items/green_guild_credit", count: 200 },
      { itemHrid: "/items/blue_guild_credit", count: 100 }
    ],
    {
      "/items/green_guild_credit": 10,
      "/items/blue_guild_credit": 20
    },
    {
      "/items/guild_token": 5,
      "/items/green_guild_credit": 60,
      "/items/blue_guild_credit": 120
    }
  );
  assert.equal(estimate.status, "ok");
  assert.equal(estimate.totalGold, 4000);
  assert.equal(estimate.missingGold, 1400);
  assert.equal(estimate.guildTokensRequired, 40);
  assert.equal(estimate.guildTokensMissing, 35);
  assert.deepEqual(
    estimate.rows.find((row) => row.itemHrid === "/items/blue_guild_credit"),
    {
      itemHrid: "/items/blue_guild_credit",
      required: 100,
      owned: 120,
      missing: 0,
      unitCost: 20,
      totalCost: 2000,
      missingCost: 0
    }
  );
});

test("剩余公会代币按兑换价值依次覆盖紫色、银色并保留其余缺口", () => {
  const result = core.allocateSurplusGuildTokens(
    [
      { itemHrid: "/items/purple_guild_credit", missing: 3000, unitCost: 11000 },
      { itemHrid: "/items/silver_guild_credit", missing: 3000, unitCost: 55000 },
      { itemHrid: "/items/green_guild_credit", missing: 3000, unitCost: 400 }
    ],
    [
      { creditItemHrid: "/items/green_guild_credit", guildTokenCount: 1, creditCount: 10 },
      { creditItemHrid: "/items/purple_guild_credit", guildTokenCount: 1, creditCount: 1 },
      { creditItemHrid: "/items/silver_guild_credit", guildTokenCount: 10, creditCount: 1 }
    ],
    10000
  );

  assert.equal(result.spentGuildTokens, 10000);
  assert.equal(result.remainingGuildTokens, 0);
  assert.deepEqual(
    result.allocations.map((allocation) => ({
      creditItemHrid: allocation.creditItemHrid,
      spentGuildTokens: allocation.spentGuildTokens,
      coveredCredits: allocation.coveredCredits
    })),
    [
      { creditItemHrid: "/items/purple_guild_credit", spentGuildTokens: 3000, coveredCredits: 3000 },
      { creditItemHrid: "/items/silver_guild_credit", spentGuildTokens: 7000, coveredCredits: 700 }
    ]
  );
});

test("自动兑换预算限制代币用量并保留部分信用点的物品缺口", () => {
  const estimate = core.estimateGuildUpgradeCosts(
    [
      { itemHrid: "/items/purple_guild_credit", count: 3000 },
      { itemHrid: "/items/silver_guild_credit", count: 3000 },
      { itemHrid: "/items/green_guild_credit", count: 3000 }
    ],
    {
      "/items/purple_guild_credit": 11000,
      "/items/silver_guild_credit": 55000,
      "/items/green_guild_credit": 400
    },
    {
      "/items/guild_token": 10000
    },
    {
      autoAllocateSurplusGuildTokens: true,
      autoGuildTokenBudget: 5000,
      guildTokenCreditConversions: [
        { creditItemHrid: "/items/green_guild_credit", guildTokenCount: 1, creditCount: 10 },
        { creditItemHrid: "/items/purple_guild_credit", guildTokenCount: 1, creditCount: 1 },
        { creditItemHrid: "/items/silver_guild_credit", guildTokenCount: 10, creditCount: 1 }
      ]
    }
  );

  assert.equal(estimate.autoGuildTokenBudgetAvailable, 10000);
  assert.equal(estimate.autoGuildTokenBudget, 5000);
  assert.equal(estimate.autoGuildTokenCreditExchangeUsed, 5000);
  assert.equal(estimate.guildTokensRequired, 5000);
  assert.equal(estimate.guildTokensMissing, 0);
  assert.equal(estimate.rows.find((row) => row.itemHrid === "/items/purple_guild_credit").remainingMissing, 0);
  assert.equal(estimate.rows.find((row) => row.itemHrid === "/items/silver_guild_credit").remainingMissing, 2800);
  assert.equal(estimate.rows.find((row) => row.itemHrid === "/items/green_guild_credit").remainingMissing, 3000);
});

test("代币预算滑块按百分比显示并在指定比例附近磁吸", () => {
  assert.equal(core.guildTokenBudgetPercentage(0, 7800), 0);
  assert.equal(core.guildTokenBudgetPercentage(3900, 7800), 50);
  assert.equal(core.guildTokenBudgetPercentage(7800, 7800), 100);
  assert.deepEqual(core.snapGuildTokenBudget(1530, 7800), { value: 1560, percentage: 20, snappedTo: 20 });
  assert.deepEqual(core.snapGuildTokenBudget(1760, 7800), { value: 1760, percentage: 23, snappedTo: null });
  assert.deepEqual(core.snapGuildTokenBudget(3901, 7800), { value: 3900, percentage: 50, snappedTo: 50 });
  assert.deepEqual(core.snapGuildTokenBudget(7700, 7800), { value: 7800, percentage: 100, snappedTo: 100 });
  assert.deepEqual(core.snapGuildTokenBudget(50, 0), { value: 0, percentage: 0, snappedTo: null });
});

test("自动兑换只使用扣除神龛和手动兑换后的库存代币", () => {
  const estimate = core.estimateGuildUpgradeCosts(
    [
      { itemHrid: "/items/guild_token", count: 1000 },
      { itemHrid: "/items/red_guild_credit", count: 500 },
      { itemHrid: "/items/purple_guild_credit", count: 3000 }
    ],
    {
      "/items/purple_guild_credit": 11000
    },
    {
      "/items/guild_token": 10000
    },
    {
      autoAllocateSurplusGuildTokens: true,
      guildTokenCreditHrids: ["/items/red_guild_credit"],
      guildTokenCreditConversions: [
        { creditItemHrid: "/items/red_guild_credit", guildTokenCount: 1, creditCount: 1 },
        { creditItemHrid: "/items/purple_guild_credit", guildTokenCount: 1, creditCount: 1 }
      ]
    }
  );

  assert.equal(estimate.manualGuildTokenCreditExchangeRequired, 500);
  assert.equal(estimate.autoGuildTokenBudgetAvailable, 8500);
  assert.equal(estimate.autoGuildTokenCreditExchangeUsed, 3000);
  assert.equal(estimate.guildTokensRequired, 4500);
  assert.equal(estimate.rows.find((row) => row.itemHrid === "/items/purple_guild_credit").remainingMissing, 0);
});

test("神龛信用点缺口可全部改用公会代币并合并到代币总需求", () => {
  const estimate = core.estimateGuildUpgradeCosts(
    [
      { itemHrid: "/items/guild_token", count: 1600 },
      { itemHrid: "/items/green_guild_credit", count: 12001 },
      { itemHrid: "/items/white_guild_credit", count: 6000 },
      { itemHrid: "/items/blue_guild_credit", count: 6000 }
    ],
    {
      "/items/green_guild_credit": 200,
      "/items/white_guild_credit": 700,
      "/items/blue_guild_credit": 800
    },
    {
      "/items/guild_token": 10750,
      "/items/green_guild_credit": 6000,
      "/items/white_guild_credit": 0,
      "/items/blue_guild_credit": 98000
    },
    {
      useGuildTokensForMissingCredits: true,
      guildTokenCreditConversions: [
        { creditItemHrid: "/items/green_guild_credit", guildTokenCount: 1, creditCount: 10 },
        { creditItemHrid: "/items/white_guild_credit", guildTokenCount: 1, creditCount: 10 },
        { creditItemHrid: "/items/blue_guild_credit", guildTokenCount: 1, creditCount: 10 }
      ]
    }
  );
  assert.equal(estimate.status, "ok");
  assert.equal(estimate.totalGold, 0);
  assert.equal(estimate.missingGold, 0);
  assert.equal(estimate.guildTokenCreditExchangeRequired, 1201);
  assert.equal(estimate.guildTokensRequired, 2801);
  assert.equal(estimate.guildTokensMissing, 0);
  assert.deepEqual(
    estimate.rows.find((row) => row.itemHrid === "/items/guild_token"),
    {
      itemHrid: "/items/guild_token",
      required: 2801,
      owned: 10750,
      missing: 0,
      unitCost: null,
      totalCost: null,
      missingCost: null,
      shrineRequired: 1600,
      creditExchangeRequired: 1201
    }
  );
  assert.deepEqual(estimate.rows.find((row) => row.itemHrid === "/items/green_guild_credit").guildTokenExchange, {
    creditItemHrid: "/items/green_guild_credit",
    guildTokenCount: 1,
    creditCount: 10,
    batches: 601,
    actualCredits: 6010,
    requiredGuildTokens: 601
  });
  assert.equal(
    estimate.rows.find((row) => row.itemHrid === "/items/blue_guild_credit").guildTokenExchange.requiredGuildTokens,
    0
  );
});

test("神龛信用点可分别选择最优物品或公会代币并合并成本", () => {
  const estimate = core.estimateGuildUpgradeCosts(
    [
      { itemHrid: "/items/guild_token", count: 100 },
      { itemHrid: "/items/green_guild_credit", count: 100 },
      { itemHrid: "/items/red_guild_credit", count: 10 }
    ],
    {
      "/items/green_guild_credit": 2
    },
    {
      "/items/guild_token": 3,
      "/items/green_guild_credit": 40,
      "/items/red_guild_credit": 4
    },
    {
      guildTokenCreditHrids: ["/items/red_guild_credit"],
      guildTokenCreditConversions: [
        { creditItemHrid: "/items/green_guild_credit", guildTokenCount: 1, creditCount: 10 },
        { creditItemHrid: "/items/red_guild_credit", guildTokenCount: 1, creditCount: 1 }
      ]
    }
  );
  assert.equal(estimate.status, "ok");
  assert.equal(estimate.totalGold, 200);
  assert.equal(estimate.missingGold, 120);
  assert.equal(estimate.guildTokenCreditExchangeRequired, 6);
  assert.equal(estimate.guildTokensRequired, 106);
  assert.equal(estimate.guildTokensMissing, 103);
  assert.equal(estimate.useGuildTokensForMissingCredits, true);
  assert.deepEqual(estimate.guildTokenCreditHrids, ["/items/red_guild_credit"]);
  assert.equal(estimate.rows.find((row) => row.itemHrid === "/items/green_guild_credit").guildTokenExchange, undefined);
  assert.equal(
    estimate.rows.find((row) => row.itemHrid === "/items/red_guild_credit").guildTokenExchange.requiredGuildTokens,
    6
  );
});

test("神龛升级缺少信用点价格时不伪造总价", () => {
  const estimate = core.estimateGuildUpgradeCosts([{ itemHrid: "/items/red_guild_credit", count: 10 }], {}, {});
  assert.equal(estimate.status, "partial");
  assert.deepEqual(estimate.unpricedItemHrids, ["/items/red_guild_credit"]);
  assert.equal(estimate.totalGold, 0);
  assert.equal(estimate.missingGold, 0);
});

test("官方 i18n 名称目录优先于旧词典或规则翻译", () => {
  const storageValues = new Map();
  const storage = {
    getItem: (key) => storageValues.get(key) || null,
    setItem: (key, value) => storageValues.set(key, value)
  };
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
  assert.equal(
    catalog.resolveItemName({ itemHrid: "/items/beast_hide", englishFallback: "Beast Hide", locale: "zh-CN" }),
    "官方野兽皮"
  );
  assert.equal(
    catalog.resolveItemName({
      itemHrid: "/items/grandmaster_cheesesmithing_charm",
      englishFallback: "Grandmaster Cheesesmithing Charm",
      locale: "zh-CN"
    }),
    "官方宗师奶酪锻造护符"
  );
  assert.equal(
    catalog.resolveItemName({
      itemHrid: "/items/ultra_brewing_tea",
      englishFallback: "Ultra Brewing Tea",
      locale: "zh-CN"
    }),
    "官方究极冲泡茶"
  );
  assert.equal(
    catalog.resolveItemName({ itemHrid: "/items/beast_hide", englishFallback: "Beast Hide", locale: "en" }),
    "Beast Hide"
  );
  assert.deepEqual(catalog.coverage(["/items/beast_hide", "/items/missing"]), {
    requestedCount: 2,
    officialHitCount: 1,
    missingItemHrids: ["/items/missing"],
    source: "window-i18n",
    catalogEntryCount: 3
  });
  itemNames.newly_added_item = "官方新增物品";
  catalog.refresh();
  assert.equal(
    catalog.resolveItemName({
      itemHrid: "/items/newly_added_item",
      englishFallback: "Newly Added Item",
      locale: "zh-CN"
    }),
    "官方新增物品"
  );
});

test("官方名称目录优先于内置公会货币回退名称", () => {
  const itemNames = { green_guild_credit: "官方绿色信用点" };
  const catalog = itemNameCatalogApi.createItemNameCatalog({
    pageWindow: { i18next: { resources: { "zh-CN": { translation: { itemNames } } } } },
    storage: { getItem: () => null, setItem: () => {} },
    minimumEntries: 1
  });
  catalog.refresh();
  assert.equal(
    catalog.resolveItemName({
      itemHrid: "/items/green_guild_credit",
      englishFallback: localizationApi.createLocalizer("zh-CN").itemName("/items/green_guild_credit"),
      locale: "zh-CN"
    }),
    "官方绿色信用点"
  );
});

test("官方名称目录在官方资源暂不可读时使用缓存，否则诚实回退英文", () => {
  const storageValues = new Map();
  const storage = {
    getItem: (key) => storageValues.get(key) || null,
    setItem: (key, value) => storageValues.set(key, value)
  };
  const firstCatalog = itemNameCatalogApi.createItemNameCatalog({
    pageWindow: {
      i18n: { store: { data: { "zh-CN": { translation: { itemNames: { beast_hide: "官方野兽皮" } } } } } }
    },
    storage,
    minimumEntries: 1
  });
  firstCatalog.refresh();
  const cachedCatalog = itemNameCatalogApi.createItemNameCatalog({ pageWindow: {}, storage, minimumEntries: 1 });
  assert.equal(
    cachedCatalog.resolveItemName({ itemHrid: "/items/beast_hide", englishFallback: "Beast Hide", locale: "zh-CN" }),
    "官方野兽皮"
  );
  const emptyCatalog = itemNameCatalogApi.createItemNameCatalog({
    pageWindow: {},
    storage: { getItem: () => null, setItem: () => {} },
    minimumEntries: 1
  });
  assert.equal(
    emptyCatalog.resolveItemName({ itemHrid: "/items/beast_hide", englishFallback: "Beast Hide", locale: "zh-CN" }),
    "Beast Hide"
  );
});

test("官方名称目录缓存可继续解析名称，但不会被误判为实时资源已就绪", () => {
  const storageValues = new Map();
  const storage = {
    getItem: (key) => storageValues.get(key) || null,
    setItem: (key, value) => storageValues.set(key, value)
  };
  const liveCatalog = itemNameCatalogApi.createItemNameCatalog({
    pageWindow: {
      i18next: { resources: { "zh-CN": { translation: { itemNames: { beast_hide: "官方野兽皮" } } } } }
    },
    storage,
    minimumEntries: 1
  });
  const liveRefresh = liveCatalog.refreshIfDue({ force: true, now: 1000 });
  assert.equal(liveRefresh.attempted, true);
  assert.equal(liveRefresh.ready, true);
  assert.equal(liveCatalog.metadata().source, "window-i18n");

  const cachedCatalog = itemNameCatalogApi.createItemNameCatalog({ pageWindow: {}, storage, minimumEntries: 1 });
  assert.equal(cachedCatalog.metadata().source, "cache");
  const cacheRefresh = cachedCatalog.refreshIfDue({ force: true, now: 2000 });
  assert.equal(cacheRefresh.attempted, true);
  assert.equal(cacheRefresh.changed, false);
  assert.equal(cacheRefresh.ready, false);
  assert.equal(
    cachedCatalog.resolveItemName({ itemHrid: "/items/beast_hide", englishFallback: "Beast Hide", locale: "zh-CN" }),
    "官方野兽皮"
  );
});

test("官方名称目录按有上限的退避重试，五次未就绪后仍能在第六次接入官方中文", () => {
  const pageWindow = {};
  const catalog = itemNameCatalogApi.createItemNameCatalog({
    pageWindow,
    storage: { getItem: () => null, setItem: () => {} },
    minimumEntries: 1
  });
  let now = 1000;
  const first = catalog.refreshIfDue({ now });
  assert.deepEqual(
    { attempted: first.attempted, changed: first.changed, ready: first.ready },
    { attempted: true, changed: false, ready: false }
  );

  const tooSoon = catalog.refreshIfDue({ now: now + itemNameCatalogApi.refreshRetryDelay(1) - 1 });
  assert.equal(tooSoon.attempted, false);
  assert.equal(tooSoon.ready, false);

  for (let attempt = 2; attempt <= 5; attempt += 1) {
    now += itemNameCatalogApi.refreshRetryDelay(attempt - 1);
    const retry = catalog.refreshIfDue({ now });
    assert.equal(retry.attempted, true);
    assert.equal(retry.changed, false);
    assert.equal(retry.ready, false);
  }

  pageWindow.i18next = {
    resources: { "zh-Hans": { translation: { itemNames: { beast_hide: "稍后读取的官方野兽皮" } } } }
  };
  now += itemNameCatalogApi.refreshRetryDelay(5);
  const sixth = catalog.refreshIfDue({ now });
  assert.deepEqual(
    { attempted: sixth.attempted, changed: sixth.changed, ready: sixth.ready },
    { attempted: true, changed: true, ready: true }
  );
  assert.equal(catalog.metadata().source, "window-i18n");
  assert.equal(
    catalog.resolveItemName({ itemHrid: "/items/beast_hide", englishFallback: "Beast Hide", locale: "zh-CN" }),
    "稍后读取的官方野兽皮"
  );

  const cappedDelay = itemNameCatalogApi.refreshRetryDelay(100);
  assert.ok(Number.isFinite(cappedDelay));
  assert.ok(cappedDelay >= itemNameCatalogApi.refreshRetryDelay(1));
  assert.equal(itemNameCatalogApi.refreshRetryDelay(1000), cappedDelay);
});

test("React Provider 中的官方名称资源会标记为实时就绪", () => {
  const gamePageRoot = {
    __reactFiber$test: {
      memoizedProps: {
        i18n: {
          resources: { "zh-CN": { translation: { itemNames: { beast_hide: "React 官方野兽皮" } } } }
        }
      }
    }
  };
  const catalog = itemNameCatalogApi.createItemNameCatalog({
    pageWindow: {},
    document: {
      querySelectorAll: () => [gamePageRoot],
      getElementById: () => null,
      body: null
    },
    storage: { getItem: () => null, setItem: () => {} },
    minimumEntries: 1
  });
  const result = catalog.refreshIfDue({ force: true, now: 1000 });
  assert.equal(result.attempted, true);
  assert.equal(result.changed, true);
  assert.equal(result.ready, true);
  assert.equal(catalog.metadata().source, "react-provider");
});

test("官方名称目录兼容参考插件使用的 zh-Hans 与 React Provider 资源形状", () => {
  const itemNames = { "/items/beast_hide": "官方野兽皮", "/items/green_guild_credit": "官方绿色公会信用点" };
  const catalog = itemNameCatalogApi.createItemNameCatalog({
    pageWindow: { mwi: { lang: { options: { resources: { "zh-Hans": { itemNames } } } } } },
    storage: { getItem: () => null, setItem: () => {} },
    minimumEntries: 2
  });
  catalog.refresh();
  assert.equal(
    catalog.resolveItemName({ itemHrid: "/items/beast_hide", englishFallback: "Beast Hide", locale: "zh-CN" }),
    "官方野兽皮"
  );
  assert.equal(catalog.coverage(["/items/beast_hide", "/items/green_guild_credit"]).officialHitCount, 2);
});

test("支持游戏初始化消息使用的 itemDetailMap 对象结构", () => {
  const conversions = core.conversionsFromItemDetails(
    {
      "/items/cheese": {
        guildCreditConversions: [{ creditItemHrid: "/items/green_guild_credit", itemCount: 10, creditCount: 1 }]
      }
    },
    "/items/green_guild_credit"
  );
  assert.deepEqual(conversions, [
    {
      itemHrid: "/items/cheese",
      itemName: "/items/cheese",
      creditItemHrid: "/items/green_guild_credit",
      itemCount: 10,
      creditCount: 1
    }
  ]);
});

test("超高价格物品筛选覆盖贤者与大师护符且不会误判普通物品", () => {
  assert.equal(core.isUltraHighPriceItemName("贤者烹饪护符"), true);
  assert.equal(core.isUltraHighPriceItemName("大师挤奶护符"), true);
  assert.equal(core.isUltraHighPriceItemName("宗师强化护符"), true);
  assert.equal(core.isUltraHighPriceItemName("Sage Cooking Charm"), true);
  assert.equal(core.isUltraHighPriceItemName("Master Milking Charm"), true);
  assert.equal(core.isUltraHighPriceItemName("Grandmaster Enhancing Charm"), true);
  assert.equal(core.isUltraHighPriceItemName("Official Name", "Sage Alchemy Charm"), true);
  assert.equal(core.isUltraHighPriceItemName("Sausage"), false);
  assert.equal(core.isUltraHighPriceItemName("大师药水"), false);
  assert.equal(core.isUltraHighPriceItemName("Grandmaster Cape"), false);
});

test("正式版桥接保留游戏实时神龛等级", () => {
  const bridgeSource = fs.readFileSync(path.join(__dirname, "..", "src", "bridge.js"), "utf8");
  class FakeWebSocket {
    constructor(url) {
      this.url = url;
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
  vm.runInNewContext(bridgeSource, { window: page, JSON, Map, Object, Set, WeakSet, URL, String });
  const socket = new page.WebSocket("wss://api.milkywayidle.com/ws");
  socket.receive(
    JSON.stringify({
      payload: {
        characterGuildBuffDict: { "/guild_buffs/tempo_combat": { level: 7 } },
        guildBuildingMap: { "/guild_buildings/tempo_shrine": { level: 4 } },
        characterItems: [
          { itemHrid: "/items/green_guild_credit", itemLocationHrid: "/item_locations/inventory", count: 123 }
        ]
      }
    })
  );
  assert.equal(page.__mwiGuildCreditBridge.guildBuffLevels["/guild_buffs/tempo_combat"].level, 7);
  assert.equal(page.__mwiGuildCreditBridge.guildShrineLevels["/guild_buildings/tempo_shrine"].level, 4);
  assert.equal(page.__mwiGuildCreditBridge.characterItems[0].count, 123);
  assert.equal(page.__mwiGuildCreditBridge.messages.length, 1);
  assert.equal(page.__mwiGuildCreditBridge.guildBuffLevelsRevision, 1);

  let callbackCount = 0;
  page.__mwiGuildCreditBridge.onGuildBuffLevelsUpdated = () => {
    callbackCount += 1;
  };
  socket.receive(
    JSON.stringify({
      payload: {
        characterGuildBuffDict: { "/guild_buffs/tempo_combat": { level: 7 } }
      }
    })
  );
  assert.equal(page.__mwiGuildCreditBridge.guildBuffLevelsRevision, 1);
  assert.equal(callbackCount, 0);

  socket.receive(
    JSON.stringify({
      payload: {
        characterGuildBuffDict: { "/guild_buffs/tempo_combat": { level: 8 } }
      }
    })
  );
  assert.equal(page.__mwiGuildCreditBridge.guildBuffLevels["/guild_buffs/tempo_combat"].level, 8);
  assert.equal(page.__mwiGuildCreditBridge.guildBuffLevelsRevision, 2);
  assert.equal(callbackCount, 1);
});

test("正式版桥接按游戏原生 endCharacterItems 增量实时更新库存", () => {
  const bridgeSource = fs.readFileSync(path.join(__dirname, "..", "src", "bridge.js"), "utf8");
  class FakeWebSocket {
    constructor(url) {
      this.url = url;
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
  vm.runInNewContext(bridgeSource, { window: page, JSON, Map, Object, Set, WeakSet, URL, String, Array, Date, Number });
  const socket = new page.WebSocket("wss://api.milkywayidle.com/ws");
  socket.receive(
    JSON.stringify({
      payload: {
        characterItems: [
          {
            hash: "1::/item_locations/inventory::/items/guild_token::0",
            itemHrid: "/items/guild_token",
            itemLocationHrid: "/item_locations/inventory",
            enhancementLevel: 0,
            count: 10750
          },
          {
            hash: "1::/item_locations/inventory::/items/green_guild_credit::0",
            itemHrid: "/items/green_guild_credit",
            itemLocationHrid: "/item_locations/inventory",
            enhancementLevel: 0,
            count: 6000
          }
        ]
      }
    })
  );
  const bridge = page.__mwiGuildCreditBridge;
  assert.equal(bridge.characterItemsRevision, 1);
  let callbackCount = 0;
  bridge.onCharacterItemsUpdated = () => {
    callbackCount += 1;
  };

  socket.receive(
    JSON.stringify({
      type: "action_type_consumable_slots_updated",
      endCharacterItems: [
        {
          hash: "1::/item_locations/inventory::/items/guild_token::0",
          itemHrid: "/items/guild_token",
          itemLocationHrid: "/item_locations/inventory",
          enhancementLevel: 0,
          count: 8450
        }
      ]
    })
  );
  assert.equal(bridge.characterItems.find((item) => item.itemHrid === "/items/guild_token").count, 8450);
  assert.equal(bridge.characterItems.find((item) => item.itemHrid === "/items/green_guild_credit").count, 6000);
  assert.equal(bridge.characterItemsRevision, 2);
  assert.equal(callbackCount, 1);
  assert.equal(bridge.diagnostics.lastCharacterItemsSource, "incremental");

  socket.receive(
    JSON.stringify({
      type: "items_updated",
      payload: {
        endCharacterItems: [
          {
            hash: "1::/item_locations/inventory::/items/green_guild_credit::0",
            itemHrid: "/items/green_guild_credit",
            itemLocationHrid: "/item_locations/inventory",
            enhancementLevel: 0,
            count: 0
          }
        ]
      }
    })
  );
  assert.equal(
    bridge.characterItems.some((item) => item.itemHrid === "/items/green_guild_credit"),
    false
  );
  assert.equal(bridge.characterItemsRevision, 3);
  assert.equal(callbackCount, 2);

  socket.receive(
    JSON.stringify({
      type: "items_updated",
      endCharacterItems: [
        {
          hash: "1::/item_locations/inventory::/items/guild_token::0",
          itemHrid: "/items/guild_token",
          itemLocationHrid: "/item_locations/inventory",
          enhancementLevel: 0,
          count: 8450
        }
      ]
    })
  );
  assert.equal(bridge.characterItemsRevision, 3);
  assert.equal(callbackCount, 2);
});

test("正式版库存修订会触发神龛计划与兑换顾问刷新", () => {
  const source = projectRuntimeSource();
  assert.match(source, /bridge\.onCharacterItemsUpdated = hydrateBridgeData/);
  assert.match(source, /characterItemsRevision > state\.characterItemsBridgeRevision/);
  assert.match(source, /setCharacterItems\(bridge\.characterItems\)\) scheduleInventoryDataRefresh\(\)/);
  assert.match(source, /function scheduleInventoryDataRefresh\(\)/);
  assert.match(source, /refreshGuildUpgrade\(state\.panel\)/);
  assert.match(source, /scheduleGuildExchangeAdvisor\(true\)/);
  assert.match(source, /!Number\.isSafeInteger\(characterItemsRevision\)/);
});

test("正式版桥接被动保存玩家打开商品时收到的实时市场价格", () => {
  const bridgeSource = fs.readFileSync(path.join(__dirname, "..", "src", "bridge.js"), "utf8");
  class FakeWebSocket {
    constructor(url) {
      this.url = url;
      this.listeners = new Map();
    }
    addEventListener(type, listener) {
      this.listeners.set(type, listener);
    }
    receive(data) {
      this.listeners.get("message")({ data });
    }
  }
  const page = { WebSocket: FakeWebSocket, MwiGuildCreditMarketData: marketDataApi };
  vm.runInNewContext(bridgeSource, { window: page, JSON, Map, Object, Set, WeakSet, URL, String, Array, Date, Number });
  const socket = new page.WebSocket("wss://api.milkywayidle.com/ws");
  socket.receive(
    JSON.stringify({
      type: "market_item_order_books_updated",
      marketItemOrderBooks: {
        itemHrid: "/items/snake_fang",
        orderBooks: { 0: { asks: [{ price: 7600, quantity: 5 }], bids: [{ price: 7200, quantity: 3 }] } }
      }
    })
  );
  const bridge = page.__mwiGuildCreditBridge;
  assert.equal(bridge.marketOrderBookRevision, 1);
  assert.equal(bridge.marketOrderBooks["/items/snake_fang"].update.levels["0"].a, 7600);
  assert.equal(bridge.marketOrderBooks["/items/snake_fang"].update.levels["0"].b, 7200);
});

test("正式版桥接只监听官方游戏 WebSocket", () => {
  const bridgeSource = fs.readFileSync(path.join(__dirname, "..", "src", "bridge.js"), "utf8");
  class FakeWebSocket {
    constructor(url) {
      this.url = url;
      this.listeners = new Map();
    }
    addEventListener(type, listener) {
      this.listeners.set(type, listener);
    }
  }
  const page = { WebSocket: FakeWebSocket, MwiGuildCreditMarketData: marketDataApi };
  vm.runInNewContext(bridgeSource, {
    window: page,
    JSON,
    Map,
    Object,
    Set,
    WeakSet,
    URL,
    String,
    Array,
    Date,
    Number
  });
  const unrelatedSocket = new page.WebSocket("wss://example.invalid/ws");
  assert.equal(unrelatedSocket.listeners.has("message"), false);
  const gameSocket = new page.WebSocket("wss://api-test.milkywayidlecn.com/ws");
  assert.equal(gameSocket.listeners.has("message"), true);
});

test("正式版桥接在 unsafeWindow 代理隔离时注入游戏主世界", () => {
  const bridgeSource = fs.readFileSync(path.join(__dirname, "..", "src", "bridge.js"), "utf8");
  class PageWebSocket {
    constructor(url) {
      this.url = url;
      this.listeners = new Map();
    }
    addEventListener(type, listener) {
      this.listeners.set(type, listener);
    }
    receive(data) {
      this.listeners.get("message")({ data });
    }
  }
  class SandboxWebSocket {}
  class FakeCustomEvent {
    constructor(type, options) {
      this.type = type;
      this.detail = options && options.detail;
    }
  }
  const listeners = new Map();
  const addEventListener = (type, listener) => {
    if (!listeners.has(type)) listeners.set(type, []);
    listeners.get(type).push(listener);
  };
  const dispatchEvent = (event) => {
    for (const listener of listeners.get(event.type) || []) listener(event);
    return true;
  };
  const page = { WebSocket: PageWebSocket, addEventListener, dispatchEvent };
  const sandboxWindow = {
    WebSocket: SandboxWebSocket,
    MwiGuildCreditMarketData: marketDataApi,
    addEventListener,
    dispatchEvent
  };
  const pageContext = vm.createContext({
    window: page,
    CustomEvent: FakeCustomEvent,
    JSON,
    Map,
    Object,
    Set,
    WeakSet,
    URL,
    String,
    Array,
    Date,
    Number
  });
  const proxyExpando = Object.create(null);
  const isolatedUnsafeWindow = new Proxy(page, {
    get(target, key) {
      return Object.prototype.hasOwnProperty.call(proxyExpando, key) ? proxyExpando[key] : target[key];
    },
    set(_target, key, value) {
      proxyExpando[key] = value;
      return true;
    }
  });
  vm.runInNewContext(bridgeSource, {
    window: sandboxWindow,
    unsafeWindow: isolatedUnsafeWindow,
    GM_addElement(tagName, attributes) {
      assert.equal(tagName, "script");
      vm.runInContext(attributes.textContent, pageContext);
      return { remove() {} };
    },
    JSON,
    Map,
    Object,
    Set,
    WeakSet,
    URL,
    String,
    Array,
    Date,
    Number
  });
  assert.equal(page.WebSocket.__mwiGuildCreditBridge, true);
  assert.equal(sandboxWindow.WebSocket, SandboxWebSocket);
  const socket = new page.WebSocket("wss://api.milkywayidle.com/ws");
  socket.receive(
    JSON.stringify({
      type: "market_item_order_books_updated",
      marketItemOrderBooks: {
        itemHrid: "/items/brewing_speed_amulet",
        orderBooks: {
          0: {
            asks: [
              { price: 2400000, quantity: 7 },
              { price: 2450000, quantity: 1 }
            ],
            bids: [{ price: 2350000, quantity: 10 }]
          }
        }
      }
    })
  );
  assert.equal(page.__mwiGuildCreditBridge, undefined);
  assert.equal(sandboxWindow.__mwiGuildCreditBridge.marketOrderBookRevision, 1);
  assert.equal(sandboxWindow.__mwiGuildCreditBridge.diagnostics.installMode, "gm_add_element_main_world");
  assert.equal(sandboxWindow.__mwiGuildCreditBridge.diagnostics.lastMarketItemHrid, "/items/brewing_speed_amulet");
  assert.equal(sandboxWindow.__mwiGuildCreditBridge.diagnostics.lastMarketLevels["0"].a, 2400000);
  assert.equal(
    sandboxWindow.__mwiGuildCreditBridge.marketOrderBooks["/items/brewing_speed_amulet"].update.levels["0"].a,
    2400000
  );
});

test("正式版把实时市场价格接入浏览器持久缓存", () => {
  const source = projectRuntimeSource();
  assert.match(source, /mwi-guild-credit-live-market-v1/);
  assert.match(source, /restoreLiveMarketData\(raw\)/);
  assert.match(source, /serializeLiveMarketData\(liveData/);
  assert.match(source, /persistLiveMarketData\(\);\s+scheduleMarketDataRefresh\(\)/);
  assert.match(source, /reconcileLiveMarketData\(state\.marketLiveData/);
  assert.match(source, /confirmMissingMarketSnapshot\(marketData, nextTimestamp\)/);
  assert.match(source, /snapshotData: marketData/);
});

test("正式版桥接通过游戏原生控制器打开指定市场物品", () => {
  const bridgeSource = fs.readFileSync(path.join(__dirname, "..", "src", "bridge.js"), "utf8");
  class FakeWebSocket {}
  const calls = [];
  const controller = {
    handleGoToMarketplace(itemHrid, enhancementLevel) {
      calls.push([itemHrid, enhancementLevel]);
    }
  };
  const root = {
    _reactRootContainer: {
      _internalRoot: {
        current: { child: { stateNode: controller } }
      }
    }
  };
  const page = {
    WebSocket: FakeWebSocket,
    document: { getElementById: (id) => (id === "root" ? root : null) }
  };
  vm.runInNewContext(bridgeSource, { window: page, JSON, Map, Object, Set, WeakSet, URL, String, Array });
  const bridge = page.__mwiGuildCreditBridge;
  assert.equal(bridge.goToMarketplace("/items/snake_fang", 6), true);
  assert.deepEqual(calls, [["/items/snake_fang", 6]]);
  assert.equal(bridge.goToMarketplace("/items/snake_fang"), true);
  assert.deepEqual(calls, [
    ["/items/snake_fang", 6],
    ["/items/snake_fang", 0]
  ]);
  assert.equal(bridge.goToMarketplace("invalid-item"), false);
});

test("正式版桥接会合并分帧到达的公会神龛建筑等级", () => {
  const bridgeSource = fs.readFileSync(path.join(__dirname, "..", "src", "bridge.js"), "utf8");
  class FakeWebSocket {
    constructor(url) {
      this.url = url;
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
  vm.runInNewContext(bridgeSource, { window: page, JSON, Map, Object, Set, WeakSet, URL, String, Array });
  const socket = new page.WebSocket("wss://api.milkywayidle.com/ws");
  socket.receive(JSON.stringify({ payload: { guildBuildingMap: { "/guild_buildings/tempo": { level: 3 } } } }));
  socket.receive(JSON.stringify({ payload: { guildBuildingMap: { "/guild_buildings/force": { level: 5 } } } }));
  assert.equal(page.__mwiGuildCreditBridge.guildShrineLevels["/guild_buildings/tempo"].level, 3);
  assert.equal(page.__mwiGuildCreditBridge.guildShrineLevels["/guild_buildings/force"].level, 5);
});

test("正式版桥接保留神龛建筑定义，供等级记录关联", () => {
  const bridgeSource = fs.readFileSync(path.join(__dirname, "..", "src", "bridge.js"), "utf8");
  class FakeWebSocket {
    constructor(url) {
      this.url = url;
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
  vm.runInNewContext(bridgeSource, { window: page, JSON, Map, Object, Set, WeakSet, URL, String, Array });
  const socket = new page.WebSocket("wss://api.milkywayidle.com/ws");
  socket.receive(
    JSON.stringify({
      payload: {
        guildBuildingDetailMap: {
          "/guild_buildings/alpha": {
            guildBuildingHrid: "/guild_buildings/alpha",
            guildShrineHrid: "/guild_shrines/force"
          }
        }
      }
    })
  );
  assert.equal(
    page.__mwiGuildCreditBridge.guildShrineDetails["/guild_shrines/force"].guildBuildingHrid,
    "/guild_buildings/alpha"
  );
});

test("内部页签会持久化并恢复最后打开的可见视图", () => {
  const source = projectRuntimeSource();
  assert.match(source, /PANEL_VIEWS: \["credit", "upgrade", "construction"\]/);
  assert.match(source, /DEFAULT_PANEL_ORDER: \["upgrade", "credit", "construction"\]/);
  assert.match(source, /activeView: "credit"/);
  assert.match(source, /activeView: normalizePanelView\(stored\.activeView, config\.PANEL_VIEWS\)/);
  assert.match(source, /activeView: state\.activeView/);
  assert.match(source, /panelOrder: normalizePanelOrder\(state\.panelOrder/);
  assert.match(source, /state\.activeView = selectedView;\s*const persisted = persistPluginUiState\(\);/);
  assert.match(source, /panel\.dataset\.activeView = state\.activeView/);
  assert.match(source, /data-role="credit-view"[\s\S]{0,150}state\.activeView === "credit"/);
  assert.match(source, /data-role="upgrade-view"[\s\S]{0,150}state\.activeView === "upgrade"/);
  assert.match(source, /data-role="construction-view"[\s\S]{0,150}state\.activeView === "construction"/);
  assert.match(source, /activeView === "construction"\) refreshGuildConstruction/);
  assert.match(source, /showConstructionView: stored\.showConstructionView !== false/);
  assert.match(source, /\.mwi-view-tab-item:not\(\[hidden\]\)/);
  assert.match(source, /createPointerSortable/);
});

test("侧栏语言稳定后会重建静态文案，且插件根层不遮挡原生拖拽宽度控件", () => {
  const userscriptSource = fs.readFileSync(path.join(__dirname, "..", "src", "userscript.js"), "utf8");
  const stylesSource = fs.readFileSync(path.join(__dirname, "..", "src", "ui", "styles.js"), "utf8");
  const harnessSource = fs.readFileSync(path.join(__dirname, "..", "tools", "test-harness.html"), "utf8");
  assert.match(userscriptSource, /integration\.detectedLocale/);
  assert.match(userscriptSource, /state\.panelLocale\s*!==\s*locale/);
  assert.match(userscriptSource, /localeChanged[\s\S]{0,400}recreatePanel/);
  assert.match(userscriptSource, /state\.panelLocale\s*=\s*locale/);
  assert.doesNotMatch(userscriptSource, /itemNameCatalogRetryCount\s*>=\s*5/);
  assert.match(stylesSource, /#mwi-credit-optimizer\{[^}]*z-index:0/);
  assert.match(harnessSource, /searchParams\.get\("localeRaceAudit"\)/);
  assert.match(harnessSource, /searchParams\.get\("sidebarResizeAudit"\)/);
});

test("总览界面固定展示八种信用点、前五项、官方名称与物品图标", () => {
  const source = projectRuntimeSource();
  const bridgeSource = fs.readFileSync(path.join(__dirname, "..", "src", "bridge.js"), "utf8");
  const buildSource = fs.readFileSync(path.join(__dirname, "..", "tools", "build.js"), "utf8");
  const harnessSource = fs.readFileSync(path.join(__dirname, "..", "tools", "test-harness.html"), "utf8");
  assert.equal((source.match(/guild_credit/g) || []).length >= 8, true);
  assert.match(source, /filter\(\(row\) => row\.status === "ok"\)\.slice\(0, 5\)/);
  assert.match(source, /MwiGuildCreditItemNameCatalog/);
  assert.match(source, /GUILD_TOKEN_CREDIT_CONVERSIONS/);
  assert.match(source, /PRICE_REFERENCES/);
  assert.match(source, /data-price-reference="a"/);
  assert.match(source, /data-price-reference="b"/);
  assert.match(source, /data-role="exclude-ultra-high-price-items"/);
  assert.match(source, /state\.excludeUltraHighPriceItems && core\.isUltraHighPriceItemName/);
  assert.match(source, /snapshotOrderBook\(conversion\.itemHrid\)/);
  assert.match(harnessSource, /searchParams\.get\("marketFilterAudit"\)/);
  assert.match(source, /conversionCache: new Map\(\)/);
  assert.match(source, /state\.conversionCache\.clear\(\)/);
  assert.match(source, /state\.conversionCache\.get\(creditItemHrid\)/);
  assert.match(
    source,
    /hydrateBridgeData\(\);\s*extractItemDetailsFromReact\(\);\s*if \(!state\.itemDetails\) hydrateLocalInitData\(\);/
  );
  assert.match(source, /!state\.itemDetails && setItemDetails\(data\.itemDetailMap \|\| data\.itemDetailDict\)/);
  assert.match(source, /setPriceReference\(button\.dataset\.priceReference\)/);
  assert.match(source, /mwi-credit-price-reference/);
  assert.match(source, /guildTokenCount: 60, creditCount: 1/);
  assert.match(source, /tokenExchangeValue/);
  assert.match(source, /MwiGuildCreditLocalization/);
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
  assert.match(source, /guildTokenCreditHrids: Array\.from\(state\.guildTokenCreditHrids\)/);
  assert.match(source, /stored\.useGuildTokensForMissingCredits === true/);
  assert.match(source, /useGuildTokensForMissingCredits: config\.CREDIT_TYPES\.every/);
  assert.match(source, /targetCredit: state\.targetCredit/);
  assert.match(source, /value="\$\{state\.targetCredit\}"/);
  assert.match(source, /--mwi-entry-min-width:300px/);
  assert.match(source, /--mwi-entry-gap:10px/);
  assert.match(source, /\.mwi-credit-grid,#mwi-credit-optimizer \.mwi-token-value-list/);
  assert.match(source, /\.mwi-upgrade-plan-list\{display:grid;grid-template-columns:minmax\(0,1fr\);gap:0\}/);
  assert.match(source, /\.mwi-material-list\{display:grid;grid-template-columns:minmax\(0,1fr\);gap:7px/);
  assert.match(harnessSource, /searchParams\.get\("sidebarWidth"\)/);
  assert.match(harnessSource, /toggle-responsive-layout/);
  assert.match(harnessSource, /data-sidebar-layout="narrow"/);
  assert.match(harnessSource, /dispatchEvent\(new Event\("resize"\)\)/);
  assert.match(harnessSource, /guildBuffDetails/);
  assert.match(harnessSource, /__mwiLayoutAuditContract/);
  assert.match(harnessSource, /__mwiCollectLayoutAudit/);
  assert.match(harnessSource, /runPlanStabilityAudit/);
  assert.match(harnessSource, /sameFirstPlan: list\.querySelector\("\.mwi-upgrade-plan"\) === firstPlan/);
  assert.match(harnessSource, /layout-audit-output/);
  assert.match(harnessSource, /widths: \[320, 360, 420, 460, 480, 520, 560, 610, 720, 900, 1200\]/);
  assert.match(harnessSource, /breakpoints: \{ compactMax: 400, intermediateMax: 520, summaryMax: 650 \}/);
  assert.match(harnessSource, /maximumHorizontalOverflow: 0/);
  assert.match(source, /mwi-token-value-exchange/);
  assert.match(source, /mwi-token-value-row/);
  assert.match(source, /mwi-token-value-list\{[^}]*margin-inline:-1px/);
  assert.match(source, /\.mwi-token-value-body\[hidden\]\{display:none!important\}/);
  assert.doesNotMatch(source, /mwi-token-value-list table/);
  assert.match(buildSource, /银河奶牛公会信用点性价比-v\$\{version\}\.user\.js/);
  assert.match(buildSource, /src\/item-name-catalog\.js/);
  assert.match(buildSource, /src\/localization\.js/);
  assert.match(buildSource, /src\/shrine-guide\.js/);
  assert.doesNotMatch(buildSource, /src\/zh-cn-items\.js/);
  assert.doesNotMatch(source, /mwi-token-value-best/);
  assert.match(source, /MwiGuildCreditLocalization/);
  assert.doesNotMatch(source, /MwiGuildCreditChineseItems|refreshPageItemNames/);
  assert.match(source, /function resolveItemName/);
  assert.match(source, /itemNameCatalog\.resolveItemName/);
  assert.match(source, /itemNameCatalog\.refreshIfDue/);
  assert.doesNotMatch(source, /itemNameCatalogRetryCount\s*>=\s*5/);
  assert.doesNotMatch(source, /item-name-catalog-status|updateItemNameCoverage/);
  assert.match(source, /items_sprite/);
  assert.match(source, /tabPanelsContainer/);
  assert.match(source, /score: \(visible \? 1000 : 0\) \+ recognized\.length/);
  assert.match(source, /const currentIntegrationMatches = Boolean/);
  assert.match(source, /state\.panel\.parentElement === panelHost/);
  assert.match(source, /state\.creditTab\.parentElement === tabBar/);
  assert.match(source, /mwiCreditNativeTabListener/);
  assert.match(source, /state\.creditTab\.parentElement !== tabBar/);
  assert.doesNotMatch(
    source,
    /state\.panel && state\.panel\.isConnected && state\.creditTab && state\.creditTab\.isConnected\) return;/
  );
  assert.match(source, /window\.addEventListener\("resize", scheduleSidebarIntegration/);
  assert.match(source, /window\.addEventListener\("orientationchange", scheduleSidebarIntegration/);
  assert.match(source, /function bootstrapSidebarIntegration\(\)/);
  assert.match(source, /new MutationObserver\(\(\) =>/);
  assert.match(source, /sidebarIntegrationTask\.pending\(\)/);
  assert.match(source, /state\.sidebarIntegrationObserver\.disconnect\(\)/);
  assert.match(source, /window\.setInterval\(bootstrapSidebarIntegration, 3000\)/);
  assert.match(source, /\n\s*bootstrapSidebarIntegration\(\);\s*\n\}\)\(\);/);
  assert.doesNotMatch(source, /window\.setTimeout\(ensureSidebarIntegration, 1000\)/);
  assert.match(harnessSource, /searchParams\.get\("sidebarStartupAudit"\)/);
  assert.match(harnessSource, /creditTabMountsWithinHalfSecond/);
  assert.match(source, /MwiGuildCreditSidebarIntegration/);
  assert.match(source, /overflow-y:auto/);
  assert.match(source, /data-role="toggle-credit-section"/);
  assert.match(source, /collapsedCreditSections/);
  assert.match(source, /mwi-credit-body/);
  assert.match(source, /creditTab\.contains\(target\)/);
  assert.doesNotMatch(source, /const isHit = event\.clientX/);
  assert.match(source, /classList\.add\("Mui-selected"\)/);
  assert.match(source, /data-role="upgrade-plan-list"/);
  assert.match(source, /mwi-upgrade-actions.*data-role="add-upgrade-plan"/);
  assert.match(source, /data-role="clear-upgrade-plans"/);
  assert.match(source, /SHOW_ALL_CREDIT_TOKEN_TOGGLE: false/);
  assert.match(source, /if \(!SHOW_ALL_CREDIT_TOKEN_TOGGLE\) return ""/);
  assert.match(source, /\$\{renderGuildTokenCreditPlanToggle\(\)\}/);
  assert.match(source, /data-role="toggle-guild-token-credit-plan"/);
  assert.match(source, /data-role="toggle-credit-token-mode"/);
  assert.match(source, /data-credit-hrid=/);
  assert.match(source, /mwi-material-exchange-mode/);
  assert.match(source, /data-active="mixed"/);
  assert.match(source, /guildTokenCreditHrids: Array\.from\(state\.guildTokenCreditHrids\)/);
  assert.match(source, /guildTokenCreditConversions: GUILD_TOKEN_CREDIT_CONVERSIONS/);
  assert.match(source, /guildTokenCreditPlanSummary/);
  assert.match(source, /function clearGuildUpgradePlans\(\)/);
  assert.match(source, /state\.suppressUpgradePlanAutofill = true/);
  assert.match(source, /clearGuildUpgradePlans\(\);\s*persistPluginUiState\(\);\s*refreshGuildUpgrade\(panel\);/);
  assert.match(source, /function removeGuildUpgradePlan\(planId\)/);
  assert.match(source, /const removedLastPlan = state\.upgradePlans\.length === 0/);
  assert.match(source, /state\.suppressUpgradePlanAutofill = removedLastPlan/);
  assert.match(source, /if \(!removeGuildUpgradePlan\(row\.dataset\.planId\)\) return/);
  assert.match(source, /data-role="plan-start"/);
  assert.match(source, /data-role="plan-target"/);
  assert.match(source, /\.mwi-upgrade-plan label\.mwi-upgrade-plan-shrine\{grid-column:1;grid-row:1\}/);
  assert.match(source, /\.mwi-upgrade-plan select\{width:100%!important/);
  assert.match(source, /function updateRenderedMarkup\(element, markup, propertyName\)/);
  assert.match(source, /updateRenderedMarkup\(list, columnHeaders \+ plansMarkup\)/);
  assert.doesNotMatch(source, /mwi-upgrade-plan-index|mwi-route-arrive|mwi-upgrade-plan-list::before/);
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
  assert.match(source, /setGuildLifeTarget/);
  assert.match(source, /setGuildCombatTarget/);
  assert.match(source, /data-role="set-guild-shrine-target"/);
  assert.match(source, /mwi-upgrade-preset/);
  assert.match(source, /data-role="toggle-shrine-guide"/);
  assert.match(source, /data-role="shrine-guide-route"/);
  assert.match(source, /shrineGuideApi\.deriveShrineGuide/);
  assert.match(source, /data-mwi-shrine-guide/);
  assert.match(source, /SHRINE_GUIDE_QUANTITY_HINT_ID/);
  assert.match(source, /function updateShrineGuideQuantityHint/);
  assert.match(source, /guideQuantityLabel/);
  assert.match(source, /data-role="quantity-hint-number"/);
  assert.doesNotMatch(source, /data-role="quantity-hint-unit"/);
  assert.match(source, /detailNode\.hidden = !detail/);
  assert.match(source, /guideQuantityRemaining/);
  assert.match(source, /guideQuantityCurrentExchange/);
  assert.match(source, /function shrineGuideQuantityRow/);
  assert.match(source, /quantityRow\.insertAdjacentElement\("afterend", hint\)/);
  assert.match(source, /function shrineGuideQuantityInputIsTopmost/);
  assert.match(source, /document\.elementFromPoint\(x, y\)/);
  assert.doesNotMatch(source, /document\.body\.append\(hint\)/);
  assert.doesNotMatch(source, /SHRINE_GUIDE_QUANTITY_HINT_ID\}\{[^}]*position:fixed/);
  assert.doesNotMatch(source, /quantity-hint-title/);
  assert.match(source, /maxBatches: Number\.isSafeInteger\(maxBatches\)/);
  assert.match(source, /mutation\.removedNodes/);
  assert.match(source, /prefers-reduced-motion:\s*reduce/);
  assert.match(source, /input\[data-mwi-shrine-guide="active"\]\{animation:none/);
  assert.match(source, /bridge\.onGuildBuffLevelsUpdated = hydrateBridgeData/);
  assert.match(source, /scheduleGuildDataRefresh\(\)/);
  assert.match(source, /container-type:inline-size/);
  assert.match(source, /@container \(max-width:650px\)/);
  assert.match(source, /@container \(max-width:520px\)/);
  assert.match(source, /@container \(max-width:400px\)/);
  assert.match(source, /mwi-upgrade-plan-columns/);
  assert.doesNotMatch(source, /font-family:ui-monospace/);
  assert.match(source, /function marketItemIconMarkup/);
  assert.match(source, /function openMarketplaceForItem/);
  assert.match(source, /bridge\.goToMarketplace\(itemHrid, 0\)/);
  assert.match(source, /function openMarketplaceFallback/);
  assert.match(bridgeSource, /bridge\.goToMarketplace = function/);
  assert.match(source, /FALLBACK_INSTALL_URL/);
  assert.match(source, /fallbackInstaller/);
  assert.match(source, /#mwi-credit-optimizer\{[^}]*background:transparent/);
  assert.match(source, /data-role="market-item-link"/);
  assert.match(source, /marketItem/);
  assert.match(source, /stored\.level \?\? stored\.currentLevel/);
  assert.match(source, /unknownCurrentLevels/);
  assert.doesNotMatch(source, /正在读取当前神龛等级，请稍后重新打开此页/);
  assert.match(source, /aggregateGuildBuffPlans/);
  assert.match(source, /estimateGuildUpgradeCosts/);
  assert.match(source, /characterItems/);
  assert.match(source, /afterInventory/);
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
  assert.match(source, /exchangeRecommendation/);
  assert.match(source, /chooseItem/);
  assert.match(source, /\[hidden\]\{display:none!important\}/);
  assert.match(source, /options\.single/);
  assert.match(source, /core\.rankConversions\(conversions, books, targetCredits\)/);
  assert.doesNotMatch(source, /data-role="item-query-/);
  assert.doesNotMatch(source, /core\.analyzeItemConversion\(/);
  assert.match(source, /DEFAULT_PANEL_ORDER: \["upgrade", "credit", "construction"\]/);
  assert.match(source, /function bestCreditMaterialPlans\(estimate\)/);
  assert.match(source, /row\.remainingMissing \?\? row\.missing/);
  assert.match(source, /data-role="guild-token-budget-range"/);
  assert.match(source, /data-role="guild-token-budget-number"/);
  assert.match(source, /data-role="guild-token-budget-percent"/);
  assert.match(source, /GUILD_TOKEN_BUDGET_SNAP_PERCENTAGES: \[20, 40, 50, 60, 80, 100\]/);
  assert.match(source, /guildTokenBudgetRange\.dataset\.dragging === "true"/);
  assert.match(source, /snapGuildTokenBudget/);
  assert.match(source, /autoGuildTokenBudget: state\.autoGuildTokenBudget/);
  assert.match(source, /autoAllocateSurplusGuildTokens: hasInventory/);
  assert.match(source, /mwi-material-plan-auto/);
  assert.match(source, /marketItemIconMarkup\(plan\.itemHrid/);
  assert.match(source, /materialInventory\[plan\.itemHrid\]/);
  assert.match(source, /backpackInventory/);
  assert.match(source, /mwi-material-required/);
  assert.match(source, /mwi-material-plan-item/);
  assert.match(source, /mwi-material-plan-icon/);
  assert.match(source, /mwi-material-row-token/);
  assert.doesNotMatch(source, /mwi-material-row-token\{grid-column:1\/-1/);
  assert.doesNotMatch(source, /@container \(max-width:760px\)/);
  assert.doesNotMatch(source, /@media \(max-width:720px\)/);
  assert.doesNotMatch(source, /\.mwi-material-list\{display:grid;grid-template-columns:repeat\(2/);
  assert.match(
    source,
    /\.mwi-material-plans\{grid-column:4;display:grid;grid-template-columns:repeat\(auto-fit,minmax\(140px,1fr\)\)/
  );
  assert.doesNotMatch(source, /@container \(max-width:460px\)/);
  assert.match(source, /costSummary/);
  assert.match(source, /plan\.requiredItems/);
  assert.match(source, /core\.estimateSaleReplacement/);
  assert.match(source, /SELLER_TAX_RATE: 0\.02/);
  assert.match(source, /sellAndBuyMore/);
  assert.match(source, /noSellPrice/);
  assert.doesNotMatch(source, /if \(replacement\.status !== "ok"\) \{\s*hideGuildExchangeAdvisor\(\);/);
  assert.match(source, /watchGuildExchangeModals/);
  assert.match(source, /observeActiveGuildExchangeModal/);
  assert.match(source, /exchangeAdvisorRootObserver/);
  assert.match(source, /exchangeAdvisorModalObserver/);
  assert.match(source, /state\.exchangeAdvisorUi && state\.exchangeAdvisorUi\.modal/);
  assert.match(source, /style\.display !== "none"/);
  assert.match(source, /style\.pointerEvents !== "none"/);
  assert.match(source, /opacity > 0\.01/);
  assert.match(source, /attributeFilter: \["aria-hidden", "class", "hidden", "style"\]/);
  assert.doesNotMatch(source, /characterData: true/);
  assert.match(source, /window\.requestAnimationFrame/);
  assert.match(source, /schedulerApi\.createFrameTask/);
  assert.match(source, /merge: \(current, next\) => Boolean\(current \|\| next\)/);
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
  assert.match(source, /alreadyOptimal/);
  assert.match(source, /option\.best/);
  assert.match(source, /t\("author"\)/);
  assert.match(source, /t\("support"\)/);
  assert.match(source, /updateLink\.textContent = t\("updateNow"\)/);
  assert.match(source, /status\.append\(" · ", updateLink\)/);
  assert.doesNotMatch(source, /点击下方链接更新/);
  assert.doesNotMatch(source, /<footer class="mwi-plugin-footer">作者：柆雨<br>有问题请加群反馈：437320340<br>/);
  assert.match(source, /updateChecking/);
  assert.match(source, /updateLatest/);
  assert.match(source, /mwi-update-available/);
  assert.match(source, /raw\.githubusercontent\.com\/LaYuDr\/milky-way-idle-guild-credit-optimizer/);
  assert.match(source, /UPDATE_CHECK_TIMEOUT_MS: 8000/);
  assert.match(source, /updateChecker\.latestVersion\(\)/);
  assert.match(source, /releaseInfoApi\.createVersionChecker/);
  assert.match(buildSource, /@author       柆雨/);
  assert.match(buildSource, /@license      MIT/);
  assert.match(buildSource, /@grant        GM_addElement/);
  assert.match(buildSource, /@grant        unsafeWindow/);
  assert.match(buildSource, /@sandbox      raw/);
  assert.match(buildSource, /@homepageURL  https:\/\/github\.com\/LaYuDr\/milky-way-idle-guild-credit-optimizer/);
  assert.match(buildSource, /公会信用点兑换与神龛升级的只读计算辅助/);
  assert.match(buildSource, /不会上传账号数据/);
  assert.match(buildSource, /MWI_GUILD_CREDIT_RUNTIME/);
  assert.match(buildSource, /window\.MwiGuildCreditVersion/);
  assert.match(buildSource, /"src\/market-dom\.js"/);
  assert.match(buildSource, /"src\/bridge\.js"/);
  assert.match(buildSource, /"src\/market-data\.js"/);
  assert.match(buildSource, /"src\/release-info\.js"/);
  assert.match(bridgeSource, /ObservedWebSocket/);
  assert.match(bridgeSource, /market_item_order_books_updated/);
  assert.match(bridgeSource, /characterGuildBuffDict/);
  assert.doesNotMatch(source, /mwi-credit-tab-active/);
  assert.doesNotMatch(source, /upgrade-refresh/);
  assert.doesNotMatch(source, /get_market_item_order_books/);
  assert.doesNotMatch(source, /window\.WebSocket/);
  assert.doesNotMatch(buildSource, /@downloadURL|@updateURL/);
  assert.match(buildSource, /@match        https:\/\/www\.milkywayidle\.com\/\*/);
  assert.match(buildSource, /@match        https:\/\/www\.milkywayidlecn\.com\/\*/);
});
