/// ==UserScript==
// @name         MWI Guild Donation Value
// @name:zh      MWI 公会捐献性价比
// @name:zh-CN   MWI 公会捐献性价比
// @namespace    https://www.milkywayidle.com/
// @version      0.7.6
// @license      MIT
// @description  Compare Guild Credit donations, calculate Guild Token exchanges, and plan Shrine Buff upgrades with live market costs.
// @description:zh  比较公会信用捐献性价比、计算公会代币兑换，并按实时行情规划神龛增益升级。
// @description:zh-CN  比较公会信用捐献性价比、计算公会代币兑换，并按实时行情规划神龛增益升级。
// @match        https://www.milkywayidle.com/*
// @match        https://milkywayidle.com/*
// @match        https://www.milkywayidlecn.com/*
// @match        https://milkywayidlecn.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @grant        unsafeWindow
// @run-at       document-start
// @downloadURL https://update.greasyfork.org/scripts/586854/MWI%20Guild%20Donation%20Value.user.js
// @updateURL https://update.greasyfork.org/scripts/586854/MWI%20Guild%20Donation%20Value.meta.js
// ==/UserScript==

(function (root, factory) {
    "use strict";

    const api = factory();
    if (typeof module === "object" && module.exports) {
        module.exports = api;
        return;
    }

    api.bootstrap();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
    "use strict";

    const SCRIPT_ID = "mwi-guild-donation-value";
    const GAME_DATA_STORAGE_KEY = "initClientData";
    const ITEM_NAMES_ZH_CACHE_KEY = "mwi.guildDonation.itemNames.zh.v1";
    const SETTINGS_KEY = "mwi.guildDonation.settings.v1";
    const REMOVED_DATA_CACHE_KEYS = Object.freeze([
        "mwi.guildDonation.catalog.v1",
        "mwi.guildDonation.guildBuffCandidate.v1",
        "mwi.guildDonation.donationCatalog.v1",
        "mwi.guildDonation.shrineCatalog.v1",
        "mwi.guildDonation.market.v1",
        "mwi.guildDonation.market.v2",
    ]);
    const RUNTIME_STATE_KEY = "__mwiGuildDonationValueRuntime";
    const MARKET_REFRESH_COOLDOWN_MS = 30 * 1000;
    const JSON_REQUEST_TIMEOUT_MS = 15 * 1000;
    const DEFAULT_MARKET_TAX_RATE = 0.02;
    const COWBELL_BAG_MARKET_TAX_RATE = 0.18;
    const COWBELL_BAG_ITEM_HRID = "/items/bag_of_10_cowbells";
    const GUILD_TOKEN_ITEM_HRID = "/items/guild_token";
    const DEFAULT_TOKEN_CREDIT_HRID = "/items/green_guild_credit";
    const INITIAL_VISIBLE_ROWS = 60;
    const MORE_VISIBLE_ROWS = 100;
    const DEFAULT_TARGET_CREDIT_AMOUNT = 1000;
    const DEFAULT_SHRINE_FROM_LEVEL = 0;
    const DEFAULT_SHRINE_TO_LEVEL = 1;
    const MAX_SHRINE_LEVEL = 1000;
    const PRICE_MODE_ASK = "ask";
    const PRICE_MODE_BID = "bid";
    const APP_VIEW_DONATION = "donation";
    const APP_VIEW_TOKEN = "token";
    const APP_VIEW_SHRINE = "shrine";
    const OVERVIEW_CREDIT = "overview";
    const LANGUAGE_EN = "en";
    const LANGUAGE_ZH = "zh";
    const PANEL_VIEWPORT_MARGIN = 8;
    const DONATION_ASSISTANT_HOST_ID = `${SCRIPT_ID}-donation-assistant-host`;
    const DONATION_ASSISTANT_VIEWPORT_MARGIN = 8;
    const DONATION_ASSISTANT_GAP = 10;

    const CREDIT_DEFINITIONS = Object.freeze([
        Object.freeze({
            key: "white",
            hrid: "/items/white_guild_credit",
            label: "White",
            labelZh: "白色",
            shortLabel: "W",
            shortLabelZh: "白",
            color: "#e8edf2",
            ink: "#14181d",
        }),
        Object.freeze({
            key: "green",
            hrid: "/items/green_guild_credit",
            label: "Green",
            labelZh: "绿色",
            shortLabel: "G",
            shortLabelZh: "绿",
            color: "#58c981",
            ink: "#0e2217",
        }),
        Object.freeze({
            key: "blue",
            hrid: "/items/blue_guild_credit",
            label: "Blue",
            labelZh: "蓝色",
            shortLabel: "B",
            shortLabelZh: "蓝",
            color: "#55a9e8",
            ink: "#0a1d2c",
        }),
        Object.freeze({
            key: "purple",
            hrid: "/items/purple_guild_credit",
            label: "Purple",
            labelZh: "紫色",
            shortLabel: "P",
            shortLabelZh: "紫",
            color: "#b57ce1",
            ink: "#24112f",
        }),
        Object.freeze({
            key: "red",
            hrid: "/items/red_guild_credit",
            label: "Red",
            labelZh: "红色",
            shortLabel: "R",
            shortLabelZh: "红",
            color: "#e5676d",
            ink: "#2d0d10",
        }),
        Object.freeze({
            key: "brown",
            hrid: "/items/brown_guild_credit",
            label: "Brown",
            labelZh: "棕色",
            shortLabel: "Br",
            shortLabelZh: "棕",
            color: "#b88a67",
            ink: "#28180e",
        }),
        Object.freeze({
            key: "silver",
            hrid: "/items/silver_guild_credit",
            label: "Silver",
            labelZh: "银色",
            shortLabel: "S",
            shortLabelZh: "银",
            color: "#b7c0ca",
            ink: "#161b20",
        }),
        Object.freeze({
            key: "gold",
            hrid: "/items/gold_guild_credit",
            label: "Gold",
            labelZh: "金色",
            shortLabel: "Au",
            shortLabelZh: "金",
            color: "#e8bd55",
            ink: "#2a200a",
        }),
    ]);

    const CREDIT_DEFINITION_BY_HRID = Object.freeze(Object.assign(
        Object.create(null),
        Object.fromEntries(
            CREDIT_DEFINITIONS.map((definition, index) => [definition.hrid, Object.freeze({ ...definition, order: index })]),
        ),
    ));

    const SHRINE_DEFINITIONS = Object.freeze([
        Object.freeze({ key: "force", hrid: "/guild_shrines/force", label: "Shrine of Force", labelZh: "力量神龛", color: "#e5676d" }),
        Object.freeze({ key: "tempo", hrid: "/guild_shrines/tempo", label: "Shrine of Tempo", labelZh: "节奏神龛", color: "#e8bd55" }),
        Object.freeze({ key: "spirit", hrid: "/guild_shrines/spirit", label: "Shrine of Spirit", labelZh: "精神神龛", color: "#63d2bd" }),
        Object.freeze({ key: "rarity", hrid: "/guild_shrines/rarity", label: "Shrine of Rarity", labelZh: "稀有神龛", color: "#b57ce1" }),
        Object.freeze({ key: "scholar", hrid: "/guild_shrines/scholar", label: "Shrine of Scholar", labelZh: "学者神龛", color: "#55a9e8" }),
    ]);

    const SHRINE_DEFINITION_BY_HRID = Object.freeze(Object.assign(
        Object.create(null),
        Object.fromEntries(
            SHRINE_DEFINITIONS.map((definition, index) => [definition.hrid, Object.freeze({ ...definition, order: index })]),
        ),
    ));

    const UI_TEXT = Object.freeze({
        en: Object.freeze({
            unknown: "Unknown",
            launcherTitle: "Open Guild Donation Value",
            panelTitle: "Guild Donation Value",
            dragPanel: "Drag panel",
            waitingData: "Waiting for data",
            refreshData: "Refresh full market data",
            close: "Close",
            language: "Language",
            mainViews: "Planner views",
            donationView: "Donation value",
            tokenView: "Token exchange",
            shrineView: "Shrine upgrade",
            priceBasis: "Market price basis",
            acquirePrice: "Buy price",
            acquirePriceTitle: "Use the lowest eligible sell offer as the price to buy the item",
            liquidationPrice: "Sell price",
            liquidationPriceTitle: "Use each eligible level's highest buy offer after tax, then select the lowest opportunity cost",
            searchPlaceholder: "Search item name or HRID",
            searchAria: "Search donation items",
            unquotedTitle: "Items without a quote on the selected side are excluded from ranking",
            showUnquoted: "Show unquoted",
            enhancedTitle: "Allow +1 and higher market quotes in automatic rankings, recommendations, and estimates",
            includeEnhanced: "Include enhanced",
            creditColors: "Credit colors",
            dataWaiting: "Items: waiting",
            marketWaiting: "Market: waiting",
            catalogNotReady: "Game item data is not available yet. Refresh the game page.",
            catalogReadFailed: "Failed to read game item data.",
            marketRefreshRetained: "Market refresh failed. Showing prices already loaded on this page.",
            marketLoadFailed: "Failed to load market prices. Try again later.",
            marketRefreshCooldown: "Market refresh is available again in {{seconds}}s",
            marketPassivePartial: "Only prices observed from game messages are available. Refresh for the complete market.",
            noMarketTimestamp: "No market timestamp",
            noQuote: "No quote",
            coinsPerCreditTitle: "{{value}} coins / credit",
            creditsPerMillion: "{{value}} credits / 1M coins",
            overviewBestTitle: "Best option for every credit color",
            overview: "Overview",
            creditName: "{{color}} Credit",
            creditTabTitle: "{{color}} Credit · {{count}} conversions",
            donationBatch: "{{items}} {{itemUnit}} -> {{credits}} {{creditUnit}}",
            batchCreditResult: "{{itemUnit}} -> {{credits}} {{creditUnit}}",
            itemUnitOne: "item",
            itemUnitOther: "items",
            creditUnitOne: "credit",
            creditUnitOther: "credits",
            noValidQuote: "No valid quote",
            conversionCount: "{{count}} conversions",
            creditQuotedCount: "{{quoted}}/{{total}} quoted",
            unitPricePerItem: "{{price}} / item",
            creditType: "Credit",
            currentBestItem: "Current best item",
            costPerCredit: "Cost per credit",
            marketUnitPrice: "Effective unit price",
            best: "Best",
            unquotedFilterMessage: "{{count}} items have no market quote on this side. Enable Show unquoted to view them.",
            noMatchingItems: "No donation items match the current filters.",
            noRankedItems: "No items to rank",
            marketPriceTitle: "{{price}} coins · +{{level}}",
            liquidationPriceDetails: "{{net}} coins net · {{gross}} bid · {{tax}} tax · +{{level}}",
            enhancementLevel: "+{{level}}",
            noMarketQuote: "No market quote",
            credit: "Credit",
            acquireUnitPrice: "Buy unit price",
            liquidationUnitPrice: "Net sell unit price",
            loadMore: "Show more ({{count}} remaining)",
            unquotedNotShown: "{{count}} unquoted items hidden",
            showingItems: "Showing {{count}} items",
            sortAscending: "Sorted by coin cost per credit",
            rank: "Rank",
            item: "Item",
            donationBatchHeader: "Batch",
            costFormula: "Effective unit price × donation amount ÷ credit amount",
            relativeToBest: "vs. best",
            targetCalculator: "Target plan",
            targetCreditLabel: "{{color}} Credit target",
            targetCreditInputAria: "Target {{color}} Credit amount",
            targetBestPlan: "Lowest single-item plan",
            targetRequiredItems: "Items",
            targetBatches: "Batches",
            targetCreditsReceived: "Credits",
            targetSurplus: "+{{count}} extra",
            targetEstimatedCost: "Estimated cost",
            targetOpportunityCost: "Opportunity cost",
            targetCostTitle: "{{cost}} coins at the effective unit price; order-book depth is not included",
            targetNoPlan: "No quoted plan",
            tokenCreditType: "Credit type",
            tokenTargetLabel: "Target credits",
            tokenTargetAria: "Target Guild Credit amount",
            tokenOfficialRate: "Official fixed exchange",
            tokenExchangeBatch: "Exchange batch",
            tokenPerCredit: "Tokens per credit",
            tokenTargetPlan: "Target exchange",
            tokenRequired: "Guild tokens needed",
            tokenBatches: "Exchange batches",
            tokenCreditsReceived: "Credits received",
            tokenSurplus: "Surplus credits",
            tokenAllRates: "Rates by credit",
            tokenBatchText: "{{tokens}} {{tokenUnit}} -> {{credits}} {{creditUnit}}",
            tokenPerCreditValue: "{{value}} tokens / credit",
            tokenNoConversions: "Guild Token exchange data unavailable",
            tokenNoConversionsMessage: "Refresh the game page so the official exchange rates can be read.",
            tokenTargetInvalid: "Enter a positive whole-credit target.",
            tokenHeaderStatus: "{{count}} Guild Token exchanges",
            guildTokenUnitOne: "token",
            guildTokenUnitOther: "tokens",
            donationAssistantTitle: "Donation recommendation",
            donationAssistantRecommended: "Recommended",
            donationAssistantCurrent: "Selected",
            donationAssistantWaiting: "Waiting for donation and market data",
            donationAssistantNoConversions: "No donation conversion is available for this credit.",
            donationAssistantNoQuote: "No comparable market quote is available.",
            donationAssistantRecommendedSelected: "The selected item type is already the recommendation.",
            donationAssistantSavings: "Switching items saves about {{value}}% per credit.",
            donationAssistantSelectedCheaper: "The selected quote is about {{value}}% cheaper, but it is excluded from automatic recommendations by the current filter.",
            donationAssistantTie: "These items currently cost the same per credit.",
            donationAssistantSelectedNoQuote: "The selected enhancement level has no market quote.",
            donationAssistantCostUnit: "coins / credit",
            donationAssistantComparison: "Donation item comparison",
            bestEligible: "Best allowed",
            shrineBuff: "Shrine buff",
            shrineBuffOption: "{{shrine}} · {{domain}}",
            shrineSkilling: "Skilling",
            shrineCombat: "Combat",
            shrineFromLevel: "From",
            shrineToLevel: "To",
            shrineLevelOption: "Lv. {{level}}",
            shrineAskEstimate: "Current Ask estimate",
            shrineRoute: "Lv. {{from}} -> Lv. {{to}}",
            shrineLevelCount: "{{count}} levels",
            shrineGuildTokens: "Upgrade tokens",
            shrineCreditGuildTokens: "Tokens for credits",
            shrineAllGuildTokens: "All-token total",
            shrineCreditTypes: "Credit types",
            shrineEstimatedCoins: "Estimated coins",
            shrineRequirements: "Upgrade requirements",
            shrineResources: "Resources to purchase",
            shrineRequiredAmount: "{{count}} required",
            shrineBuyAmount: "Buy {{count}}",
            shrineCreditCoverage: "{{credits}} credits · {{batches}} batches",
            shrineResourceCost: "Resource cost",
            shrineTokenAlternative: "Token exchange",
            shrineTokenUnavailable: "Unavailable",
            shrineTokenIncomplete: "Missing exchange rate",
            shrineNoMarketQuote: "No purchasable quote",
            shrineIncompleteEstimate: "Incomplete estimate",
            shrineNoCreditsRequired: "No Guild Credits required",
            shrineDataNotReady: "Shrine buff data unavailable",
            shrineDataMessage: "Refresh the game page so the latest shrine costs can be read.",
            shrineLevelCostsIncomplete: "Some level costs are missing from game data.",
            shrineConfirmedDataWarning: "The latest Shrine data is missing or not yet confirmed as complete. Showing the last confirmed costs.",
            shrineHeaderStatus: "{{buffs}} shrine buffs · {{quoted}} quoted conversions",
            waitingGameData: "Waiting for game item data",
            waitingGameMessage: "Refresh the game page after first install. The latest donation conversions will be detected automatically.",
            loadingMarket: "Loading market prices",
            noMarketData: "No market prices",
            clickRefresh: "Use the refresh button in the top-right corner.",
            dataLive: "Items: live game data",
            dataGameStorage: "Items: game storage",
            namesOfficialZh: "Names: official Chinese",
            namesEnglish: "Names: English",
            headerStatus: "{{conversions}} conversions · {{quoted}} quoted",
            marketRefreshing: "Market: refreshing",
            marketStatus: "Market: {{time}}",
            marketPassiveStatus: "Market: {{count}} live items",
            marketStatusWithLive: "Market: {{time}} · {{count}} live",
            menuOpen: "Open Guild Donation Value",
            menuRefresh: "Refresh guild donation prices",
            menuResetPosition: "Reset guild donation panel position",
        }),
        zh: Object.freeze({
            unknown: "未知",
            launcherTitle: "打开公会捐献性价比",
            panelTitle: "公会捐献性价比",
            dragPanel: "拖动面板",
            waitingData: "等待数据",
            refreshData: "手动刷新完整行情",
            close: "关闭",
            language: "语言",
            mainViews: "规划页面",
            donationView: "捐献性价比",
            tokenView: "代币兑换",
            shrineView: "神龛升级",
            priceBasis: "市场价格口径",
            acquirePrice: "买入价",
            acquirePriceTitle: "按当前允许参与计算的强化等级中的最低卖单，计算现在买入道具的价格",
            liquidationPrice: "卖出价",
            liquidationPriceTitle: "当前允许参与计算的强化等级分别按最高买单扣税，再选择机会成本最低的等级",
            searchPlaceholder: "搜索道具名称或 HRID",
            searchAria: "搜索捐献道具",
            unquotedTitle: "无当前市场报价的道具不参与性价比排名",
            showUnquoted: "显示无报价",
            enhancedTitle: "允许 +1 及以上强化等级的报价参与自动排行、推荐和估价",
            includeEnhanced: "包含强化",
            creditColors: "信用颜色",
            dataWaiting: "道具：等待中",
            marketWaiting: "行情：等待中",
            catalogNotReady: "尚未读取到游戏道具数据，请刷新游戏页面。",
            catalogReadFailed: "读取游戏道具数据失败。",
            marketRefreshRetained: "行情刷新失败，继续使用当前页面已加载的行情。",
            marketLoadFailed: "行情加载失败，请稍后重试。",
            marketRefreshCooldown: "{{seconds}} 秒后可再次刷新行情",
            marketPassivePartial: "当前只显示游戏消息中已观察到的部分行情，点击刷新可获取完整市场。",
            noMarketTimestamp: "暂无行情时间",
            noQuote: "无报价",
            coinsPerCreditTitle: "{{value}} 金币 / 信用",
            creditsPerMillion: "{{value}} 信用 / 百万金币",
            overviewBestTitle: "各颜色最佳选择",
            overview: "概览",
            creditName: "{{color}}信用",
            creditTabTitle: "{{color}}信用 · {{count}} 项换算",
            donationBatch: "{{items}}{{itemUnit}} → {{credits}}{{creditUnit}}",
            batchCreditResult: "{{itemUnit}} → {{credits}}{{creditUnit}}",
            itemUnitOne: "件",
            itemUnitOther: "件",
            creditUnitOne: "信用",
            creditUnitOther: "信用",
            noValidQuote: "暂无有效报价",
            conversionCount: "{{count}} 项换算",
            creditQuotedCount: "{{quoted}}/{{total}} 有报价",
            unitPricePerItem: "{{price}} / 件",
            creditType: "信用类型",
            currentBestItem: "当前最佳道具",
            costPerCredit: "每信用成本",
            marketUnitPrice: "有效单价",
            best: "最佳",
            unquotedFilterMessage: "有 {{count}} 项没有当前口径的市场报价，可开启“显示无报价”。",
            noMatchingItems: "没有符合当前筛选条件的捐献道具。",
            noRankedItems: "没有可排名的道具",
            marketPriceTitle: "{{price}} 金币 · +{{level}}",
            liquidationPriceDetails: "税后 {{net}} 金币 · 原始买单 {{gross}} · 税率 {{tax}} · +{{level}}",
            enhancementLevel: "+{{level}}",
            noMarketQuote: "无市场报价",
            credit: "信用",
            acquireUnitPrice: "买入单价",
            liquidationUnitPrice: "税后卖出单价",
            loadMore: "显示更多（剩余 {{count}} 项）",
            unquotedNotShown: "{{count}} 项无报价未显示",
            showingItems: "显示 {{count}} 项",
            sortAscending: "按每信用金币成本升序",
            rank: "排名",
            item: "道具",
            donationBatchHeader: "捐献批次",
            costFormula: "有效单价 × 捐献数量 ÷ 信用数量",
            relativeToBest: "较最佳",
            targetCalculator: "目标方案",
            targetCreditLabel: "目标{{color}}信用",
            targetCreditInputAria: "目标{{color}}信用数量",
            targetBestPlan: "最低单一道具方案",
            targetRequiredItems: "所需道具",
            targetBatches: "完整批次",
            targetCreditsReceived: "实际获得",
            targetSurplus: "多 {{count}} 信用",
            targetEstimatedCost: "预计购入成本",
            targetOpportunityCost: "总机会成本",
            targetCostTitle: "按当前有效单价估算 {{cost}} 金币，不包含订单簿深度",
            targetNoPlan: "暂无可计算报价",
            tokenCreditType: "信用类型",
            tokenTargetLabel: "目标信用",
            tokenTargetAria: "目标公会信用数量",
            tokenOfficialRate: "官方固定兑换",
            tokenExchangeBatch: "兑换批次",
            tokenPerCredit: "每信用代币",
            tokenTargetPlan: "目标兑换",
            tokenRequired: "所需公会代币",
            tokenBatches: "兑换批次",
            tokenCreditsReceived: "实际获得信用",
            tokenSurplus: "超出信用",
            tokenAllRates: "各色兑换比例",
            tokenBatchText: "{{tokens}}{{tokenUnit}} → {{credits}}{{creditUnit}}",
            tokenPerCreditValue: "{{value}} 代币 / 信用",
            tokenNoConversions: "尚未读取到公会代币兑换数据",
            tokenNoConversionsMessage: "请刷新游戏页面，以读取官方兑换比例。",
            tokenTargetInvalid: "请输入大于零的整数信用目标。",
            tokenHeaderStatus: "{{count}} 种公会代币兑换",
            guildTokenUnitOne: "代币",
            guildTokenUnitOther: "代币",
            donationAssistantTitle: "捐献信用推荐",
            donationAssistantRecommended: "推荐道具",
            donationAssistantCurrent: "当前选择",
            donationAssistantWaiting: "正在等待捐献换算和市场行情",
            donationAssistantNoConversions: "当前信用没有可用的捐献换算。",
            donationAssistantNoQuote: "暂无可用于比较的市场报价。",
            donationAssistantRecommendedSelected: "当前道具种类已经是推荐选择。",
            donationAssistantSavings: "改用推荐道具，每信用预计节省 {{value}}%。",
            donationAssistantSelectedCheaper: "当前所选报价便宜约 {{value}}%，但它已被当前筛选条件排除，不参与自动推荐。",
            donationAssistantTie: "两种道具当前的每信用成本相同。",
            donationAssistantSelectedNoQuote: "当前所选强化等级没有市场报价。",
            donationAssistantCostUnit: "金币 / 信用",
            donationAssistantComparison: "捐献道具对比",
            bestEligible: "筛选内最佳",
            shrineBuff: "神龛增益",
            shrineBuffOption: "{{shrine}} · {{domain}}",
            shrineSkilling: "生活",
            shrineCombat: "战斗",
            shrineFromLevel: "起始等级",
            shrineToLevel: "目标等级",
            shrineLevelOption: "{{level}} 级",
            shrineAskEstimate: "当前卖单估算",
            shrineRoute: "{{from}} 级 -> {{to}} 级",
            shrineLevelCount: "升级 {{count}} 级",
            shrineGuildTokens: "升级固定代币",
            shrineCreditGuildTokens: "信用兑换代币",
            shrineAllGuildTokens: "代币方案合计",
            shrineCreditTypes: "信用种类",
            shrineEstimatedCoins: "预计金币",
            shrineRequirements: "升级所需",
            shrineResources: "需要购买的资源",
            shrineRequiredAmount: "需要 {{count}}",
            shrineBuyAmount: "购买 {{count}}",
            shrineCreditCoverage: "获得 {{credits}} 信用 · {{batches}} 批",
            shrineResourceCost: "资源成本",
            shrineTokenAlternative: "代币兑换",
            shrineTokenUnavailable: "不可兑换",
            shrineTokenIncomplete: "缺少兑换比例",
            shrineNoMarketQuote: "无可购买报价",
            shrineIncompleteEstimate: "报价不完整",
            shrineNoCreditsRequired: "无需公会信用",
            shrineDataNotReady: "尚未读取到神龛增益数据",
            shrineDataMessage: "请刷新游戏页面，以读取最新神龛升级费用。",
            shrineLevelCostsIncomplete: "游戏数据中缺少部分等级费用。",
            shrineConfirmedDataWarning: "最新神龛数据缺失或尚未确认完整，当前显示上一次确认完整的数据。",
            shrineHeaderStatus: "{{buffs}} 项神龛增益 · {{quoted}} 项换算有报价",
            waitingGameData: "等待游戏道具数据",
            waitingGameMessage: "首次安装后刷新游戏页面，脚本会自动读取最新捐献换算。",
            loadingMarket: "正在读取市场行情",
            noMarketData: "暂无市场行情",
            clickRefresh: "请点击右上角刷新行情。",
            dataLive: "道具：游戏实时数据",
            dataGameStorage: "道具：游戏本地数据",
            namesOfficialZh: "名称：官方中文",
            namesEnglish: "名称：英文",
            headerStatus: "{{conversions}} 项换算 · {{quoted}} 项有报价",
            marketRefreshing: "行情：刷新中",
            marketStatus: "行情：{{time}}",
            marketPassiveStatus: "行情：{{count}} 项实时更新",
            marketStatusWithLive: "行情：{{time}} · {{count}} 项实时",
            menuOpen: "打开公会捐献性价比",
            menuRefresh: "刷新公会捐献行情",
            menuResetPosition: "重置公会捐献面板位置",
        }),
    });

    function normalizeUiLanguage(value, fallback = LANGUAGE_ZH) {
        const normalized = String(value || "").trim().toLowerCase().replace(/_/g, "-");
        if (normalized === LANGUAGE_ZH || normalized.startsWith("zh-")) {
            return LANGUAGE_ZH;
        }
        if (normalized === LANGUAGE_EN || normalized.startsWith("en-")) {
            return LANGUAGE_EN;
        }
        return fallback === LANGUAGE_ZH ? LANGUAGE_ZH : LANGUAGE_EN;
    }

    function detectUiLanguage(candidates = []) {
        for (const candidate of candidates) {
            const normalized = String(candidate || "").trim().toLowerCase().replace(/_/g, "-");
            if (normalized === LANGUAGE_ZH || normalized.startsWith("zh-")) {
                return LANGUAGE_ZH;
            }
            if (normalized === LANGUAGE_EN || normalized.startsWith("en-")) {
                return LANGUAGE_EN;
            }
        }
        return LANGUAGE_ZH;
    }

    function translateText(language, key, params = {}) {
        const normalizedLanguage = normalizeUiLanguage(language);
        const template = UI_TEXT[normalizedLanguage]?.[key] ?? UI_TEXT.en[key] ?? String(key || "");
        return String(template).replace(/\{\{(\w+)\}\}/g, (match, paramName) => (
            Object.prototype.hasOwnProperty.call(params, paramName) ? String(params[paramName]) : match
        ));
    }

    function t(state, key, params = {}) {
        return translateText(state?.uiLanguage, key, params);
    }

    function getQuantityUnit(state, type, count) {
        const pluralCategory = Number(count) === 1 ? "One" : "Other";
        return t(state, `${type}Unit${pluralCategory}`);
    }

    function formatDonationBatchText(state, itemCount, creditCount) {
        return t(state, "donationBatch", {
            items: formatExactNumber(itemCount, 4, state.uiLanguage),
            itemUnit: getQuantityUnit(state, "item", itemCount),
            credits: formatExactNumber(creditCount, 4, state.uiLanguage),
            creditUnit: getQuantityUnit(state, "credit", creditCount),
        });
    }

    function formatBatchCreditResult(state, itemCount, creditCount) {
        return t(state, "batchCreditResult", {
            itemUnit: getQuantityUnit(state, "item", itemCount),
            credits: formatExactNumber(creditCount, 4, state.uiLanguage),
            creditUnit: getQuantityUnit(state, "credit", creditCount),
        });
    }

    function formatGuildTokenBatchText(state, guildTokenCount, creditCount) {
        return t(state, "tokenBatchText", {
            tokens: formatExactNumber(guildTokenCount, 4, state.uiLanguage),
            tokenUnit: getQuantityUnit(state, "guildToken", guildTokenCount),
            credits: formatExactNumber(creditCount, 4, state.uiLanguage),
            creditUnit: getQuantityUnit(state, "credit", creditCount),
        });
    }

    function getCreditLabel(definition, language, short = false) {
        if (!definition) {
            return translateText(language, "unknown");
        }
        if (normalizeUiLanguage(language) === LANGUAGE_ZH) {
            return String(short ? (definition.shortLabelZh || definition.shortLabel) : (definition.labelZh || definition.label));
        }
        return String(short ? definition.shortLabel : definition.label);
    }

    function parseFiniteNumber(value) {
        if (typeof value !== "number" && typeof value !== "string") {
            return null;
        }
        if (typeof value === "string" && value.trim() === "") {
            return null;
        }
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }

    function toPositiveNumber(value) {
        const parsed = parseFiniteNumber(value);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    }

    function toPositiveSafeInteger(value) {
        const parsed = parseFiniteNumber(value);
        return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
    }

    function toNonNegativeNumber(value, fallback = 0) {
        const parsed = parseFiniteNumber(value);
        return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
    }

    function toRequiredNonNegativeNumber(value) {
        return toNonNegativeNumber(value, null);
    }

    function toRequiredNonNegativeSafeInteger(value) {
        const parsed = parseFiniteNumber(value);
        return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
    }

    function normalizeTargetCreditAmount(value, fallback = null) {
        const parsed = parseFiniteNumber(value);
        if (!Number.isFinite(parsed) || parsed <= 0) {
            return fallback;
        }
        const rounded = Math.ceil(parsed);
        return Number.isSafeInteger(rounded) ? rounded : fallback;
    }

    function normalizeNonNegativeInteger(value, fallback = null) {
        const parsed = parseFiniteNumber(value);
        return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : fallback;
    }

    function normalizeAppView(value) {
        if (value === APP_VIEW_TOKEN || value === APP_VIEW_SHRINE) {
            return value;
        }
        return APP_VIEW_DONATION;
    }

    function itemNameFromHrid(hrid) {
        const slug = String(hrid || "").split("/").filter(Boolean).pop() || "Unknown Item";
        return slug
            .split("_")
            .filter(Boolean)
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
            .join(" ");
    }

    function sanitizeItemNameDictionary(rawDictionary) {
        if (!rawDictionary || typeof rawDictionary !== "object" || Array.isArray(rawDictionary)) {
            return {};
        }

        const dictionary = {};
        for (const [rawHrid, rawName] of Object.entries(rawDictionary)) {
            const hrid = String(rawHrid || "").trim();
            const name = typeof rawName === "string" ? rawName.trim() : "";
            if (hrid.startsWith("/items/") && name) {
                dictionary[hrid] = name;
            }
        }
        return dictionary;
    }

    function resolveLocalizedItemName(itemNames, itemHrid, fallbackName = "") {
        const localizedName = String(itemNames?.[String(itemHrid || "")] || "").trim();
        return localizedName || String(fallbackName || itemNameFromHrid(itemHrid)).trim();
    }

    function resolveDisplayItemName(state, itemHrid, fallbackName = "") {
        if (normalizeUiLanguage(state?.uiLanguage) === LANGUAGE_ZH) {
            return resolveLocalizedItemName(state?.itemNamesZh, itemHrid, fallbackName);
        }
        return String(fallbackName || itemNameFromHrid(itemHrid)).trim();
    }

    function extractChineseItemNamesFromI18n(source) {
        const resources = source?.options?.resources || source?.resources || source;
        if (!resources || typeof resources !== "object" || Array.isArray(resources)) {
            return {};
        }

        const itemNames = {};
        for (const localeKey of ["zh", "zh-CN", "zh_CN", "zh-Hans", "zh-Hans-CN"]) {
            const locale = resources[localeKey];
            for (const candidate of [
                locale?.translation?.itemNames,
                locale?.itemNames,
            ]) {
                Object.assign(itemNames, sanitizeItemNameDictionary(candidate));
            }
        }
        return itemNames;
    }

    function normalizePanelPosition(rawPosition) {
        const x = Number(rawPosition?.x);
        const y = Number(rawPosition?.y);
        return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
    }

    function clampPanelPosition(position, panelSize, viewportSize, margin = PANEL_VIEWPORT_MARGIN) {
        const width = Math.max(0, Number(panelSize?.width) || 0);
        const height = Math.max(0, Number(panelSize?.height) || 0);
        const viewportWidth = Math.max(0, Number(viewportSize?.width) || 0);
        const viewportHeight = Math.max(0, Number(viewportSize?.height) || 0);
        const requestedX = Number.isFinite(Number(position?.x)) ? Number(position.x) : 0;
        const requestedY = Number.isFinite(Number(position?.y)) ? Number(position.y) : 0;
        const safeMargin = Math.max(0, Number(margin) || 0);

        function clampAxis(value, itemSize, viewportLength) {
            const available = Math.max(0, viewportLength - itemSize);
            const inset = Math.min(safeMargin, available / 2);
            return Math.min(Math.max(value, inset), Math.max(inset, available - inset));
        }

        return {
            x: clampAxis(requestedX, width, viewportWidth),
            y: clampAxis(requestedY, height, viewportHeight),
        };
    }

    function itemIconNameFromHrid(hrid) {
        const name = String(hrid || "").split("/").filter(Boolean).pop() || "";
        return /^[a-z0-9_]+$/i.test(name) ? name : "";
    }

    function getCreditDefinition(creditHrid, fallbackName = "") {
        const known = CREDIT_DEFINITION_BY_HRID[String(creditHrid || "")];
        if (known) {
            return known;
        }

        return {
            key: itemIconNameFromHrid(creditHrid) || "unknown",
            hrid: String(creditHrid || ""),
            label: String(fallbackName || itemNameFromHrid(creditHrid)).replace(/\s*Guild Credit\s*$/i, "") || "Unknown",
            labelZh: "未知",
            shortLabel: "?",
            shortLabelZh: "?",
            color: "#8f99a5",
            ink: "#12161a",
            order: CREDIT_DEFINITIONS.length,
        };
    }

    function getShrineDefinition(shrineHrid, fallbackName = "") {
        const known = SHRINE_DEFINITION_BY_HRID[String(shrineHrid || "")];
        if (known) {
            return known;
        }

        const key = itemIconNameFromHrid(shrineHrid) || "unknown";
        return {
            key,
            hrid: String(shrineHrid || ""),
            label: String(fallbackName || itemNameFromHrid(shrineHrid) || "Unknown Shrine"),
            labelZh: String(fallbackName || "未知神龛"),
            color: "#8f99a5",
            order: SHRINE_DEFINITIONS.length,
        };
    }

    function getShrineLabel(definition, language) {
        if (!definition) {
            return translateText(language, "unknown");
        }
        return normalizeUiLanguage(language) === LANGUAGE_ZH
            ? String(definition.labelZh || definition.label)
            : String(definition.label);
    }

    function normalizeConversions(rawConversions) {
        if (Array.isArray(rawConversions)) {
            return rawConversions;
        }
        if (rawConversions && typeof rawConversions === "object") {
            return [rawConversions];
        }
        return [];
    }

    function normalizeDonationCatalog(itemDetailMap) {
        if (!itemDetailMap || typeof itemDetailMap !== "object" || Array.isArray(itemDetailMap)) {
            return [];
        }

        const creditNames = Object.create(null);
        for (const definition of CREDIT_DEFINITIONS) {
            creditNames[definition.hrid] = String(itemDetailMap?.[definition.hrid]?.name || `${definition.label} Guild Credit`);
        }

        const catalog = [];
        for (const [mapHrid, rawItem] of Object.entries(itemDetailMap)) {
            if (!rawItem || typeof rawItem !== "object") {
                continue;
            }

            const itemHrid = String(rawItem.hrid || mapHrid || "").trim();
            if (!itemHrid.startsWith("/items/")) {
                continue;
            }

            const itemName = String(rawItem.name || itemNameFromHrid(itemHrid)).trim();
            const conversions = normalizeConversions(rawItem.guildCreditConversions);
            for (const conversion of conversions) {
                const creditHrid = String(conversion?.creditItemHrid || "").trim();
                const itemCount = toPositiveSafeInteger(conversion?.itemCount);
                const creditCount = toPositiveSafeInteger(conversion?.creditCount);
                if (!creditHrid.startsWith("/items/") || itemCount == null || creditCount == null) {
                    continue;
                }

                const creditName = String(
                    itemDetailMap?.[creditHrid]?.name
                    || creditNames[creditHrid]
                    || itemNameFromHrid(creditHrid),
                ).trim();

                catalog.push({
                    itemHrid,
                    itemName,
                    creditHrid,
                    creditName,
                    itemCount,
                    creditCount,
                    sortIndex: toNonNegativeNumber(rawItem.sortIndex, Number.MAX_SAFE_INTEGER),
                });
            }
        }

        return catalog.sort((left, right) => {
            const leftCredit = getCreditDefinition(left.creditHrid, left.creditName);
            const rightCredit = getCreditDefinition(right.creditHrid, right.creditName);
            if (leftCredit.order !== rightCredit.order) {
                return leftCredit.order - rightCredit.order;
            }
            if (left.sortIndex !== right.sortIndex) {
                return left.sortIndex - right.sortIndex;
            }
            return left.itemName.localeCompare(right.itemName);
        });
    }

    function isGuildTokenConversion(conversion) {
        return String(conversion?.itemHrid || "") === GUILD_TOKEN_ITEM_HRID;
    }

    function getGuildTokenConversions(catalog) {
        return (Array.isArray(catalog) ? catalog : [])
            .filter((item) => (
                isGuildTokenConversion(item)
                && String(item?.creditHrid || "").startsWith("/items/")
                && toPositiveSafeInteger(item?.itemCount) != null
                && toPositiveSafeInteger(item?.creditCount) != null
            ))
            .sort((left, right) => {
                const leftCredit = getCreditDefinition(left.creditHrid, left.creditName);
                const rightCredit = getCreditDefinition(right.creditHrid, right.creditName);
                if (leftCredit.order !== rightCredit.order) {
                    return leftCredit.order - rightCredit.order;
                }
                const leftItemCount = toPositiveSafeInteger(left.itemCount);
                const leftCreditCount = toPositiveSafeInteger(left.creditCount);
                const rightItemCount = toPositiveSafeInteger(right.itemCount);
                const rightCreditCount = toPositiveSafeInteger(right.creditCount);
                const leftProduct = BigInt(leftItemCount) * BigInt(rightCreditCount);
                const rightProduct = BigInt(rightItemCount) * BigInt(leftCreditCount);
                if (leftProduct !== rightProduct) {
                    return leftProduct < rightProduct ? -1 : 1;
                }
                return leftItemCount - rightItemCount;
            });
    }

    function getGuildTokenRateConversions(catalog) {
        const seenCredits = new Set();
        return getGuildTokenConversions(catalog).filter((conversion) => {
            if (seenCredits.has(conversion.creditHrid)) {
                return false;
            }
            seenCredits.add(conversion.creditHrid);
            return true;
        });
    }

    function getMarketDonationCatalog(catalog) {
        return (Array.isArray(catalog) ? catalog : []).filter((item) => !isGuildTokenConversion(item));
    }

    function createDonationCatalogIdentityCounts(catalog) {
        const counts = new Map();
        for (const item of Array.isArray(catalog) ? catalog : []) {
            const key = `${String(item?.itemHrid || "")}\u0000${String(item?.creditHrid || "")}`;
            counts.set(key, (counts.get(key) || 0) + 1);
        }
        return counts;
    }

    function hasMissingDonationCatalogEntries(confirmedCatalog, incomingCatalog) {
        const incomingCounts = createDonationCatalogIdentityCounts(incomingCatalog);
        for (const [key, count] of createDonationCatalogIdentityCounts(confirmedCatalog)) {
            if ((incomingCounts.get(key) || 0) < count) {
                return true;
            }
        }
        return false;
    }

    function createDonationCatalogSnapshotSignature(versionTimestamp, catalog) {
        const normalizedCatalog = (Array.isArray(catalog) ? catalog : [])
            .map((item) => [
                String(item?.itemHrid || ""),
                String(item?.creditHrid || ""),
                toPositiveSafeInteger(item?.itemCount),
                toPositiveSafeInteger(item?.creditCount),
                String(item?.itemName || ""),
                String(item?.creditName || ""),
                toNonNegativeNumber(item?.sortIndex, Number.MAX_SAFE_INTEGER),
            ])
            .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
        return JSON.stringify([String(versionTimestamp || ""), normalizedCatalog]);
    }

    function normalizeGuildCreditCosts(rawCosts) {
        if (!Array.isArray(rawCosts)) {
            return { creditCosts: [], isValid: false };
        }

        const totals = new Map();
        let isValid = true;
        for (const rawCost of rawCosts) {
            const itemHrid = String(rawCost?.itemHrid || "").trim();
            const count = toPositiveSafeInteger(rawCost?.count);
            if (!itemHrid.startsWith("/items/") || count == null) {
                isValid = false;
                continue;
            }
            const total = (totals.get(itemHrid) || 0) + count;
            if (!Number.isSafeInteger(total)) {
                isValid = false;
                continue;
            }
            totals.set(itemHrid, total);
        }
        return {
            creditCosts: Array.from(totals, ([itemHrid, count]) => ({ itemHrid, count }))
                .sort((left, right) => (
                    getCreditDefinition(left.itemHrid).order - getCreditDefinition(right.itemHrid).order
                )),
            isValid,
        };
    }

    function compareGuildBuffs(left, right) {
        if (left.sortIndex !== right.sortIndex) {
            return left.sortIndex - right.sortIndex;
        }
        const leftShrine = getShrineDefinition(left.shrineHrid, left.shrineName);
        const rightShrine = getShrineDefinition(right.shrineHrid, right.shrineName);
        if (leftShrine.order !== rightShrine.order) {
            return leftShrine.order - rightShrine.order;
        }
        return Number(left.isCombat) - Number(right.isCombat);
    }

    function normalizeGuildBuffHridList(rawHrids, fallbackGuildBuffs = []) {
        const values = Array.isArray(rawHrids) && rawHrids.length > 0
            ? rawHrids
            : (Array.isArray(fallbackGuildBuffs) ? fallbackGuildBuffs.map((buff) => buff?.hrid) : []);
        return Array.from(new Set(values
            .map((value) => String(value || "").trim())
            .filter(Boolean)))
            .sort();
    }

    function createGuildBuffSnapshotSignature(versionTimestamp, guildBuffs) {
        const normalizedBuffs = (Array.isArray(guildBuffs) ? guildBuffs : [])
            .map((buff) => [
                String(buff?.hrid || ""),
                String(buff?.shrineHrid || ""),
                buff?.isCombat === true,
                normalizeNonNegativeInteger(buff?.maxLevel),
                toRequiredNonNegativeNumber(buff?.sortIndex),
                Object.values(buff?.levelCosts || {})
                    .filter((levelCost) => levelCost && typeof levelCost === "object")
                    .sort((left, right) => Number(left.level) - Number(right.level))
                    .map((levelCost) => [
                        normalizeNonNegativeInteger(levelCost.level),
                        toRequiredNonNegativeSafeInteger(levelCost.guildTokenCost),
                        normalizeGuildCreditCosts(levelCost.creditCosts).creditCosts
                            .map((cost) => [cost.itemHrid, cost.count]),
                    ]),
            ])
            .sort((left, right) => left[0].localeCompare(right[0]));
        return JSON.stringify([String(versionTimestamp || ""), normalizedBuffs]);
    }

    function normalizeGuildBuffCatalog(guildBuffDetailMap, guildShrineDetailMap = {}) {
        if (!guildBuffDetailMap || typeof guildBuffDetailMap !== "object" || Array.isArray(guildBuffDetailMap)) {
            return [];
        }

        const guildBuffs = [];
        for (const [mapHrid, rawBuff] of Object.entries(guildBuffDetailMap)) {
            if (!rawBuff || typeof rawBuff !== "object") {
                continue;
            }
            const hrid = String(rawBuff.hrid || mapHrid || "").trim();
            const shrineHrid = String(rawBuff.shrineHrid || "").trim();
            if (!hrid || !shrineHrid || !rawBuff.levelCosts || typeof rawBuff.levelCosts !== "object") {
                continue;
            }

            const levelCosts = {};
            let highestLevel = 0;
            for (const [rawLevel, rawCost] of Object.entries(rawBuff.levelCosts)) {
                const level = normalizeNonNegativeInteger(rawLevel);
                if (level == null || level < 1) {
                    continue;
                }
                highestLevel = Math.max(highestLevel, level);
                if (!rawCost || typeof rawCost !== "object") {
                    continue;
                }
                const guildTokenCost = toRequiredNonNegativeSafeInteger(rawCost.guildTokenCost);
                const normalizedCreditCosts = normalizeGuildCreditCosts(rawCost.creditCosts);
                if (guildTokenCost == null || !normalizedCreditCosts.isValid) {
                    continue;
                }
                levelCosts[level] = {
                    level,
                    guildTokenCost,
                    creditCosts: normalizedCreditCosts.creditCosts,
                };
            }
            if (highestLevel === 0) {
                continue;
            }

            const rawShrine = guildShrineDetailMap?.[shrineHrid] || {};
            const shrine = getShrineDefinition(shrineHrid, rawShrine.name || rawBuff.shrineName);
            const declaredMaxLevel = normalizeNonNegativeInteger(rawShrine.maxLevel ?? rawBuff.maxLevel);
            const maxLevel = declaredMaxLevel && declaredMaxLevel > 0
                ? declaredMaxLevel
                : highestLevel;
            if (maxLevel > MAX_SHRINE_LEVEL) {
                continue;
            }
            const isCombat = rawBuff.isCombat === true;
            guildBuffs.push({
                hrid,
                shrineHrid,
                shrineName: String(rawShrine.name || rawBuff.shrineName || shrine.label),
                isCombat,
                maxLevel,
                sortIndex: toNonNegativeNumber(rawBuff.sortIndex, shrine.order * 2 + (isCombat ? 1 : 0)),
                levelCosts,
            });
        }

        return guildBuffs.sort(compareGuildBuffs);
    }

    function isGuildBuffLevelCatalogComplete(guildBuff) {
        const maxLevel = normalizeNonNegativeInteger(guildBuff?.maxLevel);
        if (maxLevel == null || maxLevel < 1 || maxLevel > MAX_SHRINE_LEVEL) {
            return false;
        }
        for (let level = 1; level <= maxLevel; level += 1) {
            const levelCost = guildBuff?.levelCosts?.[level];
            if (!levelCost || typeof levelCost !== "object"
                || toRequiredNonNegativeSafeInteger(levelCost.guildTokenCost) == null
                || !normalizeGuildCreditCosts(levelCost.creditCosts).isValid) {
                return false;
            }
        }
        return true;
    }

    function analyzeGuildBuffSnapshot(confirmedGuildBuffs, completeGuildBuffHrids, incomingGuildBuffs) {
        const incomingHridSet = new Set(normalizeGuildBuffHridList(null, incomingGuildBuffs));
        const confirmedByHrid = new Map(
            (Array.isArray(confirmedGuildBuffs) ? confirmedGuildBuffs : [])
                .map((buff) => [buff.hrid, buff]),
        );
        const hasMissingConfirmedBuffs = completeGuildBuffHrids.some((hrid) => !incomingHridSet.has(hrid));
        const hasReducedMaxLevel = incomingGuildBuffs.some((buff) => {
            const confirmedBuff = confirmedByHrid.get(buff.hrid);
            return confirmedBuff
                && normalizeNonNegativeInteger(buff.maxLevel, 0)
                    < normalizeNonNegativeInteger(confirmedBuff.maxLevel, 0);
        });
        const hasIncompleteLevelCosts = incomingGuildBuffs.some((buff) => (
            !isGuildBuffLevelCatalogComplete(buff)
        ));
        const hasReducedLevelCosts = incomingGuildBuffs.some((buff) => {
            const confirmedBuff = confirmedByHrid.get(buff.hrid);
            if (!confirmedBuff) {
                return false;
            }

            const sharedMaxLevel = Math.min(
                normalizeNonNegativeInteger(buff.maxLevel, 0),
                normalizeNonNegativeInteger(confirmedBuff.maxLevel, 0),
            );
            for (let level = 1; level <= sharedMaxLevel; level += 1) {
                const confirmedCost = confirmedBuff.levelCosts?.[level];
                const incomingCost = buff.levelCosts?.[level];
                if (!confirmedCost || !incomingCost) {
                    continue;
                }

                const confirmedTokenCost = toRequiredNonNegativeSafeInteger(confirmedCost.guildTokenCost);
                const incomingTokenCost = toRequiredNonNegativeSafeInteger(incomingCost.guildTokenCost);
                if (confirmedTokenCost != null && incomingTokenCost != null
                    && incomingTokenCost < confirmedTokenCost) {
                    return true;
                }

                const confirmedCredits = normalizeGuildCreditCosts(confirmedCost.creditCosts);
                const incomingCredits = normalizeGuildCreditCosts(incomingCost.creditCosts);
                if (!confirmedCredits.isValid || !incomingCredits.isValid) {
                    continue;
                }
                const incomingCreditCounts = new Map(
                    incomingCredits.creditCosts.map((cost) => [cost.itemHrid, cost.count]),
                );
                if (confirmedCredits.creditCosts.some((cost) => (
                    (incomingCreditCounts.get(cost.itemHrid) || 0) < cost.count
                ))) {
                    return true;
                }
            }
            return false;
        });
        return {
            hasIncompleteLevelCosts,
            requiresConfirmation: hasMissingConfirmedBuffs
                || hasReducedMaxLevel
                || hasReducedLevelCosts,
        };
    }

    function normalizePriceMode(mode) {
        return mode === PRICE_MODE_BID ? PRICE_MODE_BID : PRICE_MODE_ASK;
    }

    function getMarketTaxRate(itemHrid) {
        return String(itemHrid || "") === COWBELL_BAG_ITEM_HRID
            ? COWBELL_BAG_MARKET_TAX_RATE
            : DEFAULT_MARKET_TAX_RATE;
    }

    function calculateLiquidationUnitPrice(rawPrice, itemHrid) {
        const price = toPositiveNumber(rawPrice);
        if (price == null) {
            return null;
        }
        return Math.floor((1 - getMarketTaxRate(itemHrid)) * price);
    }

    function resolveMarketQuoteDetails(
        marketData,
        itemHrid,
        mode = PRICE_MODE_ASK,
        includeEnhancedQuotes = false,
    ) {
        const normalizedItemHrid = String(itemHrid || "");
        const levelMap = marketData?.[normalizedItemHrid];
        if (!levelMap || typeof levelMap !== "object" || Array.isArray(levelMap)) {
            return null;
        }

        const normalizedMode = normalizePriceMode(mode);
        const field = normalizedMode === PRICE_MODE_BID ? "b" : "a";
        let best = null;

        for (const [rawLevel, quote] of Object.entries(levelMap)) {
            const enhancementLevel = normalizeNonNegativeInteger(rawLevel);
            const rawPrice = toPositiveNumber(quote?.[field]);
            if (enhancementLevel == null || rawPrice == null
                || (!includeEnhancedQuotes && enhancementLevel > 0)) {
                continue;
            }

            const price = normalizedMode === PRICE_MODE_BID
                ? calculateLiquidationUnitPrice(rawPrice, normalizedItemHrid)
                : rawPrice;
            const isBetter = !best
                || price < best.price
                || (price === best.price && enhancementLevel < best.enhancementLevel);
            if (isBetter) {
                best = {
                    enhancementLevel,
                    marketTaxRate: normalizedMode === PRICE_MODE_BID ? getMarketTaxRate(normalizedItemHrid) : 0,
                    price,
                    rawPrice,
                };
            }
        }

        return best;
    }

    function resolveMarketQuoteDetailsAtLevel(
        marketData,
        itemHrid,
        enhancementLevel,
        mode = PRICE_MODE_ASK,
    ) {
        const normalizedItemHrid = String(itemHrid || "");
        const normalizedLevel = normalizeNonNegativeInteger(enhancementLevel);
        const levelMap = marketData?.[normalizedItemHrid];
        if (normalizedLevel == null || !levelMap || typeof levelMap !== "object" || Array.isArray(levelMap)) {
            return null;
        }

        const normalizedMode = normalizePriceMode(mode);
        const field = normalizedMode === PRICE_MODE_BID ? "b" : "a";
        const rawPrice = toPositiveNumber(levelMap[String(normalizedLevel)]?.[field]);
        if (rawPrice == null) {
            return null;
        }

        return {
            enhancementLevel: normalizedLevel,
            marketTaxRate: normalizedMode === PRICE_MODE_BID ? getMarketTaxRate(normalizedItemHrid) : 0,
            price: normalizedMode === PRICE_MODE_BID
                ? calculateLiquidationUnitPrice(rawPrice, normalizedItemHrid)
                : rawPrice,
            rawPrice,
        };
    }

    function resolveMarketQuote(
        marketData,
        itemHrid,
        mode = PRICE_MODE_ASK,
        includeEnhancedQuotes = false,
    ) {
        return resolveMarketQuoteDetails(
            marketData,
            itemHrid,
            mode,
            includeEnhancedQuotes,
        )?.price ?? null;
    }

    function compareRankedRows(left, right) {
        if (left.hasQuote !== right.hasQuote) {
            return left.hasQuote ? -1 : 1;
        }
        if (left.hasQuote && right.hasQuote && left.coinsPerCredit !== right.coinsPerCredit) {
            return left.coinsPerCredit - right.coinsPerCredit;
        }
        if (left.itemName !== right.itemName) {
            return left.itemName.localeCompare(right.itemName);
        }
        return left.itemHrid.localeCompare(right.itemHrid);
    }

    function areRankCostsEqual(left, right) {
        const leftCost = Number(left);
        const rightCost = Number(right);
        if (!Number.isFinite(leftCost) || !Number.isFinite(rightCost)) {
            return leftCost === rightCost;
        }
        const scale = Math.max(1, Math.abs(leftCost), Math.abs(rightCost));
        return Math.abs(leftCost - rightCost) <= Number.EPSILON * scale * 4;
    }

    function buildRankedGroups(
        catalog,
        marketData,
        mode = PRICE_MODE_ASK,
        includeEnhancedQuotes = false,
    ) {
        const groups = Object.create(null);
        const normalizedMode = normalizePriceMode(mode);

        for (const catalogItem of getMarketDonationCatalog(catalog)) {
            const itemCount = toPositiveSafeInteger(catalogItem?.itemCount);
            const creditCount = toPositiveSafeInteger(catalogItem?.creditCount);
            if (itemCount == null || creditCount == null) {
                continue;
            }
            const normalizedCatalogItem = {
                ...catalogItem,
                itemCount,
                creditCount,
            };
            const marketQuote = resolveMarketQuoteDetails(
                marketData,
                normalizedCatalogItem.itemHrid,
                normalizedMode,
                includeEnhancedQuotes,
            );
            const candidateMarketPrice = marketQuote?.price ?? null;
            const candidateBatchCost = marketQuote
                ? candidateMarketPrice * itemCount
                : null;
            const candidateCoinsPerCredit = candidateBatchCost == null
                ? null
                : candidateBatchCost / creditCount;
            const hasQuote = marketQuote != null
                && Number.isFinite(candidateBatchCost)
                && Number.isFinite(candidateCoinsPerCredit);
            const marketPrice = hasQuote ? candidateMarketPrice : null;
            const batchCost = hasQuote ? candidateBatchCost : null;
            const coinsPerCredit = hasQuote ? candidateCoinsPerCredit : null;
            const candidateCreditsPerMillion = hasQuote && coinsPerCredit > 0
                ? 1_000_000 / coinsPerCredit
                : null;
            const row = {
                ...normalizedCatalogItem,
                enhancementLevel: hasQuote ? marketQuote.enhancementLevel : null,
                marketTaxRate: hasQuote ? marketQuote.marketTaxRate : 0,
                marketPrice,
                rawMarketPrice: hasQuote ? marketQuote.rawPrice : null,
                hasQuote,
                batchCost,
                coinsPerCredit,
                creditsPerMillion: Number.isFinite(candidateCreditsPerMillion)
                    ? candidateCreditsPerMillion
                    : null,
                rank: null,
            };

            if (!groups[row.creditHrid]) {
                groups[row.creditHrid] = [];
            }
            groups[row.creditHrid].push(row);
        }

        for (const rows of Object.values(groups)) {
            rows.sort(compareRankedRows);
            let quotedPosition = 0;
            let currentRank = 0;
            let currentRankCost = null;
            for (const row of rows) {
                if (row.hasQuote) {
                    quotedPosition += 1;
                    if (currentRankCost == null || !areRankCostsEqual(row.coinsPerCredit, currentRankCost)) {
                        currentRank = quotedPosition;
                        currentRankCost = row.coinsPerCredit;
                    }
                    row.rank = currentRank;
                }
            }
        }

        return groups;
    }

    function buildDonationRecommendation(
        catalog,
        marketData,
        mode,
        creditHrid,
        selectedItemHrid = "",
        selectedEnhancementLevel = 0,
        includeEnhancedQuotes = false,
    ) {
        const normalizedMode = normalizePriceMode(mode);
        const normalizedCreditHrid = String(creditHrid || "");
        const normalizedSelectedItemHrid = String(selectedItemHrid || "");
        const rows = buildRankedGroups(
            catalog,
            marketData,
            normalizedMode,
            includeEnhancedQuotes,
        )[normalizedCreditHrid] || [];
        const recommended = rows.find((row) => (
            row.hasQuote && Number.isFinite(row.coinsPerCredit)
        )) || null;

        const selectedBaseRow = normalizedSelectedItemHrid
            ? rows.find((row) => row.itemHrid === normalizedSelectedItemHrid) || null
            : null;
        let selected = null;
        if (selectedBaseRow) {
            const enhancementLevel = normalizeNonNegativeInteger(selectedEnhancementLevel, 0);
            const quote = resolveMarketQuoteDetailsAtLevel(
                marketData,
                selectedBaseRow.itemHrid,
                enhancementLevel,
                normalizedMode,
            );
            const batchCost = quote ? quote.price * selectedBaseRow.itemCount : null;
            const coinsPerCredit = batchCost == null
                ? null
                : batchCost / selectedBaseRow.creditCount;
            const hasQuote = quote != null
                && Number.isFinite(batchCost)
                && Number.isFinite(coinsPerCredit);
            const candidateCreditsPerMillion = hasQuote && coinsPerCredit > 0
                ? 1_000_000 / coinsPerCredit
                : null;
            selected = {
                ...selectedBaseRow,
                enhancementLevel,
                marketTaxRate: quote?.marketTaxRate ?? 0,
                marketPrice: hasQuote ? quote.price : null,
                rawMarketPrice: hasQuote ? quote.rawPrice : null,
                hasQuote,
                batchCost: hasQuote ? batchCost : null,
                coinsPerCredit: hasQuote ? coinsPerCredit : null,
                creditsPerMillion: Number.isFinite(candidateCreditsPerMillion)
                    ? candidateCreditsPerMillion
                    : null,
            };
        }

        const isDifferentItem = Boolean(
            selected && recommended && selected.itemHrid !== recommended.itemHrid,
        );
        const isRecommendedItem = Boolean(
            selected && recommended && selected.itemHrid === recommended.itemHrid,
        );
        const isDifferentChoice = Boolean(
            selected && recommended
            && (selected.itemHrid !== recommended.itemHrid
                || selected.enhancementLevel !== recommended.enhancementLevel),
        );
        const hasComparableCosts = Boolean(
            selected?.hasQuote
            && recommended?.hasQuote
            && Number.isFinite(selected.coinsPerCredit)
            && Number.isFinite(recommended.coinsPerCredit),
        );
        const isCostTie = hasComparableCosts
            && areRankCostsEqual(selected.coinsPerCredit, recommended.coinsPerCredit);
        const isSelectedExcludedByFilter = Boolean(
            selected && selected.enhancementLevel > 0 && !includeEnhancedQuotes,
        );
        const isSelectedCheaper = hasComparableCosts
            && !isCostTie
            && selected.coinsPerCredit < recommended.coinsPerCredit;
        const selectedSavingsPercent = isSelectedCheaper && recommended.coinsPerCredit > 0
            ? ((recommended.coinsPerCredit - selected.coinsPerCredit)
                / recommended.coinsPerCredit) * 100
            : null;
        const savingsPercent = hasComparableCosts && selected.coinsPerCredit > 0
            ? Math.max(0, (
                (selected.coinsPerCredit - recommended.coinsPerCredit)
                / selected.coinsPerCredit
            ) * 100)
            : null;

        return {
            creditHrid: normalizedCreditHrid,
            mode: normalizedMode,
            rows,
            recommended,
            selected,
            isDifferentItem,
            isRecommendedItem,
            isDifferentChoice,
            hasComparableCosts,
            isCostTie,
            isSelectedExcludedByFilter,
            isSelectedCheaper,
            selectedSavingsPercent,
            savingsPercent,
        };
    }

    function calculateTargetCreditPlan(rows, targetCredits) {
        const normalizedTarget = normalizeTargetCreditAmount(targetCredits);
        if (normalizedTarget == null) {
            return null;
        }

        let bestPlan = null;
        for (const row of Array.isArray(rows) ? rows : []) {
            const itemCount = toPositiveSafeInteger(row?.itemCount);
            const creditCount = toPositiveSafeInteger(row?.creditCount);
            const marketPrice = parseFiniteNumber(row?.marketPrice);
            if (!row?.hasQuote || itemCount == null || creditCount == null
                || marketPrice == null || marketPrice < 0) {
                continue;
            }

            const batches = Math.ceil(normalizedTarget / creditCount);
            const requiredItems = batches * itemCount;
            const creditsReceived = batches * creditCount;
            const totalCost = requiredItems * marketPrice;
            if (!Number.isSafeInteger(batches) || !Number.isSafeInteger(requiredItems)
                || !Number.isSafeInteger(creditsReceived) || !Number.isFinite(totalCost)) {
                continue;
            }

            const plan = {
                ...row,
                itemCount,
                creditCount,
                marketPrice,
                targetCredits: normalizedTarget,
                batches,
                requiredItems,
                creditsReceived,
                surplusCredits: Math.max(0, creditsReceived - normalizedTarget),
                totalCost,
            };
            const hasLowerCost = !bestPlan || plan.totalCost < bestPlan.totalCost;
            const hasSameCost = bestPlan && areRankCostsEqual(plan.totalCost, bestPlan.totalCost);
            const isBetterTie = hasSameCost && (
                plan.surplusCredits < bestPlan.surplusCredits
                || (plan.surplusCredits === bestPlan.surplusCredits && plan.requiredItems < bestPlan.requiredItems)
            );
            if (hasLowerCost || isBetterTie) {
                bestPlan = plan;
            }
        }
        return bestPlan;
    }

    function calculateGuildTokenCreditPlan(conversions, creditHrid, targetCredits) {
        const normalizedCreditHrid = String(creditHrid || "");
        const normalizedTarget = normalizeTargetCreditAmount(targetCredits);
        if (!normalizedCreditHrid.startsWith("/items/") || normalizedTarget == null) {
            return null;
        }

        let bestPlan = null;
        for (const conversion of getGuildTokenConversions(conversions)) {
            if (conversion.creditHrid !== normalizedCreditHrid) {
                continue;
            }
            const guildTokensPerBatch = toPositiveSafeInteger(conversion.itemCount);
            const creditsPerBatch = toPositiveSafeInteger(conversion.creditCount);
            if (guildTokensPerBatch == null || creditsPerBatch == null) {
                continue;
            }

            const batches = Math.ceil(normalizedTarget / creditsPerBatch);
            const requiredGuildTokens = batches * guildTokensPerBatch;
            const creditsReceived = batches * creditsPerBatch;
            const tokensPerCredit = guildTokensPerBatch / creditsPerBatch;
            if (!Number.isSafeInteger(batches) || batches <= 0
                || !Number.isSafeInteger(requiredGuildTokens) || requiredGuildTokens < 0
                || !Number.isSafeInteger(creditsReceived) || creditsReceived < normalizedTarget
                || !Number.isFinite(tokensPerCredit) || tokensPerCredit <= 0) {
                continue;
            }

            const plan = {
                ...conversion,
                targetCredits: normalizedTarget,
                batches,
                requiredGuildTokens,
                creditsReceived,
                surplusCredits: Math.max(0, creditsReceived - normalizedTarget),
                tokensPerCredit,
            };
            const isBetter = !bestPlan
                || plan.requiredGuildTokens < bestPlan.requiredGuildTokens
                || (plan.requiredGuildTokens === bestPlan.requiredGuildTokens
                    && plan.surplusCredits < bestPlan.surplusCredits)
                || (plan.requiredGuildTokens === bestPlan.requiredGuildTokens
                    && plan.surplusCredits === bestPlan.surplusCredits
                    && plan.batches < bestPlan.batches);
            if (isBetter) {
                bestPlan = plan;
            }
        }
        return bestPlan;
    }

    function calculateShrineUpgradeCost(guildBuff, fromLevel, toLevel) {
        const normalizedFromLevel = normalizeNonNegativeInteger(fromLevel);
        const normalizedToLevel = normalizeNonNegativeInteger(toLevel);
        const maxLevel = normalizeNonNegativeInteger(guildBuff?.maxLevel);
        if (!guildBuff || normalizedFromLevel == null || normalizedToLevel == null || maxLevel == null
            || maxLevel > MAX_SHRINE_LEVEL
            || normalizedToLevel <= normalizedFromLevel || normalizedToLevel > maxLevel) {
            return null;
        }

        let guildTokenCost = 0;
        const creditTotals = new Map();
        const missingLevels = [];
        for (let level = normalizedFromLevel + 1; level <= normalizedToLevel; level += 1) {
            const levelCost = guildBuff.levelCosts?.[level];
            if (!levelCost || typeof levelCost !== "object") {
                missingLevels.push(level);
                continue;
            }
            const levelGuildTokenCost = toRequiredNonNegativeSafeInteger(levelCost.guildTokenCost);
            const normalizedCreditCosts = normalizeGuildCreditCosts(levelCost.creditCosts);
            if (levelGuildTokenCost == null || !normalizedCreditCosts.isValid) {
                missingLevels.push(level);
                continue;
            }
            guildTokenCost += levelGuildTokenCost;
            for (const creditCost of normalizedCreditCosts.creditCosts) {
                creditTotals.set(
                    creditCost.itemHrid,
                    (creditTotals.get(creditCost.itemHrid) || 0) + creditCost.count,
                );
            }
        }
        if (!Number.isSafeInteger(guildTokenCost)
            || Array.from(creditTotals.values()).some((count) => !Number.isSafeInteger(count))) {
            return null;
        }

        const creditCosts = Array.from(creditTotals, ([itemHrid, count]) => ({ itemHrid, count }))
            .sort((left, right) => (
                getCreditDefinition(left.itemHrid).order - getCreditDefinition(right.itemHrid).order
            ));
        return {
            guildBuffHrid: guildBuff.hrid,
            shrineHrid: guildBuff.shrineHrid,
            fromLevel: normalizedFromLevel,
            toLevel: normalizedToLevel,
            levelCount: normalizedToLevel - normalizedFromLevel,
            guildTokenCost,
            creditCosts,
            missingLevels,
            isComplete: missingLevels.length === 0,
        };
    }

    function buildShrinePurchasePlan(upgradeCost, rankedGroups, guildTokenConversions = []) {
        const directGuildTokenCost = toRequiredNonNegativeSafeInteger(upgradeCost?.guildTokenCost);
        const normalizedCreditCosts = normalizeGuildCreditCosts(upgradeCost?.creditCosts);
        if (!upgradeCost || directGuildTokenCost == null || !normalizedCreditCosts.isValid) {
            return null;
        }

        let knownCoinCost = 0;
        let marketComplete = upgradeCost.isComplete === true;
        let knownCreditGuildTokenCost = 0;
        let guildTokenExchangeComplete = upgradeCost.isComplete === true;
        const resourcePlans = normalizedCreditCosts.creditCosts.map((creditCost) => {
            const plan = calculateTargetCreditPlan(
                rankedGroups?.[creditCost.itemHrid] || [],
                creditCost.count,
            );
            const tokenPlan = calculateGuildTokenCreditPlan(
                guildTokenConversions,
                creditCost.itemHrid,
                creditCost.count,
            );
            if (plan) {
                knownCoinCost += plan.totalCost;
            } else {
                marketComplete = false;
            }
            if (tokenPlan) {
                knownCreditGuildTokenCost += tokenPlan.requiredGuildTokens;
            } else {
                guildTokenExchangeComplete = false;
            }
            return {
                creditHrid: creditCost.itemHrid,
                requiredCredits: creditCost.count,
                plan,
                tokenPlan,
            };
        });
        if (!Number.isFinite(knownCoinCost) || !Number.isSafeInteger(knownCreditGuildTokenCost)) {
            return null;
        }

        const creditGuildTokenCost = guildTokenExchangeComplete ? knownCreditGuildTokenCost : null;
        const totalGuildTokenCost = creditGuildTokenCost == null
            ? null
            : directGuildTokenCost + creditGuildTokenCost;
        if (totalGuildTokenCost != null && !Number.isSafeInteger(totalGuildTokenCost)) {
            return null;
        }

        return {
            ...upgradeCost,
            guildTokenCost: directGuildTokenCost,
            creditCosts: normalizedCreditCosts.creditCosts,
            resourcePlans,
            knownCoinCost,
            totalCoinCost: marketComplete ? knownCoinCost : null,
            marketComplete,
            knownCreditGuildTokenCost,
            creditGuildTokenCost,
            totalGuildTokenCost,
            guildTokenExchangeComplete,
        };
    }

    function normalizeMarketTimestamp(value) {
        if (typeof value !== "number" && typeof value !== "string") {
            return 0;
        }

        const normalizedValue = typeof value === "string" ? value.trim() : value;
        if (normalizedValue === "") {
            return 0;
        }

        const numeric = Number(normalizedValue);
        if (Number.isFinite(numeric)) {
            const timestamp = numeric > 0
                ? (numeric < 1_000_000_000_000 ? numeric * 1000 : numeric)
                : 0;
            return timestamp > 0 && Number.isFinite(new Date(timestamp).getTime())
                ? timestamp
                : 0;
        }

        const parsed = Date.parse(normalizedValue);
        return Number.isFinite(parsed) ? parsed : 0;
    }

    function sanitizeMarketData(rawMarketData) {
        const marketData = Object.create(null);
        if (!rawMarketData || typeof rawMarketData !== "object" || Array.isArray(rawMarketData)) {
            return marketData;
        }
        for (const [itemHrid, levelMap] of Object.entries(rawMarketData)) {
            if (!itemHrid.startsWith("/items/")
                || !levelMap || typeof levelMap !== "object" || Array.isArray(levelMap)) {
                continue;
            }
            const sanitizedLevels = Object.create(null);
            for (const [rawLevel, rawQuote] of Object.entries(levelMap)) {
                const level = normalizeNonNegativeInteger(rawLevel);
                if (level == null || !rawQuote || typeof rawQuote !== "object" || Array.isArray(rawQuote)) {
                    continue;
                }
                const quote = Object.create(null);
                for (const field of ["a", "b"]) {
                    if (!Object.prototype.hasOwnProperty.call(rawQuote, field)) {
                        quote[field] = -1;
                        continue;
                    }
                    const price = parseFiniteNumber(rawQuote[field]);
                    if (price != null) {
                        quote[field] = price;
                    }
                }
                if (Object.keys(quote).length > 0) {
                    sanitizedLevels[String(level)] = quote;
                }
            }
            if (Object.keys(sanitizedLevels).length > 0) {
                marketData[itemHrid] = sanitizedLevels;
            }
        }
        return marketData;
    }

    function getOrderBookEdgePrice(entries, useLowestPrice) {
        if (!Array.isArray(entries)) {
            return null;
        }
        let edgePrice = null;
        for (const entry of entries) {
            const price = toPositiveNumber(entry?.price ?? entry);
            if (price == null) {
                continue;
            }
            if (edgePrice == null
                || (useLowestPrice ? price < edgePrice : price > edgePrice)) {
                edgePrice = price;
            }
        }
        return edgePrice ?? -1;
    }

    function normalizeMarketOrderBooksUpdate(payload) {
        const orderBookPayload = payload?.marketItemOrderBooks
            || payload?.data?.marketItemOrderBooks
            || payload;
        const itemHrid = String(orderBookPayload?.itemHrid || "").trim();
        if (!itemHrid.startsWith("/items/")) {
            return null;
        }

        const hasDirectOrderBook = Object.prototype.hasOwnProperty.call(orderBookPayload || {}, "asks")
            || Object.prototype.hasOwnProperty.call(orderBookPayload || {}, "bids");
        let rawOrderBooks = orderBookPayload?.orderBooks || null;
        if (!rawOrderBooks && hasDirectOrderBook) {
            const hasEnhancementLevel = Object.prototype.hasOwnProperty.call(
                orderBookPayload,
                "enhancementLevel",
            );
            const enhancementLevel = hasEnhancementLevel
                ? normalizeNonNegativeInteger(orderBookPayload.enhancementLevel)
                : 0;
            if (enhancementLevel == null) {
                return null;
            }
            rawOrderBooks = { [enhancementLevel]: orderBookPayload };
        }
        if (!rawOrderBooks || typeof rawOrderBooks !== "object") {
            return null;
        }

        const levelMap = Object.create(null);
        for (const [rawLevel, orderBook] of Object.entries(rawOrderBooks)) {
            const level = normalizeNonNegativeInteger(rawLevel);
            if (level == null || !orderBook || typeof orderBook !== "object") {
                continue;
            }
            const quote = Object.create(null);
            if (Object.prototype.hasOwnProperty.call(orderBook, "asks")) {
                const ask = getOrderBookEdgePrice(orderBook.asks, true);
                if (ask != null) {
                    quote.a = ask;
                }
            }
            if (Object.prototype.hasOwnProperty.call(orderBook, "bids")) {
                const bid = getOrderBookEdgePrice(orderBook.bids, false);
                if (bid != null) {
                    quote.b = bid;
                }
            }
            if (Object.keys(quote).length > 0) {
                levelMap[String(level)] = quote;
            }
        }
        return Object.keys(levelMap).length > 0 ? { itemHrid, levelMap } : null;
    }

    function mergeMarketDataLayers(snapshotData, liveData) {
        const merged = Object.create(null);
        for (const [itemHrid, levelMap] of Object.entries(snapshotData || {})) {
            if (!itemHrid.startsWith("/items/") || !levelMap || typeof levelMap !== "object") {
                continue;
            }
            merged[itemHrid] = Object.fromEntries(
                Object.entries(levelMap).map(([level, quote]) => [level, { ...(quote || {}) }]),
            );
        }

        for (const [itemHrid, liveEntry] of Object.entries(liveData || {})) {
            const levelMap = liveEntry?.levels;
            if (!itemHrid.startsWith("/items/") || !levelMap || typeof levelMap !== "object") {
                continue;
            }
            const mergedLevels = merged[itemHrid] || {};
            for (const [level, quotePatch] of Object.entries(levelMap)) {
                mergedLevels[level] = {
                    ...(mergedLevels[level] || {}),
                    ...(quotePatch || {}),
                };
            }
            merged[itemHrid] = mergedLevels;
        }
        return merged;
    }

    function rebuildEffectiveMarketData(state) {
        state.marketData = mergeMarketDataLayers(state.marketSnapshotData, state.marketLiveData);
    }

    function applyMarketOrderBooksUpdate(state, payload, source = "websocket") {
        const update = normalizeMarketOrderBooksUpdate(payload);
        if (!update) {
            return false;
        }
        const existing = state.marketLiveData[update.itemHrid];
        const levels = existing?.levels || Object.create(null);
        const receivedAtByLevel = existing?.receivedAtByLevel || Object.create(null);
        const revisionByLevel = existing?.revisionByLevel || Object.create(null);
        const snapshotTimestampByLevel = existing?.snapshotTimestampByLevel || Object.create(null);
        const snapshotConflictDeferredByLevel = existing?.snapshotConflictDeferredByLevel
            || Object.create(null);
        const previousReceivedAt = Number(existing?.receivedAt || 0);
        const previousRevision = normalizeNonNegativeInteger(existing?.revision, 0);
        const currentSnapshotTimestamp = Math.max(
            normalizeMarketTimestamp(state.marketTimestamp),
            normalizeMarketTimestamp(state.marketSnapshotCandidateTimestamp),
        );
        const previousSnapshotTimestamp = normalizeMarketTimestamp(existing?.snapshotTimestamp)
            || currentSnapshotTimestamp;
        for (const [level, quote] of Object.entries(levels)) {
            const fieldTimes = receivedAtByLevel[level] || Object.create(null);
            const fieldRevisions = revisionByLevel[level] || Object.create(null);
            const fieldSnapshotTimestamps = snapshotTimestampByLevel[level] || Object.create(null);
            const fieldSnapshotConflictDeferrals = snapshotConflictDeferredByLevel[level]
                || Object.create(null);
            for (const field of ["a", "b"]) {
                if (Object.prototype.hasOwnProperty.call(quote || {}, field)
                    && !Number.isFinite(Number(fieldTimes[field]))) {
                    fieldTimes[field] = previousReceivedAt;
                }
                if (Object.prototype.hasOwnProperty.call(quote || {}, field)
                    && normalizeNonNegativeInteger(fieldRevisions[field]) == null) {
                    fieldRevisions[field] = previousRevision;
                }
                if (Object.prototype.hasOwnProperty.call(quote || {}, field)
                    && !Object.prototype.hasOwnProperty.call(fieldSnapshotTimestamps, field)) {
                    fieldSnapshotTimestamps[field] = previousSnapshotTimestamp;
                }
                if (Object.prototype.hasOwnProperty.call(quote || {}, field)
                    && !Object.prototype.hasOwnProperty.call(fieldSnapshotConflictDeferrals, field)) {
                    fieldSnapshotConflictDeferrals[field] = false;
                }
            }
            receivedAtByLevel[level] = fieldTimes;
            revisionByLevel[level] = fieldRevisions;
            snapshotTimestampByLevel[level] = fieldSnapshotTimestamps;
            snapshotConflictDeferredByLevel[level] = fieldSnapshotConflictDeferrals;
        }
        const receivedAt = Date.now();
        const revision = Math.min(
            Number.MAX_SAFE_INTEGER,
            normalizeNonNegativeInteger(state.marketLiveRevision, 0) + 1,
        );
        state.marketLiveRevision = revision;
        for (const [level, quotePatch] of Object.entries(update.levelMap)) {
            levels[level] = {
                ...(levels[level] || {}),
                ...quotePatch,
            };
            const fieldTimes = receivedAtByLevel[level] || Object.create(null);
            const fieldRevisions = revisionByLevel[level] || Object.create(null);
            const fieldSnapshotTimestamps = snapshotTimestampByLevel[level] || Object.create(null);
            const fieldSnapshotConflictDeferrals = snapshotConflictDeferredByLevel[level]
                || Object.create(null);
            for (const field of ["a", "b"]) {
                if (Object.prototype.hasOwnProperty.call(quotePatch, field)) {
                    fieldTimes[field] = receivedAt;
                    fieldRevisions[field] = revision;
                    fieldSnapshotTimestamps[field] = currentSnapshotTimestamp;
                    fieldSnapshotConflictDeferrals[field] = false;
                }
            }
            receivedAtByLevel[level] = fieldTimes;
            revisionByLevel[level] = fieldRevisions;
            snapshotTimestampByLevel[level] = fieldSnapshotTimestamps;
            snapshotConflictDeferredByLevel[level] = fieldSnapshotConflictDeferrals;
        }
        state.marketLiveData[update.itemHrid] = {
            levels,
            receivedAt,
            revision,
            snapshotTimestamp: currentSnapshotTimestamp,
            receivedAtByLevel,
            revisionByLevel,
            snapshotTimestampByLevel,
            snapshotConflictDeferredByLevel,
        };
        state.marketLiveUpdatedAt = receivedAt;
        state.marketLiveSource = String(source || "websocket");
        rebuildEffectiveMarketData(state);
        state.render?.();
        return true;
    }

    function createMarketStructure(marketData) {
        return Object.entries(marketData || {})
            .map(([itemHrid, levelMap]) => [
                itemHrid,
                Object.entries(levelMap || {})
                    .filter(([_level, quote]) => (
                        quote && typeof quote === "object" && !Array.isArray(quote)
                    ))
                    .map(([level, quote]) => [
                        level,
                        ["a", "b"].filter((field) => (
                            Object.prototype.hasOwnProperty.call(quote, field)
                            && Number.isFinite(Number(quote[field]))
                        )),
                    ])
                    .sort((left, right) => left[0].localeCompare(right[0])),
            ])
            .sort((left, right) => left[0].localeCompare(right[0]));
    }

    function countMissingMarketEntries(confirmedMarketData, incomingMarketData) {
        const incomingItems = new Map(createMarketStructure(incomingMarketData));
        let missingCount = 0;
        for (const [itemHrid, confirmedLevels] of createMarketStructure(confirmedMarketData)) {
            const incomingLevels = incomingItems.get(itemHrid);
            if (!incomingLevels) {
                missingCount += 1 + confirmedLevels.reduce(
                    (total, [_level, fields]) => total + 1 + fields.length,
                    0,
                );
                continue;
            }

            const incomingLevelsByHrid = new Map(incomingLevels);
            for (const [level, confirmedFields] of confirmedLevels) {
                const incomingFields = incomingLevelsByHrid.get(level);
                if (!incomingFields) {
                    missingCount += 1 + confirmedFields.length;
                    continue;
                }
                for (const field of confirmedFields) {
                    if (!incomingFields.includes(field)) {
                        missingCount += 1;
                    }
                }
            }
        }
        return missingCount;
    }

    function hasMissingMarketEntries(confirmedMarketData, incomingMarketData) {
        return countMissingMarketEntries(confirmedMarketData, incomingMarketData) > 0;
    }

    function compareVersionTimestamps(left, right) {
        const normalizedLeft = String(left || "").trim();
        const normalizedRight = String(right || "").trim();
        if (normalizedLeft === normalizedRight) {
            return 0;
        }
        const leftTimestamp = normalizeMarketTimestamp(normalizedLeft);
        const rightTimestamp = normalizeMarketTimestamp(normalizedRight);
        if (!leftTimestamp || !rightTimestamp) {
            return null;
        }
        if (leftTimestamp === rightTimestamp) {
            return 0;
        }
        return leftTimestamp < rightTimestamp ? -1 : 1;
    }

    function canApplyVersionTimestamp(incomingVersion, currentVersion) {
        const normalizedIncomingVersion = String(incomingVersion || "").trim();
        const normalizedCurrentVersion = String(currentVersion || "").trim();
        if (!normalizedCurrentVersion) {
            return true;
        }
        const comparison = compareVersionTimestamps(
            normalizedIncomingVersion,
            normalizedCurrentVersion,
        );
        if (comparison != null) {
            return comparison >= 0;
        }
        return normalizeMarketTimestamp(normalizedCurrentVersion) === 0
            && Boolean(normalizedIncomingVersion);
    }

    function findClientData(payload) {
        const candidates = [
            payload,
            payload?.data,
            payload?.initClientData,
            payload?.initClientDataData,
            payload?.clientData,
            payload?.payload,
        ];

        for (const candidate of candidates) {
            const hasItemDetails = candidate?.itemDetailMap
                && typeof candidate.itemDetailMap === "object"
                && !Array.isArray(candidate.itemDetailMap)
                && Object.keys(candidate.itemDetailMap).length > 0;
            const hasGuildBuffDetails = candidate?.guildBuffDetailMap
                && typeof candidate.guildBuffDetailMap === "object"
                && !Array.isArray(candidate.guildBuffDetailMap)
                && Object.keys(candidate.guildBuffDetailMap).length > 0;
            if (candidate && typeof candidate === "object" && (hasItemDetails || hasGuildBuffDetails)) {
                return candidate;
            }
        }
        return null;
    }

    // LZ-String's UTF-16 decompressor. The game stores initClientData in this format.
    function decompressFromUTF16(input) {
        if (input == null) {
            return "";
        }
        if (input === "") {
            return null;
        }
        return lzDecompress(input.length, 16384, (index) => input.charCodeAt(index) - 32);
    }

    function lzDecompress(length, resetValue, getNextValue) {
        const dictionary = [];
        let next;
        let enlargeIn = 4;
        let dictSize = 4;
        let numBits = 3;
        let entry = "";
        const result = [];
        let index;
        let w;
        let bits;
        let resb;
        let maxpower;
        let power;
        let character;
        const data = { val: getNextValue(0), position: resetValue, index: 1 };

        for (index = 0; index < 3; index += 1) {
            dictionary[index] = index;
        }

        bits = 0;
        maxpower = Math.pow(2, 2);
        power = 1;
        while (power !== maxpower) {
            resb = data.val & data.position;
            data.position >>= 1;
            if (data.position === 0) {
                data.position = resetValue;
                data.val = getNextValue(data.index++);
            }
            bits |= (resb > 0 ? 1 : 0) * power;
            power <<= 1;
        }

        switch (bits) {
            case 0:
                bits = 0;
                maxpower = Math.pow(2, 8);
                power = 1;
                while (power !== maxpower) {
                    resb = data.val & data.position;
                    data.position >>= 1;
                    if (data.position === 0) {
                        data.position = resetValue;
                        data.val = getNextValue(data.index++);
                    }
                    bits |= (resb > 0 ? 1 : 0) * power;
                    power <<= 1;
                }
                character = String.fromCharCode(bits);
                break;
            case 1:
                bits = 0;
                maxpower = Math.pow(2, 16);
                power = 1;
                while (power !== maxpower) {
                    resb = data.val & data.position;
                    data.position >>= 1;
                    if (data.position === 0) {
                        data.position = resetValue;
                        data.val = getNextValue(data.index++);
                    }
                    bits |= (resb > 0 ? 1 : 0) * power;
                    power <<= 1;
                }
                character = String.fromCharCode(bits);
                break;
            case 2:
                return "";
            default:
                return null;
        }

        dictionary[3] = character;
        w = character;
        result.push(character);

        while (true) {
            if (data.index > length) {
                return "";
            }

            bits = 0;
            maxpower = Math.pow(2, numBits);
            power = 1;
            while (power !== maxpower) {
                resb = data.val & data.position;
                data.position >>= 1;
                if (data.position === 0) {
                    data.position = resetValue;
                    data.val = getNextValue(data.index++);
                }
                bits |= (resb > 0 ? 1 : 0) * power;
                power <<= 1;
            }

            switch ((character = bits)) {
                case 0:
                    bits = 0;
                    maxpower = Math.pow(2, 8);
                    power = 1;
                    while (power !== maxpower) {
                        resb = data.val & data.position;
                        data.position >>= 1;
                        if (data.position === 0) {
                            data.position = resetValue;
                            data.val = getNextValue(data.index++);
                        }
                        bits |= (resb > 0 ? 1 : 0) * power;
                        power <<= 1;
                    }
                    dictionary[dictSize++] = String.fromCharCode(bits);
                    character = dictSize - 1;
                    enlargeIn -= 1;
                    break;
                case 1:
                    bits = 0;
                    maxpower = Math.pow(2, 16);
                    power = 1;
                    while (power !== maxpower) {
                        resb = data.val & data.position;
                        data.position >>= 1;
                        if (data.position === 0) {
                            data.position = resetValue;
                            data.val = getNextValue(data.index++);
                        }
                        bits |= (resb > 0 ? 1 : 0) * power;
                        power <<= 1;
                    }
                    dictionary[dictSize++] = String.fromCharCode(bits);
                    character = dictSize - 1;
                    enlargeIn -= 1;
                    break;
                case 2:
                    return result.join("");
                default:
                    break;
            }

            if (enlargeIn === 0) {
                enlargeIn = Math.pow(2, numBits);
                numBits += 1;
            }

            if (dictionary[character]) {
                entry = dictionary[character];
            } else if (character === dictSize) {
                entry = w + w.charAt(0);
            } else {
                return null;
            }

            result.push(entry);
            dictionary[dictSize++] = w + entry.charAt(0);
            enlargeIn -= 1;
            w = entry;

            if (enlargeIn === 0) {
                enlargeIn = Math.pow(2, numBits);
                numBits += 1;
            }
        }
    }

    function decodeInitClientData(rawValue) {
        if (rawValue && typeof rawValue === "object") {
            return rawValue;
        }
        if (typeof rawValue !== "string" || rawValue.length === 0) {
            return null;
        }

        try {
            const direct = JSON.parse(rawValue);
            if (direct && typeof direct === "object") {
                return direct;
            }
            if (typeof direct === "string" && direct.length > 0) {
                const nested = decompressFromUTF16(direct);
                return nested ? JSON.parse(nested) : null;
            }
        } catch (_error) {
        }

        try {
            const decompressed = decompressFromUTF16(rawValue);
            return decompressed ? JSON.parse(decompressed) : null;
        } catch (_error) {
            return null;
        }
    }

    function escapeHtml(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function normalizeSearchText(value) {
        return String(value || "").trim().replace(/\s+/g, " ").toLocaleLowerCase();
    }

    function rowMatchesSearch(row, searchText, itemNames = {}) {
        if (!searchText) {
            return true;
        }
        const credit = getCreditDefinition(row.creditHrid, row.creditName);
        return [
            resolveLocalizedItemName(itemNames, row.itemHrid, row.itemName),
            row.itemName,
            row.itemHrid,
            row.creditName,
            getCreditLabel(credit, LANGUAGE_EN),
            getCreditLabel(credit, LANGUAGE_ZH),
        ]
            .some((value) => normalizeSearchText(value).includes(searchText));
    }

    function tryGmGetValue(key, fallbackValue) {
        try {
            if (typeof GM_getValue === "function") {
                return { ok: true, value: GM_getValue(key, fallbackValue) };
            }
        } catch (_error) {
        }
        return { ok: false, value: fallbackValue };
    }

    function gmGetValue(key, fallbackValue) {
        const result = tryGmGetValue(key, fallbackValue);
        return result.ok ? result.value : fallbackValue;
    }

    function gmSetValue(key, value) {
        try {
            if (typeof GM_setValue === "function") {
                GM_setValue(key, value);
                return true;
            }
        } catch (_error) {
        }
        return false;
    }

    function clearRemovedDataCaches() {
        if (typeof GM_deleteValue !== "function") {
            return;
        }
        for (const key of REMOVED_DATA_CACHE_KEYS) {
            try {
                GM_deleteValue(key);
            } catch (_error) {
            }
        }
    }

    function normalizeSettings(raw) {
        const hasExplicitLanguage = raw?.uiLanguageExplicit === true;
        const hasTargetCreditAmount = Object.prototype.hasOwnProperty.call(raw || {}, "targetCreditAmount");
        const hasTokenTargetCreditAmount = Object.prototype.hasOwnProperty.call(raw || {}, "tokenTargetCreditAmount");
        return {
            activeView: normalizeAppView(raw?.activeView),
            priceMode: normalizePriceMode(raw?.priceMode),
            selectedCredit: typeof raw?.selectedCredit === "string" ? raw.selectedCredit : OVERVIEW_CREDIT,
            selectedTokenCredit: typeof raw?.selectedTokenCredit === "string"
                ? raw.selectedTokenCredit
                : DEFAULT_TOKEN_CREDIT_HRID,
            selectedGuildBuffHrid: typeof raw?.selectedGuildBuffHrid === "string" ? raw.selectedGuildBuffHrid : "",
            shrineFromLevel: normalizeNonNegativeInteger(raw?.shrineFromLevel, DEFAULT_SHRINE_FROM_LEVEL),
            shrineToLevel: normalizeNonNegativeInteger(raw?.shrineToLevel, DEFAULT_SHRINE_TO_LEVEL),
            showUnquoted: raw?.showUnquoted === true,
            includeEnhancedQuotes: raw?.includeEnhancedQuotes === true,
            targetCreditAmount: hasTargetCreditAmount
                ? normalizeTargetCreditAmount(raw?.targetCreditAmount)
                : DEFAULT_TARGET_CREDIT_AMOUNT,
            tokenTargetCreditAmount: hasTokenTargetCreditAmount
                ? normalizeTargetCreditAmount(raw?.tokenTargetCreditAmount)
                : DEFAULT_TARGET_CREDIT_AMOUNT,
            panelPosition: normalizePanelPosition(raw?.panelPosition),
            uiLanguage: hasExplicitLanguage && raw?.uiLanguage
                ? normalizeUiLanguage(raw.uiLanguage)
                : LANGUAGE_ZH,
            uiLanguageExplicit: hasExplicitLanguage,
        };
    }

    function loadSettings() {
        return normalizeSettings(gmGetValue(SETTINGS_KEY, {}));
    }

    const SETTINGS_FIELDS = Object.freeze([
        "activeView",
        "priceMode",
        "selectedCredit",
        "selectedTokenCredit",
        "selectedGuildBuffHrid",
        "shrineFromLevel",
        "shrineToLevel",
        "showUnquoted",
        "includeEnhancedQuotes",
        "targetCreditAmount",
        "tokenTargetCreditAmount",
        "panelPosition",
        "uiLanguage",
        "uiLanguageExplicit",
    ]);

    function createSettingsPayload(source) {
        return Object.fromEntries(SETTINGS_FIELDS.map((field) => [
            field,
            field === "panelPosition"
                ? normalizePanelPosition(source?.[field])
                : source?.[field],
        ]));
    }

    function settingsValuesEqual(field, left, right) {
        if (field !== "panelPosition") {
            return Object.is(left, right);
        }
        const normalizedLeft = normalizePanelPosition(left);
        const normalizedRight = normalizePanelPosition(right);
        return normalizedLeft == null || normalizedRight == null
            ? normalizedLeft === normalizedRight
            : normalizedLeft.x === normalizedRight.x && normalizedLeft.y === normalizedRight.y;
    }

    function syncExternallyChangedSettings(state, fields) {
        const baseline = state?.settingsBaseline;
        if (!baseline || typeof baseline !== "object") {
            return { ok: true, fields: [] };
        }
        let latestSettingsResult = tryGmGetValue(SETTINGS_KEY, {});
        if (!latestSettingsResult.ok) {
            latestSettingsResult = tryGmGetValue(SETTINGS_KEY, {});
        }
        if (!latestSettingsResult.ok
            || !latestSettingsResult.value
            || typeof latestSettingsResult.value !== "object"
            || Array.isArray(latestSettingsResult.value)) {
            return { ok: false, fields: [] };
        }
        const latestSettings = normalizeSettings(latestSettingsResult.value);
        const currentSettings = createSettingsPayload(state);
        const synchronizedFields = [];
        for (const field of fields) {
            if (!SETTINGS_FIELDS.includes(field)
                || !settingsValuesEqual(field, currentSettings[field], baseline[field])
                || settingsValuesEqual(field, latestSettings[field], baseline[field])) {
                continue;
            }
            const value = field === "panelPosition"
                ? normalizePanelPosition(latestSettings[field])
                : latestSettings[field];
            state[field] = value;
            baseline[field] = value;
            synchronizedFields.push(field);
        }
        return { ok: true, fields: synchronizedFields };
    }

    function updateSettingsBaseline(state, fields) {
        if (!state?.settingsBaseline || typeof state.settingsBaseline !== "object") {
            return;
        }
        const currentSettings = createSettingsPayload(state);
        for (const field of fields) {
            if (SETTINGS_FIELDS.includes(field)) {
                state.settingsBaseline[field] = currentSettings[field];
            }
        }
    }

    function persistSettings(state) {
        const currentSettings = createSettingsPayload(state);
        const baseline = state.settingsBaseline && typeof state.settingsBaseline === "object"
            ? state.settingsBaseline
            : null;
        const changedFields = SETTINGS_FIELDS.filter((field) => (
            !baseline || !settingsValuesEqual(field, currentSettings[field], baseline[field])
        ));
        if (changedFields.length === 0) {
            state.settingsDirty = false;
            return true;
        }

        const latestSettingsResult = tryGmGetValue(SETTINGS_KEY, {});
        if (!latestSettingsResult.ok) {
            state.settingsDirty = true;
            return false;
        }
        const latestRawSettings = latestSettingsResult.value;
        const mergedSettings = latestRawSettings
            && typeof latestRawSettings === "object"
            && !Array.isArray(latestRawSettings)
            ? { ...latestRawSettings }
            : {};
        for (const field of changedFields) {
            mergedSettings[field] = currentSettings[field];
        }
        if (!gmSetValue(SETTINGS_KEY, mergedSettings)) {
            state.settingsDirty = true;
            return false;
        }
        state.settingsBaseline = createSettingsPayload(currentSettings);
        state.settingsDirty = false;
        return true;
    }

    function flushPendingSettings(state) {
        if (!state?.settingsDirty) {
            return false;
        }
        return persistSettings(state);
    }

    function loadItemNamesCache() {
        const payload = gmGetValue(ITEM_NAMES_ZH_CACHE_KEY, null);
        const itemNames = sanitizeItemNameDictionary(payload?.itemNames);
        return Object.keys(itemNames).length > 0 ? {
            itemNames,
            source: String(payload?.source || payload?.sourceUrl || "game-cache"),
        } : null;
    }

    function createRuntimeState() {
        clearRemovedDataCaches();
        const settings = loadSettings();
        const cachedItemNames = loadItemNamesCache();
        const state = {
            catalog: [],
            catalogVersion: "",
            catalogSource: "",
            catalogCandidateCount: 0,
            catalogCandidateVersion: "",
            catalogCandidateSignature: "",
            catalogCandidateConfirmations: 0,
            catalogCandidateSources: [],
            guildBuffs: [],
            guildBuffVersion: "",
            guildBuffSource: "",
            guildBuffsStale: false,
            guildBuffCompleteHrids: [],
            guildBuffCandidateCount: 0,
            guildBuffCandidateVersion: "",
            guildBuffCandidateSignature: "",
            guildBuffCandidateConfirmations: 0,
            guildBuffCandidateSources: [],
            catalogError: "",
            marketSnapshotData: Object.create(null),
            marketLiveData: Object.create(null),
            marketData: {},
            marketTimestamp: 0,
            marketFetchedAt: 0,
            marketSourceUrl: "",
            marketLiveUpdatedAt: 0,
            marketLiveSource: "",
            marketLiveRevision: 0,
            marketLoading: false,
            marketError: "",
            marketRefreshCooldownUntil: 0,
            marketRefreshCooldownTimer: null,
            marketSnapshotCandidateSignature: "",
            marketSnapshotCandidateTimestamp: 0,
            marketSnapshotCandidateConfirmations: 0,
            spriteUrl: "",
            miscSpriteUrl: "",
            itemNamesZh: cachedItemNames?.itemNames || {},
            itemNamesSource: cachedItemNames?.source || "",
            activeView: settings.activeView,
            uiLanguage: settings.uiLanguage,
            uiLanguageExplicit: settings.uiLanguageExplicit,
            priceMode: settings.priceMode,
            selectedCredit: settings.selectedCredit,
            pendingSelectedCredit: "",
            selectedTokenCredit: settings.selectedTokenCredit,
            selectedGuildBuffHrid: settings.selectedGuildBuffHrid,
            shrineFromLevel: settings.shrineFromLevel,
            shrineToLevel: settings.shrineToLevel,
            showUnquoted: settings.showUnquoted,
            includeEnhancedQuotes: settings.includeEnhancedQuotes,
            targetCreditAmount: settings.targetCreditAmount,
            tokenTargetCreditAmount: settings.tokenTargetCreditAmount,
            panelPosition: settings.panelPosition,
            settingsBaseline: createSettingsPayload(settings),
            settingsDirty: false,
            dragState: null,
            panelResizeFrameId: null,
            searchText: "",
            visibleRows: INITIAL_VISIBLE_ROWS,
            isOpen: false,
            ui: null,
            render: null,
            donationAssistantUi: null,
            donationAssistantObserver: null,
            donationAssistantFrameId: null,
            donationAssistantForceRender: false,
            donationAssistantListenersInstalled: false,
            donationAssistantDragListenersInstalled: false,
            donationAssistantDragState: null,
            donationAssistantPosition: null,
            clientDataStorageSyncTimer: null,
            pageWindow: null,
            instrumentedSockets: new WeakSet(),
            menuCommandIds: [],
            guildBuffSnapshotCommitted: false,
        };
        const selectedCreditBeforeValidation = state.selectedCredit;
        validateSelectedCredit(state);
        if (state.selectedCredit !== selectedCreditBeforeValidation) {
            state.pendingSelectedCredit = selectedCreditBeforeValidation;
        }
        return state;
    }

    function clearGuildBuffCandidate(state) {
        state.guildBuffCandidateCount = 0;
        state.guildBuffCandidateVersion = "";
        state.guildBuffCandidateSignature = "";
        state.guildBuffCandidateConfirmations = 0;
        state.guildBuffCandidateSources = [];
    }

    function clearDonationCatalogCandidate(state) {
        state.catalogCandidateCount = 0;
        state.catalogCandidateVersion = "";
        state.catalogCandidateSignature = "";
        state.catalogCandidateConfirmations = 0;
        state.catalogCandidateSources = [];
    }

    function addCandidateSource(existingSources, source) {
        const sourceKey = String(source || "unknown").trim() || "unknown";
        return Array.from(new Set([
            ...(Array.isArray(existingSources) ? existingSources : []),
            sourceKey,
        ])).slice(0, 2);
    }

    function applyDonationCatalogSnapshot(state, resolved, source, incomingVersion) {
        if (!resolved?.itemDetailMap || typeof resolved.itemDetailMap !== "object"
            || Array.isArray(resolved.itemDetailMap)
            || Object.keys(resolved.itemDetailMap).length === 0
            || !canApplyVersionTimestamp(incomingVersion, state.catalogVersion)) {
            return false;
        }

        const catalog = normalizeDonationCatalog(resolved.itemDetailMap);
        if (catalog.length === 0) {
            return false;
        }

        const requiresConfirmation = state.catalog.length > 0
            && hasMissingDonationCatalogEntries(state.catalog, catalog);
        const matchesConfirmedVersion = Boolean(state.catalogVersion)
            && compareVersionTimestamps(incomingVersion, state.catalogVersion) === 0;
        if (requiresConfirmation && matchesConfirmedVersion) {
            return false;
        }
        const signature = createDonationCatalogSnapshotSignature(incomingVersion, catalog);
        const matchesCandidate = requiresConfirmation
            && state.catalogCandidateVersion === incomingVersion
            && state.catalogCandidateSignature === signature
            && state.catalogCandidateCount > 0;
        const candidateSources = addCandidateSource(
            matchesCandidate ? state.catalogCandidateSources : [],
            source,
        );
        const candidateConfirmations = candidateSources.length;
        if (requiresConfirmation && candidateConfirmations < 2) {
            state.catalogCandidateCount = catalog.length;
            state.catalogCandidateVersion = incomingVersion;
            state.catalogCandidateSignature = signature;
            state.catalogCandidateConfirmations = candidateConfirmations;
            state.catalogCandidateSources = candidateSources;
            state.catalogError = "";
            return true;
        }

        state.catalog = catalog;
        state.catalogVersion = incomingVersion;
        state.catalogSource = source;
        state.catalogError = "";
        clearDonationCatalogCandidate(state);

        const synchronizedSettings = syncExternallyChangedSettings(state, [
            "selectedCredit",
            "selectedTokenCredit",
        ]);
        if (synchronizedSettings.fields.includes("selectedCredit")) {
            state.pendingSelectedCredit = "";
        }
        const pendingSelectedCredit = String(state.pendingSelectedCredit || "");
        const selectedCreditBeforeValidation = state.selectedCredit;
        const selectedTokenCreditBeforeValidation = state.selectedTokenCredit;
        if (pendingSelectedCredit && state.catalog.some((item) => (
            item.creditHrid === pendingSelectedCredit
        ))) {
            state.selectedCredit = pendingSelectedCredit;
        }
        state.pendingSelectedCredit = "";
        validateSelectedCredit(state);
        validateSelectedTokenCredit(state);
        const pendingSelectionWasInvalid = pendingSelectedCredit
            && state.selectedCredit !== pendingSelectedCredit;
        const currentSelectionBecameInvalid = !pendingSelectedCredit
            && state.selectedCredit !== selectedCreditBeforeValidation;
        if (pendingSelectionWasInvalid || currentSelectionBecameInvalid
            || state.selectedTokenCredit !== selectedTokenCreditBeforeValidation) {
            if (synchronizedSettings.ok) {
                persistSettings(state);
            } else {
                updateSettingsBaseline(state, [
                    ...(pendingSelectionWasInvalid || currentSelectionBecameInvalid
                        ? ["selectedCredit"]
                        : []),
                    ...(state.selectedTokenCredit !== selectedTokenCreditBeforeValidation
                        ? ["selectedTokenCredit"]
                        : []),
                ]);
            }
        }
        return true;
    }

    function applyGuildBuffSnapshot(state, resolved, source, incomingVersion) {
        if (!resolved?.guildBuffDetailMap || typeof resolved.guildBuffDetailMap !== "object"
            || Array.isArray(resolved.guildBuffDetailMap)
            || Object.keys(resolved.guildBuffDetailMap).length === 0
            || !canApplyVersionTimestamp(incomingVersion, state.guildBuffVersion)) {
            return false;
        }

        const incomingGuildBuffs = normalizeGuildBuffCatalog(
            resolved.guildBuffDetailMap,
            resolved.guildShrineDetailMap,
        );
        const confirmedGuildBuffs = Array.isArray(state.guildBuffs) ? state.guildBuffs : [];
        const completeGuildBuffHrids = normalizeGuildBuffHridList(
            state.guildBuffCompleteHrids,
            confirmedGuildBuffs,
        );
        const matchesConfirmedVersion = Boolean(state.guildBuffVersion)
            && compareVersionTimestamps(incomingVersion, state.guildBuffVersion) === 0;
        if (incomingGuildBuffs.length === 0) {
            if (matchesConfirmedVersion
                && (confirmedGuildBuffs.length > 0 || completeGuildBuffHrids.length > 0)) {
                return false;
            }
            state.guildBuffsStale = confirmedGuildBuffs.length > 0
                || completeGuildBuffHrids.length > 0;
            return true;
        }

        const incomingGuildBuffHrids = normalizeGuildBuffHridList(null, incomingGuildBuffs);
        const snapshotAnalysis = analyzeGuildBuffSnapshot(
            confirmedGuildBuffs,
            completeGuildBuffHrids,
            incomingGuildBuffs,
        );
        const requiresGuildBuffConfirmation = snapshotAnalysis.requiresConfirmation;
        const hasIncompleteGuildBuffCosts = snapshotAnalysis.hasIncompleteLevelCosts;
        const isSuspiciousGuildBuffSnapshot = requiresGuildBuffConfirmation
            || hasIncompleteGuildBuffCosts;
        if (isSuspiciousGuildBuffSnapshot && matchesConfirmedVersion) {
            return false;
        }
        const incomingGuildBuffSignature = createGuildBuffSnapshotSignature(
            incomingVersion,
            incomingGuildBuffs,
        );
        const matchesStagedCandidate = isSuspiciousGuildBuffSnapshot
            && state.guildBuffCandidateVersion === incomingVersion
            && state.guildBuffCandidateSignature === incomingGuildBuffSignature
            && state.guildBuffCandidateCount > 0;
        const candidateSources = hasIncompleteGuildBuffCosts
            ? addCandidateSource([], source)
            : addCandidateSource(
                matchesStagedCandidate ? state.guildBuffCandidateSources : [],
                source,
            );
        const candidateConfirmations = candidateSources.length;
        const isConfirmedReplacement = requiresGuildBuffConfirmation
            && !hasIncompleteGuildBuffCosts
            && candidateConfirmations >= 2;
        const shouldStageGuildBuffUpdate = hasIncompleteGuildBuffCosts
            || (requiresGuildBuffConfirmation && !isConfirmedReplacement);
        if (shouldStageGuildBuffUpdate) {
            state.guildBuffs = confirmedGuildBuffs;
            state.guildBuffsStale = confirmedGuildBuffs.length > 0
                || completeGuildBuffHrids.length > 0;
            state.guildBuffCompleteHrids = completeGuildBuffHrids;
            state.guildBuffCandidateCount = incomingGuildBuffs.length;
            state.guildBuffCandidateVersion = incomingVersion;
            state.guildBuffCandidateSignature = incomingGuildBuffSignature;
            state.guildBuffCandidateConfirmations = candidateConfirmations;
            state.guildBuffCandidateSources = candidateSources;
        } else {
            state.guildBuffs = incomingGuildBuffs;
            state.guildBuffVersion = incomingVersion;
            state.guildBuffSource = source;
            state.guildBuffsStale = false;
            state.guildBuffCompleteHrids = incomingGuildBuffHrids;
            clearGuildBuffCandidate(state);
            state.guildBuffSnapshotCommitted = true;
        }
        return true;
    }

    function applyClientData(state, clientData, source) {
        const resolved = findClientData(clientData);
        if (!resolved) {
            return false;
        }

        const incomingVersion = String(
            resolved.versionTimestamp ?? clientData?.versionTimestamp ?? "",
        ).trim();
        state.guildBuffSnapshotCommitted = false;
        const donationHandled = applyDonationCatalogSnapshot(state, resolved, source, incomingVersion);
        const shrineHandled = applyGuildBuffSnapshot(state, resolved, source, incomingVersion);
        if (!donationHandled && !shrineHandled) {
            return false;
        }

        const shrineSettingsSync = state.guildBuffSnapshotCommitted
            ? syncExternallyChangedSettings(state, [
                "selectedGuildBuffHrid",
                "shrineFromLevel",
                "shrineToLevel",
            ])
            : { ok: true, fields: [] };
        const shrineSelectionBeforeValidation = {
            selectedGuildBuffHrid: state.selectedGuildBuffHrid,
            shrineFromLevel: state.shrineFromLevel,
            shrineToLevel: state.shrineToLevel,
        };
        validateShrineSelection(state);
        const shrineLevelsChanged = state.shrineFromLevel !== shrineSelectionBeforeValidation.shrineFromLevel
            || state.shrineToLevel !== shrineSelectionBeforeValidation.shrineToLevel;
        const shrineSelectionChanged = state.selectedGuildBuffHrid
            !== shrineSelectionBeforeValidation.selectedGuildBuffHrid;
        const savedShrineWasReplaced = Boolean(shrineSelectionBeforeValidation.selectedGuildBuffHrid)
            && shrineSelectionChanged;
        if (shrineHandled && (shrineLevelsChanged || savedShrineWasReplaced)) {
            if (shrineSettingsSync.ok) {
                persistSettings(state);
            } else {
                updateSettingsBaseline(state, [
                    ...(shrineSelectionChanged ? ["selectedGuildBuffHrid"] : []),
                    ...(shrineLevelsChanged ? ["shrineFromLevel", "shrineToLevel"] : []),
                ]);
            }
        } else if (shrineHandled && shrineSelectionChanged) {
            updateSettingsBaseline(state, ["selectedGuildBuffHrid"]);
        }
        state.render?.();
        return true;
    }

    function loadClientDataFromLocalStorage(state) {
        try {
            const rawValue = state.pageWindow?.localStorage?.getItem(GAME_DATA_STORAGE_KEY);
            const decoded = decodeInitClientData(rawValue);
            const applied = applyClientData(state, decoded, "game-storage");
            if (state.catalog.length === 0) {
                state.catalogError = "catalogNotReady";
                state.render?.();
            }
            if (applied) {
                return true;
            }
        } catch (error) {
            state.catalogError = "catalogReadFailed";
            state.render?.();
            console.warn(`[${SCRIPT_ID}] Failed to read initClientData`, error);
        }
        return false;
    }

    function scheduleClientDataStorageSync(state) {
        const timerHost = state.pageWindow;
        if (!timerHost || typeof timerHost.setTimeout !== "function") {
            return false;
        }
        if (state.clientDataStorageSyncTimer != null) {
            timerHost.clearTimeout?.(state.clientDataStorageSyncTimer);
        }
        state.clientDataStorageSyncTimer = timerHost.setTimeout(() => {
            state.clientDataStorageSyncTimer = null;
            loadClientDataFromLocalStorage(state);
        }, 0);
        return true;
    }

    function findSocketClientData(payload) {
        if (!payload || typeof payload !== "object") {
            return null;
        }

        const envelopeType = String(payload.type || "").trim();
        if (envelopeType && envelopeType !== "init_client_data") {
            return null;
        }

        const clientData = findClientData(payload);
        if (!clientData) {
            return null;
        }
        const clientDataType = String(clientData.type || "").trim();
        if (clientDataType && clientDataType !== "init_client_data") {
            return null;
        }

        if (!envelopeType && !clientDataType) {
            const isDirectCompleteSnapshot = clientData === payload
                && clientData.itemDetailMap
                && typeof clientData.itemDetailMap === "object"
                && !Array.isArray(clientData.itemDetailMap)
                && Object.keys(clientData.itemDetailMap).length > 0
                && clientData.guildBuffDetailMap
                && typeof clientData.guildBuffDetailMap === "object"
                && !Array.isArray(clientData.guildBuffDetailMap)
                && Object.keys(clientData.guildBuffDetailMap).length > 0;
            if (!isDirectCompleteSnapshot) {
                return null;
            }
        }
        return clientData;
    }

    function parseSocketPayload(state, rawValue, source = "websocket") {
        if (typeof rawValue !== "string" || rawValue.length === 0) {
            return;
        }

        try {
            const payload = JSON.parse(rawValue);
            if (String(payload?.type || "").trim() === "market_item_order_books_updated") {
                applyMarketOrderBooksUpdate(state, payload, source);
                return;
            }
            const clientData = findSocketClientData(payload);
            if (clientData) {
                applyClientData(state, payload, source);
                discoverPassiveGameResources(state);
                // The game writes the same init payload to localStorage later in this event dispatch.
                scheduleClientDataStorageSync(state);
            }
        } catch (_error) {
        }
    }

    function isGameWebSocketUrl(value) {
        try {
            const url = new URL(String(value || ""));
            return url.protocol === "wss:"
                && /^api(?:-test)?\.milkywayidle(?:cn)?\.com$/i.test(url.hostname);
        } catch (_error) {
            return false;
        }
    }

    function instrumentSocket(state, socket) {
        if (!socket || !isGameWebSocketUrl(socket.url)
            || typeof socket.addEventListener !== "function" || state.instrumentedSockets.has(socket)) {
            return socket;
        }

        state.instrumentedSockets.add(socket);
        socket.addEventListener("message", (event) => {
            parseSocketPayload(state, event?.data, "websocket");
        });
        return socket;
    }

    function installWebSocketBridge(state) {
        const pageWindow = state.pageWindow;
        const NativeWebSocket = pageWindow?.WebSocket;
        if (typeof NativeWebSocket !== "function" || NativeWebSocket.__mwiGuildDonationWrapped === true) {
            return false;
        }

        function WrappedWebSocket(url, protocols) {
            const socket = protocols === undefined
                ? new NativeWebSocket(url)
                : new NativeWebSocket(url, protocols);
            return instrumentSocket(state, socket);
        }

        WrappedWebSocket.prototype = NativeWebSocket.prototype;
        try {
            Object.setPrototypeOf(WrappedWebSocket, NativeWebSocket);
        } catch (_error) {
        }

        for (const constant of ["CONNECTING", "OPEN", "CLOSING", "CLOSED"]) {
            try {
                Object.defineProperty(WrappedWebSocket, constant, {
                    configurable: true,
                    enumerable: true,
                    value: NativeWebSocket[constant],
                });
            } catch (_error) {
            }
        }

        Object.defineProperty(WrappedWebSocket, "__mwiGuildDonationWrapped", { value: true });
        Object.defineProperty(WrappedWebSocket, "__mwiGuildDonationNative", { value: NativeWebSocket });

        try {
            pageWindow.WebSocket = WrappedWebSocket;
            return true;
        } catch (error) {
            console.warn(`[${SCRIPT_ID}] Failed to install WebSocket bridge`, error);
            return false;
        }
    }

    async function fetchWithTimeout(
        url,
        options = {},
        timeoutMs = JSON_REQUEST_TIMEOUT_MS,
        fetchImplementation = null,
        responseHandler = null,
    ) {
        const request = fetchImplementation || (typeof fetch === "function" ? fetch : null);
        if (typeof request !== "function") {
            throw new Error("fetch is unavailable.");
        }

        const parsedTimeout = Number(timeoutMs);
        const safeTimeout = Number.isFinite(parsedTimeout) && parsedTimeout > 0
            ? parsedTimeout
            : JSON_REQUEST_TIMEOUT_MS;
        const controller = typeof AbortController === "function" ? new AbortController() : null;
        const requestOptions = controller ? { ...options, signal: controller.signal } : { ...options };
        const timeoutError = new Error(`Network request timed out after ${safeTimeout}ms.`);
        timeoutError.name = "TimeoutError";
        let timedOut = false;
        let timeoutId = null;

        const timeoutPromise = new Promise((_resolve, reject) => {
            timeoutId = setTimeout(() => {
                timedOut = true;
                controller?.abort();
                reject(timeoutError);
            }, safeTimeout);
        });
        const requestPromise = Promise.resolve()
            .then(() => request(url, requestOptions))
            .then((response) => (
                typeof responseHandler === "function" ? responseHandler(response) : response
            ));

        try {
            return await Promise.race([
                requestPromise,
                timeoutPromise,
            ]);
        } catch (error) {
            throw timedOut ? timeoutError : error;
        } finally {
            if (timeoutId != null) {
                clearTimeout(timeoutId);
            }
        }
    }

    async function requestJson(url) {
        if (typeof fetch !== "function") {
            throw new Error("fetch is unavailable.");
        }
        return fetchWithTimeout(
            url,
            {
                cache: "no-store",
                credentials: "omit",
                mode: "cors",
            },
            JSON_REQUEST_TIMEOUT_MS,
            null,
            async (response) => {
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                return response.json();
            },
        );
    }

    function getCurrentGameOrigin() {
        try {
            const currentLocation = typeof location === "object" && location ? location : null;
            const url = new URL(String(currentLocation?.origin || currentLocation?.href || ""));
            if (url.protocol === "https:"
                && /^(?:www\.)?milkywayidle(?:cn)?\.com$/i.test(url.hostname)) {
                return url.origin;
            }
        } catch (_error) {
        }
        return "";
    }

    function clearMarketSnapshotCandidate(state) {
        state.marketSnapshotCandidateSignature = "";
        state.marketSnapshotCandidateTimestamp = 0;
        state.marketSnapshotCandidateConfirmations = 0;
    }

    function confirmMissingMarketSnapshot(state, marketData, marketTimestamp) {
        const signature = JSON.stringify(createMarketStructure(marketData));
        const normalizedTimestamp = normalizeMarketTimestamp(marketTimestamp);
        const matchesCandidate = state.marketSnapshotCandidateSignature === signature
            && normalizedTimestamp >= state.marketSnapshotCandidateTimestamp;
        state.marketSnapshotCandidateSignature = signature;
        state.marketSnapshotCandidateTimestamp = normalizedTimestamp;
        state.marketSnapshotCandidateConfirmations = matchesCandidate
            ? Math.min(2, state.marketSnapshotCandidateConfirmations + 1)
            : 1;
        return state.marketSnapshotCandidateConfirmations >= 2;
    }

    function expireMarketLiveQuotes(
        state,
        marketData,
        marketTimestamp,
        liveRevisionAtRequestStart,
    ) {
        const normalizedTimestamp = normalizeMarketTimestamp(marketTimestamp);
        const coveredRevision = normalizeNonNegativeInteger(liveRevisionAtRequestStart, 0);
        if (normalizedTimestamp <= 0) {
            return;
        }
        for (const [itemHrid, liveEntry] of Object.entries(state.marketLiveData || {})) {
            const levels = liveEntry?.levels;
            if (!levels || typeof levels !== "object") {
                delete state.marketLiveData[itemHrid];
                continue;
            }
            const fallbackReceivedAt = Number(liveEntry?.receivedAt || 0);
            const fallbackRevision = normalizeNonNegativeInteger(liveEntry?.revision, 0);
            const fallbackSnapshotTimestamp = normalizeMarketTimestamp(liveEntry?.snapshotTimestamp);
            const receivedAtByLevel = liveEntry?.receivedAtByLevel || Object.create(null);
            const revisionByLevel = liveEntry?.revisionByLevel || Object.create(null);
            const snapshotTimestampByLevel = liveEntry?.snapshotTimestampByLevel || Object.create(null);
            const snapshotConflictDeferredByLevel = liveEntry?.snapshotConflictDeferredByLevel
                || Object.create(null);
            const snapshotLevels = marketData?.[itemHrid];
            let latestReceivedAt = 0;
            let latestRevision = 0;
            let latestSnapshotTimestamp = 0;
            for (const [level, quote] of Object.entries(levels)) {
                const fieldTimes = receivedAtByLevel[level] || Object.create(null);
                const fieldRevisions = revisionByLevel[level] || Object.create(null);
                const fieldSnapshotTimestamps = snapshotTimestampByLevel[level] || Object.create(null);
                const fieldSnapshotConflictDeferrals = snapshotConflictDeferredByLevel[level]
                    || Object.create(null);
                const snapshotQuote = snapshotLevels?.[level];
                for (const field of ["a", "b"]) {
                    if (!Object.prototype.hasOwnProperty.call(quote || {}, field)) {
                        continue;
                    }
                    const fieldReceivedAt = Number.isFinite(Number(fieldTimes[field]))
                        ? Number(fieldTimes[field])
                        : fallbackReceivedAt;
                    const fieldRevision = normalizeNonNegativeInteger(
                        fieldRevisions[field],
                        fallbackRevision,
                    );
                    const fieldSnapshotTimestamp = Object.prototype.hasOwnProperty.call(
                        fieldSnapshotTimestamps,
                        field,
                    )
                        ? normalizeMarketTimestamp(fieldSnapshotTimestamps[field])
                        : fallbackSnapshotTimestamp;
                    const snapshotHasField = Object.prototype.hasOwnProperty.call(
                        snapshotQuote || {},
                        field,
                    );
                    const snapshotMatchesLive = snapshotHasField
                        && Number(snapshotQuote[field]) === Number(quote[field]);
                    const arrivedDuringRequest = fieldRevision > coveredRevision;
                    const snapshotIsNewer = normalizedTimestamp > fieldSnapshotTimestamp;
                    const conflictWasDeferred = fieldSnapshotConflictDeferrals[field] === true;
                    // The static snapshot may have been generated before a conflicting WebSocket update arrived.
                    const shouldDeferConflict = !snapshotMatchesLive
                        && (arrivedDuringRequest || (snapshotIsNewer && !conflictWasDeferred));
                    const isCoveredBySnapshot = snapshotMatchesLive
                        || (!arrivedDuringRequest && snapshotIsNewer && conflictWasDeferred);
                    if (isCoveredBySnapshot) {
                        delete quote[field];
                        delete fieldTimes[field];
                        delete fieldRevisions[field];
                        delete fieldSnapshotTimestamps[field];
                        delete fieldSnapshotConflictDeferrals[field];
                    } else {
                        const nextSnapshotTimestamp = shouldDeferConflict
                            ? Math.max(fieldSnapshotTimestamp, normalizedTimestamp)
                            : fieldSnapshotTimestamp;
                        fieldTimes[field] = fieldReceivedAt;
                        fieldRevisions[field] = fieldRevision;
                        fieldSnapshotTimestamps[field] = nextSnapshotTimestamp;
                        fieldSnapshotConflictDeferrals[field] = shouldDeferConflict
                            || conflictWasDeferred;
                        latestReceivedAt = Math.max(latestReceivedAt, fieldReceivedAt);
                        latestRevision = Math.max(latestRevision, fieldRevision);
                        latestSnapshotTimestamp = Math.max(
                            latestSnapshotTimestamp,
                            nextSnapshotTimestamp,
                        );
                    }
                }
                if (Object.keys(quote || {}).length === 0) {
                    delete levels[level];
                    delete receivedAtByLevel[level];
                    delete revisionByLevel[level];
                    delete snapshotTimestampByLevel[level];
                    delete snapshotConflictDeferredByLevel[level];
                } else {
                    receivedAtByLevel[level] = fieldTimes;
                    revisionByLevel[level] = fieldRevisions;
                    snapshotTimestampByLevel[level] = fieldSnapshotTimestamps;
                    snapshotConflictDeferredByLevel[level] = fieldSnapshotConflictDeferrals;
                }
            }
            if (Object.keys(levels).length === 0) {
                delete state.marketLiveData[itemHrid];
            } else {
                state.marketLiveData[itemHrid] = {
                    levels,
                    receivedAt: latestReceivedAt || fallbackReceivedAt,
                    revision: latestRevision,
                    snapshotTimestamp: latestSnapshotTimestamp,
                    receivedAtByLevel,
                    revisionByLevel,
                    snapshotTimestampByLevel,
                    snapshotConflictDeferredByLevel,
                };
            }
        }
        state.marketLiveUpdatedAt = Object.values(state.marketLiveData || {}).reduce(
            (latest, liveEntry) => Math.max(latest, Number(liveEntry?.receivedAt || 0)),
            0,
        );
        if (state.marketLiveUpdatedAt === 0) {
            state.marketLiveSource = "";
        }
    }

    function commitMarketSnapshot(
        state,
        marketData,
        marketTimestamp,
        sourceUrl,
        liveRevisionAtRequestStart,
    ) {
        const normalizedTimestamp = normalizeMarketTimestamp(marketTimestamp);
        expireMarketLiveQuotes(
            state,
            marketData,
            normalizedTimestamp,
            liveRevisionAtRequestStart,
        );
        state.marketSnapshotData = marketData;
        rebuildEffectiveMarketData(state);
        state.marketTimestamp = normalizedTimestamp;
        state.marketFetchedAt = Date.now();
        state.marketSourceUrl = sourceUrl;
        state.marketError = "";
        clearMarketSnapshotCandidate(state);
        return true;
    }

    function getConfirmedMarketSnapshot(state) {
        if (Object.keys(state.marketSnapshotData || {}).length > 0) {
            return state.marketSnapshotData;
        }
        return Object.keys(state.marketLiveData || {}).length === 0
            ? (state.marketData || {})
            : {};
    }

    function scheduleMarketRefreshCooldown(state) {
        if (typeof window !== "object" || typeof window.setTimeout !== "function") {
            return;
        }
        if (state.marketRefreshCooldownTimer != null) {
            window.clearTimeout?.(state.marketRefreshCooldownTimer);
        }
        const delay = Math.max(0, state.marketRefreshCooldownUntil - Date.now());
        state.marketRefreshCooldownTimer = window.setTimeout(() => {
            state.marketRefreshCooldownTimer = null;
            state.render?.();
        }, delay + 25);
    }

    async function refreshMarketData(state) {
        const now = Date.now();
        if (state.marketLoading || now < state.marketRefreshCooldownUntil) {
            return false;
        }

        const liveRevisionAtRequestStart = normalizeNonNegativeInteger(state.marketLiveRevision, 0);
        let retainSnapshotCandidate = false;
        state.marketLoading = true;
        state.marketError = "";
        state.render?.();

        try {
            const origin = getCurrentGameOrigin();
            if (!origin) {
                throw new Error("Current game origin is unavailable.");
            }
            const url = `${origin}/game_data/marketplace.json`;
            const payload = await requestJson(url);
            const marketData = sanitizeMarketData(payload?.marketData);
            if (Object.keys(marketData).length === 0) {
                throw new Error("Marketplace payload is empty.");
            }

            const incomingMarketTimestamp = normalizeMarketTimestamp(payload.timestamp);
            const currentMarketTimestamp = normalizeMarketTimestamp(state.marketTimestamp);
            if (incomingMarketTimestamp === 0) {
                throw new Error("Marketplace payload has no valid timestamp.");
            }
            if (currentMarketTimestamp > 0 && incomingMarketTimestamp < currentMarketTimestamp) {
                throw new Error("Marketplace payload is older than the current data.");
            }

            const confirmedMarketData = getConfirmedMarketSnapshot(state);
            const isMissingConfirmedMarketData = Object.keys(confirmedMarketData).length > 0
                && hasMissingMarketEntries(confirmedMarketData, marketData);
            if (isMissingConfirmedMarketData
                && currentMarketTimestamp > 0
                && incomingMarketTimestamp === currentMarketTimestamp) {
                throw new Error("Marketplace payload is smaller than the confirmed snapshot at the same timestamp.");
            }
            if (isMissingConfirmedMarketData
                && !confirmMissingMarketSnapshot(state, marketData, incomingMarketTimestamp)) {
                retainSnapshotCandidate = true;
                throw new Error("Marketplace payload is missing entries already loaded on this page.");
            }
            const committed = commitMarketSnapshot(
                state,
                marketData,
                incomingMarketTimestamp,
                url,
                liveRevisionAtRequestStart,
            );
            state.marketRefreshCooldownUntil = Date.now() + MARKET_REFRESH_COOLDOWN_MS;
            scheduleMarketRefreshCooldown(state);
            return committed;
        } catch (error) {
            if (!retainSnapshotCandidate) {
                clearMarketSnapshotCandidate(state);
            }
            state.marketError = Object.keys(state.marketData).length > 0
                ? "marketRefreshRetained"
                : "marketLoadFailed";
            console.warn(`[${SCRIPT_ID}] Failed to refresh marketplace data`, error);
            return false;
        } finally {
            state.marketLoading = false;
            state.render?.();
        }
    }

    function getSpriteBaseFromReference(reference, marker) {
        const value = String(reference || "").trim();
        const hashIndex = value.lastIndexOf("#");
        const base = hashIndex >= 0 ? value.slice(0, hashIndex) : value;
        return base.toLowerCase().includes(marker) ? base : "";
    }

    function findPassiveSpriteUrls(root = document) {
        const result = { spriteUrl: "", miscSpriteUrl: "" };
        if (!root || typeof root.querySelectorAll !== "function") {
            return result;
        }
        for (const useElement of root.querySelectorAll("use")) {
            const reference = getSpriteReference(useElement);
            result.spriteUrl ||= getSpriteBaseFromReference(reference, "items_sprite");
            result.miscSpriteUrl ||= getSpriteBaseFromReference(reference, "misc_sprite");
            if (result.spriteUrl && result.miscSpriteUrl) {
                break;
            }
        }
        return result;
    }

    function collectGameI18nCandidates(state, root = document) {
        const candidates = [];
        try {
            candidates.push(
                state.pageWindow?.i18next,
                state.pageWindow?.i18n,
                state.pageWindow?.mwi?.lang,
            );
        } catch (_error) {
        }
        const gamePage = root?.querySelector?.('[class^="GamePage"], [class*="GamePage"]');
        if (!gamePage) {
            return candidates.filter(Boolean);
        }

        try {
            const fiberKey = Reflect.ownKeys(gamePage).find((key) => String(key).startsWith("__reactFiber$"));
            let fiber = fiberKey ? gamePage[fiberKey] : null;
            for (let depth = 0; fiber && depth < 24; depth += 1, fiber = fiber.return) {
                candidates.push(
                    fiber.memoizedProps?.i18n,
                    fiber.pendingProps?.i18n,
                    fiber.stateNode?.props?.i18n,
                    fiber.stateNode?.i18n,
                );
            }
        } catch (_error) {
        }
        return candidates.filter(Boolean);
    }

    function discoverPassiveGameResources(state, root = document) {
        let changed = false;
        if (!state.spriteUrl || !state.miscSpriteUrl) {
            const spriteUrls = findPassiveSpriteUrls(root);
            if (!state.spriteUrl && spriteUrls.spriteUrl) {
                state.spriteUrl = spriteUrls.spriteUrl;
                changed = true;
            }
            if (!state.miscSpriteUrl && spriteUrls.miscSpriteUrl) {
                state.miscSpriteUrl = spriteUrls.miscSpriteUrl;
                changed = true;
            }
        }

        let discoveredNames = {};
        for (const candidate of collectGameI18nCandidates(state, root)) {
            Object.assign(discoveredNames, extractChineseItemNamesFromI18n(candidate));
        }
        const nameEntries = Object.entries(discoveredNames);
        if (nameEntries.some(([itemHrid, itemName]) => state.itemNamesZh[itemHrid] !== itemName)) {
            state.itemNamesZh = {
                ...state.itemNamesZh,
                ...discoveredNames,
            };
            state.itemNamesSource = "game-i18n";
            gmSetValue(ITEM_NAMES_ZH_CACHE_KEY, {
                itemNames: state.itemNamesZh,
                source: state.itemNamesSource,
            });
            changed = true;
        }

        if (changed) {
            state.render?.();
        }
        return changed;
    }

    function refreshPassiveGameData(state) {
        const clientDataUpdated = loadClientDataFromLocalStorage(state);
        const resourcesUpdated = discoverPassiveGameResources(state);
        return clientDataUpdated || resourcesUpdated;
    }

    function validateSelectedCredit(state) {
        if (state.selectedCredit === OVERVIEW_CREDIT || state.catalog.length === 0) {
            return;
        }
        if (!state.catalog.some((item) => item.creditHrid === state.selectedCredit)) {
            state.selectedCredit = OVERVIEW_CREDIT;
        }
    }

    function validateSelectedTokenCredit(state) {
        const conversions = getGuildTokenRateConversions(state.catalog);
        if (conversions.length === 0) {
            return null;
        }
        let selected = conversions.find((item) => item.creditHrid === state.selectedTokenCredit) || null;
        if (!selected) {
            selected = conversions.find((item) => item.creditHrid === DEFAULT_TOKEN_CREDIT_HRID)
                || conversions[0];
            state.selectedTokenCredit = selected.creditHrid;
        }
        return selected;
    }

    function validateShrineSelection(state) {
        let guildBuff = state.guildBuffs.find((buff) => buff.hrid === state.selectedGuildBuffHrid) || null;
        if (!guildBuff) {
            guildBuff = state.guildBuffs[0] || null;
            if (guildBuff) {
                state.selectedGuildBuffHrid = guildBuff.hrid;
            }
        }
        if (!guildBuff) {
            return null;
        }

        const maxLevel = Math.max(1, normalizeNonNegativeInteger(guildBuff.maxLevel, 1));
        state.shrineFromLevel = Math.min(
            normalizeNonNegativeInteger(state.shrineFromLevel, DEFAULT_SHRINE_FROM_LEVEL),
            maxLevel - 1,
        );
        state.shrineToLevel = Math.min(
            maxLevel,
            Math.max(
                state.shrineFromLevel + 1,
                normalizeNonNegativeInteger(state.shrineToLevel, state.shrineFromLevel + 1),
            ),
        );
        return guildBuff;
    }

    function getIntlLocale(language) {
        return normalizeUiLanguage(language) === LANGUAGE_ZH ? "zh-CN" : "en-US";
    }

    function formatExactNumber(value, maximumFractionDigits = 4, language = LANGUAGE_ZH) {
        if (value == null || value === "" || !Number.isFinite(Number(value))) {
            return "--";
        }
        return new Intl.NumberFormat(getIntlLocale(language), {
            maximumFractionDigits,
            minimumFractionDigits: 0,
        }).format(Number(value));
    }

    function formatCompactNumber(value, language = LANGUAGE_ZH) {
        if (value == null || value === "") {
            return "--";
        }
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) {
            return "--";
        }
        if (Math.abs(numeric) < 10_000) {
            return formatExactNumber(numeric, numeric < 100 ? 2 : 1, language);
        }
        return new Intl.NumberFormat("en-US", {
            notation: "compact",
            compactDisplay: "short",
            maximumFractionDigits: 2,
        }).format(numeric);
    }

    function formatTimestamp(value, language = LANGUAGE_ZH) {
        const timestamp = normalizeMarketTimestamp(value);
        if (!timestamp) {
            return translateText(language, "noMarketTimestamp");
        }
        return new Intl.DateTimeFormat(getIntlLocale(language), {
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
        }).format(new Date(timestamp));
    }

    function creditSwatchMarkup(definition, className = "credit-swatch") {
        return `<span class="${escapeHtml(className)}" style="--credit:${escapeHtml(definition.color)};--credit-ink:${escapeHtml(definition.ink)}" aria-hidden="true"></span>`;
    }

    function itemIconMarkup(state, hrid, fallbackName, extraClass = "") {
        const iconName = itemIconNameFromHrid(hrid);
        if (state.spriteUrl && iconName) {
            const href = `${state.spriteUrl}#${iconName}`;
            return `<svg class="item-icon ${escapeHtml(extraClass)}" aria-hidden="true"><use href="${escapeHtml(href)}"></use></svg>`;
        }

        const initial = String(fallbackName || "?").trim().charAt(0).toUpperCase() || "?";
        return `<span class="item-icon item-icon-fallback ${escapeHtml(extraClass)}" aria-hidden="true">${escapeHtml(initial)}</span>`;
    }

    function shrineIconMarkup(state, shrineHrid, fallbackName, extraClass = "") {
        const shrine = getShrineDefinition(shrineHrid, fallbackName);
        if (state.miscSpriteUrl && shrine.key !== "unknown") {
            const href = `${state.miscSpriteUrl}#guild_shrine_${shrine.key}`;
            return `<svg class="shrine-icon ${escapeHtml(extraClass)}" aria-hidden="true"><use href="${escapeHtml(href)}"></use></svg>`;
        }
        const initial = String(getShrineLabel(shrine, state.uiLanguage) || "?").trim().charAt(0) || "?";
        return `<span class="shrine-icon shrine-icon-fallback ${escapeHtml(extraClass)}" aria-hidden="true">${escapeHtml(initial)}</span>`;
    }

    function getGuildBuffDisplayLabel(state, guildBuff) {
        const shrine = getShrineDefinition(guildBuff?.shrineHrid, guildBuff?.shrineName);
        return t(state, "shrineBuffOption", {
            shrine: getShrineLabel(shrine, state.uiLanguage),
            domain: t(state, guildBuff?.isCombat ? "shrineCombat" : "shrineSkilling"),
        });
    }

    function enhancementBadgeMarkup(state, row) {
        if (!row?.hasQuote || !Number.isInteger(row.enhancementLevel) || row.enhancementLevel < 0) {
            return "";
        }
        const label = t(state, "enhancementLevel", { level: row.enhancementLevel });
        return `<span class="enhancement-badge" title="${escapeHtml(label)}">${escapeHtml(label)}</span>`;
    }

    function getMarketPriceTitle(state, row) {
        if (!row?.hasQuote) {
            return t(state, "noMarketQuote");
        }
        if (state.priceMode === PRICE_MODE_BID) {
            return t(state, "liquidationPriceDetails", {
                gross: formatExactNumber(row.rawMarketPrice, 4, state.uiLanguage),
                level: row.enhancementLevel,
                net: formatExactNumber(row.marketPrice, 4, state.uiLanguage),
                tax: `${formatExactNumber(row.marketTaxRate * 100, 0, state.uiLanguage)}%`,
            });
        }
        return t(state, "marketPriceTitle", {
            level: row.enhancementLevel,
            price: formatExactNumber(row.marketPrice, 4, state.uiLanguage),
        });
    }

    function renderMetric(state, row) {
        if (!row?.hasQuote) {
            return `<span class="metric metric-empty"><strong>--</strong><small>${escapeHtml(t(state, "noQuote"))}</small></span>`;
        }
        const coinsPerCredit = formatExactNumber(row.coinsPerCredit, 4, state.uiLanguage);
        const creditsPerMillion = formatCompactNumber(row.creditsPerMillion, state.uiLanguage);
        return `
            <span class="metric" title="${escapeHtml(t(state, "coinsPerCreditTitle", { value: coinsPerCredit }))}">
                <strong>${escapeHtml(formatCompactNumber(row.coinsPerCredit, state.uiLanguage))}</strong>
                <small>${escapeHtml(t(state, "creditsPerMillion", { value: creditsPerMillion }))}</small>
            </span>
        `;
    }

    function renderTargetPlanResult(state, plan) {
        if (!plan) {
            return `
                <div class="target-plan-empty" role="status">
                    <strong>--</strong><small>${escapeHtml(t(state, "targetNoPlan"))}</small>
                </div>
            `;
        }

        const displayItemName = resolveDisplayItemName(state, plan.itemHrid, plan.itemName);
        const costLabel = state.priceMode === PRICE_MODE_BID
            ? t(state, "targetOpportunityCost")
            : t(state, "targetEstimatedCost");
        const costTitle = t(state, "targetCostTitle", {
            cost: formatExactNumber(plan.totalCost, 4, state.uiLanguage),
        });
        const surplusMarkup = plan.surplusCredits > 0
            ? `<small>${escapeHtml(t(state, "targetSurplus", { count: formatExactNumber(plan.surplusCredits, 4, state.uiLanguage) }))}</small>`
            : "";
        return `
            <div class="target-plan-item">
                ${itemIconMarkup(state, plan.itemHrid, displayItemName)}
                <span class="target-item-copy">
                    <small>${escapeHtml(t(state, "targetBestPlan"))}</small>
                    <span class="item-name-line"><strong title="${escapeHtml(`${displayItemName} · ${plan.itemHrid}`)}">${escapeHtml(displayItemName)}</strong>${enhancementBadgeMarkup(state, plan)}</span>
                </span>
            </div>
            <dl class="target-plan-facts">
                <div><dt>${escapeHtml(t(state, "targetRequiredItems"))}</dt><dd>${escapeHtml(formatExactNumber(plan.requiredItems, 4, state.uiLanguage))}</dd></div>
                <div><dt>${escapeHtml(t(state, "targetBatches"))}</dt><dd>${escapeHtml(formatExactNumber(plan.batches, 0, state.uiLanguage))}</dd></div>
                <div><dt>${escapeHtml(t(state, "targetCreditsReceived"))}</dt><dd>${escapeHtml(formatExactNumber(plan.creditsReceived, 4, state.uiLanguage))}${surplusMarkup}</dd></div>
            </dl>
            <div class="target-plan-total" title="${escapeHtml(costTitle)}">
                <small>${escapeHtml(costLabel)}</small>
                <strong>${escapeHtml(formatCompactNumber(plan.totalCost, state.uiLanguage))}</strong>
            </div>
        `;
    }

    function updateTargetCalculator(state, groups) {
        const ui = state.ui;
        if (!ui) {
            return;
        }

        const rows = groups?.[state.selectedCredit];
        const isAvailable = state.selectedCredit !== OVERVIEW_CREDIT && Array.isArray(rows);
        ui.targetCalculator.hidden = !isAvailable;
        if (!isAvailable) {
            return;
        }

        const credit = getCreditDefinition(state.selectedCredit);
        const creditLabel = getCreditLabel(credit, state.uiLanguage);
        ui.targetCalculator.style.setProperty("--credit", credit.color);
        ui.targetCreditLabel.textContent = t(state, "targetCreditLabel", { color: creditLabel });
        ui.targetCreditInput.setAttribute("aria-label", t(state, "targetCreditInputAria", { color: creditLabel }));
        ui.targetCreditUnit.textContent = getQuantityUnit(state, "credit", state.targetCreditAmount || 0);
        if (ui.shadow.activeElement !== ui.targetCreditInput) {
            ui.targetCreditInput.value = state.targetCreditAmount == null ? "" : String(state.targetCreditAmount);
        }
        ui.targetResult.innerHTML = renderTargetPlanResult(
            state,
            calculateTargetCreditPlan(rows, state.targetCreditAmount),
        );
    }

    function renderGuildTokenRateRow(state, conversion) {
        const credit = getCreditDefinition(conversion.creditHrid, conversion.creditName);
        const creditLabel = getCreditLabel(credit, state.uiLanguage);
        const tokensPerCredit = Number(conversion.itemCount) / Number(conversion.creditCount);
        const isSelected = conversion.creditHrid === state.selectedTokenCredit;
        return `
            <button type="button" class="token-rate-row${isSelected ? " is-active" : ""}" data-token-credit="${escapeHtml(conversion.creditHrid)}" style="--credit:${escapeHtml(credit.color)}" aria-pressed="${isSelected}">
                <span class="token-rate-credit">${creditSwatchMarkup(credit)}<strong>${escapeHtml(t(state, "creditName", { color: creditLabel }))}</strong></span>
                <span class="token-rate-batch"><small>${escapeHtml(t(state, "tokenExchangeBatch"))}</small><strong>${escapeHtml(formatGuildTokenBatchText(state, conversion.itemCount, conversion.creditCount))}</strong></span>
                <span class="token-rate-unit"><small>${escapeHtml(t(state, "tokenPerCredit"))}</small><strong>${escapeHtml(t(state, "tokenPerCreditValue", { value: formatExactNumber(tokensPerCredit, 4, state.uiLanguage) }))}</strong></span>
                <span class="row-arrow" aria-hidden="true">›</span>
            </button>
        `;
    }

    function renderGuildTokenPlannerResult(state, catalog) {
        const rateConversions = getGuildTokenRateConversions(catalog);
        if (rateConversions.length === 0) {
            return renderEmptyState(t(state, "tokenNoConversions"), t(state, "tokenNoConversionsMessage"));
        }

        const selectedRate = rateConversions.find((item) => item.creditHrid === state.selectedTokenCredit)
            || rateConversions[0];
        const credit = getCreditDefinition(selectedRate.creditHrid, selectedRate.creditName);
        const creditLabel = getCreditLabel(credit, state.uiLanguage);
        const plan = calculateGuildTokenCreditPlan(
            catalog,
            selectedRate.creditHrid,
            state.tokenTargetCreditAmount,
        );
        const displayedRate = plan || selectedRate;
        const tokenItemName = resolveDisplayItemName(state, GUILD_TOKEN_ITEM_HRID, displayedRate.itemName);
        const tokensPerCredit = Number(displayedRate.itemCount) / Number(displayedRate.creditCount);
        const planMarkup = plan ? `
            <div class="token-target-total">
                <small>${escapeHtml(t(state, "tokenRequired"))}</small>
                <strong>${escapeHtml(formatCompactNumber(plan.requiredGuildTokens, state.uiLanguage))}</strong>
                <span>${escapeHtml(getQuantityUnit(state, "guildToken", plan.requiredGuildTokens))}</span>
            </div>
            <dl class="token-target-facts">
                <div><dt>${escapeHtml(t(state, "tokenBatches"))}</dt><dd>${escapeHtml(formatExactNumber(plan.batches, 0, state.uiLanguage))}</dd></div>
                <div><dt>${escapeHtml(t(state, "tokenCreditsReceived"))}</dt><dd>${escapeHtml(formatExactNumber(plan.creditsReceived, 4, state.uiLanguage))}</dd></div>
                <div><dt>${escapeHtml(t(state, "tokenSurplus"))}</dt><dd>${escapeHtml(formatExactNumber(plan.surplusCredits, 4, state.uiLanguage))}</dd></div>
            </dl>
        ` : `<div class="token-target-empty">${escapeHtml(t(state, "tokenTargetInvalid"))}</div>`;
        const rateRows = rateConversions.map((conversion) => renderGuildTokenRateRow(state, conversion)).join("");

        return `
            <section class="token-summary" style="--credit:${escapeHtml(credit.color)}">
                <div class="token-summary-identity">
                    ${itemIconMarkup(state, GUILD_TOKEN_ITEM_HRID, tokenItemName)}
                    <span><small>${escapeHtml(t(state, "tokenOfficialRate"))}</small><strong>${escapeHtml(t(state, "creditName", { color: creditLabel }))}</strong><em>${escapeHtml(tokenItemName)}</em></span>
                </div>
                <dl class="token-summary-metrics">
                    <div><dt>${escapeHtml(t(state, "tokenExchangeBatch"))}</dt><dd>${escapeHtml(formatGuildTokenBatchText(state, displayedRate.itemCount, displayedRate.creditCount))}</dd></div>
                    <div><dt>${escapeHtml(t(state, "tokenPerCredit"))}</dt><dd>${escapeHtml(t(state, "tokenPerCreditValue", { value: formatExactNumber(tokensPerCredit, 4, state.uiLanguage) }))}</dd></div>
                </dl>
            </section>
            <section class="token-target-section">
                <div class="token-section-heading"><strong>${escapeHtml(t(state, "tokenTargetPlan"))}</strong></div>
                <div class="token-target-result">${planMarkup}</div>
            </section>
            <section class="token-rates-section">
                <div class="token-section-heading"><strong>${escapeHtml(t(state, "tokenAllRates"))}</strong><span>${escapeHtml(t(state, "tokenOfficialRate"))}</span></div>
                <div class="token-rate-list">${rateRows}</div>
            </section>
        `;
    }

    function updateGuildTokenPlanner(state) {
        const ui = state.ui;
        if (!ui) {
            return;
        }
        const selectedRate = validateSelectedTokenCredit(state);
        const rateConversions = getGuildTokenRateConversions(state.catalog);
        const options = rateConversions.map((conversion) => {
            const credit = getCreditDefinition(conversion.creditHrid, conversion.creditName);
            return {
                value: conversion.creditHrid,
                label: t(state, "creditName", { color: getCreditLabel(credit, state.uiLanguage) }),
            };
        });
        setSelectOptions(ui.tokenCreditSelect, options, selectedRate?.creditHrid || "");
        if (ui.shadow.activeElement !== ui.tokenTargetCreditInput) {
            ui.tokenTargetCreditInput.value = state.tokenTargetCreditAmount == null
                ? ""
                : String(state.tokenTargetCreditAmount);
        }
        ui.tokenResults.innerHTML = renderGuildTokenPlannerResult(state, state.catalog);
    }

    function setSelectOptions(select, options, selectedValue) {
        const signature = options.map((option) => `${option.value}\u0000${option.label}`).join("\u0001");
        if (select.dataset.optionSignature !== signature) {
            select.innerHTML = options.map((option) => (
                `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`
            )).join("");
            select.dataset.optionSignature = signature;
        }
        select.disabled = options.length === 0;
        select.value = String(selectedValue ?? "");
    }

    function renderShrineRequirement(state, creditCost) {
        const credit = getCreditDefinition(creditCost.itemHrid);
        return `
            <span class="shrine-credit-requirement" style="--credit:${escapeHtml(credit.color)}">
                ${creditSwatchMarkup(credit)}
                <span><strong>${escapeHtml(getCreditLabel(credit, state.uiLanguage))}</strong><small>${escapeHtml(formatExactNumber(creditCost.count, 4, state.uiLanguage))}</small></span>
            </span>
        `;
    }

    function renderShrineResourceRow(state, resourcePlan) {
        const credit = getCreditDefinition(resourcePlan.creditHrid);
        const requiredCredits = formatExactNumber(resourcePlan.requiredCredits, 4, state.uiLanguage);
        const creditMarkup = `
            <span class="shrine-resource-credit">
                ${creditSwatchMarkup(credit)}
                <span><strong>${escapeHtml(getCreditLabel(credit, state.uiLanguage))}</strong><small>${escapeHtml(t(state, "shrineRequiredAmount", { count: requiredCredits }))}</small></span>
            </span>
        `;
        const plan = resourcePlan.plan;
        const tokenPlan = resourcePlan.tokenPlan;
        const tokenCostMarkup = `
            <span class="shrine-token-cost${tokenPlan ? "" : " is-missing"}">
                <small>${escapeHtml(t(state, "shrineTokenAlternative"))}</small>
                <strong>${tokenPlan ? escapeHtml(formatCompactNumber(tokenPlan.requiredGuildTokens, state.uiLanguage)) : "--"}</strong>
                ${tokenPlan ? "" : `<em>${escapeHtml(t(state, "shrineTokenUnavailable"))}</em>`}
            </span>
        `;
        if (!plan) {
            return `
                <div class="shrine-resource-row is-missing" style="--credit:${escapeHtml(credit.color)}">
                    ${creditMarkup}
                    <span class="shrine-resource-missing">${escapeHtml(t(state, "shrineNoMarketQuote"))}</span>
                    <span class="shrine-resource-value shrine-resource-buy">--</span>
                    <span class="shrine-resource-value shrine-resource-coverage">--</span>
                    <span class="shrine-resource-cost"><span><small>${escapeHtml(t(state, "shrineResourceCost"))}</small><strong>--</strong></span>${tokenCostMarkup}</span>
                </div>
            `;
        }

        const displayItemName = resolveDisplayItemName(state, plan.itemHrid, plan.itemName);
        const priceTitle = t(state, "marketPriceTitle", {
            level: plan.enhancementLevel,
            price: formatExactNumber(plan.marketPrice, 4, state.uiLanguage),
        });
        const costTitle = t(state, "targetCostTitle", {
            cost: formatExactNumber(plan.totalCost, 4, state.uiLanguage),
        });
        return `
            <div class="shrine-resource-row" style="--credit:${escapeHtml(credit.color)}">
                ${creditMarkup}
                <span class="shrine-resource-item" title="${escapeHtml(priceTitle)}">
                    ${itemIconMarkup(state, plan.itemHrid, displayItemName)}
                    <span class="item-copy">
                        <span class="item-name-line"><strong title="${escapeHtml(`${displayItemName} · ${plan.itemHrid}`)}">${escapeHtml(displayItemName)}</strong>${enhancementBadgeMarkup(state, plan)}</span>
                        <small>${escapeHtml(formatDonationBatchText(state, plan.itemCount, plan.creditCount))}</small>
                    </span>
                </span>
                <span class="shrine-resource-value shrine-resource-buy"><strong>${escapeHtml(t(state, "shrineBuyAmount", { count: formatExactNumber(plan.requiredItems, 4, state.uiLanguage) }))}</strong></span>
                <span class="shrine-resource-value shrine-resource-coverage"><small>${escapeHtml(t(state, "shrineCreditCoverage", {
                    credits: formatExactNumber(plan.creditsReceived, 4, state.uiLanguage),
                    batches: formatExactNumber(plan.batches, 0, state.uiLanguage),
                }))}</small></span>
                <span class="shrine-resource-cost"><span title="${escapeHtml(costTitle)}"><small>${escapeHtml(t(state, "shrineResourceCost"))}</small><strong>${escapeHtml(formatCompactNumber(plan.totalCost, state.uiLanguage))}</strong></span>${tokenCostMarkup}</span>
            </div>
        `;
    }

    function renderShrinePlannerResult(state, guildBuff, purchasePlan) {
        if (!guildBuff || !purchasePlan) {
            return renderEmptyState(t(state, "shrineDataNotReady"), t(state, "shrineDataMessage"));
        }

        const shrine = getShrineDefinition(guildBuff.shrineHrid, guildBuff.shrineName);
        const buffLabel = getGuildBuffDisplayLabel(state, guildBuff);
        const requirements = purchasePlan.creditCosts.length > 0
            ? purchasePlan.creditCosts.map((cost) => renderShrineRequirement(state, cost)).join("")
            : `<span class="shrine-no-credits">${escapeHtml(t(state, "shrineNoCreditsRequired"))}</span>`;
        const resourceRows = purchasePlan.resourcePlans.length > 0
            ? purchasePlan.resourcePlans.map((plan) => renderShrineResourceRow(state, plan)).join("")
            : `<div class="shrine-resource-empty">${escapeHtml(t(state, "shrineNoCreditsRequired"))}</div>`;
        const coinValue = purchasePlan.totalCoinCost == null
            ? "--"
            : formatCompactNumber(purchasePlan.totalCoinCost, state.uiLanguage);
        const coinNote = purchasePlan.marketComplete
            ? t(state, "shrineAskEstimate")
            : t(state, "shrineIncompleteEstimate");
        const creditTokenValue = purchasePlan.creditGuildTokenCost == null
            ? "--"
            : formatCompactNumber(purchasePlan.creditGuildTokenCost, state.uiLanguage);
        const totalTokenValue = purchasePlan.totalGuildTokenCost == null
            ? "--"
            : formatCompactNumber(purchasePlan.totalGuildTokenCost, state.uiLanguage);
        const tokenNote = purchasePlan.guildTokenExchangeComplete
            ? ""
            : `<small>${escapeHtml(t(state, "shrineTokenIncomplete"))}</small>`;
        const dataWarning = purchasePlan.isComplete
            ? ""
            : `<div class="notice notice-warning" role="status">${escapeHtml(t(state, "shrineLevelCostsIncomplete"))}</div>`;
        const confirmationWarning = state.guildBuffsStale
            ? `<div class="notice notice-warning" role="status">${escapeHtml(t(state, "shrineConfirmedDataWarning"))}</div>`
            : "";

        return `
            ${renderNotice(state)}
            ${confirmationWarning}
            ${dataWarning}
            <section class="shrine-summary" style="--shrine:${escapeHtml(shrine.color)}">
                <div class="shrine-route">
                    ${shrineIconMarkup(state, guildBuff.shrineHrid, guildBuff.shrineName)}
                    <span><small>${escapeHtml(buffLabel)}</small><strong>${escapeHtml(t(state, "shrineRoute", { from: purchasePlan.fromLevel, to: purchasePlan.toLevel }))}</strong><em>${escapeHtml(t(state, "shrineLevelCount", { count: purchasePlan.levelCount }))}</em></span>
                </div>
                <dl class="shrine-summary-metrics">
                    <div><dt>${escapeHtml(t(state, "shrineGuildTokens"))}</dt><dd>${escapeHtml(formatCompactNumber(purchasePlan.guildTokenCost, state.uiLanguage))}</dd></div>
                    <div><dt>${escapeHtml(t(state, "shrineCreditGuildTokens"))}</dt><dd>${escapeHtml(creditTokenValue)}</dd>${tokenNote}</div>
                    <div class="shrine-token-total"><dt>${escapeHtml(t(state, "shrineAllGuildTokens"))}</dt><dd>${escapeHtml(totalTokenValue)}</dd>${tokenNote}</div>
                    <div class="shrine-coin-total"><dt>${escapeHtml(t(state, "shrineEstimatedCoins"))}</dt><dd>${escapeHtml(coinValue)}</dd><small>${escapeHtml(coinNote)}</small></div>
                </dl>
            </section>
            <section class="shrine-requirements-section">
                <div class="shrine-section-heading"><strong>${escapeHtml(t(state, "shrineRequirements"))}</strong></div>
                <div class="shrine-credit-requirements">${requirements}</div>
            </section>
            <section class="shrine-resources-section">
                <div class="shrine-section-heading"><strong>${escapeHtml(t(state, "shrineResources"))}</strong><span>${escapeHtml(t(state, "shrineAskEstimate"))}</span></div>
                <div class="shrine-resource-list">${resourceRows}</div>
            </section>
        `;
    }

    function updateShrinePlanner(state, rankedGroups) {
        const ui = state.ui;
        if (!ui) {
            return;
        }

        const guildBuff = validateShrineSelection(state);
        const buffOptions = state.guildBuffs.map((buff) => ({
            value: buff.hrid,
            label: getGuildBuffDisplayLabel(state, buff),
        }));
        setSelectOptions(ui.shrineBuffSelect, buffOptions, state.selectedGuildBuffHrid);
        if (!guildBuff) {
            setSelectOptions(ui.shrineFromSelect, [], "");
            setSelectOptions(ui.shrineToSelect, [], "");
            ui.shrineIcon.innerHTML = "";
            ui.shrineResults.innerHTML = renderEmptyState(t(state, "shrineDataNotReady"), t(state, "shrineDataMessage"));
            return;
        }

        const shrine = getShrineDefinition(guildBuff.shrineHrid, guildBuff.shrineName);
        const levelOptions = Array.from({ length: guildBuff.maxLevel + 1 }, (_value, level) => ({
            value: String(level),
            label: t(state, "shrineLevelOption", { level }),
        }));
        setSelectOptions(ui.shrineFromSelect, levelOptions.slice(0, -1), state.shrineFromLevel);
        setSelectOptions(ui.shrineToSelect, levelOptions.slice(state.shrineFromLevel + 1), state.shrineToLevel);
        ui.shrineControls.style.setProperty("--shrine", shrine.color);
        ui.shrineIcon.innerHTML = shrineIconMarkup(state, guildBuff.shrineHrid, guildBuff.shrineName, "shrine-control-icon");

        const upgradeCost = calculateShrineUpgradeCost(
            guildBuff,
            state.shrineFromLevel,
            state.shrineToLevel,
        );
        ui.shrineResults.innerHTML = renderShrinePlannerResult(
            state,
            guildBuff,
            buildShrinePurchasePlan(upgradeCost, rankedGroups, state.catalog),
        );
    }

    function getCatalogCountByCredit(catalog) {
        const counts = Object.create(null);
        for (const item of getMarketDonationCatalog(catalog)) {
            counts[item.creditHrid] = (counts[item.creditHrid] || 0) + 1;
        }
        return counts;
    }

    function renderCreditTabs(state) {
        const counts = getCatalogCountByCredit(state.catalog);
        const total = getMarketDonationCatalog(state.catalog).length;
        const overviewSelected = state.selectedCredit === OVERVIEW_CREDIT;
        const tabs = [
            `<button type="button" class="credit-tab${overviewSelected ? " is-active" : ""}" role="tab" aria-selected="${overviewSelected}" data-credit="${OVERVIEW_CREDIT}" title="${escapeHtml(t(state, "overviewBestTitle"))}">
                <span class="overview-mark" aria-hidden="true"></span><span>${escapeHtml(t(state, "overview"))}</span><small>${total}</small>
            </button>`,
        ];

        for (const definition of CREDIT_DEFINITIONS) {
            const isSelected = state.selectedCredit === definition.hrid;
            const creditLabel = getCreditLabel(definition, state.uiLanguage);
            const shortCreditLabel = getCreditLabel(definition, state.uiLanguage, true);
            tabs.push(`
                <button type="button" class="credit-tab${isSelected ? " is-active" : ""}" role="tab" aria-selected="${isSelected}" data-credit="${escapeHtml(definition.hrid)}" title="${escapeHtml(t(state, "creditTabTitle", { color: creditLabel, count: counts[definition.hrid] || 0 }))}">
                    ${creditSwatchMarkup(definition)}<span>${escapeHtml(shortCreditLabel)}</span><small>${counts[definition.hrid] || 0}</small>
                </button>
            `);
        }
        return tabs.join("");
    }

    function isPassiveMarketDataOnly(state) {
        return normalizeMarketTimestamp(state?.marketTimestamp) === 0
            && Object.keys(state?.marketLiveData || {}).length > 0;
    }

    function getMarketNoticeKey(state) {
        if (isPassiveMarketDataOnly(state)) {
            return "marketPassivePartial";
        }
        if (state?.marketError && Object.keys(state?.marketData || {}).length > 0) {
            return state.marketError;
        }
        return "";
    }

    function renderNotice(state) {
        const noticeKey = getMarketNoticeKey(state);
        return noticeKey
            ? `<div class="notice notice-warning" role="status">${escapeHtml(t(state, noticeKey))}</div>`
            : "";
    }

    function renderEmptyState(title, message, isLoading = false) {
        return `
            <div class="empty-state" role="status">
                <span class="empty-symbol${isLoading ? " is-loading" : ""}" aria-hidden="true"></span>
                <strong>${escapeHtml(title)}</strong>
                <span>${escapeHtml(message)}</span>
            </div>
        `;
    }

    function renderOverview(state, groups) {
        const rowsMarkup = CREDIT_DEFINITIONS.map((definition) => {
            const group = groups[definition.hrid] || [];
            const best = group.find((row) => row.hasQuote) || null;
            const bestItemName = best
                ? resolveDisplayItemName(state, best.itemHrid, best.itemName)
                : "";
            const creditLabel = getCreditLabel(definition, state.uiLanguage);
            const shortCreditLabel = getCreditLabel(definition, state.uiLanguage, true);
            const quoteCount = group.filter((row) => row.hasQuote).length;
            const itemMarkup = best
                ? `${itemIconMarkup(state, best.itemHrid, bestItemName)}<span class="best-item-copy"><span class="item-name-line"><strong title="${escapeHtml(best.itemHrid)}">${escapeHtml(bestItemName)}</strong>${enhancementBadgeMarkup(state, best)}</span><small>${escapeHtml(formatDonationBatchText(state, best.itemCount, best.creditCount))}</small></span>`
                : `<span class="best-item-copy"><strong>${escapeHtml(t(state, "noValidQuote"))}</strong><small>${escapeHtml(t(state, "conversionCount", { count: group.length }))}</small></span>`;
            const marketPriceTitle = best ? getMarketPriceTitle(state, best) : t(state, "noMarketQuote");
            return `
                <button type="button" class="overview-row" data-select-credit="${escapeHtml(definition.hrid)}" style="--credit:${escapeHtml(definition.color)}">
                    <span class="overview-credit">
                        ${itemIconMarkup(state, definition.hrid, shortCreditLabel, "credit-icon")}
                        <span><strong>${escapeHtml(t(state, "creditName", { color: creditLabel }))}</strong><small>${escapeHtml(t(state, "creditQuotedCount", { quoted: quoteCount, total: group.length }))}</small></span>
                    </span>
                    <span class="overview-best">${itemMarkup}</span>
                    ${renderMetric(state, best)}
                    <span class="overview-batch" title="${escapeHtml(marketPriceTitle)}">${best ? escapeHtml(t(state, "unitPricePerItem", { price: formatCompactNumber(best.marketPrice, state.uiLanguage) })) : "--"}</span>
                    <span class="row-arrow" aria-hidden="true">›</span>
                </button>
            `;
        }).join("");

        return `
            ${renderNotice(state)}
            <div class="overview-header" aria-hidden="true">
                <span>${escapeHtml(t(state, "creditType"))}</span><span>${escapeHtml(t(state, "currentBestItem"))}</span><span>${escapeHtml(t(state, "costPerCredit"))}</span><span>${escapeHtml(t(state, "marketUnitPrice"))}</span><span></span>
            </div>
            <div class="overview-list">${rowsMarkup}</div>
        `;
    }

    function flattenGroupsByCreditOrder(groups) {
        const rows = [];
        const used = new Set();
        for (const definition of CREDIT_DEFINITIONS) {
            for (const row of groups[definition.hrid] || []) {
                rows.push(row);
            }
            used.add(definition.hrid);
        }
        for (const [creditHrid, group] of Object.entries(groups)) {
            if (!used.has(creditHrid)) {
                for (const row of group) {
                    rows.push(row);
                }
            }
        }
        return rows;
    }

    function renderRelativeValue(state, row, groups) {
        if (!row.hasQuote) {
            return `<span class="relative-value is-empty">--</span>`;
        }
        const best = (groups[row.creditHrid] || []).find((candidate) => candidate.hasQuote);
        if (row.rank === 1) {
            return `<span class="relative-value is-best">${escapeHtml(t(state, "best"))}</span>`;
        }
        if (!best || best.coinsPerCredit <= 0) {
            return `<span class="relative-value is-empty">--</span>`;
        }
        const premium = Math.max(0, (row.coinsPerCredit / best.coinsPerCredit - 1) * 100);
        if (!Number.isFinite(premium)) {
            return `<span class="relative-value is-empty">--</span>`;
        }
        return `<span class="relative-value">+${escapeHtml(formatExactNumber(premium, premium < 10 ? 1 : 0, state.uiLanguage))}%</span>`;
    }

    function renderRankingTable(state, groups, isGlobalSearch) {
        const sourceRows = isGlobalSearch
            ? flattenGroupsByCreditOrder(groups)
            : (groups[state.selectedCredit] || []);
        const searchText = normalizeSearchText(state.searchText);
        const matchingRows = sourceRows.filter((row) => rowMatchesSearch(row, searchText, state.itemNamesZh));
        const hiddenQuoteCount = matchingRows.filter((row) => !row.hasQuote).length;
        const eligibleRows = state.showUnquoted ? matchingRows : matchingRows.filter((row) => row.hasQuote);
        const visibleRows = eligibleRows.slice(0, state.visibleRows);
        const remaining = eligibleRows.length - visibleRows.length;

        if (eligibleRows.length === 0) {
            const message = hiddenQuoteCount > 0 && !state.showUnquoted
                ? t(state, "unquotedFilterMessage", { count: hiddenQuoteCount })
                : t(state, "noMatchingItems");
            return `${renderNotice(state)}${renderEmptyState(t(state, "noRankedItems"), message)}`;
        }

        const rowMarkup = visibleRows.map((row) => {
            const credit = getCreditDefinition(row.creditHrid, row.creditName);
            const displayItemName = resolveDisplayItemName(state, row.itemHrid, row.itemName);
            const priceTitle = getMarketPriceTitle(state, row);
            const creditColumn = isGlobalSearch ? `
                <td class="column-credit">
                    <span class="credit-label">${creditSwatchMarkup(credit)}${escapeHtml(getCreditLabel(credit, state.uiLanguage, true))}</span>
                </td>
            ` : "";
            const donationBatch = formatDonationBatchText(state, row.itemCount, row.creditCount);
            return `
                <tr class="${row.rank === 1 ? "is-best-row" : ""}" style="--credit:${escapeHtml(credit.color)}">
                    <td class="column-rank"><span class="rank-number${row.rank != null && row.rank <= 3 ? " is-top" : ""}">${row.rank ?? "--"}</span></td>
                    <td class="column-item">
                        <span class="item-cell">
                            ${itemIconMarkup(state, row.itemHrid, displayItemName)}
                            <span class="item-copy">
                                <span class="item-name-line"><strong title="${escapeHtml(`${displayItemName} · ${row.itemHrid}`)}">${escapeHtml(displayItemName)}</strong>${enhancementBadgeMarkup(state, row)}</span>
                                <small class="item-hrid">${escapeHtml(row.itemHrid)}</small>
                                <small class="item-mobile-batch">${escapeHtml(donationBatch)}</small>
                            </span>
                        </span>
                    </td>
                    ${creditColumn}
                    <td class="column-batch"><strong>${escapeHtml(formatExactNumber(row.itemCount, 4, state.uiLanguage))}</strong><small>${escapeHtml(formatBatchCreditResult(state, row.itemCount, row.creditCount))}</small></td>
                    <td class="column-price" title="${escapeHtml(priceTitle)}">${row.hasQuote ? escapeHtml(formatCompactNumber(row.marketPrice, state.uiLanguage)) : "--"}</td>
                    <td class="column-cost">${renderMetric(state, row)}</td>
                    <td class="column-relative">${renderRelativeValue(state, row, groups)}</td>
                </tr>
            `;
        }).join("");

        const globalCreditHeading = isGlobalSearch ? `<th class="column-credit">${escapeHtml(t(state, "credit"))}</th>` : "";
        const quoteModeLabel = state.priceMode === PRICE_MODE_ASK
            ? t(state, "acquireUnitPrice")
            : t(state, "liquidationUnitPrice");
        const loadMore = remaining > 0
            ? `<button type="button" class="load-more" data-load-more>${escapeHtml(t(state, "loadMore", { count: remaining }))}</button>`
            : "";
        const hiddenNote = hiddenQuoteCount > 0 && !state.showUnquoted
            ? `<span>${escapeHtml(t(state, "unquotedNotShown", { count: hiddenQuoteCount }))}</span>`
            : `<span>${escapeHtml(t(state, "showingItems", { count: eligibleRows.length }))}</span>`;

        return `
            ${renderNotice(state)}
            <div class="result-summary">${hiddenNote}<span>${escapeHtml(t(state, "sortAscending"))}</span></div>
            <div class="table-wrap">
                <table class="ranking-table${isGlobalSearch ? " has-credit-column" : ""}">
                    <thead>
                        <tr>
                            <th class="column-rank">${escapeHtml(t(state, "rank"))}</th>
                            <th class="column-item">${escapeHtml(t(state, "item"))}</th>
                            ${globalCreditHeading}
                            <th class="column-batch">${escapeHtml(t(state, "donationBatchHeader"))}</th>
                            <th class="column-price">${escapeHtml(quoteModeLabel)}</th>
                            <th class="column-cost" title="${escapeHtml(t(state, "costFormula"))}">${escapeHtml(t(state, "costPerCredit"))}</th>
                            <th class="column-relative">${escapeHtml(t(state, "relativeToBest"))}</th>
                        </tr>
                    </thead>
                    <tbody>${rowMarkup}</tbody>
                </table>
            </div>
            ${loadMore}
        `;
    }

    function renderMainContent(state, groups = null) {
        if (state.catalog.length === 0) {
            return renderEmptyState(
                t(state, "waitingGameData"),
                state.catalogError ? t(state, state.catalogError) : t(state, "waitingGameMessage"),
                !state.catalogError,
            );
        }

        if (Object.keys(state.marketData).length === 0) {
            return renderEmptyState(
                state.marketLoading ? t(state, "loadingMarket") : t(state, "noMarketData"),
                state.marketError ? t(state, state.marketError) : t(state, "clickRefresh"),
                state.marketLoading,
            );
        }

        const rankedGroups = groups || buildRankedGroups(
            state.catalog,
            state.marketData,
            state.priceMode,
            state.includeEnhancedQuotes,
        );
        const hasSearch = normalizeSearchText(state.searchText).length > 0;
        if (state.selectedCredit === OVERVIEW_CREDIT && !hasSearch) {
            return renderOverview(state, rankedGroups);
        }
        return renderRankingTable(state, rankedGroups, state.selectedCredit === OVERVIEW_CREDIT);
    }

    function getCatalogSourceLabel(state) {
        const dataSource = state.activeView === APP_VIEW_SHRINE && state.guildBuffs.length > 0
            ? state.guildBuffSource
            : state.catalogSource;
        let dataLabel = t(state, "dataWaiting");
        if (dataSource === "websocket") {
            dataLabel = t(state, "dataLive");
        } else if (dataSource === "game-storage") {
            dataLabel = t(state, "dataGameStorage");
        }

        const localizedCount = Object.keys(state.itemNamesZh).length;
        let nameLabel = t(state, "namesEnglish");
        if (state.uiLanguage === LANGUAGE_ZH) {
            nameLabel = localizedCount > 0 ? t(state, "namesOfficialZh") : t(state, "namesEnglish");
        }
        return `${dataLabel} · ${nameLabel}`;
    }

    function applyStaticTranslations(state) {
        const ui = state.ui;
        if (!ui) {
            return;
        }

        ui.host.lang = state.uiLanguage === LANGUAGE_ZH ? "zh-CN" : "en";
        ui.languageSelect.value = state.uiLanguage;
        for (const element of ui.shadow.querySelectorAll("[data-i18n]")) {
            element.textContent = t(state, element.dataset.i18n);
        }
        for (const element of ui.shadow.querySelectorAll("[data-i18n-title]")) {
            element.title = t(state, element.dataset.i18nTitle);
        }
        for (const element of ui.shadow.querySelectorAll("[data-i18n-aria]")) {
            element.setAttribute("aria-label", t(state, element.dataset.i18nAria));
        }
        for (const element of ui.shadow.querySelectorAll("[data-i18n-placeholder]")) {
            element.setAttribute("placeholder", t(state, element.dataset.i18nPlaceholder));
        }
    }

    function updateUi(state) {
        const ui = state.ui;
        if (!ui) {
            return;
        }

        applyStaticTranslations(state);
        ui.panel.hidden = !state.isOpen;
        ui.launcher.hidden = state.isOpen;
        const isRefreshing = state.marketLoading;
        const cooldownRemainingMs = Math.max(0, state.marketRefreshCooldownUntil - Date.now());
        const isCoolingDown = cooldownRemainingMs > 0;
        ui.refreshButton.classList.toggle("is-loading", isRefreshing);
        ui.refreshButton.disabled = isRefreshing || isCoolingDown;
        ui.refreshButton.setAttribute("aria-busy", String(isRefreshing));
        ui.refreshButton.title = isRefreshing
            ? t(state, "marketRefreshing")
            : (isCoolingDown
                ? t(state, "marketRefreshCooldown", { seconds: Math.ceil(cooldownRemainingMs / 1000) })
                : t(state, "refreshData"));
        ui.refreshButton.setAttribute("aria-label", ui.refreshButton.title);
        const isDonationView = state.activeView === APP_VIEW_DONATION;
        const isTokenView = state.activeView === APP_VIEW_TOKEN;
        const isShrineView = state.activeView === APP_VIEW_SHRINE;
        ui.viewButtons.forEach((button) => {
            const isActive = button.dataset.view === state.activeView;
            button.classList.toggle("is-active", isActive);
            button.setAttribute("aria-selected", String(isActive));
        });
        ui.donationView.hidden = !isDonationView;
        ui.tokenView.hidden = !isTokenView;
        ui.shrineView.hidden = !isShrineView;
        ui.modeButtons.forEach((button) => {
            const isActive = button.dataset.mode === state.priceMode;
            button.classList.toggle("is-active", isActive);
            button.setAttribute("aria-pressed", String(isActive));
        });
        ui.showUnquoted.checked = state.showUnquoted;
        ui.includeEnhancedQuotes.checked = state.includeEnhancedQuotes;
        const hasPricingData = state.catalog.length > 0 && Object.keys(state.marketData).length > 0;
        if (isDonationView) {
            const groups = hasPricingData
                ? buildRankedGroups(
                    state.catalog,
                    state.marketData,
                    state.priceMode,
                    state.includeEnhancedQuotes,
                )
                : {};
            ui.tabs.innerHTML = renderCreditTabs(state);
            ui.contentResults.innerHTML = renderMainContent(state, groups);
            updateTargetCalculator(state, groups);
            const quotedCount = Object.values(groups).flat().filter((row) => row.hasQuote).length;
            ui.headerStatus.textContent = t(state, "headerStatus", {
                conversions: formatExactNumber(getMarketDonationCatalog(state.catalog).length, 0, state.uiLanguage),
                quoted: formatExactNumber(quotedCount, 0, state.uiLanguage),
            });
        } else if (isTokenView) {
            updateGuildTokenPlanner(state);
            ui.headerStatus.textContent = t(state, "tokenHeaderStatus", {
                count: formatExactNumber(getGuildTokenRateConversions(state.catalog).length, 0, state.uiLanguage),
            });
        } else {
            const askGroups = hasPricingData
                ? buildRankedGroups(
                    state.catalog,
                    state.marketData,
                    PRICE_MODE_ASK,
                    state.includeEnhancedQuotes,
                )
                : {};
            updateShrinePlanner(state, askGroups);
            const quotedCount = Object.values(askGroups).flat().filter((row) => row.hasQuote).length;
            ui.headerStatus.textContent = t(state, "shrineHeaderStatus", {
                buffs: formatExactNumber(state.guildBuffs.length, 0, state.uiLanguage),
                quoted: formatExactNumber(quotedCount, 0, state.uiLanguage),
            });
        }
        ui.catalogStatus.textContent = getCatalogSourceLabel(state);
        ui.catalogStatus.title = state.itemNamesSource || "";
        const liveItemCount = Object.keys(state.marketLiveData || {}).length;
        if (state.marketLoading) {
            ui.marketStatus.textContent = t(state, "marketRefreshing");
        } else if (state.marketTimestamp > 0 && liveItemCount > 0) {
            ui.marketStatus.textContent = t(state, "marketStatusWithLive", {
                time: formatTimestamp(state.marketTimestamp, state.uiLanguage),
                count: formatExactNumber(liveItemCount, 0, state.uiLanguage),
            });
        } else if (state.marketTimestamp > 0) {
            ui.marketStatus.textContent = t(state, "marketStatus", {
                time: formatTimestamp(state.marketTimestamp, state.uiLanguage),
            });
        } else if (liveItemCount > 0) {
            ui.marketStatus.textContent = t(state, "marketPassiveStatus", {
                count: formatExactNumber(liveItemCount, 0, state.uiLanguage),
            });
        } else {
            ui.marketStatus.textContent = t(state, "marketWaiting");
        }
        ui.marketStatus.title = [state.marketSourceUrl, state.marketLiveSource].filter(Boolean).join(" · ");
    }

    function itemHridFromSpriteReference(reference) {
        const value = String(reference || "").trim();
        const hashIndex = value.lastIndexOf("#");
        if (hashIndex < 0 || !value.slice(0, hashIndex).toLowerCase().includes("items_sprite")) {
            return "";
        }

        let iconName = value.slice(hashIndex + 1);
        try {
            iconName = decodeURIComponent(iconName);
        } catch (_error) {
        }
        return /^[a-z0-9_]+$/i.test(iconName) ? `/items/${iconName}` : "";
    }

    function getSpriteReference(useElement) {
        if (!useElement) {
            return "";
        }
        return String(
            useElement.getAttribute?.("href")
            || useElement.getAttribute?.("xlink:href")
            || useElement.href?.baseVal
            || "",
        );
    }

    function getSelectedEnhancementLevel(useElement) {
        const itemElement = useElement?.closest?.('[class*="Item_item__"]');
        const levelText = String(
            itemElement?.querySelector?.('[class*="Item_enhancementLevel__"]')?.textContent || "",
        ).trim();
        const match = levelText.match(/^\+(\d+)$/);
        return match ? normalizeNonNegativeInteger(match[1], 0) : 0;
    }

    function extractDonationModalContext(exchangeContent) {
        if (!exchangeContent || typeof exchangeContent.querySelectorAll !== "function") {
            return null;
        }

        const exchangeRow = exchangeContent.querySelector?.('[class*="GuildPanel_exchangeRow__"]')
            || exchangeContent;
        const entries = Array.from(exchangeRow.querySelectorAll("use"))
            .map((useElement) => {
                const reference = getSpriteReference(useElement);
                return {
                    useElement,
                    reference,
                    itemHrid: itemHridFromSpriteReference(reference),
                };
            })
            .filter((entry) => entry.itemHrid);
        const creditIndex = entries.findIndex((entry) => (
            Boolean(CREDIT_DEFINITION_BY_HRID[entry.itemHrid])
        ));
        if (creditIndex < 0) {
            return null;
        }

        const creditEntry = entries[creditIndex];
        const selectedEntry = entries.slice(0, creditIndex).reverse().find((entry) => (
            entry.itemHrid !== creditEntry.itemHrid
        )) || entries.find((entry, index) => (
            index !== creditIndex && entry.itemHrid !== creditEntry.itemHrid
        )) || null;
        const hashIndex = creditEntry.reference.lastIndexOf("#");
        return {
            creditHrid: creditEntry.itemHrid,
            selectedItemHrid: selectedEntry?.itemHrid || "",
            selectedEnhancementLevel: selectedEntry
                ? getSelectedEnhancementLevel(selectedEntry.useElement)
                : 0,
            spriteUrl: hashIndex >= 0 ? creditEntry.reference.slice(0, hashIndex) : "",
        };
    }

    function findDonationModal(root = document) {
        if (!root || typeof root.querySelectorAll !== "function") {
            return null;
        }

        const candidates = [];
        const seen = new Set();
        for (const element of root.querySelectorAll('[class*="GuildPanel_exchangeModalContent__"]')) {
            candidates.push(element);
            seen.add(element);
        }
        for (const element of root.querySelectorAll('[class*="Modal_modalContent__"]')) {
            if (!seen.has(element) && String(element.textContent || "").includes("→")) {
                candidates.push(element);
            }
        }

        for (let index = candidates.length - 1; index >= 0; index -= 1) {
            const exchangeContent = candidates[index];
            const context = extractDonationModalContext(exchangeContent);
            const modal = exchangeContent.closest?.('[class*="Modal_modal__"]');
            if (!context || !modal || modal.hidden || modal.getClientRects?.().length === 0) {
                continue;
            }
            return { context, exchangeContent, modal };
        }
        return null;
    }

    function calculateDonationAssistantPosition(
        modalRect,
        cardSize,
        viewportSize,
        gap = DONATION_ASSISTANT_GAP,
        margin = DONATION_ASSISTANT_VIEWPORT_MARGIN,
    ) {
        const viewportWidth = Math.max(0, Number(viewportSize?.width) || 0);
        const viewportHeight = Math.max(0, Number(viewportSize?.height) || 0);
        const cardWidth = Math.max(0, Number(cardSize?.width) || 0);
        const cardHeight = Math.max(0, Number(cardSize?.height) || 0);
        const modalLeft = Number(modalRect?.left) || 0;
        const modalTop = Number(modalRect?.top) || 0;
        const modalWidth = Math.max(0, Number(modalRect?.width) || 0);
        const modalHeight = Math.max(0, Number(modalRect?.height) || 0);
        const modalRight = Number.isFinite(Number(modalRect?.right))
            ? Number(modalRect.right)
            : modalLeft + modalWidth;
        const modalBottom = Number.isFinite(Number(modalRect?.bottom))
            ? Number(modalRect.bottom)
            : modalTop + modalHeight;
        const safeGap = Math.max(0, Number(gap) || 0);
        const safeMargin = Math.max(0, Number(margin) || 0);
        const maxLeft = Math.max(safeMargin, viewportWidth - cardWidth - safeMargin);
        const maxTop = Math.max(safeMargin, viewportHeight - cardHeight - safeMargin);
        const clampLeft = (value) => Math.min(Math.max(value, safeMargin), maxLeft);
        const clampTop = (value) => Math.min(Math.max(value, safeMargin), maxTop);

        if (modalRight + safeGap + cardWidth <= viewportWidth - safeMargin) {
            return {
                placement: "right",
                left: modalRight + safeGap,
                top: clampTop(modalTop),
            };
        }
        if (modalLeft - safeGap - cardWidth >= safeMargin) {
            return {
                placement: "left",
                left: modalLeft - safeGap - cardWidth,
                top: clampTop(modalTop),
            };
        }
        if (modalBottom + safeGap + cardHeight <= viewportHeight - safeMargin) {
            return {
                placement: "bottom",
                left: clampLeft(modalLeft + (modalWidth - cardWidth) / 2),
                top: modalBottom + safeGap,
            };
        }
        if (modalTop - safeGap - cardHeight >= safeMargin) {
            return {
                placement: "top",
                left: clampLeft(modalLeft + (modalWidth - cardWidth) / 2),
                top: modalTop - safeGap - cardHeight,
            };
        }
        return {
            placement: "overlay",
            left: clampLeft(modalLeft + (modalWidth - cardWidth) / 2),
            top: clampTop(viewportHeight - cardHeight - safeMargin),
        };
    }

    function calculateDonationAssistantDragPosition(
        dragState,
        pointerPosition,
        viewportSize,
        margin = DONATION_ASSISTANT_VIEWPORT_MARGIN,
    ) {
        const startPointerX = Number(dragState?.startPointerX) || 0;
        const startPointerY = Number(dragState?.startPointerY) || 0;
        const pointerX = Number.isFinite(Number(pointerPosition?.x))
            ? Number(pointerPosition.x)
            : startPointerX;
        const pointerY = Number.isFinite(Number(pointerPosition?.y))
            ? Number(pointerPosition.y)
            : startPointerY;
        return clampPanelPosition(
            {
                x: (Number(dragState?.startCardX) || 0) + pointerX - startPointerX,
                y: (Number(dragState?.startCardY) || 0) + pointerY - startPointerY,
            },
            {
                width: Number(dragState?.cardWidth) || 0,
                height: Number(dragState?.cardHeight) || 0,
            },
            viewportSize,
            margin,
        );
    }

    function donationAssistantItemIconMarkup(state, row, spriteUrl) {
        const displayName = resolveDisplayItemName(state, row.itemHrid, row.itemName);
        const iconName = itemIconNameFromHrid(row.itemHrid);
        const resolvedSpriteUrl = state.spriteUrl || spriteUrl;
        if (resolvedSpriteUrl && iconName) {
            return `<svg class="assistant-item-icon" role="img" aria-label="${escapeHtml(displayName)}"><use href="${escapeHtml(`${resolvedSpriteUrl}#${iconName}`)}"></use></svg>`;
        }
        return `<span class="assistant-item-icon assistant-item-icon-fallback" aria-hidden="true">${escapeHtml(displayName.charAt(0).toUpperCase() || "?")}</span>`;
    }

    function renderDonationAssistantItemPane(state, row, label, spriteUrl, isRecommended = false) {
        const displayName = resolveDisplayItemName(state, row.itemHrid, row.itemName);
        const marketPrice = row.hasQuote
            ? formatCompactNumber(row.marketPrice, state.uiLanguage)
            : "--";
        const coinsPerCredit = row.hasQuote
            ? formatCompactNumber(row.coinsPerCredit, state.uiLanguage)
            : "--";
        const costTitle = row.hasQuote
            ? t(state, "coinsPerCreditTitle", {
                value: formatExactNumber(row.coinsPerCredit, 4, state.uiLanguage),
            })
            : t(state, "noMarketQuote");
        return `
            <section class="assistant-item-pane${isRecommended ? " is-recommended" : ""}">
                <div class="assistant-pane-label"><span>${escapeHtml(label)}</span>${isRecommended ? `<strong>${escapeHtml(t(state, "bestEligible"))}</strong>` : ""}</div>
                <div class="assistant-item-line">
                    ${donationAssistantItemIconMarkup(state, row, spriteUrl)}
                    <span class="assistant-item-copy">
                        <strong title="${escapeHtml(`${displayName} · ${row.itemHrid}`)}">${escapeHtml(displayName)}</strong>
                        ${enhancementBadgeMarkup(state, row)}
                    </span>
                </div>
                <div class="assistant-primary-metric" title="${escapeHtml(costTitle)}">
                    <strong>${escapeHtml(coinsPerCredit)}</strong>
                    <small>${escapeHtml(t(state, "donationAssistantCostUnit"))}</small>
                </div>
                <dl class="assistant-facts">
                    <div><dt>${escapeHtml(t(state, "marketUnitPrice"))}</dt><dd title="${escapeHtml(getMarketPriceTitle(state, row))}">${escapeHtml(marketPrice)}</dd></div>
                    <div><dt>${escapeHtml(t(state, "donationBatchHeader"))}</dt><dd>${escapeHtml(formatDonationBatchText(state, row.itemCount, row.creditCount))}</dd></div>
                </dl>
            </section>
        `;
    }

    function renderDonationAssistantMarkup(state, context, recommendation) {
        const credit = getCreditDefinition(context.creditHrid);
        const creditName = t(state, "creditName", {
            color: getCreditLabel(credit, state.uiLanguage),
        });
        const askActive = state.priceMode === PRICE_MODE_ASK;
        const header = `
            <header class="assistant-header" data-assistant-drag-handle title="${escapeHtml(t(state, "dragPanel"))}">
                <span class="assistant-drag-grip" aria-hidden="true">
                    <span></span><span></span><span></span><span></span><span></span><span></span>
                </span>
                <span class="assistant-heading">
                    <span class="assistant-title">${escapeHtml(t(state, "donationAssistantTitle"))}</span>
                    <span class="assistant-credit"><i aria-hidden="true"></i>${escapeHtml(creditName)}</span>
                </span>
                <span class="assistant-mode" role="group" aria-label="${escapeHtml(t(state, "priceBasis"))}">
                    <button type="button" data-assistant-mode="${PRICE_MODE_ASK}" class="${askActive ? "is-active" : ""}" aria-pressed="${askActive}" title="${escapeHtml(t(state, "acquirePriceTitle"))}">${escapeHtml(t(state, "acquirePrice"))}</button>
                    <button type="button" data-assistant-mode="${PRICE_MODE_BID}" class="${askActive ? "" : "is-active"}" aria-pressed="${!askActive}" title="${escapeHtml(t(state, "liquidationPriceTitle"))}">${escapeHtml(t(state, "liquidationPrice"))}</button>
                </span>
            </header>
        `;

        if (!state.catalog.length || !Object.keys(state.marketData).length) {
            return `${header}<div class="assistant-empty" role="status"><span aria-hidden="true"></span>${escapeHtml(t(state, "donationAssistantWaiting"))}</div>`;
        }
        if (isPassiveMarketDataOnly(state)) {
            return `${header}<div class="assistant-empty" role="status"><strong>--</strong>${escapeHtml(t(state, "marketPassivePartial"))}</div>`;
        }
        if (!recommendation.rows.length) {
            return `${header}<div class="assistant-empty" role="status"><strong>--</strong>${escapeHtml(t(state, "donationAssistantNoConversions"))}</div>`;
        }
        if (!recommendation.recommended) {
            return `${header}<div class="assistant-empty" role="status"><strong>--</strong>${escapeHtml(t(state, "donationAssistantNoQuote"))}</div>`;
        }

        const recommendedMarkup = renderDonationAssistantItemPane(
            state,
            recommendation.recommended,
            t(state, "donationAssistantRecommended"),
            context.spriteUrl,
            true,
        );
        if (recommendation.isDifferentChoice && recommendation.selected) {
            const selectedMarkup = renderDonationAssistantItemPane(
                state,
                recommendation.selected,
                t(state, "donationAssistantCurrent"),
                context.spriteUrl,
            );
            let comparisonNote = "";
            if (!recommendation.selected.hasQuote) {
                comparisonNote = t(state, "donationAssistantSelectedNoQuote");
            } else if (recommendation.isSelectedExcludedByFilter
                && recommendation.isSelectedCheaper
                && recommendation.selectedSavingsPercent != null) {
                comparisonNote = t(state, "donationAssistantSelectedCheaper", {
                    value: formatExactNumber(
                        recommendation.selectedSavingsPercent,
                        recommendation.selectedSavingsPercent < 10 ? 1 : 0,
                        state.uiLanguage,
                    ),
                });
            } else if (recommendation.isCostTie) {
                comparisonNote = t(state, "donationAssistantTie");
            } else if (recommendation.savingsPercent != null && recommendation.savingsPercent > 0) {
                comparisonNote = t(state, "donationAssistantSavings", {
                    value: formatExactNumber(
                        recommendation.savingsPercent,
                        recommendation.savingsPercent < 10 ? 1 : 0,
                        state.uiLanguage,
                    ),
                });
            }
            return `
                ${header}
                <div class="assistant-comparison" aria-label="${escapeHtml(t(state, "donationAssistantComparison"))}">
                    ${selectedMarkup}
                    <span class="assistant-versus" aria-hidden="true">VS</span>
                    ${recommendedMarkup}
                </div>
                ${comparisonNote ? `<div class="assistant-note">${escapeHtml(comparisonNote)}</div>` : ""}
            `;
        }

        const selectedNote = recommendation.isRecommendedItem
            ? `<div class="assistant-note is-success">${escapeHtml(t(state, "donationAssistantRecommendedSelected"))}</div>`
            : "";
        return `${header}<div class="assistant-single">${recommendedMarkup}</div>${selectedNote}`;
    }

    const DONATION_ASSISTANT_STYLES = `
        :host {
            all: initial;
            color-scheme: dark;
            font-family: Lexend, "Microsoft YaHei", "PingFang SC", sans-serif;
        }
        *, *::before, *::after { box-sizing: border-box; }
        button { font: inherit; letter-spacing: 0; }
        [hidden] { display: none !important; }
        .donation-assistant {
            --credit: #58c981;
            position: fixed;
            z-index: 1065;
            width: min(400px, calc(100vw - 16px));
            max-height: calc(100vh - 16px);
            max-height: calc(100dvh - 16px);
            overflow: auto;
            border: 1px solid #68727f;
            border-left: 3px solid var(--credit);
            border-radius: 7px;
            background: #14191f;
            box-shadow: 0 18px 48px rgba(0, 0, 0, .56);
            color: #edf1f4;
            scrollbar-color: #59636f #14191f;
            animation: assistant-enter 160ms ease-out both;
        }
        .assistant-header {
            min-height: 68px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            padding: 12px 13px 12px 15px;
            border-bottom: 1px solid #343c46;
            background: #1b2128;
            cursor: grab;
            touch-action: none;
            user-select: none;
        }
        .donation-assistant.is-dragging { will-change: left, top; }
        .donation-assistant.is-dragging .assistant-header { cursor: grabbing; }
        .assistant-drag-grip { width: 11px; flex: 0 0 11px; display: grid; grid-template-columns: repeat(2, 3px); gap: 3px 2px; color: #717c87; }
        .assistant-drag-grip span { width: 3px; height: 3px; border-radius: 1px; background: currentColor; }
        .assistant-heading { min-width: 0; flex: 1 1 auto; display: grid; gap: 5px; }
        .assistant-title { overflow: hidden; color: #f7f9fb; font-size: 16px; line-height: 1.2; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
        .assistant-credit { min-width: 0; display: flex; align-items: center; gap: 6px; color: #aeb7c1; font-size: 12px; line-height: 1.2; }
        .assistant-credit i { width: 8px; height: 8px; flex: 0 0 8px; border-radius: 2px; background: var(--credit); box-shadow: 0 0 0 1px rgba(255, 255, 255, .22); }
        .assistant-mode { flex: 0 0 auto; display: grid; grid-template-columns: repeat(2, 1fr); padding: 2px; border: 1px solid #3c4651; border-radius: 5px; background: #11161b; }
        .assistant-mode button { min-width: 64px; height: 32px; padding: 0 10px; border: 0; border-radius: 3px; background: transparent; color: #929da8; font-size: 13px; line-height: 1; cursor: pointer; touch-action: manipulation; }
        .assistant-mode button:hover { color: #eef2f5; background: #252d35; }
        .assistant-mode button.is-active { background: #39434e; color: #fff; box-shadow: inset 0 -2px 0 var(--credit); }
        .assistant-mode button:focus-visible { outline: 2px solid #63d2bd; outline-offset: 2px; }
        .assistant-empty { min-height: 136px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: 24px; color: #abb4be; font-size: 14px; line-height: 1.5; text-align: center; }
        .assistant-empty > span { width: 20px; height: 20px; border: 2px solid #4b5560; border-top-color: var(--credit); border-radius: 50%; animation: assistant-spin 800ms linear infinite; }
        .assistant-empty strong { color: #d7dde3; font-size: 24px; }
        .assistant-single { padding: 0 16px; }
        .assistant-comparison { display: grid; grid-template-columns: minmax(0, 1fr) 32px minmax(0, 1fr); align-items: stretch; padding: 0 12px; }
        .assistant-versus { align-self: center; display: grid; place-items: center; width: 32px; height: 32px; border: 1px solid #45505b; border-radius: 50%; background: #11161b; color: #89949f; font-size: 11px; font-weight: 800; }
        .assistant-item-pane { min-width: 0; padding: 16px 8px 15px; }
        .assistant-item-pane.is-recommended { color: #f5f8fa; }
        .assistant-pane-label { min-height: 20px; display: flex; align-items: center; justify-content: space-between; gap: 6px; color: #9da7b1; font-size: 11px; line-height: 1.2; text-transform: uppercase; }
        .assistant-pane-label strong { padding: 3px 5px; border-radius: 3px; background: var(--credit); color: #10161a; font-size: 10px; line-height: 1; }
        .assistant-item-line { min-width: 0; min-height: 50px; display: flex; align-items: center; gap: 9px; margin-top: 7px; }
        .assistant-item-icon { width: 46px; height: 46px; flex: 0 0 46px; }
        .assistant-item-icon-fallback { display: grid; place-items: center; border: 1px solid #4d5863; border-radius: 5px; background: #242b33; color: #dbe1e6; font-size: 21px; font-weight: 700; }
        .assistant-item-copy { min-width: 0; display: flex; flex-direction: column; align-items: flex-start; gap: 4px; }
        .assistant-item-copy > strong { width: 100%; overflow: hidden; color: #f1f4f6; font-size: 14px; line-height: 1.25; font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
        .enhancement-badge { display: inline-flex; align-items: center; min-height: 20px; padding: 2px 6px; border: 1px solid #795f31; border-radius: 3px; background: #2c261a; color: #e8bd55; font-size: 10px; line-height: 1; }
        .assistant-primary-metric { display: flex; align-items: baseline; gap: 6px; margin-top: 10px; padding: 10px 0 9px; border-top: 1px solid #303943; border-bottom: 1px solid #303943; }
        .assistant-primary-metric strong { min-width: 0; overflow: hidden; color: var(--credit); font-size: 24px; line-height: 1; font-variant-numeric: tabular-nums; text-overflow: ellipsis; white-space: nowrap; }
        .assistant-primary-metric small { color: #89939e; font-size: 10px; line-height: 1.2; }
        .assistant-facts { display: grid; gap: 7px; margin: 9px 0 0; }
        .assistant-facts > div { min-width: 0; display: grid; grid-template-columns: minmax(0, 1fr) max-content; align-items: start; gap: 7px; }
        .assistant-facts dt, .assistant-facts dd { min-width: 0; margin: 0; font-size: 11px; line-height: 1.35; }
        .assistant-facts dt { overflow: hidden; color: #7f8994; text-overflow: ellipsis; white-space: nowrap; }
        .assistant-facts dd { color: #cbd2d9; text-align: right; white-space: nowrap; }
        .assistant-note { padding: 12px 15px; border-top: 1px solid #37414b; background: #20262d; color: #dce2e7; font-size: 13px; line-height: 1.4; text-align: center; }
        .assistant-note.is-success { color: #a7e4bd; }
        @keyframes assistant-enter { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes assistant-spin { to { transform: rotate(360deg); } }
        @media (max-width: 900px), (pointer: coarse) {
            .donation-assistant {
                max-height: min(300px, calc(100vh - 16px));
                max-height: min(300px, calc(100dvh - 16px));
                overscroll-behavior: contain;
            }
            .assistant-header { position: sticky; z-index: 1; top: 0; min-height: 54px; padding: 9px 10px 9px 12px; background: #1b2128; }
            .assistant-comparison { grid-template-columns: minmax(0, 1fr) 28px minmax(0, 1fr); padding: 0 7px; }
            .assistant-versus { width: 28px; height: 28px; }
            .assistant-item-pane { padding: 11px 6px 10px; }
            .assistant-pane-label { min-height: 18px; font-size: 10px; }
            .assistant-item-line { min-height: 42px; gap: 7px; margin-top: 5px; }
            .assistant-item-icon { width: 36px; height: 36px; flex-basis: 36px; }
            .assistant-item-copy > strong { font-size: 12px; }
            .assistant-primary-metric { gap: 4px; margin-top: 7px; padding: 7px 0; }
            .assistant-primary-metric strong { font-size: 20px; }
            .assistant-facts { gap: 5px; margin-top: 7px; }
            .assistant-note { padding: 9px 11px; font-size: 12px; }
        }
        @media (max-width: 420px) {
            .donation-assistant {
                width: calc(100vw - 16px);
                max-height: min(270px, calc(100vh - 16px));
                max-height: min(270px, calc(100dvh - 16px));
            }
            .assistant-header { align-items: flex-start; }
            .assistant-title { font-size: 15px; }
            .assistant-mode button { min-width: 56px; height: 30px; padding: 0 8px; font-size: 12px; }
            .assistant-facts dt, .assistant-facts dd { font-size: 10px; }
        }
        @media (prefers-reduced-motion: reduce) {
            .donation-assistant, .assistant-empty > span { animation: none; }
            * { transition: none !important; }
        }
    `;

    function createDonationAssistantUi(state) {
        if (!document.body || state.donationAssistantUi) {
            return state.donationAssistantUi;
        }
        if (document.getElementById(DONATION_ASSISTANT_HOST_ID)) {
            return null;
        }

        const host = document.createElement("div");
        host.id = DONATION_ASSISTANT_HOST_ID;
        const shadow = host.attachShadow({ mode: "open" });
        shadow.innerHTML = `
            <style>${DONATION_ASSISTANT_STYLES}</style>
            <aside class="donation-assistant" data-donation-assistant aria-live="polite" hidden></aside>
        `;
        document.body.appendChild(host);
        const ui = {
            host,
            shadow,
            card: shadow.querySelector("[data-donation-assistant]"),
            signature: "",
            modal: null,
        };
        state.donationAssistantUi = ui;
        shadow.addEventListener("click", (event) => {
            const button = event.target.closest?.("[data-assistant-mode]");
            if (!button) {
                return;
            }
            const nextMode = normalizePriceMode(button.dataset.assistantMode);
            if (nextMode === state.priceMode) {
                return;
            }
            state.priceMode = nextMode;
            state.visibleRows = INITIAL_VISIBLE_ROWS;
            persistSettings(state);
            state.render?.();
        });
        installDonationAssistantDragging(state);
        return ui;
    }

    function installDonationAssistantDragging(state) {
        const ui = state.donationAssistantUi;
        if (!ui || state.donationAssistantDragListenersInstalled) {
            return false;
        }

        ui.shadow.addEventListener("pointerdown", (event) => {
            const dragHandle = event.target.closest?.("[data-assistant-drag-handle]");
            if (!dragHandle || !canStartPointerDrag(event, state.donationAssistantDragState)) {
                return;
            }
            const card = ui.card;
            if (!card || card.hidden) {
                return;
            }

            const rect = card.getBoundingClientRect();
            const initialPosition = clampPanelPosition(
                { x: rect.left, y: rect.top },
                { width: rect.width, height: rect.height },
                { width: window.innerWidth, height: window.innerHeight },
                DONATION_ASSISTANT_VIEWPORT_MARGIN,
            );
            state.donationAssistantPosition = initialPosition;
            state.donationAssistantDragState = {
                pointerId: event.pointerId,
                startPointerX: event.clientX,
                startPointerY: event.clientY,
                startCardX: initialPosition.x,
                startCardY: initialPosition.y,
                cardWidth: rect.width,
                cardHeight: rect.height,
                position: initialPosition,
            };
            card.dataset.placement = "manual";
            card.classList.add("is-dragging");
            try {
                card.setPointerCapture(event.pointerId);
            } catch (_error) {
            }
            event.preventDefault();
        });

        window.addEventListener("pointermove", (event) => {
            const drag = state.donationAssistantDragState;
            if (!drag || drag.pointerId !== event.pointerId) {
                return;
            }
            const position = calculateDonationAssistantDragPosition(
                drag,
                { x: event.clientX, y: event.clientY },
                { width: window.innerWidth, height: window.innerHeight },
            );
            drag.position = position;
            state.donationAssistantPosition = position;
            ui.card.style.left = `${position.x}px`;
            ui.card.style.top = `${position.y}px`;
            ui.card.dataset.placement = "manual";
            if (event.cancelable) {
                event.preventDefault();
            }
        }, { passive: false });

        function finishDragging(event) {
            const drag = state.donationAssistantDragState;
            if (!drag || drag.pointerId !== event.pointerId) {
                return;
            }
            state.donationAssistantDragState = null;
            state.donationAssistantPosition = drag.position;
            ui.card.classList.remove("is-dragging");
            try {
                if (ui.card.hasPointerCapture(event.pointerId)) {
                    ui.card.releasePointerCapture(event.pointerId);
                }
            } catch (_error) {
            }
        }

        window.addEventListener("pointerup", finishDragging);
        window.addEventListener("pointercancel", finishDragging);
        ui.card.addEventListener("lostpointercapture", finishDragging);
        state.donationAssistantDragListenersInstalled = true;
        return true;
    }

    function resetDonationAssistantDragging(state) {
        const drag = state.donationAssistantDragState;
        state.donationAssistantDragState = null;
        state.donationAssistantPosition = null;
        state.donationAssistantUi?.card?.classList.remove("is-dragging");
        if (drag) {
            try {
                if (state.donationAssistantUi?.card?.hasPointerCapture(drag.pointerId)) {
                    state.donationAssistantUi.card.releasePointerCapture(drag.pointerId);
                }
            } catch (_error) {
            }
        }
    }

    function positionDonationAssistant(state, modal) {
        const card = state.donationAssistantUi?.card;
        if (!card || !modal) {
            return false;
        }

        const wasHidden = card.hidden;
        if (wasHidden) {
            card.style.visibility = "hidden";
            card.hidden = false;
        }
        const modalRect = modal.getBoundingClientRect();
        const cardRect = card.getBoundingClientRect();
        if (modalRect.width <= 0 || modalRect.height <= 0 || cardRect.width <= 0 || cardRect.height <= 0) {
            card.hidden = true;
            card.style.removeProperty("visibility");
            return false;
        }

        let position;
        if (state.donationAssistantPosition) {
            const manualPosition = clampPanelPosition(
                state.donationAssistantPosition,
                { width: cardRect.width, height: cardRect.height },
                { width: window.innerWidth, height: window.innerHeight },
                DONATION_ASSISTANT_VIEWPORT_MARGIN,
            );
            state.donationAssistantPosition = manualPosition;
            position = {
                placement: "manual",
                left: manualPosition.x,
                top: manualPosition.y,
            };
        } else {
            position = calculateDonationAssistantPosition(
                modalRect,
                { width: cardRect.width, height: cardRect.height },
                { width: window.innerWidth, height: window.innerHeight },
            );
        }
        card.style.left = `${position.left}px`;
        card.style.top = `${position.top}px`;
        card.dataset.placement = position.placement;
        card.hidden = false;
        card.style.removeProperty("visibility");
        return true;
    }

    function updateDonationAssistant(state, forceRender = false) {
        const ui = state.donationAssistantUi;
        if (!ui) {
            return false;
        }

        const match = findDonationModal(document);
        if (!match) {
            ui.card.hidden = true;
            ui.signature = "";
            ui.modal = null;
            resetDonationAssistantDragging(state);
            return false;
        }

        if (ui.modal !== match.modal) {
            resetDonationAssistantDragging(state);
        }
        ui.modal = match.modal;

        const recommendation = buildDonationRecommendation(
            state.catalog,
            state.marketData,
            state.priceMode,
            match.context.creditHrid,
            match.context.selectedItemHrid,
            match.context.selectedEnhancementLevel,
            state.includeEnhancedQuotes,
        );
        const markup = renderDonationAssistantMarkup(state, match.context, recommendation);
        if (forceRender || ui.signature !== markup) {
            ui.card.innerHTML = markup;
            ui.signature = markup;
        }
        const credit = getCreditDefinition(match.context.creditHrid);
        ui.host.lang = state.uiLanguage === LANGUAGE_ZH ? "zh-CN" : "en";
        ui.card.setAttribute("aria-label", t(state, "donationAssistantTitle"));
        ui.card.style.setProperty("--credit", credit.color);
        return positionDonationAssistant(state, match.modal);
    }

    function scheduleDonationAssistantUpdate(state, forceRender = false) {
        if (!state.donationAssistantUi) {
            return;
        }
        state.donationAssistantForceRender = state.donationAssistantForceRender || forceRender;
        if (state.donationAssistantFrameId != null) {
            return;
        }

        const callback = () => {
            const shouldForceRender = state.donationAssistantForceRender;
            state.donationAssistantFrameId = null;
            state.donationAssistantForceRender = false;
            updateDonationAssistant(state, shouldForceRender);
        };
        const requestFrame = typeof window.requestAnimationFrame === "function"
            ? window.requestAnimationFrame.bind(window)
            : (handler) => window.setTimeout(handler, 0);
        state.donationAssistantFrameId = requestFrame(callback);
    }

    function mutationMayAffectDonationAssistant(state, mutation) {
        const guildModalSelector = '[class*="GuildPanel_exchangeModalContent__"]';
        const genericModalSelector = '[class*="Modal_modalContent__"]';
        const isGenericModalCandidate = (element) => Boolean(
            element && String(element.textContent || "").includes("→"),
        );
        const targetElement = mutation.target?.nodeType === 1
            ? mutation.target
            : mutation.target?.parentElement;
        const activeModal = state.donationAssistantUi?.modal;
        if (activeModal) {
            if (!activeModal.isConnected || mutation.target === activeModal
                || activeModal.contains?.(mutation.target)
                || (mutation.type === "attributes" && targetElement?.contains?.(activeModal))) {
                return true;
            }
            return [...(mutation.addedNodes || []), ...(mutation.removedNodes || [])]
                .some((node) => node === activeModal || node.contains?.(activeModal));
        }

        if (targetElement?.closest?.(guildModalSelector)) {
            return true;
        }
        if (isGenericModalCandidate(targetElement?.closest?.(genericModalSelector))) {
            return true;
        }
        return Array.from(mutation.addedNodes || []).some((node) => {
            if (node?.nodeType !== 1) {
                return false;
            }
            if (node.matches?.(guildModalSelector) || node.querySelector?.(guildModalSelector)) {
                return true;
            }
            if (node.matches?.(genericModalSelector) && isGenericModalCandidate(node)) {
                return true;
            }
            return Array.from(node.querySelectorAll?.(genericModalSelector) || [])
                .some(isGenericModalCandidate);
        });
    }

    function mutationMayExposePassiveResources(mutation) {
        const targetElement = mutation?.target?.nodeType === 1
            ? mutation.target
            : mutation?.target?.parentElement;
        if (targetElement?.matches?.("use") || targetElement?.matches?.('[class^="GamePage"], [class*="GamePage"]')) {
            return true;
        }
        return Array.from(mutation?.addedNodes || []).some((node) => (
            node?.nodeType === 1
            && (node.matches?.("use")
                || node.matches?.('[class^="GamePage"], [class*="GamePage"]')
                || node.querySelector?.("use")
                || node.querySelector?.('[class^="GamePage"], [class*="GamePage"]'))
        ));
    }

    function installDonationAssistantObserver(state) {
        if (!document.body || state.donationAssistantObserver) {
            return false;
        }
        const Observer = state.pageWindow?.MutationObserver
            || (typeof MutationObserver === "function" ? MutationObserver : null);
        if (typeof Observer !== "function") {
            return false;
        }

        state.donationAssistantObserver = new Observer((mutations) => {
            const mutationList = Array.from(mutations || []);
            if (mutationList.some((mutation) => (
                mutationMayAffectDonationAssistant(state, mutation)
            ))) {
                scheduleDonationAssistantUpdate(state);
            }
            if (mutationList.some(mutationMayExposePassiveResources)) {
                discoverPassiveGameResources(state);
            }
        });
        state.donationAssistantObserver.observe(document.body, {
            attributes: true,
            attributeFilter: ["class", "href", "aria-label", "hidden", "style"],
            characterData: true,
            childList: true,
            subtree: true,
        });
        if (!state.donationAssistantListenersInstalled) {
            const reposition = () => scheduleDonationAssistantUpdate(state);
            window.addEventListener("resize", reposition, { passive: true });
            window.addEventListener("orientationchange", reposition, { passive: true });
            window.addEventListener("scroll", reposition, { capture: true, passive: true });
            state.donationAssistantListenersInstalled = true;
        }
        scheduleDonationAssistantUpdate(state, true);
        return true;
    }

    const UI_STYLES = `
        :host {
            all: initial;
            color-scheme: dark;
            font-family: Lexend, "Microsoft YaHei", "PingFang SC", sans-serif;
        }
        *, *::before, *::after { box-sizing: border-box; }
        button, input, select { font: inherit; letter-spacing: 0; }
        button { color: inherit; }
        [hidden] { display: none !important; }
        .launcher {
            position: fixed;
            right: 16px;
            bottom: 84px;
            z-index: 2147483639;
            width: 46px;
            height: 46px;
            display: grid;
            place-items: center;
            padding: 0;
            border: 1px solid #68727f;
            border-radius: 7px;
            background: #171b20;
            box-shadow: 0 10px 28px rgba(0, 0, 0, .45);
            cursor: pointer;
            transition: transform 140ms ease, border-color 140ms ease, background 140ms ease;
        }
        .launcher:hover { transform: translateY(-2px); border-color: #d5d9df; background: #20262d; }
        .launcher:focus-visible, button:focus-visible, input:focus-visible, select:focus-visible { outline: 2px solid #63d2bd; outline-offset: 2px; }
        .launcher-grid {
            width: 24px;
            height: 24px;
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 3px;
        }
        .launcher-grid span { border-radius: 2px; }
        .panel {
            position: fixed;
            right: 16px;
            bottom: 16px;
            z-index: 2147483640;
            width: min(760px, calc(100vw - 24px));
            height: min(720px, calc(100vh - 32px));
            min-height: min(420px, calc(100vh - 32px));
            max-height: calc(100vh - 32px);
            height: min(720px, calc(100dvh - 32px));
            min-height: min(420px, calc(100dvh - 32px));
            max-height: calc(100dvh - 32px);
            display: flex;
            flex-direction: column;
            overflow: hidden;
            color: #e9edf1;
            background: #12161b;
            border: 1px solid #59626d;
            border-radius: 8px;
            box-shadow: 0 22px 70px rgba(0, 0, 0, .58);
        }
        .panel.is-dragging { user-select: none; will-change: left, top; }
        .panel-header {
            min-height: 58px;
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 10px 12px 10px 10px;
            background: #1b2026;
            border-bottom: 1px solid #343b44;
            cursor: grab;
            touch-action: none;
            user-select: none;
        }
        .panel.is-dragging .panel-header { cursor: grabbing; }
        .drag-grip {
            width: 10px;
            height: 18px;
            display: grid;
            grid-template-columns: repeat(2, 3px);
            grid-template-rows: repeat(3, 3px);
            align-content: center;
            justify-content: center;
            gap: 3px 2px;
            flex: 0 0 auto;
            color: #68727d;
        }
        .drag-grip span { width: 3px; height: 3px; border-radius: 1px; background: currentColor; }
        .brand-mark {
            width: 28px;
            height: 28px;
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 3px;
            flex: 0 0 auto;
        }
        .brand-mark span { border-radius: 2px; }
        .header-copy { min-width: 0; flex: 1 1 auto; }
        .header-copy h2 { margin: 0; overflow: hidden; color: #f5f7f9; font-size: 15px; line-height: 1.3; font-weight: 700; letter-spacing: 0; text-overflow: ellipsis; white-space: nowrap; }
        .header-copy p { margin: 3px 0 0; color: #9fa8b3; font-size: 11px; line-height: 1.3; letter-spacing: 0; }
        .header-actions { display: flex; gap: 6px; }
        .language-select {
            width: 62px;
            height: 34px;
            padding: 0 6px;
            border: 1px solid #414a55;
            border-radius: 5px;
            color: #cbd1d8;
            background: #151a20;
            cursor: pointer;
            font-size: 11px;
        }
        .icon-button {
            width: 34px;
            height: 34px;
            display: grid;
            place-items: center;
            padding: 0;
            border: 1px solid transparent;
            border-radius: 5px;
            color: #cbd1d8;
            background: transparent;
            cursor: pointer;
            font-size: 21px;
            line-height: 1;
        }
        .icon-button:hover { color: #fff; background: #2a3139; border-color: #46505b; }
        .icon-button:disabled { cursor: wait; opacity: .65; }
        .icon-button.is-loading span { display: inline-block; animation: mwi-gdv-spin 700ms linear infinite; }
        .view-tabs {
            min-height: 42px;
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            padding: 0 12px;
            background: #171c22;
            border-bottom: 1px solid #343c45;
        }
        .view-tab {
            min-width: 0;
            height: 41px;
            padding: 0 14px;
            border: 0;
            border-bottom: 2px solid transparent;
            color: #89949f;
            background: transparent;
            cursor: pointer;
            font-size: 12px;
            font-weight: 650;
        }
        .view-tab:hover { color: #e6eaee; background: #1d232a; }
        .view-tab.is-active { color: #f4f6f8; border-bottom-color: #63d2bd; background: #1c2229; }
        .donation-view { min-height: 0; flex: 1 1 auto; display: flex; flex-direction: column; }
        .token-view {
            min-height: 0;
            flex: 1 1 auto;
            overflow: auto;
            background: #12161b;
            scrollbar-color: #59636f #171c22;
        }
        .token-controls {
            min-height: 82px;
            display: grid;
            grid-template-columns: minmax(170px, 1fr) minmax(170px, 1fr) auto;
            align-items: end;
            gap: 14px;
            padding: 12px 14px;
            background: #171c22;
            border-bottom: 1px solid #39414a;
            box-shadow: inset 3px 0 0 #d5a94e;
        }
        .token-control-field { min-width: 0; display: flex; flex-direction: column; gap: 5px; }
        .token-control-field > span:first-child { color: #818c97; font-size: 9px; font-weight: 600; }
        .token-control-field select, .token-control-field input {
            width: 100%;
            height: 36px;
            border: 1px solid #48525e;
            border-radius: 5px;
            color: #edf0f3;
            background: #101419;
            font-size: 11px;
        }
        .token-control-field select { padding: 0 28px 0 9px; cursor: pointer; text-overflow: ellipsis; }
        .token-target-input-shell { position: relative; display: block; }
        .token-control-field input { padding: 0 54px 0 9px; font-size: 13px; font-weight: 650; font-variant-numeric: tabular-nums; }
        .token-target-input-shell > span:last-child {
            position: absolute;
            top: 50%;
            right: 9px;
            max-width: 44px;
            overflow: hidden;
            color: #717c87;
            font-size: 9px;
            text-overflow: ellipsis;
            transform: translateY(-50%);
            white-space: nowrap;
            pointer-events: none;
        }
        .token-source-label { align-self: center; color: #8d98a3; font-size: 9px; white-space: nowrap; }
        .token-results { min-height: 280px; }
        .token-summary {
            --credit: #63d2bd;
            min-height: 108px;
            display: grid;
            grid-template-columns: minmax(230px, .9fr) minmax(320px, 1.35fr);
            background: #151a20;
            border-bottom: 1px solid #343c45;
            box-shadow: inset 3px 0 0 var(--credit);
        }
        .token-summary-identity { min-width: 0; display: flex; align-items: center; gap: 11px; padding: 14px 16px; }
        .token-summary-identity .item-icon { width: 48px; height: 48px; flex-basis: 48px; }
        .token-summary-identity > span { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
        .token-summary-identity small { color: #9aa4ae; font-size: 8px; font-weight: 650; }
        .token-summary-identity strong { overflow: hidden; color: var(--credit); font-size: 16px; text-overflow: ellipsis; white-space: nowrap; }
        .token-summary-identity em { overflow: hidden; color: #7f8994; font-size: 9px; font-style: normal; text-overflow: ellipsis; white-space: nowrap; }
        .token-summary-metrics {
            min-width: 0;
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            align-items: center;
            margin: 0;
            border-left: 1px solid #303842;
        }
        .token-summary-metrics > div { min-width: 0; padding: 12px 14px; text-align: right; }
        .token-summary-metrics dt { color: #7e8994; font-size: 8px; }
        .token-summary-metrics dd { margin: 5px 0 0; overflow-wrap: anywhere; color: #e7ebee; font-size: 13px; font-weight: 700; line-height: 1.35; font-variant-numeric: tabular-nums; }
        .token-target-section, .token-rates-section { border-bottom: 1px solid #303740; }
        .token-section-heading {
            min-height: 34px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            padding: 0 14px;
            color: #838e99;
            background: #181e24;
            border-bottom: 1px solid #303740;
            font-size: 9px;
        }
        .token-section-heading strong { color: #cbd1d7; font-size: 10px; }
        .token-target-result {
            min-height: 82px;
            display: grid;
            grid-template-columns: minmax(165px, .75fr) minmax(300px, 1.5fr);
            align-items: center;
            gap: 18px;
            padding: 12px 16px;
            background: #13181d;
        }
        .token-target-total { min-width: 0; display: grid; grid-template-columns: auto 1fr; align-items: baseline; column-gap: 6px; }
        .token-target-total small { grid-column: 1 / -1; color: #828d98; font-size: 8px; }
        .token-target-total strong { overflow: hidden; color: #f0d071; font-size: 22px; line-height: 1.25; font-variant-numeric: tabular-nums; text-overflow: ellipsis; white-space: nowrap; }
        .token-target-total span { color: #8a949f; font-size: 9px; }
        .token-target-facts { min-width: 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin: 0; }
        .token-target-facts div { min-width: 0; }
        .token-target-facts dt { overflow: hidden; color: #76818c; font-size: 8px; text-overflow: ellipsis; white-space: nowrap; }
        .token-target-facts dd { margin: 4px 0 0; overflow: hidden; color: #dce1e5; font-size: 13px; font-weight: 700; font-variant-numeric: tabular-nums; text-overflow: ellipsis; white-space: nowrap; }
        .token-target-empty { grid-column: 1 / -1; color: #9a7e75; font-size: 10px; text-align: center; }
        .token-rate-row {
            --credit: #63d2bd;
            width: 100%;
            min-height: 62px;
            display: grid;
            grid-template-columns: minmax(130px, .8fr) minmax(220px, 1.35fr) minmax(150px, .9fr) 16px;
            align-items: center;
            gap: 10px;
            padding: 8px 14px 8px 11px;
            border: 0;
            border-left: 3px solid transparent;
            border-bottom: 1px solid #282f37;
            color: #d8dde2;
            background: #12161b;
            cursor: pointer;
            text-align: left;
        }
        .token-rate-row:hover { background: #171d23; }
        .token-rate-row.is-active { border-left-color: var(--credit); background: #181e24; }
        .token-rate-credit { min-width: 0; display: flex; align-items: center; gap: 8px; }
        .token-rate-credit strong { overflow: hidden; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
        .token-rate-batch, .token-rate-unit { min-width: 0; display: flex; flex-direction: column; gap: 4px; }
        .token-rate-batch small, .token-rate-unit small { color: #75808b; font-size: 8px; }
        .token-rate-batch strong, .token-rate-unit strong { overflow-wrap: anywhere; color: #dce1e5; font-size: 10px; font-variant-numeric: tabular-nums; }
        .token-rate-row.is-active .token-rate-credit strong { color: var(--credit); }
        .toolbar {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 10px 12px;
            background: #151a20;
            border-bottom: 1px solid #2f3740;
        }
        .segmented {
            flex: 0 0 auto;
            display: inline-grid;
            grid-template-columns: repeat(2, 1fr);
            padding: 2px;
            border: 1px solid #414a55;
            border-radius: 6px;
            background: #0f1317;
        }
        .mode-button {
            min-width: 72px;
            height: 30px;
            padding: 0 10px;
            border: 0;
            border-radius: 4px;
            color: #9fa8b3;
            background: transparent;
            cursor: pointer;
            font-size: 12px;
            font-weight: 600;
        }
        .mode-button:hover { color: #e7ebef; }
        .mode-button.is-active { color: #0c1c18; background: #63d2bd; }
        .search-input {
            min-width: 120px;
            height: 36px;
            flex: 1 1 220px;
            padding: 0 11px;
            border: 1px solid #414a55;
            border-radius: 5px;
            color: #edf0f3;
            background: #0f1317;
            font-size: 12px;
        }
        .search-input::placeholder { color: #78828e; }
        .filter-controls {
            flex: 0 0 auto;
            display: inline-flex;
            align-items: center;
            gap: 12px;
        }
        .check-control {
            min-height: 34px;
            display: inline-flex;
            align-items: center;
            gap: 7px;
            flex: 0 0 auto;
            color: #b9c0c8;
            cursor: pointer;
            font-size: 11px;
            white-space: nowrap;
        }
        .check-control input { width: 15px; height: 15px; margin: 0; accent-color: #63d2bd; }
        .credit-tabs {
            min-height: 47px;
            display: flex;
            align-items: stretch;
            gap: 2px;
            padding: 6px 8px 0;
            overflow-x: auto;
            background: #191e24;
            border-bottom: 1px solid #343c45;
            scrollbar-width: thin;
        }
        .credit-tab {
            min-width: 62px;
            height: 40px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            padding: 0 9px;
            border: 0;
            border-bottom: 2px solid transparent;
            color: #aab2bc;
            background: transparent;
            cursor: pointer;
            font-size: 12px;
            white-space: nowrap;
        }
        .credit-tab:hover { color: #f1f3f5; background: #222930; }
        .credit-tab.is-active { color: #fff; border-bottom-color: #63d2bd; background: #20262d; }
        .credit-tab small { color: #737e8a; font-size: 9px; }
        .credit-tab.is-active small { color: #aeb7c1; }
        .credit-swatch { width: 10px; height: 10px; flex: 0 0 auto; border: 1px solid rgba(255,255,255,.36); border-radius: 2px; background: var(--credit); }
        .overview-mark { width: 12px; height: 12px; border: 2px solid #63d2bd; border-radius: 2px; box-shadow: inset 4px 0 0 #e8bd55; }
        .target-calculator {
            min-height: 86px;
            display: grid;
            grid-template-columns: 174px minmax(0, 1fr);
            background: #151a20;
            border-bottom: 1px solid #343c45;
            box-shadow: inset 3px 0 0 var(--credit);
        }
        .target-control {
            min-width: 0;
            display: flex;
            flex-direction: column;
            justify-content: center;
            gap: 6px;
            padding: 10px 12px 10px 14px;
            border-right: 1px solid #303842;
        }
        .target-calculator-title {
            color: var(--credit);
            font-size: 10px;
            font-weight: 700;
            line-height: 1.2;
        }
        .target-input-label { min-width: 0; display: flex; flex-direction: column; gap: 4px; }
        .target-input-label > span:first-child { overflow: hidden; color: #aeb7c1; font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }
        .target-input-shell { position: relative; display: block; }
        .target-credit-input {
            width: 100%;
            height: 34px;
            padding: 0 54px 0 10px;
            border: 1px solid #48525e;
            border-radius: 5px;
            color: #f1f4f6;
            background: #0f1317;
            font-size: 13px;
            font-weight: 650;
            font-variant-numeric: tabular-nums;
        }
        .target-input-shell > span:last-child {
            position: absolute;
            top: 50%;
            right: 9px;
            max-width: 44px;
            overflow: hidden;
            color: #717c87;
            font-size: 9px;
            text-overflow: ellipsis;
            transform: translateY(-50%);
            white-space: nowrap;
            pointer-events: none;
        }
        .target-result {
            min-width: 0;
            display: grid;
            grid-template-columns: minmax(145px, 1.2fr) minmax(178px, 1fr) minmax(104px, .7fr);
            align-items: center;
            gap: 12px;
            padding: 10px 14px 10px 12px;
        }
        .target-plan-item { min-width: 0; display: flex; align-items: center; gap: 8px; }
        .target-plan-item .item-icon { width: 30px; height: 30px; flex-basis: 30px; }
        .target-item-copy { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
        .target-item-copy > small { color: var(--credit); font-size: 8px; font-weight: 700; }
        .target-item-copy .item-name-line strong { overflow: hidden; color: #edf0f3; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
        .target-plan-facts {
            min-width: 0;
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 8px;
            margin: 0;
        }
        .target-plan-facts div { min-width: 0; }
        .target-plan-facts dt { overflow: hidden; color: #737e89; font-size: 8px; text-overflow: ellipsis; white-space: nowrap; }
        .target-plan-facts dd { margin: 3px 0 0; color: #dce1e5; font-size: 11px; font-weight: 650; font-variant-numeric: tabular-nums; }
        .target-plan-facts dd small { display: block; overflow: hidden; margin-top: 1px; color: #89949f; font-size: 8px; font-weight: 400; text-overflow: ellipsis; white-space: nowrap; }
        .target-plan-total { min-width: 0; text-align: right; }
        .target-plan-total small { display: block; overflow: hidden; color: #89939e; font-size: 8px; text-overflow: ellipsis; white-space: nowrap; }
        .target-plan-total strong { display: block; margin-top: 3px; overflow: hidden; color: #f4d475; font-size: 15px; font-variant-numeric: tabular-nums; text-overflow: ellipsis; white-space: nowrap; }
        .target-plan-empty { grid-column: 1 / -1; display: flex; flex-direction: column; align-items: center; gap: 3px; color: #707b86; text-align: center; }
        .target-plan-empty strong { font-size: 14px; }
        .target-plan-empty small { font-size: 9px; }
        .shrine-view {
            min-height: 0;
            flex: 1 1 auto;
            overflow: auto;
            background: #12161b;
            scrollbar-color: #59636f #171c22;
        }
        .shrine-controls {
            --shrine: #63d2bd;
            min-height: 88px;
            display: grid;
            grid-template-columns: minmax(250px, 1.4fr) minmax(210px, 1fr) auto;
            align-items: end;
            gap: 14px;
            padding: 12px 14px;
            background: #171c22;
            border-bottom: 1px solid #39414a;
            box-shadow: inset 3px 0 0 var(--shrine);
        }
        .shrine-control-identity { min-width: 0; display: flex; align-items: center; gap: 10px; }
        .shrine-control-icon-slot { width: 42px; height: 42px; display: grid; place-items: center; flex: 0 0 42px; }
        .shrine-icon { width: 42px; height: 42px; color: var(--shrine); filter: drop-shadow(0 3px 5px rgba(0,0,0,.4)); }
        .shrine-icon-fallback {
            display: grid;
            place-items: center;
            border: 1px solid #4d5762;
            border-radius: 5px;
            color: #eff2f4;
            background: #252c34;
            font-size: 15px;
            font-weight: 750;
            filter: none;
        }
        .shrine-control-field { min-width: 0; display: flex; flex-direction: column; gap: 5px; }
        .shrine-control-field > span { color: #818c97; font-size: 9px; font-weight: 600; }
        .shrine-control-field select {
            width: 100%;
            height: 36px;
            padding: 0 28px 0 9px;
            border: 1px solid #48525e;
            border-radius: 5px;
            color: #edf0f3;
            background: #101419;
            cursor: pointer;
            font-size: 11px;
            text-overflow: ellipsis;
        }
        .shrine-buff-field { flex: 1 1 auto; }
        .shrine-level-route { min-width: 0; display: grid; grid-template-columns: minmax(76px, 1fr) 16px minmax(76px, 1fr); align-items: end; gap: 7px; }
        .shrine-level-arrow { height: 36px; display: grid; place-items: center; color: var(--shrine); font-size: 17px; }
        .shrine-price-basis { align-self: center; color: #86919b; font-size: 9px; white-space: nowrap; }
        .shrine-results { min-height: 260px; }
        .shrine-summary {
            --shrine: #63d2bd;
            min-height: 108px;
            display: grid;
            grid-template-columns: minmax(205px, .85fr) minmax(430px, 1.65fr);
            align-items: stretch;
            background: #151a20;
            border-bottom: 1px solid #343c45;
            box-shadow: inset 3px 0 0 var(--shrine);
        }
        .shrine-route { min-width: 0; display: flex; align-items: center; gap: 11px; padding: 14px 16px; }
        .shrine-route .shrine-icon { width: 50px; height: 50px; flex: 0 0 50px; }
        .shrine-route > span { min-width: 0; display: flex; flex-direction: column; gap: 4px; }
        .shrine-route small { overflow: hidden; color: var(--shrine); font-size: 9px; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
        .shrine-route strong { color: #f2f4f6; font-size: 18px; line-height: 1.2; font-variant-numeric: tabular-nums; }
        .shrine-route em { color: #818c97; font-size: 9px; font-style: normal; }
        .shrine-summary-metrics {
            min-width: 0;
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            align-items: center;
            margin: 0;
            border-left: 1px solid #303842;
        }
        .shrine-summary-metrics > div { min-width: 0; padding: 12px; text-align: right; }
        .shrine-summary-metrics dt { overflow: hidden; color: #7e8994; font-size: 8px; text-overflow: ellipsis; white-space: nowrap; }
        .shrine-summary-metrics dd { margin: 5px 0 0; overflow: hidden; color: #e8ecef; font-size: 15px; font-weight: 700; font-variant-numeric: tabular-nums; text-overflow: ellipsis; white-space: nowrap; }
        .shrine-summary-metrics small { display: block; overflow: hidden; margin-top: 2px; color: #77828d; font-size: 8px; text-overflow: ellipsis; white-space: nowrap; }
        .shrine-summary-metrics .shrine-token-total dd { color: #72d6c1; }
        .shrine-summary-metrics .shrine-coin-total dd { color: #f4d475; }
        .shrine-requirements-section, .shrine-resources-section { border-bottom: 1px solid #303740; }
        .shrine-section-heading {
            min-height: 34px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            padding: 0 14px;
            color: #838e99;
            background: #181e24;
            border-bottom: 1px solid #303740;
            font-size: 9px;
        }
        .shrine-section-heading strong { color: #cbd1d7; font-size: 10px; }
        .shrine-credit-requirements { min-height: 58px; display: flex; align-items: center; flex-wrap: wrap; gap: 8px; padding: 10px 14px; }
        .shrine-credit-requirement {
            min-width: 112px;
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 7px 9px;
            border: 1px solid #343d46;
            border-left: 3px solid var(--credit);
            border-radius: 4px;
            background: #181e24;
        }
        .shrine-credit-requirement > span:last-child { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
        .shrine-credit-requirement strong { color: #dce1e5; font-size: 9px; font-weight: 600; }
        .shrine-credit-requirement small { color: #f0d584; font-size: 11px; font-weight: 700; font-variant-numeric: tabular-nums; }
        .shrine-no-credits, .shrine-resource-empty { color: #7f8a95; font-size: 10px; }
        .shrine-resource-empty { padding: 18px 14px; text-align: center; }
        .shrine-resource-row {
            min-height: 70px;
            display: grid;
            grid-template-columns: 120px minmax(155px, 1fr) 84px 112px 116px;
            align-items: center;
            gap: 10px;
            padding: 8px 14px 8px 11px;
            border-left: 3px solid var(--credit);
            border-bottom: 1px solid #282f37;
        }
        .shrine-resource-row:hover { background: #171d23; }
        .shrine-resource-credit, .shrine-resource-item { min-width: 0; display: flex; align-items: center; gap: 8px; }
        .shrine-resource-credit > span:last-child { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
        .shrine-resource-credit strong { overflow: hidden; color: #d7dde2; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
        .shrine-resource-credit small { color: #7f8994; font-size: 8px; }
        .shrine-resource-item .item-icon { width: 30px; height: 30px; flex-basis: 30px; }
        .shrine-resource-value { min-width: 0; text-align: right; }
        .shrine-resource-value strong { color: #dce1e5; font-size: 10px; font-variant-numeric: tabular-nums; }
        .shrine-resource-value small { color: #89949e; font-size: 8px; line-height: 1.35; }
        .shrine-resource-cost { min-width: 0; display: flex; flex-direction: column; gap: 5px; text-align: right; }
        .shrine-resource-cost > span { min-width: 0; display: block; }
        .shrine-resource-cost small { display: block; color: #7f8994; font-size: 8px; }
        .shrine-resource-cost strong { display: block; margin-top: 2px; overflow: hidden; color: #f0d071; font-size: 11px; font-variant-numeric: tabular-nums; text-overflow: ellipsis; white-space: nowrap; }
        .shrine-token-cost { padding-top: 4px; border-top: 1px solid #303842; }
        .shrine-token-cost strong { color: #72d6c1; }
        .shrine-token-cost em { display: block; margin-top: 1px; overflow: hidden; color: #806f6b; font-size: 7px; font-style: normal; text-overflow: ellipsis; white-space: nowrap; }
        .shrine-resource-missing { color: #9b7f75; font-size: 9px; }
        .shrine-resource-row.is-missing { background: #191819; }
        .content {
            min-height: 0;
            flex: 1 1 auto;
            overflow: auto;
            background: #12161b;
            scrollbar-color: #59636f #171c22;
        }
        .content-results { min-height: 100%; }
        .target-calculator:not([hidden]) + .content-results { min-height: 0; }
        .notice { margin: 10px 12px 0; padding: 8px 10px; border-left: 3px solid; font-size: 11px; line-height: 1.45; }
        .notice-warning { color: #e7c98a; border-color: #d5a94e; background: #292315; }
        .overview-header, .overview-row {
            display: grid;
            grid-template-columns: 138px minmax(220px, 1fr) 120px 92px 16px;
            align-items: center;
            gap: 10px;
        }
        .overview-header {
            position: sticky;
            top: 0;
            z-index: 2;
            min-height: 34px;
            padding: 0 14px;
            color: #77818c;
            background: #161b21;
            border-bottom: 1px solid #303740;
            font-size: 10px;
            font-weight: 600;
        }
        .overview-row {
            width: 100%;
            min-height: 67px;
            padding: 8px 14px 8px 11px;
            border: 0;
            border-left: 3px solid var(--credit);
            border-bottom: 1px solid #282f37;
            text-align: left;
            background: #12161b;
            cursor: pointer;
        }
        .overview-row:hover { background: #1a2026; }
        .overview-credit, .overview-best, .item-cell { min-width: 0; display: flex; align-items: center; gap: 9px; }
        .overview-credit > span:last-child, .best-item-copy, .item-copy { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
        .item-name-line { min-width: 0; display: flex; align-items: center; gap: 5px; }
        .item-name-line strong { min-width: 0; flex: 1 1 auto; }
        .enhancement-badge {
            flex: 0 0 auto;
            padding: 1px 4px;
            border: 1px solid #46515d;
            border-radius: 3px;
            color: #aeb8c2;
            background: #242b33;
            font-size: 9px;
            line-height: 1.2;
            font-variant-numeric: tabular-nums;
        }
        .overview-credit strong, .best-item-copy strong, .item-copy strong { overflow: hidden; color: #e7ebef; font-size: 12px; line-height: 1.3; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
        .overview-credit small, .best-item-copy small, .item-copy small { overflow: hidden; color: #7f8994; font-size: 9px; line-height: 1.3; text-overflow: ellipsis; white-space: nowrap; }
        .item-mobile-batch { display: none; }
        .overview-batch { color: #a9b1ba; font-size: 11px; text-align: right; }
        .row-arrow { color: #697581; font-size: 20px; text-align: right; }
        .item-icon {
            width: 32px;
            height: 32px;
            flex: 0 0 32px;
            color: #aeb7c1;
            filter: drop-shadow(0 2px 3px rgba(0,0,0,.35));
        }
        .item-icon.credit-icon { width: 28px; height: 28px; flex-basis: 28px; }
        .item-icon-fallback {
            display: grid;
            place-items: center;
            border: 1px solid #4d5762;
            border-radius: 4px;
            color: #d9dee3;
            background: #252c34;
            font-size: 12px;
            font-weight: 700;
            filter: none;
        }
        .metric { min-width: 0; display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
        .metric strong { color: #f5f7f8; font-size: 13px; line-height: 1.2; font-variant-numeric: tabular-nums; }
        .metric small { color: #7d8792; font-size: 9px; line-height: 1.2; }
        .metric-empty strong { color: #78828d; }
        .result-summary {
            min-height: 34px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            padding: 0 12px;
            color: #818b96;
            background: #161b21;
            border-bottom: 1px solid #303740;
            font-size: 10px;
        }
        .table-wrap { min-width: 660px; }
        .ranking-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
        .ranking-table th {
            position: sticky;
            top: 0;
            z-index: 2;
            height: 35px;
            padding: 0 8px;
            color: #858f9a;
            background: #191f25;
            border-bottom: 1px solid #3a424b;
            font-size: 10px;
            font-weight: 600;
            text-align: right;
        }
        .ranking-table td { height: 58px; padding: 7px 8px; border-bottom: 1px solid #282f37; color: #bdc4cc; font-size: 11px; text-align: right; vertical-align: middle; }
        .ranking-table tr:hover td { background: #1a2026; }
        .ranking-table tr.is-best-row td { background: color-mix(in srgb, var(--credit) 7%, #12161b); }
        .ranking-table tr.is-best-row td:first-child { box-shadow: inset 3px 0 0 var(--credit); }
        .ranking-table .column-rank { width: 48px; text-align: center; }
        .ranking-table .column-item { width: auto; text-align: left; }
        .ranking-table .column-credit { width: 56px; text-align: center; }
        .ranking-table .column-batch { width: 84px; }
        .ranking-table .column-price { width: 88px; font-variant-numeric: tabular-nums; }
        .ranking-table .column-cost { width: 112px; }
        .ranking-table .column-relative { width: 72px; }
        .rank-number {
            width: 25px;
            height: 25px;
            display: inline-grid;
            place-items: center;
            border-radius: 50%;
            color: #8e98a3;
            background: #20262d;
            font-size: 10px;
            font-variant-numeric: tabular-nums;
        }
        .rank-number.is-top { color: #11171a; background: var(--credit); font-weight: 800; }
        .column-batch strong { display: block; color: #e5e9ed; font-size: 11px; }
        .column-batch small { display: block; margin-top: 2px; color: #7f8994; font-size: 9px; }
        .credit-label { display: inline-flex; align-items: center; gap: 5px; color: #cbd1d7; }
        .relative-value { color: #9ca6b0; font-size: 10px; font-variant-numeric: tabular-nums; }
        .relative-value.is-best { color: #63d2bd; font-weight: 700; }
        .relative-value.is-empty { color: #69737e; }
        .load-more {
            width: calc(100% - 24px);
            height: 36px;
            margin: 10px 12px 14px;
            border: 1px solid #414b56;
            border-radius: 5px;
            color: #c5ccd3;
            background: #1b2127;
            cursor: pointer;
            font-size: 11px;
        }
        .load-more:hover { color: #fff; border-color: #697581; background: #232a32; }
        .empty-state {
            min-height: 260px;
            height: 100%;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 9px;
            padding: 32px;
            color: #88939e;
            text-align: center;
        }
        .empty-state strong { color: #dfe4e8; font-size: 13px; }
        .empty-state > span:last-child { max-width: 360px; font-size: 11px; line-height: 1.6; }
        .empty-symbol { width: 28px; height: 28px; border: 2px solid #46515c; border-radius: 50%; border-top-color: #63d2bd; }
        .empty-symbol:not(.is-loading) { border-style: dashed; }
        .empty-symbol.is-loading { animation: mwi-gdv-spin 800ms linear infinite; }
        .panel-footer {
            min-height: 31px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            padding: 0 12px;
            color: #727d88;
            background: #171c22;
            border-top: 1px solid #343c45;
            font-size: 9px;
            white-space: nowrap;
        }
        .panel-footer span { overflow: hidden; text-overflow: ellipsis; }
        @keyframes mwi-gdv-spin { to { transform: rotate(360deg); } }
        @media (max-width: 640px) {
            .launcher { right: 10px; bottom: 74px; }
            .panel {
                right: 6px;
                bottom: 6px;
                width: calc(100vw - 12px);
                height: calc(100vh - 12px);
                min-height: min(360px, calc(100vh - 12px));
                max-height: calc(100vh - 12px);
                height: calc(100dvh - 12px);
                min-height: min(360px, calc(100dvh - 12px));
                max-height: calc(100dvh - 12px);
            }
            .toolbar { flex-wrap: wrap; }
            .segmented { order: 1; }
            .filter-controls { order: 2; flex-wrap: wrap; justify-content: flex-end; margin-left: auto; }
            .search-input { order: 3; flex-basis: 100%; }
            .token-controls { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 10px 12px; }
            .token-source-label { grid-column: 1 / -1; justify-self: end; }
            .token-summary { grid-template-columns: 1fr; }
            .token-summary-metrics { border-top: 1px solid #303842; border-left: 0; }
            .token-target-result { grid-template-columns: minmax(140px, .7fr) minmax(250px, 1.4fr); }
            .token-rate-row { grid-template-columns: 110px minmax(180px, 1fr) 130px; gap: 8px; }
            .shrine-controls { grid-template-columns: minmax(0, 1fr) auto; gap: 10px 12px; }
            .shrine-control-identity { grid-column: 1 / -1; }
            .shrine-level-route { grid-column: 1; }
            .shrine-price-basis { grid-column: 2; }
            .shrine-summary { grid-template-columns: 1fr; }
            .shrine-summary-metrics { border-top: 1px solid #303842; border-left: 0; }
            .shrine-resource-row { grid-template-columns: 104px minmax(0, 1fr) 88px; gap: 5px 9px; }
            .shrine-resource-credit { grid-column: 1; grid-row: 1 / 4; align-self: start; padding-top: 5px; }
            .shrine-resource-item { grid-column: 2; grid-row: 1; }
            .shrine-resource-buy { grid-column: 2; grid-row: 2; text-align: left; }
            .shrine-resource-coverage { grid-column: 2; grid-row: 3; text-align: left; }
            .shrine-resource-cost { grid-column: 3; grid-row: 1 / 4; }
            .shrine-resource-missing { grid-column: 2; grid-row: 1; }
            .target-calculator { grid-template-columns: 1fr; }
            .target-control {
                min-height: 58px;
                display: grid;
                grid-template-columns: auto minmax(190px, 240px);
                align-items: center;
                gap: 12px;
                padding: 8px 12px;
                border-right: 0;
                border-bottom: 1px solid #303842;
            }
            .target-result { grid-template-columns: minmax(0, 1fr) auto; gap: 8px 12px; padding: 9px 12px; }
            .target-plan-item { grid-column: 1; grid-row: 1; }
            .target-plan-facts { grid-column: 1 / -1; grid-row: 2; }
            .target-plan-total { grid-column: 2; grid-row: 1; }
            .target-plan-empty { grid-row: 1 / 3; }
            .overview-header, .overview-row { grid-template-columns: 105px minmax(135px, 1fr) 96px; gap: 7px; }
            .overview-header span:nth-child(4), .overview-header span:nth-child(5), .overview-batch, .row-arrow { display: none; }
            .overview-row { min-height: 65px; padding-right: 9px; }
            .overview-credit strong, .best-item-copy strong { font-size: 11px; }
            .item-icon { width: 28px; height: 28px; flex-basis: 28px; }
            .table-wrap { min-width: 0; }
            .ranking-table th, .ranking-table td { padding-right: 4px; padding-left: 4px; }
            .ranking-table .column-rank { width: 38px; }
            .ranking-table .column-credit { width: 44px; }
            .ranking-table .column-cost { width: 94px; }
            .ranking-table .column-batch,
            .ranking-table .column-price,
            .ranking-table .column-relative { display: none; }
            .ranking-table .item-icon { width: 26px; height: 26px; flex-basis: 26px; }
            .ranking-table .item-copy strong { font-size: 11px; }
            .item-hrid { display: none; }
            .item-mobile-batch { display: block; }
            .panel-footer span:first-child { display: none; }
            .panel-footer { justify-content: flex-end; }
        }
        @media (max-width: 420px) {
            .panel-header { gap: 7px; }
            .brand-mark { display: none; }
            .language-select { width: 58px; }
            .view-tabs { padding: 0 6px; }
            .view-tab { padding: 0 5px; font-size: 10px; }
            .token-controls { grid-template-columns: 1fr; }
            .token-source-label { grid-column: 1; }
            .token-summary-identity { padding: 12px; }
            .token-summary-metrics > div { padding: 10px 8px; }
            .token-target-result { grid-template-columns: 1fr; gap: 10px; }
            .token-target-facts { gap: 7px; }
            .token-rate-row { grid-template-columns: 92px minmax(0, 1fr); padding-right: 9px; }
            .token-rate-unit { display: none; }
            .shrine-controls { grid-template-columns: 1fr; }
            .shrine-control-identity, .shrine-level-route, .shrine-price-basis { grid-column: 1; }
            .shrine-price-basis { justify-self: end; }
            .shrine-route strong { font-size: 16px; }
            .shrine-summary-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
            .shrine-summary-metrics > div { padding: 10px 7px; }
            .shrine-credit-requirement { min-width: calc(50% - 4px); }
            .shrine-resource-row { grid-template-columns: 82px minmax(0, 1fr) 84px; padding-right: 8px; padding-left: 8px; }
            .shrine-resource-credit { gap: 5px; }
            .shrine-resource-credit .credit-swatch { display: none; }
            .shrine-resource-item .item-icon { width: 26px; height: 26px; flex-basis: 26px; }
            .target-control { grid-template-columns: 1fr; gap: 5px; }
            .target-input-label { display: grid; grid-template-columns: minmax(90px, 1fr) 150px; align-items: center; gap: 8px; }
            .target-result { grid-template-columns: minmax(0, 1fr) 94px; }
        }
        @media (prefers-reduced-motion: reduce) {
            *, *::before, *::after { scroll-behavior: auto !important; transition: none !important; }
        }
    `;

    function setPanelPositionStyles(panel, position) {
        panel.style.left = `${position.x}px`;
        panel.style.top = `${position.y}px`;
        panel.style.right = "auto";
        panel.style.bottom = "auto";
    }

    function clearPanelPositionStyles(panel) {
        panel.style.removeProperty("left");
        panel.style.removeProperty("top");
        panel.style.removeProperty("right");
        panel.style.removeProperty("bottom");
    }

    function canStartPointerDrag(event, activeDragState = null) {
        return !activeDragState
            && event?.isPrimary !== false
            && (event?.button == null || event.button === 0)
            && !event?.target?.closest?.("button, input, select, a");
    }

    function applyPanelPosition(state) {
        const panel = state.ui?.panel;
        if (!panel || panel.hidden || !state.panelPosition) {
            return null;
        }

        const rect = panel.getBoundingClientRect();
        const position = clampPanelPosition(
            state.panelPosition,
            { width: rect.width, height: rect.height },
            { width: window.innerWidth, height: window.innerHeight },
        );
        setPanelPositionStyles(panel, position);
        return position;
    }

    function schedulePanelPositionUpdate(state) {
        if (!state?.isOpen || !state.panelPosition || state.panelResizeFrameId != null) {
            return false;
        }
        const requestFrame = typeof window.requestAnimationFrame === "function"
            ? window.requestAnimationFrame.bind(window)
            : (callback) => window.setTimeout(callback, 0);
        state.panelResizeFrameId = requestFrame(() => {
            state.panelResizeFrameId = null;
            applyPanelPosition(state);
        });
        return true;
    }

    function resetPanelPosition(state) {
        state.panelPosition = null;
        if (state.ui?.panel) {
            clearPanelPositionStyles(state.ui.panel);
        }
        persistSettings(state);
    }

    function installPanelDragging(state) {
        const panel = state.ui?.panel;
        const header = state.ui?.panelHeader;
        if (!panel || !header) {
            return;
        }

        header.addEventListener("pointerdown", (event) => {
            if (!canStartPointerDrag(event, state.dragState)) {
                return;
            }

            const rect = panel.getBoundingClientRect();
            const initialPosition = clampPanelPosition(
                { x: rect.left, y: rect.top },
                { width: rect.width, height: rect.height },
                { width: window.innerWidth, height: window.innerHeight },
            );
            setPanelPositionStyles(panel, initialPosition);
            state.dragState = {
                pointerId: event.pointerId,
                startPointerX: event.clientX,
                startPointerY: event.clientY,
                startPanelX: initialPosition.x,
                startPanelY: initialPosition.y,
                panelWidth: rect.width,
                panelHeight: rect.height,
                position: initialPosition,
            };
            panel.classList.add("is-dragging");
            try {
                header.setPointerCapture(event.pointerId);
            } catch (_error) {
            }
            event.preventDefault();
        });

        header.addEventListener("pointermove", (event) => {
            const drag = state.dragState;
            if (!drag || drag.pointerId !== event.pointerId) {
                return;
            }

            const position = clampPanelPosition(
                {
                    x: drag.startPanelX + event.clientX - drag.startPointerX,
                    y: drag.startPanelY + event.clientY - drag.startPointerY,
                },
                { width: drag.panelWidth, height: drag.panelHeight },
                { width: window.innerWidth, height: window.innerHeight },
            );
            drag.position = position;
            setPanelPositionStyles(panel, position);
            event.preventDefault();
        });

        function finishDragging(event) {
            const drag = state.dragState;
            if (!drag || drag.pointerId !== event.pointerId) {
                return;
            }
            state.dragState = null;
            state.panelPosition = drag.position;
            panel.classList.remove("is-dragging");
            try {
                if (header.hasPointerCapture(event.pointerId)) {
                    header.releasePointerCapture(event.pointerId);
                }
            } catch (_error) {
            }
            persistSettings(state);
        }

        header.addEventListener("pointerup", finishDragging);
        header.addEventListener("pointercancel", finishDragging);
        header.addEventListener("lostpointercapture", finishDragging);
        window.addEventListener("resize", () => schedulePanelPositionUpdate(state));
    }

    function createUi(state) {
        if (document.getElementById(`${SCRIPT_ID}-host`)) {
            return;
        }

        const host = document.createElement("div");
        host.id = `${SCRIPT_ID}-host`;
        const shadow = host.attachShadow({ mode: "open" });
        shadow.innerHTML = `
            <style>${UI_STYLES}</style>
            <button type="button" class="launcher" data-i18n-title="launcherTitle" data-i18n-aria="launcherTitle" title="Open Guild Donation Value" aria-label="Open Guild Donation Value">
                <span class="launcher-grid" aria-hidden="true">
                    <span style="background:#58c981"></span><span style="background:#55a9e8"></span>
                    <span style="background:#e5676d"></span><span style="background:#e8bd55"></span>
                </span>
            </button>
            <section class="panel" role="dialog" aria-modal="false" aria-labelledby="mwi-gdv-title" hidden>
                <header class="panel-header" data-i18n-title="dragPanel" title="Drag panel">
                    <span class="drag-grip" aria-hidden="true">
                        <span></span><span></span><span></span><span></span><span></span><span></span>
                    </span>
                    <span class="brand-mark" aria-hidden="true">
                        <span style="background:#58c981"></span><span style="background:#55a9e8"></span>
                        <span style="background:#e5676d"></span><span style="background:#e8bd55"></span>
                    </span>
                    <span class="header-copy">
                        <h2 id="mwi-gdv-title" data-i18n="panelTitle">Guild Donation Value</h2>
                        <p data-header-status data-i18n="waitingData">Waiting for data</p>
                    </span>
                    <span class="header-actions">
                        <select class="language-select" data-language data-i18n-title="language" data-i18n-aria="language" title="Language" aria-label="Language">
                            <option value="en">EN</option>
                            <option value="zh">中文</option>
                        </select>
                        <button type="button" class="icon-button" data-refresh data-i18n-title="refreshData" data-i18n-aria="refreshData" title="Refresh full market data" aria-label="Refresh full market data"><span aria-hidden="true">↻</span></button>
                        <button type="button" class="icon-button" data-close data-i18n-title="close" data-i18n-aria="close" title="Close" aria-label="Close"><span aria-hidden="true">×</span></button>
                    </span>
                </header>
                <nav class="view-tabs" role="tablist" data-i18n-aria="mainViews" aria-label="Planner views">
                    <button type="button" class="view-tab" id="mwi-gdv-view-donation" role="tab" data-view="donation" aria-controls="mwi-gdv-donation-view" data-i18n="donationView">Donation value</button>
                    <button type="button" class="view-tab" id="mwi-gdv-view-token" role="tab" data-view="token" aria-controls="mwi-gdv-token-view" data-i18n="tokenView">Token exchange</button>
                    <button type="button" class="view-tab" id="mwi-gdv-view-shrine" role="tab" data-view="shrine" aria-controls="mwi-gdv-shrine-view" data-i18n="shrineView">Shrine upgrade</button>
                </nav>
                <section class="donation-view" id="mwi-gdv-donation-view" role="tabpanel" aria-labelledby="mwi-gdv-view-donation" data-donation-view>
                    <div class="toolbar">
                        <div class="segmented" role="group" data-i18n-aria="priceBasis" aria-label="Market price basis">
                            <button type="button" class="mode-button" data-mode="ask" data-i18n="acquirePrice" data-i18n-title="acquirePriceTitle" title="Use the current lowest sell offer as the price to buy the item">Buy price</button>
                            <button type="button" class="mode-button" data-mode="bid" data-i18n="liquidationPrice" data-i18n-title="liquidationPriceTitle" title="Use each level's highest buy offer after tax, then select the lowest opportunity cost">Sell price</button>
                        </div>
                        <input class="search-input" type="search" data-i18n-placeholder="searchPlaceholder" data-i18n-aria="searchAria" placeholder="Search item name or HRID" aria-label="Search donation items" autocomplete="off">
                        <span class="filter-controls">
                            <label class="check-control" data-i18n-title="unquotedTitle" title="Items without a quote on the selected side are excluded from ranking">
                                <input type="checkbox" data-show-unquoted><span data-i18n="showUnquoted">Show unquoted</span>
                            </label>
                            <label class="check-control" data-i18n-title="enhancedTitle" title="Allow +1 and higher market quotes in automatic rankings, recommendations, and estimates">
                                <input type="checkbox" data-include-enhanced><span data-i18n="includeEnhanced">Include enhanced</span>
                            </label>
                        </span>
                    </div>
                    <nav class="credit-tabs" role="tablist" data-i18n-aria="creditColors" aria-label="Credit colors" data-tabs></nav>
                    <main class="content" id="mwi-gdv-content" data-content>
                        <section class="target-calculator" data-target-calculator aria-labelledby="mwi-gdv-target-title" hidden>
                            <div class="target-control">
                                <span class="target-calculator-title" id="mwi-gdv-target-title" data-i18n="targetCalculator">Target plan</span>
                                <label class="target-input-label">
                                    <span data-target-credit-label>Credit target</span>
                                    <span class="target-input-shell">
                                        <input class="target-credit-input" data-target-credit-input type="number" min="1" step="1" inputmode="numeric" autocomplete="off" value="1000">
                                        <span data-target-credit-unit>credits</span>
                                    </span>
                                </label>
                            </div>
                            <div class="target-result" data-target-result aria-live="polite"></div>
                        </section>
                        <div class="content-results" data-content-results></div>
                    </main>
                </section>
                <main class="token-view" id="mwi-gdv-token-view" role="tabpanel" aria-labelledby="mwi-gdv-view-token" data-token-view hidden>
                    <section class="token-controls">
                        <label class="token-control-field">
                            <span data-i18n="tokenCreditType">Credit type</span>
                            <select data-token-credit-select></select>
                        </label>
                        <label class="token-control-field">
                            <span data-i18n="tokenTargetLabel">Target credits</span>
                            <span class="token-target-input-shell">
                                <input data-token-target-input type="number" min="1" step="1" inputmode="numeric" autocomplete="off" value="1000" data-i18n-aria="tokenTargetAria" aria-label="Target Guild Credit amount">
                                <span data-i18n="credit">Credit</span>
                            </span>
                        </label>
                        <span class="token-source-label" data-i18n="tokenOfficialRate">Official fixed exchange</span>
                    </section>
                    <div class="token-results" data-token-results aria-live="polite"></div>
                </main>
                <main class="shrine-view" id="mwi-gdv-shrine-view" role="tabpanel" aria-labelledby="mwi-gdv-view-shrine" data-shrine-view hidden>
                    <section class="shrine-controls" data-shrine-controls>
                        <div class="shrine-control-identity">
                            <span class="shrine-control-icon-slot" data-shrine-icon aria-hidden="true"></span>
                            <label class="shrine-control-field shrine-buff-field">
                                <span data-i18n="shrineBuff">Shrine buff</span>
                                <select data-shrine-buff></select>
                            </label>
                        </div>
                        <div class="shrine-level-route">
                            <label class="shrine-control-field">
                                <span data-i18n="shrineFromLevel">From</span>
                                <select data-shrine-from></select>
                            </label>
                            <span class="shrine-level-arrow" aria-hidden="true">→</span>
                            <label class="shrine-control-field">
                                <span data-i18n="shrineToLevel">To</span>
                                <select data-shrine-to></select>
                            </label>
                        </div>
                        <span class="shrine-price-basis" data-i18n="shrineAskEstimate">Current Ask estimate</span>
                    </section>
                    <div class="shrine-results" data-shrine-results aria-live="polite"></div>
                </main>
                <footer class="panel-footer">
                    <span data-catalog-status data-i18n="dataWaiting">Items: waiting</span>
                    <span data-market-status data-i18n="marketWaiting">Market: waiting</span>
                </footer>
            </section>
        `;
        document.body.appendChild(host);

        const ui = {
            host,
            shadow,
            launcher: shadow.querySelector(".launcher"),
            panel: shadow.querySelector(".panel"),
            panelHeader: shadow.querySelector(".panel-header"),
            languageSelect: shadow.querySelector("[data-language]"),
            refreshButton: shadow.querySelector("[data-refresh]"),
            closeButton: shadow.querySelector("[data-close]"),
            viewButtons: Array.from(shadow.querySelectorAll("[data-view]")),
            donationView: shadow.querySelector("[data-donation-view]"),
            tokenView: shadow.querySelector("[data-token-view]"),
            shrineView: shadow.querySelector("[data-shrine-view]"),
            modeButtons: Array.from(shadow.querySelectorAll("[data-mode]")),
            searchInput: shadow.querySelector(".search-input"),
            showUnquoted: shadow.querySelector("[data-show-unquoted]"),
            includeEnhancedQuotes: shadow.querySelector("[data-include-enhanced]"),
            tabs: shadow.querySelector("[data-tabs]"),
            targetCalculator: shadow.querySelector("[data-target-calculator]"),
            targetCreditLabel: shadow.querySelector("[data-target-credit-label]"),
            targetCreditInput: shadow.querySelector("[data-target-credit-input]"),
            targetCreditUnit: shadow.querySelector("[data-target-credit-unit]"),
            targetResult: shadow.querySelector("[data-target-result]"),
            content: shadow.querySelector("[data-content]"),
            contentResults: shadow.querySelector("[data-content-results]"),
            tokenCreditSelect: shadow.querySelector("[data-token-credit-select]"),
            tokenTargetCreditInput: shadow.querySelector("[data-token-target-input]"),
            tokenResults: shadow.querySelector("[data-token-results]"),
            shrineControls: shadow.querySelector("[data-shrine-controls]"),
            shrineIcon: shadow.querySelector("[data-shrine-icon]"),
            shrineBuffSelect: shadow.querySelector("[data-shrine-buff]"),
            shrineFromSelect: shadow.querySelector("[data-shrine-from]"),
            shrineToSelect: shadow.querySelector("[data-shrine-to]"),
            shrineResults: shadow.querySelector("[data-shrine-results]"),
            headerStatus: shadow.querySelector("[data-header-status]"),
            catalogStatus: shadow.querySelector("[data-catalog-status]"),
            marketStatus: shadow.querySelector("[data-market-status]"),
        };
        state.ui = ui;
        state.render = () => {
            updateUi(state);
            scheduleDonationAssistantUpdate(state, true);
        };
        installPanelDragging(state);

        ui.launcher.addEventListener("click", () => openPanel(state));
        ui.closeButton.addEventListener("click", () => closePanel(state));
        ui.refreshButton.addEventListener("click", () => {
            refreshPassiveGameData(state);
            refreshMarketData(state);
        });
        ui.viewButtons.forEach((button) => {
            button.addEventListener("click", () => {
                state.activeView = normalizeAppView(button.dataset.view);
                persistSettings(state);
                state.render();
                if (state.activeView === APP_VIEW_SHRINE) {
                    ui.shrineView.scrollTop = 0;
                } else if (state.activeView === APP_VIEW_TOKEN) {
                    ui.tokenView.scrollTop = 0;
                } else {
                    ui.content.scrollTop = 0;
                }
            });
        });
        ui.languageSelect.addEventListener("change", () => {
            state.uiLanguage = normalizeUiLanguage(ui.languageSelect.value);
            state.uiLanguageExplicit = true;
            state.visibleRows = INITIAL_VISIBLE_ROWS;
            persistSettings(state);
            installMenuCommands(state);
            discoverPassiveGameResources(state);
            state.render();
        });
        ui.modeButtons.forEach((button) => {
            button.addEventListener("click", () => {
                state.priceMode = normalizePriceMode(button.dataset.mode);
                state.visibleRows = INITIAL_VISIBLE_ROWS;
                persistSettings(state);
                state.render();
            });
        });
        ui.searchInput.addEventListener("input", () => {
            state.searchText = ui.searchInput.value;
            state.visibleRows = INITIAL_VISIBLE_ROWS;
            state.render();
        });
        ui.showUnquoted.addEventListener("change", () => {
            state.showUnquoted = ui.showUnquoted.checked;
            state.visibleRows = INITIAL_VISIBLE_ROWS;
            persistSettings(state);
            state.render();
            ui.content.scrollTop = 0;
        });
        ui.includeEnhancedQuotes.addEventListener("change", () => {
            state.includeEnhancedQuotes = ui.includeEnhancedQuotes.checked;
            state.visibleRows = INITIAL_VISIBLE_ROWS;
            persistSettings(state);
            state.render();
            ui.content.scrollTop = 0;
        });
        ui.targetCreditInput.addEventListener("input", () => {
            state.targetCreditAmount = normalizeTargetCreditAmount(ui.targetCreditInput.value);
            state.settingsDirty = true;
            const groups = state.catalog.length > 0 && Object.keys(state.marketData).length > 0
                ? buildRankedGroups(
                    state.catalog,
                    state.marketData,
                    state.priceMode,
                    state.includeEnhancedQuotes,
                )
                : {};
            updateTargetCalculator(state, groups);
        });
        ui.targetCreditInput.addEventListener("change", () => {
            state.targetCreditAmount = normalizeTargetCreditAmount(ui.targetCreditInput.value);
            ui.targetCreditInput.value = state.targetCreditAmount == null ? "" : String(state.targetCreditAmount);
            persistSettings(state);
        });
        ui.tokenCreditSelect.addEventListener("change", () => {
            state.selectedTokenCredit = String(ui.tokenCreditSelect.value || DEFAULT_TOKEN_CREDIT_HRID);
            persistSettings(state);
            state.render();
            ui.tokenView.scrollTop = 0;
        });
        ui.tokenTargetCreditInput.addEventListener("input", () => {
            state.tokenTargetCreditAmount = normalizeTargetCreditAmount(ui.tokenTargetCreditInput.value);
            state.settingsDirty = true;
            updateGuildTokenPlanner(state);
        });
        ui.tokenTargetCreditInput.addEventListener("change", () => {
            state.tokenTargetCreditAmount = normalizeTargetCreditAmount(ui.tokenTargetCreditInput.value);
            ui.tokenTargetCreditInput.value = state.tokenTargetCreditAmount == null
                ? ""
                : String(state.tokenTargetCreditAmount);
            persistSettings(state);
        });
        ui.tokenResults.addEventListener("click", (event) => {
            const button = event.target.closest("[data-token-credit]");
            if (!button) {
                return;
            }
            state.selectedTokenCredit = String(button.dataset.tokenCredit || DEFAULT_TOKEN_CREDIT_HRID);
            persistSettings(state);
            state.render();
            ui.tokenView.scrollTop = 0;
        });
        ui.shrineBuffSelect.addEventListener("change", () => {
            state.selectedGuildBuffHrid = String(ui.shrineBuffSelect.value || "");
            validateShrineSelection(state);
            persistSettings(state);
            state.render();
            ui.shrineView.scrollTop = 0;
        });
        ui.shrineFromSelect.addEventListener("change", () => {
            state.shrineFromLevel = normalizeNonNegativeInteger(
                ui.shrineFromSelect.value,
                DEFAULT_SHRINE_FROM_LEVEL,
            );
            validateShrineSelection(state);
            persistSettings(state);
            state.render();
        });
        ui.shrineToSelect.addEventListener("change", () => {
            state.shrineToLevel = normalizeNonNegativeInteger(
                ui.shrineToSelect.value,
                state.shrineFromLevel + 1,
            );
            validateShrineSelection(state);
            persistSettings(state);
            state.render();
        });
        ui.tabs.addEventListener("click", (event) => {
            const button = event.target.closest("[data-credit]");
            if (!button) {
                return;
            }
            state.pendingSelectedCredit = "";
            state.selectedCredit = String(button.dataset.credit || OVERVIEW_CREDIT);
            state.visibleRows = INITIAL_VISIBLE_ROWS;
            persistSettings(state);
            state.render();
            ui.content.scrollTop = 0;
        });
        ui.content.addEventListener("click", (event) => {
            const creditButton = event.target.closest("[data-select-credit]");
            if (creditButton) {
                state.pendingSelectedCredit = "";
                state.selectedCredit = String(creditButton.dataset.selectCredit || OVERVIEW_CREDIT);
                state.visibleRows = INITIAL_VISIBLE_ROWS;
                persistSettings(state);
                state.render();
                ui.content.scrollTop = 0;
                return;
            }
            if (event.target.closest("[data-load-more]")) {
                state.visibleRows += MORE_VISIBLE_ROWS;
                state.render();
            }
        });
        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape" && state.isOpen) {
                closePanel(state);
            }
        });
        window.addEventListener("pagehide", () => flushPendingSettings(state));

        createDonationAssistantUi(state);
        installDonationAssistantObserver(state);
        state.render();
    }

    function openPanel(state) {
        state.isOpen = true;
        refreshPassiveGameData(state);
        state.render?.();
        window.requestAnimationFrame(() => {
            applyPanelPosition(state);
            const focusTarget = state.activeView === APP_VIEW_SHRINE
                ? state.ui?.shrineBuffSelect
                : (state.activeView === APP_VIEW_TOKEN
                    ? state.ui?.tokenCreditSelect
                    : state.ui?.searchInput);
            focusTarget?.focus();
        });
    }

    function closePanel(state) {
        state.isOpen = false;
        state.render?.();
        window.setTimeout(() => state.ui?.launcher?.focus(), 0);
    }

    function runWhenBodyReady(callback) {
        if (document.body) {
            callback();
            return;
        }
        window.addEventListener("DOMContentLoaded", callback, { once: true });
    }

    function installMenuCommands(state) {
        if (typeof GM_registerMenuCommand !== "function") {
            return;
        }

        if (state.menuCommandIds.length > 0) {
            if (typeof GM_unregisterMenuCommand !== "function") {
                return;
            }
            for (const commandId of state.menuCommandIds) {
                try {
                    GM_unregisterMenuCommand(commandId);
                } catch (_error) {
                }
            }
            state.menuCommandIds = [];
        }

        const commands = [
            [t(state, "menuOpen"), () => openPanel(state)],
            [t(state, "menuRefresh"), () => {
                refreshPassiveGameData(state);
                refreshMarketData(state);
            }],
            [t(state, "menuResetPosition"), () => resetPanelPosition(state)],
        ];
        for (const [label, handler] of commands) {
            const commandId = GM_registerMenuCommand(label, handler);
            if (commandId != null) {
                state.menuCommandIds.push(commandId);
            }
        }
    }

    function exposeDebugApi(state) {
        const debugApi = Object.freeze({
            open: () => openPanel(state),
            close: () => closePanel(state),
            refresh: () => refreshMarketData(state),
            resetPanelPosition: () => resetPanelPosition(state),
            getSnapshot: () => ({
                catalogCount: state.catalog.length,
                guildBuffCount: state.guildBuffs.length,
                catalogVersion: state.catalogVersion,
                catalogSource: state.catalogSource,
                catalogCandidateCount: state.catalogCandidateCount,
                catalogCandidateVersion: state.catalogCandidateVersion,
                catalogCandidateConfirmations: state.catalogCandidateConfirmations,
                guildBuffVersion: state.guildBuffVersion,
                guildBuffSource: state.guildBuffSource,
                guildBuffsStale: state.guildBuffsStale,
                guildBuffCompleteHrids: [...state.guildBuffCompleteHrids],
                guildBuffCandidateCount: state.guildBuffCandidateCount,
                guildBuffCandidateVersion: state.guildBuffCandidateVersion,
                guildBuffCandidateConfirmations: state.guildBuffCandidateConfirmations,
                marketItemCount: Object.keys(state.marketData).length,
                marketSnapshotItemCount: Object.keys(state.marketSnapshotData).length,
                marketLiveItemCount: Object.keys(state.marketLiveData).length,
                marketTimestamp: state.marketTimestamp,
                marketSourceUrl: state.marketSourceUrl,
                marketLiveRevision: state.marketLiveRevision,
                marketSnapshotCandidateConfirmations: state.marketSnapshotCandidateConfirmations,
                localizedItemNameCount: Object.keys(state.itemNamesZh).length,
                localizedItemNameSource: state.itemNamesSource,
                activeView: state.activeView,
                uiLanguage: state.uiLanguage,
                uiLanguageExplicit: state.uiLanguageExplicit,
                priceMode: state.priceMode,
                includeEnhancedQuotes: state.includeEnhancedQuotes,
                selectedCredit: state.selectedCredit,
                targetCreditAmount: state.targetCreditAmount,
                selectedTokenCredit: state.selectedTokenCredit,
                tokenTargetCreditAmount: state.tokenTargetCreditAmount,
                selectedGuildBuffHrid: state.selectedGuildBuffHrid,
                shrineFromLevel: state.shrineFromLevel,
                shrineToLevel: state.shrineToLevel,
                panelPosition: state.panelPosition,
            }),
        });
        for (const target of new Set([window, state.pageWindow])) {
            try {
                Object.defineProperty(target, "__mwiGuildDonationValue", {
                    configurable: true,
                    value: debugApi,
                    writable: false,
                });
            } catch (_error) {
            }
        }
    }

    function findExistingRuntimeState(pageWindow) {
        for (const target of new Set([window, pageWindow])) {
            try {
                const existingState = target?.[RUNTIME_STATE_KEY];
                if (existingState && typeof existingState === "object") {
                    return existingState;
                }
            } catch (_error) {
            }
        }
        return null;
    }

    function registerRuntimeState(state) {
        for (const target of new Set([window, state.pageWindow])) {
            try {
                Object.defineProperty(target, RUNTIME_STATE_KEY, {
                    configurable: false,
                    value: state,
                    writable: false,
                });
            } catch (_error) {
            }
        }
    }

    function bootstrap() {
        if (typeof window === "undefined" || typeof document === "undefined") {
            return null;
        }

        const pageWindow = typeof unsafeWindow !== "undefined" && unsafeWindow ? unsafeWindow : window;
        const existingState = findExistingRuntimeState(pageWindow);
        if (existingState) {
            return existingState;
        }

        const state = createRuntimeState();
        state.pageWindow = pageWindow;
        registerRuntimeState(state);
        installWebSocketBridge(state);
        installMenuCommands(state);
        exposeDebugApi(state);

        runWhenBodyReady(() => {
            createUi(state);
            window.setTimeout(() => refreshPassiveGameData(state), 0);
        });
        window.setTimeout(() => refreshMarketData(state), 0);

        return state;
    }

    return Object.freeze({
        APP_VIEW_DONATION,
        APP_VIEW_TOKEN,
        APP_VIEW_SHRINE,
        CREDIT_DEFINITIONS,
        GUILD_TOKEN_ITEM_HRID,
        LANGUAGE_EN,
        LANGUAGE_ZH,
        PRICE_MODE_ASK,
        PRICE_MODE_BID,
        SHRINE_DEFINITIONS,
        UI_TEXT,
        applyClientData,
        bootstrap,
        buildDonationRecommendation,
        buildShrinePurchasePlan,
        buildRankedGroups,
        calculateDonationAssistantDragPosition,
        calculateLiquidationUnitPrice,
        calculateDonationAssistantPosition,
        calculateShrineUpgradeCost,
        calculateTargetCreditPlan,
        calculateGuildTokenCreditPlan,
        canStartPointerDrag,
        clampPanelPosition,
        decodeInitClientData,
        detectUiLanguage,
        decompressFromUTF16,
        discoverPassiveGameResources,
        extractDonationModalContext,
        extractChineseItemNamesFromI18n,
        fetchWithTimeout,
        findClientData,
        findPassiveSpriteUrls,
        flattenGroupsByCreditOrder,
        flushPendingSettings,
        formatCompactNumber,
        formatDonationBatchText,
        formatGuildTokenBatchText,
        formatExactNumber,
        formatTimestamp,
        getCreditDefinition,
        getCreditLabel,
        getGuildTokenConversions,
        getGuildTokenRateConversions,
        getMarketDonationCatalog,
        getMarketNoticeKey,
        getMarketTaxRate,
        getShrineDefinition,
        getShrineLabel,
        itemHridFromSpriteReference,
        isPassiveMarketDataOnly,
        itemNameFromHrid,
        normalizeDonationCatalog,
        normalizeGuildBuffCatalog,
        normalizeMarketOrderBooksUpdate,
        normalizeMarketTimestamp,
        normalizePriceMode,
        normalizeUiLanguage,
        resolveDisplayItemName,
        resolveLocalizedItemName,
        resolveMarketQuote,
        resolveMarketQuoteDetails,
        resolveMarketQuoteDetailsAtLevel,
        mergeMarketDataLayers,
        mutationMayAffectDonationAssistant,
        renderDonationAssistantMarkup,
        renderGuildTokenPlannerResult,
        renderRelativeValue,
        schedulePanelPositionUpdate,
        sanitizeItemNameDictionary,
        translateText,
    });
});
