// ==UserScript==
// @name         银河奶牛公会信用点性价比
// @namespace    https://www.milkywayidle.com/
// @version      1.1.7
// @author       柆雨
// @license      MIT
// @homepageURL  https://github.com/LaYuDr/milky-way-idle-guild-credit-optimizer
// @description  公会信用点兑换与神龛升级的只读计算辅助；不会自动交易、兑换或升级，也不会上传账号数据。
// @match        https://www.milkywayidle.com/*
// @match        https://www.milkywayidlecn.com/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

// MWI_GUILD_CREDIT_RUNTIME
window.MwiGuildCreditVersion = "1.1.7";

(function () {
  "use strict";

  const page = typeof unsafeWindow === "undefined" ? window : unsafeWindow;
  const bridge = page.__mwiGuildCreditBridge || (page.__mwiGuildCreditBridge = {
    messages: [],
    itemDetails: null,
    guildBuffDetails: null,
    guildBuffLevels: null,
    guildShrineLevels: null,
    guildShrineDetails: null,
    characterItems: null
  });

  // The game owns the market navigation state. Reuse its controller instead
  // of reconstructing navigation and the market search field in the plugin.
  // React keeps this controller private, so resolve it only when the player
  // clicks one of our item links; never retain a stale component instance.
  function reactFiberRoots() {
    const documentRef = page.document;
    const root = documentRef && documentRef.getElementById && documentRef.getElementById("root");
    if (!root) return [];
    const roots = [];
    const append = (value) => {
      if (value && typeof value === "object") roots.push(value);
    };
    for (const key of Object.getOwnPropertyNames(root)) {
      if (key.startsWith("__reactContainer$") || key.startsWith("__reactFiber$")) append(root[key]);
    }
    append(root._reactRootContainer);
    append(root._reactRootContainer && root._reactRootContainer._internalRoot);
    return roots;
  }

  function findMarketplaceController() {
    const pending = reactFiberRoots();
    const visited = new Set();
    let inspected = 0;
    while (pending.length && inspected < 50000) {
      const fiber = pending.pop();
      if (!fiber || typeof fiber !== "object" || visited.has(fiber)) continue;
      visited.add(fiber);
      inspected += 1;
      const stateNode = fiber.stateNode;
      if (stateNode && typeof stateNode.handleGoToMarketplace === "function") return stateNode;
      if (fiber.current) pending.push(fiber.current);
      if (fiber.child) pending.push(fiber.child);
      if (fiber.sibling) pending.push(fiber.sibling);
      if (fiber.alternate) pending.push(fiber.alternate);
    }
    return null;
  }

  bridge.goToMarketplace = function (itemHrid, enhancementLevel) {
    if (typeof itemHrid !== "string" || !itemHrid.startsWith("/items/")) return false;
    const controller = findMarketplaceController();
    if (!controller) return false;
    // The native item UI always supplies a numeric level (0 for ordinary
    // materials). An undefined level builds an invalid market order-book key
    // and can make the game's market renderer fail before it can recover.
    const normalizedEnhancementLevel = Number.isInteger(enhancementLevel) && enhancementLevel >= 0
      ? enhancementLevel
      : 0;
    try {
      controller.handleGoToMarketplace(itemHrid, normalizedEnhancementLevel);
      return true;
    } catch (_) {
      return false;
    }
  };

  function levelRecordKey(record, fallbackKey) {
    if (record && typeof record === "object") {
      const explicitKey = record.guildShrineHrid || record.shrineHrid || record.guildBuildingHrid || record.hrid;
      if (typeof explicitKey === "string" && explicitKey) return explicitKey;
    }
    return String(fallbackKey || "");
  }

  // Guild-building snapshots can arrive in separate WebSocket frames. Keep a
  // union keyed by the game's own HRID instead of replacing a complete
  // snapshot with a later, partial update.
  function mergeGuildShrineLevels(previous, incoming) {
    if (!incoming || typeof incoming !== "object") return previous;
    const merged = Object.create(null);
    const append = (source) => {
      const entries = Array.isArray(source)
        ? source.map((record, index) => [levelRecordKey(record, index), record])
        : Object.entries(source || {});
      for (const [fallbackKey, record] of entries) {
        const key = levelRecordKey(record, fallbackKey);
        if (key) merged[key] = record;
      }
    };
    append(previous);
    append(incoming);
    return merged;
  }

  function keepGuildData(message) {
    if (!message || typeof message !== "object") return;
    const visited = new Set();
    const pending = [message];
    let scanned = 0;
    while (pending.length && scanned < 400) {
      const value = pending.pop();
      if (!value || typeof value !== "object" || visited.has(value)) continue;
      visited.add(value);
      scanned += 1;
      const itemDetails = value.itemDetailMap || value.itemDetailDict;
      const guildBuffDetails = value.guildBuffDetailMap || value.guildBuffDetailDict;
      const guildBuffLevels = value.characterGuildBuffMap || value.characterGuildBuffDict || value.characterGuildBuffs || value.characterGuildBuffLevelMap || value.characterGuildBuffLevelDict;
      const guildShrineLevelCandidates = [
        value.guildShrineMap, value.guildShrineDict, value.guildShrines,
        value.guildShrineLevelMap, value.guildShrineLevelDict, value.guildShrineLevels,
        value.guildBuildingMap, value.guildBuildingDict, value.guildBuildings,
        value.guildBuildingLevelMap, value.guildBuildingLevelDict, value.guildBuildingLevels
      ];
      const guildShrineDetailCandidates = [
        value.guildShrineDetailMap, value.guildShrineDetailDict, value.guildShrineDetails,
        value.guildBuildingDetailMap, value.guildBuildingDetailDict, value.guildBuildingDetails
      ];
      const characterItems = value.characterItems;
      if (itemDetails && typeof itemDetails === "object") bridge.itemDetails = itemDetails;
      if (guildBuffDetails && typeof guildBuffDetails === "object") bridge.guildBuffDetails = guildBuffDetails;
      if (guildBuffLevels && typeof guildBuffLevels === "object") bridge.guildBuffLevels = guildBuffLevels;
      for (const guildShrineLevels of guildShrineLevelCandidates) {
        if (guildShrineLevels && typeof guildShrineLevels === "object") {
          bridge.guildShrineLevels = mergeGuildShrineLevels(bridge.guildShrineLevels, guildShrineLevels);
        }
      }
      for (const guildShrineDetails of guildShrineDetailCandidates) {
        if (guildShrineDetails && typeof guildShrineDetails === "object") {
          bridge.guildShrineDetails = mergeGuildShrineLevels(bridge.guildShrineDetails, guildShrineDetails);
        }
      }
      if (Array.isArray(characterItems)) bridge.characterItems = characterItems;
      for (const child of Object.values(value)) pending.push(child);
    }
  }

  const NativeWebSocket = page.WebSocket;
  if (!NativeWebSocket || NativeWebSocket.__mwiGuildCreditBridge) return;
  function ObservedWebSocket(...args) {
    const socket = new NativeWebSocket(...args);
    socket.addEventListener("message", (event) => {
      if (typeof event.data !== "string") return;
      bridge.messages.push(event.data);
      if (bridge.messages.length > 80) bridge.messages.shift();
      try {
        keepGuildData(JSON.parse(event.data));
      } catch (_) {
        // Ignore non-JSON protocol frames.
      }
    });
    return socket;
  }
  ObservedWebSocket.prototype = NativeWebSocket.prototype;
  Object.setPrototypeOf(ObservedWebSocket, NativeWebSocket);
  ObservedWebSocket.__mwiGuildCreditBridge = true;
  page.WebSocket = ObservedWebSocket;
})();


(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MwiGuildCreditItemNameCatalog = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const STORAGE_KEY = "mwi-official-item-name-catalog-v1";
  const SCHEMA_VERSION = 1;
  const ITEM_HRID = /^\/items\/[a-z0-9_]+$/i;

  function normalizeLocale(locale) {
    return String(locale || "").toLowerCase().startsWith("zh") ? "zh-CN" : "en";
  }

  function normalizeItemHrid(value) {
    const key = String(value || "").trim();
    if (ITEM_HRID.test(key)) return key;
    return /^[a-z0-9_]+$/i.test(key) ? `/items/${key}` : null;
  }

  function cleanName(value) {
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }

  function catalogFromItemNames(itemNames) {
    if (!itemNames || typeof itemNames !== "object" || Array.isArray(itemNames)) return Object.create(null);
    const names = Object.create(null);
    for (const [rawKey, rawName] of Object.entries(itemNames)) {
      const itemHrid = normalizeItemHrid(rawKey);
      const name = cleanName(rawName);
      if (itemHrid && name) names[itemHrid] = name;
    }
    return names;
  }

  function itemNameMapsFromI18n(root) {
    if (!root || typeof root !== "object") return [];
    const resourceRoots = [
      root.resources,
      root.options && root.options.resources,
      root.store && root.store.data,
      root.services && root.services.resourceStore && root.services.resourceStore.data,
      root.resourceStore && root.resourceStore.data,
      root.data,
      root
    ].filter((value) => value && typeof value === "object");
    const maps = [];
    for (const resources of resourceRoots) {
      for (const localeKey of ["zh", "zh-CN", "zh_CN", "zh-Hans", "zh-Hans-CN"]) {
        const locale = resources[localeKey];
        if (!locale || typeof locale !== "object") continue;
        const translation = locale.translation && typeof locale.translation === "object" ? locale.translation : locale;
        if (translation.itemNames && typeof translation.itemNames === "object") maps.push(translation.itemNames);
        if (locale.itemNames && typeof locale.itemNames === "object") maps.push(locale.itemNames);
      }
    }
    return maps;
  }

  function i18nVariants(candidate) {
    if (!candidate || typeof candidate !== "object") return [];
    return [
      candidate,
      candidate.i18n,
      candidate.i18next,
      candidate.value,
      candidate.value && candidate.value.i18n,
      candidate.context,
      candidate.context && candidate.context.i18n,
      candidate.props && candidate.props.i18n
    ].filter((value) => value && typeof value === "object");
  }

  function extractOfficialItemNameCatalog(roots, options) {
    const minimumEntries = Number.isSafeInteger(options && options.minimumEntries) ? options.minimumEntries : 100;
    const candidates = Array.isArray(roots) ? roots : [roots];
    let best = null;
    for (const root of candidates) {
      for (const candidate of i18nVariants(root)) {
        for (const itemNames of itemNameMapsFromI18n(candidate)) {
          const names = catalogFromItemNames(itemNames);
          const entryCount = Object.keys(names).length;
          if (!best || entryCount > best.entryCount) best = { names, entryCount };
        }
      }
    }
    return best && best.entryCount >= minimumEntries ? { ...best, valid: true } : { names: Object.create(null), entryCount: best ? best.entryCount : 0, valid: false };
  }

  function reactI18nRoots(documentRef) {
    if (!documentRef) return [];
    const found = [];
    const gamePageRoots = [];
    try {
      gamePageRoots.push(...Array.from(documentRef.querySelectorAll('[class^="GamePage"], [class*="GamePage"]')).slice(0, 12));
    } catch (_) {
      // A restricted document should still allow the direct window candidates.
    }

    function fibersFromRoot(root) {
      if (!root) return [];
      const fibers = [];
      for (const key of Reflect.ownKeys(root)) {
        const keyName = String(key);
        if (keyName.startsWith("__reactFiber$") || keyName.startsWith("__reactContainer$") || keyName.startsWith("__reactInternalInstance$")) fibers.push(root[key]);
      }
      return fibers;
    }

    function addFiberCandidates(fiber) {
      const candidates = [
        fiber && fiber.memoizedProps,
        fiber && fiber.pendingProps,
        fiber && fiber.memoizedState,
        fiber && fiber.stateNode && fiber.stateNode.state,
        fiber && fiber.stateNode && fiber.stateNode.props,
        fiber && fiber.stateNode
      ];
      for (const candidate of candidates) found.push(...i18nVariants(candidate));
    }

    // The game page is below the i18n provider. Walking its parent chain is
    // dramatically cheaper than repeatedly traversing the entire React tree.
    for (const root of gamePageRoots) {
      for (const initialFiber of fibersFromRoot(root)) {
        let fiber = initialFiber;
        for (let depth = 0; fiber && depth < 24; depth += 1, fiber = fiber.return) addFiberCandidates(fiber);
      }
    }
    if (found.length) return found;

    const roots = [documentRef.getElementById && documentRef.getElementById("root"), documentRef.body].filter(Boolean);
    const fibers = [];
    for (const root of roots) fibers.push(...fibersFromRoot(root));
    const visited = new Set();
    let scanned = 0;
    while (fibers.length && scanned < 1500) {
      const fiber = fibers.pop();
      if (!fiber || typeof fiber !== "object" || visited.has(fiber)) continue;
      visited.add(fiber);
      scanned += 1;
      addFiberCandidates(fiber);
      if (fiber.current) fibers.push(fiber.current);
      if (fiber.stateNode && fiber.stateNode.current) fibers.push(fiber.stateNode.current);
      if (fiber.child) fibers.push(fiber.child);
      if (fiber.sibling) fibers.push(fiber.sibling);
      if (fiber.return) fibers.push(fiber.return);
    }
    return found.filter((value) => value && typeof value === "object");
  }

  function readCachedCatalog(storage) {
    try {
      const stored = JSON.parse(storage && storage.getItem(STORAGE_KEY) || "");
      if (!stored || stored.schemaVersion !== SCHEMA_VERSION || !stored.names || typeof stored.names !== "object") return null;
      const names = catalogFromItemNames(stored.names);
      const entryCount = Object.keys(names).length;
      return entryCount ? { names, entryCount, source: "cache", updatedAt: stored.updatedAt || null, version: stored.version || null } : null;
    } catch (_) {
      return null;
    }
  }

  function persistCatalog(storage, catalog) {
    try {
      storage && storage.setItem(STORAGE_KEY, JSON.stringify({
        schemaVersion: SCHEMA_VERSION,
        source: catalog.source,
        updatedAt: catalog.updatedAt,
        entryCount: catalog.entryCount,
        version: catalog.version,
        names: catalog.names
      }));
    } catch (_) {
      // A read-only storage environment should not prevent live name resolution.
    }
  }

  function pageI18nRoots(pageWindow) {
    if (!pageWindow || typeof pageWindow !== "object") return [];
    return [pageWindow.i18next, pageWindow.i18n, pageWindow.mwi && pageWindow.mwi.lang].filter((value) => value && typeof value === "object");
  }

  function createItemNameCatalog(options) {
    const pageWindow = options && options.pageWindow;
    const documentRef = options && options.document;
    const storage = options && options.storage;
    const version = options && options.version || null;
    const minimumEntries = Number.isSafeInteger(options && options.minimumEntries) ? options.minimumEntries : 100;
    let current = readCachedCatalog(storage) || { names: Object.create(null), entryCount: 0, source: "unavailable", updatedAt: null, version };

    function refresh() {
      const direct = extractOfficialItemNameCatalog(pageI18nRoots(pageWindow), { minimumEntries });
      const extracted = direct.valid ? direct : extractOfficialItemNameCatalog(reactI18nRoots(documentRef), { minimumEntries });
      if (!extracted.valid) return current;
      current = { names: extracted.names, entryCount: extracted.entryCount, source: direct.valid ? "window-i18n" : "react-provider", updatedAt: new Date().toISOString(), version };
      persistCatalog(storage, current);
      return current;
    }

    function resolveItemName({ itemHrid, englishFallback, locale }) {
      const normalized = normalizeItemHrid(itemHrid);
      const englishName = cleanName(englishFallback) || normalized || String(itemHrid || "");
      if (normalizeLocale(locale) !== "zh-CN" || !normalized) return englishName;
      return current.names[normalized] || englishName;
    }

    function coverage(itemHrids) {
      const requested = Array.from(new Set((Array.isArray(itemHrids) ? itemHrids : []).map(normalizeItemHrid).filter(Boolean)));
      const missing = requested.filter((itemHrid) => !current.names[itemHrid]);
      return { requestedCount: requested.length, officialHitCount: requested.length - missing.length, missingItemHrids: missing, source: current.source, catalogEntryCount: current.entryCount };
    }

    return { refresh, resolveItemName, coverage, metadata: () => ({ ...current, names: undefined }) };
  }

  return { STORAGE_KEY, normalizeLocale, normalizeItemHrid, catalogFromItemNames, extractOfficialItemNameCatalog, createItemNameCatalog };
});


(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MwiGuildCreditReleaseInfo = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;
  const DEFAULT_TIMEOUT_MS = 8000;

  function parseUserScriptVersion(source) {
    const match = String(source || "").match(/^\/\/ @version\s+(.+)$/m);
    return match && match[1].trim() || null;
  }

  function createVersionChecker(options) {
    const fetchImpl = options && options.fetchImpl;
    const url = options && options.url;
    const cacheTtlMs = Number(options && options.cacheTtlMs) || DEFAULT_CACHE_TTL_MS;
    const timeoutMs = Number(options && options.timeoutMs) || DEFAULT_TIMEOUT_MS;
    const setTimer = options && options.setTimeout || setTimeout;
    const clearTimer = options && options.clearTimeout || clearTimeout;
    const Controller = options && options.AbortController || (typeof AbortController === "function" ? AbortController : null);
    let cached = null;
    let request = null;

    async function requestLatestVersion() {
      if (typeof fetchImpl !== "function" || !url) throw new Error("更新检查不可用");
      const controller = Controller ? new Controller() : null;
      let timeout = null;
      try {
        const timeoutPromise = new Promise((_, reject) => {
          timeout = setTimer(() => {
            if (controller) controller.abort();
            reject(new Error("更新检查超时"));
          }, timeoutMs);
        });
        const response = await Promise.race([
          fetchImpl(url, { cache: "no-store", signal: controller && controller.signal }),
          timeoutPromise
        ]);
        if (!response || !response.ok) throw new Error(`更新信息请求失败 (${response && response.status || "未知"})`);
        const latestVersion = parseUserScriptVersion(await response.text());
        if (!latestVersion) throw new Error("未找到最新版本号");
        cached = { latestVersion, checkedAt: Date.now() };
        return latestVersion;
      } finally {
        if (timeout !== null) clearTimer(timeout);
      }
    }

    function latestVersion() {
      if (cached && Date.now() - cached.checkedAt < cacheTtlMs) return Promise.resolve(cached.latestVersion);
      if (!request) request = requestLatestVersion().finally(() => { request = null; });
      return request;
    }

    return { latestVersion };
  }

  return { DEFAULT_CACHE_TTL_MS, DEFAULT_TIMEOUT_MS, parseUserScriptVersion, createVersionChecker };
});


