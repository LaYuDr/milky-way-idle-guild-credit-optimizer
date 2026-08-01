// MWI_GUILD_CREDIT_RUNTIME
window.MwiGuildCreditVersion = "1.1.33";

(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MwiGuildCreditMarketData = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const LIVE_MARKET_CACHE_SCHEMA_VERSION = 2;
  const SUPPORTED_LIVE_MARKET_CACHE_SCHEMA_VERSIONS = new Set([1, 2]);
  const MAX_CACHED_ITEMS = 2000;
  const MAX_LEVELS_PER_ITEM = 101;

  function normalizeMarketTimestamp(value) {
    if (typeof value !== "number" && typeof value !== "string") return 0;
    const normalized = typeof value === "string" ? value.trim() : value;
    if (normalized === "") return 0;
    const numeric = Number(normalized);
    if (Number.isFinite(numeric)) {
      const timestamp = numeric > 0 && numeric < 1_000_000_000_000 ? numeric * 1000 : numeric;
      return timestamp > 0 && Number.isFinite(new Date(timestamp).getTime()) ? timestamp : 0;
    }
    const parsed = Date.parse(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function normalizeEnhancementLevel(value) {
    const level = Number(value);
    return Number.isSafeInteger(level) && level >= 0 ? level : null;
  }

  function normalizeCachedPrice(value) {
    const price = Number(value);
    return Number.isFinite(price) && (price > 0 || price === -1) ? price : null;
  }

  function metadataFieldValue(levelMap, level, field, fallback) {
    const levelValue = levelMap && levelMap[level];
    if (levelValue && typeof levelValue === "object" && !Array.isArray(levelValue)
      && Object.prototype.hasOwnProperty.call(levelValue, field)) {
      return levelValue[field];
    }
    return levelValue !== undefined && (typeof levelValue !== "object" || levelValue === null)
      ? levelValue
      : fallback;
  }

  function sanitizeMarketData(rawMarketData) {
    const marketData = Object.create(null);
    if (!rawMarketData || typeof rawMarketData !== "object" || Array.isArray(rawMarketData)) {
      return marketData;
    }
    for (const [itemHrid, levelMap] of Object.entries(rawMarketData)) {
      if (!itemHrid.startsWith("/items/")
        || !levelMap || typeof levelMap !== "object" || Array.isArray(levelMap)) continue;
      const levels = Object.create(null);
      for (const [rawLevel, rawQuote] of Object.entries(levelMap)) {
        const level = normalizeEnhancementLevel(rawLevel);
        if (level === null || !rawQuote || typeof rawQuote !== "object" || Array.isArray(rawQuote)) continue;
        const quote = Object.create(null);
        for (const field of ["a", "b"]) {
          if (!Object.prototype.hasOwnProperty.call(rawQuote, field)) {
            quote[field] = -1;
            continue;
          }
          const price = Number(rawQuote[field]);
          if (Number.isFinite(price)) quote[field] = price;
        }
        if (Object.keys(quote).length) levels[String(level)] = quote;
      }
      if (Object.keys(levels).length) marketData[itemHrid] = levels;
    }
    return marketData;
  }

  function createMarketStructure(marketData) {
    return Object.entries(marketData || {})
      .map(([itemHrid, levelMap]) => [
        itemHrid,
        Object.entries(levelMap || {})
          .filter(([, quote]) => quote && typeof quote === "object" && !Array.isArray(quote))
          .map(([level, quote]) => [
            level,
            ["a", "b"].filter((field) => (
              Object.prototype.hasOwnProperty.call(quote, field)
              && Number.isFinite(Number(quote[field]))
            ))
          ])
          .sort((left, right) => left[0].localeCompare(right[0]))
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
          (total, [, fields]) => total + 1 + fields.length,
          0
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
          if (!incomingFields.includes(field)) missingCount += 1;
        }
      }
    }
    return missingCount;
  }

  function edgePrice(entries, useLowest) {
    if (!Array.isArray(entries)) return null;
    let result = null;
    for (const entry of entries) {
      const price = Number(entry && typeof entry === "object" ? entry.price : entry);
      if (!Number.isFinite(price) || price <= 0) continue;
      if (result === null || (useLowest ? price < result : price > result)) result = price;
    }
    // An explicitly empty side of a complete order book means there is no
    // current public quote. Preserve that fact instead of falling back to a
    // potentially stale static snapshot.
    return result === null ? -1 : result;
  }

  function normalizeMarketOrderBooksUpdate(payload) {
    const source = payload && (
      payload.marketItemOrderBooks
      || payload.data && payload.data.marketItemOrderBooks
      || payload
    );
    const itemHrid = String(source && source.itemHrid || "").trim();
    if (!itemHrid.startsWith("/items/")) return null;

    const hasDirectBook = source
      && (Object.prototype.hasOwnProperty.call(source, "asks")
        || Object.prototype.hasOwnProperty.call(source, "bids"));
    let rawBooks = source && source.orderBooks;
    if (!rawBooks && hasDirectBook) {
      const level = Object.prototype.hasOwnProperty.call(source, "enhancementLevel")
        ? normalizeEnhancementLevel(source.enhancementLevel)
        : 0;
      if (level === null) return null;
      rawBooks = { [level]: source };
    }
    if (!rawBooks || typeof rawBooks !== "object" || Array.isArray(rawBooks)) return null;

    const levels = Object.create(null);
    for (const [rawLevel, rawBook] of Object.entries(rawBooks)) {
      const level = normalizeEnhancementLevel(rawLevel);
      if (level === null || !rawBook || typeof rawBook !== "object" || Array.isArray(rawBook)) continue;
      const quote = Object.create(null);
      if (Object.prototype.hasOwnProperty.call(rawBook, "asks")) quote.a = edgePrice(rawBook.asks, true);
      if (Object.prototype.hasOwnProperty.call(rawBook, "bids")) quote.b = edgePrice(rawBook.bids, false);
      if (Object.keys(quote).length) levels[String(level)] = quote;
    }
    return Object.keys(levels).length ? { itemHrid, levels } : null;
  }

  function applyLiveMarketUpdate(liveData, update, options) {
    if (!liveData || typeof liveData !== "object" || !update) return false;
    const revision = Number(options && options.revision);
    const receivedAt = Number(options && options.receivedAt);
    if (!Number.isSafeInteger(revision) || revision <= 0 || !Number.isFinite(receivedAt) || receivedAt <= 0) return false;

    const existing = liveData[update.itemHrid] || {};
    const levels = { ...(existing.levels || {}) };
    const revisionByLevel = { ...(existing.revisionByLevel || {}) };
    const receivedAtByLevel = { ...(existing.receivedAtByLevel || {}) };
    const snapshotTimestampByLevel = { ...(existing.snapshotTimestampByLevel || {}) };
    const snapshotConflictDeferredByLevel = { ...(existing.snapshotConflictDeferredByLevel || {}) };
    const snapshotTimestamp = normalizeMarketTimestamp(options && options.snapshotTimestamp);
    for (const [level, quote] of Object.entries(levels)) {
      const fieldRevisions = Object.create(null);
      const fieldTimes = Object.create(null);
      const fieldSnapshotTimestamps = Object.create(null);
      const fieldConflictDeferrals = Object.create(null);
      for (const field of ["a", "b"]) {
        if (!Object.prototype.hasOwnProperty.call(quote || {}, field)) continue;
        fieldRevisions[field] = Number(metadataFieldValue(
          revisionByLevel, level, field, existing.revision
        ));
        fieldTimes[field] = Number(metadataFieldValue(
          receivedAtByLevel, level, field, existing.receivedAt
        ));
        fieldSnapshotTimestamps[field] = normalizeMarketTimestamp(metadataFieldValue(
          snapshotTimestampByLevel, level, field, existing.snapshotTimestamp
        ));
        fieldConflictDeferrals[field] = metadataFieldValue(
          snapshotConflictDeferredByLevel, level, field, false
        ) === true;
      }
      revisionByLevel[level] = fieldRevisions;
      receivedAtByLevel[level] = fieldTimes;
      snapshotTimestampByLevel[level] = fieldSnapshotTimestamps;
      snapshotConflictDeferredByLevel[level] = fieldConflictDeferrals;
    }
    for (const [level, quote] of Object.entries(update.levels || {})) {
      const mergedQuote = { ...(levels[level] || {}) };
      const fieldRevisions = { ...(revisionByLevel[level] || {}) };
      const fieldTimes = { ...(receivedAtByLevel[level] || {}) };
      const fieldSnapshotTimestamps = { ...(snapshotTimestampByLevel[level] || {}) };
      const fieldConflictDeferrals = { ...(snapshotConflictDeferredByLevel[level] || {}) };
      for (const field of ["a", "b"]) {
        if (!Object.prototype.hasOwnProperty.call(quote, field)) continue;
        mergedQuote[field] = quote[field];
        fieldRevisions[field] = revision;
        fieldTimes[field] = receivedAt;
        fieldSnapshotTimestamps[field] = snapshotTimestamp;
        fieldConflictDeferrals[field] = false;
      }
      levels[level] = mergedQuote;
      revisionByLevel[level] = fieldRevisions;
      receivedAtByLevel[level] = fieldTimes;
      snapshotTimestampByLevel[level] = fieldSnapshotTimestamps;
      snapshotConflictDeferredByLevel[level] = fieldConflictDeferrals;
    }
    if (!Object.keys(levels).length) return false;
    liveData[update.itemHrid] = {
      levels,
      revisionByLevel,
      receivedAtByLevel,
      snapshotTimestampByLevel,
      snapshotConflictDeferredByLevel,
      revision,
      receivedAt
    };
    return true;
  }

  function reconcileLiveMarketData(liveData, options) {
    if (!liveData || typeof liveData !== "object") return { changed: false, expired: false };
    const previousTimestamp = normalizeMarketTimestamp(options && options.previousSnapshotTimestamp);
    const nextTimestamp = normalizeMarketTimestamp(options && options.nextSnapshotTimestamp);
    const snapshotData = options && options.snapshotData;
    const coveredRevision = Number(options && options.coveredRevision);
    if (nextTimestamp <= 0 || !Number.isSafeInteger(coveredRevision) || coveredRevision < 0) {
      return { changed: false, expired: false };
    }

    let changed = false;
    let expired = false;
    for (const [itemHrid, entry] of Object.entries(liveData)) {
      const levels = { ...(entry && entry.levels || {}) };
      const revisionByLevel = { ...(entry && entry.revisionByLevel || {}) };
      const receivedAtByLevel = { ...(entry && entry.receivedAtByLevel || {}) };
      const snapshotTimestampByLevel = { ...(entry && entry.snapshotTimestampByLevel || {}) };
      const snapshotConflictDeferredByLevel = {
        ...(entry && entry.snapshotConflictDeferredByLevel || {})
      };
      const snapshotLevels = snapshotData && snapshotData[itemHrid];
      for (const [level, quote] of Object.entries(levels)) {
        const fieldRevisions = Object.create(null);
        const fieldTimes = Object.create(null);
        const fieldSnapshotTimestamps = Object.create(null);
        const fieldConflictDeferrals = Object.create(null);
        const snapshotQuote = snapshotLevels && snapshotLevels[level];
        for (const field of ["a", "b"]) {
          if (!Object.prototype.hasOwnProperty.call(quote || {}, field)) continue;
          const revision = Number(metadataFieldValue(
            revisionByLevel, level, field, entry.revision
          ));
          const receivedAt = Number(metadataFieldValue(
            receivedAtByLevel, level, field, entry.receivedAt
          ));
          const baselineTimestamp = normalizeMarketTimestamp(metadataFieldValue(
            snapshotTimestampByLevel,
            level,
            field,
            entry.snapshotTimestamp ?? previousTimestamp
          ));
          const conflictWasDeferred = metadataFieldValue(
            snapshotConflictDeferredByLevel, level, field, false
          ) === true;
          const snapshotHasField = Object.prototype.hasOwnProperty.call(snapshotQuote || {}, field);
          const snapshotMatchesLive = snapshotHasField
            && Number(snapshotQuote[field]) === Number(quote[field]);
          const arrivedDuringRequest = Number.isSafeInteger(revision) && revision > coveredRevision;
          const snapshotIsNewer = nextTimestamp > baselineTimestamp;
          const shouldDeferConflict = !snapshotMatchesLive
            && (arrivedDuringRequest || (snapshotIsNewer && !conflictWasDeferred));
          const isCoveredBySnapshot = snapshotMatchesLive
            || (!arrivedDuringRequest && snapshotIsNewer && conflictWasDeferred);
          if (isCoveredBySnapshot) {
            delete quote[field];
            changed = true;
            expired = true;
            continue;
          }
          fieldRevisions[field] = revision;
          fieldTimes[field] = receivedAt;
          fieldSnapshotTimestamps[field] = baselineTimestamp <= 0
            ? nextTimestamp
            : (shouldDeferConflict ? Math.max(baselineTimestamp, nextTimestamp) : baselineTimestamp);
          fieldConflictDeferrals[field] = shouldDeferConflict || conflictWasDeferred;
          if (fieldSnapshotTimestamps[field] !== baselineTimestamp
            || fieldConflictDeferrals[field] !== conflictWasDeferred) changed = true;
        }
        if (!Object.keys(quote).length) {
          delete levels[level];
          delete revisionByLevel[level];
          delete receivedAtByLevel[level];
          delete snapshotTimestampByLevel[level];
          delete snapshotConflictDeferredByLevel[level];
        } else {
          revisionByLevel[level] = fieldRevisions;
          receivedAtByLevel[level] = fieldTimes;
          snapshotTimestampByLevel[level] = fieldSnapshotTimestamps;
          snapshotConflictDeferredByLevel[level] = fieldConflictDeferrals;
        }
      }
      if (!Object.keys(levels).length) {
        delete liveData[itemHrid];
      } else {
        const revisions = Object.values(revisionByLevel)
          .flatMap((value) => Object.values(value || {})).map(Number).filter(Number.isSafeInteger);
        const receivedTimes = Object.values(receivedAtByLevel)
          .flatMap((value) => Object.values(value || {})).map(Number).filter(Number.isFinite);
        liveData[itemHrid] = {
          levels,
          revisionByLevel,
          receivedAtByLevel,
          snapshotTimestampByLevel,
          snapshotConflictDeferredByLevel,
          revision: revisions.length ? Math.max(...revisions) : entry.revision,
          receivedAt: receivedTimes.length ? Math.max(...receivedTimes) : entry.receivedAt
        };
      }
    }
    return { changed, expired };
  }

  function expireLiveMarketData(liveData, options) {
    return reconcileLiveMarketData(liveData, options).expired;
  }

  function restoreLiveMarketData(value) {
    let stored = value;
    try {
      if (typeof stored === "string") stored = JSON.parse(stored);
    } catch (_) {
      return { liveData: Object.create(null), revision: 0, valid: false };
    }
    if (!stored || typeof stored !== "object" || Array.isArray(stored)
      || !SUPPORTED_LIVE_MARKET_CACHE_SCHEMA_VERSIONS.has(stored.schemaVersion)
      || !stored.items || typeof stored.items !== "object" || Array.isArray(stored.items)) {
      return { liveData: Object.create(null), revision: 0, valid: false };
    }

    const liveData = Object.create(null);
    let revision = 0;
    let itemCount = 0;
    for (const [itemHrid, entry] of Object.entries(stored.items)) {
      if (itemCount >= MAX_CACHED_ITEMS) break;
      if (!itemHrid.startsWith("/items/") || !entry || typeof entry !== "object" || Array.isArray(entry)) continue;
      const levels = Object.create(null);
      const revisionByLevel = Object.create(null);
      const receivedAtByLevel = Object.create(null);
      const snapshotTimestampByLevel = Object.create(null);
      const snapshotConflictDeferredByLevel = Object.create(null);
      let levelCount = 0;
      for (const [rawLevel, rawQuote] of Object.entries(entry.levels || {})) {
        if (levelCount >= MAX_LEVELS_PER_ITEM) break;
        const level = normalizeEnhancementLevel(rawLevel);
        if (level === null || !rawQuote || typeof rawQuote !== "object" || Array.isArray(rawQuote)) continue;
        const quote = Object.create(null);
        const fieldRevisions = Object.create(null);
        const fieldTimes = Object.create(null);
        const fieldSnapshotTimestamps = Object.create(null);
        const fieldConflictDeferrals = Object.create(null);
        for (const field of ["a", "b"]) {
          if (!Object.prototype.hasOwnProperty.call(rawQuote, field)) continue;
          const price = normalizeCachedPrice(rawQuote[field]);
          if (price === null) continue;
          const levelKey = String(level);
          const levelRevision = Number(metadataFieldValue(
            entry.revisionByLevel, levelKey, field, entry.revision
          ));
          const receivedAt = Number(metadataFieldValue(
            entry.receivedAtByLevel, levelKey, field, entry.receivedAt
          ));
          if (!Number.isSafeInteger(levelRevision) || levelRevision <= 0
            || !Number.isFinite(receivedAt) || receivedAt <= 0) continue;
          quote[field] = price;
          fieldRevisions[field] = levelRevision;
          fieldTimes[field] = receivedAt;
          fieldSnapshotTimestamps[field] = normalizeMarketTimestamp(metadataFieldValue(
            entry.snapshotTimestampByLevel,
            levelKey,
            field,
            entry.snapshotTimestamp
          ));
          fieldConflictDeferrals[field] = metadataFieldValue(
            entry.snapshotConflictDeferredByLevel, levelKey, field, false
          ) === true;
          revision = Math.max(revision, levelRevision);
        }
        if (!Object.keys(quote).length) continue;
        const levelKey = String(level);
        levels[levelKey] = quote;
        revisionByLevel[levelKey] = fieldRevisions;
        receivedAtByLevel[levelKey] = fieldTimes;
        snapshotTimestampByLevel[levelKey] = fieldSnapshotTimestamps;
        snapshotConflictDeferredByLevel[levelKey] = fieldConflictDeferrals;
        levelCount += 1;
      }
      if (!Object.keys(levels).length) continue;
      const revisions = Object.values(revisionByLevel).flatMap((value) => Object.values(value));
      const receivedTimes = Object.values(receivedAtByLevel).flatMap((value) => Object.values(value));
      liveData[itemHrid] = {
        levels,
        revisionByLevel,
        receivedAtByLevel,
        snapshotTimestampByLevel,
        snapshotConflictDeferredByLevel,
        revision: Math.max(...revisions),
        receivedAt: Math.max(...receivedTimes)
      };
      itemCount += 1;
    }
    const storedRevision = Number(stored.revision);
    if (Number.isSafeInteger(storedRevision) && storedRevision > 0) revision = Math.max(revision, storedRevision);
    return { liveData, revision, valid: true };
  }

  function serializeLiveMarketData(liveData, options) {
    const revision = Number(options && options.revision);
    const restored = restoreLiveMarketData({
      schemaVersion: LIVE_MARKET_CACHE_SCHEMA_VERSION,
      revision: Number.isSafeInteger(revision) && revision > 0 ? revision : 0,
      items: liveData
    });
    return {
      schemaVersion: LIVE_MARKET_CACHE_SCHEMA_VERSION,
      revision: restored.revision,
      storedAt: Number(options && options.storedAt) || Date.now(),
      items: restored.liveData
    };
  }

  function resolveMarketPrice(snapshot, liveData, itemHrid, enhancementLevel, field) {
    const level = normalizeEnhancementLevel(enhancementLevel);
    if (!itemHrid || level === null || (field !== "a" && field !== "b")) return null;
    const liveQuote = liveData
      && liveData[itemHrid]
      && liveData[itemHrid].levels
      && liveData[itemHrid].levels[String(level)];
    if (liveQuote && Object.prototype.hasOwnProperty.call(liveQuote, field)) {
      const livePrice = Number(liveQuote[field]);
      return Number.isFinite(livePrice) && livePrice > 0 ? livePrice : null;
    }
    const snapshotQuote = snapshot
      && snapshot.marketData
      && snapshot.marketData[itemHrid]
      && snapshot.marketData[itemHrid][String(level)];
    const snapshotPrice = Number(snapshotQuote && snapshotQuote[field]);
    return Number.isFinite(snapshotPrice) && snapshotPrice > 0 ? snapshotPrice : null;
  }

  return {
    normalizeMarketTimestamp,
    sanitizeMarketData,
    createMarketStructure,
    countMissingMarketEntries,
    normalizeMarketOrderBooksUpdate,
    applyLiveMarketUpdate,
    reconcileLiveMarketData,
    expireLiveMarketData,
    restoreLiveMarketData,
    serializeLiveMarketData,
    resolveMarketPrice
  };
});


