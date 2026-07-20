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
    const roots = [documentRef.getElementById && documentRef.getElementById("root"), documentRef.body];
    try {
      roots.push(...Array.from(documentRef.querySelectorAll('[class^="GamePage"], [class*="GamePage"]')).slice(0, 12));
    } catch (_) {
      // A restricted document should still allow the direct window candidates.
    }
    const fibers = [];
    for (const root of roots) {
      if (!root) continue;
      for (const key of Reflect.ownKeys(root)) {
        const keyName = String(key);
        if (keyName.startsWith("__reactFiber$") || keyName.startsWith("__reactContainer$") || keyName.startsWith("__reactInternalInstance$")) fibers.push(root[key]);
      }
    }
    const visited = new Set();
    const found = [];
    let scanned = 0;
    while (fibers.length && scanned < 6000) {
      const fiber = fibers.pop();
      if (!fiber || typeof fiber !== "object" || visited.has(fiber)) continue;
      visited.add(fiber);
      scanned += 1;
      const candidates = [
        fiber.memoizedProps,
        fiber.pendingProps,
        fiber.memoizedState,
        fiber.stateNode && fiber.stateNode.state,
        fiber.stateNode && fiber.stateNode.props,
        fiber.stateNode
      ];
      for (const candidate of candidates) {
        if (!candidate || typeof candidate !== "object") continue;
        found.push(...i18nVariants(candidate));
      }
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
