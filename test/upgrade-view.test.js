"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../src/core.js");
const config = require("../src/runtime/config.js");
const upgradeViewApi = require("../src/ui/upgrade-view.js");

function entry(hrid, shrineHrid, isCombat) {
  return {
    hrid,
    maxLevel: 2,
    detail: {
      guildBuffHrid: hrid,
      shrineHrid,
      isCombat,
      levelCosts: [null, {}, {}]
    }
  };
}

function createFixture() {
  const entries = [
    entry("/guild_buffs/tempo_life", "/guild_shrines/tempo", false),
    entry("/guild_buffs/spirit_life", "/guild_shrines/spirit", false),
    entry("/guild_buffs/spirit_combat", "/guild_shrines/spirit", true)
  ];
  const state = {
    guildShrineLevels: {
      "/guild_shrines/tempo": { shrineHrid: "/guild_shrines/tempo", level: 2 },
      "/guild_shrines/spirit": { shrineHrid: "/guild_shrines/spirit", level: 2 }
    },
    guildShrineDetails: null,
    guildBuffLevels: Object.fromEntries(entries.map(({ hrid }) => [hrid, { guildBuffHrid: hrid, level: 0 }])),
    guildShrineAutofillExcludedBuffHrids: new Set(["/guild_buffs/spirit_life"]),
    upgradePlans: [
      { id: "keep-spirit-life", guildBuffHrid: "/guild_buffs/spirit_life", startLevel: 1, targetLevel: 2 },
      { id: "replace-tempo-life", guildBuffHrid: "/guild_buffs/tempo_life", startLevel: 0, targetLevel: 1 },
      { id: "keep-spirit-combat", guildBuffHrid: "/guild_buffs/spirit_combat", startLevel: 0, targetLevel: 1 }
    ],
    nextUpgradePlanId: 10,
    upgradePresetNotice: ""
  };
  const t = (key, values = {}) => `${key}${values.domain ? `:${values.domain}` : ""}`;
  const view = upgradeViewApi.createUpgradeView({
    core,
    state,
    t,
    ui: () => ({ locale: "zh-CN" }),
    escapeHtml: String,
    resolveItemName: String,
    simpleItemName: String,
    titleCase: String,
    formatNumber: String,
    iconMarkup: () => "",
    marketItemIconMarkup: () => "",
    itemQuantity: () => 0,
    creditQuantity: () => 0,
    snapshotOrderBook: () => null,
    allConversions: () => [],
    CREDIT_TYPES: config.CREDIT_TYPES,
    GUILD_TOKEN_CREDIT_CONVERSIONS: config.GUILD_TOKEN_CREDIT_CONVERSIONS,
    GUILD_TOKEN_BUDGET_SNAP_PERCENTAGES: config.GUILD_TOKEN_BUDGET_SNAP_PERCENTAGES,
    GUILD_TOKEN_BUDGET_SNAP_THRESHOLD_PERCENTAGE: config.GUILD_TOKEN_BUDGET_SNAP_THRESHOLD_PERCENTAGE,
    GUILD_SHRINE_NAME_KEYS: config.GUILD_SHRINE_NAME_KEYS,
    SHOW_ALL_CREDIT_TOKEN_TOGGLE: false,
    guildShrineLevelRecordKey: (record, fallback) => (record && record.hrid) || fallback,
    persistPluginUiState() {},
    updateRenderedMarkup() {},
    hydrateBridgeData() {},
    extractItemDetailsFromReact() {},
    hydrateLocalInitData() {},
    loadSnapshot: async () => null,
    refreshOfficialItemNameCatalog() {},
    scheduleShrineGuide() {},
    scheduleGuildExchangeAdvisor() {},
    guildTokenBudgetRefreshTask: { schedule() {} }
  });
  return { entries, state, view };
}

test("一键填充只替换未排除的同域计划并保留排除项与另一领域", () => {
  const { entries, state, view } = createFixture();
  assert.equal(view.applyGuildShrineTargets(entries, "life"), true);
  assert.deepEqual(
    state.upgradePlans.map(({ id, guildBuffHrid, startLevel, targetLevel }) => ({
      id,
      guildBuffHrid,
      startLevel,
      targetLevel
    })),
    [
      {
        id: "keep-spirit-life",
        guildBuffHrid: "/guild_buffs/spirit_life",
        startLevel: 1,
        targetLevel: 2
      },
      {
        id: "keep-spirit-combat",
        guildBuffHrid: "/guild_buffs/spirit_combat",
        startLevel: 0,
        targetLevel: 1
      },
      { id: "plan-10", guildBuffHrid: "/guild_buffs/tempo_life", startLevel: 0, targetLevel: 2 }
    ]
  );
  assert.equal(state.nextUpgradePlanId, 11);
  assert.match(state.upgradePresetNotice, /^guildTargetApplied:/);
});

test("空计划在刷新校验后保持为空且不会隐式添加默认神龛", () => {
  const { entries, state, view } = createFixture();
  state.upgradePlans = [];

  view.ensureGuildUpgradePlans(entries);

  assert.deepEqual(state.upgradePlans, []);
  assert.equal(state.nextUpgradePlanId, 10);
});

test("失效计划被移除后保持空状态，显式添加仍可创建一项", () => {
  const { entries, state, view } = createFixture();
  state.upgradePlans = [{ id: "missing", guildBuffHrid: "/guild_buffs/removed", startLevel: 0, targetLevel: 1 }];

  view.ensureGuildUpgradePlans(entries);
  assert.deepEqual(state.upgradePlans, []);
  assert.equal(view.addGuildUpgradePlan(entries), true);
  assert.equal(state.upgradePlans.length, 1);
  assert.equal(state.upgradePlans[0].id, "plan-10");
});

test("当前领域全部排除时保持计划与编号不变并返回明确状态", () => {
  const { entries, state, view } = createFixture();
  state.guildShrineAutofillExcludedBuffHrids.add("/guild_buffs/tempo_life");
  const previousPlans = state.upgradePlans.map((plan) => ({ ...plan }));
  assert.equal(view.applyGuildShrineTargets(entries, "life"), false);
  assert.deepEqual(state.upgradePlans, previousPlans);
  assert.equal(state.nextUpgradePlanId, 10);
  assert.match(state.upgradePresetNotice, /^guildAutofillAllExcluded:/);
});

test("当前领域全部排除时在可见状态区说明禁用原因", () => {
  const { entries, state, view } = createFixture();
  state.guildShrineAutofillExcludedBuffHrids.add("/guild_buffs/tempo_life");
  const lifeButton = {};
  const combatButton = {};
  const status = {};
  const panel = {
    querySelector(selector) {
      if (selector.includes('data-domain="life"')) return lifeButton;
      if (selector.includes('data-domain="combat"')) return combatButton;
      if (selector.includes("guild-shrine-target-status")) return status;
      return null;
    }
  };

  view.updateGuildShrineTargetActions(panel, entries);

  assert.equal(lifeButton.disabled, true);
  assert.match(lifeButton.title, /^guildAutofillDomainExcluded:/);
  assert.match(status.textContent, /guildAutofillDomainExcluded:domainLife/);
  assert.equal(combatButton.disabled, false);
});