(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MwiGuildCreditMarketDom = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const ITEM_HRID_PATTERN = /^[a-z0-9_]+$/;

  function parseCompactMarketValue(value) {
    const normalized = String(value || "")
      .replace(/,/g, "")
      .replace(/\s+/g, "")
      .trim();
    const match = normalized.match(/^([0-9]+(?:\.[0-9]+)?)([KMBT]?)$/i);
    if (!match) return null;
    const multiplier = {
      "": 1,
      K: 1_000,
      M: 1_000_000,
      B: 1_000_000_000,
      T: 1_000_000_000_000
    }[match[2].toUpperCase()];
    const result = Number(match[1]) * multiplier;
    return Number.isFinite(result) && result >= 0 ? Math.round(result) : null;
  }

  function orderBookEntries(table) {
    const entries = [];
    for (const row of Array.from(table.querySelectorAll("tbody tr"))) {
      const cells = Array.from(row.querySelectorAll("td"));
      if (cells.length < 2) continue;
      const quantity = parseCompactMarketValue(cells[0].textContent);
      const price = parseCompactMarketValue(cells[1].textContent);
      if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(price) || price <= 0) continue;
      entries.push({ price, quantity });
    }
    return entries;
  }

  function tableSide(table) {
    const actions = Array.from(table.querySelectorAll("button"))
      .map((button) => String(button.textContent || "").trim())
      .filter(Boolean);
    if (actions.some((value) => ["购买", "Buy"].includes(value))) return "asks";
    if (actions.some((value) => ["出售", "Sell"].includes(value))) return "bids";
    const heading = String(table.querySelector("thead") && table.querySelector("thead").textContent || "");
    if (/出售价|Sell Price/i.test(heading)) return "asks";
    if (/收购价|Buy Price/i.test(heading)) return "bids";
    return "";
  }

  function currentMarketIdentity(documentRef) {
    const currentItem = documentRef.querySelector('[class*="MarketplacePanel_currentItem"]');
    if (!currentItem) return null;
    const use = currentItem.querySelector(
      '[class*="Item_itemContainer"] svg[role="img"] use[href*="items_sprite"],'
      + '[class*="Item_itemContainer"] svg[role="img"] use[xlink\\:href*="items_sprite"]'
    );
    const href = use && (use.getAttribute("href") || use.getAttribute("xlink:href"));
    const fragment = String(href || "").split("#").pop();
    if (!ITEM_HRID_PATTERN.test(fragment)) return null;
    const enhancementNode = currentItem.querySelector('[class*="Item_enhancementLevel"]');
    const enhancementMatch = String(enhancementNode && enhancementNode.textContent || "").match(/\+?(\d+)/);
    const enhancementLevel = enhancementMatch ? Number(enhancementMatch[1]) : 0;
    return {
      itemHrid: `/items/${fragment}`,
      enhancementLevel: Number.isSafeInteger(enhancementLevel) && enhancementLevel >= 0
        ? enhancementLevel
        : 0
    };
  }

  function readMarketDomSnapshot(documentRef) {
    if (!documentRef || typeof documentRef.querySelector !== "function") return null;
    const identity = currentMarketIdentity(documentRef);
    const booksContainer = documentRef.querySelector('[class*="MarketplacePanel_orderBooksContainer"]');
    if (!identity || !booksContainer) return null;
    const snapshot = {
      ...identity,
      asks: null,
      bids: null
    };
    for (const table of Array.from(
      booksContainer.querySelectorAll('table[class*="MarketplacePanel_orderBookTable"]')
    )) {
      const side = tableSide(table);
      if (side) snapshot[side] = orderBookEntries(table);
    }
    if (!Array.isArray(snapshot.asks) && !Array.isArray(snapshot.bids)) return null;
    snapshot.signature = JSON.stringify([
      snapshot.itemHrid,
      snapshot.enhancementLevel,
      snapshot.asks,
      snapshot.bids
    ]);
    return snapshot;
  }

  function createMarketMessage(snapshot) {
    if (!snapshot || !snapshot.itemHrid) return null;
    const book = {
      itemHrid: snapshot.itemHrid,
      enhancementLevel: snapshot.enhancementLevel
    };
    if (Array.isArray(snapshot.asks)) book.asks = snapshot.asks;
    if (Array.isArray(snapshot.bids)) book.bids = snapshot.bids;
    return {
      type: "market_item_order_books_updated",
      marketItemOrderBooks: book
    };
  }

  return Object.freeze({
    parseCompactMarketValue,
    readMarketDomSnapshot,
    createMarketMessage
  });
});