(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MwiGuildCreditLocalization = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const STRINGS = {
    "zh-CN": {
      unknownItem: "未知物品",
      priceReferenceA: "左一",
      priceReferenceATitle: "左一：最低出售价，可立即买入",
      priceReferenceB: "右一",
      priceReferenceBTitle: "右一：最高收购价，仅作理论参考",
      marketItem: "在市场中查看{item}",
      updateChecking: "当前版本 v{current} · 最新版本：检查中...",
      updateAvailable: "当前版本 v{current} · 最新版本 v{latest} · 发现新版本",
      updateNow: "立即更新",
      updateLatest: "当前版本 v{current} · 最新版本 v{latest} · 已是最新",
      updateUnavailable: "当前版本 v{current} · 最新版本：暂时无法读取",
      shrineForce: "力量神龛",
      shrineTempo: "节奏神龛",
      shrineSpirit: "精神神龛",
      shrineRarity: "稀有神龛",
      shrineScholar: "学者神龛",
      domainLife: "生活",
      domainCombat: "战斗",
      shrineWithDomain: "{shrine}（{domain}）",
      guildTargetApplied: "已按当前公会神龛等级设定{domain}计划，共 {count} 项需要升级。",
      guildTargetComplete: "当前已达到最大等级（{domain}）。",
      plansCleared: "已清空全部神龛升级计划。",
      level: "{level} 级",
      targetButtonReady: "按每座对应公会神龛的当前等级批量设定目标",
      targetButtonMissing: "尚未读取完整的公会神龛建筑等级：{missing}",
      targetSummary: "{domain} {count}/{total}{missing}",
      targetSummaryMissing: "（未识别：{missing}）",
      shrineLevelsRead: "公会神龛等级已读取：{summaries}。",
      shrineLevelsReading: "正在读取当前公会神龛建筑等级…",
      shrine: "神龛",
      startLevel: "起始等级",
      targetLevel: "目标等级",
      removePlan: "移除此项",
      gold: "金币",
      guildTokens: "公会代币",
      noSnapshotEstimate: "未读取到公开市场快照，暂无法估算金币成本。",
      partialEstimatedCost: "预计成本（已定价部分）",
      estimatedTotalCost: "预计总成本",
      partialAfterInventory: "库存后缺口（已定价部分）",
      afterInventory: "库存后仍需",
      inventoryUnavailable: "未读取背包库存，缺口暂按 0 件库存计算。",
      noCreditPrice: "以下信用点暂无可用市场价格：{items}。",
      costSummary: "成本概览",
      inventoryAndMissing: "库存 {owned} · 缺 {missing}",
      inventory: "库存 {count}",
      inventoryNotRead: "库存未读取",
      backpackInventory: "背包库存 {count}",
      notRead: "未读取",
      optimalExchangeNeeds: "最优兑换需",
      exchangeRate: "{items} → {credits}",
      itemQuantity: "{count} 个",
      creditQuantity: "{count} 点",
      optimalExchangeUnavailable: "最优兑换：暂无可用市场价格",
      requiredThisTime: "本次所需",
      noGuildRules: "未读取到神龛升级规则。请刷新游戏页面后重新打开公会。",
      allBuffsMaxed: "当前所有神龛增益均已满级。",
      noUpgradeMaterials: "当前没有需要计算的神龛升级材料。",
      missingLevelCost: "缺少 {level} 级升级成本数据。",
      invalidLevels: "起始等级或目标等级无效。",
      mergedUpgradePlans: "已合并 {count} 项神龛升级的材料成本。",
      unknownCurrentLevels: "未读取当前神龛等级，已按 0 级开始；请确认或手动调整“起始等级”。",
      snapshotFailed: "公开市场快照读取失败，暂未估算金币成本。",
      panelTitle: "公会助手",
      creditValue: "信用点性价比",
      shrineUpgrade: "神龛升级",
      targetCredits: "目标信用点",
      marketReference: "市场价格参考",
      priceReference: "价格参考",
      refreshEstimate: "刷新市场估算",
      waitingExchangeRules: "等待游戏兑换数据...",
      guildShrineBatchPlan: "按当前公会神龛等级批量规划",
      setGuildLifeTarget: "设定当前公会建筑为目标等级（生活）",
      setGuildCombatTarget: "设定当前公会建筑为目标等级（战斗）",
      addShrine: "添加神龛",
      clearAll: "清空全部",
      waitingUpgradeRules: "等待神龛升级数据...",
      author: "作者：柆雨",
      support: "遇到问题或无法获取最新版，请加群：437320340",
      fallbackInstaller: "无法打开 Greasy Fork？使用备用分发安装",
      noMarketEstimate: "暂无可估算的市场价格",
      item: "物品",
      exchange: "兑换",
      perCredit: "每点",
      targetCost: "目标成本",
      tokenExchangeValue: "{token}兑换价值",
      noMarketValue: "暂无市场估算",
      noExchangeRules: "未读取到兑换规则。请刷新游戏页面后重新打开公会商店。",
      readingRules: "已读取 {count} 条兑换规则，正在读取公开市场快照...",
      snapshotLoadFailed: "市场快照读取失败：{message}",
      credits: "信用点",
      goldPerCredit: "金币 / 信用",
      singleExchange: "单次兑换",
      marketCost: "市场成本",
      exchangeRecommendation: "兑换最优推荐",
      advisorReferenceSelected: "卖出右一（税 2%）·买入{reference}",
      advisorReference: "买入参考{reference}",
      chooseItem: "请选择兑换物品以计算卖出后替代方案。",
      alreadyOptimal: "当前选择已是最优物品，无需卖出再回购。",
      sellAndBuyMore: "卖出后改买可多获得 <strong>+{count}</strong> {credit}。",
      directMore: "直接兑换可多获得 <strong>{count}</strong> {credit}。",
      sameCredits: "两种方案可获得相同的信用点。",
      selected: "当前选择",
      selectedOptimal: "当前选择（最优）",
      bestItem: "最优物品",
      directExchange: "直接兑换",
      afterTax: "税后所得",
      buybackExchange: "回购兑换",
      purchaseCost: "买入成本",
      noSellPrice: "当前物品暂无公开收购价，无法估算卖出后回购。",
      noAffordableReplacement: "售出当前数量后税后可得 {gold}，不足以回购其他可兑换物品。",
      sidebarCredit: "信用"
    },
    en: {
      unknownItem: "Unknown item",
      priceReferenceA: "Lowest ask",
      priceReferenceATitle: "Lowest ask: the current price to buy immediately",
      priceReferenceB: "Highest bid",
      priceReferenceBTitle: "Highest bid: a theoretical reference only",
      marketItem: "View {item} in Marketplace",
      updateChecking: "Current v{current} · Latest: checking...",
      updateAvailable: "Current v{current} · Latest v{latest} · Update available",
      updateNow: "Update now",
      updateLatest: "Current v{current} · Latest v{latest} · Up to date",
      updateUnavailable: "Current v{current} · Latest: unavailable",
      shrineForce: "Force Shrine",
      shrineTempo: "Tempo Shrine",
      shrineSpirit: "Spirit Shrine",
      shrineRarity: "Rarity Shrine",
      shrineScholar: "Scholar Shrine",
      domainLife: "Life",
      domainCombat: "Combat",
      shrineWithDomain: "{shrine} ({domain})",
      guildTargetApplied: "Set {domain} plans to the current guild shrine levels; {count} upgrade(s) are needed.",
      guildTargetComplete: "All {domain} shrines already meet their guild building levels; no extra materials are needed.",
      plansCleared: "Cleared all shrine upgrade plans.",
      level: "Lv. {level}",
      targetButtonReady: "Set every matching shrine target to its current guild level",
      targetButtonMissing: "Guild shrine building levels are incomplete: {missing}",
      targetSummary: "{domain} {count}/{total}{missing}",
      targetSummaryMissing: " (unread: {missing})",
      shrineLevelsRead: "Guild shrine levels read: {summaries}.",
      shrineLevelsReading: "Reading current guild shrine building levels…",
      shrine: "Shrine",
      startLevel: "Starting level",
      targetLevel: "Target level",
      removePlan: "Remove this plan",
      gold: "gold",
      guildTokens: "guild tokens",
      noSnapshotEstimate: "The public market snapshot is unavailable, so the gold cost cannot be estimated.",
      partialEstimatedCost: "Estimated cost (priced items only)",
      estimatedTotalCost: "Estimated total cost",
      partialAfterInventory: "After-inventory gap (priced items only)",
      afterInventory: "Still needed after inventory",
      inventoryUnavailable: "Backpack inventory is unavailable; the gap assumes you own 0 items.",
      noCreditPrice: "No usable market price for: {items}.",
      costSummary: "Cost summary",
      inventoryAndMissing: "Owned {owned} · Missing {missing}",
      inventory: "Owned {count}",
      inventoryNotRead: "Inventory unavailable",
      backpackInventory: "Backpack: {count}",
      notRead: "unavailable",
      optimalExchangeNeeds: "Best exchange needs",
      exchangeRate: "{items} → {credits}",
      itemQuantity: "{count} {unit}",
      creditQuantity: "{count} {unit}",
      optimalExchangeUnavailable: "Best exchange: no usable market price",
      requiredThisTime: "Needed now",
      noGuildRules: "Shrine upgrade rules are unavailable. Refresh the game, then reopen the guild.",
      allBuffsMaxed: "All shrine buffs are already at their maximum level.",
      noUpgradeMaterials: "There are no shrine upgrade materials to calculate.",
      missingLevelCost: "Missing upgrade cost data for level {level}.",
      invalidLevels: "The starting or target level is invalid.",
      mergedUpgradePlans: "Combined material costs for {count} shrine upgrade plan(s).",
      unknownCurrentLevels: "Current shrine levels are unavailable, so plans start at level 0. Please verify or adjust the starting level.",
      snapshotFailed: "The public market snapshot failed to load, so the gold cost is not estimated yet.",
      panelTitle: "Guild Assistant",
      creditValue: "Credit value",
      shrineUpgrade: "Shrine upgrades",
      targetCredits: "Target credits",
      marketReference: "Market price reference",
      priceReference: "Price reference",
      refreshEstimate: "Refresh market estimate",
      waitingExchangeRules: "Waiting for game exchange data...",
      guildShrineBatchPlan: "Batch plan by current guild shrine levels",
      setGuildLifeTarget: "Set guild building levels as targets (Life)",
      setGuildCombatTarget: "Set guild building levels as targets (Combat)",
      addShrine: "Add shrine",
      clearAll: "Clear all",
      waitingUpgradeRules: "Waiting for shrine upgrade data...",
      author: "Author: 柆雨",
      support: "For help or updates, join QQ group: 437320340",
      fallbackInstaller: "Can't reach Greasy Fork? Use the fallback installer",
      noMarketEstimate: "No market price can be estimated yet",
      item: "Item",
      exchange: "Exchange",
      perCredit: "Per credit",
      targetCost: "Target cost",
      tokenExchangeValue: "{token} exchange value",
      noMarketValue: "No market estimate",
      noExchangeRules: "Exchange rules are unavailable. Refresh the game, then reopen the guild shop.",
      readingRules: "Read {count} exchange rule(s); loading the public market snapshot...",
      snapshotLoadFailed: "Market snapshot failed to load: {message}",
      credits: "credits",
      goldPerCredit: "gold / credit",
      singleExchange: "Direct exchange",
      marketCost: "Market cost",
      exchangeRecommendation: "Best exchange recommendation",
      advisorReferenceSelected: "Sell at highest bid (2% tax) · Buy at {reference}",
      advisorReference: "Buy at {reference}",
      chooseItem: "Select an exchange item to compare sell-and-buy-back options.",
      alreadyOptimal: "The current item is already optimal; selling and buying back would not help.",
      sellAndBuyMore: "Selling and buying another item yields <strong>+{count}</strong> {credit}.",
      directMore: "Exchanging directly yields <strong>{count}</strong> more {credit}.",
      sameCredits: "Both options yield the same number of credits.",
      selected: "Current item",
      selectedOptimal: "Current item (best)",
      bestItem: "Best item",
      directExchange: "Direct exchange",
      afterTax: "After tax",
      buybackExchange: "Buy-back exchange",
      purchaseCost: "Purchase cost",
      noSellPrice: "This item has no public buy price, so sell-and-buy-back cannot be estimated.",
      noAffordableReplacement: "Selling this quantity yields {gold} after tax, which is not enough to buy an alternative exchange item.",
      sidebarCredit: "Credits"
    }
  };

  function normalizeLocale(locale) {
    return String(locale || "").toLowerCase().startsWith("zh") ? "zh-CN" : "en";
  }

  function interpolate(template, values) {
    return String(template).replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key) => values && values[key] !== undefined ? String(values[key]) : `{${key}}`);
  }

  function createLocalizer(locale) {
    const normalizedLocale = normalizeLocale(locale);
    const strings = STRINGS[normalizedLocale];
    function t(key, values) {
      return interpolate(strings[key] || STRINGS.en[key] || key, values);
    }
    function number(value, digits) {
      if (value === null || value === undefined || !Number.isFinite(value)) return "-";
      return new Intl.NumberFormat(normalizedLocale, { maximumFractionDigits: digits === undefined ? 0 : digits }).format(value);
    }
    function quantity(key, count) {
      const formatted = number(count);
      if (normalizedLocale === "zh-CN") return t(key, { count: formatted });
      const unit = key === "creditQuantity"
        ? Number(count) === 1 ? "credit" : "credits"
        : Number(count) === 1 ? "item" : "items";
      return t(key, { count: formatted, unit });
    }
    return { locale: normalizedLocale, t, number, quantity };
  }

  return { STRINGS, normalizeLocale, createLocalizer };
});


