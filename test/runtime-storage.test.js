"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const config = require("../src/runtime/config.js");
const storageApi = require("../src/runtime/storage.js");
const buildingDataApi = require("../src/guild-building-data.js");
const marketDataApi = require("../src/market-data.js");

function memoryStorage(seed = {}) {
  const values = new Map(Object.entries(seed));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
    value(key) {
      return values.get(key);
    }
  };
}

function createStorage(storage) {
  return storageApi.createPluginStorage({
    storage,
    location: { href: "https://www.milkywayidle.com/game?characterId=hero-7", hostname: "www.milkywayidle.com" },
    config,
    buildingDataApi,
    marketDataApi
  });
}

test("损坏的 UI 状态安全回退且旧版全选字段可迁移", () => {
  const broken = createStorage(memoryStorage({ [config.UI_STATE_STORAGE_KEY]: "{" }));
  assert.deepEqual(broken.loadSavedPluginUiState(), {
    collapsedCreditSections: [],
    guildTokenValuesCollapsed: false,
    guildTokenCreditHrids: [],
    autoGuildTokenBudget: null,
    shrineGuideEnabled: false,
    excludeUltraHighPriceItems: false,
    guildShrineAutofillExcludedBuffHrids: [],
    showConstructionView: true,
    activeView: "credit",
    panelOrder: ["upgrade", "credit", "construction"],
    targetCredit: 1,
    upgradePlans: []
  });

  const migrated = createStorage(
    memoryStorage({
      [config.UI_STATE_STORAGE_KEY]: JSON.stringify({
        useGuildTokensForMissingCredits: true,
        activeView: "construction",
        targetCredit: 200
      })
    })
  ).loadSavedPluginUiState();
  assert.equal(migrated.guildTokenCreditHrids.length, 8);
  assert.equal(migrated.activeView, "construction");
  assert.deepEqual(migrated.panelOrder, ["upgrade", "credit", "construction"]);
  assert.equal(migrated.targetCredit, 200);
  assert.deepEqual(migrated.guildShrineAutofillExcludedBuffHrids, []);
  assert.equal(migrated.showConstructionView, true);
  assert.equal(migrated.excludeUltraHighPriceItems, false);
});

test("超高价格物品筛选迁移旧字段且只在明确启用时持久化", () => {
  for (const excludeUltraHighPriceItems of [undefined, null, 0, "true", false]) {
    const loaded = createStorage(
      memoryStorage({ [config.UI_STATE_STORAGE_KEY]: JSON.stringify({ excludeUltraHighPriceItems }) })
    ).loadSavedPluginUiState();
    assert.equal(loaded.excludeUltraHighPriceItems, false);
  }
  const loaded = createStorage(
    memoryStorage({ [config.UI_STATE_STORAGE_KEY]: JSON.stringify({ excludeUltraHighPriceItems: true }) })
  ).loadSavedPluginUiState();
  assert.equal(loaded.excludeUltraHighPriceItems, true);
  const migrated = createStorage(
    memoryStorage({ [config.UI_STATE_STORAGE_KEY]: JSON.stringify({ excludeSageItems: true }) })
  ).loadSavedPluginUiState();
  assert.equal(migrated.excludeUltraHighPriceItems, true);
});

test("神龛填充排除项只保留合法 HRID 并与建设页可见性持久化", () => {
  const storage = memoryStorage({
    [config.UI_STATE_STORAGE_KEY]: JSON.stringify({
      guildShrineAutofillExcludedBuffHrids: [
        "/guild_buffs/spirit_life",
        "/guild_buffs/spirit_life",
        "/guild_buffs/combat/path-2.valid",
        "/items/not_a_guild_buff",
        "/guild_buffs/contains space",
        42
      ],
      showConstructionView: false
    })
  });
  const pluginStorage = createStorage(storage);
  const loaded = pluginStorage.loadSavedPluginUiState();
  assert.deepEqual(loaded.guildShrineAutofillExcludedBuffHrids, [
    "/guild_buffs/spirit_life",
    "/guild_buffs/combat/path-2.valid"
  ]);
  assert.equal(loaded.showConstructionView, false);

  loaded.guildShrineAutofillExcludedBuffHrids = new Set([
    "/guild_buffs/force_combat",
    "/guild_buffs/force_combat",
    "invalid"
  ]);
  loaded.showConstructionView = false;
  assert.equal(
    pluginStorage.persistPluginUiState({
      ...loaded,
      collapsedCreditSections: new Set(),
      guildTokenCreditHrids: new Set()
    }),
    true
  );
  const persisted = JSON.parse(storage.value(config.UI_STATE_STORAGE_KEY));
  assert.deepEqual(persisted.guildShrineAutofillExcludedBuffHrids, ["/guild_buffs/force_combat"]);
  assert.equal(persisted.showConstructionView, false);
});

test("建设页可见性仅在明确为 false 时关闭", () => {
  for (const showConstructionView of [undefined, null, 0, "false", true]) {
    const loaded = createStorage(
      memoryStorage({ [config.UI_STATE_STORAGE_KEY]: JSON.stringify({ showConstructionView }) })
    ).loadSavedPluginUiState();
    assert.equal(loaded.showConstructionView, true);
  }
});

