(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MwiGuildCreditItemNameCatalog = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const STORAGE_KEY = "mwi-official-item-name-catalog-v1";
  const SCHEMA_VERSION = 1;
  const ITEM_HRID = /^\/items\/[a-z0-9_]+$/i;
  const CHINESE_TEXT = /[\u3400-\u9fff]/u;
  const INITIAL_RETRY_DELAY_MS = 3000;
  const MAX_RETRY_DELAY_MS = 60000;
  const MAX_WEBPACK_FACTORIES = 6000;
  const MAX_WEBPACK_CANDIDATES = 12;

  function normalizeLocale(locale) {
    return String(locale || "")
      .toLowerCase()
      .startsWith("zh")
      ? "zh-CN"
      : "en";
  }

  function normalizeItemHrid(value) {
    const key = String(value || "").trim();
    if (ITEM_HRID.test(key)) return key;
    return /^[a-z0-9_]+$/i.test(key) ? `/items/${key}` : null;
  }

  function cleanName(value) {
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }

  function liveCatalogSource(source) {
    return (
      source === "window-i18n" ||
      source === "react-provider" ||
      source === "webpack-locale" ||
      source === "official-merged"
    );
  }

  function refreshRetryDelay(attemptCount) {
    const attempts = Number.isSafeInteger(attemptCount) && attemptCount > 0 ? attemptCount : 0;
    if (attempts < 5) return INITIAL_RETRY_DELAY_MS;
    return Math.min(MAX_RETRY_DELAY_MS, INITIAL_RETRY_DELAY_MS * 2 ** Math.min(attempts - 4, 5));
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

  function extractOfficialItemNameCatalog(roots) {
    const candidates = Array.isArray(roots) ? roots : [roots];
    const names = Object.create(null);
    for (const root of candidates) {
      for (const candidate of i18nVariants(root)) {
        for (const itemNames of itemNameMapsFromI18n(candidate)) {
          Object.assign(names, catalogFromItemNames(itemNames));
        }
      }
    }
    const entryCount = Object.keys(names).length;
    return { names, entryCount, valid: entryCount > 0 };
  }

  function webpackChunkEntries(pageWindow) {
    if (!pageWindow || typeof pageWindow !== "object") return [];
    const entries = [];
    try {
      for (const key of Object.getOwnPropertyNames(pageWindow)) {
        if (!/^webpack(?:jsonp|chunk)/i.test(key)) continue;
        let queue;
        try {
          queue = pageWindow[key];
        } catch (_) {
          continue;
        }
        if (!Array.isArray(queue)) continue;
        for (const entry of queue) {
          if (entry && entry[1] && typeof entry[1] === "object") entries.push(entry);
        }
      }
    } catch (_) {
      return [];
    }
    return entries;
  }

  function webpackLocaleModuleMap(entries) {
    const moduleMap = new Map();
    const pattern = /["']\.\/([^"'\\]+)\/index\.js["']\s*:\s*\[\s*(\d+)\s*,\s*(\d+)\s*\]/g;
    let scanned = 0;
    for (const entry of entries) {
      for (const factory of Object.values(entry[1])) {
        if (typeof factory !== "function" || scanned >= MAX_WEBPACK_FACTORIES) continue;
        scanned += 1;
        let source;
        try {
          source = Function.prototype.toString.call(factory);
        } catch (_) {
          continue;
        }
        if (!source.includes("./zh-TW/index.js")) continue;
        for (const match of source.matchAll(pattern)) {
          const locale = String(match[1] || "")
            .trim()
            .toLowerCase()
            .replaceAll("_", "-");
          if (locale === "zh" || locale === "zh-cn" || locale === "zh-hans" || locale.startsWith("zh-hans-"))
            moduleMap.set("zh-CN", String(match[2]));
        }
      }
    }
    return moduleMap;
  }

  function runWebpackLocaleFactory(factory) {
    const module = { exports: {} };
    const exports = module.exports;
    const webpackRequire = () => {
      throw new Error("The game locale module unexpectedly imported another module");
    };
    webpackRequire.r = (target) => Object.defineProperty(target, "__esModule", { value: true });
    webpackRequire.d = (target, nameOrDefinition, getter) => {
      const definition = typeof nameOrDefinition === "object" ? nameOrDefinition : { [nameOrDefinition]: getter };
      for (const [name, get] of Object.entries(definition)) {
        if (typeof get !== "function" || Object.hasOwn(target, name)) continue;
        Object.defineProperty(target, name, { enumerable: true, get });
      }
    };
    factory.call(exports, module, exports, webpackRequire);
    return module.exports && module.exports.default
      ? module.exports.default
      : exports && exports.default
        ? exports.default
        : module.exports;
  }

  function validLocaleResourceMap(value, prefix) {
    return Boolean(
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).some((key) => key.startsWith(prefix))
    );
  }

  function validGameLocaleResources(resources) {
    return Boolean(
      resources &&
      typeof resources === "object" &&
      validLocaleResourceMap(resources.itemNames, "/items/") &&
      validLocaleResourceMap(resources.actionNames, "/actions/") &&
      validLocaleResourceMap(resources.monsterNames, "/monsters/") &&
      validLocaleResourceMap(resources.abilityNames, "/abilities/")
    );
  }

  function extractWebpackItemNameCatalog(pageWindow) {
    const entries = webpackChunkEntries(pageWindow);
    if (!entries.length) return { names: Object.create(null), entryCount: 0, valid: false, source: "webpack-locale" };
    const expectedModuleId = webpackLocaleModuleMap(entries).get("zh-CN");
    const preferred = [];
    const fallback = [];
    let scanned = 0;
    for (const entry of entries) {
      for (const [moduleId, factory] of Object.entries(entry[1])) {
        if (typeof factory !== "function" || scanned >= MAX_WEBPACK_FACTORIES) continue;
        scanned += 1;
        if (expectedModuleId && moduleId === expectedModuleId) {
          preferred.push(factory);
          continue;
        }
        if (expectedModuleId || fallback.length >= MAX_WEBPACK_CANDIDATES) continue;
        let source;
        try {
          source = Function.prototype.toString.call(factory);
        } catch (_) {
          continue;
        }
        if (
          source.includes("itemNames") &&
          source.includes("actionNames") &&
          source.includes("monsterNames") &&
          source.includes("abilityNames")
        )
          fallback.push(factory);
      }
    }
    for (const factory of [...preferred, ...fallback].slice(0, MAX_WEBPACK_CANDIDATES)) {
      try {
        const resources = runWebpackLocaleFactory(factory);
        if (!validGameLocaleResources(resources)) continue;
        const names = catalogFromItemNames(resources.itemNames);
        const entryCount = Object.keys(names).length;
        if (entryCount) return { names, entryCount, valid: true, source: "webpack-locale" };
      } catch (_) {
        // A changed or dependent game module is not a fatal localization failure.
      }
    }
    return { names: Object.create(null), entryCount: 0, valid: false, source: "webpack-locale" };
  }

  function extractVisibleItemNameCatalog(documentRef) {
    const names = Object.create(null);
    if (!documentRef || typeof documentRef.querySelectorAll !== "function")
      return { names, entryCount: 0, valid: false, source: "visible-dom" };
    let uses;
    try {
      uses = Array.from(documentRef.querySelectorAll('svg[role="img"][aria-label] use')).slice(0, 2000);
    } catch (_) {
      return { names, entryCount: 0, valid: false, source: "visible-dom" };
    }
    for (const use of uses) {
      const icon = use && use.closest && use.closest('svg[role="img"][aria-label]');
      if (!icon) continue;
      const pluginRoot = icon.closest && icon.closest("#mwi-credit-optimizer, #mwi-guild-exchange-advisor-host");
      if (pluginRoot) continue;
      const name = cleanName(icon.getAttribute && icon.getAttribute("aria-label"));
      if (!name || !CHINESE_TEXT.test(name)) continue;
      const href = String((use.getAttribute && (use.getAttribute("href") || use.getAttribute("xlink:href"))) || "");
      const hashIndex = href.lastIndexOf("#");
      if (hashIndex < 0) continue;
      const base = href.slice(0, hashIndex).toLowerCase();
      if (base && !base.includes("items_sprite")) continue;
      const itemHrid = normalizeItemHrid(href.slice(hashIndex + 1));
      if (itemHrid) names[itemHrid] = name;
    }
    const entryCount = Object.keys(names).length;
    return { names, entryCount, valid: entryCount > 0, source: "visible-dom" };
  }

  function reactI18nRoots(documentRef) {
    if (!documentRef) return [];
    const found = [];
    const gamePageRoots = [];
    try {
      gamePageRoots.push(
        ...Array.from(documentRef.querySelectorAll('[class^="GamePage"], [class*="GamePage"]')).slice(0, 12)
      );
    } catch (_) {
      // A restricted document should still allow the direct window candidates.
    }

    function fibersFromRoot(root) {
      if (!root) return [];
      const fibers = [];
      for (const key of Reflect.ownKeys(root)) {
        const keyName = String(key);
        if (
          keyName.startsWith("__reactFiber$") ||
          keyName.startsWith("__reactContainer$") ||
          keyName.startsWith("__reactInternalInstance$")
        )
          fibers.push(root[key]);
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
      const stored = JSON.parse((storage && storage.getItem(STORAGE_KEY)) || "");
      if (!stored || stored.schemaVersion !== SCHEMA_VERSION || !stored.names || typeof stored.names !== "object")
        return null;
      const names = catalogFromItemNames(stored.names);
      const entryCount = Object.keys(names).length;
      return entryCount
        ? {
            names,
            entryCount,
            source: "cache",
            sources: Array.isArray(stored.sources) ? stored.sources.filter((source) => typeof source === "string") : [],
            updatedAt: stored.updatedAt || null,
            version: stored.version || null
          }
        : null;
    } catch (_) {
      return null;
    }
  }

  function persistCatalog(storage, catalog) {
    try {
      storage &&
        storage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            schemaVersion: SCHEMA_VERSION,
            source: catalog.source,
            sources: catalog.sources,
            updatedAt: catalog.updatedAt,
            entryCount: catalog.entryCount,
            version: catalog.version,
            names: catalog.names
          })
        );
    } catch (_) {
      // A read-only storage environment should not prevent live name resolution.
    }
  }

  function pageI18nRoots(pageWindow) {
    if (!pageWindow || typeof pageWindow !== "object") return [];
    return [pageWindow.i18next, pageWindow.i18n, pageWindow.mwi && pageWindow.mwi.lang].filter(
      (value) => value && typeof value === "object"
    );
  }

  function createItemNameCatalog(options) {
    const pageWindow = options && options.pageWindow;
    const documentRef = options && options.document;
    const storage = options && options.storage;
    const version = (options && options.version) || null;
    let current = readCachedCatalog(storage) || {
      names: Object.create(null),
      entryCount: 0,
      source: "unavailable",
      sources: [],
      updatedAt: null,
      version
    };
    let lastRefreshAt = null;
    let refreshAttempts = 0;
    let lastRefreshChanged = false;

    function sameNames(left, right) {
      const leftEntries = Object.entries(left || {});
      const rightEntries = Object.entries(right || {});
      return (
        leftEntries.length === rightEntries.length &&
        leftEntries.every(([itemHrid, name]) => right && right[itemHrid] === name)
      );
    }

    function refresh() {
      lastRefreshChanged = false;
      const catalogs = [
        extractVisibleItemNameCatalog(documentRef),
        { ...extractOfficialItemNameCatalog(reactI18nRoots(documentRef)), source: "react-provider" },
        extractWebpackItemNameCatalog(pageWindow),
        { ...extractOfficialItemNameCatalog(pageI18nRoots(pageWindow)), source: "window-i18n" }
      ].filter((catalog) => catalog.valid);
      if (!catalogs.length) return current;
      const names = Object.assign(Object.create(null), current.names);
      for (const catalog of catalogs) Object.assign(names, catalog.names);
      const sources = Array.from(new Set(catalogs.map((catalog) => catalog.source)));
      const officialSources = sources.filter((source) => source !== "visible-dom");
      const source = officialSources.length > 1 ? "official-merged" : officialSources[0] || sources[0] || "unavailable";
      lastRefreshChanged = !sameNames(current.names, names);
      const metadataChanged = current.source !== source || current.sources.join("\n") !== sources.join("\n");
      if (!lastRefreshChanged && !metadataChanged) return current;
      current = {
        names,
        entryCount: Object.keys(names).length,
        source,
        sources,
        updatedAt: new Date().toISOString(),
        version
      };
      persistCatalog(storage, current);
      return current;
    }

    function refreshIfDue(options = {}) {
      const force = options.force === true;
      const now = Number.isFinite(options.now) ? Number(options.now) : Date.now();
      const requiredItemHrids = Array.from(
        new Set((options.requiredItemHrids || []).map(normalizeItemHrid).filter(Boolean))
      );
      const ready =
        liveCatalogSource(current.source) && requiredItemHrids.every((itemHrid) => Boolean(current.names[itemHrid]));
      const delay = refreshRetryDelay(refreshAttempts);
      if (!force && (ready || (lastRefreshAt !== null && now - lastRefreshAt < delay))) {
        return { attempted: false, changed: false, ready, retryCount: refreshAttempts, nextDelayMs: delay };
      }
      lastRefreshAt = now;
      refreshAttempts += 1;
      const refreshed = refresh();
      const refreshedReady =
        liveCatalogSource(refreshed.source) &&
        requiredItemHrids.every((itemHrid) => Boolean(refreshed.names[itemHrid]));
      return {
        attempted: true,
        changed: lastRefreshChanged,
        ready: refreshedReady,
        retryCount: refreshAttempts,
        nextDelayMs: refreshRetryDelay(refreshAttempts)
      };
    }

    function resolveItemName({ itemHrid, englishFallback, locale }) {
      const normalized = normalizeItemHrid(itemHrid);
      const englishName = cleanName(englishFallback) || normalized || String(itemHrid || "");
      if (normalizeLocale(locale) !== "zh-CN" || !normalized) return englishName;
      return current.names[normalized] || englishName;
    }

    function coverage(itemHrids) {
      const requested = Array.from(
        new Set((Array.isArray(itemHrids) ? itemHrids : []).map(normalizeItemHrid).filter(Boolean))
      );
      const missing = requested.filter((itemHrid) => !current.names[itemHrid]);
      return {
        requestedCount: requested.length,
        officialHitCount: requested.length - missing.length,
        missingItemHrids: missing,
        source: current.source,
        catalogEntryCount: current.entryCount
      };
    }

    return { refresh, refreshIfDue, resolveItemName, coverage, metadata: () => ({ ...current, names: undefined }) };
  }

  return {
    STORAGE_KEY,
    normalizeLocale,
    normalizeItemHrid,
    liveCatalogSource,
    refreshRetryDelay,
    catalogFromItemNames,
    extractOfficialItemNameCatalog,
    extractWebpackItemNameCatalog,
    extractVisibleItemNameCatalog,
    createItemNameCatalog
  };
});