(function () {
  "use strict";

  const page = typeof unsafeWindow === "undefined" ? window : unsafeWindow;
  const marketDataApi = page.MwiGuildCreditMarketData || window.MwiGuildCreditMarketData;
  const marketDomApi = page.MwiGuildCreditMarketDom || window.MwiGuildCreditMarketDom;
  const bridge = window.__mwiGuildCreditBridge || (window.__mwiGuildCreditBridge = {
    messages: [],
    itemDetails: null,
    guildBuffDetails: null,
    guildBuffLevels: null,
    guildShrineLevels: null,
    guildShrineDetails: null,
    characterItems: null,
    characterItemsRevision: 0,
    marketOrderBooks: Object.create(null),
    marketOrderBookRevision: 0
  });
  if (!bridge.marketOrderBooks || typeof bridge.marketOrderBooks !== "object") bridge.marketOrderBooks = Object.create(null);
  if (!Number.isSafeInteger(bridge.marketOrderBookRevision)) bridge.marketOrderBookRevision = 0;
  if (!Number.isSafeInteger(bridge.characterItemsRevision)) bridge.characterItemsRevision = 0;
  if (bridge.marketObserverActive !== true) bridge.marketObserverActive = false;
  const SOCKET_MESSAGE_EVENT = "__mwiGuildCreditSocketMessageV1";
  const SOCKET_READY_EVENT = "__mwiGuildCreditSocketReadyV1";
  const DIAGNOSTICS_ATTRIBUTE = "data-mwi-credit-bridge-diagnostics";
  const diagnostics = bridge.diagnostics && typeof bridge.diagnostics === "object"
    ? bridge.diagnostics
    : (bridge.diagnostics = {
      scriptStartedAt: Date.now(),
      injectionAttempted: false,
      injectionReady: false,
      installMode: "initializing",
      observerActive: false,
      messageCount: 0,
      lastMessageAt: 0,
      lastMessageType: "",
      lastCharacterItemsUpdatedAt: 0,
      lastCharacterItemsSource: "",
      lastMarketItemHrid: "",
      lastMarketLevels: null,
      lastMarketReceivedAt: 0,
      lastMarketSource: "",
      domObserverActive: false,
      domSnapshotCount: 0
    });

  function publishBridgeDiagnostics() {
    const documentRef = window.document;
    const root = documentRef && documentRef.documentElement;
    if (!root || typeof root.setAttribute !== "function") return false;
    try {
      root.setAttribute(DIAGNOSTICS_ATTRIBUTE, JSON.stringify({
        ...diagnostics,
        characterItemsRevision: bridge.characterItemsRevision,
        marketOrderBookRevision: bridge.marketOrderBookRevision
      }));
      return true;
    } catch (_) {
      return false;
    }
  }
  publishBridgeDiagnostics();
  if (window.document && !window.document.documentElement && typeof window.addEventListener === "function") {
    window.addEventListener("DOMContentLoaded", publishBridgeDiagnostics, { once: true });
  }

  function keepMarketData(message, source) {
    if (!marketDataApi || !message || String(message.type || "") !== "market_item_order_books_updated") return;
    const update = marketDataApi.normalizeMarketOrderBooksUpdate(message);
    if (!update) return;
    const normalizedSource = source === "market_dom" ? "market_dom" : "websocket";
    const receivedAt = Date.now();
    const revision = Math.min(Number.MAX_SAFE_INTEGER, bridge.marketOrderBookRevision + 1);
    bridge.marketOrderBookRevision = revision;
    bridge.marketOrderBooks[update.itemHrid] = {
      update,
      revision,
      receivedAt,
      source: normalizedSource
    };
    diagnostics.lastMarketItemHrid = update.itemHrid;
    diagnostics.lastMarketLevels = update.levels;
    diagnostics.lastMarketReceivedAt = receivedAt;
    diagnostics.lastMarketSource = normalizedSource;
    publishBridgeDiagnostics();
    if (typeof bridge.onMarketOrderBooksUpdated === "function") {
      try {
        bridge.onMarketOrderBooksUpdated();
      } catch (_) {
        // The observer is optional and must never affect the game socket.
      }
    }
  }

  function isGameWebSocketUrl(value) {
    try {
      const url = new URL(String(value || ""));
      return url.protocol === "wss:"
        && /^api(?:-test)?\.milkywayidle(?:cn)?\.com$/i.test(url.hostname);
    } catch (_) {
      return false;
    }
  }

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

  function characterItemKey(record) {
    if (!record || typeof record !== "object") return "";
    if (typeof record.hash === "string" && record.hash) return `hash:${record.hash}`;
    if (typeof record.itemHrid !== "string" || !record.itemHrid.startsWith("/items/")) return "";
    if (typeof record.itemLocationHrid !== "string" || !record.itemLocationHrid.startsWith("/item_locations/")) return "";
    const enhancementLevel = Number(record.enhancementLevel) || 0;
    return `stack:${record.itemLocationHrid}::${record.itemHrid}::${enhancementLevel}`;
  }

  function characterItemCount(record) {
    const count = Number(record && record.count);
    return Number.isFinite(count) ? count : null;
  }

  function characterItemsEqual(left, right) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    const leftCounts = new Map();
    for (const record of left) {
      const key = characterItemKey(record);
      const count = characterItemCount(record);
      if (key && count !== null) leftCounts.set(key, count);
    }
    if (leftCounts.size !== right.length) return false;
    for (const record of right) {
      const key = characterItemKey(record);
      const count = characterItemCount(record);
      if (!key || count === null || leftCounts.get(key) !== count) return false;
    }
    return true;
  }

  function replaceCharacterItems(incoming) {
    if (!Array.isArray(incoming)) return false;
    const next = incoming.filter((record) => {
      const count = characterItemCount(record);
      return characterItemKey(record) && count !== null && count !== 0;
    });
    if (characterItemsEqual(bridge.characterItems, next)) return false;
    bridge.characterItems = next;
    return true;
  }

  // Runtime inventory changes arrive as endCharacterItems. The game applies
  // those records by stack hash and deletes a stack when its count reaches 0.
  function mergeCharacterItems(incoming) {
    if (!Array.isArray(incoming) || !incoming.length) return false;
    const itemMap = new Map();
    for (const record of bridge.characterItems || []) {
      const key = characterItemKey(record);
      if (key) itemMap.set(key, record);
    }
    for (const record of incoming) {
      const key = characterItemKey(record);
      const count = characterItemCount(record);
      if (!key || count === null) continue;
      if (count === 0) itemMap.delete(key);
      else itemMap.set(key, record);
    }
    const next = Array.from(itemMap.values());
    if (characterItemsEqual(bridge.characterItems, next)) return false;
    bridge.characterItems = next;
    return true;
  }

  function publishCharacterItemsUpdate(source) {
    bridge.characterItemsRevision = Math.min(Number.MAX_SAFE_INTEGER, bridge.characterItemsRevision + 1);
    diagnostics.lastCharacterItemsUpdatedAt = Date.now();
    diagnostics.lastCharacterItemsSource = source;
    publishBridgeDiagnostics();
    if (typeof bridge.onCharacterItemsUpdated === "function") {
      try {
        bridge.onCharacterItemsUpdated();
      } catch (_) {
        // The observer is optional and must never affect the game socket.
      }
    }
  }

  function keepGuildData(message) {
    if (!message || typeof message !== "object") return;
    const visited = new Set();
    const pending = [message];
    let scanned = 0;
    let characterItemsChanged = false;
    let characterItemsSource = "";
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
      const endCharacterItems = value.endCharacterItems;
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
      if (Array.isArray(characterItems) && replaceCharacterItems(characterItems)) {
        characterItemsChanged = true;
        characterItemsSource = "snapshot";
      }
      if (Array.isArray(endCharacterItems) && mergeCharacterItems(endCharacterItems)) {
        characterItemsChanged = true;
        characterItemsSource = "incremental";
      }
      for (const child of Object.values(value)) pending.push(child);
    }
    if (characterItemsChanged) publishCharacterItemsUpdate(characterItemsSource);
  }

  function keepSocketMessage(rawMessage) {
    if (typeof rawMessage !== "string") return;
    bridge.messages.push(rawMessage);
    if (bridge.messages.length > 80) bridge.messages.shift();
    diagnostics.messageCount = Math.min(Number.MAX_SAFE_INTEGER, diagnostics.messageCount + 1);
    diagnostics.lastMessageAt = Date.now();
    try {
      const message = JSON.parse(rawMessage);
      diagnostics.lastMessageType = String(message && message.type || "");
      keepMarketData(message, "websocket");
      keepGuildData(message);
    } catch (_) {
      diagnostics.lastMessageType = "non_json";
      // Ignore non-JSON protocol frames.
    }
    publishBridgeDiagnostics();
  }

  let lastMarketDomSignature = "";
  let marketDomScanScheduled = false;
  let marketDomObserver = null;

  function scanMarketDom() {
    marketDomScanScheduled = false;
    if (!marketDomApi || typeof marketDomApi.readMarketDomSnapshot !== "function") return false;
    const snapshot = marketDomApi.readMarketDomSnapshot(window.document);
    if (!snapshot || snapshot.signature === lastMarketDomSignature) return false;
    const message = marketDomApi.createMarketMessage(snapshot);
    if (!message) return false;
    lastMarketDomSignature = snapshot.signature;
    diagnostics.domSnapshotCount = Math.min(Number.MAX_SAFE_INTEGER, diagnostics.domSnapshotCount + 1);
    keepMarketData(message, "market_dom");
    return true;
  }

  function scheduleMarketDomScan() {
    if (marketDomScanScheduled) return;
    marketDomScanScheduled = true;
    const schedule = typeof window.setTimeout === "function"
      ? window.setTimeout.bind(window)
      : setTimeout;
    schedule(scanMarketDom, 40);
  }

  function installMarketDomObserver() {
    if (marketDomObserver || !marketDomApi || !window.document) return false;
    const root = window.document.documentElement;
    const Observer = window.MutationObserver || (typeof MutationObserver === "function" ? MutationObserver : null);
    if (!root || typeof Observer !== "function") return false;
    marketDomObserver = new Observer(scheduleMarketDomScan);
    marketDomObserver.observe(root, { subtree: true, childList: true, characterData: true });
    bridge.marketDomObserverActive = true;
    diagnostics.domObserverActive = true;
    publishBridgeDiagnostics();
    scheduleMarketDomScan();
    return true;
  }

  if (!installMarketDomObserver() && typeof window.addEventListener === "function") {
    window.addEventListener("DOMContentLoaded", installMarketDomObserver, { once: true });
  }

  // Tampermonkey can expose unsafeWindow through an isolated-world proxy whose
  // expando assignments do not replace the game's real globals. Inject the
  // socket wrapper into MAIN_WORLD and carry only string payloads back through
  // DOM events, which are shared across the two worlds.
  function installPageSocketTap(messageEventName, readyEventName) {
    const dispatchReady = (active) => {
      window.dispatchEvent(new CustomEvent(readyEventName, { detail: active ? "1" : "0" }));
    };
    const NativeWebSocket = window.WebSocket;
    if (typeof NativeWebSocket !== "function") {
      dispatchReady(false);
      return;
    }
    if (NativeWebSocket.__mwiGuildCreditBridge === true) {
      dispatchReady(true);
      return;
    }
    const instrumentedSockets = new WeakSet();
    const isOfficialSocket = (value) => {
      try {
        const url = new URL(String(value || ""));
        return url.protocol === "wss:"
          && /^api(?:-test)?\.milkywayidle(?:cn)?\.com$/i.test(url.hostname);
      } catch (_) {
        return false;
      }
    };
    const instrumentSocket = (socket) => {
      if (!socket || !isOfficialSocket(socket.url)
        || typeof socket.addEventListener !== "function" || instrumentedSockets.has(socket)) {
        return socket;
      }
      instrumentedSockets.add(socket);
      socket.addEventListener("message", (event) => {
        if (typeof event.data !== "string") return;
        window.dispatchEvent(new CustomEvent(messageEventName, { detail: event.data }));
      });
      return socket;
    };
    function ObservedWebSocket(...args) {
      return instrumentSocket(new NativeWebSocket(...args));
    }
    ObservedWebSocket.prototype = NativeWebSocket.prototype;
    try {
      Object.setPrototypeOf(ObservedWebSocket, NativeWebSocket);
    } catch (_) {
      // Static WebSocket constants are copied below when inheritance is blocked.
    }
    for (const constant of ["CONNECTING", "OPEN", "CLOSING", "CLOSED"]) {
      if (constant in ObservedWebSocket) continue;
      try {
        Object.defineProperty(ObservedWebSocket, constant, {
          configurable: true,
          enumerable: true,
          value: NativeWebSocket[constant]
        });
      } catch (_) {
        // Missing constants do not affect socket construction or observation.
      }
    }
    Object.defineProperty(ObservedWebSocket, "__mwiGuildCreditBridge", { value: true });
    try {
      window.WebSocket = ObservedWebSocket;
      dispatchReady(window.WebSocket === ObservedWebSocket);
    } catch (_) {
      dispatchReady(false);
    }
  }

  let pageSocketTapInstalled = false;
  if (typeof window.addEventListener === "function") {
    window.addEventListener(SOCKET_MESSAGE_EVENT, (event) => {
      keepSocketMessage(event && event.detail);
    });
    window.addEventListener(SOCKET_READY_EVENT, (event) => {
      pageSocketTapInstalled = Boolean(event && event.detail === "1");
      diagnostics.injectionReady = pageSocketTapInstalled;
      diagnostics.installMode = pageSocketTapInstalled ? "gm_add_element_main_world" : "gm_add_element_rejected";
      diagnostics.observerActive = pageSocketTapInstalled;
      publishBridgeDiagnostics();
    }, { once: true });
  }
  if (typeof GM_addElement === "function") {
    diagnostics.injectionAttempted = true;
    diagnostics.installMode = "gm_add_element_pending";
    publishBridgeDiagnostics();
    try {
      const source = `;(${installPageSocketTap.toString()})(${JSON.stringify(SOCKET_MESSAGE_EVENT)},${JSON.stringify(SOCKET_READY_EVENT)});`;
      const injected = GM_addElement("script", { textContent: source });
      if (injected && typeof injected.remove === "function") injected.remove();
    } catch (error) {
      diagnostics.installMode = "gm_add_element_error";
      diagnostics.injectionError = String(error && error.message || error || "unknown");
      publishBridgeDiagnostics();
      // Fall back to unsafeWindow for userscript managers without GM_addElement.
    }
  }
  if (pageSocketTapInstalled) {
    bridge.marketObserverActive = true;
    diagnostics.observerActive = true;
    publishBridgeDiagnostics();
    return;
  }

  const NativeWebSocket = page.WebSocket;
  if (!NativeWebSocket || NativeWebSocket.__mwiGuildCreditBridge) {
    diagnostics.installMode = NativeWebSocket ? "existing_wrapper" : "websocket_unavailable";
    diagnostics.observerActive = Boolean(NativeWebSocket && NativeWebSocket.__mwiGuildCreditBridge);
    publishBridgeDiagnostics();
    return;
  }
  const instrumentedSockets = new WeakSet();

  function instrumentSocket(socket) {
    if (!socket || !isGameWebSocketUrl(socket.url)
      || typeof socket.addEventListener !== "function" || instrumentedSockets.has(socket)) {
      return socket;
    }
    instrumentedSockets.add(socket);
    socket.addEventListener("message", (event) => {
      keepSocketMessage(event.data);
    });
    return socket;
  }

  function ObservedWebSocket(...args) {
    return instrumentSocket(new NativeWebSocket(...args));
  }
  ObservedWebSocket.prototype = NativeWebSocket.prototype;
  Object.setPrototypeOf(ObservedWebSocket, NativeWebSocket);
  ObservedWebSocket.__mwiGuildCreditBridge = true;
  page.WebSocket = ObservedWebSocket;
  bridge.marketObserverActive = true;
  diagnostics.installMode = page === window ? "direct_main_world" : "unsafe_window_fallback";
  diagnostics.injectionReady = page.WebSocket === ObservedWebSocket;
  diagnostics.observerActive = true;
  publishBridgeDiagnostics();
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
      inventoryCoveredNoExchange: "现有库存已覆盖，无需兑换",
      backpackInventory: "背包库存 {count}",
      notRead: "未读取",
      useGuildTokensForMissingCredits: "全部信用点使用公会代币",
      useGuildTokensForMissingCreditsHint: "快速选择或清除全部；也可在每张信用点卡片单独切换。",
      guildTokenCreditPlanActive: "缺少的信用点已全部按公会代币兑换计算。",
      guildTokenCreditPlanPartialActive: "已选择 {count} 种信用点按公会代币兑换计算。",
      guildTokenCreditPlanSummary: "其中 {count} 公会代币用于兑换信用点。",
      autoGuildTokenBudget: "自动兑换代币预算",
      autoGuildTokenBudgetHint: "按每枚公会代币的市场兑换价值从高到低分配。",
      autoGuildTokenBudgetAvailable: "本次最多可用 {count}",
      autoGuildTokenPlanSummary: "已按兑换价值自动分配 {count} 枚库存公会代币。",
      autoGuildTokenExchangeNeeds: "自动分配代币",
      autoGuildTokenCoverage: "覆盖 {count} 信用点",
      optimalItemCreditMode: "最优物品",
      guildTokenCreditMode: "公会代币",
      creditExchangeModeTitle: "当前使用{mode}兑换；点击切换。",
      guildTokenExchangeNeeds: "代币兑换需",
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
      creditValueHint: "按目标数量比较公开市场成本，首项为当前最优兑换。",
      shrineUpgrade: "神龛升级",
      targetCredits: "目标信用点",
      marketReference: "市场价格参考",
      priceReference: "价格参考",
      refreshEstimate: "刷新市场估算",
      waitingExchangeRules: "等待游戏兑换数据...",
      guildShrineBatchPlan: "按当前公会神龛等级批量规划",
      setGuildLifeTarget: "填充生活等级",
      setGuildCombatTarget: "填充战斗等级",
      selectedUpgradePlanCount: "已选择 {count} 项升级计划",
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
      inventoryCoveredNoExchange: "Existing inventory covers this requirement; no exchange is needed",
      backpackInventory: "Backpack: {count}",
      notRead: "unavailable",
      useGuildTokensForMissingCredits: "Use guild tokens for every credit",
      useGuildTokensForMissingCreditsHint: "Select or clear all, or switch each credit card individually below.",
      guildTokenCreditPlanActive: "Every missing credit is calculated as a guild-token exchange.",
      guildTokenCreditPlanPartialActive: "{count} credit type(s) use guild-token exchanges.",
      guildTokenCreditPlanSummary: "{count} guild tokens are allocated to credit exchanges.",
      autoGuildTokenBudget: "Automatic token budget",
      autoGuildTokenBudgetHint: "Allocates tokens from highest to lowest current market exchange value.",
      autoGuildTokenBudgetAvailable: "Up to {count} available",
      autoGuildTokenPlanSummary: "Automatically allocated {count} inventory guild tokens by exchange value.",
      autoGuildTokenExchangeNeeds: "Auto-allocated tokens",
      autoGuildTokenCoverage: "Covers {count} credits",
      optimalItemCreditMode: "Best item",
      guildTokenCreditMode: "Guild tokens",
      creditExchangeModeTitle: "Current mode: {mode}. Click to switch.",
      guildTokenExchangeNeeds: "Tokens needed",
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
      creditValueHint: "Compare public market costs for the target amount; the first item is the current best exchange.",
      shrineUpgrade: "Shrine upgrades",
      targetCredits: "Target credits",
      marketReference: "Market price reference",
      priceReference: "Price reference",
      refreshEstimate: "Refresh market estimate",
      waitingExchangeRules: "Waiting for game exchange data...",
      guildShrineBatchPlan: "Batch plan by current guild shrine levels",
      setGuildLifeTarget: "Fill Life levels",
      setGuildCombatTarget: "Fill Combat levels",
      selectedUpgradePlanCount: "{count} upgrade plan(s) selected",
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

  const DEFAULT_GUILD_TOKEN_BUDGET_SNAP_PERCENTAGES = [20, 40, 50, 60, 80, 100];

  function guildTokenBudgetPercentage(value, maximum) {
    const max = Math.max(0, Math.floor(Number(maximum) || 0));
    if (!max) return 0;
    const clamped = Math.min(max, Math.max(0, Math.floor(Number(value) || 0)));
    return Math.round(clamped / max * 100);
  }

  function snapGuildTokenBudget(rawValue, maximum, options = {}) {
    const max = Math.max(0, Math.floor(Number(maximum) || 0));
    const value = Math.min(max, Math.max(0, Math.floor(Number(rawValue) || 0)));
    if (!max) return { value: 0, percentage: 0, snappedTo: null };
    const snapPercentages = (Array.isArray(options.snapPercentages) ? options.snapPercentages : DEFAULT_GUILD_TOKEN_BUDGET_SNAP_PERCENTAGES)
      .map(Number)
      .filter((percentage) => Number.isFinite(percentage) && percentage > 0 && percentage <= 100);
    const threshold = Math.max(0, Number(options.thresholdPercentage ?? 2.5) || 0);
    const rawPercentage = value / max * 100;
    const snappedTo = snapPercentages.reduce((nearest, percentage) => {
      if (nearest === null) return percentage;
      return Math.abs(percentage - rawPercentage) < Math.abs(nearest - rawPercentage) ? percentage : nearest;
    }, null);
    if (snappedTo === null || Math.abs(snappedTo - rawPercentage) > threshold) {
      return { value, percentage: guildTokenBudgetPercentage(value, max), snappedTo: null };
    }
    const snappedValue = Math.min(max, Math.max(0, Math.round(max * snappedTo / 100)));
    return { value: snappedValue, percentage: guildTokenBudgetPercentage(snappedValue, max), snappedTo };
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

  function allocateSurplusGuildTokens(creditRows, exchangeRules, availableGuildTokens) {
    const budget = Math.max(0, Math.floor(Number(availableGuildTokens) || 0));
    const rules = new Map();
    for (const rule of Array.isArray(exchangeRules) ? exchangeRules : []) {
      const creditItemHrid = rule && rule.creditItemHrid;
      const guildTokenCount = positiveInteger(rule && rule.guildTokenCount);
      const creditCount = positiveInteger(rule && rule.creditCount);
      if (!creditItemHrid || !guildTokenCount || !creditCount || rules.has(creditItemHrid)) continue;
      rules.set(creditItemHrid, { creditItemHrid, guildTokenCount, creditCount });
    }

    const candidates = (Array.isArray(creditRows) ? creditRows : []).map((row) => {
      const rule = row && rules.get(row.itemHrid);
      const missing = Math.max(0, Number(row && row.missing) || 0);
      const unitCost = Number(row && row.unitCost);
      if (!rule || missing <= 0 || !Number.isFinite(unitCost) || unitCost <= 0) return null;
      return {
        ...rule,
        missing,
        goldValuePerToken: unitCost * rule.creditCount / rule.guildTokenCount
      };
    }).filter(Boolean).sort((left, right) => (
      right.goldValuePerToken - left.goldValuePerToken
      || left.creditItemHrid.localeCompare(right.creditItemHrid)
    ));

    let remainingGuildTokens = budget;
    const allocations = [];
    for (const candidate of candidates) {
      const affordableBatches = Math.floor(remainingGuildTokens / candidate.guildTokenCount);
      const requiredBatches = Math.ceil(candidate.missing / candidate.creditCount);
      const batches = Math.min(affordableBatches, requiredBatches);
      if (batches <= 0) continue;
      const spentGuildTokens = batches * candidate.guildTokenCount;
      const actualCredits = batches * candidate.creditCount;
      allocations.push({
        ...candidate,
        batches,
        actualCredits,
        coveredCredits: Math.min(candidate.missing, actualCredits),
        spentGuildTokens
      });
      remainingGuildTokens -= spentGuildTokens;
    }

    return {
      availableGuildTokens: budget,
      spentGuildTokens: budget - remainingGuildTokens,
      remainingGuildTokens,
      allocations
    };
  }

  function estimateGuildUpgradeCosts(totals, creditUnitCosts, inventoryCounts, options) {
    const unitCosts = creditUnitCosts && typeof creditUnitCosts === "object" ? creditUnitCosts : {};
    const inventory = inventoryCounts && typeof inventoryCounts === "object" ? inventoryCounts : {};
    const settings = options && typeof options === "object" ? options : {};
    const autoAllocateSurplusGuildTokens = settings.autoAllocateSurplusGuildTokens === true;
    const useGuildTokensForAllMissingCredits = settings.useGuildTokensForMissingCredits === true;
    const guildTokenCreditHrids = new Set(
      Array.isArray(settings.guildTokenCreditHrids)
        ? settings.guildTokenCreditHrids.filter((itemHrid) => typeof itemHrid === "string" && itemHrid)
        : []
    );
    const useGuildTokensForMissingCredits = useGuildTokensForAllMissingCredits || guildTokenCreditHrids.size > 0;
    const guildTokenCreditRules = new Map();
    for (const rule of Array.isArray(settings.guildTokenCreditConversions) ? settings.guildTokenCreditConversions : []) {
      const creditItemHrid = rule && rule.creditItemHrid;
      const guildTokenCount = positiveInteger(rule && rule.guildTokenCount);
      const creditCount = positiveInteger(rule && rule.creditCount);
      if (!creditItemHrid || !guildTokenCount || !creditCount || guildTokenCreditRules.has(creditItemHrid)) continue;
      guildTokenCreditRules.set(creditItemHrid, { creditItemHrid, guildTokenCount, creditCount });
    }
    const rows = [];
    const unpricedItemHrids = [];
    let totalGold = 0;
    let missingGold = 0;
    let guildTokensRequired = 0;
    const guildTokensOwned = Math.max(0, Number(inventory["/items/guild_token"]) || 0);
    let guildTokenCreditExchangeRequired = 0;
    let guildTokenRow = null;

    for (const item of Array.isArray(totals) ? totals : []) {
      const itemHrid = item && item.itemHrid;
      const required = Number(item && item.count);
      if (!itemHrid || !Number.isFinite(required) || required <= 0) continue;
      const owned = Math.max(0, Number(inventory[itemHrid]) || 0);
      const missing = Math.max(0, required - owned);
      if (itemHrid === "/items/guild_token") {
        guildTokensRequired += required;
        guildTokenRow = { itemHrid, required, owned, missing, unitCost: null, totalCost: null, missingCost: null };
        rows.push(guildTokenRow);
        continue;
      }
      const guildTokenRule = (useGuildTokensForAllMissingCredits || guildTokenCreditHrids.has(itemHrid))
        && guildTokenCreditRules.get(itemHrid);
      if (guildTokenRule) {
        const batches = missing > 0 ? Math.ceil(missing / guildTokenRule.creditCount) : 0;
        const requiredGuildTokens = batches * guildTokenRule.guildTokenCount;
        guildTokenCreditExchangeRequired += requiredGuildTokens;
        rows.push({
          itemHrid,
          required,
          owned,
          missing,
          unitCost: null,
          totalCost: null,
          missingCost: null,
          guildTokenExchange: {
            ...guildTokenRule,
            batches,
            actualCredits: batches * guildTokenRule.creditCount,
            requiredGuildTokens
          }
        });
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

    const manualGuildTokenCreditExchangeRequired = guildTokenCreditExchangeRequired;
    const reservedGuildTokens = guildTokensRequired + manualGuildTokenCreditExchangeRequired;
    const availableSurplusGuildTokens = autoAllocateSurplusGuildTokens
      ? Math.max(0, Math.floor(guildTokensOwned - reservedGuildTokens))
      : 0;
    const requestedAutoGuildTokenBudget = Number(settings.autoGuildTokenBudget);
    const hasConfiguredAutoGuildTokenBudget = settings.autoGuildTokenBudget !== null
      && settings.autoGuildTokenBudget !== undefined
      && Number.isFinite(requestedAutoGuildTokenBudget)
      && requestedAutoGuildTokenBudget >= 0;
    const autoGuildTokenBudget = hasConfiguredAutoGuildTokenBudget
      ? Math.min(availableSurplusGuildTokens, Math.floor(requestedAutoGuildTokenBudget))
      : availableSurplusGuildTokens;
    const autoGuildTokenPlan = allocateSurplusGuildTokens(rows, Array.from(guildTokenCreditRules.values()), autoGuildTokenBudget);
    const autoAllocationsByCredit = new Map(autoGuildTokenPlan.allocations.map((allocation) => [allocation.creditItemHrid, allocation]));
    if (autoAllocateSurplusGuildTokens) {
      for (const row of rows) {
        if (!guildTokenCreditRules.has(row.itemHrid) || row.guildTokenExchange) continue;
        const allocation = autoAllocationsByCredit.get(row.itemHrid);
        row.remainingMissing = row.missing;
        if (!allocation) continue;
        row.autoGuildTokenExchange = allocation;
        row.remainingMissing = Math.max(0, row.missing - allocation.coveredCredits);
        if (row.unitCost !== null) {
          const coveredGold = allocation.coveredCredits * row.unitCost;
          totalGold = Math.max(0, totalGold - coveredGold);
          missingGold = Math.max(0, missingGold - coveredGold);
          row.totalCost = Math.max(0, row.totalCost - coveredGold);
          row.missingCost = row.remainingMissing * row.unitCost;
        }
      }
    }
    const autoGuildTokenCreditExchangeUsed = autoGuildTokenPlan.spentGuildTokens;
    guildTokenCreditExchangeRequired += autoGuildTokenCreditExchangeUsed;
    guildTokensRequired += guildTokenCreditExchangeRequired;
    const guildTokensMissing = Math.max(0, guildTokensRequired - guildTokensOwned);
    if (guildTokensRequired > 0) {
      if (!guildTokenRow) {
        guildTokenRow = {
          itemHrid: "/items/guild_token",
          required: guildTokensRequired,
          owned: guildTokensOwned,
          missing: guildTokensMissing,
          unitCost: null,
          totalCost: null,
          missingCost: null
        };
        rows.push(guildTokenRow);
      } else {
        guildTokenRow.required = guildTokensRequired;
        guildTokenRow.missing = guildTokensMissing;
      }
      guildTokenRow.shrineRequired = guildTokensRequired - guildTokenCreditExchangeRequired;
      guildTokenRow.creditExchangeRequired = guildTokenCreditExchangeRequired;
      if (autoAllocateSurplusGuildTokens) {
        guildTokenRow.manualCreditExchangeRequired = manualGuildTokenCreditExchangeRequired;
        guildTokenRow.autoCreditExchangeUsed = autoGuildTokenCreditExchangeUsed;
      }
    }

    return {
      status: unpricedItemHrids.length ? "partial" : "ok",
      totalGold,
      missingGold,
      guildTokensRequired,
      guildTokensOwned,
      guildTokensMissing,
      guildTokenCreditExchangeRequired,
      manualGuildTokenCreditExchangeRequired,
      autoGuildTokenCreditExchangeUsed,
      autoGuildTokenBudgetAvailable: availableSurplusGuildTokens,
      autoGuildTokenBudget,
      autoGuildTokenAllocations: autoGuildTokenPlan.allocations,
      useGuildTokensForMissingCredits: useGuildTokensForMissingCredits || autoGuildTokenCreditExchangeUsed > 0,
      guildTokenCreditHrids: Array.from(guildTokenCreditHrids),
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

  return { normalizeAsks, quoteAsks, evaluateConversion, rankConversions, rankGuildTokenCreditValues, evaluateBudgetConversion, bestConversionForBudget, calculateSaleProceeds, estimateSaleReplacement, snapshotMarketPrice, formatCompactCost, compareVersions, aggregateGuildBuffLevelCosts, aggregateGuildBuffPlans, allocateSurplusGuildTokens, estimateGuildUpgradeCosts, conversionsFromItemDetails, guildTokenBudgetPercentage, snapGuildTokenBudget };
});


(function () {
  "use strict";

  const core = window.MwiGuildCreditCore;
  const marketDataApi = window.MwiGuildCreditMarketData;
  const itemNameCatalogApi = window.MwiGuildCreditItemNameCatalog;
  const releaseInfoApi = window.MwiGuildCreditReleaseInfo;
  const localizationApi = window.MwiGuildCreditLocalization;
  if (!core || !marketDataApi || !itemNameCatalogApi || !releaseInfoApi || !localizationApi) return;
  const pageWindow = typeof unsafeWindow === "undefined" ? window : unsafeWindow;
  const PLUGIN_VERSION = String(window.MwiGuildCreditVersion || "0.0.0");
  const UPDATE_SCRIPT_URL = "https://raw.githubusercontent.com/LaYuDr/milky-way-idle-guild-credit-optimizer/main/dist/milky-way-idle-guild-credit-optimizer.user.js";
  // Manual-install fallback only. Keep automatic update checks on the
  // first-party GitHub build, because this URL opens Tampermonkey's installer
  // page rather than returning a userscript payload.
  const FALLBACK_INSTALL_URL = "https://www.tampermonkey.net/script_installation.php#url=https://js.nainai.eu.org/proxy/https://update.greasyfork.org/scripts/586873/%E9%93%B6%E6%B2%B3%E5%A5%B6%E7%89%9B%E5%85%AC%E4%BC%9A%E4%BF%A1%E7%94%A8%E7%82%B9%E6%80%A7%E4%BB%B7%E6%AF%94.user.js";
  const PRICE_REFERENCE_STORAGE_KEY = "mwi-credit-price-reference";
  const UI_STATE_STORAGE_KEY = "mwi-guild-credit-ui-state-v1";
  const MARKET_LIVE_STORAGE_KEY = "mwi-guild-credit-live-market-v1";
  const UPDATE_CHECK_TIMEOUT_MS = 8000;
  // Keep the former select-all shortcut available for a future rollback, but
  // do not render it while per-credit exchange modes are the primary control.
  const SHOW_ALL_CREDIT_TOKEN_TOGGLE = false;
  const PRICE_REFERENCES = { a: {}, b: {} };
  const GUILD_TOKEN_BUDGET_SNAP_PERCENTAGES = [20, 40, 50, 60, 80, 100];
  const GUILD_TOKEN_BUDGET_SNAP_THRESHOLD_PERCENTAGE = 2.5;
  const RENDERED_MARKUP_PROPERTY = "__mwiGuildCreditRenderedMarkup";

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
  const savedMarketState = loadSavedLiveMarketData();
  const itemNameCatalog = itemNameCatalogApi.createItemNameCatalog({ pageWindow, document, storage: pageWindow.localStorage, version: PLUGIN_VERSION });
  const updateChecker = releaseInfoApi.createVersionChecker({ fetchImpl: pageWindow.fetch && pageWindow.fetch.bind(pageWindow), url: UPDATE_SCRIPT_URL, timeoutMs: UPDATE_CHECK_TIMEOUT_MS, setTimeout: pageWindow.setTimeout && pageWindow.setTimeout.bind(pageWindow), clearTimeout: pageWindow.clearTimeout && pageWindow.clearTimeout.bind(pageWindow), AbortController: pageWindow.AbortController });
  const state = { itemDetails: null, conversionCache: new Map(), guildBuffDetails: null, guildBuffLevels: null, guildShrineLevels: null, guildShrineDetails: null, characterItems: null, characterItemsBridgeRevision: 0, inventoryDataRefreshTimer: null, itemNameCatalogLastRefresh: 0, itemNameCatalogReady: false, itemNameCatalogRetryCount: 0, upgradePlans: savedUiState.upgradePlans.map((plan, index) => ({ id: `plan-${index + 1}`, ...plan })), nextUpgradePlanId: savedUiState.upgradePlans.length + 1, suppressUpgradePlanAutofill: false, upgradePresetNotice: "", guildTokenCreditHrids: new Set(savedUiState.guildTokenCreditHrids), autoGuildTokenBudget: savedUiState.autoGuildTokenBudget, snapshot: null, snapshotTimestamp: 0, marketSnapshotCandidateSignature: "", marketSnapshotCandidateTimestamp: 0, marketSnapshotCandidateConfirmations: 0, marketLiveData: savedMarketState.liveData, marketLiveRevision: savedMarketState.revision, marketBridgeRevision: 0, marketUpdateSignatures: Object.create(null), marketDataRefreshTimer: null, priceReference: savedPriceReference(), targetCredit: savedUiState.targetCredit, panel: null, creditTab: null, hiddenSidebarNodes: [], refreshTimer: null, refreshInFlight: false, refreshQueued: false, panelSearchTimer: null, collapsedCreditSections: new Set(savedUiState.collapsedCreditSections), guildTokenValuesCollapsed: savedUiState.guildTokenValuesCollapsed, upgradeRefreshId: 0, exchangeAdvisorUi: null, exchangeAdvisorFrame: null, exchangeAdvisorForceRender: false, exchangeAdvisorRootObserver: null, exchangeAdvisorModalObserver: null, exchangeAdvisorObservedModal: null, exchangeAdvisorListenersInstalled: false, exchangeAdvisorLoadInFlight: false, exchangeAdvisorSnapshotFailed: false };
  let sidebarIntegrationTimer = null;
  let guildTokenBudgetRefreshTimer = null;

  function updateRenderedMarkup(element, markup) {
    if (!element || element[RENDERED_MARKUP_PROPERTY] === markup) return false;
    element.innerHTML = markup;
    element[RENDERED_MARKUP_PROPERTY] = markup;
    return true;
  }

  function loadSavedPluginUiState() {
    const fallback = { collapsedCreditSections: [], guildTokenValuesCollapsed: false, guildTokenCreditHrids: [], autoGuildTokenBudget: null, targetCredit: 1, upgradePlans: [] };
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
      const guildTokenCreditHrids = Array.isArray(stored.guildTokenCreditHrids)
        ? Array.from(new Set(stored.guildTokenCreditHrids.filter((hrid) => creditHrids.has(hrid))))
        : stored.useGuildTokensForMissingCredits === true
          ? Array.from(creditHrids)
          : [];
      const autoGuildTokenBudgetValue = Number(stored.autoGuildTokenBudget);
      const autoGuildTokenBudget = stored.autoGuildTokenBudget === null || stored.autoGuildTokenBudget === undefined
        ? null
        : Number.isSafeInteger(autoGuildTokenBudgetValue) && autoGuildTokenBudgetValue >= 0
          ? autoGuildTokenBudgetValue
          : null;
      return {
        collapsedCreditSections,
        guildTokenValuesCollapsed: stored.guildTokenValuesCollapsed === true,
        guildTokenCreditHrids,
        autoGuildTokenBudget,
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
        guildTokenCreditHrids: Array.from(state.guildTokenCreditHrids),
        autoGuildTokenBudget: state.autoGuildTokenBudget,
        useGuildTokensForMissingCredits: CREDIT_TYPES.every(([hrid]) => state.guildTokenCreditHrids.has(hrid)),
        targetCredit: state.targetCredit,
        upgradePlans
      }));
    } catch (_) {
      // Keep the current page state when browser storage is unavailable.
    }
  }

  function loadSavedLiveMarketData() {
    try {
      const raw = pageWindow.localStorage && pageWindow.localStorage.getItem(MARKET_LIVE_STORAGE_KEY);
      return marketDataApi.restoreLiveMarketData(raw);
    } catch (_) {
      return { liveData: Object.create(null), revision: 0, valid: false };
    }
  }

  function persistLiveMarketData() {
    try {
      if (!pageWindow.localStorage) return;
      if (!Object.keys(state.marketLiveData).length) {
        pageWindow.localStorage.removeItem(MARKET_LIVE_STORAGE_KEY);
        return;
      }
      const cache = marketDataApi.serializeLiveMarketData(state.marketLiveData, {
        revision: state.marketLiveRevision
      });
      pageWindow.localStorage.setItem(MARKET_LIVE_STORAGE_KEY, JSON.stringify(cache));
    } catch (_) {
      // A storage quota or privacy restriction must not interrupt the game.
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

  function rememberLiveMarketUpdate(update, receivedAt) {
    if (!update) return false;
    const signature = JSON.stringify(update.levels);
    const observedAt = Number(receivedAt);
    if ((!Number.isFinite(observedAt) || observedAt <= 0)
      && state.marketUpdateSignatures[update.itemHrid] === signature) return false;
    state.marketUpdateSignatures[update.itemHrid] = signature;
    state.marketLiveRevision = Math.min(Number.MAX_SAFE_INTEGER, state.marketLiveRevision + 1);
    const changed = marketDataApi.applyLiveMarketUpdate(state.marketLiveData, update, {
      revision: state.marketLiveRevision,
      receivedAt: observedAt || Date.now(),
      snapshotTimestamp: state.snapshotTimestamp
    });
    if (changed) {
      persistLiveMarketData();
      scheduleMarketDataRefresh();
    }
    return changed;
  }

  function rememberLiveMarketMessage(message, receivedAt) {
    if (!message || String(message.type || "") !== "market_item_order_books_updated") return false;
    return rememberLiveMarketUpdate(
      marketDataApi.normalizeMarketOrderBooksUpdate(message),
      receivedAt
    );
  }

  function hydrateBridgeData() {
    const bridge = window.__mwiGuildCreditBridge;
    if (!bridge || typeof bridge !== "object") return false;
    let marketChanged = false;
    bridge.onMarketOrderBooksUpdated = hydrateBridgeData;
    bridge.onCharacterItemsUpdated = hydrateBridgeData;
    setItemDetails(bridge.itemDetails);
    setGuildBuffDetails(bridge.guildBuffDetails);
    setGuildBuffLevelsFrom(bridge);
    setGuildShrineLevelsFrom(bridge);
    setGuildShrineDetailsFrom(bridge);
    const characterItemsRevision = Number(bridge.characterItemsRevision);
    if (Number.isSafeInteger(characterItemsRevision)) {
      if (characterItemsRevision > state.characterItemsBridgeRevision) {
        if (setCharacterItems(bridge.characterItems)) scheduleInventoryDataRefresh();
        state.characterItemsBridgeRevision = characterItemsRevision;
      } else if (!state.characterItems) {
        setCharacterItems(bridge.characterItems);
      }
    } else {
      setCharacterItems(bridge.characterItems);
    }
    const bridgeRevision = Number(bridge.marketOrderBookRevision);
    if (Number.isSafeInteger(bridgeRevision) && bridgeRevision > state.marketBridgeRevision) {
      const records = Object.values(bridge.marketOrderBooks || {})
        .filter((record) => record && Number(record.revision) > state.marketBridgeRevision)
        .sort((left, right) => Number(left.revision) - Number(right.revision));
      for (const record of records) {
        marketChanged = rememberLiveMarketUpdate(record.update, record.receivedAt) || marketChanged;
      }
      state.marketBridgeRevision = bridgeRevision;
    }
    if (Array.isArray(bridge.messages) && bridge.marketObserverActive !== true) {
      const latestMarketUpdates = new Map();
      for (const rawMessage of bridge.messages) {
        try {
          const message = JSON.parse(rawMessage);
          if (String(message && message.type || "") !== "market_item_order_books_updated") continue;
          const update = marketDataApi.normalizeMarketOrderBooksUpdate(message);
          if (update) latestMarketUpdates.set(update.itemHrid, update);
        } catch (_) {
          // Ignore non-JSON protocol frames.
        }
      }
      for (const update of latestMarketUpdates.values()) {
        marketChanged = rememberLiveMarketUpdate(update) || marketChanged;
      }
    }
    // Current bridges already reconcile characterItems snapshots with
    // endCharacterItems deltas. Only replay raw messages for an older bridge;
    // otherwise an old initialization frame could overwrite the live array.
    if (Array.isArray(bridge.messages) && !Number.isSafeInteger(characterItemsRevision)) {
      for (let index = bridge.messages.length - 1; index >= 0; index -= 1) {
        const rawMessage = bridge.messages[index];
        try {
          const message = JSON.parse(rawMessage);
          scanMessage(message, 0);
        } catch (_) {
          // Ignore non-JSON protocol frames.
        }
      }
    }
    return marketChanged;
  }

  function clearMarketSnapshotCandidate() {
    state.marketSnapshotCandidateSignature = "";
    state.marketSnapshotCandidateTimestamp = 0;
    state.marketSnapshotCandidateConfirmations = 0;
  }

  function confirmMissingMarketSnapshot(marketData, marketTimestamp) {
    const signature = JSON.stringify(marketDataApi.createMarketStructure(marketData));
    const normalizedTimestamp = marketDataApi.normalizeMarketTimestamp(marketTimestamp);
    const matchesCandidate = state.marketSnapshotCandidateSignature === signature
      && normalizedTimestamp >= state.marketSnapshotCandidateTimestamp;
    state.marketSnapshotCandidateSignature = signature;
    state.marketSnapshotCandidateTimestamp = normalizedTimestamp;
    state.marketSnapshotCandidateConfirmations = matchesCandidate
      ? Math.min(2, state.marketSnapshotCandidateConfirmations + 1)
      : 1;
    return state.marketSnapshotCandidateConfirmations >= 2;
  }

  async function loadSnapshot(force) {
    if (state.snapshot && !force) return state.snapshot;
    const liveRevisionAtRequestStart = state.marketLiveRevision;
    const response = await fetch("/game_data/marketplace.json", { cache: "no-store" });
    if (!response.ok) throw new Error(t("snapshotLoadFailed", { message: response.status }));
    const rawSnapshot = await response.json();
    const marketData = marketDataApi.sanitizeMarketData(rawSnapshot && rawSnapshot.marketData);
    if (!Object.keys(marketData).length) throw new Error("Marketplace payload is empty.");
    const snapshot = { ...rawSnapshot, marketData };
    const nextTimestamp = marketDataApi.normalizeMarketTimestamp(snapshot && snapshot.timestamp);
    if (nextTimestamp <= 0) throw new Error("Marketplace payload has no valid timestamp.");
    if (state.snapshotTimestamp > 0 && nextTimestamp > 0 && nextTimestamp < state.snapshotTimestamp) {
      return state.snapshot;
    }
    const confirmedMarketData = state.snapshot && state.snapshot.marketData;
    const missingCount = marketDataApi.countMissingMarketEntries(confirmedMarketData, marketData);
    if (missingCount > 0 && nextTimestamp === state.snapshotTimestamp) {
      clearMarketSnapshotCandidate();
      return state.snapshot;
    }
    if (missingCount > 0 && !confirmMissingMarketSnapshot(marketData, nextTimestamp)) {
      return state.snapshot;
    }
    const reconciliation = marketDataApi.reconcileLiveMarketData(state.marketLiveData, {
      previousSnapshotTimestamp: state.snapshotTimestamp,
      nextSnapshotTimestamp: nextTimestamp,
      coveredRevision: liveRevisionAtRequestStart,
      snapshotData: marketData
    });
    if (reconciliation.changed) {
      state.marketUpdateSignatures = Object.create(null);
      persistLiveMarketData();
    }
    state.snapshot = snapshot;
    state.snapshotTimestamp = nextTimestamp || state.snapshotTimestamp;
    clearMarketSnapshotCandidate();
    return state.snapshot;
  }

  function snapshotOrderBook(itemHrid, reference = state.priceReference) {
    const price = snapshotPrice(itemHrid, reference);
    return price === null ? null : { asks: [{ price, quantity: Number.MAX_SAFE_INTEGER }] };
  }

  function snapshotPrice(itemHrid, field, enhancementLevel = 0) {
    return marketDataApi.resolveMarketPrice(
      state.snapshot,
      state.marketLiveData,
      itemHrid,
      enhancementLevel,
      field
    );
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

  function creditConversionGroups() {
    return CREDIT_TYPES.map(([creditItemHrid, color]) => ({ creditItemHrid, color, conversions: allConversions(creditItemHrid) }));
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
    const bridge = window.__mwiGuildCreditBridge;
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
    const tokenCreditTargets = Object.fromEntries(GUILD_TOKEN_CREDIT_CONVERSIONS.map((rule) => [rule.creditItemHrid, rule.creditCount]));
    return Object.fromEntries(Object.entries(bestCreditConversions(tokenCreditTargets)).map(([creditItemHrid, best]) => [creditItemHrid, best ? best.costPerCredit : null]));
  }

  function bestCreditMaterialPlans(estimate) {
    const missingCredits = Object.fromEntries((estimate && estimate.rows || []).map((row) => [row.itemHrid, row.remainingMissing ?? row.missing]));
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

  function removeGuildUpgradePlan(planId) {
    const previousLength = state.upgradePlans.length;
    state.upgradePlans = state.upgradePlans.filter((plan) => plan.id !== planId);
    if (state.upgradePlans.length === previousLength) return false;
    const removedLastPlan = state.upgradePlans.length === 0;
    // Removing plans one by one must be able to reach the same empty state as
    // the dedicated clear button instead of immediately adding a default row.
    state.suppressUpgradePlanAutofill = removedLastPlan;
    state.upgradePresetNotice = removedLastPlan ? t("plansCleared") : "";
    return true;
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
    const plansMarkup = state.upgradePlans.map((plan) => {
      const entry = entries.find((candidate) => candidate.hrid === plan.guildBuffHrid);
      if (!entry) return "";
      const buffOptions = entries.map((candidate) => `<option value="${escapeHtml(candidate.hrid)}" ${candidate.hrid === plan.guildBuffHrid ? "selected" : ""} ${candidate.hrid !== plan.guildBuffHrid && (plannedHrids.has(candidate.hrid) || currentGuildBuffLevel(candidate) >= candidate.maxLevel) ? "disabled" : ""}>${escapeHtml(guildBuffLabel(candidate.detail, candidate.hrid))}</option>`).join("");
      return `<div class="mwi-upgrade-plan" data-plan-id="${escapeHtml(plan.id)}">
        <label class="mwi-upgrade-plan-shrine"><span class="mwi-upgrade-field-label">${escapeHtml(t("shrine"))}</span><select data-role="plan-buff" aria-label="${escapeHtml(t("shrine"))}">${buffOptions}</select></label>
        <label class="mwi-upgrade-plan-start"><span class="mwi-upgrade-field-label">${escapeHtml(t("startLevel"))}</span><select data-role="plan-start" aria-label="${escapeHtml(t("startLevel"))}">${levelOptionMarkup(0, entry.maxLevel - 1, plan.startLevel)}</select></label>
        <span class="mwi-upgrade-level-arrow" aria-hidden="true">→</span>
        <label class="mwi-upgrade-plan-target"><span class="mwi-upgrade-field-label">${escapeHtml(t("targetLevel"))}</span><select data-role="plan-target" aria-label="${escapeHtml(t("targetLevel"))}">${levelOptionMarkup(plan.startLevel + 1, entry.maxLevel, plan.targetLevel)}</select></label>
        <button class="mwi-remove-plan" data-role="remove-plan" type="button" title="${escapeHtml(t("removePlan"))}" aria-label="${escapeHtml(t("removePlan"))}">×</button>
      </div>`;
    }).join("");
    const columnHeaders = state.upgradePlans.length ? `<div class="mwi-upgrade-plan-columns" aria-hidden="true"><span>${escapeHtml(t("shrine"))}</span><span>${escapeHtml(t("startLevel"))}</span><span></span><span>${escapeHtml(t("targetLevel"))}</span><span></span></div>` : "";
    updateRenderedMarkup(list, columnHeaders + plansMarkup);
    const count = panel.querySelector('[data-role="upgrade-plan-count"]');
    if (count) count.textContent = t("selectedUpgradePlanCount", { count: formatNumber(state.upgradePlans.length) });
    updateGuildShrineTargetActions(panel, entries);
  }

  function guildTokenCreditSelectionState() {
    const selectedCount = CREDIT_TYPES.reduce((count, [hrid]) => count + (state.guildTokenCreditHrids.has(hrid) ? 1 : 0), 0);
    return {
      selectedCount,
      allSelected: selectedCount === CREDIT_TYPES.length,
      partiallySelected: selectedCount > 0 && selectedCount < CREDIT_TYPES.length
    };
  }

  function updateGuildTokenCreditPlanButton(panel) {
    const button = panel.querySelector('[data-role="toggle-guild-token-credit-plan"]');
    if (!button) return;
    const selection = guildTokenCreditSelectionState();
    const activeState = selection.allSelected ? "true" : selection.partiallySelected ? "mixed" : "false";
    button.dataset.active = activeState;
    button.setAttribute("aria-pressed", activeState);
    const indicator = button.querySelector(".mwi-token-credit-plan-indicator");
    if (indicator) indicator.textContent = selection.allSelected ? "✓" : selection.partiallySelected ? "−" : "";
  }

  function renderGuildTokenCreditPlanToggle() {
    if (!SHOW_ALL_CREDIT_TOKEN_TOGGLE) return "";
    const selection = guildTokenCreditSelectionState();
    const activeState = selection.allSelected ? "true" : selection.partiallySelected ? "mixed" : "false";
    const indicator = selection.allSelected ? "✓" : selection.partiallySelected ? "−" : "";
    return `<button class="mwi-token-credit-plan-toggle" data-role="toggle-guild-token-credit-plan" data-active="${activeState}" type="button" aria-pressed="${activeState}"><span class="mwi-token-credit-plan-indicator" aria-hidden="true">${indicator}</span><span class="mwi-token-credit-plan-copy"><strong>${escapeHtml(t("useGuildTokensForMissingCredits"))}</strong><small>${escapeHtml(t("useGuildTokensForMissingCreditsHint"))}</small></span></button>`;
  }

  function renderGuildTokenBudgetControl() {
    const snapMarks = GUILD_TOKEN_BUDGET_SNAP_PERCENTAGES.map((percentage) => `<i data-percentage="${percentage}" style="--mwi-snap-position:${percentage}%"></i>`).join("");
    return `<section class="mwi-token-budget" data-role="guild-token-budget-control"><div class="mwi-token-budget-heading"><strong>${escapeHtml(t("autoGuildTokenBudget"))}</strong><small>${escapeHtml(t("autoGuildTokenBudgetHint"))}</small></div><div class="mwi-token-budget-inputs"><span class="mwi-token-budget-range-wrap"><input data-role="guild-token-budget-range" type="range" min="0" max="0" step="1" value="0" disabled aria-label="${escapeHtml(t("autoGuildTokenBudget"))}"><span class="mwi-token-budget-snap-points" aria-hidden="true">${snapMarks}</span></span><output class="mwi-token-budget-percent" data-role="guild-token-budget-percent" aria-live="polite">0%</output><label><input data-role="guild-token-budget-number" type="number" min="0" max="0" step="1" value="0" disabled><span>${escapeHtml(t("guildTokens"))}</span></label></div><span class="mwi-token-budget-available" data-role="guild-token-budget-available">${escapeHtml(t("autoGuildTokenBudgetAvailable", { count: "0" }))}</span></section>`;
  }

  function updateGuildTokenBudgetPercentage(panel, value, max, snappedTo = null) {
    const range = panel.querySelector('[data-role="guild-token-budget-range"]');
    const output = panel.querySelector('[data-role="guild-token-budget-percent"]');
    if (!range || !output) return;
    const percentage = core.guildTokenBudgetPercentage(value, max);
    output.value = `${percentage}%`;
    output.textContent = `${percentage}%`;
    output.dataset.snapped = String(snappedTo !== null);
    range.setAttribute("aria-valuetext", `${percentage}% · ${formatNumber(value)} ${t("guildTokens")}`);
  }

  function updateGuildTokenBudgetControl(panel, estimate, hasInventory) {
    const range = panel.querySelector('[data-role="guild-token-budget-range"]');
    const number = panel.querySelector('[data-role="guild-token-budget-number"]');
    const available = panel.querySelector('[data-role="guild-token-budget-available"]');
    if (!range || !number || !available) return;
    const max = hasInventory && estimate ? Math.max(0, Math.floor(Number(estimate.autoGuildTokenBudgetAvailable) || 0)) : 0;
    const effective = state.autoGuildTokenBudget === null ? max : Math.min(max, state.autoGuildTokenBudget);
    for (const input of [range, number]) {
      input.max = String(max);
      input.value = String(effective);
      input.disabled = !hasInventory;
    }
    const effectivePercentage = core.guildTokenBudgetPercentage(effective, max);
    const snappedTo = range.dataset.dragging === "true" && GUILD_TOKEN_BUDGET_SNAP_PERCENTAGES.includes(effectivePercentage) ? effectivePercentage : null;
    updateGuildTokenBudgetPercentage(panel, effective, max, snappedTo);
    available.textContent = t("autoGuildTokenBudgetAvailable", { count: formatNumber(max) });
  }

  function setGuildTokenBudget(panel, rawValue, options = {}) {
    const range = panel.querySelector('[data-role="guild-token-budget-range"]');
    const number = panel.querySelector('[data-role="guild-token-budget-number"]');
    if (!range || !number || rawValue === "") return;
    const max = Math.max(0, Number(range.max) || 0);
    const resolved = options.snap
      ? core.snapGuildTokenBudget(rawValue, max, { snapPercentages: GUILD_TOKEN_BUDGET_SNAP_PERCENTAGES, thresholdPercentage: GUILD_TOKEN_BUDGET_SNAP_THRESHOLD_PERCENTAGE })
      : { value: Math.min(max, Math.max(0, Math.floor(Number(rawValue) || 0))), snappedTo: null };
    const value = resolved.value;
    state.autoGuildTokenBudget = value;
    range.value = String(value);
    number.value = String(value);
    updateGuildTokenBudgetPercentage(panel, value, max, resolved.snappedTo);
    persistPluginUiState();
    if (guildTokenBudgetRefreshTimer !== null) window.clearTimeout(guildTokenBudgetRefreshTimer);
    guildTokenBudgetRefreshTimer = window.setTimeout(() => {
      guildTokenBudgetRefreshTimer = null;
      refreshGuildUpgrade(panel);
    }, 80);
  }

  function renderUpgradeCostText(gold, guildTokens, showZeroGuildTokens) {
    const parts = [`${core.formatCompactCost(gold)} ${t("gold")}`];
    if (guildTokens > 0 || showZeroGuildTokens) parts.push(`${formatNumber(guildTokens)} ${t("guildTokens")}`);
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
    const tokenExchangeNote = estimate.guildTokenCreditExchangeRequired > 0
      ? `<div class="mwi-upgrade-cost-note mwi-upgrade-token-note">${escapeHtml(t("guildTokenCreditPlanSummary", { count: formatNumber(estimate.guildTokenCreditExchangeRequired) }))}</div>`
      : "";
    const autoTokenNote = estimate.autoGuildTokenCreditExchangeUsed > 0
      ? `<div class="mwi-upgrade-cost-note mwi-upgrade-auto-token-note">${escapeHtml(t("autoGuildTokenPlanSummary", { count: formatNumber(estimate.autoGuildTokenCreditExchangeUsed) }))}</div>`
      : "";
    return `<section class="mwi-upgrade-cost-summary"><div class="mwi-upgrade-cost-title">${escapeHtml(t("costSummary"))}</div><div><span>${escapeHtml(totalLabel)}</span><strong>${renderUpgradeCostText(estimate.totalGold, estimate.guildTokensRequired)}</strong></div><div><span>${escapeHtml(missingLabel)}</span><strong>${renderUpgradeCostText(estimate.missingGold, estimate.guildTokensMissing, estimate.guildTokenCreditExchangeRequired > 0)}</strong></div>${tokenExchangeNote}${autoTokenNote}${inventoryNote}${priceNote}</section>`;
  }

  function renderGuildTokenMaterialPlan(exchange, hasInventory, materialInventory, automatic) {
    const requiredGuildTokens = automatic ? exchange.spentGuildTokens : exchange.requiredGuildTokens;
    const detail = automatic
      ? t("autoGuildTokenCoverage", { count: formatNumber(exchange.coveredCredits) })
      : t("backpackInventory", { count: hasInventory ? formatNumber(Number(materialInventory && materialInventory["/items/guild_token"]) || 0) : t("notRead") });
    const needLabel = automatic ? t("autoGuildTokenExchangeNeeds") : t("guildTokenExchangeNeeds");
    return `<div class="mwi-material-plan-item"><span class="mwi-material-plan-icon">${iconMarkup("/items/guild_token", itemNameForMaterial("/items/guild_token"))}</span><span><b>${escapeHtml(itemNameForMaterial("/items/guild_token"))}</b><small>${escapeHtml(detail)}</small></span></div><div class="mwi-material-plan-need"><small>${escapeHtml(needLabel)}</small><strong>${formatNumber(requiredGuildTokens)}</strong></div><span class="mwi-material-plan-rate">${escapeHtml(t("exchangeRate", { items: `${formatNumber(exchange.guildTokenCount)} ${t("guildTokens")}`, credits: creditQuantity(exchange.creditCount) }))}</span>`;
  }

  function renderOptimalMaterialPlan(plan, hasInventory, materialInventory) {
    if (!plan) return `<div class="mwi-material-plan-unavailable">${escapeHtml(t("optimalExchangeUnavailable"))}</div>`;
    return `<div class="mwi-material-plan-item"><span class="mwi-material-plan-icon">${marketItemIconMarkup(plan.itemHrid, itemNameForMaterial(plan.itemHrid))}</span><span><b>${escapeHtml(itemNameForMaterial(plan.itemHrid))}</b><small>${escapeHtml(t("backpackInventory", { count: hasInventory ? formatNumber(Number(materialInventory && materialInventory[plan.itemHrid]) || 0) : t("notRead") }))}</small></span></div><div class="mwi-material-plan-need"><small>${escapeHtml(t("optimalExchangeNeeds"))}</small><strong>${formatNumber(plan.requiredItems)}</strong></div><span class="mwi-material-plan-rate">${escapeHtml(t("exchangeRate", { items: itemQuantity(plan.itemCount), credits: creditQuantity(plan.creditCount) }))}</span>`;
  }

  function renderMaterialTotals(results, totals, estimate, hasInventory, creditMaterialPlans, materialInventory) {
    const planSummary = results.map((plan) => {
      const entry = guildBuffEntries().find((candidate) => candidate.hrid === plan.guildBuffHrid);
      const label = entry ? guildBuffLabel(entry.detail, entry.hrid) : plan.guildBuffHrid;
      return `<span>${escapeHtml(label)} ${plan.startLevel} -> ${plan.targetLevel}</span>`;
    }).join(`<span class="mwi-plan-separator">${ui().locale === "zh-CN" ? "，" : ", "}</span>`);
    const estimateRows = Object.fromEntries((estimate && estimate.rows || []).map((row) => [row.itemHrid, row]));
    const displayTotals = estimate && estimate.rows.length
      ? estimate.rows.map((row) => ({ itemHrid: row.itemHrid, count: row.required }))
      : totals;
    const materials = [...displayTotals].sort(materialOrder).map((item) => {
      const row = estimateRows[item.itemHrid];
      const inventoryText = row ? t("inventoryAndMissing", { owned: formatNumber(row.owned), missing: formatNumber(row.missing) }) : t("inventoryNotRead");
      const credit = CREDIT_TYPES.find(([creditItemHrid]) => creditItemHrid === item.itemHrid);
      const isGuildCredit = Boolean(credit);
      const useGuildTokens = isGuildCredit && state.guildTokenCreditHrids.has(item.itemHrid);
      const plan = creditMaterialPlans && creditMaterialPlans[item.itemHrid];
      const tokenExchange = row && row.guildTokenExchange;
      const autoTokenExchange = row && row.autoGuildTokenExchange;
      const accent = credit ? credit[1] : item.itemHrid === "/items/guild_token" ? "#e65d68" : "#7778b4";
      const exchangeMode = useGuildTokens ? t("guildTokenCreditMode") : t("optimalItemCreditMode");
      const exchangeModeMarkup = isGuildCredit
        ? `<button class="mwi-material-exchange-mode" data-role="toggle-credit-token-mode" data-credit-hrid="${escapeHtml(item.itemHrid)}" data-active="${String(useGuildTokens)}" type="button" aria-pressed="${String(useGuildTokens)}" title="${escapeHtml(t("creditExchangeModeTitle", { mode: exchangeMode }))}">${escapeHtml(exchangeMode)}</button>`
        : "";
      const conversionPlans = [];
      if (row && row.missing > 0 && isGuildCredit) {
        if (tokenExchange) {
          conversionPlans.push(`<div class="mwi-material-plan">${renderGuildTokenMaterialPlan(tokenExchange, hasInventory, materialInventory, false)}</div>`);
        } else {
          if (autoTokenExchange) conversionPlans.push(`<div class="mwi-material-plan mwi-material-plan-auto">${renderGuildTokenMaterialPlan(autoTokenExchange, hasInventory, materialInventory, true)}</div>`);
          if ((row.remainingMissing ?? row.missing) > 0) conversionPlans.push(`<div class="mwi-material-plan">${renderOptimalMaterialPlan(plan, hasInventory, materialInventory)}</div>`);
        }
      }
      if (row && row.missing <= 0 && isGuildCredit) conversionPlans.push(`<div class="mwi-material-plan-covered">✓ ${escapeHtml(t("inventoryCoveredNoExchange"))}</div>`);
      const rowClass = item.itemHrid === "/items/guild_token" ? " mwi-material-row-token" : "";
      return `<article class="mwi-material-row${rowClass}" style="--mwi-material-accent:${accent}"><div class="mwi-material-credit">${marketItemIconMarkup(item.itemHrid, itemNameForMaterial(item.itemHrid))}<span class="mwi-material-copy"><span class="mwi-material-name">${escapeHtml(itemNameForMaterial(item.itemHrid))}</span><small>${escapeHtml(hasInventory ? inventoryText : t("inventoryNotRead"))}</small></span></div><div class="mwi-material-required"><small>${escapeHtml(t("requiredThisTime"))}</small><strong>${formatNumber(item.count)}</strong></div>${exchangeModeMarkup || '<span class="mwi-material-exchange-mode-spacer" aria-hidden="true"></span>'}<div class="mwi-material-plans">${conversionPlans.join("")}</div></article>`;
    }).join("");
    return `<div class="mwi-plan-summary">${planSummary}</div>${renderUpgradeCostSummary(estimate, hasInventory)}<div class="mwi-material-list">${materials}</div>`;
  }

  async function refreshGuildUpgrade(panel) {
    const refreshId = ++state.upgradeRefreshId;
    updateGuildTokenCreditPlanButton(panel);
    refreshOfficialItemNameCatalog();
    const status = panel.querySelector('[data-role="upgrade-status"]');
    const results = panel.querySelector('[data-role="upgrade-results"]');
    const entries = guildBuffEntries();
    if (!entries.length) {
      updateGuildTokenBudgetControl(panel, null, false);
      status.textContent = t("noGuildRules");
      updateRenderedMarkup(results, "");
      return;
    }
    ensureGuildUpgradePlans(entries);
    renderGuildUpgradePlans(panel, entries);
    if (!state.upgradePlans.length) {
      updateGuildTokenBudgetControl(panel, null, Array.isArray(state.characterItems));
      status.textContent = state.upgradePresetNotice || t("allBuffsMaxed");
      updateRenderedMarkup(results, `<div class="mwi-empty">${escapeHtml(state.upgradePresetNotice || t("noUpgradeMaterials"))}</div>`);
      return;
    }

    const result = core.aggregateGuildBuffPlans(state.upgradePlans.map((plan) => {
      const entry = entries.find((candidate) => candidate.hrid === plan.guildBuffHrid);
      return { ...plan, levelCosts: entry && entry.detail.levelCosts };
    }));
    if (result.status !== "ok") {
      const failed = result.result || {};
      status.textContent = failed.status === "missing_cost" ? t("missingLevelCost", { level: formatNumber(failed.missingLevel) }) : t("invalidLevels");
      updateRenderedMarkup(results, "");
      return;
    }
    let estimate = null;
    let creditMaterialPlans = null;
    let materialInventory = inventoryItemCounts();
    const hasInventory = Array.isArray(state.characterItems);
    let snapshotFailed = false;
    const requiredCreditHrids = result.totals
      .map((item) => item.itemHrid)
      .filter((itemHrid) => CREDIT_TYPES.some(([creditItemHrid]) => creditItemHrid === itemHrid));
    const needsMarketSnapshot = requiredCreditHrids.some((itemHrid) => !state.guildTokenCreditHrids.has(itemHrid));
    let creditUnitCosts = {};
    try {
      if (needsMarketSnapshot) {
        await loadSnapshot(false);
        if (refreshId !== state.upgradeRefreshId) return;
        creditUnitCosts = bestCreditUnitCosts();
      }
    } catch (_) {
      snapshotFailed = true;
    }
    if (refreshId !== state.upgradeRefreshId) return;
    estimate = core.estimateGuildUpgradeCosts(result.totals, creditUnitCosts, materialInventory, {
      guildTokenCreditHrids: Array.from(state.guildTokenCreditHrids),
      guildTokenCreditConversions: GUILD_TOKEN_CREDIT_CONVERSIONS,
      autoAllocateSurplusGuildTokens: hasInventory,
      autoGuildTokenBudget: state.autoGuildTokenBudget
    });
    updateGuildTokenBudgetControl(panel, estimate, hasInventory);
    if (!snapshotFailed && needsMarketSnapshot) creditMaterialPlans = bestCreditMaterialPlans(estimate);
    const notices = [state.upgradePresetNotice || (state.guildBuffLevels ? t("mergedUpgradePlans", { count: formatNumber(result.plans.length) }) : t("unknownCurrentLevels"))];
    const tokenSelection = guildTokenCreditSelectionState();
    if (tokenSelection.allSelected) notices.push(t("guildTokenCreditPlanActive"));
    else if (tokenSelection.partiallySelected) notices.push(t("guildTokenCreditPlanPartialActive", { count: formatNumber(tokenSelection.selectedCount) }));
    if (snapshotFailed) notices.push(t("snapshotFailed"));
    if (!hasInventory) notices.push(t("inventoryUnavailable"));
    status.textContent = notices.join(" ");
    updateRenderedMarkup(results, renderMaterialTotals(result.plans, result.totals, estimate, hasInventory, creditMaterialPlans, materialInventory));
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
        #mwi-credit-optimizer{--mwi-entry-min-width:300px;--mwi-entry-gap:10px;position:relative;z-index:20;flex:1;min-width:0;min-height:0;height:100%;overflow-y:auto;overflow-x:hidden;margin:0;padding:12px;background:transparent;color:#f4f5ff;font:14px system-ui,sans-serif;container-type:inline-size}
        #mwi-credit-optimizer[hidden]{display:none} [data-mwi-credit-tab="true"]{user-select:none;pointer-events:auto!important;cursor:pointer!important}
        #mwi-credit-optimizer *{box-sizing:border-box} #mwi-credit-optimizer h3{margin:0 0 5px;font-size:17px}#mwi-credit-optimizer .mwi-plugin-version{margin:0 0 10px;padding:5px 7px;border:1px solid #474969;border-radius:4px;background:#292a46;color:#c9cbeb;font-size:11px;line-height:1.4}.mwi-plugin-version.mwi-update-available{border-color:#d8a33c;background:#463a21;color:#ffe09a;font-weight:700}
        #mwi-credit-optimizer .mwi-view-tabs{display:flex;border-bottom:1px solid #474969;margin:0 0 10px}.mwi-view-tab{min-height:30px!important;border-radius:0!important;background:transparent!important;color:#c9cbeb!important;padding:5px 10px!important}.mwi-view-tab-active{border-bottom:2px solid #43c4ad!important;color:#fff!important}
        #mwi-credit-optimizer .mwi-controls{display:flex;gap:8px;align-items:end;flex-wrap:wrap} #mwi-credit-optimizer label{display:grid;gap:4px;color:#d8d8e8}#mwi-credit-optimizer .mwi-price-reference{display:flex;align-items:center;gap:0;border:1px solid #5b5d7b;border-radius:4px;overflow:hidden;background:#292a46}#mwi-credit-optimizer .mwi-price-reference-label{padding:0 7px;color:#c9cbeb;font-size:11px;white-space:nowrap}#mwi-credit-optimizer .mwi-price-reference button{min-height:30px;border-radius:0;background:#353653;color:#c9cbeb;padding:5px 9px}#mwi-credit-optimizer .mwi-price-reference button+button{border-left:1px solid #5b5d7b}#mwi-credit-optimizer .mwi-price-reference button[data-active="true"]{background:#43c4ad;color:#10201f}
        #mwi-credit-optimizer input,#mwi-credit-optimizer select{width:112px;min-height:32px;border:1px solid #7778b4;border-radius:4px;padding:4px 8px;background:#f1f2ff;color:#1f2030;font:inherit}
        #mwi-credit-optimizer button{min-height:32px;border:0;border-radius:4px;padding:5px 12px;background:#43c4ad;color:#10201f;font-weight:700;cursor:pointer}
        #mwi-credit-optimizer button:disabled{opacity:.55;cursor:wait} #mwi-credit-optimizer .mwi-status{margin:10px 0;color:#c9cbeb}
        #mwi-credit-optimizer .mwi-credit-grid,#mwi-credit-optimizer .mwi-token-value-list,#mwi-credit-optimizer .mwi-upgrade-plan-list,#mwi-credit-optimizer .mwi-material-list{grid-template-columns:repeat(auto-fit,minmax(min(100%,var(--mwi-entry-min-width)),1fr))}
        #mwi-credit-optimizer .mwi-credit-grid{display:grid;gap:var(--mwi-entry-gap)}
        #mwi-credit-optimizer .mwi-credit-section{min-width:0;border:1px solid #474969;border-top:3px solid var(--mwi-credit-color);border-radius:6px;background:#292a46;overflow:hidden}#mwi-credit-optimizer .mwi-credit-body[hidden],#mwi-credit-optimizer .mwi-token-value-body[hidden]{display:none!important}
        #mwi-credit-optimizer .mwi-credit-heading{display:flex;align-items:center;gap:7px;width:100%;min-height:0!important;border:0;border-radius:0;background:transparent!important;color:#fff!important;padding:8px 9px 6px!important;font:inherit;text-align:left;font-size:13px;font-weight:700;cursor:pointer}.mwi-credit-heading:hover{background:#303151!important}.mwi-credit-heading .mwi-collapse-icon{margin-left:auto;color:#c9cbeb;font-size:15px;line-height:1}
        #mwi-credit-optimizer .mwi-credit-heading .mwi-item-icon{width:22px;height:22px;flex:0 0 22px}.mwi-credit-section table{width:100%;border-collapse:collapse;font-size:11px}
        #mwi-credit-optimizer th,#mwi-credit-optimizer td{padding:5px 6px;border-top:1px solid #474969;text-align:right;white-space:nowrap}
        #mwi-credit-optimizer th:first-child,#mwi-credit-optimizer td:first-child{text-align:left} #mwi-credit-optimizer th{color:#bfc2de;font-weight:600}
        #mwi-credit-optimizer .mwi-item{display:flex;align-items:center;gap:5px;min-width:0}.mwi-item-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        #mwi-credit-optimizer .mwi-item-icon{display:inline-block;width:24px;height:24px;flex:0 0 24px;vertical-align:middle}.mwi-item-icon-fallback{border-radius:4px;background:#45476b}#mwi-credit-optimizer .mwi-market-item-link{display:inline-grid;place-items:center;flex:0 0 24px;width:24px;min-width:24px;height:24px;min-height:24px!important;padding:0!important;border:1px solid transparent!important;border-radius:5px!important;background:transparent!important;color:inherit!important;line-height:1;cursor:pointer}#mwi-credit-optimizer .mwi-market-item-link:hover,#mwi-credit-optimizer .mwi-market-item-link:focus-visible{border-color:#77f3d0!important;background:#2d6159!important;outline:none;box-shadow:0 0 0 2px #77f3d033}#mwi-credit-optimizer .mwi-market-item-link .mwi-item-icon{display:block}
        #mwi-credit-optimizer .mwi-cost{color:#77f3d0;font-weight:700} #mwi-credit-optimizer .mwi-empty{padding:8px;color:#ffd17c;font-size:12px}#mwi-credit-optimizer .mwi-token-value-section{margin:10px 0;border:1px solid #3a7b70;border-top:3px solid #43c4ad;border-radius:6px;background:#203b3a;overflow:hidden}#mwi-credit-optimizer .mwi-token-value-heading{border-bottom:1px solid #3a7b70}#mwi-credit-optimizer .mwi-token-value-heading .mwi-item-icon{width:22px;height:22px;flex:0 0 22px}#mwi-credit-optimizer .mwi-token-value-list{display:grid;column-gap:var(--mwi-entry-gap);row-gap:0;margin-inline:-1px}#mwi-credit-optimizer .mwi-token-value-row{display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:center;gap:8px;min-width:0;padding:8px;border-top:1px solid #315d58}#mwi-credit-optimizer .mwi-token-value-row .mwi-item-icon{width:21px;height:21px;flex:0 0 21px}#mwi-credit-optimizer .mwi-token-value-exchange{color:#d7f6ef;font-size:11px;white-space:nowrap}#mwi-credit-optimizer .mwi-token-value-row .mwi-cost{font-size:12px;white-space:nowrap}#mwi-credit-optimizer .mwi-token-value-unpriced{color:#ffd17c;font-size:11px;white-space:nowrap}
        #mwi-credit-optimizer .mwi-upgrade-preset{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;margin:0 0 12px;padding:10px 11px;border:1px solid #3b8478;border-radius:9px;background:linear-gradient(135deg,#1f403d,#202f48);box-shadow:0 4px 14px #101d1c55}#mwi-credit-optimizer .mwi-upgrade-preset-copy{display:grid;gap:3px;min-width:0}#mwi-credit-optimizer .mwi-upgrade-preset-copy strong{color:#dffaf4;font-size:12px}#mwi-credit-optimizer .mwi-upgrade-preset-copy small{color:#abd5cd;font-size:10px;line-height:1.35}#mwi-credit-optimizer .mwi-upgrade-preset-buttons{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:7px}#mwi-credit-optimizer .mwi-upgrade-preset-buttons button{min-height:29px!important;padding:5px 8px!important;font-size:11px;white-space:nowrap;background:#43c4ad!important;color:#10201f!important}#mwi-credit-optimizer .mwi-upgrade-preset-buttons button[data-domain="combat"]{background:#6ea9ff!important;color:#15233f!important}#mwi-credit-optimizer .mwi-upgrade-preset-buttons button:disabled{background:#4d5968!important;color:#bec4ce!important;cursor:not-allowed}
        @container (max-width:520px){#mwi-credit-optimizer .mwi-upgrade-preset{grid-template-columns:minmax(0,1fr);align-items:stretch}#mwi-credit-optimizer .mwi-upgrade-preset-buttons{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));justify-content:stretch}#mwi-credit-optimizer .mwi-upgrade-preset-buttons button{width:100%;min-width:0}}
        #mwi-credit-optimizer .mwi-upgrade-plan-list{display:grid;gap:var(--mwi-entry-gap)}#mwi-credit-optimizer .mwi-upgrade-plan{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) 36px;gap:9px;align-items:end;padding:11px;border:1px solid #45486d;border-radius:8px;background:linear-gradient(135deg,#2c2e4d,#252640);box-shadow:0 4px 13px #13142555}#mwi-credit-optimizer .mwi-upgrade-plan label{min-width:0;text-align:left;justify-items:stretch;font-size:12px}#mwi-credit-optimizer .mwi-upgrade-plan label:first-child{grid-column:1/-1;grid-row:1}#mwi-credit-optimizer .mwi-upgrade-plan label:nth-child(2){grid-column:1;grid-row:2}#mwi-credit-optimizer .mwi-upgrade-plan label:nth-child(3){grid-column:2;grid-row:2}#mwi-credit-optimizer .mwi-upgrade-plan select{width:100%!important;max-width:none;min-width:0}#mwi-credit-optimizer .mwi-remove-plan{grid-column:3;grid-row:2;width:36px;min-width:36px;padding:0!important;font-size:21px;line-height:1;background:#555773!important;color:#fff!important}#mwi-credit-optimizer .mwi-upgrade-actions{display:flex;justify-content:center;gap:9px;margin:12px 0 4px}#mwi-credit-optimizer .mwi-clear-upgrade-plans{background:#a04455!important;color:#fff!important}#mwi-credit-optimizer .mwi-clear-upgrade-plans:hover{background:#bd4d61!important}#mwi-credit-optimizer .mwi-token-budget{display:grid;gap:8px;margin:10px 0 4px;padding:10px 11px;border:1px solid #56597f;border-radius:8px;background:linear-gradient(135deg,#30314f,#292a46)}#mwi-credit-optimizer .mwi-token-budget-heading{display:flex;justify-content:space-between;align-items:start;gap:10px;color:#e8e9f6}#mwi-credit-optimizer .mwi-token-budget-heading>span:first-child{display:grid;gap:2px}#mwi-credit-optimizer .mwi-token-budget-heading strong{font-size:12px}#mwi-credit-optimizer .mwi-token-budget-heading small{color:#bfc2de;font-size:10px;line-height:1.35}#mwi-credit-optimizer .mwi-token-budget-heading>span:last-child{color:#77f3d0;font-size:11px;white-space:nowrap}#mwi-credit-optimizer .mwi-token-budget-inputs{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:10px}#mwi-credit-optimizer .mwi-token-budget-inputs input[type="range"]{width:100%;min-height:24px;padding:0;border:0;background:transparent;accent-color:#43c4ad}#mwi-credit-optimizer .mwi-token-budget-inputs label{display:flex;align-items:center;gap:5px;color:#c9cbeb;font-size:11px}#mwi-credit-optimizer .mwi-token-budget-inputs input[type="number"]{width:100px;min-height:30px}#mwi-credit-optimizer .mwi-token-credit-plan-toggle{display:grid;grid-template-columns:24px minmax(0,1fr);align-items:center;column-gap:9px;width:100%;margin:9px 0 4px;padding:9px 11px!important;border:1px solid #56597f!important;border-radius:8px!important;background:linear-gradient(135deg,#30314f,#292a46)!important;color:#e8e9f6!important;text-align:left}#mwi-credit-optimizer .mwi-token-credit-plan-toggle[data-active="true"]{border-color:#43c4ad!important;background:linear-gradient(135deg,#20453f,#243e3c)!important;color:#e4fff8!important;box-shadow:0 0 0 1px #43c4ad33}#mwi-credit-optimizer .mwi-token-credit-plan-indicator{display:grid;place-items:center;width:24px;height:24px;border:2px solid #777aa4;border-radius:6px;background:#20213a;color:#10201f;font-size:16px;line-height:1}#mwi-credit-optimizer .mwi-token-credit-plan-toggle[data-active="true"] .mwi-token-credit-plan-indicator{border-color:#77f3d0;background:#77f3d0}#mwi-credit-optimizer .mwi-token-credit-plan-copy{display:grid;gap:2px;min-width:0}#mwi-credit-optimizer .mwi-token-credit-plan-copy strong{font-size:12px}#mwi-credit-optimizer .mwi-token-credit-plan-copy small{color:#bfc2de;font-size:10px;font-weight:500;line-height:1.35}#mwi-credit-optimizer .mwi-token-credit-plan-toggle[data-active="true"] small{color:#bce8de}
        #mwi-credit-optimizer .mwi-material-list{display:grid;gap:var(--mwi-entry-gap);margin-top:12px}.mwi-material-row{position:relative;align-self:start;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;padding:11px;border:1px solid #45486d;border-left:3px solid var(--mwi-material-accent);border-radius:8px;background:linear-gradient(135deg,#292b48,#23243d);box-shadow:0 4px 13px #13142544}.mwi-material-row-token{min-height:0;padding:9px 11px;background:linear-gradient(135deg,#2b2c49,#24253f)}.mwi-material-credit{display:flex;align-items:center;gap:8px;min-width:0}.mwi-material-copy{min-width:0;display:grid;gap:2px}.mwi-material-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#f4f5ff;font-weight:700}.mwi-material-copy small{color:#aeb1d3;font-size:11px}.mwi-material-required{display:grid;justify-items:end;align-content:center;gap:1px;text-align:right}.mwi-material-required small{color:#aeb1d3;font-size:10px}.mwi-material-required strong{color:#77f3d0;font-size:18px;line-height:1.1}.mwi-material-plan{grid-column:1/-1;display:grid;grid-template-columns:minmax(0,1fr) auto;grid-template-rows:auto auto;align-items:center;column-gap:10px;border:1px solid #356c63;border-radius:7px;background:linear-gradient(135deg,#1f3e3c,#1d3736);overflow:hidden}.mwi-material-plan-auto{border-color:#b17c32;background:linear-gradient(135deg,#493a22,#3d3325)}.mwi-material-plan-auto .mwi-material-plan-icon{border-color:#d7a64d;background:linear-gradient(135deg,#725425,#5c4525)}.mwi-material-plan-auto .mwi-material-plan-need strong{color:#ffd17c}.mwi-material-plan-item{grid-row:1/-1;display:flex;align-items:center;gap:10px;min-width:0;padding:8px 0 8px 8px}.mwi-material-plan-icon{display:grid!important;place-items:center;flex:0 0 52px!important;width:52px!important;height:52px!important;min-width:52px!important;padding:0!important;border:1px solid #4da496;border-radius:7px;background:linear-gradient(135deg,#306b62,#275a53);box-shadow:inset 0 1px #7bd8c822,0 2px 5px #10232166}.mwi-material-plan-icon .mwi-market-item-link{width:50px!important;height:50px!important;min-width:50px!important;min-height:50px!important;border:0!important;border-radius:7px!important}.mwi-material-plan-icon .mwi-item-icon{width:50px!important;height:50px!important;flex:0 0 50px!important;max-width:50px;max-height:50px;object-fit:contain}.mwi-material-plan-item>span:last-child{min-width:0;display:grid;gap:3px}.mwi-material-plan-item b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#e3fbf5;font-size:14px;line-height:1.15}.mwi-material-plan-item small{color:#afd4cd;font-size:12px;line-height:1.15}.mwi-material-plan-need{display:grid;justify-items:end;gap:1px;padding:8px 9px 0 0}.mwi-material-plan-need small{color:#afd4cd;font-size:10px}.mwi-material-plan-need strong{color:#77f3d0;font-size:17px;line-height:1}.mwi-material-plan-rate{grid-column:2;align-self:end;padding:0 9px 9px 0;color:#c5e3dd;font-size:10px;text-align:right;white-space:nowrap}.mwi-material-plan-unavailable{padding:9px;color:#ffd17c;font-size:11px}.mwi-plan-summary{display:flex;flex-wrap:wrap;justify-content:center;gap:5px;margin:12px 0 8px;color:#d7d9ed;font-size:12px}.mwi-plan-summary span:not(.mwi-plan-separator){padding:4px 7px;border:1px solid #45486d;border-radius:999px;background:#292a46}.mwi-plan-separator{display:none}.mwi-upgrade-cost-summary{display:grid;gap:7px;margin:8px 0 10px;padding:11px 12px;border:1px solid #3d8d80;border-radius:8px;background:linear-gradient(135deg,#1d3d3b,#203b3a);box-shadow:0 5px 14px #101d1c55}.mwi-upgrade-cost-title{color:#b7e6dc;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}.mwi-upgrade-cost-summary>div:not(.mwi-upgrade-cost-note):not(.mwi-upgrade-cost-title){display:flex;justify-content:space-between;gap:8px;align-items:baseline}.mwi-upgrade-cost-summary span{color:#d7f6ef}.mwi-upgrade-cost-summary strong{color:#77f3d0;font-size:15px;text-align:right}.mwi-upgrade-cost-note{color:#ffd17c;font-size:11px}.mwi-upgrade-auto-token-note{color:#9bead8}.mwi-upgrade-cost-unavailable{color:#ffd17c;border-color:#80663f;background:#3b3323}.mwi-plugin-version .mwi-update-link,#mwi-credit-optimizer .mwi-plugin-footer a{color:#fff;text-decoration:underline;text-underline-offset:2px}.mwi-plugin-version .mwi-update-link:hover,#mwi-credit-optimizer .mwi-plugin-footer a:hover{color:#77f3d0}.mwi-plugin-footer{margin-top:16px;padding:10px 4px 2px;border-top:1px solid #474969;color:#aeb1d3;font-size:12px;line-height:1.6;text-align:center}
        #mwi-credit-optimizer .mwi-token-credit-plan-toggle[data-active="mixed"]{border-color:#d8a33c!important;background:linear-gradient(135deg,#493f2a,#353147)!important;color:#fff4d4!important;box-shadow:0 0 0 1px #d8a33c33}#mwi-credit-optimizer .mwi-token-credit-plan-toggle[data-active="mixed"] .mwi-token-credit-plan-indicator{border-color:#ffd17c;background:#ffd17c;color:#332814}#mwi-credit-optimizer .mwi-material-copy{flex:1 1 auto}#mwi-credit-optimizer .mwi-material-exchange-mode{flex:0 0 auto;min-height:26px!important;padding:4px 7px!important;border:1px solid #66698f!important;border-radius:999px!important;background:#353653!important;color:#dfe1f4!important;font-size:10px;line-height:1.1;white-space:nowrap}#mwi-credit-optimizer .mwi-material-exchange-mode:hover{border-color:#77f3d0!important}#mwi-credit-optimizer .mwi-material-exchange-mode[data-active="true"]{border-color:#43c4ad!important;background:#245149!important;color:#dffff7!important;box-shadow:0 0 0 1px #43c4ad22}
        /* Compact shrine planner and aligned result rows. */
        #mwi-credit-optimizer .mwi-upgrade-planner{margin:0 0 9px;border:1px solid #4b4f75;border-radius:9px;background:#242641;overflow:hidden}
        #mwi-credit-optimizer .mwi-upgrade-preset{grid-template-columns:minmax(170px,1fr) auto;gap:7px;margin:0;padding:7px 8px;border:0;border-bottom:1px solid #3b8478;border-radius:0;background:linear-gradient(135deg,#1f403d,#202f48);box-shadow:none}
        #mwi-credit-optimizer .mwi-upgrade-preset-copy{display:flex;align-items:baseline;flex-wrap:wrap;gap:3px 9px}
        #mwi-credit-optimizer .mwi-upgrade-preset-buttons button{min-height:28px!important;padding:4px 8px!important}
        #mwi-credit-optimizer .mwi-upgrade-plan-list{display:grid;grid-template-columns:minmax(0,1fr);gap:0}
        #mwi-credit-optimizer .mwi-upgrade-plan-columns,#mwi-credit-optimizer .mwi-upgrade-plan{display:grid;grid-template-columns:minmax(140px,1.5fr) minmax(70px,.65fr) 18px minmax(70px,.65fr) 32px;gap:6px}
        #mwi-credit-optimizer .mwi-upgrade-plan-columns{align-items:end;padding:4px 8px 2px;border-bottom:1px solid #3e4264;background:#252742;color:#aeb1d3;font-size:10px}
        #mwi-credit-optimizer .mwi-upgrade-plan{align-items:center;padding:6px 8px;border:0;border-bottom:1px solid #3e4264;border-radius:0;background:#282a46;box-shadow:none}
        #mwi-credit-optimizer .mwi-upgrade-plan label{min-width:0;font-size:11px}
        #mwi-credit-optimizer .mwi-upgrade-field-label{display:none}
        #mwi-credit-optimizer .mwi-upgrade-plan label.mwi-upgrade-plan-shrine{grid-column:1;grid-row:1}
        #mwi-credit-optimizer .mwi-upgrade-plan label.mwi-upgrade-plan-start{grid-column:2;grid-row:1}
        #mwi-credit-optimizer .mwi-upgrade-level-arrow{grid-column:3;grid-row:1;align-self:center;justify-self:center;color:#aeb2d0}
        #mwi-credit-optimizer .mwi-upgrade-plan label.mwi-upgrade-plan-target{grid-column:4;grid-row:1}
        #mwi-credit-optimizer .mwi-upgrade-plan select{width:100%!important;min-height:31px;max-width:none;min-width:0}
        #mwi-credit-optimizer .mwi-remove-plan{grid-column:5;grid-row:1;width:32px;min-width:32px;min-height:31px;padding:0!important;border:1px solid #74414b!important;border-radius:6px!important;background:#56323b!important;color:#ffdce2!important;font-size:18px;line-height:1}
        #mwi-credit-optimizer .mwi-upgrade-actions{display:flex;justify-content:space-between;align-items:center;gap:9px;margin:0;padding:7px 9px;background:#292b48}
        #mwi-credit-optimizer .mwi-upgrade-actions small{color:#bfc2de;font-size:10px}
        #mwi-credit-optimizer .mwi-upgrade-actions>span{display:flex;gap:7px}
        #mwi-credit-optimizer .mwi-upgrade-actions button{min-height:29px!important;padding:4px 9px!important;font-size:11px}
        #mwi-credit-optimizer .mwi-token-budget{display:grid;grid-template-columns:minmax(150px,.7fr) minmax(220px,1.5fr) auto;align-items:center;gap:8px;margin:0 0 7px;padding:7px 9px}
        #mwi-credit-optimizer .mwi-token-budget-heading{display:grid;gap:2px;min-width:0}
        #mwi-credit-optimizer .mwi-token-budget-inputs{grid-template-columns:minmax(54px,1fr) auto auto;gap:8px}
        #mwi-credit-optimizer .mwi-token-budget-range-wrap{position:relative;display:grid;align-items:center;min-width:0}
        #mwi-credit-optimizer .mwi-token-budget-inputs input[type="range"]{position:relative;z-index:1}
        #mwi-credit-optimizer .mwi-token-budget-snap-points{position:absolute;z-index:2;left:8px;right:8px;top:50%;height:0;pointer-events:none}
        #mwi-credit-optimizer .mwi-token-budget-snap-points i{position:absolute;left:var(--mwi-snap-position);width:4px;height:4px;border:1px solid #d6d8eb;border-radius:50%;background:#555873;box-shadow:0 0 0 1px #20213a;transform:translate(-50%,-50%)}
        #mwi-credit-optimizer .mwi-token-budget-percent{display:inline-grid;place-items:center;min-width:38px;padding:3px 5px;border:1px solid #686b92;border-radius:999px;background:#252640;color:#dfe1f4;font-size:10px;font-weight:700;line-height:1.2;font-variant-numeric:tabular-nums}
        #mwi-credit-optimizer .mwi-token-budget-percent[data-snapped="true"]{border-color:#d8a33c;background:#493f2a;color:#ffe09a}
        #mwi-credit-optimizer .mwi-token-budget-available{justify-self:end;color:#77f3d0;font-size:11px;white-space:nowrap}
        #mwi-credit-optimizer .mwi-status[data-role="upgrade-status"]{margin:7px 0 3px;color:#c9cbeb;font-size:11px;text-align:center}
        #mwi-credit-optimizer .mwi-plan-summary{justify-content:flex-start;gap:5px;margin:6px 0}
        #mwi-credit-optimizer .mwi-upgrade-cost-summary{display:flex;align-items:center;flex-wrap:wrap;gap:6px 18px;margin:7px 0;padding:8px 10px;box-shadow:none}
        #mwi-credit-optimizer .mwi-upgrade-cost-summary>div:not(.mwi-upgrade-cost-note):not(.mwi-upgrade-cost-title){display:flex;align-items:baseline;gap:6px}
        #mwi-credit-optimizer .mwi-upgrade-cost-summary strong{font-size:14px}
        #mwi-credit-optimizer .mwi-upgrade-cost-note{flex:0 1 auto}
        #mwi-credit-optimizer .mwi-material-list{display:grid;grid-template-columns:minmax(0,1fr);gap:7px;margin-top:7px}
        #mwi-credit-optimizer .mwi-material-row{display:grid;grid-template-columns:minmax(125px,1.05fr) 62px 58px minmax(280px,1.8fr);align-items:center;gap:5px;padding:6px 7px;box-shadow:none}
        #mwi-credit-optimizer .mwi-material-row-token{min-height:0;padding:7px 8px}
        #mwi-credit-optimizer .mwi-material-credit{grid-column:1;min-width:0}
        #mwi-credit-optimizer .mwi-material-credit>.mwi-market-item-link{width:32px;min-width:32px;height:32px;min-height:32px!important}
        #mwi-credit-optimizer .mwi-material-credit>.mwi-market-item-link .mwi-item-icon{width:30px;height:30px;flex-basis:30px}
        #mwi-credit-optimizer .mwi-material-name{font-size:13px}
        #mwi-credit-optimizer .mwi-material-required{grid-column:2}
        #mwi-credit-optimizer .mwi-material-required strong{font-size:16px}
        #mwi-credit-optimizer .mwi-material-exchange-mode,#mwi-credit-optimizer .mwi-material-exchange-mode-spacer{grid-column:3;justify-self:start}
        #mwi-credit-optimizer .mwi-material-plans{grid-column:4;display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:5px;min-width:0}
        #mwi-credit-optimizer .mwi-material-plan{grid-column:auto;min-width:0;column-gap:7px}
        #mwi-credit-optimizer .mwi-material-plan-item{gap:7px;padding:5px 0 5px 5px}
        #mwi-credit-optimizer .mwi-material-plan-icon{flex:0 0 40px!important;width:40px!important;height:40px!important;min-width:40px!important}
        #mwi-credit-optimizer .mwi-material-plan-icon .mwi-market-item-link{width:38px!important;height:38px!important;min-width:38px!important;min-height:38px!important}
        #mwi-credit-optimizer .mwi-material-plan-icon .mwi-item-icon{width:38px!important;height:38px!important;flex:0 0 38px!important;max-width:38px;max-height:38px}
        #mwi-credit-optimizer .mwi-material-plan-item b{font-size:12px}
        #mwi-credit-optimizer .mwi-material-plan-item small{font-size:10px}
        #mwi-credit-optimizer .mwi-material-plan-need{padding:5px 6px 0 0}
        #mwi-credit-optimizer .mwi-material-plan-need strong{font-size:15px}
        #mwi-credit-optimizer .mwi-material-plan-rate{padding:0 6px 6px 0}
        #mwi-credit-optimizer .mwi-material-plan-covered{align-self:center;color:#9bdab8;font-size:11px}
        @container (max-width:650px){#mwi-credit-optimizer .mwi-plan-summary{display:none}}
        @container (max-width:520px){#mwi-credit-optimizer .mwi-token-budget{grid-template-columns:minmax(0,1fr) minmax(220px,1.2fr)}#mwi-credit-optimizer .mwi-token-budget-available{grid-column:1/-1;justify-self:start}#mwi-credit-optimizer .mwi-plan-summary{display:none}#mwi-credit-optimizer .mwi-material-row{grid-template-columns:minmax(125px,1fr) 62px 58px}#mwi-credit-optimizer .mwi-material-plans{grid-column:1/-1}}
        @container (max-width:400px){#mwi-credit-optimizer .mwi-upgrade-preset{grid-template-columns:minmax(0,1fr);align-items:stretch}#mwi-credit-optimizer .mwi-upgrade-preset-copy strong{display:none}#mwi-credit-optimizer .mwi-upgrade-preset-buttons{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));justify-content:stretch}#mwi-credit-optimizer .mwi-upgrade-preset-buttons button{width:100%;min-width:0;padding-inline:4px!important}#mwi-credit-optimizer .mwi-upgrade-plan-columns{display:none}#mwi-credit-optimizer .mwi-upgrade-plan{grid-template-columns:minmax(0,1fr) 18px minmax(0,1fr) 32px;align-items:end}#mwi-credit-optimizer .mwi-upgrade-field-label{display:block}#mwi-credit-optimizer .mwi-upgrade-plan label.mwi-upgrade-plan-shrine{grid-column:1/4;grid-row:1}#mwi-credit-optimizer .mwi-upgrade-plan label.mwi-upgrade-plan-start{grid-column:1;grid-row:2}#mwi-credit-optimizer .mwi-upgrade-level-arrow{display:block;grid-column:2;grid-row:2}#mwi-credit-optimizer .mwi-upgrade-plan label.mwi-upgrade-plan-target{grid-column:3;grid-row:2}#mwi-credit-optimizer .mwi-remove-plan{grid-column:4;grid-row:1}#mwi-credit-optimizer .mwi-upgrade-actions{align-items:center;flex-direction:row}#mwi-credit-optimizer .mwi-upgrade-actions>span{display:flex}#mwi-credit-optimizer .mwi-token-budget{grid-template-columns:minmax(0,1fr) auto}#mwi-credit-optimizer .mwi-token-budget-heading{grid-column:1;grid-row:1}#mwi-credit-optimizer .mwi-token-budget-inputs{grid-column:1/-1;grid-row:2}#mwi-credit-optimizer .mwi-token-budget-available{grid-column:2;grid-row:1;align-self:start}#mwi-credit-optimizer .mwi-upgrade-cost-summary{align-items:flex-start;flex-direction:column;gap:4px;padding:6px 7px}#mwi-credit-optimizer .mwi-material-row{grid-template-columns:minmax(0,1fr) auto}#mwi-credit-optimizer .mwi-material-required{grid-column:2;grid-row:1}#mwi-credit-optimizer .mwi-material-exchange-mode,#mwi-credit-optimizer .mwi-material-exchange-mode-spacer{grid-column:1/-1}#mwi-credit-optimizer .mwi-material-plans{grid-column:1/-1}#mwi-credit-optimizer .mwi-material-plan{grid-template-columns:minmax(0,1fr) auto;grid-template-rows:auto auto}#mwi-credit-optimizer .mwi-material-plan-item{grid-row:1/-1}#mwi-credit-optimizer .mwi-material-plan-need{grid-column:2;justify-items:end;padding:5px 6px 0 0}#mwi-credit-optimizer .mwi-material-plan-rate{grid-column:2;padding:0 6px 6px 0;text-align:right}}
        @container (max-width:650px){#mwi-credit-optimizer .mwi-token-budget{grid-template-columns:minmax(0,1fr) auto}#mwi-credit-optimizer .mwi-token-budget-heading{grid-column:1;grid-row:1}#mwi-credit-optimizer .mwi-token-budget-inputs{grid-column:1/-1;grid-row:2}#mwi-credit-optimizer .mwi-token-budget-available{grid-column:2;grid-row:1;align-self:start;justify-self:end}}
        @container (max-width:400px){#mwi-credit-optimizer .mwi-token-budget-inputs input[type="number"]{width:76px}#mwi-credit-optimizer .mwi-token-budget-inputs label>span{display:none}#mwi-credit-optimizer .mwi-token-budget-percent{min-width:34px;padding-inline:4px}}
        /* Shared guild workspace: compact utility controls, meaningful data emphasis, and explicit overflow safety. */
        #mwi-credit-optimizer{
          --mwi-void:#171827;
          --mwi-orbit:#242640;
          --mwi-panel:#2a2c49;
          --mwi-mint:#43c4ad;
          --mwi-mint-data:#77f3d0;
          --mwi-amber:#e2b45e;
          --mwi-danger:#b64b63;
        }
        #mwi-credit-optimizer :is(button,input,select):focus-visible{
          position:relative;
          z-index:4;
          outline:2px solid var(--mwi-mint-data);
          outline-offset:2px;
          box-shadow:0 0 0 4px #77f3d026;
        }
        #mwi-credit-optimizer .mwi-upgrade-planner{
          border-color:#4a4e77;
          border-radius:10px;
          background:linear-gradient(180deg,#262842 0%,#22243b 100%);
          box-shadow:0 8px 22px #0d0e1840;
        }
        #mwi-credit-optimizer .mwi-upgrade-preset{
          grid-template-columns:minmax(150px,1fr) auto;
          min-width:0;
          padding:7px 8px;
          border-bottom-color:#3d766e;
          background:linear-gradient(105deg,#203c3a 0%,#242944 58%,#242640 100%);
        }
        #mwi-credit-optimizer .mwi-upgrade-preset-copy{
          min-width:0;
          gap:2px 9px;
        }
        #mwi-credit-optimizer .mwi-upgrade-preset-copy strong{
          color:#ebfff9;
          font-family:ui-rounded,"SF Pro Rounded","PingFang SC",system-ui,sans-serif;
          font-size:11px;
          letter-spacing:.02em;
        }
        #mwi-credit-optimizer .mwi-upgrade-preset-copy small{
          min-width:0;
          color:#a9d6cc;
          overflow-wrap:anywhere;
        }
        #mwi-credit-optimizer .mwi-upgrade-preset-buttons{
          min-width:0;
          gap:6px;
        }
        #mwi-credit-optimizer .mwi-upgrade-preset-buttons button{
          min-width:0;
          min-height:28px!important;
          padding:4px 8px!important;
          border:1px solid #61d5c2!important;
          background:#2c665d!important;
          color:#eafff9!important;
          font-size:10px;
          line-height:1.2;
          white-space:normal;
          overflow-wrap:anywhere;
        }
        #mwi-credit-optimizer .mwi-upgrade-preset-buttons button[data-domain="combat"]{
          border-color:#6ea9ff!important;
          background:#344f7d!important;
          color:#eef5ff!important;
        }
        #mwi-credit-optimizer .mwi-upgrade-plan-columns,
        #mwi-credit-optimizer .mwi-upgrade-plan{
          grid-template-columns:minmax(108px,1.6fr) minmax(54px,.7fr) 12px minmax(54px,.7fr) 30px;
          gap:5px;
        }
        #mwi-credit-optimizer .mwi-upgrade-plan-columns{
          position:relative;
          z-index:1;
          min-width:0;
          padding:4px 7px 3px;
          border-bottom-color:#414568;
          background:#242641;
          font-size:9px;
          letter-spacing:.03em;
        }
        #mwi-credit-optimizer .mwi-upgrade-plan{
          position:relative;
          z-index:1;
          min-width:0;
          padding:5px 7px;
          border-bottom-color:#3c405f;
          background:#292b47e8;
          transition:background-color .16s ease;
        }
        #mwi-credit-optimizer .mwi-upgrade-plan:hover,
        #mwi-credit-optimizer .mwi-upgrade-plan:focus-within{
          background:#303250;
        }
        #mwi-credit-optimizer .mwi-upgrade-plan label{
          min-width:0;
          gap:2px;
        }
        #mwi-credit-optimizer .mwi-upgrade-field-label{display:none}
        #mwi-credit-optimizer .mwi-upgrade-plan label.mwi-upgrade-plan-shrine{grid-column:1;grid-row:1}
        #mwi-credit-optimizer .mwi-upgrade-plan label.mwi-upgrade-plan-start{grid-column:2;grid-row:1}
        #mwi-credit-optimizer .mwi-upgrade-level-arrow{display:block;grid-column:3;grid-row:1}
        #mwi-credit-optimizer .mwi-upgrade-plan label.mwi-upgrade-plan-target{grid-column:4;grid-row:1}
        #mwi-credit-optimizer .mwi-remove-plan{grid-column:5;grid-row:1}
        #mwi-credit-optimizer .mwi-upgrade-plan select{
          min-width:0;
          min-height:30px;
          padding:3px 5px;
          border-color:#7478ad;
          border-radius:5px;
          overflow:hidden;
          text-overflow:ellipsis;
          white-space:nowrap;
          font-size:11px;
          line-height:1.2;
        }
        #mwi-credit-optimizer .mwi-upgrade-level-arrow{
          color:#9fa5d4;
          font-size:13px;
        }
        #mwi-credit-optimizer .mwi-remove-plan{
          width:30px;
          min-width:30px;
          min-height:30px;
          border-color:#75404c!important;
          background:#56323c!important;
          color:#ffe4e8!important;
          font-size:16px;
          transition:background-color .16s ease,transform .16s ease;
        }
        #mwi-credit-optimizer .mwi-remove-plan:hover{
          background:#713c48!important;
          transform:translateY(-1px);
        }
        #mwi-credit-optimizer .mwi-upgrade-actions{
          min-width:0;
          padding:6px 8px;
          border-top:1px solid #353958;
          background:#252742;
        }
        #mwi-credit-optimizer .mwi-upgrade-actions small{
          min-width:0;
          overflow-wrap:anywhere;
        }
        #mwi-credit-optimizer .mwi-upgrade-actions>span{min-width:0;flex:0 0 auto}
        #mwi-credit-optimizer .mwi-upgrade-actions button{
          min-width:0;
          min-height:28px!important;
          line-height:1.2;
          white-space:normal;
        }
        #mwi-credit-optimizer .mwi-token-budget{
          border-color:#4d5279;
          background:linear-gradient(105deg,#292b48,#242640);
          box-shadow:0 5px 16px #0d0e182b;
        }
        #mwi-credit-optimizer .mwi-token-budget-heading strong{
          font-family:ui-rounded,"SF Pro Rounded","PingFang SC",system-ui,sans-serif;
        }
        #mwi-credit-optimizer .mwi-token-budget-percent,
        #mwi-credit-optimizer .mwi-token-budget-inputs input[type="number"],
        #mwi-credit-optimizer .mwi-upgrade-cost-summary strong,
        #mwi-credit-optimizer .mwi-material-required strong,
        #mwi-credit-optimizer .mwi-material-plan-need strong{
          font-family:inherit;
          font-style:normal;
          font-variant-numeric:tabular-nums;
          font-feature-settings:"tnum" 1;
        }
        #mwi-credit-optimizer .mwi-upgrade-cost-summary{
          border-color:#3c857a;
          background:linear-gradient(105deg,#1f3e3b,#203836);
        }
        #mwi-credit-optimizer .mwi-material-row{
          background:linear-gradient(105deg,#292b48,#242640);
        }
        #mwi-credit-optimizer .mwi-credit-toolbar{
          display:grid;
          grid-template-columns:minmax(180px,1fr) auto;
          align-items:center;
          gap:7px;
          min-width:0;
          margin:0 0 7px;
          border:1px solid #4a4e77;
          border-radius:10px;
          background:linear-gradient(180deg,#262842 0%,#22243b 100%);
          box-shadow:0 8px 22px #0d0e1840;
          overflow:hidden;
        }
        #mwi-credit-optimizer .mwi-credit-toolbar-copy{
          display:flex;
          align-items:baseline;
          flex-wrap:wrap;
          gap:2px 9px;
          min-width:0;
          align-self:stretch;
          padding:8px 9px;
          border-right:1px solid #3d766e;
          background:linear-gradient(105deg,#203c3a 0%,#242944 72%,#242640 100%);
        }
        #mwi-credit-optimizer .mwi-credit-toolbar-copy strong{
          color:#ebfff9;
          font-family:ui-rounded,"SF Pro Rounded","PingFang SC",system-ui,sans-serif;
          font-size:11px;
          letter-spacing:.02em;
        }
        #mwi-credit-optimizer .mwi-credit-toolbar-copy small{
          min-width:0;
          color:#a9d6cc;
          font-size:10px;
          line-height:1.35;
          overflow-wrap:anywhere;
        }
        #mwi-credit-optimizer .mwi-credit-toolbar .mwi-controls{
          display:grid;
          grid-template-columns:auto auto auto;
          align-items:center;
          gap:6px;
          min-width:0;
          padding:6px 8px 6px 0;
        }
        #mwi-credit-optimizer .mwi-credit-target{
          display:flex;
          align-items:center;
          gap:5px;
          min-width:0;
          color:#c9cbeb;
          font-size:10px;
          white-space:nowrap;
        }
        #mwi-credit-optimizer .mwi-credit-target input{
          width:72px;
          min-height:29px;
          padding:3px 6px;
          font-variant-numeric:tabular-nums;
        }
        #mwi-credit-optimizer .mwi-credit-toolbar .mwi-price-reference{
          min-width:0;
          border-color:#62668e;
          border-radius:6px;
          background:#252742;
        }
        #mwi-credit-optimizer .mwi-credit-toolbar .mwi-price-reference-label{font-size:10px}
        #mwi-credit-optimizer .mwi-credit-toolbar .mwi-price-reference button{
          min-height:28px;
          padding:4px 7px;
          font-size:10px;
        }
        #mwi-credit-optimizer .mwi-credit-toolbar .mwi-price-reference button[data-active="true"]{
          background:#2c665d;
          color:#eafff9;
        }
        #mwi-credit-optimizer .mwi-credit-refresh{
          min-width:0;
          min-height:29px!important;
          padding:4px 8px!important;
          border:1px solid #61d5c2!important;
          background:#2c665d!important;
          color:#eafff9!important;
          font-size:10px;
          line-height:1.2;
          white-space:normal;
        }
        #mwi-credit-optimizer .mwi-credit-toolbar .mwi-status{
          grid-column:1/-1;
          min-width:0;
          margin:0;
          padding:6px 9px;
          border-top:1px solid #3c405f;
          color:#c9cbeb;
          font-size:10px;
          overflow-wrap:anywhere;
        }
        #mwi-credit-optimizer .mwi-credit-results{min-width:0}
        #mwi-credit-optimizer .mwi-token-value-section{
          margin:0 0 7px;
          border:1px solid #3d766e;
          border-radius:10px;
          background:linear-gradient(180deg,#223c3a,#203634);
          box-shadow:0 6px 18px #0d0e1833;
        }
        #mwi-credit-optimizer .mwi-token-value-heading{
          min-height:36px!important;
          padding:6px 8px!important;
          border-bottom:0;
          background:linear-gradient(105deg,#203c3a 0%,#242944 72%,#242640 100%)!important;
          font-family:ui-rounded,"SF Pro Rounded","PingFang SC",system-ui,sans-serif;
          font-size:11px;
        }
        #mwi-credit-optimizer .mwi-token-value-list{
          grid-template-columns:repeat(auto-fit,minmax(min(100%,180px),1fr));
          margin:0;
          border-top:1px solid #3d766e;
        }
        #mwi-credit-optimizer .mwi-token-value-row{
          grid-template-columns:minmax(0,1fr) auto;
          grid-template-rows:auto auto;
          gap:2px 7px;
          min-width:0;
          padding:6px 8px;
          border-top:0;
          border-right:1px solid #315d58;
          border-bottom:1px solid #315d58;
          background:#203a38;
        }
        #mwi-credit-optimizer .mwi-token-value-row .mwi-item{grid-column:1/-1}
        #mwi-credit-optimizer .mwi-token-value-row .mwi-item-name{font-size:11px;font-weight:700}
        #mwi-credit-optimizer .mwi-token-value-exchange{
          min-width:0;
          color:#b9ded7;
          font-size:9px;
          white-space:normal;
          overflow-wrap:anywhere;
        }
        #mwi-credit-optimizer .mwi-token-value-row .mwi-cost,
        #mwi-credit-optimizer .mwi-token-value-unpriced{
          justify-self:end;
          align-self:end;
          min-width:0;
          font-size:10px;
          text-align:right;
          white-space:normal;
          overflow-wrap:anywhere;
        }
        #mwi-credit-optimizer .mwi-credit-grid{
          grid-template-columns:repeat(auto-fit,minmax(min(100%,380px),1fr));
          gap:7px;
        }
        #mwi-credit-optimizer .mwi-credit-section{
          align-self:start;
          border:1px solid #474b70;
          border-left:3px solid var(--mwi-credit-color);
          border-radius:9px;
          background:linear-gradient(105deg,#292b48,#242640);
          box-shadow:0 5px 16px #0d0e182b;
        }
        #mwi-credit-optimizer .mwi-credit-heading{
          display:grid;
          grid-template-columns:auto minmax(0,1fr) auto auto;
          gap:7px;
          min-width:0;
          min-height:38px!important;
          padding:5px 7px!important;
          background:#292b48!important;
        }
        #mwi-credit-optimizer .mwi-credit-heading:hover{background:#303250!important}
        #mwi-credit-optimizer .mwi-credit-heading .mwi-item-icon{
          width:26px;
          height:26px;
          flex-basis:26px;
        }
        #mwi-credit-optimizer .mwi-credit-heading-name{
          grid-column:2;
          min-width:0;
          overflow:hidden;
          color:#f4f5ff;
          font-family:ui-rounded,"SF Pro Rounded","PingFang SC",system-ui,sans-serif;
          font-size:12px;
          text-overflow:ellipsis;
          white-space:nowrap;
        }
        #mwi-credit-optimizer .mwi-credit-heading-best{
          grid-column:3;
          display:grid;
          justify-items:end;
          gap:0;
          min-width:0;
          font-variant-numeric:tabular-nums;
        }
        #mwi-credit-optimizer .mwi-credit-heading-best small{
          color:#aeb1d3;
          font-size:8px;
          font-weight:500;
          line-height:1;
        }
        #mwi-credit-optimizer .mwi-credit-heading-best strong{
          color:var(--mwi-mint-data);
          font-size:11px;
          line-height:1.2;
        }
        #mwi-credit-optimizer .mwi-credit-heading .mwi-collapse-icon{
          grid-column:4;
          align-self:center;
          margin:0;
          font-size:12px;
        }
        #mwi-credit-optimizer .mwi-credit-body{border-top:1px solid #414568}
        #mwi-credit-optimizer .mwi-credit-section table{
          table-layout:fixed;
          font-size:10px;
        }
        #mwi-credit-optimizer .mwi-credit-section th,
        #mwi-credit-optimizer .mwi-credit-section td{
          min-width:0;
          padding:4px 6px;
          border-top:1px solid #3c405f;
          overflow:hidden;
          text-overflow:ellipsis;
        }
        #mwi-credit-optimizer .mwi-credit-section thead th{
          border-top:0;
          background:#252742;
          color:#aeb1d3;
          font-size:9px;
        }
        #mwi-credit-optimizer .mwi-credit-section th:nth-child(1){width:36%}
        #mwi-credit-optimizer .mwi-credit-section th:nth-child(2){width:26%}
        #mwi-credit-optimizer .mwi-credit-section th:nth-child(3){width:18%}
        #mwi-credit-optimizer .mwi-credit-section th:nth-child(4){width:20%}
        #mwi-credit-optimizer .mwi-credit-section tbody tr{background:#292b47}
        #mwi-credit-optimizer .mwi-credit-section tbody tr:hover{background:#303250}
        #mwi-credit-optimizer .mwi-credit-section tbody tr.mwi-credit-best-row{
          background:linear-gradient(90deg,#203b39 0%,#292b47 72%);
        }
        #mwi-credit-optimizer .mwi-credit-section .mwi-item{gap:5px}
        #mwi-credit-optimizer .mwi-credit-section .mwi-market-item-link{
          width:25px;
          min-width:25px;
          height:25px;
          min-height:25px!important;
        }
        #mwi-credit-optimizer .mwi-credit-section .mwi-item-icon{
          width:23px;
          height:23px;
          flex-basis:23px;
        }
        #mwi-credit-optimizer .mwi-credit-section .mwi-cost{
          color:var(--mwi-mint-data);
          font-variant-numeric:tabular-nums;
        }
        @container (max-width:650px){
          #mwi-credit-optimizer .mwi-credit-toolbar{grid-template-columns:minmax(0,1fr)}
          #mwi-credit-optimizer .mwi-credit-toolbar-copy{border-right:0;border-bottom:1px solid #3d766e}
          #mwi-credit-optimizer .mwi-credit-toolbar .mwi-controls{padding:0 8px 7px}
          #mwi-credit-optimizer .mwi-credit-grid{grid-template-columns:minmax(0,1fr)}
        }
        @container (max-width:400px){
          #mwi-credit-optimizer .mwi-credit-toolbar-copy small{display:none}
          #mwi-credit-optimizer .mwi-credit-toolbar .mwi-controls{
            grid-template-columns:minmax(0,1fr) auto;
            gap:6px;
          }
          #mwi-credit-optimizer .mwi-credit-toolbar .mwi-price-reference{grid-column:1/-1;grid-row:1}
          #mwi-credit-optimizer .mwi-credit-target{grid-column:1;grid-row:2}
          #mwi-credit-optimizer .mwi-credit-refresh{grid-column:2;grid-row:2}
          #mwi-credit-optimizer .mwi-credit-target span{min-width:0;overflow:hidden;text-overflow:ellipsis}
          #mwi-credit-optimizer .mwi-credit-target input{width:68px}
        }
        @container (max-width:350px){
          #mwi-credit-optimizer .mwi-credit-target{
            display:grid;
            align-items:end;
            gap:2px;
            white-space:normal;
          }
          #mwi-credit-optimizer .mwi-credit-target span{
            overflow:visible;
            font-size:9px;
            text-overflow:clip;
          }
          #mwi-credit-optimizer .mwi-credit-target input{width:100%}
          #mwi-credit-optimizer .mwi-credit-refresh{align-self:end}
          #mwi-credit-optimizer .mwi-credit-section thead{display:none}
          #mwi-credit-optimizer .mwi-credit-section tbody,
          #mwi-credit-optimizer .mwi-credit-section tr{display:block}
          #mwi-credit-optimizer .mwi-credit-section tr{
            display:grid;
            grid-template-columns:repeat(3,minmax(0,1fr));
            gap:4px 6px;
            padding:6px 7px;
            border-top:1px solid #3c405f;
          }
          #mwi-credit-optimizer .mwi-credit-section tbody tr:first-child{border-top:0}
          #mwi-credit-optimizer .mwi-credit-section td{
            display:grid;
            align-content:start;
            gap:1px;
            min-width:0;
            padding:0;
            border:0;
            text-align:left;
            white-space:normal;
            overflow-wrap:anywhere;
          }
          #mwi-credit-optimizer .mwi-credit-section td:first-child{grid-column:1/-1}
          #mwi-credit-optimizer .mwi-credit-section td:not(:first-child)::before{
            content:attr(data-label);
            color:#9297ba;
            font-size:8px;
            font-weight:500;
            line-height:1.1;
          }
          #mwi-credit-optimizer .mwi-credit-section td:nth-child(3){text-align:center}
          #mwi-credit-optimizer .mwi-credit-section td:nth-child(4){text-align:right}
        }
        @container (max-width:400px){
          #mwi-credit-optimizer .mwi-upgrade-preset{
            grid-template-columns:minmax(0,1fr);
            gap:6px;
          }
          #mwi-credit-optimizer .mwi-upgrade-preset-copy strong{display:none}
          #mwi-credit-optimizer .mwi-upgrade-preset-buttons{
            display:grid;
            grid-template-columns:repeat(2,minmax(0,1fr));
          }
          #mwi-credit-optimizer .mwi-upgrade-plan-columns{display:none}
        }
        @container (max-width:350px){
          #mwi-credit-optimizer .mwi-upgrade-plan{
            grid-template-columns:minmax(0,1fr) 12px minmax(0,1fr) 30px;
            align-items:end;
            padding-block:6px;
          }
          #mwi-credit-optimizer .mwi-upgrade-field-label{
            display:block;
            min-width:0;
            overflow:hidden;
            color:#b7bad6;
            font-size:9px;
            line-height:1.1;
            text-overflow:ellipsis;
            white-space:nowrap;
          }
          #mwi-credit-optimizer .mwi-upgrade-plan label.mwi-upgrade-plan-shrine{grid-column:1/4;grid-row:1}
          #mwi-credit-optimizer .mwi-upgrade-plan label.mwi-upgrade-plan-start{grid-column:1;grid-row:2}
          #mwi-credit-optimizer .mwi-upgrade-level-arrow{display:block;grid-column:2;grid-row:2}
          #mwi-credit-optimizer .mwi-upgrade-plan label.mwi-upgrade-plan-target{grid-column:3;grid-row:2}
          #mwi-credit-optimizer .mwi-remove-plan{grid-column:4;grid-row:1}
          #mwi-credit-optimizer .mwi-upgrade-actions{
            align-items:flex-start;
            flex-direction:column;
            gap:6px;
          }
          #mwi-credit-optimizer .mwi-upgrade-actions>span{width:100%;display:grid;grid-template-columns:1fr auto}
          #mwi-credit-optimizer .mwi-upgrade-actions button{width:100%}
        }
        @media (prefers-reduced-motion:reduce){
          #mwi-credit-optimizer .mwi-upgrade-plan,
          #mwi-credit-optimizer .mwi-remove-plan{transition:none}
        }
      </style>
      <h3>${escapeHtml(t("panelTitle"))}</h3>
      <div class="mwi-plugin-version" data-role="version-status" aria-live="polite"></div>
      <div class="mwi-view-tabs" role="tablist">
        <button class="mwi-view-tab mwi-view-tab-active" data-role="view-upgrade" role="tab" aria-selected="true" type="button">${escapeHtml(t("shrineUpgrade"))}</button>
        <button class="mwi-view-tab" data-role="view-credit" role="tab" aria-selected="false" type="button">${escapeHtml(t("creditValue"))}</button>
      </div>
      <div data-role="credit-view" hidden>
        <section class="mwi-credit-toolbar" aria-label="${escapeHtml(t("creditValue"))}">
          <div class="mwi-credit-toolbar-copy"><strong>${escapeHtml(t("creditValue"))}</strong><small>${escapeHtml(t("creditValueHint"))}</small></div>
          <div class="mwi-controls">
            <label class="mwi-credit-target"><span>${escapeHtml(t("targetCredits"))}</span><input data-role="target" type="number" min="1" step="1" value="${state.targetCredit}"></label>
            <div class="mwi-price-reference" role="group" aria-label="${escapeHtml(t("marketReference"))}"><span class="mwi-price-reference-label">${escapeHtml(t("priceReference"))}</span><button data-role="price-reference" data-price-reference="a" type="button" title="${escapeHtml(priceReference("a").title)}">${escapeHtml(priceReference("a").label)}</button><button data-role="price-reference" data-price-reference="b" type="button" title="${escapeHtml(priceReference("b").title)}">${escapeHtml(priceReference("b").label)}</button></div>
            <button class="mwi-credit-refresh" data-role="refresh" type="button">${escapeHtml(t("refreshEstimate"))}</button>
          </div>
          <div class="mwi-status" data-role="status">${escapeHtml(t("waitingExchangeRules"))}</div>
        </section>
        <div class="mwi-credit-results" data-role="results"></div>
      </div>
      <div data-role="upgrade-view">
        <section class="mwi-upgrade-planner" aria-label="${escapeHtml(t("guildShrineBatchPlan"))}">
          <div class="mwi-upgrade-preset">
            <div class="mwi-upgrade-preset-copy"><strong>${escapeHtml(t("guildShrineBatchPlan"))}</strong><small data-role="guild-shrine-target-status">${escapeHtml(t("shrineLevelsReading"))}</small></div>
            <div class="mwi-upgrade-preset-buttons"><button data-role="set-guild-shrine-target" data-domain="life" type="button">${escapeHtml(t("setGuildLifeTarget"))}</button><button data-role="set-guild-shrine-target" data-domain="combat" type="button">${escapeHtml(t("setGuildCombatTarget"))}</button></div>
          </div>
          <div class="mwi-upgrade-plan-list" data-role="upgrade-plan-list"></div>
          <div class="mwi-upgrade-actions"><small data-role="upgrade-plan-count">${escapeHtml(t("selectedUpgradePlanCount", { count: "0" }))}</small><span><button data-role="add-upgrade-plan" type="button">＋ ${escapeHtml(t("addShrine"))}</button><button class="mwi-clear-upgrade-plans" data-role="clear-upgrade-plans" type="button">${escapeHtml(t("clearAll"))}</button></span></div>
        </section>
        ${renderGuildTokenBudgetControl()}
        ${renderGuildTokenCreditPlanToggle()}
        <div class="mwi-status" data-role="upgrade-status">${escapeHtml(t("waitingUpgradeRules"))}</div>
        <div data-role="upgrade-results"></div>
      </div>
      <footer class="mwi-plugin-footer">${escapeHtml(t("author"))}<br>${escapeHtml(t("support"))}<br><a href="${escapeHtml(FALLBACK_INSTALL_URL)}" target="_blank" rel="noopener noreferrer">${escapeHtml(t("fallbackInstaller"))}</a></footer>`;
    panel.dataset.activeView = "upgrade";
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
      const modeButton = event.target.closest('[data-role="toggle-credit-token-mode"]');
      if (modeButton) {
        const creditItemHrid = modeButton.dataset.creditHrid;
        if (!CREDIT_TYPES.some(([hrid]) => hrid === creditItemHrid)) return;
        if (state.guildTokenCreditHrids.has(creditItemHrid)) state.guildTokenCreditHrids.delete(creditItemHrid);
        else state.guildTokenCreditHrids.add(creditItemHrid);
        updateGuildTokenCreditPlanButton(panel);
        persistPluginUiState();
        refreshGuildUpgrade(panel);
        return;
      }
      const button = event.target.closest('[data-role="market-item-link"]');
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      openMarketplaceForItem(button.dataset.itemHrid, button.dataset.itemName);
    });
    panel.querySelector('[data-role="add-upgrade-plan"]').addEventListener("click", () => { addGuildUpgradePlan(guildBuffEntries()); persistPluginUiState(); refreshGuildUpgrade(panel); });
    panel.querySelector('[data-role="clear-upgrade-plans"]').addEventListener("click", () => { clearGuildUpgradePlans(); persistPluginUiState(); refreshGuildUpgrade(panel); });
    const guildTokenBudgetControl = panel.querySelector('[data-role="guild-token-budget-control"]');
    const guildTokenBudgetRange = panel.querySelector('[data-role="guild-token-budget-range"]');
    guildTokenBudgetControl.addEventListener("input", (event) => {
      if (!event.target.matches('[data-role="guild-token-budget-range"], [data-role="guild-token-budget-number"]')) return;
      const snap = event.target === guildTokenBudgetRange && guildTokenBudgetRange.dataset.dragging === "true";
      setGuildTokenBudget(panel, event.target.value, { snap });
    });
    guildTokenBudgetRange.addEventListener("pointerdown", () => { guildTokenBudgetRange.dataset.dragging = "true"; });
    for (const eventName of ["pointerup", "pointercancel", "blur"]) {
      guildTokenBudgetRange.addEventListener(eventName, () => { guildTokenBudgetRange.dataset.dragging = "false"; });
    }
    const guildTokenCreditPlanToggle = panel.querySelector('[data-role="toggle-guild-token-credit-plan"]');
    if (guildTokenCreditPlanToggle) {
      guildTokenCreditPlanToggle.addEventListener("click", () => {
        const selectAll = !guildTokenCreditSelectionState().allSelected;
        state.guildTokenCreditHrids = new Set(selectAll ? CREDIT_TYPES.map(([hrid]) => hrid) : []);
        updateGuildTokenCreditPlanButton(panel);
        persistPluginUiState();
        refreshGuildUpgrade(panel);
      });
    }
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
      if (!removeGuildUpgradePlan(row.dataset.planId)) return;
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
    const bestSummary = available.length ? `<span class="mwi-credit-heading-best"><small>${escapeHtml(t("perCredit"))}</small><strong>${formatNumber(available[0].costPerCredit, 2)}</strong></span>` : "";
    const heading = `<button class="mwi-credit-heading" data-role="toggle-credit-section" type="button" aria-expanded="${String(!collapsed)}">${icon}<span class="mwi-credit-heading-name">${escapeHtml(creditName)}</span>${bestSummary}<span class="mwi-collapse-icon" aria-hidden="true">${collapsed ? "▸" : "▾"}</span></button>`;
    if (!available.length) {
      return `<section class="mwi-credit-section" data-credit-item-hrid="${escapeHtml(creditItemHrid)}" data-collapsed="${String(collapsed)}" style="--mwi-credit-color:${color}">${heading}<div class="mwi-credit-body"${collapsed ? " hidden" : ""}><div class="mwi-empty">${escapeHtml(t("noMarketEstimate"))}</div></div></section>`;
    }
    return `<section class="mwi-credit-section" data-credit-item-hrid="${escapeHtml(creditItemHrid)}" data-collapsed="${String(collapsed)}" style="--mwi-credit-color:${color}">${heading}<div class="mwi-credit-body"${collapsed ? " hidden" : ""}><table><thead><tr><th>${escapeHtml(t("item"))}</th><th>${escapeHtml(t("exchange"))}</th><th>${escapeHtml(t("perCredit"))}</th><th>${escapeHtml(t("targetCost"))}</th></tr></thead><tbody>${available.map((row, index) => `<tr${index === 0 ? ' class="mwi-credit-best-row"' : ""}><td title="${escapeHtml(row.itemName)}"><span class="mwi-item">${marketItemIconMarkup(row.itemHrid, row.itemName)}<span class="mwi-item-name">${escapeHtml(row.itemName)}</span></span></td><td data-label="${escapeHtml(t("exchange"))}">${escapeHtml(t("exchangeRate", { items: itemQuantity(row.itemCount), credits: creditQuantity(row.creditCount) }))}</td><td class="mwi-cost" data-label="${escapeHtml(t("perCredit"))}">${formatNumber(row.costPerCredit, 2)}</td><td data-label="${escapeHtml(t("targetCost"))}">${core.formatCompactCost(row.cost)}</td></tr>`).join("")}</tbody></table></div></section>`;
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
    const creditGroups = creditConversionGroups();
    const conversionCount = creditGroups.reduce((total, group) => total + group.conversions.length, 0);
    if (!conversionCount) {
      status.textContent = t("noExchangeRules");
      updateRenderedMarkup(results, "");
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
      updateRenderedMarkup(results, `${renderGuildTokenValues(tokenValues)}<div class="mwi-credit-grid">${rankedGroups.map((group) => renderCreditSection(group.creditItemHrid, group.color, group.ranked)).join("")}</div>`);
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

  function scheduleMarketDataRefresh() {
    window.clearTimeout(state.marketDataRefreshTimer);
    state.marketDataRefreshTimer = window.setTimeout(() => {
      state.marketDataRefreshTimer = null;
      if (state.panel && state.panel.isConnected && !state.panel.hidden) {
        if (state.panel.dataset.activeView === "upgrade") refreshGuildUpgrade(state.panel);
        else refreshPanel(state.panel);
      }
      scheduleGuildExchangeAdvisor(true);
    }, 120);
  }

  function scheduleInventoryDataRefresh() {
    window.clearTimeout(state.inventoryDataRefreshTimer);
    state.inventoryDataRefreshTimer = window.setTimeout(() => {
      state.inventoryDataRefreshTimer = null;
      if (state.panel && state.panel.isConnected && !state.panel.hidden && state.panel.dataset.activeView === "upgrade") {
        refreshGuildUpgrade(state.panel);
      }
      scheduleGuildExchangeAdvisor(true);
    }, 120);
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
    let bestIntegration = null;
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
        if (!panelHost) continue;
        const rect = candidate.getBoundingClientRect();
        const visible = candidate.isConnected && rect.width > 0 && rect.height > 0;
        const integration = {
          tabBar: candidate,
          tabPrototype: prototype.element,
          panelHost,
          score: (visible ? 1000 : 0) + recognized.length
        };
        if (!bestIntegration || integration.score > bestIntegration.score) bestIntegration = integration;
      }
    }
    return bestIntegration;
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
    const integration = findSidebarTabBar();
    if (!integration || !integration.panelHost) return;
    const { tabBar, tabPrototype, panelHost } = integration;
    const currentIntegrationMatches = Boolean(
      state.panel && state.panel.isConnected && state.panel.parentElement === panelHost
      && state.creditTab && state.creditTab.isConnected && state.creditTab.parentElement === tabBar
    );
    if (currentIntegrationMatches) return;

    const keepPanelOpen = Boolean(state.panel && !state.panel.hidden && state.creditTab && state.creditTab.getAttribute("aria-selected") === "true");
    hideCreditPanel();
    if (state.creditTab && state.creditTab.isConnected) state.creditTab.remove();
    const existingTab = tabBar.querySelector('[data-mwi-credit-tab="true"]');
    if (existingTab) existingTab.remove();

    if (state.panel && !state.panel.isConnected) state.panel = null;
    state.creditTab = null;

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

    const panel = state.panel || createPanel();
    panel.hidden = true;
    panelHost.append(panel);
    if (tabBar.dataset.mwiCreditNativeTabListener !== "true") {
      tabBar.dataset.mwiCreditNativeTabListener = "true";
      tabBar.addEventListener("click", (event) => {
        if (!state.creditTab || state.creditTab.parentElement !== tabBar || !state.creditTab.contains(event.target)) hideCreditPanel();
      });
    }
    state.panel = panel;
    state.creditTab = creditTab;
    if (keepPanelOpen) showCreditPanel(panelHost, tabBar);
  }

  function scheduleSidebarIntegration() {
    if (sidebarIntegrationTimer !== null) window.clearTimeout(sidebarIntegrationTimer);
    sidebarIntegrationTimer = window.setTimeout(() => {
      sidebarIntegrationTimer = null;
      ensureSidebarIntegration();
    }, 75);
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
  window.addEventListener("resize", scheduleSidebarIntegration, { passive: true });
  window.addEventListener("orientationchange", scheduleSidebarIntegration, { passive: true });
  if (document.body) startGuildExchangeAdvisor();
  else document.addEventListener("DOMContentLoaded", startGuildExchangeAdvisor, { once: true });
  window.setTimeout(ensureSidebarIntegration, 1000);
})();