(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MwiGuildCreditCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function positiveInteger(value) {
    const number = Number(value);
    return Number.isSafeInteger(number) && number > 0 ? number : null;
  }

  function normalizeAsks(orderBook) {
    if (!orderBook || !Array.isArray(orderBook.asks)) return [];
    return orderBook.asks
      .map((ask) => ({ price: Number(ask.price), quantity: Number(ask.quantity) }))
      .filter((ask) => Number.isFinite(ask.price) && ask.price >= 0 && Number.isSafeInteger(ask.quantity) && ask.quantity > 0)
      .sort((left, right) => left.price - right.price);
  }

  function quoteAsks(orderBook, requestedQuantity) {
    const quantity = positiveInteger(requestedQuantity);
    if (!quantity) return { status: "invalid_quantity", requestedQuantity, availableQuantity: 0, cost: null, fills: [] };

    let remaining = quantity;
    let cost = 0;
    let availableQuantity = 0;
    const fills = [];

    for (const ask of normalizeAsks(orderBook)) {
      availableQuantity += ask.quantity;
      if (remaining === 0) continue;
      const take = Math.min(remaining, ask.quantity);
      cost += take * ask.price;
      fills.push({ price: ask.price, quantity: take });
      remaining -= take;
    }

    if (remaining > 0) {
      return { status: "insufficient_depth", requestedQuantity: quantity, availableQuantity, cost: null, fills };
    }
    return { status: "ok", requestedQuantity: quantity, availableQuantity, cost, fills };
  }

  function evaluateConversion(conversion, orderBook, targetCredits) {
    const target = positiveInteger(targetCredits);
    const itemCount = positiveInteger(conversion && conversion.itemCount);
    const creditCount = positiveInteger(conversion && conversion.creditCount);
    if (!target || !itemCount || !creditCount) {
      return { status: "invalid_conversion", conversion, targetCredits };
    }

    const batches = Math.ceil(target / creditCount);
    const requiredItems = batches * itemCount;
    const actualCredits = batches * creditCount;
    const quote = quoteAsks(orderBook, requiredItems);
    const base = {
      status: quote.status,
      itemHrid: conversion.itemHrid,
      itemName: conversion.itemName || conversion.itemHrid,
      creditItemHrid: conversion.creditItemHrid,
      itemCount,
      creditCount,
      targetCredits: target,
      batches,
      requiredItems,
      actualCredits,
      availableQuantity: quote.availableQuantity,
      fills: quote.fills,
      buyerFee: 0
    };
    if (quote.status !== "ok") return { ...base, cost: null, costPerCredit: null };
    return { ...base, cost: quote.cost, costPerCredit: quote.cost / actualCredits };
  }

  function rankConversions(conversions, orderBooks, targetCredits) {
    return conversions
      .map((conversion) => evaluateConversion(conversion, orderBooks[conversion.itemHrid], targetCredits))
      .sort((left, right) => {
        if (left.status === "ok" && right.status !== "ok") return -1;
        if (right.status === "ok" && left.status !== "ok") return 1;
        if (left.status !== "ok" || right.status !== "ok") return left.itemName.localeCompare(right.itemName, "zh-CN");
        return left.costPerCredit - right.costPerCredit || left.cost - right.cost || left.itemName.localeCompare(right.itemName, "zh-CN");
      });
  }

  function rankGuildTokenCreditValues(exchangeRules, rankedCredits) {
    const rankings = rankedCredits && typeof rankedCredits === "object" ? rankedCredits : {};
    return (Array.isArray(exchangeRules) ? exchangeRules : [])
      .map((rule) => {
        const guildTokenCount = positiveInteger(rule && rule.guildTokenCount);
        const creditCount = positiveInteger(rule && rule.creditCount);
        const creditItemHrid = rule && rule.creditItemHrid;
        if (!guildTokenCount || !creditCount || !creditItemHrid) {
          return { status: "invalid_rule", rule };
        }
        const best = (Array.isArray(rankings[creditItemHrid]) ? rankings[creditItemHrid] : [])
          .find((result) => result && result.status === "ok" && Number.isFinite(result.costPerCredit));
        if (!best) {
          return { status: "unpriced", guildTokenCount, creditCount, creditItemHrid };
        }
        return {
          status: "ok",
          guildTokenCount,
          creditCount,
          creditItemHrid,
          // A token's value is based on the exchange rule's credit quantity, not
          // the minimum purchasable batch. This avoids overstating sparse credits.
          goldValue: best.costPerCredit * creditCount,
          goldValuePerToken: (best.costPerCredit * creditCount) / guildTokenCount,
          bestItemHrid: best.itemHrid,
          bestItemName: best.itemName
        };
      });
  }

  function evaluateBudgetConversion(conversion, buyPrice, budget) {
    const itemCount = positiveInteger(conversion && conversion.itemCount);
    const creditCount = positiveInteger(conversion && conversion.creditCount);
    const price = Number(buyPrice);
    const availableBudget = Number(budget);
    if (!itemCount || !creditCount || !Number.isFinite(price) || price <= 0 || !Number.isFinite(availableBudget) || availableBudget < 0) {
      return { status: "invalid_conversion", conversion, buyPrice, budget };
    }

    const batchCost = itemCount * price;
    const batches = Math.floor(availableBudget / batchCost);
    const requiredItems = batches * itemCount;
    const actualCredits = batches * creditCount;
    const cost = requiredItems * price;
    return {
      status: actualCredits > 0 ? "ok" : "unaffordable",
      itemHrid: conversion.itemHrid,
      itemName: conversion.itemName || conversion.itemHrid,
      creditItemHrid: conversion.creditItemHrid,
      itemCount,
      creditCount,
      buyPrice: price,
      budget: availableBudget,
      batches,
      requiredItems,
      actualCredits,
      cost,
      remainingBudget: availableBudget - cost,
      costPerCredit: batchCost / creditCount,
      buyerFee: 0
    };
  }

  function bestConversionForBudget(conversions, buyPrices, budget) {
    const candidates = (Array.isArray(conversions) ? conversions : [])
      .map((conversion) => evaluateBudgetConversion(conversion, buyPrices && buyPrices[conversion.itemHrid], budget))
      .filter((result) => result.status === "ok")
      .sort((left, right) => (
        right.actualCredits - left.actualCredits ||
        left.costPerCredit - right.costPerCredit ||
        left.cost - right.cost ||
        left.itemName.localeCompare(right.itemName, "zh-CN")
      ));
    return candidates[0] || null;
  }

  function estimateSaleReplacement(options) {
    const selectedConversion = options && options.selectedConversion;
    const batches = positiveInteger(options && options.batches);
    const selectedItemCount = positiveInteger(selectedConversion && selectedConversion.itemCount);
    const selectedCreditCount = positiveInteger(selectedConversion && selectedConversion.creditCount);
    if (!batches || !selectedItemCount || !selectedCreditCount) {
      return { status: "invalid_selection", options };
    }

    const directCredits = batches * selectedCreditCount;
    const sale = calculateSaleProceeds(
      batches * selectedItemCount,
      options && options.sellPrice,
      options && options.sellerTaxRate
    );
    if (sale.status !== "ok") return { status: sale.status, directCredits, sale };

    const best = bestConversionForBudget(options && options.conversions, options && options.buyPrices, sale.net);
    if (!best) return { status: "no_affordable_conversion", directCredits, sale, best: null };
    if (best.itemHrid === selectedConversion.itemHrid) {
      return { status: "already_optimal", directCredits, sale, best, creditDifference: 0 };
    }

    return {
      status: "ok",
      directCredits,
      sale,
      best,
      creditDifference: best.actualCredits - directCredits
    };
  }

  function calculateSaleProceeds(quantity, sellPrice, sellerTaxRate) {
    const itemQuantity = positiveInteger(quantity);
    const price = Number(sellPrice);
    const taxRate = Number(sellerTaxRate);
    if (!itemQuantity || !Number.isFinite(price) || price <= 0 || !Number.isFinite(taxRate) || taxRate < 0 || taxRate >= 1) {
      return { status: "invalid_sale", quantity, sellPrice, sellerTaxRate, gross: null, tax: null, net: null };
    }
    const gross = itemQuantity * price;
    const tax = Math.floor(gross * taxRate);
    return { status: "ok", quantity: itemQuantity, sellPrice: price, sellerTaxRate: taxRate, gross, tax, net: gross - tax };
  }

  function snapshotMarketPrice(snapshot, itemHrid, enhancementLevel, field) {
    const level = Number(enhancementLevel);
    if (!itemHrid || !Number.isSafeInteger(level) || level < 0 || (field !== "a" && field !== "b")) return null;
    const entry = snapshot && snapshot.marketData && snapshot.marketData[itemHrid] && snapshot.marketData[itemHrid][String(level)];
    const price = Number(entry && entry[field]);
    return Number.isFinite(price) && price > 0 ? price : null;
  }

  function formatCompactCost(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "-";
    const rounded = Math.round(number);
    if (rounded < 10000) return String(rounded);
    const thousands = Math.round(rounded / 1000);
    if (thousands < 10000) return `${thousands}k`;
    return `${Math.round(rounded / 1000000)}m`;
  }

  function compareVersions(currentVersion, latestVersion) {
    const parse = (value) => (String(value || "").match(/\d+/g) || []).map(Number);
    const current = parse(currentVersion);
    const latest = parse(latestVersion);
    const length = Math.max(current.length, latest.length);
    for (let index = 0; index < length; index += 1) {
      const difference = (current[index] || 0) - (latest[index] || 0);
      if (difference !== 0) return difference;
    }
    return 0;
  }

  function aggregateGuildBuffLevelCosts(levelCosts, startLevel, targetLevel) {
    const start = Number(startLevel);
    const target = Number(targetLevel);
    const costs = Array.isArray(levelCosts) ? levelCosts : levelCosts && typeof levelCosts === "object" ? levelCosts : null;
    if (!costs || !Number.isSafeInteger(start) || !Number.isSafeInteger(target) || start < 0 || target <= start) {
      return { status: "invalid_range", startLevel, targetLevel, totals: [] };
    }

    const maxLevel = Array.isArray(costs)
      ? costs.length - 1
      : Math.max(...Object.keys(costs).map(Number).filter(Number.isSafeInteger));
    if (!Number.isSafeInteger(maxLevel) || target > maxLevel) {
      return { status: "invalid_range", startLevel: start, targetLevel: target, maxLevel, totals: [] };
    }

    const totals = new Map();
    const add = (itemHrid, count) => {
      const quantity = Number(count);
      if (!itemHrid || !Number.isFinite(quantity) || quantity <= 0) return;
      totals.set(itemHrid, (totals.get(itemHrid) || 0) + quantity);
    };

    for (let level = start + 1; level <= target; level += 1) {
      const cost = costs[level];
      if (!cost || typeof cost !== "object") {
        return { status: "missing_cost", startLevel: start, targetLevel: target, maxLevel, missingLevel: level, totals: [] };
      }
      add("/items/guild_token", cost.guildTokenCost);
      for (const creditCost of cost.creditCosts || []) add(creditCost.itemHrid, creditCost.count);
    }

    return {
      status: "ok",
      startLevel: start,
      targetLevel: target,
      maxLevel,
      totals: [...totals.entries()]
        .map(([itemHrid, count]) => ({ itemHrid, count }))
        .sort((left, right) => left.itemHrid.localeCompare(right.itemHrid))
    };
  }

  function aggregateGuildBuffPlans(plans) {
    if (!Array.isArray(plans) || plans.length === 0) return { status: "invalid_plans", plans: [], totals: [] };

    const totals = new Map();
    const results = [];
    for (let index = 0; index < plans.length; index += 1) {
      const plan = plans[index];
      const result = aggregateGuildBuffLevelCosts(plan && plan.levelCosts, plan && plan.startLevel, plan && plan.targetLevel);
      if (result.status !== "ok") return { status: "invalid_plan", planIndex: index, result, plans: results, totals: [] };
      results.push({ ...result, id: plan && plan.id, guildBuffHrid: plan && plan.guildBuffHrid });
      for (const item of result.totals) totals.set(item.itemHrid, (totals.get(item.itemHrid) || 0) + item.count);
    }

    return {
      status: "ok",
      plans: results,
      totals: [...totals.entries()]
        .map(([itemHrid, count]) => ({ itemHrid, count }))
        .sort((left, right) => left.itemHrid.localeCompare(right.itemHrid))
    };
  }

  function estimateGuildUpgradeCosts(totals, creditUnitCosts, inventoryCounts) {
    const unitCosts = creditUnitCosts && typeof creditUnitCosts === "object" ? creditUnitCosts : {};
    const inventory = inventoryCounts && typeof inventoryCounts === "object" ? inventoryCounts : {};
    const rows = [];
    const unpricedItemHrids = [];
    let totalGold = 0;
    let missingGold = 0;
    let guildTokensRequired = 0;
    let guildTokensOwned = 0;

    for (const item of Array.isArray(totals) ? totals : []) {
      const itemHrid = item && item.itemHrid;
      const required = Number(item && item.count);
      if (!itemHrid || !Number.isFinite(required) || required <= 0) continue;
      const owned = Math.max(0, Number(inventory[itemHrid]) || 0);
      const missing = Math.max(0, required - owned);
      if (itemHrid === "/items/guild_token") {
        guildTokensRequired += required;
        guildTokensOwned += owned;
        rows.push({ itemHrid, required, owned, missing, unitCost: null, totalCost: null, missingCost: null });
        continue;
      }
      const unitCost = Number(unitCosts[itemHrid]);
      const priced = Number.isFinite(unitCost) && unitCost > 0;
      if (priced) {
        totalGold += required * unitCost;
        missingGold += missing * unitCost;
      } else {
        unpricedItemHrids.push(itemHrid);
      }
      rows.push({
        itemHrid,
        required,
        owned,
        missing,
        unitCost: priced ? unitCost : null,
        totalCost: priced ? required * unitCost : null,
        missingCost: priced ? missing * unitCost : null
      });
    }

    return {
      status: unpricedItemHrids.length ? "partial" : "ok",
      totalGold,
      missingGold,
      guildTokensRequired,
      guildTokensOwned,
      guildTokensMissing: Math.max(0, guildTokensRequired - guildTokensOwned),
      unpricedItemHrids,
      rows
    };
  }

  function conversionsFromItemDetails(itemDetails, creditItemHrid) {
    const details = Array.isArray(itemDetails)
      ? itemDetails.map((detail) => [detail && (detail.itemHrid || detail.hrid), detail])
      : Object.entries(itemDetails || {});
    return details.flatMap(([itemKey, detail]) => (detail && Array.isArray(detail.guildCreditConversions) ? detail.guildCreditConversions : [])
      .filter((conversion) => conversion.creditItemHrid === creditItemHrid)
      .map((conversion) => ({
        itemHrid: detail.itemHrid || detail.hrid || itemKey,
        itemName: detail.name || detail.itemHrid || detail.hrid || itemKey,
        creditItemHrid: conversion.creditItemHrid,
        itemCount: conversion.itemCount,
        creditCount: conversion.creditCount
      }))
      .filter((conversion) => conversion.itemHrid && positiveInteger(conversion.itemCount) && positiveInteger(conversion.creditCount)));
  }

  return { normalizeAsks, quoteAsks, evaluateConversion, rankConversions, rankGuildTokenCreditValues, evaluateBudgetConversion, bestConversionForBudget, calculateSaleProceeds, estimateSaleReplacement, snapshotMarketPrice, formatCompactCost, compareVersions, aggregateGuildBuffLevelCosts, aggregateGuildBuffPlans, estimateGuildUpgradeCosts, conversionsFromItemDetails };
});


