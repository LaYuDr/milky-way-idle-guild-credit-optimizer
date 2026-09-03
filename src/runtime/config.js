(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MwiGuildCreditConfig = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const CREDIT_TYPES = [
    ["/items/green_guild_credit", "#42c59f"],
    ["/items/brown_guild_credit", "#c58a42"],
    ["/items/white_guild_credit", "#e8e9ef"],
    ["/items/blue_guild_credit", "#4c99e8"],
    ["/items/purple_guild_credit", "#9567da"],
    ["/items/red_guild_credit", "#df4c5a"],
    ["/items/silver_guild_credit", "#c4cad5"],
    ["/items/gold_guild_credit", "#d8a33c"]
  ];

  const GUILD_TOKEN_CREDIT_CONVERSIONS = [
    { creditItemHrid: "/items/green_guild_credit", guildTokenCount: 1, creditCount: 10 },
    { creditItemHrid: "/items/brown_guild_credit", guildTokenCount: 1, creditCount: 10 },
    { creditItemHrid: "/items/white_guild_credit", guildTokenCount: 1, creditCount: 10 },
    { creditItemHrid: "/items/blue_guild_credit", guildTokenCount: 1, creditCount: 10 },
    { creditItemHrid: "/items/purple_guild_credit", guildTokenCount: 1, creditCount: 1 },
    { creditItemHrid: "/items/red_guild_credit", guildTokenCount: 1, creditCount: 1 },
    { creditItemHrid: "/items/silver_guild_credit", guildTokenCount: 10, creditCount: 1 },
    { creditItemHrid: "/items/gold_guild_credit", guildTokenCount: 60, creditCount: 1 }
  ];
  const UPDATE_SCRIPT_URL =
    "https://raw.githubusercontent.com/LaYuDr/milky-way-idle-guild-credit-optimizer/main/dist/milky-way-idle-guild-credit-optimizer.user.js";
  const FALLBACK_UPDATE_SCRIPT_URL =
    "https://js.nainai.eu.org/proxy/https://update.greasyfork.org/scripts/586873/%E9%93%B6%E6%B2%B3%E5%A5%B6%E7%89%9B%E5%85%AC%E4%BC%9A%E4%BF%A1%E7%94%A8%E7%82%B9%E6%80%A7%E4%BB%B7%E6%AF%94.user.js";
  const FALLBACK_INSTALL_URL =
    "https://www.tampermonkey.net/script_installation.php#url=https://js.nainai.eu.org/proxy/https://update.greasyfork.org/scripts/586873/%E9%93%B6%E6%B2%B3%E5%A5%B6%E7%89%9B%E5%85%AC%E4%BC%9A%E4%BF%A1%E7%94%A8%E7%82%B9%E6%80%A7%E4%BB%B7%E6%AF%94.user.js";

  return {
    UPDATE_SOURCES: [
      { url: UPDATE_SCRIPT_URL, installUrl: UPDATE_SCRIPT_URL },
      { url: FALLBACK_UPDATE_SCRIPT_URL, installUrl: FALLBACK_INSTALL_URL }
    ],
    FALLBACK_INSTALL_URL,
    PRICE_REFERENCE_STORAGE_KEY: "mwi-credit-price-reference",
    UI_STATE_STORAGE_KEY: "mwi-guild-credit-ui-state-v1",
    SIDEBAR_TAB_ORDER_STORAGE_KEY: "mwi-sidebar-tab-order-v1",
    GUILD_BUILDING_PLAN_STORAGE_PREFIX: "mwi-guild-building-planner-v1",
    MARKET_LIVE_STORAGE_KEY: "mwi-guild-credit-live-market-v1",
    MARKETPLACE_SNAPSHOT_STORAGE_KEY: "mwi-guild-credit-market-snapshot-v1",
    MARKETPLACE_REQUEST_STATE_STORAGE_KEY: "mwi-guild-credit-market-request-v1",
    MARKETPLACE_SNAPSHOT_PATH: "/game_data/marketplace.json",
    MARKETPLACE_SNAPSHOT_ORIGINS: [
      "https://www.milkywayidle.com",
      "https://www.milkywayidlecn.com",
      "https://q7.nainai.eu.org"
    ],
    MARKETPLACE_SNAPSHOT_MAX_AGE_MS: 15 * 60 * 1000,
    MARKETPLACE_SNAPSHOT_REFRESH_COOLDOWN_MS: 60 * 1000,
    MARKETPLACE_SNAPSHOT_FORBIDDEN_BACKOFF_MS: 10 * 60 * 1000,
    UPDATE_CHECK_TIMEOUT_MS: 8000,
    SHOW_ALL_CREDIT_TOKEN_TOGGLE: false,
    PRICE_REFERENCES: { a: {}, b: {} },
    GUILD_TOKEN_BUDGET_SNAP_PERCENTAGES: [20, 40, 50, 60, 80, 100],
    GUILD_TOKEN_BUDGET_SNAP_THRESHOLD_PERCENTAGE: 2.5,
    RENDERED_MARKUP_PROPERTY: "__mwiGuildCreditRenderedMarkup",
    PANEL_VIEWS: ["credit", "upgrade", "construction"],
    DEFAULT_PANEL_ORDER: ["upgrade", "credit", "construction"],
    CREDIT_TYPES,
    GUILD_TOKEN_CREDIT_CONVERSIONS,
    SELLER_TAX_RATE: 0.05,
    GUILD_SHRINE_NAME_KEYS: {
      "/guild_shrines/force": "shrineForce",
      "/guild_shrines/tempo": "shrineTempo",
      "/guild_shrines/spirit": "shrineSpirit",
      "/guild_shrines/rarity": "shrineRarity",
      "/guild_shrines/scholar": "shrineScholar"
    }
  };
});
