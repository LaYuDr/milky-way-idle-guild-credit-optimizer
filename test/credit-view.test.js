"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../src/core.js");
const { createCreditView } = require("../src/ui/credit-view.js");

function fixture() {
  const node = () => ({
    innerHTML: "",
    isConnected: true,
    hidden: false,
    contains: () => false,
    replaceChildren() {
      this.innerHTML = "";
    }
  });
  const nodes = {
    status: node(),
    results: node(),
    refresh: node(),
    target: { value: 100 },
    "upgrade-token-values": node()
  };
  const panel = { querySelector: (selector) => nodes[/data-role="([^"]+)"/.exec(selector)?.[1]] };
  const credit = "/items/green_guild_credit";
  const conversions = [{ itemHrid: "/items/beast_hide", creditItemHrid: credit, itemCount: 1, creditCount: 1 }];
  const state = {
    collapsedCreditSections: new Set(),
    guildTokenValuesCollapsed: false,
    guildTokenValuesUpgradeCollapsed: true,
    refreshQueued: false
  };
  let price = 5;
  let missing = false;
  const view = createCreditView({
    core,
    state,
    window: { document: { activeElement: null } },
    t: (key, values) => key + (values ? JSON.stringify(values) : ""),
    escapeHtml: String,
    formatNumber: String,
    iconMarkup: () => "",
    marketItemIconMarkup: () => "",
    itemNameForMaterial: String,
    creditQuantity: String,
    itemQuantity: String,
    GUILD_TOKEN_CREDIT_CONVERSIONS: [{ creditItemHrid: credit, guildTokenCount: 1, creditCount: 10 }],
    loadSnapshot: async () => {
      if (missing) throw new Error("offline");
    },
    creditConversionGroups: () => [{ creditItemHrid: credit, color: "#fff", conversions }],
    snapshotOrderBook: () => (missing ? null : { asks: [{ price, quantity: 10000 }] }),
    refreshOfficialItemNameCatalog() {},
    updateRenderedMarkup: (element, markup) => {
      element.innerHTML = markup;
      return true;
    }
  });
  return {
    view,
    state,
    panel,
    nodes,
    setPrice: (value) => {
      price = value;
    },
    unavailable: () => {
      missing = true;
    }
  };
}

test("原表与神龛页副本共用价格计算并保留独立折叠状态", async () => {
  const f = fixture();
  await f.view.refreshPanel(f.panel);
  await f.view.refreshGuildTokenValuesCopy(f.panel);
  const original = () => f.nodes.results.innerHTML.split('<div class="mwi-credit-grid">')[0];
  const copy = () => f.nodes["upgrade-token-values"].innerHTML;
  assert.match(original(), /data-token-values-context="credit" data-collapsed="false"/);
  assert.match(copy(), /data-token-values-context="upgrade" data-collapsed="true"/);
  assert.match(original(), />50 gold</);
  assert.match(copy(), />50 gold</);
  f.setPrice(8);
  await f.view.refreshPanel(f.panel);
  await f.view.refreshGuildTokenValuesCopy(f.panel);
  assert.match(original(), />80 gold</);
  assert.match(copy(), />80 gold</);
  assert.equal(f.state.guildTokenValuesCollapsed, false);
  assert.equal(f.state.guildTokenValuesUpgradeCollapsed, true);
});

test("副本在无行情时保留原表和未定价状态，不伪造零价值", async () => {
  const f = fixture();
  await f.view.refreshPanel(f.panel);
  const original = f.nodes.results.innerHTML;
  f.unavailable();
  await f.view.refreshGuildTokenValuesCopy(f.panel);
  assert.equal(f.nodes.results.innerHTML, original);
  assert.match(f.nodes["upgrade-token-values"].innerHTML, /noMarketValue/);
  assert.match(f.nodes["upgrade-token-values"].innerHTML, /snapshotFailed/);
  assert.doesNotMatch(f.nodes["upgrade-token-values"].innerHTML, />0 gold</);
});