test("页签顺序忽略重复和未知项并在保存时补齐缺项", () => {
  const storage = memoryStorage({
    [config.UI_STATE_STORAGE_KEY]: JSON.stringify({
      activeView: "construction",
      panelOrder: ["construction", "construction", "unknown", "upgrade"]
    })
  });
  const pluginStorage = createStorage(storage);
  const loaded = pluginStorage.loadSavedPluginUiState();
  assert.equal(loaded.activeView, "construction");
  assert.deepEqual(loaded.panelOrder, ["construction", "upgrade", "credit"]);

  pluginStorage.persistPluginUiState({
    ...loaded,
    panelOrder: ["credit"],
    collapsedCreditSections: new Set(),
    guildTokenCreditHrids: new Set()
  });
  assert.deepEqual(JSON.parse(storage.value(config.UI_STATE_STORAGE_KEY)).panelOrder, [
    "credit",
    "upgrade",
    "construction"
  ]);
});

test("公会建设计划按站点和角色隔离并过滤非法等级", () => {
  const storage = memoryStorage();
  const pluginStorage = createStorage(storage);
  const key = "mwi-guild-building-planner-v1:www.milkywayidle.com:hero-7";
  storage.setItem(
    key,
    JSON.stringify({
      manualGuildPoints: 5000,
      category: "life",
      plans: [
        { buildingHrid: "/guild_buildings/guild_hall", startLevel: 1, targetLevel: 3 },
        { buildingHrid: "/guild_buildings/guild_hall", startLevel: 3, targetLevel: 2 }
      ]
    })
  );
  assert.deepEqual(pluginStorage.loadSavedGuildBuildingPlannerState(), {
    plans: [{ buildingHrid: "/guild_buildings/guild_hall", startLevel: 1, targetLevel: 3 }],
    manualGuildPoints: 5000,
    category: "life"
  });
});

test("UI 与市场缓存持久化只写既有键并保留缓存修订", () => {
  const storage = memoryStorage();
  const pluginStorage = createStorage(storage);
  pluginStorage.persistPluginUiState({
    collapsedCreditSections: new Set(["/items/green_guild_credit"]),
    guildTokenValuesCollapsed: true,
    guildTokenCreditHrids: new Set(["/items/green_guild_credit"]),
    autoGuildTokenBudget: 10,
    shrineGuideEnabled: true,
    excludeUltraHighPriceItems: true,
    guildShrineAutofillExcludedBuffHrids: [],
    showConstructionView: true,
    activeView: "upgrade",
    panelOrder: ["construction", "upgrade", "credit"],
    targetCredit: 100,
    upgradePlans: [{ guildBuffHrid: "/guild_buffs/force", startLevel: 1, targetLevel: 2 }]
  });
  const ui = JSON.parse(storage.value(config.UI_STATE_STORAGE_KEY));
  assert.equal(ui.activeView, "upgrade");
  assert.deepEqual(ui.panelOrder, ["construction", "upgrade", "credit"]);
  assert.deepEqual(ui.guildTokenCreditHrids, ["/items/green_guild_credit"]);
  assert.deepEqual(ui.guildShrineAutofillExcludedBuffHrids, []);
  assert.equal(ui.showConstructionView, true);
  assert.equal(ui.excludeUltraHighPriceItems, true);
  assert.equal(Object.prototype.hasOwnProperty.call(ui, "excludeSageItems"), false);

  const liveData = Object.create(null);
  marketDataApi.applyLiveMarketUpdate(
    liveData,
    { itemHrid: "/items/beast_hide", levels: { 0: { a: 42, b: 40 } } },
    { revision: 7, receivedAt: 1000 }
  );
  pluginStorage.persistLiveMarketData(liveData, 7);
  const restored = pluginStorage.loadSavedLiveMarketData();
  assert.equal(restored.valid, true);
  assert.equal(restored.revision, 7);
  assert.equal(restored.liveData["/items/beast_hide"].levels["0"].a, 42);
});

test("UI 持久化会返回写入成功或失败", () => {
  const state = {
    collapsedCreditSections: new Set(),
    guildTokenValuesCollapsed: false,
    guildTokenCreditHrids: new Set(),
    autoGuildTokenBudget: null,
    shrineGuideEnabled: false,
    excludeUltraHighPriceItems: false,
    guildShrineAutofillExcludedBuffHrids: [],
    showConstructionView: true,
    activeView: "credit",
    panelOrder: ["upgrade", "credit", "construction"],
    targetCredit: 1,
    upgradePlans: []
  };
  assert.equal(createStorage(memoryStorage()).persistPluginUiState(state), true);
  assert.equal(createStorage(null).persistPluginUiState(state), false);
  assert.equal(
    createStorage({
      getItem() {
        return null;
      },
      setItem() {
        throw new Error("quota exceeded");
      }
    }).persistPluginUiState(state),
    false
  );
});
