"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const gameStateApi = require("../src/runtime/game-state.js");

function createState() {
  return {
    itemDetails: null,
    conversionCache: new Map([["cached", true]]),
    guildBuffDetails: null,
    guildBuffLevels: null,
    guildShrineLevels: null,
    guildShrineDetails: null,
    guildBuildingLevels: null,
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
