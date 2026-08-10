"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const gameStateApi = require("../src/runtime/game-state.js");
const gameDataApi = require("../src/runtime/game-data.js");

function createState() {
  return {
    itemDetails: null,
    conversionCache: new Map([["cached", true]]),
    guildBuffDetails: null,
    guildBuffLevels: null,
    guildShrineLevels: null,
    guildShrineDetails: null,
    guildBuildingLevels: null,
    guildBuildingLevelsComplete: false,
    guildBuildingDetails: null,
    characterItems: null
  };
}

test("物品详情变化会清空计算缓存且拒绝空候选", () => {
  const state = createState();
  const adapter = gameStateApi.createGameStateAdapter(state);
  assert.equal(adapter.setItemDetails(null), false);
  assert.equal(state.conversionCache.size, 1);
  const details = { item: {} };
  assert.equal(adapter.setItemDetails(details), true);
  assert.equal(state.itemDetails, details);
  assert.equal(state.conversionCache.size, 0);
});

test("分帧神龛与建筑等级按稳定 HRID 合并", () => {
  const state = createState();
  const adapter = gameStateApi.createGameStateAdapter(state);
  adapter.setGuildShrineLevels([{ guildShrineHrid: "/guild_shrines/force", level: 1 }]);
  adapter.setGuildShrineLevels({ tempo: { guildShrineHrid: "/guild_shrines/tempo", level: 2 } });
  assert.equal(state.guildShrineLevels["/guild_shrines/force"].level, 1);
  assert.equal(state.guildShrineLevels["/guild_shrines/tempo"].level, 2);
});

test("普通建筑等级分帧只合并记录，不会误标为完整快照", () => {
  const state = createState();
  const adapter = gameStateApi.createGameStateAdapter(state);
  assert.equal(adapter.setGuildBuildingLevels([{ guildBuildingHrid: "/guild_buildings/guild_hall", level: 4 }]), true);
  assert.equal(
    adapter.setGuildBuildingLevelsFrom({
      guildBuildingLevelMap: {
        gym: { guildBuildingHrid: "/guild_buildings/gym", level: 2 }
      }
    }),
    true
  );
  assert.equal(state.guildBuildingLevelsComplete, false);
  assert.equal(state.guildBuildingLevels["/guild_buildings/guild_hall"].level, 4);
  assert.equal(state.guildBuildingLevels["/guild_buildings/gym"].level, 2);
});

test("完整建筑等级初始化以当前会话记录为准，并补齐其余初始化记录", () => {
  const state = createState();
  const adapter = gameStateApi.createGameStateAdapter(state);
  adapter.setGuildBuildingLevels([{ guildBuildingHrid: "/guild_buildings/guild_hall", level: 4 }]);

  assert.equal(
    adapter.seedCompleteGuildBuildingLevelsFrom({
      guildBuildingLevelMap: {
        hall: { guildBuildingHrid: "/guild_buildings/guild_hall", level: 1 },
        gym: { guildBuildingHrid: "/guild_buildings/gym", level: 2 }
      }
    }),
    true
  );
  assert.equal(state.guildBuildingLevelsComplete, true);
  assert.equal(state.guildBuildingLevels["/guild_buildings/guild_hall"].level, 4);
  assert.equal(state.guildBuildingLevels["/guild_buildings/gym"].level, 2);
});

test("完整建筑等级初始化接受空集合，但字段缺失不会误标完整", () => {
  const emptyState = createState();
  const emptyAdapter = gameStateApi.createGameStateAdapter(emptyState);
  assert.equal(emptyAdapter.seedCompleteGuildBuildingLevelsFrom({ guildBuildingLevelMap: {} }), true);
  assert.equal(emptyState.guildBuildingLevelsComplete, true);
  assert.deepEqual({ ...emptyState.guildBuildingLevels }, {});

  const missingState = createState();
  const missingAdapter = gameStateApi.createGameStateAdapter(missingState);
  assert.equal(missingAdapter.seedCompleteGuildBuildingLevelsFrom({ guildBuildingDetailMap: {} }), false);
  assert.equal(missingState.guildBuildingLevelsComplete, false);
  assert.equal(missingState.guildBuildingLevels, null);
});

test("本地初始化原始 JSON 会补全局部建筑帧并保留当前会话等级", () => {
  const state = createState();
  const adapter = gameStateApi.createGameStateAdapter(state);
  adapter.setGuildBuildingLevels([{ guildBuildingHrid: "/guild_buildings/guild_hall", level: 4 }]);
  const raw = JSON.stringify({
    guildBuildingMap: {
      hall: { guildBuildingHrid: "/guild_buildings/guild_hall", level: 1 },
      gym: { guildBuildingHrid: "/guild_buildings/gym", level: 2 }
    }
  });
  const gameData = gameDataApi.createGameData({
    state,
    pageWindow: { localStorage: { getItem: (key) => (key === "initClientData" ? raw : null) } },
    document: {},
    marketDataApi: {},
    core: {},
    ...adapter,
    persistLiveMarketData() {},
    scheduleMarketDataRefresh() {},
    scheduleInventoryDataRefresh() {},
    scheduleGuildDataRefresh() {},
    t: (key) => key,
    resolveItemName: () => "",
    CREDIT_TYPES: []
  });

  assert.equal(gameData.hydrateLocalInitData(), true);
  assert.equal(state.guildBuildingLevelsComplete, true);
  assert.equal(state.guildBuildingLevels["/guild_buildings/guild_hall"].level, 4);
  assert.equal(state.guildBuildingLevels["/guild_buildings/gym"].level, 2);
});

test("兼容游戏消息中的公会状态字段别名", () => {
  const state = createState();
  const adapter = gameStateApi.createGameStateAdapter(state);
  assert.equal(adapter.setGuildBuffLevelsFrom({ characterGuildBuffDict: { force: 3 } }), true);
  assert.deepEqual(state.guildBuffLevels, { force: 3 });
  assert.equal(
    adapter.setGuildBuildingDetailsFrom({ guildBuildingDetailMap: { hall: { hrid: "/guild_buildings/hall" } } }),
    true
  );
  assert.equal(state.guildBuildingDetails["/guild_buildings/hall"].hrid, "/guild_buildings/hall");
});