(function () {
  "use strict";

  const core = window.MwiGuildCreditCore;
  const itemNameCatalogApi = window.MwiGuildCreditItemNameCatalog;
  const releaseInfoApi = window.MwiGuildCreditReleaseInfo;
  const localizationApi = window.MwiGuildCreditLocalization;
  if (!core || !itemNameCatalogApi || !releaseInfoApi || !localizationApi) return;
  const pageWindow = typeof unsafeWindow === "undefined" ? window : unsafeWindow;
  const PLUGIN_VERSION = String(window.MwiGuildCreditVersion || "0.0.0");
  const UPDATE_SCRIPT_URL = "https://raw.githubusercontent.com/LaYuDr/milky-way-idle-guild-credit-optimizer/main/dist/milky-way-idle-guild-credit-optimizer.user.js";
  // Manual-install fallback only. Keep automatic update checks on the
  // first-party GitHub build, because this URL opens Tampermonkey's installer
  // page rather than returning a userscript payload.
  const FALLBACK_INSTALL_URL = "https://www.tampermonkey.net/script_installation.php#url=https://js.nainai.eu.org/proxy/https://update.greasyfork.org/scripts/586873/%E9%93%B6%E6%B2%B3%E5%A5%B6%E7%89%9B%E5%85%AC%E4%BC%9A%E4%BF%A1%E7%94%A8%E7%82%B9%E6%80%A7%E4%BB%B7%E6%AF%94.user.js";
  const PRICE_REFERENCE_STORAGE_KEY = "mwi-credit-price-reference";
  const UI_STATE_STORAGE_KEY = "mwi-guild-credit-ui-state-v1";
  const UPDATE_CHECK_TIMEOUT_MS = 8000;
  const PRICE_REFERENCES = { a: {}, b: {} };

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
  const SELLER_TAX_RATE = 0.02;
  const GUILD_SHRINE_NAME_KEYS = {
    "/guild_shrines/force": "shrineForce",
    "/guild_shrines/tempo": "shrineTempo",
    "/guild_shrines/spirit": "shrineSpirit",
    "/guild_shrines/rarity": "shrineRarity",
    "/guild_shrines/scholar": "shrineScholar"
  };
  const savedUiState = loadSavedPluginUiState();
  const itemNameCatalog = itemNameCatalogApi.createItemNameCatalog({ pageWindow, document, storage: pageWindow.localStorage, version: PLUGIN_VERSION });
  const updateChecker = releaseInfoApi.createVersionChecker({ fetchImpl: pageWindow.fetch && pageWindow.fetch.bind(pageWindow), url: UPDATE_SCRIPT_URL, timeoutMs: UPDATE_CHECK_TIMEOUT_MS, setTimeout: pageWindow.setTimeout && pageWindow.setTimeout.bind(pageWindow), clearTimeout: pageWindow.clearTimeout && pageWindow.clearTimeout.bind(pageWindow), AbortController: pageWindow.AbortController });
  const state = { itemDetails: null, conversionCache: new Map(), guildBuffDetails: null, guildBuffLevels: null, guildShrineLevels: null, guildShrineDetails: null, characterItems: null, itemNameCatalogLastRefresh: 0, itemNameCatalogReady: false, itemNameCatalogRetryCount: 0, upgradePlans: savedUiState.upgradePlans.map((plan, index) => ({ id: `plan-${index + 1}`, ...plan })), nextUpgradePlanId: savedUiState.upgradePlans.length + 1, suppressUpgradePlanAutofill: false, upgradePresetNotice: "", snapshot: null, priceReference: savedPriceReference(), targetCredit: savedUiState.targetCredit, panel: null, creditTab: null, hiddenSidebarNodes: [], refreshTimer: null, refreshInFlight: false, refreshQueued: false, panelSearchTimer: null, collapsedCreditSections: new Set(savedUiState.collapsedCreditSections), guildTokenValuesCollapsed: savedUiState.guildTokenValuesCollapsed, upgradeRefreshId: 0, exchangeAdvisorUi: null, exchangeAdvisorFrame: null, exchangeAdvisorForceRender: false, exchangeAdvisorRootObserver: null, exchangeAdvisorModalObserver: null, exchangeAdvisorObservedModal: null, exchangeAdvisorListenersInstalled: false, exchangeAdvisorLoadInFlight: false, exchangeAdvisorSnapshotFailed: false };

  function loadSavedPluginUiState() {
    const fallback = { collapsedCreditSections: [], guildTokenValuesCollapsed: false, targetCredit: 1, upgradePlans: [] };
    try {
      const raw = pageWindow.localStorage && pageWindow.localStorage.getItem(UI_STATE_STORAGE_KEY);
      if (!raw) return fallback;
      const stored = JSON.parse(raw);
      if (!stored || typeof stored !== "object") return fallback;
      const creditHrids = new Set(CREDIT_TYPES.map(([hrid]) => hrid));
      const collapsedCreditSections = Array.isArray(stored.collapsedCreditSections)
        ? Array.from(new Set(stored.collapsedCreditSections.filter((hrid) => creditHrids.has(hrid))))
        : [];
      const upgradePlans = Array.isArray(stored.upgradePlans)
        ? stored.upgradePlans
          .filter((plan) => plan && typeof plan.guildBuffHrid === "string" && Number.isSafeInteger(plan.startLevel) && Number.isSafeInteger(plan.targetLevel))
          .map((plan) => ({ guildBuffHrid: plan.guildBuffHrid, startLevel: plan.startLevel, targetLevel: plan.targetLevel }))
        : [];
      const targetCredit = Number(stored.targetCredit);
      return {
        collapsedCreditSections,
        guildTokenValuesCollapsed: stored.guildTokenValuesCollapsed === true,
        targetCredit: Number.isSafeInteger(targetCredit) && targetCredit > 0 ? targetCredit : 1,
        upgradePlans
      };
    } catch (_) {
      return fallback;
    }
  }

  function persistPluginUiState() {
    const upgradePlans = state.upgradePlans.map((plan) => ({
      guildBuffHrid: plan.guildBuffHrid,
      startLevel: plan.startLevel,
      targetLevel: plan.targetLevel
    }));
    try {
      pageWindow.localStorage && pageWindow.localStorage.setItem(UI_STATE_STORAGE_KEY, JSON.stringify({
        collapsedCreditSections: Array.from(state.collapsedCreditSections),
        guildTokenValuesCollapsed: state.guildTokenValuesCollapsed,
        targetCredit: state.targetCredit,
        upgradePlans
      }));
    } catch (_) {
      // Keep the current page state when browser storage is unavailable.
    }
  }

  function savedPriceReference() {
    try {
      const saved = pageWindow.localStorage && pageWindow.localStorage.getItem(PRICE_REFERENCE_STORAGE_KEY);
      return PRICE_REFERENCES[saved] ? saved : "a";
    } catch (_) {
      return "a";
    }
  }

  function setPriceReference(reference) {
    if (!PRICE_REFERENCES[reference]) return;
    state.priceReference = reference;
    try {
      pageWindow.localStorage && pageWindow.localStorage.setItem(PRICE_REFERENCE_STORAGE_KEY, reference);
    } catch (_) {
      // Keep the current page choice even when browser storage is unavailable.
    }
  }

  function ui() {
    return localizationApi.createLocalizer(currentGameLocale());
  }

  function t(key, values) {
    return ui().t(key, values);
  }

  function itemQuantity(value) {
    return ui().quantity("itemQuantity", value);
  }

  function creditQuantity(value) {
    return ui().quantity("creditQuantity", value);
  }

  function priceReference(reference) {
    const suffix = reference === "b" ? "B" : "A";
    return { label: t(`priceReference${suffix}`), title: t(`priceReference${suffix}Title`) };
  }

  function simpleItemName(itemHrid) {
    return String(itemHrid || t("unknownItem")).split("/").pop().replaceAll("_", " ");
  }

  function titleCase(value) {
    return String(value || "").replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function currentGameLocale() {
    try {
      return pageWindow.i18next && pageWindow.i18next.language || pageWindow.i18n && pageWindow.i18n.language || pageWindow.localStorage && pageWindow.localStorage.getItem("i18nextLng") || document.documentElement.lang || "zh-CN";
    } catch (_) {
      return document.documentElement.lang || "zh-CN";
    }
  }

  function refreshOfficialItemNameCatalog(force) {
    if (!force && state.itemNameCatalogReady) return;
    const now = Date.now();
    if (!force && now - state.itemNameCatalogLastRefresh < 3000) return;
    state.itemNameCatalogLastRefresh = now;
    itemNameCatalog.refresh();
    state.itemNameCatalogRetryCount += 1;
    const metadata = itemNameCatalog.metadata();
    state.itemNameCatalogReady = metadata.source === "window-i18n" || metadata.source === "react-provider" || state.itemNameCatalogRetryCount >= 5;
  }

  // This is the sole item-name resolver used by the UI. It never translates
  // names itself: zh-CN comes from the official game catalog or cached catalog,
  // and any unresolved item remains the game's original English name.
  function resolveItemName(itemHrid, englishFallback) {
    refreshOfficialItemNameCatalog();
    return itemNameCatalog.resolveItemName({ itemHrid, englishFallback, locale: currentGameLocale() });
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
  }

  function setItemDetails(candidate) {
    if (candidate && (Array.isArray(candidate) || typeof candidate === "object")) {
      if (state.itemDetails !== candidate) state.conversionCache.clear();
      state.itemDetails = candidate;
      return true;
    }
    return false;
  }

  function setGuildBuffDetails(candidate) {
    if (candidate && (Array.isArray(candidate) || typeof candidate === "object")) {
      state.guildBuffDetails = candidate;
      return true;
    }
    return false;
  }

  function setGuildBuffLevels(candidate) {
    if (candidate && (Array.isArray(candidate) || typeof candidate === "object")) {
      state.guildBuffLevels = candidate;
      return true;
    }
    return false;
  }

  function guildShrineLevelRecordKey(record, fallbackKey) {
    if (record && typeof record === "object") {
      const explicitKey = record.guildShrineHrid || record.shrineHrid || record.guildBuildingHrid || record.hrid;
      if (typeof explicitKey === "string" && explicitKey) return explicitKey;
    }
    return String(fallbackKey || "");
  }

  function mergeGuildShrineLevels(previous, incoming) {
    if (!incoming || typeof incoming !== "object") return previous;
    const merged = Object.create(null);
    const append = (source) => {
      const entries = Array.isArray(source)
        ? source.map((record, index) => [guildShrineLevelRecordKey(record, index), record])
        : Object.entries(source || {});
      for (const [fallbackKey, record] of entries) {
        const key = guildShrineLevelRecordKey(record, fallbackKey);
        if (key) merged[key] = record;
      }
    };
    append(previous);
    append(incoming);
    return merged;
  }

  function setGuildShrineLevels(candidate) {
    if (candidate && (Array.isArray(candidate) || typeof candidate === "object")) {
      state.guildShrineLevels = mergeGuildShrineLevels(state.guildShrineLevels, candidate);
      return true;
    }
    return false;
  }

  function setGuildShrineDetails(candidate) {
    if (candidate && (Array.isArray(candidate) || typeof candidate === "object")) {
      state.guildShrineDetails = mergeGuildShrineLevels(state.guildShrineDetails, candidate);
      return true;
    }
    return false;
  }

  function setCharacterItems(candidate) {
    if (Array.isArray(candidate)) {
      state.characterItems = candidate;
      return true;
    }
    return false;
  }

  function setGuildBuffLevelsFrom(source) {
    if (!source || typeof source !== "object") return false;
    return setGuildBuffLevels(
      source.characterGuildBuffMap || source.characterGuildBuffDict || source.characterGuildBuffs || source.characterGuildBuffLevelMap || source.characterGuildBuffLevelDict ||
      source.guildBuffLevelMap || source.guildBuffLevelDict || source.guildBuffLevels || source.guildBuffMap || source.guildBuffDict
    );
  }

  function setGuildShrineLevelsFrom(source) {
    if (!source || typeof source !== "object") return false;
    const candidates = [
      source.guildShrineMap, source.guildShrineDict, source.guildShrines,
      source.guildShrineLevelMap, source.guildShrineLevelDict, source.guildShrineLevels,
      source.guildBuildingMap, source.guildBuildingDict, source.guildBuildings,
      source.guildBuildingLevelMap, source.guildBuildingLevelDict, source.guildBuildingLevels
    ];
    let updated = false;
    for (const candidate of candidates) updated = setGuildShrineLevels(candidate) || updated;
    return updated;
  }

  function setGuildShrineDetailsFrom(source) {
    if (!source || typeof source !== "object") return false;
    const candidates = [
      source.guildShrineDetailMap, source.guildShrineDetailDict, source.guildShrineDetails,
      source.guildBuildingDetailMap, source.guildBuildingDetailDict, source.guildBuildingDetails
    ];
    let updated = false;
    for (const candidate of candidates) updated = setGuildShrineDetails(candidate) || updated;
    return updated;
  }

  // The game persists initClientData with LZString.compressToUTF16. Reading it
  // avoids depending on the timing of the one-time WebSocket initialization.
  function decompressFromUtf16(compressed) {
    if (compressed == null) return "";
    if (compressed === "") return null;
    const dictionary = [0, 1, 2];
    let next;
    let enlargeIn = 4;
    let dictionarySize = 4;
    let numBits = 3;
    let entry = "";
    const result = [];
    let dataValue = compressed.charCodeAt(0) - 32;
    let dataPosition = 16384;
    let dataIndex = 1;

    const readBits = (count) => {
      let value = 0;
      let bit = 1;
      for (let power = 1, maxPower = 1 << count; power !== maxPower; power <<= 1) {
        const residue = dataValue & dataPosition;
        dataPosition >>= 1;
        if (dataPosition === 0) {
          dataPosition = 16384;
          dataValue = dataIndex < compressed.length ? compressed.charCodeAt(dataIndex) - 32 : 0;
          dataIndex += 1;
        }
        if (residue > 0) value |= bit;
        bit <<= 1;
      }
      return value;
    };

    const firstToken = readBits(2);
    if (firstToken === 0) entry = String.fromCharCode(readBits(8));
    else if (firstToken === 1) entry = String.fromCharCode(readBits(16));
    else return "";

    dictionary[3] = entry;
    let previous = entry;
    result.push(entry);

    while (true) {
      if (dataIndex > compressed.length) return "";
      const token = readBits(numBits);
      if (token === 0) {
        dictionary[dictionarySize] = String.fromCharCode(readBits(8));
        dictionarySize += 1;
        enlargeIn -= 1;
        next = dictionarySize - 1;
      } else if (token === 1) {
        dictionary[dictionarySize] = String.fromCharCode(readBits(16));
        dictionarySize += 1;
        enlargeIn -= 1;
        next = dictionarySize - 1;
      } else if (token === 2) {
        return result.join("");
      } else {
        next = token;
      }

      if (enlargeIn === 0) {
        enlargeIn = 1 << numBits;
        numBits += 1;
      }
      if (dictionary[next]) entry = dictionary[next];
      else if (next === dictionarySize) entry = previous + previous.charAt(0);
      else return null;

      result.push(entry);
      dictionary[dictionarySize] = previous + entry.charAt(0);
      dictionarySize += 1;
      enlargeIn -= 1;
      previous = entry;

      if (enlargeIn === 0) {
        enlargeIn = 1 << numBits;
        numBits += 1;
      }
    }
  }

  function hydrateLocalInitData() {
    if (state.itemDetails && state.guildBuffDetails && state.guildBuffLevels && state.guildShrineLevels && state.characterItems) return true;
    let raw;
    try {
      raw = pageWindow.localStorage && pageWindow.localStorage.getItem("initClientData");
    } catch (_) {
      return false;
    }
    if (!raw) return false;
    try {
      const decoded = decompressFromUtf16(raw) || raw;
      const data = JSON.parse(decoded);
      // initClientData is a durable fallback and can outlive a game data update.
      // Never let it overwrite values already captured from the current session.
      const hasItems = !state.itemDetails && setItemDetails(data.itemDetailMap || data.itemDetailDict);
      const hasGuildBuffs = !state.guildBuffDetails && setGuildBuffDetails(data.guildBuffDetailMap || data.guildBuffDetailDict);
      const hasGuildBuffLevels = !state.guildBuffLevels && (setGuildBuffLevelsFrom(data) || setGuildBuffLevelsFrom(data.character));
      const hasGuildShrineLevels = !state.guildShrineLevels && (setGuildShrineLevelsFrom(data) || setGuildShrineLevelsFrom(data.guild));
      const hasGuildShrineDetails = !state.guildShrineDetails && (setGuildShrineDetailsFrom(data) || setGuildShrineDetailsFrom(data.guild));
      const hasCharacterItems = !state.characterItems && setCharacterItems(data.characterItems || data.character && data.character.items);
      return hasItems || hasGuildBuffs || hasGuildBuffLevels || hasGuildShrineLevels || hasGuildShrineDetails || hasCharacterItems;
    } catch (_) {
      return false;
    }
  }

  function extractItemDetailsFromReact() {
    if (state.itemDetails && state.guildBuffDetails && state.guildBuffLevels && state.guildShrineLevels && state.characterItems) return true;
    const roots = [document.getElementById("root"), document.body].filter(Boolean);
    const visited = new Set();
    const stack = [];
    for (const root of roots) {
      for (const key of Object.keys(root)) {
        if (key.startsWith("__reactFiber$") || key.startsWith("__reactContainer$") || key.startsWith("__reactInternalInstance$")) stack.push(root[key]);
      }
    }
    let scanned = 0;
    let found = false;
    while (stack.length && scanned < 6000) {
      const fiber = stack.pop();
      if (!fiber || typeof fiber !== "object" || visited.has(fiber)) continue;
      visited.add(fiber);
      scanned += 1;
      const stateValue = fiber.stateNode && fiber.stateNode.state;
      const candidates = [fiber.memoizedProps, fiber.pendingProps, stateValue, fiber.memoizedState];
      for (const candidate of candidates) {
        if (!candidate || typeof candidate !== "object") continue;
        found = setItemDetails(candidate.itemDetailMap || candidate.itemDetailDict) || found;
        found = setGuildBuffDetails(candidate.guildBuffDetailMap || candidate.guildBuffDetailDict) || found;
        found = setGuildBuffLevelsFrom(candidate) || found;
        found = setGuildShrineLevelsFrom(candidate) || found;
        found = setGuildShrineDetailsFrom(candidate) || found;
        found = setCharacterItems(candidate.characterItems) || found;
        if (state.itemDetails && state.guildBuffDetails && state.guildBuffLevels && state.guildShrineLevels && state.characterItems) return true;
      }
      // React 18 containers point at a FiberRoot whose active tree is .current.
      if (fiber.current) stack.push(fiber.current);
      if (fiber.stateNode && fiber.stateNode.current) stack.push(fiber.stateNode.current);
      if (fiber.child) stack.push(fiber.child);
      if (fiber.sibling) stack.push(fiber.sibling);
    }
    return found;
  }

  function scanMessage(value, depth) {
    if (!value || typeof value !== "object" || depth > 8) return;
    setItemDetails(value.itemDetailMap || value.itemDetailDict);
    setGuildBuffDetails(value.guildBuffDetailMap || value.guildBuffDetailDict);
    setGuildBuffLevelsFrom(value);
    setGuildShrineLevelsFrom(value);
    setGuildShrineDetailsFrom(value);
    setCharacterItems(value.characterItems);
    for (const child of Object.values(value)) scanMessage(child, depth + 1);
  }

  function hydrateBridgeData() {
    const bridge = pageWindow.__mwiGuildCreditBridge;
    if (!bridge || typeof bridge !== "object") return;
    setItemDetails(bridge.itemDetails);
    setGuildBuffDetails(bridge.guildBuffDetails);
    setGuildBuffLevelsFrom(bridge);
    setGuildShrineLevelsFrom(bridge);
    setGuildShrineDetailsFrom(bridge);
    setCharacterItems(bridge.characterItems);
    if (Array.isArray(bridge.messages)) {
      for (let index = bridge.messages.length - 1; index >= 0; index -= 1) {
        try {
          scanMessage(JSON.parse(bridge.messages[index]), 0);
        } catch (_) {
          // Ignore non-JSON protocol frames.
        }
      }
    }
  }

  async function loadSnapshot(force) {
    if (state.snapshot && !force) return state.snapshot;
    const response = await fetch("/game_data/marketplace.json", { cache: "no-store" });
    if (!response.ok) throw new Error(t("snapshotLoadFailed", { message: response.status }));
    state.snapshot = await response.json();
    return state.snapshot;
  }

  function snapshotOrderBook(itemHrid, reference = state.priceReference) {
    const price = snapshotPrice(itemHrid, reference);
    return price === null ? null : { asks: [{ price, quantity: Number.MAX_SAFE_INTEGER }] };
  }

  function snapshotPrice(itemHrid, field, enhancementLevel = 0) {
    return core.snapshotMarketPrice(state.snapshot, itemHrid, enhancementLevel, field);
  }

  function snapshotImmediateSellPrice(itemHrid, enhancementLevel = 0) {
    return snapshotPrice(itemHrid, "b", enhancementLevel);
  }

  function allConversions(creditItemHrid) {
    // Prefer data captured from this game session. The persisted init payload is
    // only a fallback, so a previous game version cannot misclassify conversions.
    hydrateBridgeData();
    extractItemDetailsFromReact();
    if (!state.itemDetails) hydrateLocalInitData();
    let conversions = state.conversionCache.get(creditItemHrid);
    if (!conversions) {
      conversions = core.conversionsFromItemDetails(state.itemDetails, creditItemHrid);
      state.conversionCache.set(creditItemHrid, conversions);
    }
    return conversions.map((conversion) => ({
      ...conversion,
      itemName: resolveItemName(conversion.itemHrid, conversion.itemName)
    }));
  }

  function itemSpriteHref(itemHrid) {
    const spriteUse = document.querySelector('use[href*="items_sprite"]');
    const href = spriteUse && spriteUse.getAttribute("href");
    if (!href || !href.includes("#")) return "";
    return `${href.slice(0, href.indexOf("#"))}#${String(itemHrid || "").split("/").pop()}`;
  }

  function iconMarkup(itemHrid, label) {
    const href = itemSpriteHref(itemHrid);
    if (!href) return '<span class="mwi-item-icon mwi-item-icon-fallback" aria-hidden="true"></span>';
    return `<svg class="mwi-item-icon" role="img" aria-label="${escapeHtml(label)}"><use href="${escapeHtml(href)}"></use></svg>`;
  }

  function marketItemIconMarkup(itemHrid, label, className = "") {
    const marketLabel = t("marketItem", { item: label });
    return `<button class="mwi-market-item-link ${escapeHtml(className)}" data-role="market-item-link" data-item-hrid="${escapeHtml(itemHrid)}" data-item-name="${escapeHtml(label)}" type="button" title="${escapeHtml(marketLabel)}" aria-label="${escapeHtml(marketLabel)}">${iconMarkup(itemHrid, label)}</button>`;
  }

  function marketplaceSearchInput() {
    return Array.from(document.querySelectorAll("input")).find((input) => {
      if (input.closest("#mwi-credit-optimizer")) return false;
      const text = `${input.getAttribute("placeholder") || ""} ${input.getAttribute("aria-label") || ""}`.toLowerCase();
      return text.includes("物品搜索") || text.includes("search") || text.includes("item");
    }) || null;
  }

  function openMarketplaceFallback(itemHrid, itemName) {
    const searchText = resolveItemName(itemHrid, itemName);
    const navigate = Array.from(document.querySelectorAll("button,[role='button'],a,div")).find((element) => {
      if (element.closest("#mwi-credit-optimizer")) return false;
      return ["市场", "Marketplace", "Market"].includes(String(element.textContent || "").trim());
    });
    if (navigate) navigate.click();
    let attempts = 0;
    const search = () => {
      const input = marketplaceSearchInput();
      if (!input && attempts++ < 20) {
        window.setTimeout(search, 80);
        return;
      }
      if (!input) return;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
      if (setter && setter.set) setter.set.call(input, searchText);
      else input.value = searchText;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      input.focus();
    };
    window.setTimeout(search, navigate ? 80 : 0);
  }

  function openMarketplaceForItem(itemHrid, itemName) {
    const bridge = pageWindow.__mwiGuildCreditBridge;
    try {
      // Our recommendation rows are unenhanced materials. Mirror the native
      // inventory action by explicitly using level 0 instead of leaving the
      // market order-book selection undefined.
      if (bridge && typeof bridge.goToMarketplace === "function" && bridge.goToMarketplace(itemHrid, 0)) return;
    } catch (_) {
      // Fall through to the compatibility path if the game changes its React internals.
    }
    openMarketplaceFallback(itemHrid, itemName);
  }

  function formatNumber(value, digits) {
    if (value === null || value === undefined || !Number.isFinite(value)) return "-";
    return ui().number(value, digits);
  }

  async function checkPluginUpdate(panel) {
    const status = panel.querySelector('[data-role="version-status"]');
    if (!status) return;
    status.textContent = t("updateChecking", { current: PLUGIN_VERSION });
    try {
      const latestVersion = await updateChecker.latestVersion();
      if (core.compareVersions(PLUGIN_VERSION, latestVersion) < 0) {
        status.classList.add("mwi-update-available");
        status.replaceChildren(t("updateAvailable", { current: PLUGIN_VERSION, latest: latestVersion }));
        const updateLink = document.createElement("a");
        updateLink.className = "mwi-update-link";
        updateLink.href = UPDATE_SCRIPT_URL;
        updateLink.target = "_blank";
        updateLink.rel = "noopener noreferrer";
        updateLink.textContent = t("updateNow");
        status.append(" · ", updateLink);
      } else {
        status.classList.remove("mwi-update-available");
        status.textContent = t("updateLatest", { current: PLUGIN_VERSION, latest: latestVersion });
      }
    } catch (_) {
      status.classList.remove("mwi-update-available");
      status.textContent = t("updateUnavailable", { current: PLUGIN_VERSION });
    }
  }

  function guildBuffEntries() {
    hydrateBridgeData();
    extractItemDetailsFromReact();
    hydrateLocalInitData();
    const details = Array.isArray(state.guildBuffDetails)
      ? state.guildBuffDetails.map((detail) => [detail && (detail.hrid || detail.guildBuffHrid), detail])
      : Object.entries(state.guildBuffDetails || {});
    return details
      .map(([hrid, detail]) => ({ hrid: detail && (detail.hrid || detail.guildBuffHrid) || hrid, detail }))
      .filter(({ hrid, detail }) => hrid && detail && detail.levelCosts)
      .map(({ hrid, detail }) => ({ hrid, detail, maxLevel: Array.isArray(detail.levelCosts) ? detail.levelCosts.length - 1 : Math.max(...Object.keys(detail.levelCosts).map(Number).filter(Number.isSafeInteger)) }))
      .filter(({ maxLevel }) => Number.isSafeInteger(maxLevel) && maxLevel > 0)
      .sort((left, right) => guildBuffLabel(left.detail, left.hrid).localeCompare(guildBuffLabel(right.detail, right.hrid), ui().locale));
  }

  function guildBuffLabel(detail, fallbackHrid) {
    const shrineKey = GUILD_SHRINE_NAME_KEYS[detail && detail.shrineHrid];
    const shrineName = shrineKey ? t(shrineKey) : titleCase(simpleItemName(detail && detail.shrineHrid || fallbackHrid));
    const domain = detail && detail.isCombat === true ? t("domainCombat") : detail && detail.isCombat === false ? t("domainLife") : "";
    return domain ? t("shrineWithDomain", { shrine: shrineName, domain }) : shrineName;
  }

  function itemNameForMaterial(itemHrid) {
    const details = Array.isArray(state.itemDetails)
      ? state.itemDetails.map((detail) => [detail && (detail.itemHrid || detail.hrid), detail])
      : Object.entries(state.itemDetails || {});
    const detail = details.find(([hrid]) => hrid === itemHrid);
    return resolveItemName(itemHrid, detail && detail[1] && detail[1].name);
  }

  function materialOrder(left, right) {
    if (left.itemHrid === "/items/guild_token") return -1;
    if (right.itemHrid === "/items/guild_token") return 1;
    const leftCredit = CREDIT_TYPES.findIndex(([hrid]) => hrid === left.itemHrid);
    const rightCredit = CREDIT_TYPES.findIndex(([hrid]) => hrid === right.itemHrid);
    if (leftCredit >= 0 && rightCredit >= 0) return leftCredit - rightCredit;
    if (leftCredit >= 0) return -1;
    if (rightCredit >= 0) return 1;
    return itemNameForMaterial(left.itemHrid).localeCompare(itemNameForMaterial(right.itemHrid), ui().locale);
  }

  function inventoryItemCounts() {
    hydrateBridgeData();
    extractItemDetailsFromReact();
    hydrateLocalInitData();
    const counts = Object.create(null);
    for (const item of state.characterItems || []) {
      if (!item || item.itemLocationHrid !== "/item_locations/inventory") continue;
      const count = Number(item.count);
      if (!item.itemHrid || !Number.isFinite(count) || count <= 0) continue;
      counts[item.itemHrid] = (counts[item.itemHrid] || 0) + count;
    }
    return counts;
  }

  function bestCreditConversions(targetCreditsByHrid) {
    return Object.fromEntries(CREDIT_TYPES.map(([creditItemHrid]) => {
      const targetCredits = targetCreditsByHrid ? Number(targetCreditsByHrid[creditItemHrid]) : 1;
      if (!Number.isSafeInteger(targetCredits) || targetCredits <= 0) return [creditItemHrid, null];
      const conversions = allConversions(creditItemHrid);
      const books = Object.fromEntries(conversions.map((conversion) => [conversion.itemHrid, snapshotOrderBook(conversion.itemHrid)]));
      return [creditItemHrid, core.rankConversions(conversions, books, targetCredits).find((row) => row.status === "ok") || null];
    }));
  }

  function bestCreditUnitCosts() {
    return Object.fromEntries(Object.entries(bestCreditConversions()).map(([creditItemHrid, best]) => [creditItemHrid, best ? best.costPerCredit : null]));
  }

  function bestCreditMaterialPlans(estimate) {
    const missingCredits = Object.fromEntries((estimate && estimate.rows || []).map((row) => [row.itemHrid, row.missing]));
    return bestCreditConversions(missingCredits);
  }

  function currentGuildBuffLevel(entry) {
    const stored = Array.isArray(state.guildBuffLevels)
      ? state.guildBuffLevels.find((value) => value && (value.guildBuffHrid || value.hrid) === entry.hrid)
      : state.guildBuffLevels && state.guildBuffLevels[entry.hrid];
    const value = stored && typeof stored === "object" ? stored.level ?? stored.currentLevel : stored;
    const level = Number(value);
    return Number.isSafeInteger(level) && level >= 0 ? Math.min(level, entry.maxLevel) : 0;
  }

  function shrineLevelValue(value) {
    const raw = value && typeof value === "object" ? value.level ?? value.currentLevel ?? value.guildBuildingLevel ?? value.buildingLevel : value;
    const level = Number(raw);
    return Number.isSafeInteger(level) && level >= 0 ? level : null;
  }

  function shrineIdentityValues(record, fallbackHrid) {
    const values = [fallbackHrid];
    if (!record || typeof record !== "object") return values;
    for (const key of ["guildShrineHrid", "shrineHrid", "guildBuildingHrid", "hrid", "id", "guildBuffHrid", "name", "displayName", "label"]) {
      if (typeof record[key] === "string") values.push(record[key]);
    }
    return values;
  }

  function guildShrineDetailFor(record, fallbackHrid) {
    const source = state.guildShrineDetails;
    const entries = Array.isArray(source)
      ? source.map((detail, index) => [guildShrineLevelRecordKey(detail, index), detail])
      : Object.entries(source || {});
    const identityValues = new Set(shrineIdentityValues(record, fallbackHrid));
    for (const [detailKey, detail] of entries) {
      const detailValues = shrineIdentityValues(detail, detailKey);
      if (detailValues.some((value) => identityValues.has(value))) return detail;
    }
    return null;
  }

  function shrineLevelRecordMatches(record, fallbackHrid, shrineHrid) {
    const shrineKey = String(shrineHrid || "").split("/").pop().toLowerCase();
    if (!shrineKey) return false;
    const detail = guildShrineDetailFor(record, fallbackHrid);
    const candidates = [...shrineIdentityValues(record, fallbackHrid), ...shrineIdentityValues(detail, "")]
      .filter((value) => typeof value === "string");
    return candidates.some((value) => {
      const normalized = value.toLowerCase();
      // Older and newer game payloads use both `tempo_shrine` and simply
      // `tempo` as guild-building IDs. This value is only inspected inside
      // the captured guild-shrine/building maps, so an exact HRID segment is
      // sufficient and avoids silently omitting valid shrine levels.
      return normalized === shrineHrid || new RegExp(`(^|[/_-])${shrineKey}([/_-]|$)`).test(normalized);
    });
  }

  function guildShrineLevelByHrid(shrineHrid) {
    const source = state.guildShrineLevels;
    const entries = Array.isArray(source)
      ? source.map((record) => [record && (record.guildShrineHrid || record.shrineHrid || record.guildBuildingHrid || record.hrid), record])
      : Object.entries(source || {});
    for (const [fallbackHrid, record] of entries) {
      if (!shrineLevelRecordMatches(record, fallbackHrid, shrineHrid)) continue;
      const level = shrineLevelValue(record);
      if (level !== null) return level;
    }
    // The game only includes built (non-zero) guild shrine buildings in this
    // map. Once a guild-building snapshot exists, a missing shrine is the
    // game's representation of level 0, not an unreadable level.
    return source ? 0 : null;
  }

  function guildShrineTargetLevels(entries) {
    const targets = Object.create(null);
    for (const entry of entries) {
      const shrineHrid = entry && entry.detail && entry.detail.shrineHrid;
      if (!shrineHrid || Object.hasOwn(targets, shrineHrid)) continue;
      const level = guildShrineLevelByHrid(shrineHrid);
      if (level !== null) targets[shrineHrid] = Math.min(level, entry.maxLevel);
    }
    return targets;
  }

  function isCombatGuildBuff(entry) {
    return entry && entry.detail && entry.detail.isCombat === true;
  }

  function applyGuildShrineTargets(entries, domain) {
    const combat = domain === "combat";
    const domainEntries = entries.filter((entry) => isCombatGuildBuff(entry) === combat);
    const targets = guildShrineTargetLevels(domainEntries);
    if (!domainEntries.length || domainEntries.some((entry) => !Object.hasOwn(targets, entry.detail.shrineHrid))) return false;
    const entriesByHrid = new Map(entries.map((entry) => [entry.hrid, entry]));
    const preservedPlans = state.upgradePlans.filter((plan) => {
      const entry = entriesByHrid.get(plan.guildBuffHrid);
      return !entry || isCombatGuildBuff(entry) !== combat;
    });
    const planned = domainEntries.map((entry) => {
      const startLevel = currentGuildBuffLevel(entry);
      const targetLevel = targets[entry.detail.shrineHrid];
      return targetLevel > startLevel ? { id: `plan-${state.nextUpgradePlanId++}`, guildBuffHrid: entry.hrid, startLevel, targetLevel } : null;
    }).filter(Boolean);
    state.upgradePlans = [...preservedPlans, ...planned];
    state.suppressUpgradePlanAutofill = true;
    const targetDomain = combat ? t("domainCombat") : t("domainLife");
    state.upgradePresetNotice = planned.length
      ? t("guildTargetApplied", { domain: targetDomain, count: formatNumber(planned.length) })
      : t("guildTargetComplete", { domain: targetDomain });
    return true;
  }

  function normalizeUpgradePlan(plan, entries) {
    const entry = entries.find((candidate) => candidate.hrid === plan.guildBuffHrid);
    if (!entry) return null;
    const currentLevel = currentGuildBuffLevel(entry);
    const rawStart = Number(plan.startLevel);
    const startLevel = Number.isSafeInteger(rawStart) && rawStart >= 0 && rawStart < entry.maxLevel ? rawStart : currentLevel;
    const rawTarget = Number(plan.targetLevel);
    const targetLevel = Number.isSafeInteger(rawTarget) && rawTarget > startLevel && rawTarget <= entry.maxLevel
      ? rawTarget
      : Math.min(startLevel + 1, entry.maxLevel);
    return { ...plan, guildBuffHrid: entry.hrid, startLevel, targetLevel };
  }

  function addGuildUpgradePlan(entries) {
    const plannedHrids = new Set(state.upgradePlans.map((plan) => plan.guildBuffHrid));
    const entry = entries.find((candidate) => !plannedHrids.has(candidate.hrid) && currentGuildBuffLevel(candidate) < candidate.maxLevel);
    if (!entry) return false;
    const startLevel = currentGuildBuffLevel(entry);
    state.upgradePlans.push({ id: `plan-${state.nextUpgradePlanId++}`, guildBuffHrid: entry.hrid, startLevel, targetLevel: startLevel + 1 });
    state.suppressUpgradePlanAutofill = false;
    state.upgradePresetNotice = "";
    return true;
  }

  function clearGuildUpgradePlans() {
    state.upgradePlans = [];
    // Keep the cleared state visible instead of immediately restoring the
    // default plan during the next refresh.
    state.suppressUpgradePlanAutofill = true;
    state.upgradePresetNotice = t("plansCleared");
  }

  function ensureGuildUpgradePlans(entries) {
    state.upgradePlans = state.upgradePlans.map((plan) => normalizeUpgradePlan(plan, entries)).filter(Boolean);
    if (!state.upgradePlans.length && !state.suppressUpgradePlanAutofill) addGuildUpgradePlan(entries);
    persistPluginUiState();
  }

  function levelOptionMarkup(start, end, selected) {
    return Array.from({ length: Math.max(end - start + 1, 0) }, (_, index) => start + index)
      .map((level) => `<option value="${level}" ${level === selected ? "selected" : ""}>${escapeHtml(t("level", { level: formatNumber(level) }))}</option>`).join("");
  }

  function updateGuildShrineTargetActions(panel, entries) {
    const targets = guildShrineTargetLevels(entries);
    const summaries = [];
    for (const domain of ["life", "combat"]) {
      const combat = domain === "combat";
      const domainEntries = entries.filter((entry) => isCombatGuildBuff(entry) === combat);
      const ready = domainEntries.length > 0 && domainEntries.every((entry) => Object.hasOwn(targets, entry.detail.shrineHrid));
      const missing = Array.from(new Set(domainEntries
        .filter((entry) => !Object.hasOwn(targets, entry.detail.shrineHrid))
        .map((entry) => {
          const nameKey = GUILD_SHRINE_NAME_KEYS[entry.detail.shrineHrid];
          return nameKey ? t(nameKey) : entry.detail.shrineHrid;
        })));
      const button = panel.querySelector(`[data-role="set-guild-shrine-target"][data-domain="${domain}"]`);
      if (button) {
        button.disabled = !ready;
        button.title = ready ? t("targetButtonReady") : t("targetButtonMissing", { missing: missing.join(ui().locale === "zh-CN" ? "、" : ", ") });
      }
      const count = Object.keys(targets).filter((shrineHrid) => domainEntries.some((entry) => entry.detail.shrineHrid === shrineHrid)).length;
      const missingText = missing.length ? t("targetSummaryMissing", { missing: missing.join(ui().locale === "zh-CN" ? "、" : ", ") }) : "";
      summaries.push(t("targetSummary", { domain: combat ? t("domainCombat") : t("domainLife"), count: formatNumber(count), total: formatNumber(domainEntries.length), missing: missingText }));
    }
    const status = panel.querySelector('[data-role="guild-shrine-target-status"]');
    if (status) status.textContent = state.guildShrineLevels ? t("shrineLevelsRead", { summaries: summaries.join(" · ") }) : t("shrineLevelsReading");
  }

  function renderGuildUpgradePlans(panel, entries) {
    const list = panel.querySelector('[data-role="upgrade-plan-list"]');
    const plannedHrids = new Set(state.upgradePlans.map((plan) => plan.guildBuffHrid));
    list.innerHTML = state.upgradePlans.map((plan) => {
      const entry = entries.find((candidate) => candidate.hrid === plan.guildBuffHrid);
      if (!entry) return "";
      const buffOptions = entries.map((candidate) => `<option value="${escapeHtml(candidate.hrid)}" ${candidate.hrid === plan.guildBuffHrid ? "selected" : ""} ${candidate.hrid !== plan.guildBuffHrid && (plannedHrids.has(candidate.hrid) || currentGuildBuffLevel(candidate) >= candidate.maxLevel) ? "disabled" : ""}>${escapeHtml(guildBuffLabel(candidate.detail, candidate.hrid))}</option>`).join("");
      return `<div class="mwi-upgrade-plan" data-plan-id="${escapeHtml(plan.id)}">
        <label>${escapeHtml(t("shrine"))}<select data-role="plan-buff">${buffOptions}</select></label>
        <label>${escapeHtml(t("startLevel"))}<select data-role="plan-start">${levelOptionMarkup(0, entry.maxLevel - 1, plan.startLevel)}</select></label>
        <label>${escapeHtml(t("targetLevel"))}<select data-role="plan-target">${levelOptionMarkup(plan.startLevel + 1, entry.maxLevel, plan.targetLevel)}</select></label>
        <button class="mwi-remove-plan" data-role="remove-plan" type="button" title="${escapeHtml(t("removePlan"))}" aria-label="${escapeHtml(t("removePlan"))}">×</button>
      </div>`;
    }).join("");
    updateGuildShrineTargetActions(panel, entries);
  }

  function renderUpgradeCostText(gold, guildTokens) {
    const parts = [`${core.formatCompactCost(gold)} ${t("gold")}`];
    if (guildTokens > 0) parts.push(`${formatNumber(guildTokens)} ${t("guildTokens")}`);
    return parts.join(" + ");
  }

  function renderUpgradeCostSummary(estimate, hasInventory) {
    if (!estimate) return `<div class="mwi-upgrade-cost-summary mwi-upgrade-cost-unavailable">${escapeHtml(t("noSnapshotEstimate"))}</div>`;
    const partial = estimate.status !== "ok";
    const missingNames = estimate.unpricedItemHrids.map(itemNameForMaterial).join(ui().locale === "zh-CN" ? "、" : ", ");
    const totalLabel = partial ? t("partialEstimatedCost") : t("estimatedTotalCost");
    const missingLabel = partial ? t("partialAfterInventory") : t("afterInventory");
    const inventoryNote = hasInventory ? "" : `<div class="mwi-upgrade-cost-note">${escapeHtml(t("inventoryUnavailable"))}</div>`;
    const priceNote = partial ? `<div class="mwi-upgrade-cost-note">${escapeHtml(t("noCreditPrice", { items: missingNames }))}</div>` : "";
    return `<section class="mwi-upgrade-cost-summary"><div class="mwi-upgrade-cost-title">${escapeHtml(t("costSummary"))}</div><div><span>${escapeHtml(totalLabel)}</span><strong>${renderUpgradeCostText(estimate.totalGold, estimate.guildTokensRequired)}</strong></div><div><span>${escapeHtml(missingLabel)}</span><strong>${renderUpgradeCostText(estimate.missingGold, estimate.guildTokensMissing)}</strong></div>${inventoryNote}${priceNote}</section>`;
  }

  function renderMaterialTotals(results, totals, estimate, hasInventory, creditMaterialPlans, materialInventory) {
    const planSummary = results.map((plan) => {
      const entry = guildBuffEntries().find((candidate) => candidate.hrid === plan.guildBuffHrid);
      const label = entry ? guildBuffLabel(entry.detail, entry.hrid) : plan.guildBuffHrid;
      return `<span>${escapeHtml(label)} ${plan.startLevel} -> ${plan.targetLevel}</span>`;
    }).join(`<span class="mwi-plan-separator">${ui().locale === "zh-CN" ? "，" : ", "}</span>`);
    const estimateRows = Object.fromEntries((estimate && estimate.rows || []).map((row) => [row.itemHrid, row]));
    const materials = [...totals].sort(materialOrder).map((item) => {
      const row = estimateRows[item.itemHrid];
      const inventoryText = row ? t("inventoryAndMissing", { owned: formatNumber(row.owned), missing: formatNumber(row.missing) }) : t("inventoryNotRead");
      const credit = CREDIT_TYPES.find(([creditItemHrid]) => creditItemHrid === item.itemHrid);
      const isGuildCredit = Boolean(credit);
      const plan = creditMaterialPlans && creditMaterialPlans[item.itemHrid];
      const accent = credit ? credit[1] : item.itemHrid === "/items/guild_token" ? "#e65d68" : "#7778b4";
      const conversionMarkup = row && row.missing > 0 && isGuildCredit
        ? plan
          ? `<div class="mwi-material-plan-item"><span class="mwi-material-plan-icon">${marketItemIconMarkup(plan.itemHrid, itemNameForMaterial(plan.itemHrid))}</span><span><b>${escapeHtml(itemNameForMaterial(plan.itemHrid))}</b><small>${escapeHtml(t("backpackInventory", { count: hasInventory ? formatNumber(Number(materialInventory && materialInventory[plan.itemHrid]) || 0) : t("notRead") }))}</small></span></div><div class="mwi-material-plan-need"><small>${escapeHtml(t("optimalExchangeNeeds"))}</small><strong>${formatNumber(plan.requiredItems)}</strong></div><span class="mwi-material-plan-rate">${escapeHtml(t("exchangeRate", { items: itemQuantity(plan.itemCount), credits: creditQuantity(plan.creditCount) }))}</span>`
          : `<div class="mwi-material-plan-unavailable">${escapeHtml(t("optimalExchangeUnavailable"))}</div>`
        : "";
      const rowClass = item.itemHrid === "/items/guild_token" ? " mwi-material-row-token" : "";
      return `<article class="mwi-material-row${rowClass}" style="--mwi-material-accent:${accent}"><div class="mwi-material-credit">${marketItemIconMarkup(item.itemHrid, itemNameForMaterial(item.itemHrid))}<span class="mwi-material-copy"><span class="mwi-material-name">${escapeHtml(itemNameForMaterial(item.itemHrid))}</span><small>${escapeHtml(hasInventory ? inventoryText : t("inventoryNotRead"))}</small></span></div><div class="mwi-material-required"><small>${escapeHtml(t("requiredThisTime"))}</small><strong>${formatNumber(item.count)}</strong></div>${conversionMarkup ? `<div class="mwi-material-plan">${conversionMarkup}</div>` : ""}</article>`;
    }).join("");
    return `<div class="mwi-plan-summary">${planSummary}</div>${renderUpgradeCostSummary(estimate, hasInventory)}<div class="mwi-material-list">${materials}</div>`;
  }

  async function refreshGuildUpgrade(panel) {
    const refreshId = ++state.upgradeRefreshId;
    refreshOfficialItemNameCatalog();
    const status = panel.querySelector('[data-role="upgrade-status"]');
    const results = panel.querySelector('[data-role="upgrade-results"]');
    const entries = guildBuffEntries();
    if (!entries.length) {
      status.textContent = t("noGuildRules");
      results.replaceChildren();
      return;
    }
    ensureGuildUpgradePlans(entries);
    renderGuildUpgradePlans(panel, entries);
    if (!state.upgradePlans.length) {
      status.textContent = state.upgradePresetNotice || t("allBuffsMaxed");
      results.innerHTML = `<div class="mwi-empty">${escapeHtml(state.upgradePresetNotice || t("noUpgradeMaterials"))}</div>`;
      return;
    }

    const result = core.aggregateGuildBuffPlans(state.upgradePlans.map((plan) => {
      const entry = entries.find((candidate) => candidate.hrid === plan.guildBuffHrid);
      return { ...plan, levelCosts: entry && entry.detail.levelCosts };
    }));
    if (result.status !== "ok") {
      const failed = result.result || {};
      status.textContent = failed.status === "missing_cost" ? t("missingLevelCost", { level: formatNumber(failed.missingLevel) }) : t("invalidLevels");
      results.replaceChildren();
      return;
    }
    let estimate = null;
    let creditMaterialPlans = null;
    let materialInventory = null;
    let snapshotFailed = false;
    try {
      await loadSnapshot(false);
      if (refreshId !== state.upgradeRefreshId) return;
      materialInventory = inventoryItemCounts();
      estimate = core.estimateGuildUpgradeCosts(result.totals, bestCreditUnitCosts(), materialInventory);
      creditMaterialPlans = bestCreditMaterialPlans(estimate);
    } catch (_) {
      snapshotFailed = true;
    }
    if (refreshId !== state.upgradeRefreshId) return;
    const hasInventory = Array.isArray(state.characterItems);
    const notices = [state.upgradePresetNotice || (state.guildBuffLevels ? t("mergedUpgradePlans", { count: formatNumber(result.plans.length) }) : t("unknownCurrentLevels"))];
    if (snapshotFailed) notices.push(t("snapshotFailed"));
    if (!hasInventory) notices.push(t("inventoryUnavailable"));
    status.textContent = notices.join(" ");
    results.innerHTML = renderMaterialTotals(result.plans, result.totals, estimate, hasInventory, creditMaterialPlans, materialInventory);
  }

  function setPanelView(panel, view) {
    const creditView = panel.querySelector('[data-role="credit-view"]');
    const upgradeView = panel.querySelector('[data-role="upgrade-view"]');
    const creditTab = panel.querySelector('[data-role="view-credit"]');
    const upgradeTab = panel.querySelector('[data-role="view-upgrade"]');
    const showUpgrade = view === "upgrade";
    creditView.hidden = showUpgrade;
    upgradeView.hidden = !showUpgrade;
    creditTab.setAttribute("aria-selected", String(!showUpgrade));
    upgradeTab.setAttribute("aria-selected", String(showUpgrade));
    creditTab.classList.toggle("mwi-view-tab-active", !showUpgrade);
    upgradeTab.classList.toggle("mwi-view-tab-active", showUpgrade);
    panel.dataset.activeView = showUpgrade ? "upgrade" : "credit";
    if (showUpgrade) refreshGuildUpgrade(panel);
    else refreshPanel(panel);
  }

  function updatePriceReferenceButtons(panel) {
    for (const button of panel.querySelectorAll('[data-role="price-reference"]')) {
      const active = button.dataset.priceReference === state.priceReference;
      button.dataset.active = String(active);
      button.setAttribute("aria-pressed", String(active));
    }
  }

  function createPanel() {
    const panel = document.createElement("section");
    panel.id = "mwi-credit-optimizer";
    panel.innerHTML = `
      <style>
        #mwi-credit-optimizer{position:relative;z-index:20;flex:1;min-width:0;min-height:0;height:100%;overflow-y:auto;overflow-x:hidden;margin:0;padding:12px;background:transparent;color:#f4f5ff;font:14px system-ui,sans-serif;container-type:inline-size}
        #mwi-credit-optimizer[hidden]{display:none} [data-mwi-credit-tab="true"]{user-select:none;pointer-events:auto!important;cursor:pointer!important}
        #mwi-credit-optimizer *{box-sizing:border-box} #mwi-credit-optimizer h3{margin:0 0 5px;font-size:17px}#mwi-credit-optimizer .mwi-plugin-version{margin:0 0 10px;padding:5px 7px;border:1px solid #474969;border-radius:4px;background:#292a46;color:#c9cbeb;font-size:11px;line-height:1.4}.mwi-plugin-version.mwi-update-available{border-color:#d8a33c;background:#463a21;color:#ffe09a;font-weight:700}
        #mwi-credit-optimizer .mwi-view-tabs{display:flex;border-bottom:1px solid #474969;margin:0 0 10px}.mwi-view-tab{min-height:30px!important;border-radius:0!important;background:transparent!important;color:#c9cbeb!important;padding:5px 10px!important}.mwi-view-tab-active{border-bottom:2px solid #43c4ad!important;color:#fff!important}
        #mwi-credit-optimizer .mwi-controls{display:flex;gap:8px;align-items:end;flex-wrap:wrap} #mwi-credit-optimizer label{display:grid;gap:4px;color:#d8d8e8}#mwi-credit-optimizer .mwi-price-reference{display:flex;align-items:center;gap:0;border:1px solid #5b5d7b;border-radius:4px;overflow:hidden;background:#292a46}#mwi-credit-optimizer .mwi-price-reference-label{padding:0 7px;color:#c9cbeb;font-size:11px;white-space:nowrap}#mwi-credit-optimizer .mwi-price-reference button{min-height:30px;border-radius:0;background:#353653;color:#c9cbeb;padding:5px 9px}#mwi-credit-optimizer .mwi-price-reference button+button{border-left:1px solid #5b5d7b}#mwi-credit-optimizer .mwi-price-reference button[data-active="true"]{background:#43c4ad;color:#10201f}
        #mwi-credit-optimizer input,#mwi-credit-optimizer select{width:112px;min-height:32px;border:1px solid #7778b4;border-radius:4px;padding:4px 8px;background:#f1f2ff;color:#1f2030;font:inherit}
        #mwi-credit-optimizer button{min-height:32px;border:0;border-radius:4px;padding:5px 12px;background:#43c4ad;color:#10201f;font-weight:700;cursor:pointer}
        #mwi-credit-optimizer button:disabled{opacity:.55;cursor:wait} #mwi-credit-optimizer .mwi-status{margin:10px 0;color:#c9cbeb}
        #mwi-credit-optimizer .mwi-credit-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:10px}
        #mwi-credit-optimizer .mwi-credit-section{min-width:0;border:1px solid #474969;border-top:3px solid var(--mwi-credit-color);border-radius:6px;background:#292a46;overflow:hidden}#mwi-credit-optimizer .mwi-credit-body[hidden],#mwi-credit-optimizer .mwi-token-value-body[hidden]{display:none!important}
        #mwi-credit-optimizer .mwi-credit-heading{display:flex;align-items:center;gap:7px;width:100%;min-height:0!important;border:0;border-radius:0;background:transparent!important;color:#fff!important;padding:8px 9px 6px!important;font:inherit;text-align:left;font-size:13px;font-weight:700;cursor:pointer}.mwi-credit-heading:hover{background:#303151!important}.mwi-credit-heading .mwi-collapse-icon{margin-left:auto;color:#c9cbeb;font-size:15px;line-height:1}
        #mwi-credit-optimizer .mwi-credit-heading .mwi-item-icon{width:22px;height:22px;flex:0 0 22px}.mwi-credit-section table{width:100%;border-collapse:collapse;font-size:11px}
        #mwi-credit-optimizer th,#mwi-credit-optimizer td{padding:5px 6px;border-top:1px solid #474969;text-align:right;white-space:nowrap}
        #mwi-credit-optimizer th:first-child,#mwi-credit-optimizer td:first-child{text-align:left} #mwi-credit-optimizer th{color:#bfc2de;font-weight:600}
        #mwi-credit-optimizer .mwi-item{display:flex;align-items:center;gap:5px;min-width:0}.mwi-item-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        #mwi-credit-optimizer .mwi-item-icon{display:inline-block;width:24px;height:24px;flex:0 0 24px;vertical-align:middle}.mwi-item-icon-fallback{border-radius:4px;background:#45476b}#mwi-credit-optimizer .mwi-market-item-link{display:inline-grid;place-items:center;flex:0 0 24px;width:24px;min-width:24px;height:24px;min-height:24px!important;padding:0!important;border:1px solid transparent!important;border-radius:5px!important;background:transparent!important;color:inherit!important;line-height:1;cursor:pointer}#mwi-credit-optimizer .mwi-market-item-link:hover,#mwi-credit-optimizer .mwi-market-item-link:focus-visible{border-color:#77f3d0!important;background:#2d6159!important;outline:none;box-shadow:0 0 0 2px #77f3d033}#mwi-credit-optimizer .mwi-market-item-link .mwi-item-icon{display:block}
        #mwi-credit-optimizer .mwi-cost{color:#77f3d0;font-weight:700} #mwi-credit-optimizer .mwi-empty{padding:8px;color:#ffd17c;font-size:12px}#mwi-credit-optimizer .mwi-token-value-section{margin:10px 0;border:1px solid #3a7b70;border-top:3px solid #43c4ad;border-radius:6px;background:#203b3a;overflow:hidden}#mwi-credit-optimizer .mwi-token-value-heading{border-bottom:1px solid #3a7b70}#mwi-credit-optimizer .mwi-token-value-heading .mwi-item-icon{width:22px;height:22px;flex:0 0 22px}#mwi-credit-optimizer .mwi-token-value-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:0}#mwi-credit-optimizer .mwi-token-value-row{display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:center;gap:8px;min-width:0;padding:8px;border-top:1px solid #315d58}#mwi-credit-optimizer .mwi-token-value-row .mwi-item-icon{width:21px;height:21px;flex:0 0 21px}#mwi-credit-optimizer .mwi-token-value-exchange{color:#d7f6ef;font-size:11px;white-space:nowrap}#mwi-credit-optimizer .mwi-token-value-row .mwi-cost{font-size:12px;white-space:nowrap}#mwi-credit-optimizer .mwi-token-value-unpriced{color:#ffd17c;font-size:11px;white-space:nowrap}
        #mwi-credit-optimizer .mwi-upgrade-preset{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;margin:0 0 12px;padding:10px 11px;border:1px solid #3b8478;border-radius:9px;background:linear-gradient(135deg,#1f403d,#202f48);box-shadow:0 4px 14px #101d1c55}#mwi-credit-optimizer .mwi-upgrade-preset-copy{display:grid;gap:3px;min-width:0}#mwi-credit-optimizer .mwi-upgrade-preset-copy strong{color:#dffaf4;font-size:12px}#mwi-credit-optimizer .mwi-upgrade-preset-copy small{color:#abd5cd;font-size:10px;line-height:1.35}#mwi-credit-optimizer .mwi-upgrade-preset-buttons{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:7px}#mwi-credit-optimizer .mwi-upgrade-preset-buttons button{min-height:29px!important;padding:5px 8px!important;font-size:11px;white-space:nowrap;background:#43c4ad!important;color:#10201f!important}#mwi-credit-optimizer .mwi-upgrade-preset-buttons button[data-domain="combat"]{background:#6ea9ff!important;color:#15233f!important}#mwi-credit-optimizer .mwi-upgrade-preset-buttons button:disabled{background:#4d5968!important;color:#bec4ce!important;cursor:not-allowed}
        @container (max-width:960px){#mwi-credit-optimizer .mwi-upgrade-preset{grid-template-columns:minmax(0,1fr);align-items:stretch}#mwi-credit-optimizer .mwi-upgrade-preset-buttons{justify-content:stretch}#mwi-credit-optimizer .mwi-upgrade-preset-buttons button{flex:1 1 280px;min-width:0}}@container (max-width:620px){#mwi-credit-optimizer .mwi-upgrade-preset-buttons{display:grid;grid-template-columns:minmax(0,1fr)}#mwi-credit-optimizer .mwi-upgrade-preset-buttons button{width:100%}}
        #mwi-credit-optimizer .mwi-upgrade-plan-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:10px}#mwi-credit-optimizer .mwi-upgrade-plan{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) 36px;gap:9px;align-items:end;padding:11px;border:1px solid #45486d;border-radius:8px;background:linear-gradient(135deg,#2c2e4d,#252640);box-shadow:0 4px 13px #13142555}#mwi-credit-optimizer .mwi-upgrade-plan label{min-width:0;text-align:left;justify-items:stretch;font-size:12px}#mwi-credit-optimizer .mwi-upgrade-plan label:first-child{grid-column:1/-1;grid-row:1}#mwi-credit-optimizer .mwi-upgrade-plan label:nth-child(2){grid-column:1;grid-row:2}#mwi-credit-optimizer .mwi-upgrade-plan label:nth-child(3){grid-column:2;grid-row:2}#mwi-credit-optimizer .mwi-upgrade-plan select{width:100%!important;max-width:none;min-width:0}#mwi-credit-optimizer .mwi-remove-plan{grid-column:3;grid-row:2;width:36px;min-width:36px;padding:0!important;font-size:21px;line-height:1;background:#555773!important;color:#fff!important}#mwi-credit-optimizer .mwi-upgrade-actions{display:flex;justify-content:center;gap:9px;margin:12px 0 4px}#mwi-credit-optimizer .mwi-clear-upgrade-plans{background:#a04455!important;color:#fff!important}#mwi-credit-optimizer .mwi-clear-upgrade-plans:hover{background:#bd4d61!important}
        #mwi-credit-optimizer .mwi-material-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:12px}.mwi-material-row{position:relative;align-self:start;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;padding:11px;border:1px solid #45486d;border-left:3px solid var(--mwi-material-accent);border-radius:8px;background:linear-gradient(135deg,#292b48,#23243d);box-shadow:0 4px 13px #13142544}.mwi-material-row-token{grid-column:1/-1;min-height:0;padding:9px 11px;background:linear-gradient(135deg,#2b2c49,#24253f)}.mwi-material-credit{display:flex;align-items:center;gap:8px;min-width:0}.mwi-material-copy{min-width:0;display:grid;gap:2px}.mwi-material-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#f4f5ff;font-weight:700}.mwi-material-copy small{color:#aeb1d3;font-size:11px}.mwi-material-required{display:grid;justify-items:end;align-content:center;gap:1px;text-align:right}.mwi-material-required small{color:#aeb1d3;font-size:10px}.mwi-material-required strong{color:#77f3d0;font-size:18px;line-height:1.1}.mwi-material-plan{grid-column:1/-1;display:grid;grid-template-columns:minmax(0,1fr) auto;grid-template-rows:auto auto;align-items:center;column-gap:10px;border:1px solid #356c63;border-radius:7px;background:linear-gradient(135deg,#1f3e3c,#1d3736);overflow:hidden}.mwi-material-plan-item{grid-row:1/-1;display:flex;align-items:center;gap:10px;min-width:0;padding:8px 0 8px 8px}.mwi-material-plan-icon{display:grid!important;place-items:center;flex:0 0 52px!important;width:52px!important;height:52px!important;min-width:52px!important;padding:0!important;border:1px solid #4da496;border-radius:7px;background:linear-gradient(135deg,#306b62,#275a53);box-shadow:inset 0 1px #7bd8c822,0 2px 5px #10232166}.mwi-material-plan-icon .mwi-market-item-link{width:50px!important;height:50px!important;min-width:50px!important;min-height:50px!important;border:0!important;border-radius:7px!important}.mwi-material-plan-icon .mwi-item-icon{width:50px!important;height:50px!important;flex:0 0 50px!important;max-width:50px;max-height:50px;object-fit:contain}.mwi-material-plan-item>span:last-child{min-width:0;display:grid;gap:3px}.mwi-material-plan-item b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#e3fbf5;font-size:14px;line-height:1.15}.mwi-material-plan-item small{color:#afd4cd;font-size:12px;line-height:1.15}.mwi-material-plan-need{display:grid;justify-items:end;gap:1px;padding:8px 9px 0 0}.mwi-material-plan-need small{color:#afd4cd;font-size:10px}.mwi-material-plan-need strong{color:#77f3d0;font-size:17px;line-height:1}.mwi-material-plan-rate{grid-column:2;align-self:end;padding:0 9px 9px 0;color:#c5e3dd;font-size:10px;text-align:right;white-space:nowrap}.mwi-material-plan-unavailable{color:#ffd17c;font-size:11px}.mwi-plan-summary{display:flex;flex-wrap:wrap;justify-content:center;gap:5px;margin:12px 0 8px;color:#d7d9ed;font-size:12px}.mwi-plan-summary span:not(.mwi-plan-separator){padding:4px 7px;border:1px solid #45486d;border-radius:999px;background:#292a46}.mwi-plan-separator{display:none}.mwi-upgrade-cost-summary{display:grid;gap:7px;margin:8px 0 10px;padding:11px 12px;border:1px solid #3d8d80;border-radius:8px;background:linear-gradient(135deg,#1d3d3b,#203b3a);box-shadow:0 5px 14px #101d1c55}.mwi-upgrade-cost-title{color:#b7e6dc;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}.mwi-upgrade-cost-summary>div:not(.mwi-upgrade-cost-note):not(.mwi-upgrade-cost-title){display:flex;justify-content:space-between;gap:8px;align-items:baseline}.mwi-upgrade-cost-summary span{color:#d7f6ef}.mwi-upgrade-cost-summary strong{color:#77f3d0;font-size:15px;text-align:right}.mwi-upgrade-cost-note{color:#ffd17c;font-size:11px}.mwi-upgrade-cost-unavailable{color:#ffd17c;border-color:#80663f;background:#3b3323}.mwi-plugin-version .mwi-update-link,#mwi-credit-optimizer .mwi-plugin-footer a{color:#fff;text-decoration:underline;text-underline-offset:2px}.mwi-plugin-version .mwi-update-link:hover,#mwi-credit-optimizer .mwi-plugin-footer a:hover{color:#77f3d0}.mwi-plugin-footer{margin-top:16px;padding:10px 4px 2px;border-top:1px solid #474969;color:#aeb1d3;font-size:12px;line-height:1.6;text-align:center}
        @container (max-width:760px){#mwi-credit-optimizer .mwi-material-list{grid-template-columns:minmax(0,1fr)}#mwi-credit-optimizer .mwi-material-row-token{grid-column:auto}}@container (max-width:460px){#mwi-credit-optimizer .mwi-material-row{grid-template-columns:minmax(0,1fr)}#mwi-credit-optimizer .mwi-material-required{justify-items:start;text-align:left}#mwi-credit-optimizer .mwi-material-plan{grid-template-columns:minmax(0,1fr);grid-template-rows:auto}#mwi-credit-optimizer .mwi-material-plan-item{grid-row:auto}#mwi-credit-optimizer .mwi-material-plan-need{justify-items:start;grid-column:1;padding:0 9px 4px}#mwi-credit-optimizer .mwi-material-plan-rate{grid-column:1;padding:0 9px 9px;text-align:left}}
        @media (max-width:720px){#mwi-credit-optimizer .mwi-material-list{grid-template-columns:1fr}.mwi-material-row-token{grid-column:auto}}@media (max-width:430px){#mwi-credit-optimizer .mwi-credit-grid{grid-template-columns:1fr}.mwi-material-plan{grid-template-columns:minmax(0,1fr);grid-template-rows:auto}.mwi-material-plan-item{grid-row:auto}.mwi-material-plan-need{justify-items:start;grid-column:1;padding:0 9px 4px}.mwi-material-plan-rate{grid-column:1;padding:0 9px 9px;text-align:left}}
      </style>
      <h3>${escapeHtml(t("panelTitle"))}</h3>
      <div class="mwi-plugin-version" data-role="version-status" aria-live="polite"></div>
      <div class="mwi-view-tabs" role="tablist">
        <button class="mwi-view-tab mwi-view-tab-active" data-role="view-credit" role="tab" aria-selected="true" type="button">${escapeHtml(t("creditValue"))}</button>
        <button class="mwi-view-tab" data-role="view-upgrade" role="tab" aria-selected="false" type="button">${escapeHtml(t("shrineUpgrade"))}</button>
      </div>
      <div data-role="credit-view">
        <div class="mwi-controls">
          <label>${escapeHtml(t("targetCredits"))}<input data-role="target" type="number" min="1" step="1" value="${state.targetCredit}"></label>
          <div class="mwi-price-reference" role="group" aria-label="${escapeHtml(t("marketReference"))}"><span class="mwi-price-reference-label">${escapeHtml(t("priceReference"))}</span><button data-role="price-reference" data-price-reference="a" type="button" title="${escapeHtml(priceReference("a").title)}">${escapeHtml(priceReference("a").label)}</button><button data-role="price-reference" data-price-reference="b" type="button" title="${escapeHtml(priceReference("b").title)}">${escapeHtml(priceReference("b").label)}</button></div>
          <button data-role="refresh" type="button">${escapeHtml(t("refreshEstimate"))}</button>
        </div>
        <div class="mwi-status" data-role="status">${escapeHtml(t("waitingExchangeRules"))}</div>
        <div data-role="results"></div>
      </div>
      <div data-role="upgrade-view" hidden>
        <section class="mwi-upgrade-preset" aria-label="${escapeHtml(t("guildShrineBatchPlan"))}">
          <div class="mwi-upgrade-preset-copy"><strong>${escapeHtml(t("guildShrineBatchPlan"))}</strong><small data-role="guild-shrine-target-status">${escapeHtml(t("shrineLevelsReading"))}</small></div>
          <div class="mwi-upgrade-preset-buttons"><button data-role="set-guild-shrine-target" data-domain="life" type="button">${escapeHtml(t("setGuildLifeTarget"))}</button><button data-role="set-guild-shrine-target" data-domain="combat" type="button">${escapeHtml(t("setGuildCombatTarget"))}</button></div>
        </section>
        <div class="mwi-upgrade-plan-list" data-role="upgrade-plan-list"></div>
        <div class="mwi-upgrade-actions"><button data-role="add-upgrade-plan" type="button">${escapeHtml(t("addShrine"))}</button><button class="mwi-clear-upgrade-plans" data-role="clear-upgrade-plans" type="button">${escapeHtml(t("clearAll"))}</button></div>
        <div class="mwi-status" data-role="upgrade-status">${escapeHtml(t("waitingUpgradeRules"))}</div>
        <div data-role="upgrade-results"></div>
      </div>
      <footer class="mwi-plugin-footer">${escapeHtml(t("author"))}<br>${escapeHtml(t("support"))}<br><a href="${escapeHtml(FALLBACK_INSTALL_URL)}" target="_blank" rel="noopener noreferrer">${escapeHtml(t("fallbackInstaller"))}</a></footer>`;
    panel.querySelector('[data-role="refresh"]').addEventListener("click", () => refreshPanel(panel, true));
    panel.querySelector('[data-role="target"]').addEventListener("change", (event) => {
      const target = Number(event.target.value);
      if (Number.isSafeInteger(target) && target > 0) state.targetCredit = target;
      else event.target.value = String(state.targetCredit);
      persistPluginUiState();
      refreshPanel(panel);
    });
    panel.querySelector('.mwi-price-reference').addEventListener("click", (event) => {
      const button = event.target.closest('[data-role="price-reference"]');
      if (!button || button.dataset.priceReference === state.priceReference) return;
      setPriceReference(button.dataset.priceReference);
      updatePriceReferenceButtons(panel);
      refreshPanel(panel);
      refreshGuildUpgrade(panel);
      refreshGuildExchangeAdvisor();
    });
    updatePriceReferenceButtons(panel);
    panel.querySelector('[data-role="results"]').addEventListener("click", (event) => {
      const target = event.target && (event.target.nodeType === 1 ? event.target : event.target.parentElement);
      if (!target) return;
      const tokenToggle = target.closest('[data-role="toggle-token-values"]');
      if (tokenToggle) {
        const tokenSection = tokenToggle.closest(".mwi-token-value-section");
        const tokenBody = tokenSection && tokenSection.querySelector(".mwi-token-value-body");
        if (!tokenSection || !tokenBody) return;
        state.guildTokenValuesCollapsed = !state.guildTokenValuesCollapsed;
        tokenSection.dataset.collapsed = String(state.guildTokenValuesCollapsed);
        tokenToggle.setAttribute("aria-expanded", String(!state.guildTokenValuesCollapsed));
        const tokenIcon = tokenToggle.querySelector(".mwi-collapse-icon");
        if (tokenIcon) tokenIcon.textContent = state.guildTokenValuesCollapsed ? "▸" : "▾";
        tokenBody.hidden = state.guildTokenValuesCollapsed;
        persistPluginUiState();
        return;
      }
      const toggle = target.closest('[data-role="toggle-credit-section"]');
      const section = toggle && toggle.closest('[data-credit-item-hrid]');
      if (!section) return;
      const creditItemHrid = section.dataset.creditItemHrid;
      const collapsed = !state.collapsedCreditSections.has(creditItemHrid);
      if (collapsed) state.collapsedCreditSections.add(creditItemHrid);
      else state.collapsedCreditSections.delete(creditItemHrid);
      section.dataset.collapsed = String(collapsed);
      toggle.setAttribute("aria-expanded", String(!collapsed));
      const icon = toggle.querySelector(".mwi-collapse-icon");
      if (icon) icon.textContent = collapsed ? "▸" : "▾";
      const body = section.querySelector(".mwi-credit-body");
      if (body) body.hidden = collapsed;
      persistPluginUiState();
    });
    panel.querySelector('[data-role="view-credit"]').addEventListener("click", () => setPanelView(panel, "credit"));
    panel.querySelector('[data-role="view-upgrade"]').addEventListener("click", () => setPanelView(panel, "upgrade"));
    panel.addEventListener("click", (event) => {
      const button = event.target.closest('[data-role="market-item-link"]');
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      openMarketplaceForItem(button.dataset.itemHrid, button.dataset.itemName);
    });
    panel.querySelector('[data-role="add-upgrade-plan"]').addEventListener("click", () => { addGuildUpgradePlan(guildBuffEntries()); persistPluginUiState(); refreshGuildUpgrade(panel); });
    panel.querySelector('[data-role="clear-upgrade-plans"]').addEventListener("click", () => { clearGuildUpgradePlans(); persistPluginUiState(); refreshGuildUpgrade(panel); });
    panel.querySelector('.mwi-upgrade-preset-buttons').addEventListener("click", (event) => {
      const button = event.target.closest('[data-role="set-guild-shrine-target"]');
      if (!button || button.disabled) return;
      if (!applyGuildShrineTargets(guildBuffEntries(), button.dataset.domain)) return;
      persistPluginUiState();
      refreshGuildUpgrade(panel);
    });
    panel.querySelector('[data-role="upgrade-plan-list"]').addEventListener("change", (event) => {
      const row = event.target.closest("[data-plan-id]");
      const plan = row && state.upgradePlans.find((candidate) => candidate.id === row.dataset.planId);
      if (!plan) return;
      const entries = guildBuffEntries();
      if (event.target.matches('[data-role="plan-buff"]')) {
        const targetHrid = event.target.value;
        if (state.upgradePlans.some((candidate) => candidate.id !== plan.id && candidate.guildBuffHrid === targetHrid)) return;
        const entry = entries.find((candidate) => candidate.hrid === targetHrid);
        if (!entry || currentGuildBuffLevel(entry) >= entry.maxLevel) return;
        plan.guildBuffHrid = entry.hrid;
        plan.startLevel = currentGuildBuffLevel(entry);
        plan.targetLevel = Math.min(plan.startLevel + 1, entry.maxLevel);
      } else if (event.target.matches('[data-role="plan-start"]')) {
        plan.startLevel = Number(event.target.value);
        const entry = entries.find((candidate) => candidate.hrid === plan.guildBuffHrid);
        plan.targetLevel = Math.max(plan.startLevel + 1, Math.min(plan.targetLevel, entry.maxLevel));
      } else if (event.target.matches('[data-role="plan-target"]')) {
        plan.targetLevel = Number(event.target.value);
      }
      state.suppressUpgradePlanAutofill = false;
      state.upgradePresetNotice = "";
      persistPluginUiState();
      refreshGuildUpgrade(panel);
    });
    panel.querySelector('[data-role="upgrade-plan-list"]').addEventListener("click", (event) => {
      const button = event.target.closest('[data-role="remove-plan"]');
      const row = button && button.closest("[data-plan-id]");
      if (!row) return;
      state.upgradePlans = state.upgradePlans.filter((plan) => plan.id !== row.dataset.planId);
      state.suppressUpgradePlanAutofill = false;
      state.upgradePresetNotice = "";
      persistPluginUiState();
      refreshGuildUpgrade(panel);
    });
    checkPluginUpdate(panel);
    return panel;
  }

  function renderCreditSection(creditItemHrid, color, ranked) {
    const available = ranked.filter((row) => row.status === "ok").slice(0, 5);
    const creditName = itemNameForMaterial(creditItemHrid);
    const icon = iconMarkup(creditItemHrid, creditName);
    const collapsed = state.collapsedCreditSections.has(creditItemHrid);
    const heading = `<button class="mwi-credit-heading" data-role="toggle-credit-section" type="button" aria-expanded="${String(!collapsed)}">${icon}<span>${escapeHtml(creditName)}</span><span class="mwi-collapse-icon" aria-hidden="true">${collapsed ? "▸" : "▾"}</span></button>`;
    if (!available.length) {
      return `<section class="mwi-credit-section" data-credit-item-hrid="${escapeHtml(creditItemHrid)}" data-collapsed="${String(collapsed)}" style="--mwi-credit-color:${color}">${heading}<div class="mwi-credit-body"${collapsed ? " hidden" : ""}><div class="mwi-empty">${escapeHtml(t("noMarketEstimate"))}</div></div></section>`;
    }
    return `<section class="mwi-credit-section" data-credit-item-hrid="${escapeHtml(creditItemHrid)}" data-collapsed="${String(collapsed)}" style="--mwi-credit-color:${color}">${heading}<div class="mwi-credit-body"${collapsed ? " hidden" : ""}><table><thead><tr><th>${escapeHtml(t("item"))}</th><th>${escapeHtml(t("exchange"))}</th><th>${escapeHtml(t("perCredit"))}</th><th>${escapeHtml(t("targetCost"))}</th></tr></thead><tbody>${available.map((row) => `<tr><td title="${escapeHtml(row.itemName)}"><span class="mwi-item">${marketItemIconMarkup(row.itemHrid, row.itemName)}<span class="mwi-item-name">${escapeHtml(row.itemName)}</span></span></td><td>${escapeHtml(t("exchangeRate", { items: itemQuantity(row.itemCount), credits: creditQuantity(row.creditCount) }))}</td><td class="mwi-cost">${formatNumber(row.costPerCredit, 2)}</td><td>${core.formatCompactCost(row.cost)}</td></tr>`).join("")}</tbody></table></div></section>`;
  }

  function renderGuildTokenValues(values) {
    const valuesByCredit = new Map(values.map((value) => [value.creditItemHrid, value]));
    const rows = GUILD_TOKEN_CREDIT_CONVERSIONS.map((rule) => {
      const value = valuesByCredit.get(rule.creditItemHrid) || { status: "unpriced", ...rule };
      const creditName = itemNameForMaterial(value.creditItemHrid);
      const exchange = t("exchangeRate", { items: `${formatNumber(value.guildTokenCount)} ${t("guildTokens")}`, credits: creditQuantity(value.creditCount) });
      if (value.status !== "ok") {
        return `<div class="mwi-token-value-row"><span class="mwi-item">${marketItemIconMarkup(value.creditItemHrid, creditName)}<span class="mwi-item-name">${escapeHtml(creditName)}</span></span><span class="mwi-token-value-exchange">${escapeHtml(exchange)}</span><span class="mwi-token-value-unpriced">${escapeHtml(t("noMarketValue"))}</span></div>`;
      }
      return `<div class="mwi-token-value-row"><span class="mwi-item">${marketItemIconMarkup(value.creditItemHrid, creditName)}<span class="mwi-item-name">${escapeHtml(creditName)}</span></span><span class="mwi-token-value-exchange">${escapeHtml(exchange)}</span><span class="mwi-cost">${core.formatCompactCost(value.goldValuePerToken)} ${escapeHtml(t("gold"))}</span></div>`;
    }).join("");
    const collapsed = state.guildTokenValuesCollapsed;
    const guildTokenName = itemNameForMaterial("/items/guild_token");
    const heading = `<button class="mwi-credit-heading mwi-token-value-heading" data-role="toggle-token-values" type="button" aria-expanded="${String(!collapsed)}">${iconMarkup("/items/guild_token", guildTokenName)}<span>${escapeHtml(t("tokenExchangeValue", { token: guildTokenName }))}</span><span class="mwi-collapse-icon" aria-hidden="true">${collapsed ? "▸" : "▾"}</span></button>`;
    return `<section class="mwi-token-value-section" data-collapsed="${String(collapsed)}">${heading}<div class="mwi-token-value-body mwi-token-value-list"${collapsed ? " hidden" : ""}>${rows}</div></section>`;
  }

  async function refreshPanel(panel, forceSnapshot) {
    refreshOfficialItemNameCatalog();
    if (state.refreshInFlight) {
      state.refreshQueued = true;
      return;
    }
    state.refreshInFlight = true;
    const status = panel.querySelector('[data-role="status"]');
    const results = panel.querySelector('[data-role="results"]');
    const button = panel.querySelector('[data-role="refresh"]');
    const target = Number(panel.querySelector('[data-role="target"]').value);
    button.disabled = true;
    status.hidden = false;
    results.replaceChildren();

    const creditGroups = CREDIT_TYPES.map(([creditItemHrid, color]) => ({ creditItemHrid, color, conversions: allConversions(creditItemHrid) }));
    const conversionCount = creditGroups.reduce((total, group) => total + group.conversions.length, 0);
    if (!conversionCount) {
      status.textContent = t("noExchangeRules");
      button.disabled = false;
      finishRefresh(panel);
      return;
    }
    status.textContent = t("readingRules", { count: formatNumber(conversionCount) });

    try {
      await loadSnapshot(Boolean(forceSnapshot));
      const rankedGroups = creditGroups.map((group) => {
        const books = Object.fromEntries(group.conversions.map((conversion) => [
          conversion.itemHrid,
          snapshotOrderBook(conversion.itemHrid)
        ]));
        const tokenRule = GUILD_TOKEN_CREDIT_CONVERSIONS.find((rule) => rule.creditItemHrid === group.creditItemHrid);
        return {
          ...group,
          ranked: core.rankConversions(group.conversions, books, target),
          tokenRanked: core.rankConversions(group.conversions, books, tokenRule.creditCount)
        };
      });
      const tokenValues = core.rankGuildTokenCreditValues(GUILD_TOKEN_CREDIT_CONVERSIONS, Object.fromEntries(rankedGroups.map((group) => [group.creditItemHrid, group.tokenRanked])));
      status.textContent = "";
      status.hidden = true;
      results.innerHTML = `${renderGuildTokenValues(tokenValues)}<div class="mwi-credit-grid">${rankedGroups.map((group) => renderCreditSection(group.creditItemHrid, group.color, group.ranked)).join("")}</div>`;
      button.disabled = false;
      finishRefresh(panel);
    } catch (error) {
      status.textContent = t("snapshotLoadFailed", { message: error.message });
      button.disabled = false;
      finishRefresh(panel);
    }
  }

  function finishRefresh(panel) {
    state.refreshInFlight = false;
    if (!state.refreshQueued) return;
    state.refreshQueued = false;
    window.clearTimeout(state.refreshTimer);
    state.refreshTimer = window.setTimeout(() => refreshPanel(panel), 250);
  }

  function isVisible(node) {
    const modal = node && node.closest && node.closest('[class*="Modal_modal"]') || node;
    if (!modal || !modal.isConnected || modal.hidden || modal.getAttribute("aria-hidden") === "true") return false;
    const rect = modal.getBoundingClientRect();
    const style = getComputedStyle(modal);
    const opacity = Number(style.opacity);
    return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden" && style.pointerEvents !== "none" && (!Number.isFinite(opacity) || opacity > 0.01);
  }

  function itemHridFromIcon(icon) {
    const use = icon && icon.querySelector("use");
    const href = use && (use.getAttribute("href") || use.getAttribute("xlink:href"));
    if (!href || !href.includes("#")) return null;
    return `/items/${href.slice(href.lastIndexOf("#") + 1)}`;
  }

  function enhancementLevelFromIcon(icon) {
    const item = icon && icon.closest('[class*="Item_item"]');
    const label = item && item.querySelector('[class*="Item_enhancementLevel"]');
    const match = String(label && label.textContent || "").trim().match(/^\+(\d+)$/);
    const level = Number(match && match[1]);
    return Number.isSafeInteger(level) && level >= 0 ? level : 0;
  }

  function findGuildExchangeModal() {
    const candidates = Array.from(document.querySelectorAll('[class*="GuildPanel_exchangeModalContent"]'))
      .filter(isVisible);
    for (const element of candidates) {
      const modal = element.closest('[class*="Modal_modal"]') || element;
      const icons = Array.from(element.querySelectorAll('svg[role="img"][aria-label]'))
        .map((icon) => ({
          itemHrid: itemHridFromIcon(icon),
          itemName: icon.getAttribute("aria-label") || "",
          enhancementLevel: enhancementLevelFromIcon(icon)
        }))
        .filter((item) => item.itemHrid);
      const credit = icons.find((item) => CREDIT_TYPES.some(([hrid]) => hrid === item.itemHrid));
      const selected = icons.find((item) => !CREDIT_TYPES.some(([hrid]) => hrid === item.itemHrid));
      const quantityInput = element.querySelector('input[type="number"]');
      const batches = Number(quantityInput && quantityInput.value);
      if (!credit) continue;
      return {
        element,
        modal,
        creditItemHrid: credit.itemHrid,
        selectedItemHrid: selected && selected.itemHrid || null,
        selectedEnhancementLevel: selected && selected.enhancementLevel || 0,
        batches: Number.isSafeInteger(batches) && batches > 0 ? batches : 1
      };
    }
    return null;
  }

  const GUILD_EXCHANGE_ADVISOR_HOST_ID = "mwi-guild-exchange-advisor-host";

  const GUILD_EXCHANGE_ADVISOR_STYLES = `
    :host{all:initial;color-scheme:dark;font-family:system-ui,-apple-system,"Microsoft YaHei",sans-serif}*,*::before,*::after{box-sizing:border-box}[hidden]{display:none!important}
    .advisor{--credit:#4fcdb5;position:fixed;z-index:1065;display:flex;flex-direction:column;width:min(400px,calc(100vw - 24px));max-height:calc(100dvh - 24px);overflow:auto;border:1px solid #414361;border-left:4px solid var(--credit);border-radius:7px;background:#171927;color:#f4f5ff;box-shadow:0 8px 24px rgba(0,0,0,.45);font-size:13px;line-height:1.4}
    .head{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;padding:10px 12px;border-bottom:1px solid #414361;background:#24263e}.title{display:grid;gap:2px;font-size:17px;font-weight:700}.credit{display:flex;align-items:center;gap:5px;color:#c7cae4;font-size:11px;font-weight:500}.credit::before{width:9px;height:9px;border-radius:2px;background:var(--credit);content:""}.reference{padding-top:3px;color:#bfc2de;font-size:11px;white-space:nowrap}.body{display:flex;flex:1;min-height:0;flex-direction:column;gap:9px;padding:11px 12px}.options{display:grid;flex:1;min-height:0;grid-template-columns:minmax(0,1fr) 32px minmax(0,1fr);align-items:stretch;gap:8px}.options.single{grid-template-columns:minmax(0,1fr)}.option{min-width:0;padding:8px;border:1px solid #414361;border-radius:5px;background:#202139}.option.best{border-color:var(--credit);background:#193836}.label{display:block;margin-bottom:6px;color:#bfc2de;font-size:11px}.item{display:flex;align-items:center;gap:6px;min-width:0;color:#fff;font-size:14px;font-weight:700}.item .mwi-item-icon{width:32px;height:32px;flex:0 0 32px}.name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.cost{margin:8px 0 5px;color:var(--credit);font-size:23px;font-weight:700;line-height:1}.cost small{margin-left:3px;color:#bfc2de;font-size:11px;font-weight:500}.detail{display:flex;justify-content:space-between;gap:5px;color:#bfc2de;font-size:11px;white-space:nowrap}.detail b{color:#e7e8f6;font-weight:600}.versus{display:grid;place-items:center;color:#aeb1d3;font-size:11px;font-weight:700}.versus span{display:grid;place-items:center;width:28px;height:28px;border:1px solid #58607a;border-radius:50%;background:#151722}.summary{padding:8px;border-top:1px solid #414361;color:#dfe1f7;text-align:center;font-size:12px;font-weight:600}.summary strong{color:var(--credit);font-size:16px}
    @media (max-width:600px){.advisor{max-height:min(300px,calc(100dvh - 24px))}.options{grid-template-columns:minmax(0,1fr) 28px minmax(0,1fr)}.body{padding:9px}.option{padding:7px}.cost{font-size:20px}}
  `;

  function createGuildExchangeAdvisorUi() {
    if (!document.body || state.exchangeAdvisorUi) return state.exchangeAdvisorUi;
    if (document.getElementById(GUILD_EXCHANGE_ADVISOR_HOST_ID)) return null;
    const host = document.createElement("div");
    host.id = GUILD_EXCHANGE_ADVISOR_HOST_ID;
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `<style>${GUILD_EXCHANGE_ADVISOR_STYLES}</style><aside class="advisor" data-role="advisor" aria-live="polite" hidden></aside>`;
    document.body.append(host);
    state.exchangeAdvisorUi = { host, shadow, card: shadow.querySelector('[data-role="advisor"]'), signature: "", modal: null };
    return state.exchangeAdvisorUi;
  }

  function hideGuildExchangeAdvisor() {
    const ui = state.exchangeAdvisorUi;
    if (!ui) return;
    ui.card.hidden = true;
    ui.signature = "";
    ui.modal = null;
    observeActiveGuildExchangeModal(null);
  }

  function calculateGuildExchangeAdvisorPosition(modalRect, cardRect) {
    const margin = 12;
    const gap = 12;
    const width = Math.max(1, cardRect.width);
    const height = Math.max(1, cardRect.height);
    const clampLeft = (value) => Math.max(margin, Math.min(value, window.innerWidth - width - margin));
    const clampTop = (value) => Math.max(margin, Math.min(value, window.innerHeight - height - margin));
    if (modalRect.right + gap + width <= window.innerWidth - margin) return { placement: "right", left: modalRect.right + gap, top: clampTop(modalRect.top) };
    if (modalRect.left - gap - width >= margin) return { placement: "left", left: modalRect.left - gap - width, top: clampTop(modalRect.top) };
    if (modalRect.bottom + gap + height <= window.innerHeight - margin) return { placement: "bottom", left: clampLeft(modalRect.left + (modalRect.width - width) / 2), top: modalRect.bottom + gap };
    if (modalRect.top - gap - height >= margin) return { placement: "top", left: clampLeft(modalRect.left + (modalRect.width - width) / 2), top: modalRect.top - gap - height };
    return { placement: "overlay", left: clampLeft(modalRect.left + (modalRect.width - width) / 2), top: clampTop(window.innerHeight - height - margin) };
  }

  function positionGuildExchangeAdvisor(ui, modal) {
    const card = ui && ui.card;
    if (!card) return false;
    if (!modal || !modal.isConnected || !isVisible(modal)) {
      card.hidden = true;
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
    const position = calculateGuildExchangeAdvisorPosition(modalRect, cardRect);
    card.dataset.placement = position.placement;
    card.style.left = `${Math.round(position.left)}px`;
    card.style.top = `${Math.round(position.top)}px`;
    card.hidden = false;
    card.style.removeProperty("visibility");
    return true;
  }

  function advisorOptionMarkup(label, option, details, best) {
    const primary = details
      ? `${formatNumber(details.credits)}<small>${escapeHtml(t("credits"))}</small>`
      : `${core.formatCompactCost(option.costPerCredit)}<small>${escapeHtml(t("goldPerCredit"))}</small>`;
    const first = details
      ? [details.firstLabel, details.firstValue]
      : [t("singleExchange"), t("exchangeRate", { items: itemQuantity(option.itemCount), credits: creditQuantity(option.creditCount) })];
    const second = details
      ? [details.secondLabel, details.secondValue]
      : [t("marketCost"), `${core.formatCompactCost(option.cost)} ${t("gold")}`];
    return `<section class="option${best ? " best" : ""}"><span class="label">${escapeHtml(label)}</span><div class="item">${iconMarkup(option.itemHrid, option.itemName)}<span class="name">${escapeHtml(option.itemName)}</span></div><div class="cost">${primary}</div><div class="detail"><span>${escapeHtml(first[0])}</span><b>${escapeHtml(first[1])}</b></div><div class="detail"><span>${escapeHtml(second[0])}</span><b>${escapeHtml(second[1])}</b></div></section>`;
  }

  function guildExchangeAdvisorMarkup(data) {
    const comparison = Boolean(data.selected && data.replacement);
    const reference = priceReference(state.priceReference).label;
    const header = `<header class="head"><div class="title"><span>${escapeHtml(t("exchangeRecommendation"))}</span><span class="credit">${escapeHtml(data.creditName)}</span></div><span class="reference">${escapeHtml(data.selected ? t("advisorReferenceSelected", { reference }) : t("advisorReference", { reference }))}</span></header>`;
    let summary = t("chooseItem");
    if (data.selectedOptimal) summary = t("alreadyOptimal");
    else if (!data.selected && data.unavailableReason) summary = data.unavailableReason;
    else if (comparison && data.replacement.creditDifference > 0) summary = t("sellAndBuyMore", { count: formatNumber(data.replacement.creditDifference), credit: escapeHtml(data.creditName) });
    else if (comparison && data.replacement.creditDifference < 0) summary = t("directMore", { count: formatNumber(-data.replacement.creditDifference), credit: escapeHtml(data.creditName) });
    else if (comparison) summary = t("sameCredits");
    const selected = comparison ? advisorOptionMarkup(t("selected"), data.selected, {
      credits: data.replacement.directCredits,
      firstLabel: t("directExchange"),
      firstValue: t("exchangeRate", { items: itemQuantity(data.replacement.sale.quantity), credits: creditQuantity(data.replacement.directCredits) }),
      secondLabel: t("afterTax"),
      secondValue: `${core.formatCompactCost(data.replacement.sale.net)} ${t("gold")}`
    }) : "";
    const best = advisorOptionMarkup(data.selectedOptimal ? t("selectedOptimal") : t("bestItem"), data.best, comparison ? {
      credits: data.replacement.best.actualCredits,
      firstLabel: t("buybackExchange"),
      firstValue: t("exchangeRate", { items: itemQuantity(data.replacement.best.requiredItems), credits: creditQuantity(data.replacement.best.actualCredits) }),
      secondLabel: t("purchaseCost"),
      secondValue: `${core.formatCompactCost(data.replacement.best.cost)} ${t("gold")}`
    } : null, true);
    return `${header}<div class="body"><div class="options${comparison ? "" : " single"}">${selected}${comparison ? '<div class="versus"><span>VS</span></div>' : ""}${best}</div><div class="summary">${summary}</div></div>`;
  }

  function renderGuildExchangeAdvisor(modalData, data, forceRender) {
    const ui = state.exchangeAdvisorUi;
    if (!ui) return false;
    const markup = guildExchangeAdvisorMarkup(data);
    if (forceRender || ui.signature !== markup) {
      ui.card.innerHTML = markup;
      ui.signature = markup;
    }
    ui.modal = modalData.modal;
    observeActiveGuildExchangeModal(modalData.modal);
    ui.card.setAttribute("aria-label", t("exchangeRecommendation"));
    ui.card.style.setProperty("--credit", data.color);
    return positionGuildExchangeAdvisor(ui, modalData.modal);
  }

  function refreshGuildExchangeAdvisor(forceRender) {
    const ui = state.exchangeAdvisorUi;
    if (!ui) return false;
    const modalData = findGuildExchangeModal();
    if (!modalData) {
      hideGuildExchangeAdvisor();
      return false;
    }

    const conversions = allConversions(modalData.creditItemHrid);
    if (!conversions.length) {
      hideGuildExchangeAdvisor();
      return false;
    }

    if (!state.snapshot) {
      hideGuildExchangeAdvisor();
      if (state.exchangeAdvisorSnapshotFailed) return;
      if (!state.exchangeAdvisorLoadInFlight) {
        state.exchangeAdvisorLoadInFlight = true;
        loadSnapshot(false)
          .catch(() => { state.exchangeAdvisorSnapshotFailed = true; return null; })
          .finally(() => { state.exchangeAdvisorLoadInFlight = false; scheduleGuildExchangeAdvisor(true); });
      }
      return false;
    }

    const books = Object.fromEntries(conversions.map((conversion) => [conversion.itemHrid, snapshotOrderBook(conversion.itemHrid)]));
    let best = core.rankConversions(conversions, books, 1).find((result) => result.status === "ok");
    if (!best) {
      hideGuildExchangeAdvisor();
      return false;
    }

    const selectedConversion = conversions.find((conversion) => conversion.itemHrid === modalData.selectedItemHrid);
    let selected = null;
    let replacement = null;
    let selectedOptimal = false;
    let unavailableReason = "";
    if (selectedConversion) {
      if (selectedConversion.itemHrid === best.itemHrid) {
        selectedOptimal = true;
      } else {
        const sellPrice = snapshotImmediateSellPrice(selectedConversion.itemHrid, modalData.selectedEnhancementLevel);
        const buyPrices = Object.fromEntries(conversions.map((conversion) => [conversion.itemHrid, snapshotPrice(conversion.itemHrid, state.priceReference)]));
        replacement = core.estimateSaleReplacement({
          selectedConversion,
          batches: modalData.batches,
          sellPrice,
          sellerTaxRate: SELLER_TAX_RATE,
          conversions,
          buyPrices
        });
        if (replacement.status === "already_optimal") {
          best = replacement.best;
          selectedOptimal = true;
          replacement = null;
        } else if (replacement.status !== "ok") {
          unavailableReason = replacement.status === "no_affordable_conversion"
            ? t("noAffordableReplacement", { gold: `${core.formatCompactCost(replacement.sale.net)} ${t("gold")}` })
            : t("noSellPrice");
          replacement = null;
        } else {
          selected = selectedConversion;
        }
      }
    }
    const creditName = itemNameForMaterial(modalData.creditItemHrid);
    return renderGuildExchangeAdvisor(modalData, {
      creditName,
      color: CREDIT_TYPES.find(([hrid]) => hrid === modalData.creditItemHrid)?.[1] || "#4fcdb5",
      best: replacement ? replacement.best : best,
      selected,
      selectedOptimal,
      replacement,
      unavailableReason
    }, forceRender);
  }

  function scheduleGuildExchangeAdvisor(forceRender) {
    if (!state.exchangeAdvisorUi) return;
    state.exchangeAdvisorForceRender = state.exchangeAdvisorForceRender || Boolean(forceRender);
    if (state.exchangeAdvisorFrame !== null) return;
    const requestFrame = typeof window.requestAnimationFrame === "function"
      ? window.requestAnimationFrame.bind(window)
      : (handler) => window.setTimeout(handler, 0);
    state.exchangeAdvisorFrame = requestFrame(() => {
      state.exchangeAdvisorFrame = null;
      const shouldForceRender = state.exchangeAdvisorForceRender;
      state.exchangeAdvisorForceRender = false;
      refreshGuildExchangeAdvisor(shouldForceRender);
    });
  }

  function guildExchangeMutationObserver() {
    return pageWindow.MutationObserver || (typeof MutationObserver === "function" ? MutationObserver : null);
  }

  function nodeMayContainGuildExchangeModal(node) {
    if (!node || node.nodeType !== 1) return false;
    const selector = '[class*="GuildPanel_exchangeModalContent"]';
    if (node.matches(selector)) return true;
    // Only child-list changes reach this observer. Inspecting each newly added
    // subtree keeps portal mounting reliable without restoring the old, costly
    // whole-page attributes/text observer.
    return Boolean(node.querySelector(selector));
  }

  function observeActiveGuildExchangeModal(modal) {
    if (state.exchangeAdvisorObservedModal === modal) return;
    if (state.exchangeAdvisorModalObserver) state.exchangeAdvisorModalObserver.disconnect();
    state.exchangeAdvisorObservedModal = modal || null;
    state.exchangeAdvisorModalObserver = null;
    if (!modal || !modal.isConnected) return;
    const Observer = guildExchangeMutationObserver();
    if (!Observer) return;
    state.exchangeAdvisorModalObserver = new Observer(() => scheduleGuildExchangeAdvisor());
    state.exchangeAdvisorModalObserver.observe(modal, {
      attributes: true,
      attributeFilter: ["aria-hidden", "class", "hidden", "style"],
      childList: true,
      subtree: true
    });
  }

  function watchGuildExchangeModals() {
    if (!document.body || state.exchangeAdvisorRootObserver) return;
    const Observer = guildExchangeMutationObserver();
    if (!Observer) return;
    state.exchangeAdvisorRootObserver = new Observer((mutations) => {
      const activeModal = state.exchangeAdvisorUi && state.exchangeAdvisorUi.modal;
      if (activeModal && !activeModal.isConnected) {
        scheduleGuildExchangeAdvisor();
        return;
      }
      if (Array.from(mutations || []).some((mutation) => Array.from(mutation.addedNodes || []).some(nodeMayContainGuildExchangeModal))) {
        scheduleGuildExchangeAdvisor();
      }
    });
    state.exchangeAdvisorRootObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
    if (!state.exchangeAdvisorListenersInstalled) {
      const reposition = () => {
        if (state.exchangeAdvisorUi && state.exchangeAdvisorUi.modal) scheduleGuildExchangeAdvisor();
      };
      window.addEventListener("resize", reposition, { passive: true });
      window.addEventListener("orientationchange", reposition, { passive: true });
      window.addEventListener("scroll", reposition, { capture: true, passive: true });
      state.exchangeAdvisorListenersInstalled = true;
    }
    scheduleGuildExchangeAdvisor(true);
  }

  function startGuildExchangeAdvisor() {
    if (!createGuildExchangeAdvisorUi()) return;
    watchGuildExchangeModals();
    scheduleGuildExchangeAdvisor(true);
  }

  function findSidebarTabBar() {
    const sidebarTabAliases = [
      ["库存", "Inventory"],
      ["装备", "Equipment"],
      ["技能", "Skills"],
      ["房屋", "House"],
      ["配装", "Loadout", "Loadouts"],
      ["收获", "Harvest", "Gathering"]
    ];
    const expectedTabs = new Set(sidebarTabAliases.flat());
    const preferredPrototypeLabels = ui().locale === "zh-CN" ? sidebarTabAliases[0] : ["Inventory", "库存"];
    const elements = document.getElementsByTagName("*");
    for (let index = 0; index < elements.length; index += 1) {
      const candidate = elements[index];
      const children = Array.from(candidate.children);
      if (children.length < 4) continue;
      const tabs = children.map((child) => ({
        element: child,
        label: String(child.innerText || child.textContent || "").replaceAll("\n", "").trim()
      }));
      const recognized = tabs.filter((tab) => expectedTabs.has(tab.label));
      if (recognized.length >= 4) {
        const prototype = recognized.find((tab) => preferredPrototypeLabels.includes(tab.label)) || recognized[0];
        const tabsRoot = candidate.parentElement && candidate.parentElement.parentElement && candidate.parentElement.parentElement.parentElement;
        const sidebar = tabsRoot && tabsRoot.parentElement;
        const panelHost = sidebar && Array.from(sidebar.children).find((node) => node !== tabsRoot && /tabPanelsContainer/.test(String(node.className)));
        if (panelHost) return { tabBar: candidate, tabPrototype: prototype.element, panelHost };
      }
    }
    return null;
  }

  function hideCreditPanel() {
    if (state.panel) state.panel.hidden = true;
    if (state.creditTab) {
      state.creditTab.classList.remove("Mui-selected");
      state.creditTab.setAttribute("aria-selected", "false");
    }
    for (const node of state.hiddenSidebarNodes) {
      if (!node.isConnected) continue;
      node.style.display = node.dataset.mwiCreditPreviousDisplay || "";
      delete node.dataset.mwiCreditPreviousDisplay;
    }
    state.hiddenSidebarNodes = [];
  }

  function activateCreditTabFromPointer(event) {
    const creditTab = state.creditTab;
    if (!creditTab || !creditTab.isConnected) return false;
    const rawTarget = event.target;
    const target = rawTarget && rawTarget.nodeType === 1 ? rawTarget : rawTarget && rawTarget.parentElement;
    if (!target || !creditTab.contains(target)) return false;
    const tabBar = creditTab.parentElement;
    const tabsRoot = tabBar && tabBar.parentElement && tabBar.parentElement.parentElement && tabBar.parentElement.parentElement.parentElement;
    const sidebar = tabsRoot && tabsRoot.parentElement;
    const panelHost = sidebar && Array.from(sidebar.children).find((node) => /tabPanelsContainer/.test(String(node.className)));
    if (!tabBar || !panelHost) return false;
    event.preventDefault();
    event.stopImmediatePropagation();
    showCreditPanel(panelHost, tabBar);
    return true;
  }

  function showCreditPanel(panelHost, tabBar) {
    if (!state.panel || !state.panel.isConnected) return;
    hideCreditPanel();
    state.hiddenSidebarNodes = Array.from(panelHost.children).filter((node) => node !== state.panel);
    for (const node of state.hiddenSidebarNodes) {
      node.dataset.mwiCreditPreviousDisplay = node.style.display;
      node.style.display = "none";
    }
    state.panel.hidden = false;
    for (const tab of tabBar.children) {
      tab.classList.remove("Mui-selected");
      tab.setAttribute("aria-selected", "false");
    }
    state.creditTab.classList.add("Mui-selected");
    state.creditTab.setAttribute("aria-selected", "true");
    hydrateBridgeData();
    extractItemDetailsFromReact();
    hydrateLocalInitData();
    if (state.panel.dataset.activeView === "upgrade") refreshGuildUpgrade(state.panel);
    else refreshPanel(state.panel);
  }

  function ensureSidebarIntegration() {
    refreshOfficialItemNameCatalog();
    if (state.panel && state.panel.isConnected && state.creditTab && state.creditTab.isConnected) return;
    const integration = findSidebarTabBar();
    if (!integration || !integration.panelHost) return;
    const { tabBar, tabPrototype, panelHost } = integration;
    const existingTab = tabBar.querySelector('[data-mwi-credit-tab="true"]');
    if (existingTab && state.panel && state.panel.isConnected) return;
    if (existingTab) existingTab.remove();

    if (state.panel && !state.panel.isConnected) state.panel = null;
    if (state.creditTab && !state.creditTab.isConnected) state.creditTab = null;

    const creditTab = tabPrototype.cloneNode(true);
    creditTab.dataset.mwiCreditTab = "true";
    creditTab.classList.remove("Mui-selected");
    creditTab.removeAttribute("id");
    creditTab.removeAttribute("disabled");
    creditTab.removeAttribute("aria-disabled");
    creditTab.setAttribute("aria-selected", "false");
    creditTab.setAttribute("role", "tab");
    if ("disabled" in creditTab) creditTab.disabled = false;
    creditTab.replaceChildren(document.createTextNode(t("sidebarCredit")));
    const activateCreditTab = (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      showCreditPanel(panelHost, tabBar);
    };
    creditTab.addEventListener("pointerdown", activateCreditTab, true);
    creditTab.addEventListener("click", activateCreditTab, true);
    tabBar.append(creditTab);

    const panel = createPanel();
    panel.hidden = true;
    panelHost.append(panel);
    tabBar.addEventListener("click", (event) => {
      if (!creditTab.contains(event.target)) hideCreditPanel();
    });
    state.panel = panel;
    state.creditTab = creditTab;
  }

  hydrateBridgeData();
  extractItemDetailsFromReact();
  hydrateLocalInitData();
  document.addEventListener("pointerdown", activateCreditTabFromPointer, true);
  document.addEventListener("click", activateCreditTabFromPointer, true);
  document.addEventListener("input", (event) => {
    const target = event.target && (event.target.nodeType === 1 ? event.target : event.target.parentElement);
    if (target && target.closest && target.closest('[class*="GuildPanel_exchangeModalContent"]')) scheduleGuildExchangeAdvisor();
  }, true);
  document.addEventListener("click", (event) => {
    const target = event.target && (event.target.nodeType === 1 ? event.target : event.target.parentElement);
    if (target && target.closest('[class*="GuildPanel_exchangeModalContent"]')) scheduleGuildExchangeAdvisor();
  }, true);
  state.panelSearchTimer = window.setInterval(ensureSidebarIntegration, 3000);
  if (document.body) startGuildExchangeAdvisor();
  else document.addEventListener("DOMContentLoaded", startGuildExchangeAdvisor, { once: true });
  window.setTimeout(ensureSidebarIntegration, 1000);
})();
