// MWI_GUILD_CREDIT_RUNTIME
window.MwiGuildCreditVersion = "1.1.62";

// SOURCE: src/market-data.js
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MwiGuildCreditMarketData = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const LIVE_MARKET_CACHE_SCHEMA_VERSION = 3;
  const SUPPORTED_LIVE_MARKET_CACHE_SCHEMA_VERSIONS = new Set([1, 2, 3]);
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

  function normalizeTradablePrice(value) {
    const price = Number(value);
    return Number.isFinite(price) && price > 0 ? price : null;
  }

  function levelValue(values, level) {
    if (!values || typeof values !== "object") return undefined;
    return values[level] ?? values[String(level)];
  }

  function hasLevelValue(values, level) {
    return Boolean(
      values &&
      typeof values === "object" &&
      (Object.prototype.hasOwnProperty.call(values, level) ||
        Object.prototype.hasOwnProperty.call(values, String(level)))
    );
  }

  function metadataFieldValue(levelMap, level, field, fallback) {
    const levelValue = levelMap && levelMap[level];
    if (
      levelValue &&
      typeof levelValue === "object" &&
      !Array.isArray(levelValue) &&
      Object.prototype.hasOwnProperty.call(levelValue, field)
    ) {
      return levelValue[field];
    }
    return levelValue !== undefined && (typeof levelValue !== "object" || levelValue === null) ? levelValue : fallback;
  }

  function sanitizeMarketData(rawMarketData) {
    const marketData = Object.create(null);
    if (!rawMarketData || typeof rawMarketData !== "object" || Array.isArray(rawMarketData)) {
      return marketData;
    }
    for (const [itemHrid, levelMap] of Object.entries(rawMarketData)) {
      if (!itemHrid.startsWith("/items/") || !levelMap || typeof levelMap !== "object" || Array.isArray(levelMap))
        continue;
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
            ["a", "b"].filter(
              (field) => Object.prototype.hasOwnProperty.call(quote, field) && Number.isFinite(Number(quote[field]))
            )
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
        missingCount += 1 + confirmedLevels.reduce((total, [, fields]) => total + 1 + fields.length, 0);
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
    const source =
      payload && (payload.marketItemOrderBooks || (payload.data && payload.data.marketItemOrderBooks) || payload);
    const itemHrid = String((source && source.itemHrid) || "").trim();
    if (!itemHrid.startsWith("/items/")) return null;

    const hasDirectBook =
      source &&
      (Object.prototype.hasOwnProperty.call(source, "asks") || Object.prototype.hasOwnProperty.call(source, "bids"));
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
      const hasMin =
        Object.prototype.hasOwnProperty.call(rawBook, "priceBandMin") || hasLevelValue(source.priceBandMins, level);
      const hasMax =
        Object.prototype.hasOwnProperty.call(rawBook, "priceBandMax") || hasLevelValue(source.priceBandMaxs, level);
      const min = normalizeTradablePrice(rawBook.priceBandMin ?? levelValue(source.priceBandMins, level));
      const max = normalizeTradablePrice(rawBook.priceBandMax ?? levelValue(source.priceBandMaxs, level));
      if (hasMin) quote.min = min ?? -1;
      if (hasMax) quote.max = max ?? -1;
      if (Object.keys(quote).length) levels[String(level)] = quote;
    }
    return Object.keys(levels).length ? { itemHrid, levels } : null;
  }

  function applyLiveMarketUpdate(liveData, update, options) {
    if (!liveData || typeof liveData !== "object" || !update) return false;
    const revision = Number(options && options.revision);
    const receivedAt = Number(options && options.receivedAt);
    if (!Number.isSafeInteger(revision) || revision <= 0 || !Number.isFinite(receivedAt) || receivedAt <= 0)
      return false;

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
        fieldRevisions[field] = Number(metadataFieldValue(revisionByLevel, level, field, existing.revision));
        fieldTimes[field] = Number(metadataFieldValue(receivedAtByLevel, level, field, existing.receivedAt));
        fieldSnapshotTimestamps[field] = normalizeMarketTimestamp(
          metadataFieldValue(snapshotTimestampByLevel, level, field, existing.snapshotTimestamp)
        );
        fieldConflictDeferrals[field] =
          metadataFieldValue(snapshotConflictDeferredByLevel, level, field, false) === true;
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
      for (const field of ["min", "max"]) {
        if (!Object.prototype.hasOwnProperty.call(quote, field)) continue;
        const price = normalizeTradablePrice(quote[field]);
        if (price === null) delete mergedQuote[field];
        else mergedQuote[field] = price;
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
      const levels = { ...((entry && entry.levels) || {}) };
      const revisionByLevel = { ...((entry && entry.revisionByLevel) || {}) };
      const receivedAtByLevel = { ...((entry && entry.receivedAtByLevel) || {}) };
      const snapshotTimestampByLevel = { ...((entry && entry.snapshotTimestampByLevel) || {}) };
      const snapshotConflictDeferredByLevel = {
        ...((entry && entry.snapshotConflictDeferredByLevel) || {})
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
          const revision = Number(metadataFieldValue(revisionByLevel, level, field, entry.revision));
          const receivedAt = Number(metadataFieldValue(receivedAtByLevel, level, field, entry.receivedAt));
          const baselineTimestamp = normalizeMarketTimestamp(
            metadataFieldValue(snapshotTimestampByLevel, level, field, entry.snapshotTimestamp ?? previousTimestamp)
          );
          const conflictWasDeferred = metadataFieldValue(snapshotConflictDeferredByLevel, level, field, false) === true;
          const snapshotHasField = Object.prototype.hasOwnProperty.call(snapshotQuote || {}, field);
          const snapshotMatchesLive = snapshotHasField && Number(snapshotQuote[field]) === Number(quote[field]);
          const arrivedDuringRequest = Number.isSafeInteger(revision) && revision > coveredRevision;
          const snapshotIsNewer = nextTimestamp > baselineTimestamp;
          const shouldDeferConflict =
            !snapshotMatchesLive && (arrivedDuringRequest || (snapshotIsNewer && !conflictWasDeferred));
          const isCoveredBySnapshot =
            snapshotMatchesLive || (!arrivedDuringRequest && snapshotIsNewer && conflictWasDeferred);
          if (isCoveredBySnapshot) {
            delete quote[field];
            changed = true;
            expired = true;
            continue;
          }
          fieldRevisions[field] = revision;
          fieldTimes[field] = receivedAt;
          fieldSnapshotTimestamps[field] =
            baselineTimestamp <= 0
              ? nextTimestamp
              : shouldDeferConflict
                ? Math.max(baselineTimestamp, nextTimestamp)
                : baselineTimestamp;
          fieldConflictDeferrals[field] = shouldDeferConflict || conflictWasDeferred;
          if (
            fieldSnapshotTimestamps[field] !== baselineTimestamp ||
            fieldConflictDeferrals[field] !== conflictWasDeferred
          )
            changed = true;
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
          .flatMap((value) => Object.values(value || {}))
          .map(Number)
          .filter(Number.isSafeInteger);
        const receivedTimes = Object.values(receivedAtByLevel)
          .flatMap((value) => Object.values(value || {}))
          .map(Number)
          .filter(Number.isFinite);
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
    if (
      !stored ||
      typeof stored !== "object" ||
      Array.isArray(stored) ||
      !SUPPORTED_LIVE_MARKET_CACHE_SCHEMA_VERSIONS.has(stored.schemaVersion) ||
      !stored.items ||
      typeof stored.items !== "object" ||
      Array.isArray(stored.items)
    ) {
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
          const levelRevision = Number(metadataFieldValue(entry.revisionByLevel, levelKey, field, entry.revision));
          const receivedAt = Number(metadataFieldValue(entry.receivedAtByLevel, levelKey, field, entry.receivedAt));
          if (
            !Number.isSafeInteger(levelRevision) ||
            levelRevision <= 0 ||
            !Number.isFinite(receivedAt) ||
            receivedAt <= 0
          )
            continue;
          quote[field] = price;
          fieldRevisions[field] = levelRevision;
          fieldTimes[field] = receivedAt;
          fieldSnapshotTimestamps[field] = normalizeMarketTimestamp(
            metadataFieldValue(entry.snapshotTimestampByLevel, levelKey, field, entry.snapshotTimestamp)
          );
          fieldConflictDeferrals[field] =
            metadataFieldValue(entry.snapshotConflictDeferredByLevel, levelKey, field, false) === true;
          revision = Math.max(revision, levelRevision);
        }
        for (const field of ["min", "max"]) {
          if (!Object.prototype.hasOwnProperty.call(rawQuote, field)) continue;
          const price = normalizeTradablePrice(rawQuote[field]);
          if (price !== null) quote[field] = price;
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
      const entryRevision = Number(entry.revision);
      const entryReceivedAt = Number(entry.receivedAt);
      liveData[itemHrid] = {
        levels,
        revisionByLevel,
        receivedAtByLevel,
        snapshotTimestampByLevel,
        snapshotConflictDeferredByLevel,
        revision: revisions.length
          ? Math.max(...revisions)
          : Number.isSafeInteger(entryRevision) && entryRevision > 0
            ? entryRevision
            : 0,
        receivedAt: receivedTimes.length
          ? Math.max(...receivedTimes)
          : Number.isFinite(entryReceivedAt) && entryReceivedAt > 0
            ? entryReceivedAt
            : 0
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
    const liveQuote =
      liveData && liveData[itemHrid] && liveData[itemHrid].levels && liveData[itemHrid].levels[String(level)];
    const tradableRange = resolveTradableRange(liveData, itemHrid, level);
    if (liveQuote && Object.prototype.hasOwnProperty.call(liveQuote, field)) {
      const livePrice = Number(liveQuote[field]);
      if (!Number.isFinite(livePrice) || livePrice <= 0) return null;
      return field === "b" && tradableRange.min !== null && livePrice < tradableRange.min ? null : livePrice;
    }
    const snapshotQuote =
      snapshot && snapshot.marketData && snapshot.marketData[itemHrid] && snapshot.marketData[itemHrid][String(level)];
    const snapshotPrice = Number(snapshotQuote && snapshotQuote[field]);
    if (!Number.isFinite(snapshotPrice) || snapshotPrice <= 0) return null;
    return field === "b" && tradableRange.min !== null && snapshotPrice < tradableRange.min ? null : snapshotPrice;
  }

  function resolveTradableRange(liveData, itemHrid, enhancementLevel) {
    const level = normalizeEnhancementLevel(enhancementLevel);
    const quote =
      itemHrid &&
      level !== null &&
      liveData &&
      liveData[itemHrid] &&
      liveData[itemHrid].levels &&
      liveData[itemHrid].levels[String(level)];
    return {
      min: normalizeTradablePrice(quote && quote.min),
      max: normalizeTradablePrice(quote && quote.max)
    };
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
    resolveMarketPrice,
    resolveTradableRange
  };
});


// SOURCE: src/market-dom.js
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
    const heading = String((table.querySelector("thead") && table.querySelector("thead").textContent) || "");
    if (/出售价|Sell Price/i.test(heading)) return "asks";
    if (/收购价|Buy Price/i.test(heading)) return "bids";
    return "";
  }

  function currentMarketIdentity(documentRef) {
    const currentItem = documentRef.querySelector('[class*="MarketplacePanel_currentItem"]');
    if (!currentItem) return null;
    const use = currentItem.querySelector(
      '[class*="Item_itemContainer"] svg[role="img"] use[href*="items_sprite"],' +
        '[class*="Item_itemContainer"] svg[role="img"] use[xlink\\:href*="items_sprite"]'
    );
    const href = use && (use.getAttribute("href") || use.getAttribute("xlink:href"));
    const fragment = String(href || "")
      .split("#")
      .pop();
    if (!ITEM_HRID_PATTERN.test(fragment)) return null;
    const enhancementNode = currentItem.querySelector('[class*="Item_enhancementLevel"]');
    const enhancementMatch = String((enhancementNode && enhancementNode.textContent) || "").match(/\+?(\d+)/);
    const enhancementLevel = enhancementMatch ? Number(enhancementMatch[1]) : 0;
    return {
      itemHrid: `/items/${fragment}`,
      enhancementLevel: Number.isSafeInteger(enhancementLevel) && enhancementLevel >= 0 ? enhancementLevel : 0
    };
  }

  function tradableRange(documentRef) {
    if (!documentRef || typeof documentRef.querySelectorAll !== "function") return { min: null, max: null };
    for (const node of Array.from(documentRef.querySelectorAll('[class*="MarketplacePanel_"]'))) {
      const text = String(node.textContent || "").replace(/,/g, "");
      const match = text.match(
        /(?:可交易区间|Tradable\s+Range)\s*[:：]?\s*([0-9]+(?:\.[0-9]+)?[KMBT]?)\s*(?:-|–|—|~|至|到)\s*([0-9]+(?:\.[0-9]+)?[KMBT]?)/i
      );
      if (!match) continue;
      const min = parseCompactMarketValue(match[1]);
      const max = parseCompactMarketValue(match[2]);
      if (Number.isFinite(min) && min > 0 && Number.isFinite(max) && max >= min) return { min, max };
    }
    return { min: null, max: null };
  }

  function readMarketDomSnapshot(documentRef) {
    if (!documentRef || typeof documentRef.querySelector !== "function") return null;
    const identity = currentMarketIdentity(documentRef);
    const booksContainer = documentRef.querySelector('[class*="MarketplacePanel_orderBooksContainer"]');
    if (!identity || !booksContainer) return null;
    const snapshot = {
      ...identity,
      asks: null,
      bids: null,
      priceBandMin: null,
      priceBandMax: null
    };
    const range = tradableRange(documentRef);
    snapshot.priceBandMin = range.min;
    snapshot.priceBandMax = range.max;
    for (const table of Array.from(
      booksContainer.querySelectorAll('table[class*="MarketplacePanel_orderBookTable"]')
    )) {
      const side = tableSide(table);
      if (side) snapshot[side] = orderBookEntries(table);
    }
    if (!Array.isArray(snapshot.asks) && !Array.isArray(snapshot.bids)) return null;
    snapshot.signature = JSON.stringify([snapshot.itemHrid, snapshot.enhancementLevel, snapshot.asks, snapshot.bids]);
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
    if (Number.isFinite(snapshot.priceBandMin) && snapshot.priceBandMin > 0) book.priceBandMin = snapshot.priceBandMin;
    if (Number.isFinite(snapshot.priceBandMax) && snapshot.priceBandMax > 0) book.priceBandMax = snapshot.priceBandMax;
    return {
      type: "market_item_order_books_updated",
      marketItemOrderBooks: book
    };
  }

  return Object.freeze({
    parseCompactMarketValue,
    tradableRange,
    readMarketDomSnapshot,
    createMarketMessage
  });
});


// SOURCE: src/bridge.js
(function () {
  "use strict";

  const page = typeof unsafeWindow === "undefined" ? window : unsafeWindow;
  const marketDataApi = page.MwiGuildCreditMarketData || window.MwiGuildCreditMarketData;
  const marketDomApi = page.MwiGuildCreditMarketDom || window.MwiGuildCreditMarketDom;
  const bridge =
    window.__mwiGuildCreditBridge ||
    (window.__mwiGuildCreditBridge = {
      messages: [],
      itemDetails: null,
      guildBuffDetails: null,
      guildBuffLevels: null,
      guildShrineLevels: null,
      guildShrineDetails: null,
      guildBuildingLevels: null,
      guildBuildingDetails: null,
      characterItems: null,
      characterItemsRevision: 0,
      guildBuffLevelsRevision: 0,
      marketOrderBooks: Object.create(null),
      marketOrderBookRevision: 0
    });
  if (!("guildBuildingLevels" in bridge)) bridge.guildBuildingLevels = null;
  if (!("guildBuildingDetails" in bridge)) bridge.guildBuildingDetails = null;
  if (!bridge.marketOrderBooks || typeof bridge.marketOrderBooks !== "object")
    bridge.marketOrderBooks = Object.create(null);
  if (!Number.isSafeInteger(bridge.marketOrderBookRevision)) bridge.marketOrderBookRevision = 0;
  if (!Number.isSafeInteger(bridge.characterItemsRevision)) bridge.characterItemsRevision = 0;
  if (!Number.isSafeInteger(bridge.guildBuffLevelsRevision)) bridge.guildBuffLevelsRevision = 0;
  if (bridge.marketObserverActive !== true) bridge.marketObserverActive = false;
  const SOCKET_MESSAGE_EVENT = "__mwiGuildCreditSocketMessageV1";
  const SOCKET_READY_EVENT = "__mwiGuildCreditSocketReadyV1";
  const DIAGNOSTICS_ATTRIBUTE = "data-mwi-credit-bridge-diagnostics";
  const diagnostics =
    bridge.diagnostics && typeof bridge.diagnostics === "object"
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
          lastGuildBuffLevelsUpdatedAt: 0,
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
      root.setAttribute(
        DIAGNOSTICS_ATTRIBUTE,
        JSON.stringify({
          ...diagnostics,
          characterItemsRevision: bridge.characterItemsRevision,
          guildBuffLevelsRevision: bridge.guildBuffLevelsRevision,
          marketOrderBookRevision: bridge.marketOrderBookRevision
        })
      );
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
      return url.protocol === "wss:" && /^api(?:-test)?\.milkywayidle(?:cn)?\.com$/i.test(url.hostname);
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
    const normalizedEnhancementLevel =
      Number.isInteger(enhancementLevel) && enhancementLevel >= 0 ? enhancementLevel : 0;
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
    if (typeof record.itemLocationHrid !== "string" || !record.itemLocationHrid.startsWith("/item_locations/"))
      return "";
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

  function recordSignature(value) {
    try {
      return JSON.stringify(value || null);
    } catch (_) {
      return "";
    }
  }

  function publishGuildBuffLevelsUpdate() {
    bridge.guildBuffLevelsRevision = Math.min(Number.MAX_SAFE_INTEGER, bridge.guildBuffLevelsRevision + 1);
    diagnostics.lastGuildBuffLevelsUpdatedAt = Date.now();
    publishBridgeDiagnostics();
    if (typeof bridge.onGuildBuffLevelsUpdated === "function") {
      try {
        bridge.onGuildBuffLevelsUpdated();
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
    const previousGuildBuffLevelsSignature = recordSignature(bridge.guildBuffLevels);
    while (pending.length && scanned < 400) {
      const value = pending.pop();
      if (!value || typeof value !== "object" || visited.has(value)) continue;
      visited.add(value);
      scanned += 1;
      const itemDetails = value.itemDetailMap || value.itemDetailDict;
      const guildBuffDetails = value.guildBuffDetailMap || value.guildBuffDetailDict;
      const guildBuffLevels =
        value.characterGuildBuffMap ||
        value.characterGuildBuffDict ||
        value.characterGuildBuffs ||
        value.characterGuildBuffLevelMap ||
        value.characterGuildBuffLevelDict;
      const guildShrineLevelCandidates = [
        value.guildShrineMap,
        value.guildShrineDict,
        value.guildShrines,
        value.guildShrineLevelMap,
        value.guildShrineLevelDict,
        value.guildShrineLevels,
        value.guildBuildingMap,
        value.guildBuildingDict,
        value.guildBuildings,
        value.guildBuildingLevelMap,
        value.guildBuildingLevelDict,
        value.guildBuildingLevels
      ];
      const guildBuildingLevelCandidates = [
        value.guildBuildingMap,
        value.guildBuildingDict,
        value.guildBuildings,
        value.guildBuildingLevelMap,
        value.guildBuildingLevelDict,
        value.guildBuildingLevels
      ];
      const guildShrineDetailCandidates = [
        value.guildShrineDetailMap,
        value.guildShrineDetailDict,
        value.guildShrineDetails,
        value.guildBuildingDetailMap,
        value.guildBuildingDetailDict,
        value.guildBuildingDetails
      ];
      const guildBuildingDetailCandidates = [
        value.guildBuildingDetailMap,
        value.guildBuildingDetailDict,
        value.guildBuildingDetails
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
      for (const guildBuildingLevels of guildBuildingLevelCandidates) {
        if (guildBuildingLevels && typeof guildBuildingLevels === "object") {
          bridge.guildBuildingLevels = mergeGuildShrineLevels(bridge.guildBuildingLevels, guildBuildingLevels);
        }
      }
      for (const guildShrineDetails of guildShrineDetailCandidates) {
        if (guildShrineDetails && typeof guildShrineDetails === "object") {
          bridge.guildShrineDetails = mergeGuildShrineLevels(bridge.guildShrineDetails, guildShrineDetails);
        }
      }
      for (const guildBuildingDetails of guildBuildingDetailCandidates) {
        if (guildBuildingDetails && typeof guildBuildingDetails === "object") {
          bridge.guildBuildingDetails = mergeGuildShrineLevels(bridge.guildBuildingDetails, guildBuildingDetails);
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
    if (recordSignature(bridge.guildBuffLevels) !== previousGuildBuffLevelsSignature) publishGuildBuffLevelsUpdate();
  }

  function keepSocketMessage(rawMessage) {
    if (typeof rawMessage !== "string") return;
    bridge.messages.push(rawMessage);
    if (bridge.messages.length > 80) bridge.messages.shift();
    diagnostics.messageCount = Math.min(Number.MAX_SAFE_INTEGER, diagnostics.messageCount + 1);
    diagnostics.lastMessageAt = Date.now();
    try {
      const message = JSON.parse(rawMessage);
      diagnostics.lastMessageType = String((message && message.type) || "");
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
    const schedule = typeof window.setTimeout === "function" ? window.setTimeout.bind(window) : setTimeout;
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
        return url.protocol === "wss:" && /^api(?:-test)?\.milkywayidle(?:cn)?\.com$/i.test(url.hostname);
      } catch (_) {
        return false;
      }
    };
    const instrumentSocket = (socket) => {
      if (
        !socket ||
        !isOfficialSocket(socket.url) ||
        typeof socket.addEventListener !== "function" ||
        instrumentedSockets.has(socket)
      ) {
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
    window.addEventListener(
      SOCKET_READY_EVENT,
      (event) => {
        pageSocketTapInstalled = Boolean(event && event.detail === "1");
        diagnostics.injectionReady = pageSocketTapInstalled;
        diagnostics.installMode = pageSocketTapInstalled ? "gm_add_element_main_world" : "gm_add_element_rejected";
        diagnostics.observerActive = pageSocketTapInstalled;
        publishBridgeDiagnostics();
      },
      { once: true }
    );
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
      diagnostics.injectionError = String((error && error.message) || error || "unknown");
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
    if (
      !socket ||
      !isGameWebSocketUrl(socket.url) ||
      typeof socket.addEventListener !== "function" ||
      instrumentedSockets.has(socket)
    ) {
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


// SOURCE: src/item-name-catalog.js
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


// SOURCE: src/release-info.js
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
    return (match && match[1].trim()) || null;
  }

  function createVersionChecker(options) {
    const fetchImpl = options && options.fetchImpl;
    const url = options && options.url;
    const cacheTtlMs = Number(options && options.cacheTtlMs) || DEFAULT_CACHE_TTL_MS;
    const timeoutMs = Number(options && options.timeoutMs) || DEFAULT_TIMEOUT_MS;
    const setTimer = (options && options.setTimeout) || setTimeout;
    const clearTimer = (options && options.clearTimeout) || clearTimeout;
    const Controller =
      (options && options.AbortController) || (typeof AbortController === "function" ? AbortController : null);
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
        if (!response || !response.ok) throw new Error(`更新信息请求失败 (${(response && response.status) || "未知"})`);
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
      if (!request)
        request = requestLatestVersion().finally(() => {
          request = null;
        });
      return request;
    }

    return { latestVersion };
  }

  return { DEFAULT_CACHE_TTL_MS, DEFAULT_TIMEOUT_MS, parseUserScriptVersion, createVersionChecker };
});


// SOURCE: src/guild-building-data.js
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MwiGuildBuildingData = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const RULES_VERSION = "2026-08-04-v1";
  const MAX_LEVEL = 20;
  const BASE_LEVEL_COSTS = Object.freeze([
    null,
    1000,
    1350,
    1800,
    2450,
    3300,
    4500,
    6050,
    8150,
    11050,
    14900,
    20100,
    27150,
    36650,
    49450,
    66800,
    90150,
    121700,
    164300,
    221800,
    299450
  ]);

  const BUILDINGS = Object.freeze([
    { hrid: "/guild_buildings/guild_hall", nameKey: "buildingGuildHall", category: "core", costMultiplier: 1 },
    { hrid: "/guild_buildings/builders_hall", nameKey: "buildingBuildersHall", category: "core", costMultiplier: 1 },
    { hrid: "/guild_buildings/archives", nameKey: "buildingArchives", category: "core", costMultiplier: 1 },
    { hrid: "/guild_buildings/treasury", nameKey: "buildingTreasury", category: "core", costMultiplier: 1 },
    {
      hrid: "/guild_buildings/skilling_encampment",
      nameKey: "buildingSkillingEncampment",
      category: "life",
      costMultiplier: 0.5
    },
    { hrid: "/guild_buildings/workshop", nameKey: "buildingWorkshop", category: "life", costMultiplier: 0.5 },
    { hrid: "/guild_buildings/forge", nameKey: "buildingForge", category: "life", costMultiplier: 0.5 },
    { hrid: "/guild_buildings/log_shed", nameKey: "buildingLogShed", category: "life", costMultiplier: 0.5 },
    { hrid: "/guild_buildings/garden", nameKey: "buildingGarden", category: "life", costMultiplier: 0.5 },
    { hrid: "/guild_buildings/dairy_barn", nameKey: "buildingDairyBarn", category: "life", costMultiplier: 0.5 },
    { hrid: "/guild_buildings/kitchen", nameKey: "buildingKitchen", category: "life", costMultiplier: 0.5 },
    { hrid: "/guild_buildings/sewing_parlor", nameKey: "buildingSewingParlor", category: "life", costMultiplier: 0.5 },
    { hrid: "/guild_buildings/brewery", nameKey: "buildingBrewery", category: "life", costMultiplier: 0.5 },
    { hrid: "/guild_buildings/library", nameKey: "buildingLibrary", category: "life", costMultiplier: 0.5 },
    { hrid: "/guild_buildings/laboratory", nameKey: "buildingLaboratory", category: "life", costMultiplier: 0.5 },
    {
      hrid: "/guild_buildings/mystical_study",
      nameKey: "buildingMysticalStudy",
      category: "life",
      costMultiplier: 0.5
    },
    {
      hrid: "/guild_buildings/combat_encampment",
      nameKey: "buildingCombatEncampment",
      category: "combat",
      costMultiplier: 0.5
    },
    { hrid: "/guild_buildings/gym", nameKey: "buildingGym", category: "combat", costMultiplier: 0.5 },
    { hrid: "/guild_buildings/dojo", nameKey: "buildingDojo", category: "combat", costMultiplier: 0.5 },
    {
      hrid: "/guild_buildings/archery_range",
      nameKey: "buildingArcheryRange",
      category: "combat",
      costMultiplier: 0.5
    },
    { hrid: "/guild_buildings/armory", nameKey: "buildingArmory", category: "combat", costMultiplier: 0.5 },
    { hrid: "/guild_buildings/dining_room", nameKey: "buildingDiningRoom", category: "combat", costMultiplier: 0.5 },
    { hrid: "/guild_buildings/observatory", nameKey: "buildingObservatory", category: "combat", costMultiplier: 0.5 },
    { hrid: "/guild_shrines/tempo", nameKey: "shrineTempo", category: "shrine", costMultiplier: 1 },
    { hrid: "/guild_shrines/spirit", nameKey: "shrineSpirit", category: "shrine", costMultiplier: 1 },
    { hrid: "/guild_shrines/force", nameKey: "shrineForce", category: "shrine", costMultiplier: 1 },
    { hrid: "/guild_shrines/rarity", nameKey: "shrineRarity", category: "shrine", costMultiplier: 1 },
    { hrid: "/guild_shrines/scholar", nameKey: "shrineScholar", category: "shrine", costMultiplier: 1 }
  ]);

  function iconSymbolId(buildingHrid) {
    const building = BUILDINGS.find((entry) => entry.hrid === buildingHrid);
    if (!building) return "";
    const [group, name] = building.hrid.split("/").filter(Boolean);
    if (group === "guild_buildings") return `guild_${name}`;
    if (group === "guild_shrines") return `guild_shrine_${name}`;
    return "";
  }

  function levelCostsForMultiplier(multiplier) {
    const factor = Number(multiplier);
    return BASE_LEVEL_COSTS.map((cost) => (cost === null ? null : { guildPointCost: Math.round(cost * factor) }));
  }

  function definitions() {
    return BUILDINGS.map((building) => ({
      ...building,
      iconSymbolId: iconSymbolId(building.hrid),
      maxLevel: MAX_LEVEL,
      levelCosts: levelCostsForMultiplier(building.costMultiplier),
      rulesVersion: RULES_VERSION
    }));
  }

  return { RULES_VERSION, MAX_LEVEL, BASE_LEVEL_COSTS, BUILDINGS, iconSymbolId, levelCostsForMultiplier, definitions };
});


// SOURCE: src/localization.js
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
      priceReferenceBTitle: "右一：最高收购价；低于可交易区间的报价会忽略",
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
      noUpgradePlans: "当前没有神龛升级计划。",
      noUpgradePlansHint: "点击“添加神龛”，或使用上方按钮按当前公会等级填充。",
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
      guildConstruction: "公会建设",
      panelViewOrder: "页签顺序",
      moveViewLeft: "将当前页签左移",
      moveViewRight: "将当前页签右移",
      interfaceSettings: "设置",
      interfaceSettingsHint: "调整一键填充范围和插件页面；修改会立即在本机生效。",
      openInterfaceSettings: "打开设置",
      closeInterfaceSettings: "关闭设置",
      shrineAutofillRange: "一键填充范围",
      shrineAutofillRangeHint: "取消勾选后，一键填充不会新增或更新该神龛；已有计划不会删除。",
      settingsShrinesLoading: "正在读取可配置的公会神龛…",
      settingsShrinesEmpty: "已读取游戏数据，但没有可配置的公会神龛。",
      interfaceVisibility: "界面",
      showConstructionView: "显示公会建设页面",
      showConstructionViewHint: "关闭后隐藏页签；施工计划仍会保留，可随时重新开启。",
      settingsSaved: "设置已保存。",
      settingsSaveFailed: "设置已生效，但未能保存；刷新页面后可能恢复。",
      constructionViewShown: "已显示公会建设页面。",
      constructionViewHidden: "已隐藏公会建设页面；施工计划仍已保留。",
      constructionReadOnly: "管理员规划工具 · 只计算，不会执行建筑升级",
      guildPointBudget: "可用公会点数",
      manualBudget: "手工预算",
      budgetOptional: "留空则只计算总成本",
      invalidGuildPointBudget: "请输入不小于 0 的整数。",
      plannedSpend: "计划消耗",
      plannedUpgrades: "计划升级",
      affordableUpgrades: "预算可完成",
      remainingPoints: "预算剩余",
      overBudgetBy: "超出预算",
      constructionPlanScale: "{buildings} 座 · {steps} 级",
      constructionBudgetEmptySummary: "添加建筑后显示预算可执行范围。",
      constructionNoBudgetSummary: "未设置预算 · 共 {total} 次升级",
      constructionBudgetAllFit: "预算覆盖全部 {total} 次升级。",
      constructionBudgetStopsBefore: "可完成 {affordable}/{total} 次；下一项 {building} {from}→{to} 还差 {count}",
      buildingCatalog: "建筑目录",
      buildingCatalogHint: "选择建筑加入计划；可连续添加多座。",
      addBuilding: "添加建筑",
      closeBuildingPicker: "收起建筑目录",
      buildingCategoryFilter: "建筑分类",
      buildingCategoryAll: "全部",
      buildingCategoryCore: "基础",
      buildingCategoryLife: "生活",
      buildingCategoryCombat: "战斗",
      buildingCategoryShrine: "神龛",
      searchBuildings: "搜索建筑",
      currentLevel: "当前等级",
      buildingPlanCost: "计划成本",
      buildingEditor: "建筑计划编辑器",
      selectBuildingPrompt: "请选择一座建筑。",
      buildingMaxLevel: "已满级",
      notPlanned: "未计划",
      buildingTileLabel: "{building}，当前 {current} 级，目标 {target}",
      buildingTileAddLabel: "添加 {building}，当前 {current} 级",
      buildingTileUnknownLabel: "添加 {building}；当前等级未知，需先填写",
      buildingTilePlannedLabel: "定位到 {building} 的施工行，目标 {target} 级",
      buildingTileMaxLabel: "{building} 已满级，不能加入计划",
      currentBuildingLevelRequired: "当前等级尚未读取，请先填写后再加入计划。",
      currentBuildingLevelLabel: "{building} 当前等级",
      currentBuildingLevelHelp: "请输入 0–{max} 的整数。",
      currentBuildingLevelRange: "当前等级必须是 0–{max} 的整数。",
      addBuildingToPlan: "加入施工计划",
      cancel: "取消",
      buildingAddedToPlan: "已将 {building} 加入施工计划。",
      buildingRemovedFromPlan: "已将 {building} 移出施工计划。",
      buildingTargetUpdated: "{building} 的目标已更新为 {target} 级。",
      buildingPlansReconciled: "已按实时等级调整 {adjusted} 项计划，并移除 {removed} 项已完成计划。",
      addOneLevel: "加 1 级",
      addFiveLevels: "加 5 级",
      removeBuildingPlan: "移出计划",
      movePlanUp: "将 {building} 提前一位",
      movePlanDown: "将 {building} 延后一位",
      constructionQueue: "施工计划",
      constructionQueueHint: "按建筑分组排序；逐级费用默认收起。",
      constructionQueueDragHint: "拖动手柄排序，也可使用提前、延后按钮；键盘可按 Alt 加上下方向键。",
      dragConstructionPlan: "调整 {building} 的施工顺序",
      constructionQueueEmptyTitle: "施工计划为空",
      constructionQueueEmpty: "选择“添加建筑”开始规划。",
      constructionBudgetCutoff: "预算截止线 · 剩余 {count}",
      constructionGroupBudgetCutoff: "预算可升至 {level} 级 · 下一等级还差 {count}",
      constructionBudgetUnbudgeted: "待预算",
      constructionWithinBudget: "预算内",
      constructionPartiallyWithinBudget: "部分预算内",
      constructionOverBudget: "超预算",
      constructionSummary: "{buildings} 座建筑 · {steps} 次升级",
      constructionPlanRowMeta: "第 {position} 项 · {start}→{target} · {count} 次升级",
      buildingTargetLabel: "{building} 的目标等级",
      increaseBuildingTarget: "将 {building} 的目标提高 {count} 级",
      expandBuildingSteps: "展开 {building} 的逐级费用",
      collapseBuildingSteps: "收起 {building} 的逐级费用",
      removeBuildingFromPlan: "将 {building} 移出施工计划",
      buildingLevelsRead: "已读取当前公会建筑等级。",
      buildingLevelsUnknown: "未读取到当前公会建筑等级；请核对各建筑的起始等级。",
      buildingLevelsReadCompact: "等级已读取",
      buildingLevelsUnknownCompact: "等级暂不可用",
      buildingLevelsCoverage: "已读取 {known}/{total}",
      buildingLevelsPartialHint: "{unknown} 座建筑等级未知；添加前需填写当前等级。",
      missingBuildingCost: "{building} 缺少 {level} 级费用，未计入总成本。",
      moreConstructionActions: "更多施工计划操作",
      clearBuildingPlans: "清空施工计划",
      undoClearBuildingPlans: "撤销清空",
      copyBuildingPlan: "复制规划",
      exportBuildingCsv: "导出 CSV",
      buildingPlanCopied: "施工规划已复制。",
      buildingPlanCopyFailed: "无法写入剪贴板，请使用 CSV 导出。",
      noBuildingMatches: "没有符合筛选条件的建筑。",
      buildingPlanCleared: "已清空 {count} 项施工计划。",
      buildingPlanRestored: "已恢复 {count} 项施工计划。",
      buildingPlanReordered: "施工顺序已保存。",
      buildingPlanMovedToPosition: "{building} 已移至第 {position} 项，共 {total} 项。",
      constructionOrder: "顺序",
      fromLevel: "起始等级",
      toLevel: "目标等级",
      stepCost: "本级成本",
      cumulativeCost: "累计成本",
      buildingCsvFileName: "银河奶牛_公会建筑规划.csv",
      buildingGuildHall: "公会大厅",
      buildingBuildersHall: "建造者殿堂",
      buildingArchives: "档案馆",
      buildingTreasury: "金库",
      buildingSkillingEncampment: "生活营地",
      buildingWorkshop: "公会工作间",
      buildingForge: "公会锻造台",
      buildingLogShed: "公会木棚",
      buildingGarden: "公会花园",
      buildingDairyBarn: "公会奶牛棚",
      buildingKitchen: "公会厨房",
      buildingSewingParlor: "公会缝纫室",
      buildingBrewery: "公会冲泡坊",
      buildingLibrary: "公会图书馆",
      buildingLaboratory: "公会实验室",
      buildingMysticalStudy: "公会神秘研究室",
      buildingCombatEncampment: "战斗营地",
      buildingGym: "公会健身房",
      buildingDojo: "公会道场",
      buildingArcheryRange: "公会射箭场",
      buildingArmory: "公会军械库",
      buildingDiningRoom: "公会餐厅",
      buildingObservatory: "公会天文台",
      targetCredits: "目标信用点",
      increaseTargetCredits: "增加 100 目标信用点",
      decreaseTargetCredits: "减少 100 目标信用点",
      marketReference: "市场价格参考",
      priceReference: "价格参考",
      refreshEstimate: "刷新市场估算",
      maxItemUnitPricePrefix: "屏蔽单价超过",
      maxItemUnitPriceSuffix: "M 的物品",
      maxItemUnitPricePlaceholder: "不屏蔽",
      maxItemUnitPriceInput: "屏蔽单价超过多少 M 金币的兑换物品",
      increaseMaxItemUnitPrice: "增加 10M 屏蔽单价上限",
      decreaseMaxItemUnitPrice: "减少 10M 屏蔽单价上限",
      maxItemUnitPriceHint: "按当前左一或右一的单件市场价过滤；清空输入可关闭过滤",
      maxItemUnitPriceInvalid: "请输入大于 0 的 M 金额，例如 50",
      maxItemUnitPriceSaveFailed: "价格上限保存失败，本次会话仍然有效",
      waitingExchangeRules: "等待游戏兑换数据...",
      guildShrineBatchPlan: "按当前公会神龛等级批量规划",
      setGuildLifeTarget: "填充生活等级",
      setGuildCombatTarget: "填充战斗等级",
      guildAutofillAllExcluded: "所有{domain}神龛均已从一键填充中排除。",
      guildAutofillDomainExcluded: "当前没有参与一键填充的{domain}神龛；请在设置中至少勾选一项。",
      selectedUpgradePlanCount: "已选择 {count} 项升级计划",
      addShrine: "添加神龛",
      clearAll: "清空全部",
      guideEnable: "开启高亮指引",
      guideDisable: "关闭高亮指引",
      guideReady: "高亮指引已待命",
      guideReadyHint: "开启后会根据规划和实时库存标出下一步，不会自动操作。",
      guideNoPlans: "尚未添加神龛计划",
      guideNoPlansHint: "添加至少一项神龛升级后即可开始指引。",
      guideLoading: "正在计算指引步骤",
      guideLoadingHint: "等待神龛规则、库存或市场数据完成读取。",
      guideComplete: "当前计划已经完成",
      guideCompleteHint: "目标神龛均已达到规划等级。",
      guideMissingCredits: "下一步：补齐 {count} 种信用点",
      guideMissingCreditsHint: "请在公会商店选择：{items}",
      guideChooseItem: "下一步：选择 {item}",
      guideChooseItemHint: "这是当前 {credit} 的最优兑换物品。",
      guideSetQuantity: "下一步：输入 {count} 批",
      guideSetQuantityHint: "预计消耗 {items} 个{item}，获得 {credits} 点。",
      guideSetQuantityLimitHint: "总共还需 {remaining} 批；单次最多可填 {max} 批。",
      guideQuantityPlanSummary: "完成当前规划需要「{item}」{items}个，获得「{credit}」{credits}个",
      guideQuantityCurrentExchange: "本次填写 {count} 批",
      guideTokenQuantityDetail: "本次填写 {batches} 批，将使用 {items} 枚公会代币",
      guideUseGuildTokens: "下一步：使用 {count} 枚公会代币",
      guideUseGuildTokensHint: "当前已为 {credit} 选择公会代币兑换。",
      guideUnavailable: "暂时无法生成兑换指引",
      guideUnavailableHint: "当前信用点没有可用市场方案，请刷新市场数据或切换兑换方式。",
      guideBlocked: "仍有非信用点材料缺口",
      guideBlockedHint: "请先补齐：{items}",
      guideUpgradeShrine: "材料已齐，可以升级神龛",
      guideUpgradeShrineHint: "请前往升级：{shrines}",
      nativeGuildShopTab: "商店",
      waitingUpgradeRules: "等待神龛升级数据...",
      author: "作者：柆雨",
      support: "遇到问题或无法获取最新版，请加群：437320340",
      fallbackInstaller: "无法打开 Greasy Fork？使用备用分发安装",
      noMarketEstimate: "暂无可估算的市场价格",
      noMarketEstimateWithinPriceLimit: "没有单价不超过 {limit}M 的可用兑换物品；清空价格上限可显示全部",
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
      priceReferenceBTitle: "Highest bid: quotes below the tradable range are ignored",
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
      guildTargetComplete:
        "All {domain} shrines already meet their guild building levels; no extra materials are needed.",
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
      noUpgradePlans: "There are no shrine upgrade plans yet.",
      noUpgradePlansHint: "Select Add shrine, or use a batch-fill button above to create plans.",
      allBuffsMaxed: "All shrine buffs are already at their maximum level.",
      noUpgradeMaterials: "There are no shrine upgrade materials to calculate.",
      missingLevelCost: "Missing upgrade cost data for level {level}.",
      invalidLevels: "The starting or target level is invalid.",
      mergedUpgradePlans: "Combined material costs for {count} shrine upgrade plan(s).",
      unknownCurrentLevels:
        "Current shrine levels are unavailable, so plans start at level 0. Please verify or adjust the starting level.",
      snapshotFailed: "The public market snapshot failed to load, so the gold cost is not estimated yet.",
      panelTitle: "Guild Assistant",
      creditValue: "Credit value",
      creditValueHint:
        "Compare public market costs for the target amount; the first item is the current best exchange.",
      shrineUpgrade: "Shrine upgrades",
      guildConstruction: "Guild construction",
      panelViewOrder: "Tab order",
      moveViewLeft: "Move current tab left",
      moveViewRight: "Move current tab right",
      interfaceSettings: "Settings",
      interfaceSettingsHint:
        "Choose what batch fill includes and which plugin pages are visible. Changes apply locally.",
      openInterfaceSettings: "Open settings",
      closeInterfaceSettings: "Close settings",
      shrineAutofillRange: "Batch-fill scope",
      shrineAutofillRangeHint:
        "Clear an item to stop batch fill from adding or updating it. Existing plans are never deleted.",
      settingsShrinesLoading: "Reading configurable guild shrines…",
      settingsShrinesEmpty: "Game data is available, but there are no configurable guild shrines.",
      interfaceVisibility: "Interface",
      showConstructionView: "Show the Guild construction page",
      showConstructionViewHint: "Turning this off hides the tab but keeps every construction plan for later.",
      settingsSaved: "Settings saved.",
      settingsSaveFailed: "The change is active but could not be saved; it may reset after a page refresh.",
      constructionViewShown: "The Guild construction page is now visible.",
      constructionViewHidden: "The Guild construction page is hidden; its plans are still saved.",
      constructionReadOnly: "Admin planning tool · calculates only and never upgrades buildings",
      guildPointBudget: "Available guild points",
      manualBudget: "Manual budget",
      budgetOptional: "Leave blank to calculate cost without a budget",
      invalidGuildPointBudget: "Enter a whole number of 0 or more.",
      plannedSpend: "Planned spend",
      plannedUpgrades: "Planned upgrades",
      affordableUpgrades: "Budget covers",
      remainingPoints: "Budget remaining",
      overBudgetBy: "Over budget",
      constructionPlanScale: "{buildings} buildings · {steps} levels",
      constructionBudgetEmptySummary: "Add a building to see what the budget can cover.",
      constructionNoBudgetSummary: "No budget set · {total} upgrades planned",
      constructionBudgetAllFit: "The budget covers all {total} upgrades.",
      constructionBudgetStopsBefore: "Covers {affordable}/{total}; {building} {from}→{to} needs {count} more",
      buildingCatalog: "Building catalog",
      buildingCatalogHint: "Choose buildings to add; the picker stays open for batch planning.",
      addBuilding: "Add building",
      closeBuildingPicker: "Close building catalog",
      buildingCategoryFilter: "Building categories",
      buildingCategoryAll: "All",
      buildingCategoryCore: "Core",
      buildingCategoryLife: "Life",
      buildingCategoryCombat: "Combat",
      buildingCategoryShrine: "Shrines",
      searchBuildings: "Search buildings",
      currentLevel: "Current level",
      buildingPlanCost: "Plan cost",
      buildingEditor: "Building plan editor",
      selectBuildingPrompt: "Select a building.",
      buildingMaxLevel: "Maximum level",
      notPlanned: "Not planned",
      buildingTileLabel: "{building}, current level {current}, target {target}",
      buildingTileAddLabel: "Add {building}, current level {current}",
      buildingTileUnknownLabel: "Add {building}; enter its unknown current level first",
      buildingTilePlannedLabel: "Go to {building} in the plan, target level {target}",
      buildingTileMaxLabel: "{building} is at maximum level and cannot be added",
      currentBuildingLevelRequired: "Its current level is unavailable. Enter it before adding this building.",
      currentBuildingLevelLabel: "Current level for {building}",
      currentBuildingLevelHelp: "Enter a whole number from 0 to {max}.",
      currentBuildingLevelRange: "The current level must be a whole number from 0 to {max}.",
      addBuildingToPlan: "Add to construction plan",
      cancel: "Cancel",
      buildingAddedToPlan: "{building} added to the construction plan.",
      buildingRemovedFromPlan: "{building} removed from the construction plan.",
      buildingTargetUpdated: "{building}'s target is now level {target}.",
      buildingPlansReconciled: "Live levels adjusted {adjusted} plan(s) and removed {removed} completed plan(s).",
      addOneLevel: "Add 1 level",
      addFiveLevels: "Add 5 levels",
      removeBuildingPlan: "Remove from plan",
      movePlanUp: "Move {building} one position earlier",
      movePlanDown: "Move {building} one position later",
      constructionQueue: "Construction plan",
      constructionQueueHint: "Ordered by building; per-level costs are collapsed by default.",
      constructionQueueDragHint:
        "Drag the handles to reorder, use the earlier and later buttons, or press Alt with Up or Down.",
      dragConstructionPlan: "Reorder {building}",
      constructionQueueEmptyTitle: "Your construction plan is empty",
      constructionQueueEmpty: "Choose Add building to start planning.",
      constructionBudgetCutoff: "Budget cutoff · {count} remaining",
      constructionGroupBudgetCutoff: "Budget reaches level {level} · next level needs {count} more",
      constructionBudgetUnbudgeted: "No budget",
      constructionWithinBudget: "Within budget",
      constructionPartiallyWithinBudget: "Partially covered",
      constructionOverBudget: "Over budget",
      constructionSummary: "{buildings} building(s) · {steps} upgrade(s)",
      constructionPlanRowMeta: "Item {position} · {start}→{target} · {count} upgrade(s)",
      buildingTargetLabel: "Target level for {building}",
      increaseBuildingTarget: "Increase {building}'s target by {count} level(s)",
      expandBuildingSteps: "Expand per-level costs for {building}",
      collapseBuildingSteps: "Collapse per-level costs for {building}",
      removeBuildingFromPlan: "Remove {building} from the construction plan",
      buildingLevelsRead: "Current guild building levels loaded.",
      buildingLevelsUnknown: "Current guild building levels are unavailable. Verify each building's starting level.",
      buildingLevelsReadCompact: "Levels loaded",
      buildingLevelsUnknownCompact: "Levels unavailable",
      buildingLevelsCoverage: "Levels loaded: {known}/{total}",
      buildingLevelsPartialHint: "{unknown} building level(s) are unknown. Enter a current level before adding.",
      missingBuildingCost: "{building} is missing its level {level} cost and is excluded from the total.",
      moreConstructionActions: "More construction plan actions",
      clearBuildingPlans: "Clear construction plan",
      undoClearBuildingPlans: "Undo clear",
      copyBuildingPlan: "Copy plan",
      exportBuildingCsv: "Export CSV",
      buildingPlanCopied: "Construction plan copied.",
      buildingPlanCopyFailed: "Clipboard access failed. Use CSV export instead.",
      noBuildingMatches: "No buildings match these filters.",
      buildingPlanCleared: "Cleared {count} construction plan item(s).",
      buildingPlanRestored: "Restored {count} construction plan item(s).",
      buildingPlanReordered: "Construction order saved.",
      buildingPlanMovedToPosition: "{building} moved to item {position} of {total}.",
      constructionOrder: "Order",
      fromLevel: "From level",
      toLevel: "To level",
      stepCost: "Step cost",
      cumulativeCost: "Cumulative cost",
      buildingCsvFileName: "milky-way-idle-guild-construction-plan.csv",
      buildingGuildHall: "Guild Hall",
      buildingBuildersHall: "Builders' Hall",
      buildingArchives: "Archives",
      buildingTreasury: "Treasury",
      buildingSkillingEncampment: "Skilling Encampment",
      buildingWorkshop: "Guild Workshop",
      buildingForge: "Guild Forge",
      buildingLogShed: "Guild Log Shed",
      buildingGarden: "Guild Garden",
      buildingDairyBarn: "Guild Dairy Barn",
      buildingKitchen: "Guild Kitchen",
      buildingSewingParlor: "Guild Sewing Parlor",
      buildingBrewery: "Guild Brewery",
      buildingLibrary: "Guild Library",
      buildingLaboratory: "Guild Laboratory",
      buildingMysticalStudy: "Guild Mystical Study",
      buildingCombatEncampment: "Combat Encampment",
      buildingGym: "Guild Gym",
      buildingDojo: "Guild Dojo",
      buildingArcheryRange: "Guild Archery Range",
      buildingArmory: "Guild Armory",
      buildingDiningRoom: "Guild Dining Room",
      buildingObservatory: "Guild Observatory",
      targetCredits: "Target credits",
      increaseTargetCredits: "Increase target credits by 100",
      decreaseTargetCredits: "Decrease target credits by 100",
      marketReference: "Market price reference",
      priceReference: "Price reference",
      refreshEstimate: "Refresh market estimate",
      maxItemUnitPricePrefix: "Exclude items over",
      maxItemUnitPriceSuffix: "M",
      maxItemUnitPricePlaceholder: "No limit",
      maxItemUnitPriceInput: "Exclude conversion items priced over this many million gold",
      increaseMaxItemUnitPrice: "Increase the price limit by 10M",
      decreaseMaxItemUnitPrice: "Decrease the price limit by 10M",
      maxItemUnitPriceHint:
        "Filters by the selected left-one or right-one unit market price; clear the input to disable the filter",
      maxItemUnitPriceInvalid: "Enter an amount above 0M, such as 50",
      maxItemUnitPriceSaveFailed: "The price limit could not be saved; it remains active for this session",
      waitingExchangeRules: "Waiting for game exchange data...",
      guildShrineBatchPlan: "Batch plan by current guild shrine levels",
      setGuildLifeTarget: "Fill Life levels",
      setGuildCombatTarget: "Fill Combat levels",
      guildAutofillAllExcluded: "Every {domain} shrine is excluded from batch fill.",
      guildAutofillDomainExcluded: "No {domain} shrine participates in batch fill. Select one in Settings.",
      selectedUpgradePlanCount: "{count} upgrade plan(s) selected",
      addShrine: "Add shrine",
      clearAll: "Clear all",
      guideEnable: "Enable highlight guide",
      guideDisable: "Disable highlight guide",
      guideReady: "Highlight guide is ready",
      guideReadyHint: "It marks the next step from your plan and live inventory without taking actions.",
      guideNoPlans: "No shrine plan yet",
      guideNoPlansHint: "Add at least one shrine upgrade to start the guide.",
      guideLoading: "Calculating the next step",
      guideLoadingHint: "Waiting for shrine rules, inventory, or market data.",
      guideComplete: "The current plan is complete",
      guideCompleteHint: "Every target shrine has reached its planned level.",
      guideMissingCredits: "Next: fill {count} credit type(s)",
      guideMissingCreditsHint: "Choose in the Guild Shop: {items}",
      guideChooseItem: "Next: select {item}",
      guideChooseItemHint: "This is the current best exchange item for {credit}.",
      guideSetQuantity: "Next: enter {count} batches",
      guideSetQuantityHint: "Uses about {items} {item} and yields {credits} credits.",
      guideSetQuantityLimitHint: "{remaining} batches remain in total; this exchange allows up to {max}.",
      guideQuantityPlanSummary:
        "To complete the current plan, you need “{item}” × {items} and receive “{credit}” × {credits}.",
      guideQuantityCurrentExchange: "Enter {count} batches this time",
      guideTokenQuantityDetail: "Enter {batches} batches to use {items} guild tokens this time",
      guideUseGuildTokens: "Next: use {count} guild tokens",
      guideUseGuildTokensHint: "Guild-token exchange is selected for {credit}.",
      guideUnavailable: "An exchange step is unavailable",
      guideUnavailableHint:
        "No market option is available for this credit. Refresh prices or change its exchange mode.",
      guideBlocked: "Other materials are still missing",
      guideBlockedHint: "Fill these first: {items}",
      guideUpgradeShrine: "Materials are ready; upgrade the shrine",
      guideUpgradeShrineHint: "Upgrade: {shrines}",
      nativeGuildShopTab: "Shop",
      waitingUpgradeRules: "Waiting for shrine upgrade data...",
      author: "Author: 柆雨",
      support: "For help or updates, join QQ group: 437320340",
      fallbackInstaller: "Can't reach Greasy Fork? Use the fallback installer",
      noMarketEstimate: "No market price can be estimated yet",
      noMarketEstimateWithinPriceLimit:
        "No conversion item is available at or below {limit}M; clear the price limit to show all items",
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
      noAffordableReplacement:
        "Selling this quantity yields {gold} after tax, which is not enough to buy an alternative exchange item.",
      sidebarCredit: "Credits"
    }
  };

  const ITEM_NAMES = {
    "zh-CN": {
      "/items/guild_token": "公会代币",
      "/items/green_guild_credit": "绿色公会信用点",
      "/items/brown_guild_credit": "棕色公会信用点",
      "/items/white_guild_credit": "白色公会信用点",
      "/items/blue_guild_credit": "蓝色公会信用点",
      "/items/purple_guild_credit": "紫色公会信用点",
      "/items/red_guild_credit": "红色公会信用点",
      "/items/silver_guild_credit": "银色公会信用点",
      "/items/gold_guild_credit": "金色公会信用点"
    },
    en: {
      "/items/guild_token": "Guild Token",
      "/items/green_guild_credit": "Green Guild Credit",
      "/items/brown_guild_credit": "Brown Guild Credit",
      "/items/white_guild_credit": "White Guild Credit",
      "/items/blue_guild_credit": "Blue Guild Credit",
      "/items/purple_guild_credit": "Purple Guild Credit",
      "/items/red_guild_credit": "Red Guild Credit",
      "/items/silver_guild_credit": "Silver Guild Credit",
      "/items/gold_guild_credit": "Gold Guild Credit"
    }
  };

  function supportedLocale(locale) {
    if (typeof locale !== "string") return null;
    const candidate = locale.trim().toLowerCase().replaceAll("_", "-");
    if (/^zh(?:-|$)/.test(candidate)) return "zh-CN";
    if (/^en(?:-|$)/.test(candidate)) return "en";
    return null;
  }

  function resolveLocaleCandidates(candidates, fallback = "zh-CN") {
    for (const candidate of Array.isArray(candidates) ? candidates : [candidates]) {
      const locale = supportedLocale(candidate);
      if (locale) return locale;
    }
    return supportedLocale(fallback) || "zh-CN";
  }

  function normalizeLocale(locale) {
    return supportedLocale(locale) || "en";
  }

  function interpolate(template, values) {
    return String(template).replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key) =>
      values && values[key] !== undefined ? String(values[key]) : `{${key}}`
    );
  }

  function createLocalizer(locale) {
    const normalizedLocale = normalizeLocale(locale);
    const strings = STRINGS[normalizedLocale];
    function t(key, values) {
      return interpolate(strings[key] || STRINGS.en[key] || key, values);
    }
    function number(value, digits) {
      if (value === null || value === undefined || !Number.isFinite(value)) return "-";
      return new Intl.NumberFormat(normalizedLocale, {
        maximumFractionDigits: digits === undefined ? 0 : digits
      }).format(value);
    }
    function quantity(key, count) {
      const formatted = number(count);
      if (normalizedLocale === "zh-CN") return t(key, { count: formatted });
      const unit =
        key === "creditQuantity"
          ? Number(count) === 1
            ? "credit"
            : "credits"
          : Number(count) === 1
            ? "item"
            : "items";
      return t(key, { count: formatted, unit });
    }
    function itemName(itemHrid) {
      return ITEM_NAMES[normalizedLocale][itemHrid] || "";
    }
    return { locale: normalizedLocale, t, number, quantity, itemName };
  }

  return { STRINGS, ITEM_NAMES, supportedLocale, resolveLocaleCandidates, normalizeLocale, createLocalizer };
});


// SOURCE: src/core.js
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
    return Math.round((clamped / max) * 100);
  }

  function snapGuildTokenBudget(rawValue, maximum, options = {}) {
    const max = Math.max(0, Math.floor(Number(maximum) || 0));
    const value = Math.min(max, Math.max(0, Math.floor(Number(rawValue) || 0)));
    if (!max) return { value: 0, percentage: 0, snappedTo: null };
    const snapPercentages = (
      Array.isArray(options.snapPercentages) ? options.snapPercentages : DEFAULT_GUILD_TOKEN_BUDGET_SNAP_PERCENTAGES
    )
      .map(Number)
      .filter((percentage) => Number.isFinite(percentage) && percentage > 0 && percentage <= 100);
    const threshold = Math.max(0, Number(options.thresholdPercentage ?? 2.5) || 0);
    const rawPercentage = (value / max) * 100;
    const snappedTo = snapPercentages.reduce((nearest, percentage) => {
      if (nearest === null) return percentage;
      return Math.abs(percentage - rawPercentage) < Math.abs(nearest - rawPercentage) ? percentage : nearest;
    }, null);
    if (snappedTo === null || Math.abs(snappedTo - rawPercentage) > threshold) {
      return { value, percentage: guildTokenBudgetPercentage(value, max), snappedTo: null };
    }
    const snappedValue = Math.min(max, Math.max(0, Math.round((max * snappedTo) / 100)));
    return { value: snappedValue, percentage: guildTokenBudgetPercentage(snappedValue, max), snappedTo };
  }

  function normalizeAsks(orderBook) {
    if (!orderBook || !Array.isArray(orderBook.asks)) return [];
    return orderBook.asks
      .map((ask) => ({ price: Number(ask.price), quantity: Number(ask.quantity) }))
      .filter(
        (ask) => Number.isFinite(ask.price) && ask.price >= 0 && Number.isSafeInteger(ask.quantity) && ask.quantity > 0
      )
      .sort((left, right) => left.price - right.price);
  }

  function quoteAsks(orderBook, requestedQuantity) {
    const quantity = positiveInteger(requestedQuantity);
    if (!quantity)
      return { status: "invalid_quantity", requestedQuantity, availableQuantity: 0, cost: null, fills: [] };

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
        return (
          left.costPerCredit - right.costPerCredit ||
          left.cost - right.cost ||
          left.itemName.localeCompare(right.itemName, "zh-CN")
        );
      });
  }

  function rankGuildTokenCreditValues(exchangeRules, rankedCredits) {
    const rankings = rankedCredits && typeof rankedCredits === "object" ? rankedCredits : {};
    return (Array.isArray(exchangeRules) ? exchangeRules : []).map((rule) => {
      const guildTokenCount = positiveInteger(rule && rule.guildTokenCount);
      const creditCount = positiveInteger(rule && rule.creditCount);
      const creditItemHrid = rule && rule.creditItemHrid;
      if (!guildTokenCount || !creditCount || !creditItemHrid) {
        return { status: "invalid_rule", rule };
      }
      const best = (Array.isArray(rankings[creditItemHrid]) ? rankings[creditItemHrid] : []).find(
        (result) => result && result.status === "ok" && Number.isFinite(result.costPerCredit)
      );
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
    if (
      !itemCount ||
      !creditCount ||
      !Number.isFinite(price) ||
      price <= 0 ||
      !Number.isFinite(availableBudget) ||
      availableBudget < 0
    ) {
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
      .sort(
        (left, right) =>
          right.actualCredits - left.actualCredits ||
          left.costPerCredit - right.costPerCredit ||
          left.cost - right.cost ||
          left.itemName.localeCompare(right.itemName, "zh-CN")
      );
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
    if (
      !itemQuantity ||
      !Number.isFinite(price) ||
      price <= 0 ||
      !Number.isFinite(taxRate) ||
      taxRate < 0 ||
      taxRate >= 1
    ) {
      return { status: "invalid_sale", quantity, sellPrice, sellerTaxRate, gross: null, tax: null, net: null };
    }
    const gross = itemQuantity * price;
    const tax = Math.floor(gross * taxRate);
    return {
      status: "ok",
      quantity: itemQuantity,
      sellPrice: price,
      sellerTaxRate: taxRate,
      gross,
      tax,
      net: gross - tax
    };
  }

  function snapshotMarketPrice(snapshot, itemHrid, enhancementLevel, field) {
    const level = Number(enhancementLevel);
    if (!itemHrid || !Number.isSafeInteger(level) || level < 0 || (field !== "a" && field !== "b")) return null;
    const entry =
      snapshot && snapshot.marketData && snapshot.marketData[itemHrid] && snapshot.marketData[itemHrid][String(level)];
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

  function selectGuildShrineAutofillScope(options = {}) {
    const entries = Array.isArray(options.entries) ? options.entries : [];
    const plans = Array.isArray(options.plans) ? options.plans : [];
    const domain = options.domain === "combat" ? "combat" : options.domain === "life" ? "life" : null;
    if (!domain) return { eligibleEntries: [], preservedPlans: plans.slice() };

    const excludedSource = options.excludedGuildBuffHrids;
    const excludedGuildBuffHrids = new Set(
      excludedSource && typeof excludedSource !== "string" && typeof excludedSource[Symbol.iterator] === "function"
        ? excludedSource
        : []
    );
    const entriesByHrid = new Map(
      entries.filter((entry) => entry && typeof entry.hrid === "string").map((entry) => [entry.hrid, entry])
    );
    const entryDomain = (entry) => (entry && entry.detail && entry.detail.isCombat === true ? "combat" : "life");
    const eligibleEntries = entries.filter(
      (entry) =>
        entry &&
        typeof entry.hrid === "string" &&
        entryDomain(entry) === domain &&
        !excludedGuildBuffHrids.has(entry.hrid)
    );
    const preservedPlans = plans.filter((plan) => {
      const guildBuffHrid = plan && plan.guildBuffHrid;
      const entry = entriesByHrid.get(guildBuffHrid);
      return !entry || entryDomain(entry) !== domain || excludedGuildBuffHrids.has(guildBuffHrid);
    });
    return { eligibleEntries, preservedPlans };
  }

  function aggregateGuildBuffLevelCosts(levelCosts, startLevel, targetLevel) {
    const start = Number(startLevel);
    const target = Number(targetLevel);
    const costs = Array.isArray(levelCosts)
      ? levelCosts
      : levelCosts && typeof levelCosts === "object"
        ? levelCosts
        : null;
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
        return {
          status: "missing_cost",
          startLevel: start,
          targetLevel: target,
          maxLevel,
          missingLevel: level,
          totals: []
        };
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
      const result = aggregateGuildBuffLevelCosts(
        plan && plan.levelCosts,
        plan && plan.startLevel,
        plan && plan.targetLevel
      );
      if (result.status !== "ok")
        return { status: "invalid_plan", planIndex: index, result, plans: results, totals: [] };
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

  function aggregateGuildBuildingLevelCosts(levelCosts, startLevel, targetLevel) {
    const start = Number(startLevel);
    const target = Number(targetLevel);
    const costs = Array.isArray(levelCosts)
      ? levelCosts
      : levelCosts && typeof levelCosts === "object"
        ? levelCosts
        : null;
    if (!costs || !Number.isSafeInteger(start) || !Number.isSafeInteger(target) || start < 0 || target <= start) {
      return { status: "invalid_range", startLevel, targetLevel, totalCost: 0, steps: [] };
    }
    const maxLevel = Array.isArray(costs)
      ? costs.length - 1
      : Math.max(...Object.keys(costs).map(Number).filter(Number.isSafeInteger));
    if (!Number.isSafeInteger(maxLevel) || target > maxLevel) {
      return { status: "invalid_range", startLevel: start, targetLevel: target, maxLevel, totalCost: 0, steps: [] };
    }
    const steps = [];
    let totalCost = 0;
    for (let level = start + 1; level <= target; level += 1) {
      const record = costs[level];
      const rawCost = record && (record.guildPointCost ?? record.guildPoints ?? record.cost);
      const cost = Number(rawCost);
      if (rawCost === null || rawCost === undefined || !Number.isFinite(cost) || cost < 0) {
        return {
          status: "missing_cost",
          startLevel: start,
          targetLevel: target,
          maxLevel,
          missingLevel: level,
          totalCost: 0,
          steps: []
        };
      }
      totalCost += cost;
      steps.push({ fromLevel: level - 1, toLevel: level, cost });
    }
    return { status: "ok", startLevel: start, targetLevel: target, maxLevel, totalCost, steps };
  }

  function buildGuildConstructionPlan(plans, availableGuildPoints) {
    const inputPlans = Array.isArray(plans) ? plans : [];
    const hasBudget =
      availableGuildPoints !== null && availableGuildPoints !== undefined && availableGuildPoints !== "";
    const budgetNumber = Number(availableGuildPoints);
    if (hasBudget && (!Number.isFinite(budgetNumber) || budgetNumber < 0)) {
      return { status: "invalid_budget", plans: [], steps: [], totalCost: 0, availableGuildPoints };
    }
    const budget = hasBudget ? Math.floor(budgetNumber) : null;
    const results = [];
    const steps = [];
    let cumulativeCost = 0;
    for (let planIndex = 0; planIndex < inputPlans.length; planIndex += 1) {
      const plan = inputPlans[planIndex] || {};
      const result = aggregateGuildBuildingLevelCosts(plan.levelCosts, plan.startLevel, plan.targetLevel);
      if (result.status !== "ok") {
        return {
          status: "invalid_plan",
          planIndex,
          result,
          plans: results,
          steps: [],
          totalCost: 0,
          availableGuildPoints: budget
        };
      }
      const annotatedSteps = [];
      let affordableStepCount = 0;
      let nextStepShortfall = null;
      for (const step of result.steps) {
        cumulativeCost += step.cost;
        const fitsBudget = budget === null ? null : cumulativeCost <= budget;
        const annotatedStep = {
          ...step,
          id: plan.id,
          buildingHrid: plan.buildingHrid,
          globalIndex: steps.length,
          cumulativeCost,
          fitsBudget,
          remainingGuildPoints: budget === null ? null : budget - cumulativeCost
        };
        steps.push(annotatedStep);
        annotatedSteps.push(annotatedStep);
        if (fitsBudget !== false) affordableStepCount += 1;
        else if (nextStepShortfall === null) nextStepShortfall = cumulativeCost - budget;
      }
      const budgetState =
        budget === null
          ? "unbudgeted"
          : affordableStepCount === annotatedSteps.length
            ? "within"
            : affordableStepCount > 0
              ? "partial"
              : "outside";
      results.push({
        ...result,
        id: plan.id,
        buildingHrid: plan.buildingHrid,
        steps: annotatedSteps,
        budgetState,
        affordableStepCount,
        affordableTargetLevel: result.startLevel + affordableStepCount,
        nextStepShortfall
      });
    }
    const firstOverBudgetIndex = budget === null ? -1 : steps.findIndex((step) => !step.fitsBudget);
    return {
      status: "ok",
      plans: results,
      steps,
      totalCost: cumulativeCost,
      availableGuildPoints: budget,
      remainingGuildPoints: budget === null ? null : budget - cumulativeCost,
      overBudget: budget === null ? false : cumulativeCost > budget,
      affordableStepCount:
        budget === null ? steps.length : firstOverBudgetIndex < 0 ? steps.length : firstOverBudgetIndex,
      firstOverBudgetIndex
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

    const candidates = (Array.isArray(creditRows) ? creditRows : [])
      .map((row) => {
        const rule = row && rules.get(row.itemHrid);
        const missing = Math.max(0, Number(row && row.missing) || 0);
        const unitCost = Number(row && row.unitCost);
        if (!rule || missing <= 0 || !Number.isFinite(unitCost) || unitCost <= 0) return null;
        return {
          ...rule,
          missing,
          goldValuePerToken: (unitCost * rule.creditCount) / rule.guildTokenCount
        };
      })
      .filter(Boolean)
      .sort(
        (left, right) =>
          right.goldValuePerToken - left.goldValuePerToken || left.creditItemHrid.localeCompare(right.creditItemHrid)
      );

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
    for (const rule of Array.isArray(settings.guildTokenCreditConversions)
      ? settings.guildTokenCreditConversions
      : []) {
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
      const guildTokenRule =
        (useGuildTokensForAllMissingCredits || guildTokenCreditHrids.has(itemHrid)) &&
        guildTokenCreditRules.get(itemHrid);
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
    const hasConfiguredAutoGuildTokenBudget =
      settings.autoGuildTokenBudget !== null &&
      settings.autoGuildTokenBudget !== undefined &&
      Number.isFinite(requestedAutoGuildTokenBudget) &&
      requestedAutoGuildTokenBudget >= 0;
    const autoGuildTokenBudget = hasConfiguredAutoGuildTokenBudget
      ? Math.min(availableSurplusGuildTokens, Math.floor(requestedAutoGuildTokenBudget))
      : availableSurplusGuildTokens;
    const autoGuildTokenPlan = allocateSurplusGuildTokens(
      rows,
      Array.from(guildTokenCreditRules.values()),
      autoGuildTokenBudget
    );
    const autoAllocationsByCredit = new Map(
      autoGuildTokenPlan.allocations.map((allocation) => [allocation.creditItemHrid, allocation])
    );
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
    return details.flatMap(([itemKey, detail]) =>
      (detail && Array.isArray(detail.guildCreditConversions) ? detail.guildCreditConversions : [])
        .filter((conversion) => conversion.creditItemHrid === creditItemHrid)
        .map((conversion) => ({
          itemHrid: detail.itemHrid || detail.hrid || itemKey,
          itemName: detail.name || detail.itemHrid || detail.hrid || itemKey,
          creditItemHrid: conversion.creditItemHrid,
          itemCount: conversion.itemCount,
          creditCount: conversion.creditCount
        }))
        .filter(
          (conversion) =>
            conversion.itemHrid && positiveInteger(conversion.itemCount) && positiveInteger(conversion.creditCount)
        )
    );
  }

  function isUnitPriceWithinLimit(unitPrice, maxUnitPrice) {
    const limit = Number(maxUnitPrice);
    if (!Number.isSafeInteger(limit) || limit <= 0) return true;
    const price = Number(unitPrice);
    return !Number.isFinite(price) || price <= 0 || price <= limit;
  }

  return {
    normalizeAsks,
    quoteAsks,
    evaluateConversion,
    rankConversions,
    rankGuildTokenCreditValues,
    evaluateBudgetConversion,
    bestConversionForBudget,
    calculateSaleProceeds,
    estimateSaleReplacement,
    snapshotMarketPrice,
    formatCompactCost,
    compareVersions,
    selectGuildShrineAutofillScope,
    aggregateGuildBuffLevelCosts,
    aggregateGuildBuffPlans,
    aggregateGuildBuildingLevelCosts,
    buildGuildConstructionPlan,
    allocateSurplusGuildTokens,
    estimateGuildUpgradeCosts,
    conversionsFromItemDetails,
    isUnitPriceWithinLimit,
    guildTokenBudgetPercentage,
    snapGuildTokenBudget
  };
});


// SOURCE: src/shrine-guide.js
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MwiGuildCreditShrineGuide = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function positiveInteger(value) {
    const number = Number(value);
    return Number.isSafeInteger(number) && number > 0 ? number : null;
  }

  function nonNegativeInteger(value) {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    return Number.isSafeInteger(number) && number >= 0 ? number : null;
  }

  function nonNegativeNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : 0;
  }

  function normalizePlan(plan) {
    if (!plan || typeof plan.guildBuffHrid !== "string" || typeof plan.shrineHrid !== "string") return null;
    const targetLevel = positiveInteger(plan.targetLevel);
    const currentLevel = Math.max(0, Math.floor(Number(plan.currentLevel) || 0));
    if (!targetLevel) return null;
    return {
      guildBuffHrid: plan.guildBuffHrid,
      shrineHrid: plan.shrineHrid,
      domain: plan.domain === "combat" ? "combat" : "life",
      label: String(plan.label || plan.guildBuffHrid),
      currentLevel,
      targetLevel,
      complete: currentLevel >= targetLevel
    };
  }

  function inventoryCountForItem(characterItems, itemHrid) {
    if (!Array.isArray(characterItems) || !itemHrid) return null;
    let total = 0;
    for (const item of characterItems) {
      if (!item || item.itemHrid !== itemHrid || item.itemLocationHrid !== "/item_locations/inventory") continue;
      const count = nonNegativeInteger(item.count);
      if (count !== null) total += count;
    }
    return total;
  }

  function normalizeCreditStep(row, materialPlan) {
    if (!row || !row.itemHrid) return null;
    const remainingMissing = Math.ceil(nonNegativeNumber(row && (row.remainingMissing ?? row.missing)));
    const automaticExchange = row.guildTokenExchange ? null : row.autoGuildTokenExchange;
    const hasAutomaticExchange = Boolean(
      automaticExchange &&
      positiveInteger(automaticExchange.batches) &&
      positiveInteger(automaticExchange.spentGuildTokens) &&
      positiveInteger(automaticExchange.actualCredits)
    );
    if (remainingMissing <= 0 && !hasAutomaticExchange) return null;
    if (row.guildTokenExchange || hasAutomaticExchange) {
      const exchange = row.guildTokenExchange || automaticExchange;
      return {
        creditItemHrid: row.itemHrid,
        remainingMissing: hasAutomaticExchange ? Math.ceil(nonNegativeNumber(row.missing)) : remainingMissing,
        method: "guild_token",
        recommendedItemHrid: "/items/guild_token",
        batches: positiveInteger(exchange.batches) || 0,
        requiredItems: positiveInteger(exchange.requiredGuildTokens) || positiveInteger(exchange.spentGuildTokens) || 0,
        actualCredits: positiveInteger(exchange.actualCredits) || 0,
        itemCount: positiveInteger(exchange.guildTokenCount) || 0,
        creditCount: positiveInteger(exchange.creditCount) || 0
      };
    }
    if (!materialPlan) {
      return {
        creditItemHrid: row.itemHrid,
        remainingMissing,
        method: "unavailable",
        recommendedItemHrid: null,
        batches: 0,
        requiredItems: 0,
        actualCredits: 0,
        itemCount: 0,
        creditCount: 0
      };
    }
    const itemCount = positiveInteger(materialPlan.itemCount) || 0;
    const creditCount = positiveInteger(materialPlan.creditCount) || 0;
    const batches =
      positiveInteger(materialPlan.batches) || (creditCount ? Math.ceil(remainingMissing / creditCount) : 0);
    return {
      creditItemHrid: row.itemHrid,
      remainingMissing,
      method: "market_item",
      recommendedItemHrid: materialPlan.itemHrid || null,
      batches,
      requiredItems: positiveInteger(materialPlan.requiredItems) || batches * itemCount,
      actualCredits: positiveInteger(materialPlan.actualCredits) || batches * creditCount,
      itemCount,
      creditCount
    };
  }

  function deriveShrineGuide(options) {
    const settings = options && typeof options === "object" ? options : {};
    const plans = (Array.isArray(settings.plans) ? settings.plans : []).map(normalizePlan).filter(Boolean);
    const base = {
      enabled: settings.enabled === true,
      status: "inactive",
      plans,
      targetPlans: plans.filter((plan) => !plan.complete),
      missingCredits: [],
      blockers: [],
      activeCredit: null
    };
    if (!base.enabled) return base;
    if (!plans.length) return { ...base, status: "no_plans" };
    if (!base.targetPlans.length) return { ...base, status: "complete" };
    if (!settings.estimate || !Array.isArray(settings.estimate.rows)) return { ...base, status: "loading" };

    const creditOrder = Array.isArray(settings.creditOrder) ? settings.creditOrder : [];
    const creditIndex = new Map(creditOrder.map((itemHrid, index) => [itemHrid, index]));
    const creditSet = new Set(creditOrder);
    const materialPlans =
      settings.creditMaterialPlans && typeof settings.creditMaterialPlans === "object"
        ? settings.creditMaterialPlans
        : {};
    const missingCredits = settings.estimate.rows
      .filter((row) => creditSet.has(row && row.itemHrid))
      .map((row) => normalizeCreditStep(row, materialPlans[row.itemHrid]))
      .filter(Boolean)
      .sort(
        (left, right) =>
          (creditIndex.get(left.creditItemHrid) ?? Number.MAX_SAFE_INTEGER) -
          (creditIndex.get(right.creditItemHrid) ?? Number.MAX_SAFE_INTEGER)
      );
    const blockers = settings.estimate.rows
      .filter(
        (row) => row && !creditSet.has(row.itemHrid) && nonNegativeNumber(row.remainingMissing ?? row.missing) > 0
      )
      .map((row) => ({
        itemHrid: row.itemHrid,
        missing: Math.ceil(nonNegativeNumber(row.remainingMissing ?? row.missing))
      }));
    const modal = settings.modal && typeof settings.modal === "object" ? settings.modal : null;
    const matchedCredit =
      (modal && missingCredits.find((step) => step.creditItemHrid === modal.creditItemHrid)) || null;
    const legacyModalMaxBatches = nonNegativeInteger(modal && modal.maxBatches);
    const modalMaxTargetQuantity = nonNegativeInteger(modal && modal.maxTargetQuantity);
    const inputMaxBatches =
      matchedCredit && modalMaxTargetQuantity !== null && matchedCredit.creditCount > 0
        ? Math.floor(modalMaxTargetQuantity / matchedCredit.creditCount)
        : null;
    const ownedItems = matchedCredit
      ? inventoryCountForItem(settings.characterItems, matchedCredit.recommendedItemHrid)
      : null;
    const inventoryMaxBatches =
      matchedCredit && ownedItems !== null && matchedCredit.itemCount > 0
        ? Math.floor(ownedItems / matchedCredit.itemCount)
        : null;
    const availableBatchLimits = [legacyModalMaxBatches, inputMaxBatches, inventoryMaxBatches].filter(
      (value) => value !== null
    );
    const modalMaxBatches = availableBatchLimits.length ? Math.min(...availableBatchLimits) : null;
    const suggestedBatches = matchedCredit
      ? Math.min(matchedCredit.batches, modalMaxBatches === null ? matchedCredit.batches : modalMaxBatches)
      : 0;
    const activeCredit = matchedCredit
      ? {
          ...matchedCredit,
          maxBatches: modalMaxBatches,
          suggestedBatches,
          suggestedItems: suggestedBatches * matchedCredit.itemCount,
          suggestedCredits: suggestedBatches * matchedCredit.creditCount
        }
      : null;
    const result = { ...base, missingCredits, blockers, activeCredit };

    if (activeCredit) {
      if (activeCredit.method === "unavailable") return { ...result, status: "unavailable" };
      if (modal.selectedItemHrid === activeCredit.recommendedItemHrid) return { ...result, status: "set_quantity" };
      if (activeCredit.method === "guild_token") return { ...result, status: "use_guild_token" };
      return { ...result, status: "choose_item" };
    }
    if (missingCredits.length) return { ...result, status: "choose_credit" };
    if (blockers.length) return { ...result, status: "blocked" };
    return { ...result, status: "upgrade_shrine" };
  }

  return { deriveShrineGuide, inventoryCountForItem };
});


// SOURCE: src/runtime/config.js
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

  return {
    UPDATE_SCRIPT_URL:
      "https://raw.githubusercontent.com/LaYuDr/milky-way-idle-guild-credit-optimizer/main/dist/milky-way-idle-guild-credit-optimizer.user.js",
    FALLBACK_INSTALL_URL:
      "https://www.tampermonkey.net/script_installation.php#url=https://js.nainai.eu.org/proxy/https://update.greasyfork.org/scripts/586873/%E9%93%B6%E6%B2%B3%E5%A5%B6%E7%89%9B%E5%85%AC%E4%BC%9A%E4%BF%A1%E7%94%A8%E7%82%B9%E6%80%A7%E4%BB%B7%E6%AF%94.user.js",
    PRICE_REFERENCE_STORAGE_KEY: "mwi-credit-price-reference",
    UI_STATE_STORAGE_KEY: "mwi-guild-credit-ui-state-v1",
    GUILD_BUILDING_PLAN_STORAGE_PREFIX: "mwi-guild-building-planner-v1",
    MARKET_LIVE_STORAGE_KEY: "mwi-guild-credit-live-market-v1",
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
    SELLER_TAX_RATE: 0.02,
    GUILD_SHRINE_NAME_KEYS: {
      "/guild_shrines/force": "shrineForce",
      "/guild_shrines/tempo": "shrineTempo",
      "/guild_shrines/spirit": "shrineSpirit",
      "/guild_shrines/rarity": "shrineRarity",
      "/guild_shrines/scholar": "shrineScholar"
    }
  };
});


// SOURCE: src/runtime/storage.js
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MwiGuildCreditStorage = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const GUILD_BUFF_HRID_PATTERN = /^\/guild_buffs\/[A-Za-z0-9_./-]+$/;

  function normalizeGuildShrineAutofillExcludedBuffHrids(value) {
    const values =
      Array.isArray(value) || (value && typeof value !== "string" && typeof value[Symbol.iterator] === "function")
        ? Array.from(value)
        : [];
    return Array.from(
      new Set(
        values.filter(
          (guildBuffHrid) => typeof guildBuffHrid === "string" && GUILD_BUFF_HRID_PATTERN.test(guildBuffHrid)
        )
      )
    );
  }

  function normalizePanelView(view, panelViews) {
    return panelViews.includes(view) ? view : "credit";
  }

  function normalizePanelOrder(order, panelViews, defaultOrder = panelViews) {
    const allowed = new Set(panelViews);
    const normalized = [];
    for (const view of Array.isArray(order) ? order : []) {
      if (allowed.has(view) && !normalized.includes(view)) normalized.push(view);
    }
    for (const view of defaultOrder) {
      if (allowed.has(view) && !normalized.includes(view)) normalized.push(view);
    }
    for (const view of panelViews) {
      if (!normalized.includes(view)) normalized.push(view);
    }
    return normalized;
  }

  function createPluginStorage(options) {
    const { storage, location, config, buildingDataApi, marketDataApi } = options;
    const creditHrids = new Set(config.CREDIT_TYPES.map(([hrid]) => hrid));

    function guildBuildingPlannerStorageKey() {
      let characterId = "default";
      try {
        characterId = new URL(location.href).searchParams.get("characterId") || characterId;
      } catch (_) {
        // A per-host fallback still prevents plans from crossing game regions.
      }
      const hostname = (location && location.hostname) || "game";
      return `${config.GUILD_BUILDING_PLAN_STORAGE_PREFIX}:${hostname}:${characterId}`;
    }

    function loadSavedPluginUiState() {
      const fallback = {
        collapsedCreditSections: [],
        guildTokenValuesCollapsed: false,
        guildTokenCreditHrids: [],
        autoGuildTokenBudget: null,
        shrineGuideEnabled: false,
        maxConversionItemUnitPrice: null,
        guildShrineAutofillExcludedBuffHrids: [],
        showConstructionView: true,
        activeView: "credit",
        panelOrder: normalizePanelOrder([], config.PANEL_VIEWS, config.DEFAULT_PANEL_ORDER),
        targetCredit: 1,
        upgradePlans: []
      };
      try {
        const raw = storage && storage.getItem(config.UI_STATE_STORAGE_KEY);
        if (!raw) return fallback;
        const stored = JSON.parse(raw);
        if (!stored || typeof stored !== "object") return fallback;
        const collapsedCreditSections = Array.isArray(stored.collapsedCreditSections)
          ? Array.from(new Set(stored.collapsedCreditSections.filter((hrid) => creditHrids.has(hrid))))
          : [];
        const upgradePlans = Array.isArray(stored.upgradePlans)
          ? stored.upgradePlans
              .filter(
                (plan) =>
                  plan &&
                  typeof plan.guildBuffHrid === "string" &&
                  Number.isSafeInteger(plan.startLevel) &&
                  Number.isSafeInteger(plan.targetLevel)
              )
              .map((plan) => ({
                guildBuffHrid: plan.guildBuffHrid,
                startLevel: plan.startLevel,
                targetLevel: plan.targetLevel
              }))
          : [];
        const targetCredit = Number(stored.targetCredit);
        const guildTokenCreditHrids = Array.isArray(stored.guildTokenCreditHrids)
          ? Array.from(new Set(stored.guildTokenCreditHrids.filter((hrid) => creditHrids.has(hrid))))
          : stored.useGuildTokensForMissingCredits === true
            ? Array.from(creditHrids)
            : [];
        const autoGuildTokenBudgetValue = Number(stored.autoGuildTokenBudget);
        const autoGuildTokenBudget =
          stored.autoGuildTokenBudget === null || stored.autoGuildTokenBudget === undefined
            ? null
            : Number.isSafeInteger(autoGuildTokenBudgetValue) && autoGuildTokenBudgetValue >= 0
              ? autoGuildTokenBudgetValue
              : null;
        const maxConversionItemUnitPriceValue = Number(stored.maxConversionItemUnitPrice);
        const maxConversionItemUnitPrice =
          stored.maxConversionItemUnitPrice !== null &&
          stored.maxConversionItemUnitPrice !== undefined &&
          Number.isSafeInteger(maxConversionItemUnitPriceValue) &&
          maxConversionItemUnitPriceValue > 0
            ? maxConversionItemUnitPriceValue
            : null;
        return {
          collapsedCreditSections,
          guildTokenValuesCollapsed: stored.guildTokenValuesCollapsed === true,
          guildTokenCreditHrids,
          autoGuildTokenBudget,
          shrineGuideEnabled: stored.shrineGuideEnabled === true,
          maxConversionItemUnitPrice,
          guildShrineAutofillExcludedBuffHrids: normalizeGuildShrineAutofillExcludedBuffHrids(
            stored.guildShrineAutofillExcludedBuffHrids
          ),
          showConstructionView: stored.showConstructionView !== false,
          activeView: normalizePanelView(stored.activeView, config.PANEL_VIEWS),
          panelOrder: normalizePanelOrder(stored.panelOrder, config.PANEL_VIEWS, config.DEFAULT_PANEL_ORDER),
          targetCredit: Number.isSafeInteger(targetCredit) && targetCredit > 0 ? targetCredit : 1,
          upgradePlans
        };
      } catch (_) {
        return fallback;
      }
    }

    function loadSavedGuildBuildingPlannerState() {
      const fallback = { plans: [], manualGuildPoints: null, category: "all" };
      try {
        const raw = storage && storage.getItem(guildBuildingPlannerStorageKey());
        if (!raw) return fallback;
        const stored = JSON.parse(raw);
        if (!stored || typeof stored !== "object") return fallback;
        const definitions = new Map(buildingDataApi.definitions().map((entry) => [entry.hrid, entry]));
        const seenBuildingHrids = new Set();
        const plans = Array.isArray(stored.plans)
          ? stored.plans.flatMap((plan) => {
              const definition = plan && definitions.get(plan.buildingHrid);
              const startLevel = Number(plan && plan.startLevel);
              const targetLevel = Number(plan && plan.targetLevel);
              if (
                !definition ||
                !Number.isSafeInteger(startLevel) ||
                !Number.isSafeInteger(targetLevel) ||
                startLevel < 0 ||
                targetLevel <= startLevel ||
                targetLevel > definition.maxLevel
              )
                return [];
              if (seenBuildingHrids.has(definition.hrid)) return [];
              seenBuildingHrids.add(definition.hrid);
              return [{ buildingHrid: definition.hrid, startLevel, targetLevel }];
            })
          : [];
        const manualGuildPointsValue = Number(stored.manualGuildPoints);
        const manualGuildPoints =
          stored.manualGuildPoints === null || stored.manualGuildPoints === undefined || stored.manualGuildPoints === ""
            ? null
            : Number.isSafeInteger(manualGuildPointsValue) && manualGuildPointsValue >= 0
              ? manualGuildPointsValue
              : null;
        const category = ["all", "core", "life", "combat", "shrine"].includes(stored.category)
          ? stored.category
          : "all";
        return { plans, manualGuildPoints, category };
      } catch (_) {
        return fallback;
      }
    }

    function persistGuildBuildingPlannerState(state) {
      try {
        storage &&
          storage.setItem(
            guildBuildingPlannerStorageKey(),
            JSON.stringify({
              schemaVersion: 1,
              rulesVersion: buildingDataApi.RULES_VERSION,
              manualGuildPoints: state.manualGuildPoints,
              category: state.buildingCategory,
              plans: state.buildingPlans.map((plan) => ({
                buildingHrid: plan.buildingHrid,
                startLevel: plan.startLevel,
                targetLevel: plan.targetLevel
              }))
            })
          );
      } catch (_) {
        // Keep the current page state when browser storage is unavailable.
      }
    }

    function persistPluginUiState(state) {
      try {
        if (!storage || typeof storage.setItem !== "function") return false;
        const upgradePlans = state.upgradePlans.map((plan) => ({
          guildBuffHrid: plan.guildBuffHrid,
          startLevel: plan.startLevel,
          targetLevel: plan.targetLevel
        }));
        storage.setItem(
          config.UI_STATE_STORAGE_KEY,
          JSON.stringify({
            collapsedCreditSections: Array.from(state.collapsedCreditSections),
            guildTokenValuesCollapsed: state.guildTokenValuesCollapsed,
            guildTokenCreditHrids: Array.from(state.guildTokenCreditHrids),
            autoGuildTokenBudget: state.autoGuildTokenBudget,
            shrineGuideEnabled: state.shrineGuideEnabled,
            maxConversionItemUnitPrice:
              Number.isSafeInteger(state.maxConversionItemUnitPrice) && state.maxConversionItemUnitPrice > 0
                ? state.maxConversionItemUnitPrice
                : null,
            guildShrineAutofillExcludedBuffHrids: normalizeGuildShrineAutofillExcludedBuffHrids(
              state.guildShrineAutofillExcludedBuffHrids
            ),
            showConstructionView: state.showConstructionView !== false,
            activeView: state.activeView,
            panelOrder: normalizePanelOrder(state.panelOrder, config.PANEL_VIEWS, config.DEFAULT_PANEL_ORDER),
            useGuildTokensForMissingCredits: config.CREDIT_TYPES.every(([hrid]) =>
              state.guildTokenCreditHrids.has(hrid)
            ),
            targetCredit: state.targetCredit,
            upgradePlans
          })
        );
        return true;
      } catch (_) {
        // Keep the current page state when browser storage is unavailable.
        return false;
      }
    }

    function loadSavedLiveMarketData() {
      try {
        const raw = storage && storage.getItem(config.MARKET_LIVE_STORAGE_KEY);
        return marketDataApi.restoreLiveMarketData(raw);
      } catch (_) {
        return { liveData: Object.create(null), revision: 0, valid: false };
      }
    }

    function persistLiveMarketData(liveData, revision) {
      try {
        if (!storage) return;
        if (!Object.keys(liveData).length) {
          storage.removeItem(config.MARKET_LIVE_STORAGE_KEY);
          return;
        }
        const cache = marketDataApi.serializeLiveMarketData(liveData, { revision });
        storage.setItem(config.MARKET_LIVE_STORAGE_KEY, JSON.stringify(cache));
      } catch (_) {
        // A storage quota or privacy restriction must not interrupt the game.
      }
    }

    function loadPriceReference() {
      try {
        const saved = storage && storage.getItem(config.PRICE_REFERENCE_STORAGE_KEY);
        return config.PRICE_REFERENCES[saved] ? saved : "a";
      } catch (_) {
        return "a";
      }
    }

    function persistPriceReference(reference) {
      try {
        storage && storage.setItem(config.PRICE_REFERENCE_STORAGE_KEY, reference);
      } catch (_) {
        // Keep the current page choice even when browser storage is unavailable.
      }
    }

    return {
      guildBuildingPlannerStorageKey,
      loadSavedPluginUiState,
      loadSavedGuildBuildingPlannerState,
      persistGuildBuildingPlannerState,
      persistPluginUiState,
      loadSavedLiveMarketData,
      persistLiveMarketData,
      loadPriceReference,
      persistPriceReference
    };
  }

  return {
    normalizePanelView,
    normalizePanelOrder,
    normalizeGuildShrineAutofillExcludedBuffHrids,
    createPluginStorage
  };
});


// SOURCE: src/runtime/scheduler.js
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MwiGuildCreditScheduler = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function createDebouncedTask(options) {
    const { task, delay = 0, setTimer = setTimeout, clearTimer = clearTimeout } = options;
    let timer = null;
    let latestArgs = [];
    let disposed = false;

    function cancel() {
      if (timer === null) return;
      clearTimer(timer);
      timer = null;
    }

    function schedule(...args) {
      if (disposed) return false;
      latestArgs = args;
      cancel();
      timer = setTimer(() => {
        timer = null;
        task(...latestArgs);
      }, delay);
      return true;
    }

    function dispose() {
      disposed = true;
      latestArgs = [];
      cancel();
    }

    return {
      schedule,
      cancel,
      dispose,
      pending: () => timer !== null,
      disposed: () => disposed
    };
  }

  function createFrameTask(options) {
    const { task, requestFrame, cancelFrame, merge = (_, next) => next } = options;
    let frame = null;
    let payload;
    let disposed = false;

    function cancel() {
      if (frame === null) return;
      if (typeof cancelFrame === "function") cancelFrame(frame);
      frame = null;
      payload = undefined;
    }

    function schedule(nextPayload) {
      if (disposed) return false;
      payload = frame === null ? nextPayload : merge(payload, nextPayload);
      if (frame !== null) return true;
      frame = requestFrame(() => {
        frame = null;
        const currentPayload = payload;
        payload = undefined;
        task(currentPayload);
      });
      return true;
    }

    function dispose() {
      disposed = true;
      cancel();
    }

    return {
      schedule,
      cancel,
      dispose,
      pending: () => frame !== null,
      disposed: () => disposed
    };
  }

  return { createDebouncedTask, createFrameTask };
});


// SOURCE: src/runtime/game-state.js
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MwiGuildCreditGameState = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function objectCollection(candidate) {
    return Boolean(candidate && (Array.isArray(candidate) || typeof candidate === "object"));
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

  const GUILD_BUILDING_LEVEL_FIELDS = [
    "guildBuildingMap",
    "guildBuildingDict",
    "guildBuildings",
    "guildBuildingLevelMap",
    "guildBuildingLevelDict",
    "guildBuildingLevels"
  ];

  function createGameStateAdapter(state) {
    function setItemDetails(candidate) {
      if (!objectCollection(candidate)) return false;
      if (state.itemDetails !== candidate) state.conversionCache.clear();
      state.itemDetails = candidate;
      return true;
    }

    function setGuildBuffDetails(candidate) {
      if (!objectCollection(candidate)) return false;
      state.guildBuffDetails = candidate;
      return true;
    }

    function setGuildBuffLevels(candidate) {
      if (!objectCollection(candidate)) return false;
      state.guildBuffLevels = candidate;
      return true;
    }

    function setMergedStateField(field, candidate) {
      if (!objectCollection(candidate)) return false;
      state[field] = mergeGuildShrineLevels(state[field], candidate);
      return true;
    }

    function setGuildShrineLevels(candidate) {
      return setMergedStateField("guildShrineLevels", candidate);
    }

    function setGuildShrineDetails(candidate) {
      return setMergedStateField("guildShrineDetails", candidate);
    }

    function setGuildBuildingLevels(candidate) {
      return setMergedStateField("guildBuildingLevels", candidate);
    }

    function setGuildBuildingDetails(candidate) {
      return setMergedStateField("guildBuildingDetails", candidate);
    }

    function setCharacterItems(candidate) {
      if (!Array.isArray(candidate)) return false;
      state.characterItems = candidate;
      return true;
    }

    function setGuildBuffLevelsFrom(source) {
      if (!source || typeof source !== "object") return false;
      return setGuildBuffLevels(
        source.characterGuildBuffMap ||
          source.characterGuildBuffDict ||
          source.characterGuildBuffs ||
          source.characterGuildBuffLevelMap ||
          source.characterGuildBuffLevelDict ||
          source.guildBuffLevelMap ||
          source.guildBuffLevelDict ||
          source.guildBuffLevels ||
          source.guildBuffMap ||
          source.guildBuffDict
      );
    }

    function applyCandidates(source, fields, setter) {
      if (!source || typeof source !== "object") return false;
      let updated = false;
      for (const field of fields) updated = setter(source[field]) || updated;
      return updated;
    }

    function setGuildShrineLevelsFrom(source) {
      return applyCandidates(
        source,
        [
          "guildShrineMap",
          "guildShrineDict",
          "guildShrines",
          "guildShrineLevelMap",
          "guildShrineLevelDict",
          "guildShrineLevels",
          "guildBuildingMap",
          "guildBuildingDict",
          "guildBuildings",
          "guildBuildingLevelMap",
          "guildBuildingLevelDict",
          "guildBuildingLevels"
        ],
        setGuildShrineLevels
      );
    }

    function setGuildShrineDetailsFrom(source) {
      return applyCandidates(
        source,
        [
          "guildShrineDetailMap",
          "guildShrineDetailDict",
          "guildShrineDetails",
          "guildBuildingDetailMap",
          "guildBuildingDetailDict",
          "guildBuildingDetails"
        ],
        setGuildShrineDetails
      );
    }

    function setGuildBuildingLevelsFrom(source) {
      return applyCandidates(source, GUILD_BUILDING_LEVEL_FIELDS, setGuildBuildingLevels);
    }

    function seedCompleteGuildBuildingLevelsFrom(source) {
      if (!source || typeof source !== "object") return false;
      let snapshot = null;
      let found = false;
      for (const field of GUILD_BUILDING_LEVEL_FIELDS) {
        if (!Object.prototype.hasOwnProperty.call(source, field) || !objectCollection(source[field])) continue;
        snapshot = mergeGuildShrineLevels(snapshot, source[field]);
        found = true;
      }
      if (!found) return false;
      // Initialization data is the complete baseline; current-session frames
      // already merged into state take precedence when the snapshot is older.
      state.guildBuildingLevels = mergeGuildShrineLevels(snapshot, state.guildBuildingLevels);
      state.guildBuildingLevelsComplete = true;
      return true;
    }

    function setGuildBuildingDetailsFrom(source) {
      return applyCandidates(
        source,
        ["guildBuildingDetailMap", "guildBuildingDetailDict", "guildBuildingDetails"],
        setGuildBuildingDetails
      );
    }

    return {
      setItemDetails,
      setGuildBuffDetails,
      setGuildBuffLevels,
      setGuildShrineLevels,
      setGuildShrineDetails,
      setGuildBuildingLevels,
      setGuildBuildingDetails,
      setCharacterItems,
      setGuildBuffLevelsFrom,
      setGuildShrineLevelsFrom,
      setGuildShrineDetailsFrom,
      setGuildBuildingLevelsFrom,
      seedCompleteGuildBuildingLevelsFrom,
      setGuildBuildingDetailsFrom
    };
  }

  return { guildShrineLevelRecordKey, mergeGuildShrineLevels, createGameStateAdapter };
});


// SOURCE: src/runtime/game-data.js
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MwiGuildCreditGameData = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function createGameData(dependencies) {
    const {
      state,
      pageWindow,
      document,
      marketDataApi,
      core,
      setItemDetails,
      setGuildBuffDetails,
      setCharacterItems,
      setGuildBuffLevelsFrom,
      setGuildShrineLevelsFrom,
      setGuildShrineDetailsFrom,
      setGuildBuildingLevelsFrom,
      seedCompleteGuildBuildingLevelsFrom,
      setGuildBuildingDetailsFrom,
      persistLiveMarketData,
      scheduleMarketDataRefresh,
      scheduleInventoryDataRefresh,
      scheduleGuildDataRefresh,
      t,
      resolveItemName,
      CREDIT_TYPES
    } = dependencies;

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
      if (
        state.itemDetails &&
        state.guildBuffDetails &&
        state.guildBuffLevels &&
        state.guildShrineLevels &&
        state.guildBuildingLevels &&
        state.guildBuildingLevelsComplete === true &&
        state.characterItems
      )
        return true;
      let raw;
      try {
        raw = pageWindow.localStorage && pageWindow.localStorage.getItem("initClientData");
      } catch (_) {
        return false;
      }
      if (!raw) return false;
      try {
        const decoded = decompressFromUtf16(raw);
        let data;
        try {
          data = JSON.parse(decoded || raw);
        } catch (_) {
          data = JSON.parse(raw);
        }
        // initClientData is a durable fallback and can outlive a game data update.
        // Never let it overwrite values already captured from the current session.
        const hasItems = !state.itemDetails && setItemDetails(data.itemDetailMap || data.itemDetailDict);
        const hasGuildBuffs =
          !state.guildBuffDetails && setGuildBuffDetails(data.guildBuffDetailMap || data.guildBuffDetailDict);
        const hasGuildBuffLevels =
          !state.guildBuffLevels && (setGuildBuffLevelsFrom(data) || setGuildBuffLevelsFrom(data.character));
        const hasGuildShrineLevels =
          !state.guildShrineLevels && (setGuildShrineLevelsFrom(data) || setGuildShrineLevelsFrom(data.guild));
        const hasGuildShrineDetails =
          !state.guildShrineDetails && (setGuildShrineDetailsFrom(data) || setGuildShrineDetailsFrom(data.guild));
        const hasRootGuildBuildingLevels = seedCompleteGuildBuildingLevelsFrom(data);
        const hasNestedGuildBuildingLevels = seedCompleteGuildBuildingLevelsFrom(data.guild);
        const hasGuildBuildingLevels = hasRootGuildBuildingLevels || hasNestedGuildBuildingLevels;
        const hasGuildBuildingDetails =
          !state.guildBuildingDetails && (setGuildBuildingDetailsFrom(data) || setGuildBuildingDetailsFrom(data.guild));
        const hasCharacterItems =
          !state.characterItems && setCharacterItems(data.characterItems || (data.character && data.character.items));
        return (
          hasItems ||
          hasGuildBuffs ||
          hasGuildBuffLevels ||
          hasGuildShrineLevels ||
          hasGuildShrineDetails ||
          hasGuildBuildingLevels ||
          hasGuildBuildingDetails ||
          hasCharacterItems
        );
      } catch (_) {
        return false;
      }
    }

    function extractItemDetailsFromReact() {
      if (
        state.itemDetails &&
        state.guildBuffDetails &&
        state.guildBuffLevels &&
        state.guildShrineLevels &&
        state.guildBuildingLevels &&
        state.characterItems
      )
        return true;
      const roots = [document.getElementById("root"), document.body].filter(Boolean);
      const visited = new Set();
      const stack = [];
      for (const root of roots) {
        for (const key of Object.keys(root)) {
          if (
            key.startsWith("__reactFiber$") ||
            key.startsWith("__reactContainer$") ||
            key.startsWith("__reactInternalInstance$")
          )
            stack.push(root[key]);
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
          found = setGuildBuildingLevelsFrom(candidate) || found;
          found = setGuildBuildingDetailsFrom(candidate) || found;
          found = setCharacterItems(candidate.characterItems) || found;
          if (
            state.itemDetails &&
            state.guildBuffDetails &&
            state.guildBuffLevels &&
            state.guildShrineLevels &&
            state.guildBuildingLevels &&
            state.characterItems
          )
            return true;
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
      setGuildBuildingLevelsFrom(value);
      setGuildBuildingDetailsFrom(value);
      setCharacterItems(value.characterItems);
      for (const child of Object.values(value)) scanMessage(child, depth + 1);
    }

    function rememberLiveMarketUpdate(update, receivedAt) {
      if (!update) return false;
      const signature = JSON.stringify(update.levels);
      const observedAt = Number(receivedAt);
      if (
        (!Number.isFinite(observedAt) || observedAt <= 0) &&
        state.marketUpdateSignatures[update.itemHrid] === signature
      )
        return false;
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

    function hydrateBridgeData() {
      const bridge = window.__mwiGuildCreditBridge;
      if (!bridge || typeof bridge !== "object") return false;
      let marketChanged = false;
      bridge.onMarketOrderBooksUpdated = hydrateBridgeData;
      bridge.onCharacterItemsUpdated = hydrateBridgeData;
      bridge.onGuildBuffLevelsUpdated = hydrateBridgeData;
      setItemDetails(bridge.itemDetails);
      setGuildBuffDetails(bridge.guildBuffDetails);
      setGuildBuffLevelsFrom(bridge);
      setGuildShrineLevelsFrom(bridge);
      setGuildShrineDetailsFrom(bridge);
      setGuildBuildingLevelsFrom(bridge);
      setGuildBuildingDetailsFrom(bridge);
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
      const guildBuffLevelsRevision = Number(bridge.guildBuffLevelsRevision);
      if (
        Number.isSafeInteger(guildBuffLevelsRevision) &&
        guildBuffLevelsRevision > state.guildBuffLevelsBridgeRevision
      ) {
        state.guildBuffLevelsBridgeRevision = guildBuffLevelsRevision;
        scheduleGuildDataRefresh();
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
            if (String((message && message.type) || "") !== "market_item_order_books_updated") continue;
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
      const matchesCandidate =
        state.marketSnapshotCandidateSignature === signature &&
        normalizedTimestamp >= state.marketSnapshotCandidateTimestamp;
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
      return marketDataApi.resolveMarketPrice(state.snapshot, state.marketLiveData, itemHrid, enhancementLevel, field);
    }

    function snapshotImmediateSellPrice(itemHrid, enhancementLevel = 0) {
      return snapshotPrice(itemHrid, "b", enhancementLevel);
    }

    function allConversions(creditItemHrid, options = {}) {
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
      return conversions.flatMap((conversion) => {
        const itemName = resolveItemName(conversion.itemHrid, conversion.itemName);
        if (
          options.applyPriceLimit !== false &&
          Number.isSafeInteger(state.maxConversionItemUnitPrice) &&
          state.maxConversionItemUnitPrice > 0 &&
          !core.isUnitPriceWithinLimit(
            snapshotPrice(conversion.itemHrid, state.priceReference),
            state.maxConversionItemUnitPrice
          )
        )
          return [];
        return [{ ...conversion, itemName }];
      });
    }

    function creditConversionGroups(options) {
      return CREDIT_TYPES.map(([creditItemHrid, color]) => ({
        creditItemHrid,
        color,
        conversions: allConversions(creditItemHrid, options)
      }));
    }

    return {
      hydrateLocalInitData,
      extractItemDetailsFromReact,
      hydrateBridgeData,
      loadSnapshot,
      snapshotOrderBook,
      snapshotPrice,
      snapshotImmediateSellPrice,
      allConversions,
      creditConversionGroups
    };
  }

  return { createGameData };
});


// SOURCE: src/ui/dom.js
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MwiGuildCreditDom = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function updateRenderedMarkup(element, markup, propertyName) {
    if (!element || element[propertyName] === markup) return false;
    element.innerHTML = markup;
    element[propertyName] = markup;
    return true;
  }

  function escapeHtml(value) {
    return String(value).replace(
      /[&<>'"]/g,
      (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]
    );
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
    const match = String((label && label.textContent) || "")
      .trim()
      .match(/^\+(\d+)$/);
    const level = Number(match && match[1]);
    return Number.isSafeInteger(level) && level >= 0 ? level : 0;
  }

  function spriteBaseFromReference(reference, marker) {
    const value = String(reference || "").trim();
    const normalizedMarker = String(marker || "")
      .trim()
      .toLowerCase();
    if (!value || !normalizedMarker) return "";
    const hashIndex = value.lastIndexOf("#");
    const base = hashIndex >= 0 ? value.slice(0, hashIndex) : value;
    return base.toLowerCase().includes(normalizedMarker) ? base : "";
  }

  function findSpriteBaseHref(root, marker) {
    if (!root || typeof root.querySelectorAll !== "function") return "";
    for (const useElement of root.querySelectorAll("use")) {
      const reference = useElement.getAttribute("href") || useElement.getAttribute("xlink:href");
      const base = spriteBaseFromReference(reference, marker);
      if (base) return base;
    }
    return "";
  }

  function spriteBaseFromAssetManifest(manifest, marker) {
    if (!manifest || typeof manifest !== "object" || !manifest.files || typeof manifest.files !== "object") return "";
    for (const [name, reference] of Object.entries(manifest.files)) {
      const base = spriteBaseFromReference(reference, marker);
      if (
        base ||
        String(name)
          .toLowerCase()
          .includes(String(marker || "").toLowerCase())
      )
        return base || String(reference);
    }
    return "";
  }

  return {
    updateRenderedMarkup,
    escapeHtml,
    itemHridFromIcon,
    enhancementLevelFromIcon,
    spriteBaseFromReference,
    findSpriteBaseHref,
    spriteBaseFromAssetManifest
  };
});


// SOURCE: src/ui/sidebar-integration.js
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MwiGuildCreditSidebarIntegration = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const SIDEBAR_LABELS = {
    "zh-CN": ["库存", "装备", "技能", "房屋", "配装", "收获"],
    en: ["Inventory", "Equipment", "Skills", "House", "Loadout", "Loadouts", "Harvest", "Gathering"]
  };
  const EXPECTED_LABELS = new Set(Object.values(SIDEBAR_LABELS).flat());

  function sidebarLocale(labels) {
    const counts = { "zh-CN": 0, en: 0 };
    for (const label of Array.isArray(labels) ? labels : []) {
      if (SIDEBAR_LABELS["zh-CN"].includes(label)) counts["zh-CN"] += 1;
      else if (SIDEBAR_LABELS.en.includes(label)) counts.en += 1;
    }
    if (counts["zh-CN"] === counts.en) return null;
    return counts["zh-CN"] > counts.en ? "zh-CN" : "en";
  }

  function findSidebarIntegration(documentRef, preferredLocale) {
    if (!documentRef || typeof documentRef.getElementsByTagName !== "function") return null;
    const elements = documentRef.getElementsByTagName("*");
    let bestIntegration = null;
    for (let index = 0; index < elements.length; index += 1) {
      const candidate = elements[index];
      const children = Array.from(candidate.children || []);
      if (children.length < 4) continue;
      const tabs = children.map((element) => ({
        element,
        label: String(element.innerText || element.textContent || "")
          .replaceAll("\n", "")
          .trim()
      }));
      const recognized = tabs.filter((tab) => EXPECTED_LABELS.has(tab.label));
      if (recognized.length < 4) continue;
      const detectedLocale = sidebarLocale(recognized.map((tab) => tab.label));
      const prototypeLabels =
        (detectedLocale || preferredLocale) === "zh-CN" ? ["库存", "Inventory"] : ["Inventory", "库存"];
      const prototype = recognized.find((tab) => prototypeLabels.includes(tab.label)) || recognized[0];
      const tabsRoot = candidate.parentElement?.parentElement?.parentElement;
      const sidebar = tabsRoot && tabsRoot.parentElement;
      const panelHost =
        sidebar &&
        Array.from(sidebar.children || []).find(
          (node) => node !== tabsRoot && /tabPanelsContainer/.test(String(node.className))
        );
      if (!panelHost) continue;
      const rect = candidate.getBoundingClientRect();
      const visible = candidate.isConnected && rect.width > 0 && rect.height > 0;
      const integration = {
        tabBar: candidate,
        tabPrototype: prototype.element,
        panelHost,
        detectedLocale,
        score: (visible ? 1000 : 0) + recognized.length
      };
      if (!bestIntegration || integration.score > bestIntegration.score) bestIntegration = integration;
    }
    return bestIntegration;
  }

  return { SIDEBAR_LABELS, sidebarLocale, findSidebarIntegration };
});


// SOURCE: src/ui/sortable.js
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MwiGuildCreditSortable = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function normalizeOrder(order, allowed, fallback = allowed) {
    const allowedSet = new Set(allowed);
    const normalized = [];
    for (const value of Array.isArray(order) ? order : []) {
      if (allowedSet.has(value) && !normalized.includes(value)) normalized.push(value);
    }
    for (const value of fallback) {
      if (allowedSet.has(value) && !normalized.includes(value)) normalized.push(value);
    }
    for (const value of allowed) {
      if (!normalized.includes(value)) normalized.push(value);
    }
    return normalized;
  }

  function reorderByIndex(items, fromIndex, toIndex) {
    const next = Array.from(items || []);
    if (
      !Number.isInteger(fromIndex) ||
      !Number.isInteger(toIndex) ||
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= next.length ||
      toIndex >= next.length ||
      fromIndex === toIndex
    )
      return next;
    const [item] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, item);
    return next;
  }

  function reorderVisibleByIndex(order, visibleValues, value, toIndex) {
    const fullOrder = Array.from(order || []);
    const visibleSet = new Set(visibleValues || []);
    const visibleOrder = fullOrder.filter((candidate) => visibleSet.has(candidate));
    const fromIndex = visibleOrder.indexOf(value);
    const nextVisibleOrder = reorderByIndex(visibleOrder, fromIndex, toIndex);
    if (nextVisibleOrder.every((candidate, index) => candidate === visibleOrder[index])) return fullOrder;
    let visibleIndex = 0;
    return fullOrder.map((candidate) => (visibleSet.has(candidate) ? nextVisibleOrder[visibleIndex++] : candidate));
  }

  function createPointerSortable(options) {
    const {
      root,
      containerSelector,
      itemSelector,
      handleSelector = itemSelector,
      axis = "y",
      threshold = 6,
      onCommit
    } = options || {};
    if (!root || typeof root.addEventListener !== "function") return { destroy() {} };

    const ownerDocument = root.ownerDocument || (typeof document !== "undefined" ? document : null);
    const ownerWindow = ownerDocument && ownerDocument.defaultView;
    let drag = null;
    let suppressClick = false;
    root.querySelectorAll(containerSelector).forEach((container) => container.classList.add(`mwi-sort-axis-${axis}`));

    function sortableItems(container) {
      return Array.from(container.querySelectorAll(itemSelector)).filter((item) => item.parentElement === container);
    }

    function clearMarkers() {
      if (!drag) return;
      for (const item of sortableItems(drag.container)) {
        item.classList.remove("mwi-sort-drop-before", "mwi-sort-drop-after", "mwi-sort-dragging");
        item.style.removeProperty("transform");
        item.style.removeProperty("z-index");
      }
      drag.container.classList.remove("mwi-sort-active");
    }

    function finish(commit) {
      if (!drag) return;
      const finished = drag;
      clearMarkers();
      drag = null;
      if (commit && finished.dragging) suppressClick = true;
      if (commit && finished.dragging && finished.toIndex !== finished.fromIndex && typeof onCommit === "function") {
        onCommit({
          key: finished.key,
          fromIndex: finished.fromIndex,
          toIndex: finished.toIndex,
          container: finished.container
        });
      }
    }

    function indexAtPointer(items, coordinate) {
      let insertionIndex = items.length;
      for (let index = 0; index < items.length; index += 1) {
        const rect = items[index].getBoundingClientRect();
        const midpoint = axis === "x" ? rect.left + rect.width / 2 : rect.top + rect.height / 2;
        if (coordinate < midpoint) {
          insertionIndex = index;
          break;
        }
      }
      return insertionIndex;
    }

    function updateDropTarget(event) {
      const items = sortableItems(drag.container);
      const candidates = items.filter((item) => item !== drag.item);
      const coordinate = axis === "x" ? event.clientX : event.clientY;
      const insertionIndex = indexAtPointer(candidates, coordinate);
      const toIndex = Math.max(0, Math.min(items.length - 1, insertionIndex));
      drag.toIndex = toIndex;
      for (const item of items) item.classList.remove("mwi-sort-drop-before", "mwi-sort-drop-after");
      const markerIndex = Math.min(insertionIndex, candidates.length - 1);
      const marker = candidates[markerIndex];
      if (marker) {
        marker.classList.add(insertionIndex >= candidates.length ? "mwi-sort-drop-after" : "mwi-sort-drop-before");
      }

      const delta = coordinate - (axis === "x" ? drag.startX : drag.startY);
      drag.item.style.transform = axis === "x" ? `translateX(${delta}px)` : `translateY(${delta}px)`;
      drag.item.style.zIndex = "8";

      const scrollContainer = axis === "y" ? root : drag.container;
      const rect = scrollContainer.getBoundingClientRect();
      const edge = 36;
      const scrollDelta =
        coordinate < (axis === "x" ? rect.left : rect.top) + edge
          ? -12
          : coordinate > (axis === "x" ? rect.right : rect.bottom) - edge
            ? 12
            : 0;
      if (scrollDelta && typeof scrollContainer.scrollBy === "function") {
        scrollContainer.scrollBy(axis === "x" ? { left: scrollDelta } : { top: scrollDelta });
      }
    }

    function pointerDown(event) {
      if (event.button !== undefined && event.button !== 0) return;
      if (event.isPrimary === false) return;
      const target = event.target && (event.target.nodeType === 1 ? event.target : event.target.parentElement);
      const handle = target && target.closest(handleSelector);
      const item = handle && handle.closest(itemSelector);
      const container = item && item.closest(containerSelector);
      if (!handle || !item || !container || !root.contains(container) || item.parentElement !== container) return;
      container.classList.add(`mwi-sort-axis-${axis}`);
      const items = sortableItems(container);
      const fromIndex = items.indexOf(item);
      if (fromIndex < 0 || items.length < 2) return;
      drag = {
        pointerId: event.pointerId,
        handle,
        item,
        container,
        key: item.dataset.sortKey || "",
        startX: event.clientX,
        startY: event.clientY,
        fromIndex,
        toIndex: fromIndex,
        dragging: false
      };
    }

    function pointerMove(event) {
      if (!drag || (drag.pointerId !== undefined && event.pointerId !== drag.pointerId)) return;
      const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
      if (!drag.dragging && distance < threshold) return;
      if (!drag.dragging) {
        drag.dragging = true;
        if (typeof drag.handle.setPointerCapture === "function" && event.pointerId !== undefined) {
          try {
            drag.handle.setPointerCapture(event.pointerId);
          } catch (_) {
            // Some synthetic or detached pointer targets cannot capture safely.
          }
        }
        drag.item.classList.add("mwi-sort-dragging");
        drag.container.classList.add("mwi-sort-active");
      }
      event.preventDefault();
      updateDropTarget(event);
    }

    function pointerUp(event) {
      if (!drag || (drag.pointerId !== undefined && event.pointerId !== drag.pointerId)) return;
      finish(true);
    }

    function pointerCancel(event) {
      if (!drag || (drag.pointerId !== undefined && event.pointerId !== drag.pointerId)) return;
      finish(false);
    }

    function keyDown(event) {
      if (event.key === "Escape" && drag) {
        event.preventDefault();
        finish(false);
        return;
      }
      if (!event.altKey) return;
      const target = event.target && (event.target.nodeType === 1 ? event.target : event.target.parentElement);
      const handle = target && target.closest(handleSelector);
      const item = handle && handle.closest(itemSelector);
      const container = item && item.closest(containerSelector);
      if (!handle || !item || !container || !root.contains(container)) return;
      const backward = axis === "x" ? event.key === "ArrowLeft" : event.key === "ArrowUp";
      const forward = axis === "x" ? event.key === "ArrowRight" : event.key === "ArrowDown";
      if (!backward && !forward) return;
      event.preventDefault();
      const items = sortableItems(container);
      const fromIndex = items.indexOf(item);
      const toIndex = Math.max(0, Math.min(items.length - 1, fromIndex + (backward ? -1 : 1)));
      if (fromIndex === toIndex || typeof onCommit !== "function") return;
      onCommit({ key: item.dataset.sortKey || "", fromIndex, toIndex, container });
    }

    function click(event) {
      if (!suppressClick) return;
      suppressClick = false;
      event.preventDefault();
      event.stopPropagation();
    }

    function windowBlur() {
      finish(false);
    }

    root.addEventListener("pointerdown", pointerDown);
    root.addEventListener("pointermove", pointerMove, { passive: false });
    root.addEventListener("pointerup", pointerUp);
    root.addEventListener("pointercancel", pointerCancel);
    root.addEventListener("lostpointercapture", pointerCancel);
    root.addEventListener("keydown", keyDown);
    root.addEventListener("click", click, true);
    if (ownerWindow) ownerWindow.addEventListener("blur", windowBlur);
    return {
      destroy() {
        finish(false);
        root.removeEventListener("pointerdown", pointerDown);
        root.removeEventListener("pointermove", pointerMove);
        root.removeEventListener("pointerup", pointerUp);
        root.removeEventListener("pointercancel", pointerCancel);
        root.removeEventListener("lostpointercapture", pointerCancel);
        root.removeEventListener("keydown", keyDown);
        root.removeEventListener("click", click, true);
        if (ownerWindow) ownerWindow.removeEventListener("blur", windowBlur);
      }
    };
  }

  return { normalizeOrder, reorderByIndex, reorderVisibleByIndex, createPointerSortable };
});


// SOURCE: src/ui/styles.js
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MwiGuildCreditStyles = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const PANEL_STYLES = `
        #mwi-credit-optimizer{--mwi-entry-min-width:300px;--mwi-entry-gap:10px;position:relative;z-index:0;box-sizing:border-box;flex:1;min-width:0;min-height:0;height:100%;overflow-y:auto;overflow-x:hidden;margin:0;padding:12px;background:transparent;color:#f4f5ff;font:14px system-ui,sans-serif;container-type:inline-size}
        #mwi-credit-optimizer[hidden]{display:none} [data-mwi-credit-tab="true"]{user-select:none;pointer-events:auto!important;cursor:pointer!important}
        #mwi-credit-optimizer *{box-sizing:border-box} #mwi-credit-optimizer h3{margin:0 0 5px;font-size:17px}#mwi-credit-optimizer .mwi-plugin-version{margin:0 0 10px;padding:5px 7px;border:1px solid #474969;border-radius:4px;background:#292a46;color:#c9cbeb;font-size:11px;line-height:1.4}.mwi-plugin-version.mwi-update-available{border-color:#d8a33c;background:#463a21;color:#ffe09a;font-weight:700}
        #mwi-credit-optimizer .mwi-view-tabs-shell{display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:stretch;margin:0 0 10px;border-bottom:1px solid #474969}#mwi-credit-optimizer .mwi-view-tabs{display:flex;min-width:0;overflow-x:auto;scrollbar-width:thin}#mwi-credit-optimizer .mwi-view-tab-item{position:relative;display:block;flex:0 0 auto;touch-action:pan-y;cursor:grab}#mwi-credit-optimizer .mwi-view-tab-item[hidden]{display:none!important}#mwi-credit-optimizer .mwi-view-tab-item:active{cursor:grabbing}#mwi-credit-optimizer .mwi-view-tab{min-height:40px!important;border-radius:0!important;background:transparent!important;color:#c9cbeb!important;padding:6px 10px!important;touch-action:pan-y}#mwi-credit-optimizer .mwi-view-tab-active{border-bottom:2px solid #43c4ad!important;background:#2a3a45!important;color:#fff!important}#mwi-credit-optimizer .mwi-view-order-actions{display:flex;align-items:center;border-left:1px solid #474969;background:#202238}#mwi-credit-optimizer .mwi-icon-button{position:relative;width:32px;min-width:32px;min-height:32px;padding:0!important;border:1px solid #555875!important;background:#343650!important;color:#fff!important}#mwi-credit-optimizer .mwi-view-order-actions .mwi-icon-button{width:30px;min-width:30px;min-height:40px;border-width:0 0 0 1px!important;border-radius:0!important}#mwi-credit-optimizer .mwi-icon-button:before{position:absolute;top:50%;left:50%;width:7px;height:7px;border-top:2px solid currentColor;border-left:2px solid currentColor;content:""}#mwi-credit-optimizer .mwi-icon-left:before{transform:translate(-35%,-50%) rotate(-45deg)}#mwi-credit-optimizer .mwi-icon-right:before{transform:translate(-65%,-50%) rotate(135deg)}#mwi-credit-optimizer .mwi-icon-up:before{transform:translate(-50%,-35%) rotate(45deg)}#mwi-credit-optimizer .mwi-icon-down:before{transform:translate(-50%,-65%) rotate(225deg)}
        #mwi-credit-optimizer .mwi-settings-trigger{width:34px;min-width:34px;min-height:40px;border-width:0 0 0 1px!important;border-radius:0!important;font-size:16px;line-height:1}#mwi-credit-optimizer .mwi-settings-trigger:before{display:none}#mwi-credit-optimizer .mwi-settings-trigger[aria-expanded="true"]{border-color:#77f3d0!important;background:#2c665d!important;color:#effffb!important}#mwi-credit-optimizer .mwi-settings-trigger>span{display:grid;place-items:center}
        #mwi-credit-optimizer .mwi-settings-panel{min-width:0;margin:-2px 0 10px;border:1px solid #4b5777;border-radius:8px;background:linear-gradient(145deg,#232a43,#25263f);box-shadow:0 8px 20px #0c0d173d;color:#f4f5ff}#mwi-credit-optimizer .mwi-settings-panel[hidden]{display:none!important}#mwi-credit-optimizer .mwi-settings-header{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;padding:9px 10px;border-bottom:1px solid #3f4969;background:#212941}#mwi-credit-optimizer .mwi-settings-header>span{display:grid;gap:2px;min-width:0}#mwi-credit-optimizer .mwi-settings-header h3{margin:0;color:#f3fff9;font-size:14px}#mwi-credit-optimizer .mwi-settings-header p{margin:0;color:#aebbd4;font-size:10px;line-height:1.35;overflow-wrap:anywhere}#mwi-credit-optimizer .mwi-settings-close{flex:0 0 auto;width:28px;min-width:28px;min-height:28px!important;padding:0!important;border:1px solid #59607e!important;background:#343650!important;color:#e8e9f8!important;font-size:18px;line-height:1}#mwi-credit-optimizer .mwi-settings-content{display:grid;grid-template-columns:minmax(0,1fr);gap:8px;padding:9px 10px}#mwi-credit-optimizer .mwi-settings-block{min-width:0;padding:8px 0}#mwi-credit-optimizer .mwi-settings-block+.mwi-settings-block{border-top:1px solid #424866}#mwi-credit-optimizer .mwi-settings-block-heading{display:grid;gap:2px;margin:0 0 7px}#mwi-credit-optimizer .mwi-settings-block-heading h4{margin:0;color:#f2f4ff;font-size:12px}#mwi-credit-optimizer .mwi-settings-block-heading p{margin:0;color:#aeb1cf;font-size:10px;line-height:1.4;overflow-wrap:anywhere}#mwi-credit-optimizer .mwi-settings-domains{display:grid;grid-template-columns:minmax(0,1fr);gap:7px}#mwi-credit-optimizer .mwi-settings-domain{min-width:0;margin:0;padding:6px;border:1px solid #3f4665;border-radius:5px;background:#23253d}#mwi-credit-optimizer .mwi-settings-domain legend{padding:0 4px;color:#77f3d0;font-size:10px;font-weight:700}#mwi-credit-optimizer .mwi-settings-domain[data-domain="combat"] legend{color:#8cb9ff}#mwi-credit-optimizer .mwi-settings-options{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,145px),1fr));gap:4px}#mwi-credit-optimizer label.mwi-settings-option{display:flex;align-items:center;gap:6px;min-width:0;min-height:30px;padding:4px 6px;border:1px solid transparent;border-radius:4px;background:#2b2d49;color:#e8eafa;font-size:10px;line-height:1.25;cursor:pointer}#mwi-credit-optimizer label.mwi-settings-option:hover{border-color:#59607e;background:#313451}#mwi-credit-optimizer .mwi-settings-option span{min-width:0;overflow-wrap:anywhere}#mwi-credit-optimizer .mwi-settings-option input[type="checkbox"]{flex:0 0 15px;width:15px;min-width:15px;height:15px;min-height:15px;margin:0;padding:0;accent-color:#43c4ad}#mwi-credit-optimizer .mwi-settings-placeholder{margin:0;padding:7px;border:1px dashed #545a79;border-radius:4px;color:#c6c9df;font-size:10px;line-height:1.35}#mwi-credit-optimizer label.mwi-settings-switch{display:flex;align-items:center;justify-content:space-between;gap:10px;min-width:0;padding:6px;border-radius:5px;background:#23253d;cursor:pointer}#mwi-credit-optimizer .mwi-settings-switch-copy{display:grid;gap:2px;min-width:0}#mwi-credit-optimizer .mwi-settings-switch-copy strong{color:#f2f4ff;font-size:11px}#mwi-credit-optimizer .mwi-settings-switch-copy small{color:#aeb1cf;font-size:9px;line-height:1.35;overflow-wrap:anywhere}#mwi-credit-optimizer input.mwi-settings-switch-input{position:relative;flex:0 0 36px;width:36px;min-width:36px;height:20px;min-height:20px;margin:0;padding:2px;border:1px solid #626784;border-radius:999px;background:#383a54;appearance:none;cursor:pointer;transition:border-color .16s ease,background-color .16s ease}#mwi-credit-optimizer input.mwi-settings-switch-input:before{display:block;width:14px;height:14px;border-radius:50%;background:#c7cae0;box-shadow:0 1px 3px #090a12aa;content:"";transition:transform .16s ease,background-color .16s ease}#mwi-credit-optimizer input.mwi-settings-switch-input:checked{border-color:#77f3d0;background:#2c665d}#mwi-credit-optimizer input.mwi-settings-switch-input:checked:before{transform:translateX(16px);background:#edfffa}#mwi-credit-optimizer .mwi-settings-status{min-height:0;margin:0;padding:0 10px 8px;color:#a9e9dc;font-size:10px;line-height:1.35}#mwi-credit-optimizer .mwi-settings-status:empty{display:none}#mwi-credit-optimizer .mwi-settings-status[data-error="true"]{color:#ff9ca3}
        @container (min-width:600px){#mwi-credit-optimizer .mwi-settings-domains{grid-template-columns:repeat(2,minmax(0,1fr))}}@container (max-width:400px){#mwi-credit-optimizer .mwi-settings-content{padding:7px}#mwi-credit-optimizer .mwi-settings-header{padding:8px}#mwi-credit-optimizer label.mwi-settings-switch{align-items:flex-start}}
        @media (prefers-reduced-motion:reduce){#mwi-credit-optimizer input.mwi-settings-switch-input,#mwi-credit-optimizer input.mwi-settings-switch-input:before{transition:none}}
        #mwi-credit-optimizer .mwi-controls{display:flex;gap:8px;align-items:end;flex-wrap:wrap}#mwi-credit-optimizer label{display:grid;gap:4px;color:#d8d8e8}#mwi-credit-optimizer .mwi-number-field{display:grid;gap:4px;min-width:0}#mwi-credit-optimizer .mwi-number-field>label{display:block}#mwi-credit-optimizer .mwi-price-reference{display:flex;flex:0 0 auto;align-items:center;gap:0;height:40px;min-height:40px;border:1px solid #5b5d7b;border-radius:6px;overflow:hidden;background:#292a46}#mwi-credit-optimizer .mwi-price-reference-label{padding:0 7px;color:#c9cbeb;font-size:11px;white-space:nowrap}#mwi-credit-optimizer .mwi-price-reference button{height:38px;min-height:38px;border-radius:0;background:#353653;color:#c9cbeb;padding:0 9px;white-space:nowrap}#mwi-credit-optimizer .mwi-price-reference button+button{border-left:1px solid #5b5d7b}#mwi-credit-optimizer .mwi-price-reference button[data-active="true"]{background:#43c4ad;color:#10201f}#mwi-credit-optimizer .mwi-controls>[data-role="refresh"]{min-height:40px}
        #mwi-credit-optimizer .mwi-number-stepper{display:flex;align-items:stretch;height:40px;min-height:40px;overflow:hidden;border:1px solid #7778b4;border-radius:6px;background:#f4f5ff;box-shadow:inset 0 1px 2px #3e416433}#mwi-credit-optimizer .mwi-number-stepper:focus-within{border-color:#65e3ca;outline:2px solid #65e3ca;outline-offset:2px;box-shadow:0 0 0 4px #77f3d026,inset 0 1px 2px #3e416433}#mwi-credit-optimizer .mwi-number-stepper input{height:38px;min-height:38px;margin:0;border:0;border-radius:0;background:#f4f5ff;color:#1f2030;font-variant-numeric:tabular-nums}#mwi-credit-optimizer .mwi-number-stepper input:focus-visible{outline:0;box-shadow:none}#mwi-credit-optimizer .mwi-target-credit-stepper input{width:112px}#mwi-credit-optimizer .mwi-price-limit-stepper input{flex:0 0 68px;width:68px;min-width:68px;padding:4px 7px}#mwi-credit-optimizer .mwi-number-stepper input[type="number"]{-moz-appearance:textfield;appearance:textfield}#mwi-credit-optimizer .mwi-number-stepper input[type="number"]::-webkit-inner-spin-button,#mwi-credit-optimizer .mwi-number-stepper input[type="number"]::-webkit-outer-spin-button{margin:0;-webkit-appearance:none}#mwi-credit-optimizer .mwi-stepper-buttons{display:grid;flex:0 0 34px;width:34px;min-width:34px;grid-template-rows:repeat(2,minmax(0,1fr));border-left:1px solid #7778b4;background:#373a58}#mwi-credit-optimizer button.mwi-stepper-button{display:grid;place-items:center;width:100%;min-width:0;height:19px;min-height:19px!important;margin:0;padding:0!important;border:0!important;border-radius:0!important;background:#3b3e5e!important;color:#f4f5ff!important;line-height:1;touch-action:none;user-select:none}#mwi-credit-optimizer button.mwi-stepper-button+button{border-top:1px solid #62658a!important}#mwi-credit-optimizer button.mwi-stepper-button:hover{background:#4a4e71!important;color:#fff!important}#mwi-credit-optimizer button.mwi-stepper-button:active,#mwi-credit-optimizer button.mwi-stepper-button[data-pressed="true"]{background:#245149!important;color:#bff8eb!important}#mwi-credit-optimizer button.mwi-stepper-button:focus-visible{z-index:5;outline:2px solid #77f3d0!important;outline-offset:-2px;box-shadow:none!important}#mwi-credit-optimizer .mwi-stepper-button svg{display:block;width:16px;height:10px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}
        #mwi-credit-optimizer .mwi-price-limit-control{align-self:end;min-width:0}#mwi-credit-optimizer .mwi-price-limit{display:flex;align-items:center;height:40px;min-height:40px;max-width:100%;border:1px solid #5b5d7b;border-radius:6px;background:#292a46;color:#d8d8e8;font-size:11px;line-height:1.2;white-space:nowrap}#mwi-credit-optimizer .mwi-price-limit>span:not(.mwi-number-stepper){padding-inline:7px}#mwi-credit-optimizer .mwi-price-limit>span:last-child{padding-inline-start:5px}#mwi-credit-optimizer .mwi-price-limit .mwi-number-stepper{height:38px;min-height:38px;border-width:0 1px;border-radius:0;box-shadow:none}#mwi-credit-optimizer .mwi-price-limit .mwi-number-stepper:focus-within{outline:0;box-shadow:none}#mwi-credit-optimizer .mwi-price-limit input{height:38px;min-height:38px;margin:0;border:0;border-radius:0;font-variant-numeric:tabular-nums}#mwi-credit-optimizer .mwi-price-limit input::placeholder{color:#686b83;opacity:1}#mwi-credit-optimizer .mwi-price-limit:focus-within{border-color:#65e3ca;outline:2px solid #65e3ca;outline-offset:2px;box-shadow:0 0 0 4px #77f3d026}#mwi-credit-optimizer .mwi-price-limit-error{display:block;width:100%;max-width:260px;margin-top:4px;padding:4px 6px;border:1px solid #8f4f5b;border-radius:4px;background:#3d2730;color:#ffbdc3;font-size:10px;line-height:1.35;white-space:normal}#mwi-credit-optimizer .mwi-price-limit-error[hidden]{display:none!important}
        @container (max-width:400px){#mwi-credit-optimizer .mwi-price-reference-label{padding-inline:4px}#mwi-credit-optimizer .mwi-price-reference button{padding-inline:5px}}
        #mwi-credit-optimizer input,#mwi-credit-optimizer select{width:112px;min-height:32px;border:1px solid #7778b4;border-radius:4px;padding:4px 8px;background:#f1f2ff;color:#1f2030;font:inherit}
        #mwi-credit-optimizer button{min-height:32px;border:0;border-radius:4px;padding:5px 12px;background:#43c4ad;color:#10201f;font-weight:700;cursor:pointer}
        #mwi-credit-optimizer button:disabled{opacity:.55;cursor:wait} #mwi-credit-optimizer .mwi-status{margin:10px 0;color:#c9cbeb}
        #mwi-credit-optimizer .mwi-credit-grid,#mwi-credit-optimizer .mwi-token-value-list,#mwi-credit-optimizer .mwi-upgrade-plan-list,#mwi-credit-optimizer .mwi-material-list{grid-template-columns:repeat(auto-fit,minmax(min(100%,var(--mwi-entry-min-width)),1fr))}
        #mwi-credit-optimizer .mwi-credit-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,360px),1fr));gap:var(--mwi-entry-gap)}
        #mwi-credit-optimizer .mwi-credit-section{min-width:0;border:1px solid #474969;border-top:3px solid var(--mwi-credit-color);border-radius:6px;background:#292a46;overflow:hidden;container-type:inline-size}#mwi-credit-optimizer .mwi-credit-body[hidden],#mwi-credit-optimizer .mwi-token-value-body[hidden]{display:none!important}
        #mwi-credit-optimizer .mwi-credit-heading{display:flex;align-items:center;gap:7px;width:100%;min-height:0!important;border:0;border-radius:0;background:transparent!important;color:#fff!important;padding:8px 9px 6px!important;font:inherit;text-align:left;font-size:13px;font-weight:700;cursor:pointer}.mwi-credit-heading:hover{background:#303151!important}.mwi-credit-heading .mwi-collapse-icon{margin-left:auto;color:#c9cbeb;font-size:15px;line-height:1}
        #mwi-credit-optimizer .mwi-credit-body{max-width:100%;overflow-x:auto;overscroll-behavior-inline:contain;scrollbar-width:thin;scrollbar-color:#5b5d7b #202238}#mwi-credit-optimizer .mwi-credit-heading .mwi-item-icon{width:22px;height:22px;flex:0 0 22px}.mwi-credit-section table{width:100%;min-width:360px;table-layout:fixed;border-collapse:collapse;font-size:11px}#mwi-credit-optimizer .mwi-credit-item-column{width:32%}#mwi-credit-optimizer .mwi-credit-exchange-column{width:27%}#mwi-credit-optimizer .mwi-credit-unit-cost-column{width:24%}#mwi-credit-optimizer .mwi-credit-target-cost-column{width:17%}
        #mwi-credit-optimizer th,#mwi-credit-optimizer td{padding:5px 6px;border-top:1px solid #474969;text-align:right;white-space:nowrap}
        #mwi-credit-optimizer th:first-child,#mwi-credit-optimizer td:first-child{text-align:left} #mwi-credit-optimizer th{color:#bfc2de;font-weight:600}
        #mwi-credit-optimizer .mwi-item{display:flex;align-items:center;gap:5px;min-width:0}.mwi-item-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#mwi-credit-optimizer .mwi-credit-section .mwi-item-name{overflow:visible;text-overflow:clip;white-space:normal;overflow-wrap:anywhere;line-height:1.2}
        #mwi-credit-optimizer .mwi-item-icon{display:inline-block;width:24px;height:24px;flex:0 0 24px;vertical-align:middle}.mwi-item-icon-fallback{border-radius:4px;background:#45476b}#mwi-credit-optimizer .mwi-market-item-link{display:inline-grid;place-items:center;flex:0 0 24px;width:24px;min-width:24px;height:24px;min-height:24px!important;padding:0!important;border:1px solid transparent!important;border-radius:5px!important;background:transparent!important;color:inherit!important;line-height:1;cursor:pointer}#mwi-credit-optimizer .mwi-market-item-link:hover,#mwi-credit-optimizer .mwi-market-item-link:focus-visible{border-color:#77f3d0!important;background:#2d6159!important;outline:none;box-shadow:0 0 0 2px #77f3d033}#mwi-credit-optimizer .mwi-market-item-link .mwi-item-icon{display:block}
        #mwi-credit-optimizer .mwi-cost{color:#77f3d0;font-weight:700} #mwi-credit-optimizer .mwi-empty{padding:8px;color:#ffd17c;font-size:12px}#mwi-credit-optimizer .mwi-token-value-section{margin:10px 0;border:1px solid #3a7b70;border-top:3px solid #43c4ad;border-radius:6px;background:#203b3a;overflow:hidden}#mwi-credit-optimizer .mwi-token-value-heading{border-bottom:1px solid #3a7b70}#mwi-credit-optimizer .mwi-token-value-heading .mwi-item-icon{width:22px;height:22px;flex:0 0 22px}#mwi-credit-optimizer .mwi-token-value-list{display:grid;column-gap:var(--mwi-entry-gap);row-gap:0;margin-inline:-1px}#mwi-credit-optimizer .mwi-token-value-row{display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:center;gap:8px;min-width:0;padding:8px;border-top:1px solid #315d58}#mwi-credit-optimizer .mwi-token-value-row .mwi-item-icon{width:21px;height:21px;flex:0 0 21px}#mwi-credit-optimizer .mwi-token-value-exchange{color:#d7f6ef;font-size:11px;white-space:nowrap}#mwi-credit-optimizer .mwi-token-value-row .mwi-cost{font-size:12px;white-space:nowrap}#mwi-credit-optimizer .mwi-token-value-unpriced{color:#ffd17c;font-size:11px;white-space:nowrap}
        #mwi-credit-optimizer .mwi-upgrade-preset{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;margin:0 0 12px;padding:10px 11px;border:1px solid #3b8478;border-radius:9px;background:linear-gradient(135deg,#1f403d,#202f48);box-shadow:0 4px 14px #101d1c55}#mwi-credit-optimizer .mwi-upgrade-preset-copy{display:grid;gap:3px;min-width:0}#mwi-credit-optimizer .mwi-upgrade-preset-copy strong{color:#dffaf4;font-size:12px}#mwi-credit-optimizer .mwi-upgrade-preset-copy small{color:#abd5cd;font-size:10px;line-height:1.35}#mwi-credit-optimizer .mwi-upgrade-preset-buttons{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:7px}#mwi-credit-optimizer .mwi-upgrade-preset-buttons button{min-height:29px!important;padding:5px 8px!important;font-size:11px;white-space:nowrap;background:#43c4ad!important;color:#10201f!important}#mwi-credit-optimizer .mwi-upgrade-preset-buttons button[data-domain="combat"]{background:#6ea9ff!important;color:#15233f!important}#mwi-credit-optimizer .mwi-upgrade-preset-buttons button:disabled{background:#4d5968!important;color:#bec4ce!important;cursor:not-allowed}
        @container (max-width:520px){#mwi-credit-optimizer .mwi-upgrade-preset{grid-template-columns:minmax(0,1fr);align-items:stretch}#mwi-credit-optimizer .mwi-upgrade-preset-buttons{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));justify-content:stretch}#mwi-credit-optimizer .mwi-upgrade-preset-buttons button{width:100%;min-width:0}}
        #mwi-credit-optimizer .mwi-upgrade-plan-list{display:grid;gap:var(--mwi-entry-gap)}#mwi-credit-optimizer .mwi-upgrade-plan{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) 36px;gap:9px;align-items:end;padding:11px;border:1px solid #45486d;border-radius:8px;background:linear-gradient(135deg,#2c2e4d,#252640);box-shadow:0 4px 13px #13142555}#mwi-credit-optimizer .mwi-upgrade-plan label{min-width:0;text-align:left;justify-items:stretch;font-size:12px}#mwi-credit-optimizer .mwi-upgrade-plan label:first-child{grid-column:1/-1;grid-row:1}#mwi-credit-optimizer .mwi-upgrade-plan label:nth-child(2){grid-column:1;grid-row:2}#mwi-credit-optimizer .mwi-upgrade-plan label:nth-child(3){grid-column:2;grid-row:2}#mwi-credit-optimizer .mwi-upgrade-plan select{width:100%!important;max-width:none;min-width:0}#mwi-credit-optimizer .mwi-remove-plan{grid-column:3;grid-row:2;width:36px;min-width:36px;padding:0!important;font-size:21px;line-height:1;background:#555773!important;color:#fff!important}#mwi-credit-optimizer .mwi-upgrade-actions{display:flex;justify-content:center;gap:9px;margin:12px 0 4px}#mwi-credit-optimizer .mwi-clear-upgrade-plans{background:#a04455!important;color:#fff!important}#mwi-credit-optimizer .mwi-clear-upgrade-plans:hover{background:#bd4d61!important}#mwi-credit-optimizer .mwi-token-budget{display:grid;gap:8px;margin:10px 0 4px;padding:10px 11px;border:1px solid #56597f;border-radius:8px;background:linear-gradient(135deg,#30314f,#292a46)}#mwi-credit-optimizer .mwi-token-budget-heading{display:flex;justify-content:space-between;align-items:start;gap:10px;color:#e8e9f6}#mwi-credit-optimizer .mwi-token-budget-heading>span:first-child{display:grid;gap:2px}#mwi-credit-optimizer .mwi-token-budget-heading strong{font-size:12px}#mwi-credit-optimizer .mwi-token-budget-heading small{color:#bfc2de;font-size:10px;line-height:1.35}#mwi-credit-optimizer .mwi-token-budget-heading>span:last-child{color:#77f3d0;font-size:11px;white-space:nowrap}#mwi-credit-optimizer .mwi-token-budget-inputs{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:10px}#mwi-credit-optimizer .mwi-token-budget-inputs input[type="range"]{width:100%;min-height:24px;padding:0;border:0;background:transparent;accent-color:#43c4ad}#mwi-credit-optimizer .mwi-token-budget-inputs label{display:flex;align-items:center;gap:5px;color:#c9cbeb;font-size:11px}#mwi-credit-optimizer .mwi-token-budget-inputs input[type="number"]{width:100px;min-height:30px}#mwi-credit-optimizer .mwi-token-credit-plan-toggle{display:grid;grid-template-columns:24px minmax(0,1fr);align-items:center;column-gap:9px;width:100%;margin:9px 0 4px;padding:9px 11px!important;border:1px solid #56597f!important;border-radius:8px!important;background:linear-gradient(135deg,#30314f,#292a46)!important;color:#e8e9f6!important;text-align:left}#mwi-credit-optimizer .mwi-token-credit-plan-toggle[data-active="true"]{border-color:#43c4ad!important;background:linear-gradient(135deg,#20453f,#243e3c)!important;color:#e4fff8!important;box-shadow:0 0 0 1px #43c4ad33}#mwi-credit-optimizer .mwi-token-credit-plan-indicator{display:grid;place-items:center;width:24px;height:24px;border:2px solid #777aa4;border-radius:6px;background:#20213a;color:#10201f;font-size:16px;line-height:1}#mwi-credit-optimizer .mwi-token-credit-plan-toggle[data-active="true"] .mwi-token-credit-plan-indicator{border-color:#77f3d0;background:#77f3d0}#mwi-credit-optimizer .mwi-token-credit-plan-copy{display:grid;gap:2px;min-width:0}#mwi-credit-optimizer .mwi-token-credit-plan-copy strong{font-size:12px}#mwi-credit-optimizer .mwi-token-credit-plan-copy small{color:#bfc2de;font-size:10px;font-weight:500;line-height:1.35}#mwi-credit-optimizer .mwi-token-credit-plan-toggle[data-active="true"] small{color:#bce8de}
        #mwi-credit-optimizer .mwi-material-list{display:grid;gap:var(--mwi-entry-gap);margin-top:12px}.mwi-material-row{position:relative;align-self:start;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;padding:11px;border:1px solid #45486d;border-left:3px solid var(--mwi-material-accent);border-radius:8px;background:linear-gradient(135deg,#292b48,#23243d);box-shadow:0 4px 13px #13142544}.mwi-material-row-token{min-height:0;padding:9px 11px;background:linear-gradient(135deg,#2b2c49,#24253f)}.mwi-material-credit{display:flex;align-items:center;gap:8px;min-width:0}.mwi-material-copy{min-width:0;display:grid;gap:2px}.mwi-material-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#f4f5ff;font-weight:700}.mwi-material-copy small{color:#aeb1d3;font-size:11px}.mwi-material-required{display:grid;justify-items:end;align-content:center;gap:1px;text-align:right}.mwi-material-required small{color:#aeb1d3;font-size:10px}.mwi-material-required strong{color:#77f3d0;font-size:18px;line-height:1.1}.mwi-material-plan{grid-column:1/-1;display:grid;grid-template-columns:minmax(0,1fr) auto;grid-template-rows:auto auto;align-items:center;column-gap:10px;border:1px solid #356c63;border-radius:7px;background:linear-gradient(135deg,#1f3e3c,#1d3736);overflow:hidden}.mwi-material-plan-auto{border-color:#b17c32;background:linear-gradient(135deg,#493a22,#3d3325)}.mwi-material-plan-auto .mwi-material-plan-icon{border-color:#d7a64d;background:linear-gradient(135deg,#725425,#5c4525)}.mwi-material-plan-auto .mwi-material-plan-need strong{color:#ffd17c}.mwi-material-plan-item{grid-row:1/-1;display:flex;align-items:center;gap:10px;min-width:0;padding:8px 0 8px 8px}.mwi-material-plan-icon{display:grid!important;place-items:center;flex:0 0 52px!important;width:52px!important;height:52px!important;min-width:52px!important;padding:0!important;border:1px solid #4da496;border-radius:7px;background:linear-gradient(135deg,#306b62,#275a53);box-shadow:inset 0 1px #7bd8c822,0 2px 5px #10232166}.mwi-material-plan-icon .mwi-market-item-link{width:50px!important;height:50px!important;min-width:50px!important;min-height:50px!important;border:0!important;border-radius:7px!important}.mwi-material-plan-icon .mwi-item-icon{width:50px!important;height:50px!important;flex:0 0 50px!important;max-width:50px;max-height:50px;object-fit:contain}.mwi-material-plan-item>span:last-child{min-width:0;display:grid;gap:3px}.mwi-material-plan-item b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#e3fbf5;font-size:14px;line-height:1.15}.mwi-material-plan-item small{color:#afd4cd;font-size:12px;line-height:1.15}.mwi-material-plan-need{display:grid;justify-items:end;gap:1px;padding:8px 9px 0 0}.mwi-material-plan-need small{color:#afd4cd;font-size:10px}.mwi-material-plan-need strong{color:#77f3d0;font-size:17px;line-height:1}.mwi-material-plan-rate{grid-column:2;align-self:end;padding:0 9px 9px 0;color:#c5e3dd;font-size:10px;text-align:right;white-space:nowrap}.mwi-material-plan-unavailable{padding:9px;color:#ffd17c;font-size:11px}.mwi-plan-summary{display:flex;flex-wrap:wrap;justify-content:center;gap:5px;margin:12px 0 8px;color:#d7d9ed;font-size:12px}.mwi-plan-summary span:not(.mwi-plan-separator){padding:4px 7px;border:1px solid #45486d;border-radius:999px;background:#292a46}.mwi-plan-separator{display:none}.mwi-upgrade-cost-summary{display:grid;gap:7px;margin:8px 0 10px;padding:11px 12px;border:1px solid #3d8d80;border-radius:8px;background:linear-gradient(135deg,#1d3d3b,#203b3a);box-shadow:0 5px 14px #101d1c55}.mwi-upgrade-cost-title{color:#b7e6dc;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}.mwi-upgrade-cost-summary>div:not(.mwi-upgrade-cost-note):not(.mwi-upgrade-cost-title){display:flex;justify-content:space-between;gap:8px;align-items:baseline}.mwi-upgrade-cost-summary span{color:#d7f6ef}.mwi-upgrade-cost-summary strong{color:#77f3d0;font-size:15px;text-align:right}.mwi-upgrade-cost-note{color:#ffd17c;font-size:11px}.mwi-upgrade-auto-token-note{color:#9bead8}.mwi-upgrade-cost-unavailable{color:#ffd17c;border-color:#80663f;background:#3b3323}.mwi-plugin-version .mwi-update-link,#mwi-credit-optimizer .mwi-plugin-footer a{color:#fff;text-decoration:underline;text-underline-offset:2px}.mwi-plugin-version .mwi-update-link:hover,#mwi-credit-optimizer .mwi-plugin-footer a:hover{color:#77f3d0}.mwi-plugin-footer{margin-top:16px;padding:10px 4px 2px;border-top:1px solid #474969;color:#aeb1d3;font-size:12px;line-height:1.6;text-align:center}
        #mwi-credit-optimizer .mwi-construction-budget{display:grid;grid-template-columns:minmax(175px,.9fr) repeat(3,minmax(0,.55fr));gap:1px;overflow:hidden;margin-bottom:10px;border:1px solid #8a703d;border-radius:8px;background:#6c5a35;box-shadow:0 5px 14px #15120c55}#mwi-credit-optimizer .mwi-construction-budget>div:not(.mwi-construction-meter){min-width:0;padding:10px 11px;background:linear-gradient(135deg,#302d36,#292a40)}
        #mwi-credit-optimizer .mwi-construction-budget-input{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:end;gap:4px 8px}#mwi-credit-optimizer .mwi-construction-budget-input label{grid-column:1/-1;color:#ffe1a3;font-weight:700}#mwi-credit-optimizer .mwi-construction-budget-input input{width:100%;border-color:#d2a34a;font-variant-numeric:tabular-nums}#mwi-credit-optimizer .mwi-construction-budget-input>small{align-self:center;color:#c8b78f;font-size:10px;white-space:nowrap}
        #mwi-credit-optimizer .mwi-construction-metric{display:grid;align-content:center;gap:3px}#mwi-credit-optimizer .mwi-construction-metric small{color:#bdb6a5;font-size:10px}#mwi-credit-optimizer .mwi-construction-metric strong{overflow:hidden;color:#ffe09a;font:700 15px ui-monospace,SFMono-Regular,Menlo,monospace;text-overflow:ellipsis;white-space:nowrap}#mwi-credit-optimizer .mwi-construction-metric[data-state="danger"] strong{color:#ff9ca3}
        #mwi-credit-optimizer .mwi-construction-meter{grid-column:1/-1;height:5px;overflow:hidden;background:#171827}#mwi-credit-optimizer .mwi-construction-meter span{display:block;height:100%;background:#43c4ad}#mwi-credit-optimizer .mwi-construction-budget[data-over-budget="true"] .mwi-construction-meter span{background:#e65d68}
        #mwi-credit-optimizer .mwi-construction-layout{display:grid;gap:12px}#mwi-credit-optimizer .mwi-building-pane{min-width:0;overflow:hidden;border:1px solid #474969;border-radius:8px;background:#24253c}#mwi-credit-optimizer .mwi-building-pane-heading{display:flex;align-items:end;justify-content:space-between;gap:10px;padding:9px 10px;border-bottom:1px solid #3f4160;background:#2b2d48}#mwi-credit-optimizer .mwi-building-pane-heading>span{min-width:0;display:grid;gap:3px}#mwi-credit-optimizer .mwi-building-heading-line{display:flex;align-items:center;flex-wrap:wrap;gap:6px}#mwi-credit-optimizer .mwi-building-pane-heading h4{margin:0;color:#fff;font-size:14px}#mwi-credit-optimizer .mwi-building-pane-heading small{color:#aeb1d3;font-size:10px}#mwi-credit-optimizer .mwi-building-level-status{padding:2px 6px;border:1px solid #4d7d73;border-radius:999px;background:#203d3a;color:#bff6ea!important}#mwi-credit-optimizer .mwi-building-level-status[data-levels-read="false"]{border-color:#80663f;background:#3b3323;color:#ffd17c!important}#mwi-credit-optimizer .mwi-building-pane-heading input{width:170px;min-width:110px}
        #mwi-credit-optimizer .mwi-building-categories{display:flex;flex-wrap:wrap;gap:4px;padding:7px 9px;border-bottom:1px solid #3f4160}#mwi-credit-optimizer .mwi-building-categories button{min-height:28px;padding:3px 8px;border:1px solid #555875;background:#30314c;color:#c9cbeb;font-size:11px}#mwi-credit-optimizer .mwi-building-categories button[data-active="true"]{border-color:#43c4ad;background:#245149;color:#dffff7}
        #mwi-credit-optimizer .mwi-building-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(56px,1fr));gap:6px;padding:9px}#mwi-credit-optimizer .mwi-building-tile[hidden]{display:none!important}#mwi-credit-optimizer .mwi-building-tile{--mwi-building-accent:#9567da;position:relative;display:grid;place-items:center;aspect-ratio:1;min-width:0;min-height:56px;padding:6px!important;border:1px solid #4b4e6d!important;border-radius:7px!important;background:#292b45!important;color:#fff!important;box-shadow:none;overflow:hidden}#mwi-credit-optimizer .mwi-building-tile[data-category="core"]{--mwi-building-accent:#d8a33c}#mwi-credit-optimizer .mwi-building-tile[data-category="life"]{--mwi-building-accent:#43c4ad}#mwi-credit-optimizer .mwi-building-tile[data-category="combat"]{--mwi-building-accent:#e65d68}#mwi-credit-optimizer .mwi-building-tile:hover{border-color:#8589b5!important;background:#30334f!important}#mwi-credit-optimizer .mwi-building-tile[data-planned="true"]{border-color:#43c4ad!important;background:#23413f!important}#mwi-credit-optimizer .mwi-building-tile[data-selected="true"]{outline:2px solid #77f3d0;outline-offset:-3px;background:#2b4f4a!important}#mwi-credit-optimizer .mwi-building-icon{display:grid;place-items:center;width:min(72%,44px);height:min(72%,44px);padding:1px;border:1px solid var(--mwi-building-accent);border-radius:6px;background:#22233a}#mwi-credit-optimizer .mwi-building-icon svg{display:block;width:100%;height:100%}#mwi-credit-optimizer .mwi-building-icon-fallback svg{padding:6px;fill:none;stroke:var(--mwi-building-accent);stroke-width:3;stroke-linecap:round;stroke-linejoin:round}#mwi-credit-optimizer .mwi-building-level-badge,#mwi-credit-optimizer .mwi-building-target-badge{position:absolute;top:4px;display:grid;place-items:center;min-width:18px;height:18px;padding:0 4px;border-radius:999px;font:700 10px ui-monospace,SFMono-Regular,Menlo,monospace}#mwi-credit-optimizer .mwi-building-level-badge{left:4px;background:#161827;color:#fff}#mwi-credit-optimizer .mwi-building-level-badge[data-level-known="false"]{color:#ffd17c}#mwi-credit-optimizer .mwi-building-target-badge{right:4px;background:#43c4ad;color:#10201f}#mwi-credit-optimizer .mwi-building-tile-name{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
        #mwi-credit-optimizer .mwi-construction-queue{padding:10px;border:1px solid #605338;border-radius:7px;background:#2c2a36}#mwi-credit-optimizer .mwi-construction-queue h4{margin:0;color:#ffe09a;font-size:14px}#mwi-credit-optimizer .mwi-construction-queue-heading{display:flex;align-items:start;justify-content:space-between;gap:8px;margin-bottom:8px}#mwi-credit-optimizer .mwi-construction-queue-heading>span{display:grid;gap:2px}#mwi-credit-optimizer .mwi-construction-queue-heading small{color:#bdb6a5;font-size:10px}
        #mwi-credit-optimizer .mwi-construction-rail{position:relative;display:grid;gap:6px}#mwi-credit-optimizer .mwi-construction-group{position:relative;border:1px solid #4b4d68;border-radius:6px;background:#292a43;transition:transform .14s ease,border-color .14s ease,box-shadow .14s ease}#mwi-credit-optimizer .mwi-construction-group>header{display:grid;grid-template-columns:44px minmax(0,1fr) auto;align-items:center;gap:6px;padding:0 8px 0 0;border-bottom:1px solid #3f4160}#mwi-credit-optimizer .mwi-construction-drag-handle{display:grid;place-items:center;width:44px;min-width:44px;min-height:44px;padding:0!important;border-radius:5px 0 0 0!important;background:transparent!important;color:#aeb1d3!important;touch-action:none;cursor:grab}#mwi-credit-optimizer .mwi-construction-drag-handle:active{cursor:grabbing}#mwi-credit-optimizer .mwi-construction-drag-handle span,#mwi-credit-optimizer .mwi-construction-drag-handle span:before,#mwi-credit-optimizer .mwi-construction-drag-handle span:after{width:3px;height:3px;border-radius:50%;background:currentColor;box-shadow:7px 0 currentColor}#mwi-credit-optimizer .mwi-construction-drag-handle span{position:relative;transform:translateX(-3px)}#mwi-credit-optimizer .mwi-construction-drag-handle span:before,#mwi-credit-optimizer .mwi-construction-drag-handle span:after{position:absolute;left:0;content:""}#mwi-credit-optimizer .mwi-construction-drag-handle span:before{top:-7px}#mwi-credit-optimizer .mwi-construction-drag-handle span:after{top:7px}#mwi-credit-optimizer .mwi-construction-group-select{display:grid;justify-items:start;gap:1px;min-width:0;min-height:44px;padding:5px 0!important;background:transparent!important;color:#fff!important;text-align:left}#mwi-credit-optimizer .mwi-construction-group-select strong{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#mwi-credit-optimizer .mwi-construction-group-select small{color:#aeb1d3;font-size:10px}#mwi-credit-optimizer .mwi-construction-group>header>strong{color:#ffe09a;font:700 12px ui-monospace,SFMono-Regular,Menlo,monospace}#mwi-credit-optimizer .mwi-construction-group-steps{display:grid;gap:1px;padding:4px}#mwi-credit-optimizer .mwi-construction-step{display:grid;grid-template-columns:24px minmax(0,1fr) auto;align-items:center;gap:7px;min-height:30px;padding:3px 5px;background:#24253d}#mwi-credit-optimizer .mwi-construction-step[data-over-budget="true"]{background:#3b2932;opacity:.84}#mwi-credit-optimizer .mwi-construction-step-index{display:grid;place-items:center;width:22px;height:22px;border:1px solid #6b5d40;border-radius:50%;background:#d8a33c;color:#241c0d;font:700 10px ui-monospace,SFMono-Regular,Menlo,monospace}#mwi-credit-optimizer .mwi-construction-step[data-over-budget="true"] .mwi-construction-step-index{border-color:#8b4b56;background:#e65d68;color:#fff}#mwi-credit-optimizer .mwi-construction-step-copy{min-width:0}#mwi-credit-optimizer .mwi-construction-step-copy small{color:#aeb1d3;font-size:10px}#mwi-credit-optimizer .mwi-construction-step-cost{color:#ffe09a;font:700 12px ui-monospace,SFMono-Regular,Menlo,monospace}#mwi-credit-optimizer .mwi-sort-dragging{border-color:#77f3d0!important;box-shadow:0 10px 24px #090a12aa;opacity:.92}#mwi-credit-optimizer .mwi-sort-drop-before:before,#mwi-credit-optimizer .mwi-sort-drop-after:after{position:absolute;right:0;left:0;z-index:9;height:2px;background:#77f3d0;content:""}#mwi-credit-optimizer .mwi-sort-drop-before:before{top:-4px}#mwi-credit-optimizer .mwi-sort-drop-after:after{bottom:-4px}#mwi-credit-optimizer .mwi-view-tab-item.mwi-sort-drop-before:before,#mwi-credit-optimizer .mwi-view-tab-item.mwi-sort-drop-after:after{top:5px;bottom:5px;width:2px;height:auto}#mwi-credit-optimizer .mwi-view-tab-item.mwi-sort-drop-before:before{right:auto;left:-1px}#mwi-credit-optimizer .mwi-view-tab-item.mwi-sort-drop-after:after{right:-1px;left:auto}
        #mwi-credit-optimizer .mwi-budget-cutoff{position:relative;z-index:2;display:flex;align-items:center;gap:6px;margin:3px 0;color:#ff9ca3;font-size:10px;font-weight:700}#mwi-credit-optimizer .mwi-budget-cutoff:before,#mwi-credit-optimizer .mwi-budget-cutoff:after{content:"";height:1px;background:#e65d68}#mwi-credit-optimizer .mwi-budget-cutoff:before{width:12px}#mwi-credit-optimizer .mwi-budget-cutoff:after{flex:1}#mwi-credit-optimizer .mwi-construction-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}#mwi-credit-optimizer .mwi-construction-actions button{flex:1 1 auto}#mwi-credit-optimizer .mwi-construction-actions .mwi-clear-building-plans{background:#5a3340;color:#ffd5d9}
        @container (min-width:720px){#mwi-credit-optimizer .mwi-construction-layout{grid-template-columns:minmax(330px,1fr) minmax(290px,.82fr);align-items:start}#mwi-credit-optimizer .mwi-construction-queue-pane{position:sticky;top:0}}
        @container (max-width:520px){#mwi-credit-optimizer .mwi-construction-budget{grid-template-columns:repeat(3,minmax(0,1fr))}#mwi-credit-optimizer .mwi-construction-budget-input{grid-column:1/-1}#mwi-credit-optimizer .mwi-construction-metric strong{font-size:13px}}
        @container (max-width:400px){#mwi-credit-optimizer .mwi-building-pane-heading{align-items:stretch;flex-direction:column}#mwi-credit-optimizer .mwi-building-pane-heading input{width:100%}#mwi-credit-optimizer .mwi-construction-queue-heading{align-items:stretch;flex-direction:column}#mwi-credit-optimizer .mwi-construction-budget-input>small{text-align:left}}
        @media (prefers-reduced-motion:reduce){#mwi-credit-optimizer .mwi-construction-meter span,#mwi-credit-optimizer .mwi-construction-group{transition:none}}
        /* Queue-first construction workbench. */
        #mwi-credit-optimizer .mwi-construction-status{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:7px 0;padding:7px 9px;border-left:3px solid #43c4ad;background:#242b40;color:#dfe9f4}
        #mwi-credit-optimizer .mwi-construction-status[hidden]{display:none!important}
        #mwi-credit-optimizer .mwi-construction-status>span{min-width:0}
        #mwi-credit-optimizer .mwi-construction-status button{flex:0 0 auto;min-height:28px;padding:3px 8px}
        #mwi-credit-optimizer .mwi-field-error{color:#ff9ca3!important}
        #mwi-credit-optimizer .mwi-construction-budget{grid-template-columns:minmax(175px,1.15fr) repeat(3,minmax(76px,.55fr));margin-bottom:9px}
        #mwi-credit-optimizer .mwi-construction-budget>div{min-width:0;padding:9px 10px;background:linear-gradient(135deg,#302d36,#292a40)}
        #mwi-credit-optimizer .mwi-construction-budget-input{align-content:start}
        #mwi-credit-optimizer .mwi-construction-budget-input>small{white-space:normal}
        #mwi-credit-optimizer .mwi-construction-budget-input .mwi-field-error{grid-column:1/-1}
        #mwi-credit-optimizer .mwi-construction-budget-summary{grid-column:1/-1;display:block;min-width:0;padding:7px 10px;background:#252433;color:#d9cda9;font-size:10px;line-height:1.35}
        #mwi-credit-optimizer .mwi-construction-budget[data-over-budget="true"] .mwi-construction-budget-summary{color:#ffb0b6}
        #mwi-credit-optimizer .mwi-construction-layout{display:grid;grid-template-columns:minmax(0,1fr);gap:9px}
        #mwi-credit-optimizer .mwi-construction-queue-pane,#mwi-credit-optimizer .mwi-building-picker{min-width:0}
        #mwi-credit-optimizer .mwi-construction-queue{padding:0;border:0;border-radius:0;background:transparent}
        #mwi-credit-optimizer .mwi-construction-queue-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin:0;padding:8px 0;border-bottom:1px solid #605338}
        #mwi-credit-optimizer .mwi-construction-queue-heading>span:first-child{display:grid;gap:2px;min-width:0}
        #mwi-credit-optimizer .mwi-construction-queue-heading h4{color:#ffe09a}
        #mwi-credit-optimizer .mwi-construction-queue-heading small{line-height:1.35}
        #mwi-credit-optimizer .mwi-construction-queue-meta{display:flex;align-items:center;justify-content:flex-end;flex-wrap:wrap;gap:5px;min-width:0}
        #mwi-credit-optimizer .mwi-construction-actions{display:flex;align-items:center;gap:4px;margin:0}
        #mwi-credit-optimizer .mwi-construction-actions>button{flex:0 0 auto;min-height:28px;padding:3px 8px;font-size:10px}
        #mwi-credit-optimizer .mwi-construction-more{position:relative}
        #mwi-credit-optimizer .mwi-construction-more[hidden]{display:none!important}
        #mwi-credit-optimizer .mwi-construction-more summary{display:grid;place-items:center;width:30px;height:28px;border:1px solid #555875;border-radius:4px;background:#343650;color:#fff;font-weight:700;cursor:pointer;list-style:none}
        #mwi-credit-optimizer .mwi-construction-more summary::-webkit-details-marker{display:none}
        #mwi-credit-optimizer .mwi-construction-more[open] summary{border-color:#8589b5;background:#41435f}
        #mwi-credit-optimizer .mwi-construction-more>div{position:absolute;top:32px;right:0;z-index:12;width:max-content;padding:4px;border:1px solid #5e4250;border-radius:5px;background:#25263d;box-shadow:0 8px 20px #10111ccc}
        #mwi-credit-optimizer .mwi-construction-more button{min-height:30px;padding:4px 9px;background:#5a3340;color:#ffd5d9;white-space:nowrap}
        #mwi-credit-optimizer .mwi-construction-empty{display:grid;justify-items:start;gap:3px;padding:14px 10px;border-bottom:1px solid #3f4160;color:#d7d9ed}
        #mwi-credit-optimizer .mwi-construction-empty strong{font-size:12px}
        #mwi-credit-optimizer .mwi-construction-empty small{color:#aeb1d3;font-size:10px}
        #mwi-credit-optimizer .mwi-construction-rail{position:relative;display:grid;gap:6px;margin:8px 0 0;padding:0;list-style:none}
        #mwi-credit-optimizer .mwi-construction-group{overflow:visible;border:1px solid #4b4d68;border-left:3px solid #777aa4;border-radius:6px;background:#292a43}
        #mwi-credit-optimizer .mwi-construction-group[data-budget-state="within"]{border-left-color:#43c4ad}
        #mwi-credit-optimizer .mwi-construction-group[data-budget-state="partial"]{border-left-color:#d8a33c}
        #mwi-credit-optimizer .mwi-construction-group[data-budget-state="outside"]{border-left-color:#e65d68}
        #mwi-credit-optimizer .mwi-construction-row{display:grid;grid-template-columns:32px 40px minmax(112px,1fr) auto;grid-template-rows:auto auto;align-items:center;gap:5px 7px;padding:7px 8px 7px 0}
        #mwi-credit-optimizer .mwi-construction-drag-handle{grid-column:1;grid-row:1/3;align-self:stretch;width:32px;min-width:32px;min-height:58px;border-radius:4px 0 0 4px!important}
        #mwi-credit-optimizer .mwi-construction-building-icon{grid-column:2;grid-row:1;display:grid;place-items:center;width:40px;height:40px}
        #mwi-credit-optimizer .mwi-construction-building-icon .mwi-building-icon{width:38px;height:38px}
        #mwi-credit-optimizer .mwi-construction-identity{grid-column:3;grid-row:1;display:grid;gap:2px;min-width:0}
        #mwi-credit-optimizer .mwi-construction-identity strong{overflow:hidden;color:#fff;font-size:12px;text-overflow:ellipsis;white-space:nowrap}
        #mwi-credit-optimizer .mwi-construction-identity small{overflow:hidden;color:#aeb1d3;font-size:9px;text-overflow:ellipsis;white-space:nowrap}
        #mwi-credit-optimizer .mwi-construction-cost{grid-column:4;grid-row:1;display:grid;justify-items:end;gap:1px;min-width:68px;text-align:right}
        #mwi-credit-optimizer .mwi-construction-cost small{color:#aeb1d3;font-size:8px}
        #mwi-credit-optimizer .mwi-construction-cost strong{color:#ffe09a;font:700 12px ui-monospace,SFMono-Regular,Menlo,monospace;white-space:nowrap}
        #mwi-credit-optimizer .mwi-construction-cost em{color:#aeb1d3;font-size:8px;font-style:normal;white-space:nowrap}
        #mwi-credit-optimizer .mwi-construction-group[data-budget-state="within"] .mwi-construction-cost em{color:#77f3d0}
        #mwi-credit-optimizer .mwi-construction-group[data-budget-state="partial"] .mwi-construction-cost em{color:#ffd17c}
        #mwi-credit-optimizer .mwi-construction-group[data-budget-state="outside"] .mwi-construction-cost em{color:#ff9ca3}
        #mwi-credit-optimizer .mwi-construction-row-actions{grid-column:2/-1;grid-row:2;display:flex;align-items:end;flex-wrap:wrap;gap:4px;min-width:0}
        #mwi-credit-optimizer .mwi-construction-target{display:flex;align-items:center;gap:5px;min-width:104px;color:#aeb1d3;font-size:9px}
        #mwi-credit-optimizer .mwi-construction-target select{width:82px;min-width:0;min-height:30px;padding:3px 6px}
        #mwi-credit-optimizer .mwi-construction-row-actions button{min-height:30px;padding:3px 7px}
        #mwi-credit-optimizer .mwi-construction-level-button{min-width:34px;background:#43c4ad;color:#10201f}
        #mwi-credit-optimizer .mwi-construction-order-actions{display:flex;gap:4px;margin-left:auto}
        #mwi-credit-optimizer .mwi-construction-order-actions .mwi-icon-button{min-height:30px}
        #mwi-credit-optimizer .mwi-construction-expand,#mwi-credit-optimizer .mwi-construction-remove{width:32px;min-width:32px;padding:0!important;background:#343650;color:#fff}
        #mwi-credit-optimizer .mwi-construction-remove{background:#5a3340;color:#ffd5d9;font-size:18px}
        #mwi-credit-optimizer .mwi-construction-group-steps[hidden]{display:none!important}
        #mwi-credit-optimizer .mwi-construction-group-steps{display:grid;gap:1px;padding:4px;border-top:1px solid #3f4160}
        #mwi-credit-optimizer .mwi-budget-cutoff{margin:0;padding:5px 8px;border-top:1px solid #6f4550;border-bottom:1px solid #6f4550;background:#382831}
        #mwi-credit-optimizer .mwi-budget-cutoff:before{width:8px}
        #mwi-credit-optimizer .mwi-sort-dragging.mwi-construction-group{border-color:#77f3d0!important;box-shadow:0 10px 24px #090a12aa;opacity:.92}
        #mwi-credit-optimizer .mwi-building-picker{overflow:visible;border:1px solid #474969;border-radius:7px;background:#24253c}
        #mwi-credit-optimizer .mwi-building-picker-toggle{display:grid;grid-template-columns:28px minmax(0,1fr) auto;align-items:center;gap:7px;width:100%;min-height:42px;padding:6px 8px!important;border-radius:6px!important;background:#2b2d48!important;color:#fff!important;text-align:left}
        #mwi-credit-optimizer .mwi-building-picker[data-open="true"] .mwi-building-picker-toggle{border-radius:6px 6px 0 0!important;border-bottom:1px solid #3f4160;background:#30324f!important}
        #mwi-credit-optimizer .mwi-building-picker-plus{display:grid;place-items:center;width:26px;height:26px;border:1px solid #43c4ad;border-radius:5px;background:#245149;color:#dffff7;font-size:17px}
        #mwi-credit-optimizer .mwi-building-picker-toggle>span:nth-child(2){display:flex;align-items:baseline;flex-wrap:wrap;gap:3px 7px;min-width:0}
        #mwi-credit-optimizer .mwi-building-picker-toggle strong{font-size:12px}
        #mwi-credit-optimizer .mwi-building-picker-chevron{color:#aeb1d3}
        #mwi-credit-optimizer .mwi-building-level-status{padding:2px 6px;border:1px solid #80663f;border-radius:999px;background:#3b3323;color:#ffd17c!important;font-size:9px!important}
        #mwi-credit-optimizer .mwi-building-level-status[data-complete="true"]{border-color:#4d7d73;background:#203d3a;color:#bff6ea!important}
        #mwi-credit-optimizer .mwi-building-picker-body[hidden]{display:none!important}
        #mwi-credit-optimizer .mwi-building-picker-body{min-width:0}
        #mwi-credit-optimizer .mwi-building-pane-heading{padding:8px 9px}
        #mwi-credit-optimizer .mwi-building-pane-heading>span>h4{margin:0;color:#fff;font-size:12px}
        #mwi-credit-optimizer .mwi-building-pane-heading input{min-height:30px}
        #mwi-credit-optimizer .mwi-building-categories{padding:6px 7px}
        #mwi-credit-optimizer .mwi-building-grid{grid-template-columns:repeat(auto-fill,minmax(48px,1fr));gap:5px;padding:7px}
        #mwi-credit-optimizer .mwi-building-tile{min-height:48px;padding:5px!important}
        #mwi-credit-optimizer .mwi-building-tile[data-planned="true"]{outline:1px solid #77f3d0;outline-offset:-3px}
        #mwi-credit-optimizer .mwi-building-tile:focus-visible{outline:2px solid #fff;outline-offset:1px}
        #mwi-credit-optimizer .mwi-building-icon{width:min(70%,42px);height:min(70%,42px)}
        #mwi-credit-optimizer .mwi-building-start-form{display:grid;grid-template-columns:minmax(130px,1fr) minmax(100px,.6fr) auto;align-items:end;gap:5px 8px;padding:8px 9px;border-bottom:1px solid #80663f;background:#332e28}
        #mwi-credit-optimizer .mwi-building-start-copy{display:grid;align-self:center;gap:2px;min-width:0}
        #mwi-credit-optimizer .mwi-building-start-copy strong{overflow:hidden;color:#fff;text-overflow:ellipsis;white-space:nowrap}
        #mwi-credit-optimizer .mwi-building-start-copy small,#mwi-credit-optimizer .mwi-building-start-form>small{color:#c8b78f;font-size:9px;line-height:1.3}
        #mwi-credit-optimizer .mwi-building-start-form label{min-width:0;font-size:9px}
        #mwi-credit-optimizer .mwi-building-start-form input{width:100%;min-width:0}
        #mwi-credit-optimizer .mwi-building-start-form>small{grid-column:2/-1}
        #mwi-credit-optimizer .mwi-building-start-actions{display:flex;gap:4px}
        #mwi-credit-optimizer .mwi-building-start-actions button{min-height:32px;padding:4px 8px;white-space:nowrap}
        #mwi-credit-optimizer .mwi-secondary-button{border:1px solid #555875!important;background:#343650!important;color:#fff!important}
        @container (min-width:720px){#mwi-credit-optimizer .mwi-construction-layout{grid-template-columns:minmax(0,1fr);align-items:start}#mwi-credit-optimizer .mwi-construction-layout[data-picker-open="true"]{grid-template-columns:minmax(360px,1.12fr) minmax(300px,.88fr)}#mwi-credit-optimizer .mwi-construction-queue-pane{position:static;top:auto}}
        @container (max-width:520px){#mwi-credit-optimizer .mwi-construction-budget{grid-template-columns:repeat(3,minmax(0,1fr))}#mwi-credit-optimizer .mwi-construction-budget-input{grid-column:1/-1}#mwi-credit-optimizer .mwi-construction-budget-summary{grid-column:1/-1}#mwi-credit-optimizer .mwi-construction-queue-heading{align-items:stretch;flex-direction:column}#mwi-credit-optimizer .mwi-construction-queue-meta{justify-content:space-between}#mwi-credit-optimizer .mwi-construction-actions{margin-left:auto}}
        @container (max-width:400px){#mwi-credit-optimizer .mwi-construction-row{grid-template-columns:30px 36px minmax(0,1fr) auto;gap:5px;padding-right:6px}#mwi-credit-optimizer .mwi-construction-drag-handle{width:30px;min-width:30px}#mwi-credit-optimizer .mwi-construction-building-icon{width:36px;height:36px}#mwi-credit-optimizer .mwi-construction-building-icon .mwi-building-icon{width:34px;height:34px}#mwi-credit-optimizer .mwi-construction-cost{min-width:58px}#mwi-credit-optimizer .mwi-construction-target{min-width:96px}#mwi-credit-optimizer .mwi-construction-target select{width:70px}#mwi-credit-optimizer .mwi-building-start-form{grid-template-columns:minmax(0,1fr)}#mwi-credit-optimizer .mwi-building-start-form>small{grid-column:1}#mwi-credit-optimizer .mwi-building-start-actions{flex-wrap:wrap}#mwi-credit-optimizer .mwi-building-pane-heading{align-items:stretch;flex-direction:column}#mwi-credit-optimizer .mwi-building-pane-heading input{width:100%}}
        @media (prefers-reduced-motion:reduce){#mwi-credit-optimizer .mwi-construction-group,#mwi-credit-optimizer .mwi-building-picker-toggle{transition:none}}
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
        /* Shrine route workspace: one visual signature, compact utility controls, and explicit overflow safety. */
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
        #mwi-credit-optimizer .mwi-shrine-guide-route{
          display:grid;
          grid-template-columns:auto minmax(0,1fr);
          align-items:center;
          gap:9px;
          margin:0 0 7px;
          padding:7px 9px;
          border:1px solid #4b4f75;
          border-radius:8px;
          background:linear-gradient(105deg,#282a46,#22243b);
        }
        #mwi-credit-optimizer .mwi-shrine-guide-toggle{
          display:flex;
          align-items:center;
          gap:6px;
          min-height:29px!important;
          padding:4px 9px!important;
          border:1px solid #65698f!important;
          background:#353752!important;
          color:#e3e5f7!important;
          white-space:nowrap;
        }
        #mwi-credit-optimizer .mwi-shrine-guide-route[data-active="true"] .mwi-shrine-guide-toggle{
          border-color:#63e6c8!important;
          background:#245149!important;
          color:#eafff9!important;
        }
        #mwi-credit-optimizer .mwi-shrine-guide-beacon{
          width:8px;
          height:8px;
          border:1px solid #a9acc9;
          border-radius:50%;
          background:#5c5f7e;
          box-shadow:0 0 0 3px #5c5f7e24;
        }
        #mwi-credit-optimizer .mwi-shrine-guide-route[data-active="true"] .mwi-shrine-guide-beacon{
          border-color:#c9fff2;
          background:#63e6c8;
          box-shadow:0 0 0 3px #63e6c82e,0 0 12px #63e6c866;
        }
        #mwi-credit-optimizer .mwi-shrine-guide-copy{display:grid;gap:2px;min-width:0}
        #mwi-credit-optimizer .mwi-shrine-guide-copy strong{overflow:hidden;color:#f2f4ff;font-size:11px;text-overflow:ellipsis;white-space:nowrap}
        #mwi-credit-optimizer .mwi-shrine-guide-copy small{min-width:0;color:#b9bdd9;font-size:10px;line-height:1.35;overflow-wrap:anywhere}
        #mwi-credit-optimizer .mwi-shrine-guide-route[data-status="set_quantity"]{border-color:#d7a64d;background:linear-gradient(105deg,#3d3425,#292a46)}
        #mwi-credit-optimizer .mwi-shrine-guide-route[data-status="complete"]{border-color:#4da496;background:linear-gradient(105deg,#203e3a,#252742)}
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
          #mwi-credit-optimizer .mwi-shrine-guide-route{grid-template-columns:minmax(0,1fr)}
          #mwi-credit-optimizer .mwi-shrine-guide-toggle{justify-content:center;width:100%}
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
        @container (max-width:400px){
          #mwi-credit-optimizer .mwi-view-tabs{overflow-x:hidden}
          #mwi-credit-optimizer .mwi-view-tab-item:not([hidden]){
            display:flex;
            flex:1 1 0;
            min-width:0;
          }
          #mwi-credit-optimizer .mwi-view-tab{
            display:flex;
            align-items:center;
            justify-content:center;
            width:100%;
            min-width:0;
            height:100%;
            min-height:40px!important;
            padding:5px 3px!important;
            font-size:11px;
            line-height:1.15;
            overflow-wrap:anywhere;
            hyphens:auto;
            text-align:center;
            white-space:normal;
            word-break:normal;
          }
          #mwi-credit-optimizer .mwi-view-order-actions .mwi-icon-button,
          #mwi-credit-optimizer .mwi-settings-trigger{height:100%}
        }
  `;

  function shrineGuideStyles(quantityHintId) {
    return `
      [data-mwi-shrine-guide]{--mwi-guide-color:#63e6c8;position:relative!important;z-index:5!important;outline:2px solid color-mix(in srgb,var(--mwi-guide-color) 78%,white 12%)!important;outline-offset:2px!important;box-shadow:0 0 0 4px color-mix(in srgb,var(--mwi-guide-color) 20%,transparent),0 0 18px color-mix(in srgb,var(--mwi-guide-color) 25%,transparent)!important;scroll-margin:16px}
      [data-mwi-shrine-guide="goal"]{outline-style:dashed!important;box-shadow:0 0 0 3px color-mix(in srgb,var(--mwi-guide-color) 13%,transparent)!important}
      [data-mwi-shrine-guide="pending"]{box-shadow:0 0 0 3px color-mix(in srgb,var(--mwi-guide-color) 16%,transparent)!important}
      [data-mwi-shrine-guide="active"]{animation:mwi-shrine-guide-pulse 1.45s ease-in-out infinite}
      input[data-mwi-shrine-guide="active"]{animation:none;filter:none!important;outline-width:1px!important;outline-offset:1px!important;box-shadow:0 0 0 2px color-mix(in srgb,var(--mwi-guide-color) 22%,transparent)!important}
      #${quantityHintId}{position:absolute!important;width:1px!important;height:1px!important;margin:-1px!important;padding:0!important;overflow:hidden!important;clip-path:inset(50%)!important;white-space:nowrap!important;border:0!important}
      @keyframes mwi-shrine-guide-pulse{0%,100%{filter:brightness(1);box-shadow:0 0 0 3px color-mix(in srgb,var(--mwi-guide-color) 20%,transparent),0 0 12px color-mix(in srgb,var(--mwi-guide-color) 22%,transparent)}50%{filter:brightness(1.08);box-shadow:0 0 0 6px color-mix(in srgb,var(--mwi-guide-color) 13%,transparent),0 0 23px color-mix(in srgb,var(--mwi-guide-color) 38%,transparent)}}
      @media (prefers-reduced-motion:reduce){[data-mwi-shrine-guide="active"]{animation:none}}
    `;
  }

  const GUILD_EXCHANGE_ADVISOR_STYLES = `
    :host{all:initial;color-scheme:dark;font-family:system-ui,-apple-system,"Microsoft YaHei",sans-serif}*,*::before,*::after{box-sizing:border-box}[hidden]{display:none!important}
    .advisor-stack{--credit:#4fcdb5;position:fixed;z-index:1065;display:grid;width:min(400px,calc(100vw - 24px));max-height:calc(100dvh - 24px);grid-template-rows:minmax(0,1fr) auto;gap:8px;pointer-events:none}
    .advisor{display:flex;min-height:0;flex-direction:column;overflow:auto;border:1px solid #414361;border-left:4px solid var(--credit);border-radius:7px;background:#171927;color:#f4f5ff;box-shadow:0 8px 24px rgba(0,0,0,.45);font-size:13px;line-height:1.4;pointer-events:auto}
    .guide-quantity{display:grid;justify-items:center;gap:2px;padding:10px 12px;border:1px solid #414361;border-radius:7px;background:#171927;color:#f4f5ff;box-shadow:0 6px 18px rgba(0,0,0,.34);font-size:12px;line-height:1.5;text-align:center;pointer-events:auto;cursor:text;user-select:text;-webkit-user-select:text}
    .guide-quantity::selection,.guide-quantity *::selection{background:color-mix(in srgb,var(--credit) 52%,#171927);color:#fff}
    .guide-quantity-summary{max-width:100%;overflow-wrap:anywhere;font-variant-numeric:tabular-nums}
    .guide-quantity-detail{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
    .head{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;padding:10px 12px;border-bottom:1px solid #414361;background:#24263e}.title{display:grid;gap:2px;font-size:17px;font-weight:700}.credit{display:flex;align-items:center;gap:5px;color:#c7cae4;font-size:11px;font-weight:500}.credit::before{width:9px;height:9px;border-radius:2px;background:var(--credit);content:""}.reference{padding-top:3px;color:#bfc2de;font-size:11px;white-space:nowrap}.body{display:flex;flex:1;min-height:0;flex-direction:column;gap:9px;padding:11px 12px}.options{display:grid;flex:1;min-height:0;grid-template-columns:minmax(0,1fr) 32px minmax(0,1fr);align-items:stretch;gap:8px}.options.single{grid-template-columns:minmax(0,1fr)}.option{min-width:0;padding:8px;border:1px solid #414361;border-radius:5px;background:#202139}.option.best{border-color:var(--credit);background:#193836}.label{display:block;margin-bottom:6px;color:#bfc2de;font-size:11px}.item{display:flex;align-items:center;gap:6px;min-width:0;color:#fff;font-size:14px;font-weight:700}.item .mwi-item-icon{width:32px;height:32px;flex:0 0 32px}.name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.cost{margin:8px 0 5px;color:var(--credit);font-size:23px;font-weight:700;line-height:1}.cost small{margin-left:3px;color:#bfc2de;font-size:11px;font-weight:500}.detail{display:flex;justify-content:space-between;gap:5px;color:#bfc2de;font-size:11px;white-space:nowrap}.detail b{color:#e7e8f6;font-weight:600}.versus{display:grid;place-items:center;color:#aeb1d3;font-size:11px;font-weight:700}.versus span{display:grid;place-items:center;width:28px;height:28px;border:1px solid #58607a;border-radius:50%;background:#151722}.summary{padding:8px;border-top:1px solid #414361;color:#dfe1f7;text-align:center;font-size:12px;font-weight:600}.summary strong{color:var(--credit);font-size:16px}
    @media (max-width:600px){.advisor-stack{max-height:min(300px,calc(100dvh - 24px))}.options{grid-template-columns:minmax(0,1fr) 28px minmax(0,1fr)}.body{padding:9px}.option{padding:7px}.cost{font-size:20px}}
  `;

  return { PANEL_STYLES, shrineGuideStyles, GUILD_EXCHANGE_ADVISOR_STYLES };
});


// SOURCE: src/ui/construction-view.js
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MwiGuildCreditConstructionView = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function createConstructionView(dependencies) {
    const {
      state,
      buildingDataApi,
      t,
      ui,
      core,
      escapeHtml,
      formatNumber,
      titleCase,
      simpleItemName,
      shrineIdentityValues,
      shrineLevelValue,
      guildBuildingSpriteBaseHref,
      guildBuildingIconMarkup,
      updateRenderedMarkup,
      persistGuildBuildingPlannerState,
      hydrateBridgeData,
      extractItemDetailsFromReact,
      hydrateLocalInitData,
      pageWindow,
      document,
      URL,
      Blob
    } = dependencies;

    const constructionUi = {
      pickerOpen: state.buildingPlans.length === 0,
      pendingBuildingHrid: "",
      pendingStartValue: "",
      pendingStartErrorKey: "",
      expandedBuildingHrids: new Set(),
      clearUndoPlans: null,
      clearUndoTimer: null
    };

    function guildBuildingDefinitions() {
      return buildingDataApi.definitions();
    }

    function guildBuildingLabel(definition) {
      return definition && definition.nameKey
        ? t(definition.nameKey)
        : titleCase(simpleItemName(definition && definition.hrid));
    }

    function guildBuildingLevelRecordMatches(record, fallbackHrid, buildingHrid) {
      const segment = String(buildingHrid || "")
        .split("/")
        .pop()
        .toLowerCase();
      if (!segment) return false;
      const candidates = shrineIdentityValues(record, fallbackHrid).filter((value) => typeof value === "string");
      return candidates.some((value) => {
        const normalized = value.toLowerCase();
        return normalized === buildingHrid || new RegExp(`(^|[/_-])${segment}([/_-]|$)`).test(normalized);
      });
    }

    function currentGuildBuildingLevel(definition) {
      const source = state.guildBuildingLevels;
      if (!source) return null;
      const entries = Array.isArray(source)
        ? source.map((record) => [
            record && (record.guildBuildingHrid || record.guildShrineHrid || record.hrid),
            record
          ])
        : Object.entries(source);
      for (const [fallbackHrid, record] of entries) {
        if (!guildBuildingLevelRecordMatches(record, fallbackHrid, definition.hrid)) continue;
        const level = shrineLevelValue(record);
        if (level !== null) return Math.min(level, definition.maxLevel);
      }
      return state.guildBuildingLevelsComplete === true ? 0 : null;
    }

    function guildBuildingLevelSnapshot(definitions) {
      const levels = new Map(definitions.map((definition) => [definition.hrid, currentGuildBuildingLevel(definition)]));
      const knownCount = Array.from(levels.values()).filter((level) => level !== null).length;
      return { levels, knownCount, totalCount: definitions.length };
    }

    function reconcileGuildBuildingPlans(definitions) {
      const byHrid = new Map(definitions.map((definition) => [definition.hrid, definition]));
      let changed = false;
      let adjustedCount = 0;
      let removedCount = 0;
      const reconciled = [];
      for (const plan of state.buildingPlans) {
        const definition = byHrid.get(plan.buildingHrid);
        if (!definition) {
          changed = true;
          removedCount += 1;
          continue;
        }
        const liveLevel = currentGuildBuildingLevel(definition);
        const startLevel =
          liveLevel === null ? Math.max(0, Math.min(definition.maxLevel, Number(plan.startLevel) || 0)) : liveLevel;
        const targetLevel = Math.max(0, Math.min(definition.maxLevel, Number(plan.targetLevel) || 0));
        if (targetLevel <= startLevel) {
          changed = true;
          removedCount += 1;
          continue;
        }
        if (startLevel !== plan.startLevel || targetLevel !== plan.targetLevel) {
          changed = true;
          adjustedCount += 1;
        }
        reconciled.push({ ...plan, startLevel, targetLevel });
      }
      if (changed) {
        state.buildingPlans = reconciled;
        persistGuildBuildingPlannerState();
        if (!state.buildingPlanNotice)
          state.buildingPlanNotice = t("buildingPlansReconciled", {
            adjusted: formatNumber(adjustedCount),
            removed: formatNumber(removedCount)
          });
      }
      return { changed, adjustedCount, removedCount };
    }

    function guildBuildingPlan(definitions) {
      reconcileGuildBuildingPlans(definitions);
      const byHrid = new Map(definitions.map((definition) => [definition.hrid, definition]));
      return core.buildGuildConstructionPlan(
        state.buildingPlans.map((plan) => ({
          ...plan,
          levelCosts: byHrid.get(plan.buildingHrid) && byHrid.get(plan.buildingHrid).levelCosts
        })),
        state.manualGuildPoints
      );
    }

    function discardGuildBuildingClearUndo() {
      if (constructionUi.clearUndoTimer !== null) pageWindow.clearTimeout(constructionUi.clearUndoTimer);
      constructionUi.clearUndoTimer = null;
      constructionUi.clearUndoPlans = null;
    }

    function clearPendingGuildBuilding() {
      constructionUi.pendingBuildingHrid = "";
      constructionUi.pendingStartValue = "";
      constructionUi.pendingStartErrorKey = "";
    }

    function setGuildBuildingPickerOpen(open) {
      constructionUi.pickerOpen = Boolean(open);
      if (!constructionUi.pickerOpen) clearPendingGuildBuilding();
      return constructionUi.pickerOpen;
    }

    function setPendingGuildBuildingStartValue(value) {
      constructionUi.pendingStartValue = String(value ?? "");
      constructionUi.pendingStartErrorKey = "";
    }

    function addGuildBuildingPlan(definitions, buildingHrid, manualStartLevel) {
      const definition = definitions.find((entry) => entry.hrid === buildingHrid);
      if (!definition) return { status: "not_found", buildingHrid };
      const existing = state.buildingPlans.find((plan) => plan.buildingHrid === buildingHrid);
      if (existing) return { status: "already_planned", buildingHrid, plan: existing };
      const liveLevel = currentGuildBuildingLevel(definition);
      let startLevel = liveLevel;
      if (startLevel === null) {
        if (manualStartLevel === undefined || manualStartLevel === null) {
          constructionUi.pickerOpen = true;
          constructionUi.pendingBuildingHrid = buildingHrid;
          constructionUi.pendingStartValue = "";
          constructionUi.pendingStartErrorKey = "";
          return { status: "requires_start_level", buildingHrid };
        }
        if (String(manualStartLevel).trim() === "") {
          constructionUi.pendingBuildingHrid = buildingHrid;
          constructionUi.pendingStartValue = String(manualStartLevel);
          constructionUi.pendingStartErrorKey = "currentBuildingLevelRequired";
          return { status: "invalid_start_level", buildingHrid };
        }
        startLevel = Number(manualStartLevel);
        constructionUi.pendingStartValue = String(manualStartLevel);
        if (!Number.isSafeInteger(startLevel) || startLevel < 0 || startLevel > definition.maxLevel) {
          constructionUi.pendingStartErrorKey = "currentBuildingLevelRange";
          return { status: "invalid_start_level", buildingHrid };
        }
      }
      if (startLevel >= definition.maxLevel) {
        constructionUi.pendingStartErrorKey = "buildingMaxLevel";
        return { status: "at_max_level", buildingHrid };
      }
      discardGuildBuildingClearUndo();
      const plan = {
        id: `building-plan-${state.nextBuildingPlanId++}`,
        buildingHrid,
        startLevel,
        targetLevel: startLevel + 1
      };
      state.buildingPlans.push(plan);
      state.buildingPlanNotice = t("buildingAddedToPlan", { building: guildBuildingLabel(definition) });
      clearPendingGuildBuilding();
      persistGuildBuildingPlannerState();
      return { status: "added", buildingHrid, plan };
    }

    function setGuildBuildingTarget(definitions, buildingHrid, targetLevel) {
      const definition = definitions.find((entry) => entry.hrid === buildingHrid);
      const planIndex = state.buildingPlans.findIndex((entry) => entry.buildingHrid === buildingHrid);
      if (!definition || planIndex < 0) return false;
      const plan = state.buildingPlans[planIndex];
      const target = Number(targetLevel);
      if (!Number.isSafeInteger(target) || target <= plan.startLevel || target > definition.maxLevel) return false;
      if (target === plan.targetLevel) return false;
      discardGuildBuildingClearUndo();
      state.buildingPlans[planIndex] = { ...plan, targetLevel: target };
      state.buildingPlanNotice = t("buildingTargetUpdated", {
        building: guildBuildingLabel(definition),
        target: formatNumber(target)
      });
      persistGuildBuildingPlannerState();
      return true;
    }

    function removeGuildBuildingPlan(definitions, buildingHrid) {
      const index = state.buildingPlans.findIndex((plan) => plan.buildingHrid === buildingHrid);
      if (index < 0) return { status: "not_found", removedIndex: -1 };
      const definition = definitions.find((entry) => entry.hrid === buildingHrid);
      discardGuildBuildingClearUndo();
      const [removed] = state.buildingPlans.splice(index, 1);
      constructionUi.expandedBuildingHrids.delete(buildingHrid);
      state.buildingPlanNotice = t("buildingRemovedFromPlan", { building: guildBuildingLabel(definition) });
      persistGuildBuildingPlannerState();
      return { status: "removed", removedIndex: index, plan: removed };
    }

    function moveGuildBuildingPlan(buildingHrid, direction) {
      const index = state.buildingPlans.findIndex((plan) => plan.buildingHrid === buildingHrid);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= state.buildingPlans.length) return false;
      discardGuildBuildingClearUndo();
      const [plan] = state.buildingPlans.splice(index, 1);
      state.buildingPlans.splice(nextIndex, 0, plan);
      const definition = guildBuildingDefinitions().find((entry) => entry.hrid === buildingHrid);
      state.buildingPlanNotice = t("buildingPlanMovedToPosition", {
        building: guildBuildingLabel(definition),
        position: formatNumber(nextIndex + 1),
        total: formatNumber(state.buildingPlans.length)
      });
      persistGuildBuildingPlannerState();
      return true;
    }

    function reorderGuildBuildingPlan(buildingHrid, targetIndex) {
      const index = state.buildingPlans.findIndex((plan) => plan.buildingHrid === buildingHrid);
      const nextIndex = Math.max(0, Math.min(state.buildingPlans.length - 1, Number(targetIndex)));
      if (index < 0 || !Number.isInteger(nextIndex) || index === nextIndex) return false;
      discardGuildBuildingClearUndo();
      const [plan] = state.buildingPlans.splice(index, 1);
      state.buildingPlans.splice(nextIndex, 0, plan);
      const definition = guildBuildingDefinitions().find((entry) => entry.hrid === buildingHrid);
      state.buildingPlanNotice = t("buildingPlanMovedToPosition", {
        building: guildBuildingLabel(definition),
        position: formatNumber(nextIndex + 1),
        total: formatNumber(state.buildingPlans.length)
      });
      persistGuildBuildingPlannerState();
      return true;
    }

    function toggleGuildBuildingSteps(buildingHrid) {
      if (constructionUi.expandedBuildingHrids.has(buildingHrid)) {
        constructionUi.expandedBuildingHrids.delete(buildingHrid);
        return false;
      }
      constructionUi.expandedBuildingHrids.add(buildingHrid);
      return true;
    }

    function clearGuildBuildingPlans(onUndoExpired) {
      if (!state.buildingPlans.length) return false;
      discardGuildBuildingClearUndo();
      const plans = state.buildingPlans.map((plan) => ({ ...plan }));
      constructionUi.clearUndoPlans = plans;
      constructionUi.expandedBuildingHrids.clear();
      state.buildingPlans = [];
      constructionUi.pickerOpen = true;
      state.buildingPlanNotice = t("buildingPlanCleared", { count: formatNumber(plans.length) });
      persistGuildBuildingPlannerState();
      constructionUi.clearUndoTimer = pageWindow.setTimeout(() => {
        constructionUi.clearUndoPlans = null;
        constructionUi.clearUndoTimer = null;
        if (typeof onUndoExpired === "function") onUndoExpired();
      }, 8000);
      return true;
    }

    function undoClearGuildBuildingPlans() {
      if (!constructionUi.clearUndoPlans) return false;
      const plans = constructionUi.clearUndoPlans.map((plan) => ({ ...plan }));
      discardGuildBuildingClearUndo();
      state.buildingPlans = plans;
      constructionUi.pickerOpen = false;
      state.buildingPlanNotice = "";
      reconcileGuildBuildingPlans(guildBuildingDefinitions());
      state.buildingPlanNotice = t("buildingPlanRestored", { count: formatNumber(state.buildingPlans.length) });
      persistGuildBuildingPlannerState();
      return true;
    }

    function hasGuildBuildingClearUndo() {
      return Boolean(constructionUi.clearUndoPlans);
    }

    function constructionCategoryLabel(category) {
      return t(
        {
          all: "buildingCategoryAll",
          core: "buildingCategoryCore",
          life: "buildingCategoryLife",
          combat: "buildingCategoryCombat",
          shrine: "buildingCategoryShrine"
        }[category] || "buildingCategoryAll"
      );
    }

    function guildConstructionBudgetSummary(plan, definitions) {
      if (!plan.steps.length) return t("constructionBudgetEmptySummary");
      if (plan.availableGuildPoints === null)
        return t("constructionNoBudgetSummary", { total: formatNumber(plan.steps.length) });
      if (!plan.overBudget) return t("constructionBudgetAllFit", { total: formatNumber(plan.steps.length) });
      const cutoff = plan.steps[plan.firstOverBudgetIndex];
      const definition = definitions.find((entry) => entry.hrid === cutoff.buildingHrid);
      return t("constructionBudgetStopsBefore", {
        affordable: formatNumber(plan.affordableStepCount),
        total: formatNumber(plan.steps.length),
        building: guildBuildingLabel(definition),
        from: formatNumber(cutoff.fromLevel),
        to: formatNumber(cutoff.toLevel),
        count: formatNumber(Math.max(0, -cutoff.remainingGuildPoints))
      });
    }

    function renderGuildBuildingBudget(plan, definitions) {
      const hasBudget = plan.availableGuildPoints !== null;
      const remaining = plan.remainingGuildPoints;
      const remainingLabel = !hasBudget ? "-" : formatNumber(Math.abs(remaining));
      const remainingTitle = hasBudget && remaining < 0 ? t("overBudgetBy") : t("remainingPoints");
      const coverageLabel = hasBudget ? t("affordableUpgrades") : t("plannedUpgrades");
      const coverageValue = hasBudget
        ? `${formatNumber(plan.affordableStepCount)} / ${formatNumber(plan.steps.length)}`
        : formatNumber(plan.steps.length);
      return `<section class="mwi-construction-budget" data-over-budget="${String(Boolean(plan.overBudget))}">
        <div class="mwi-construction-budget-input"><label><span>${escapeHtml(t("guildPointBudget"))}</span><input data-role="guild-point-budget" type="number" min="0" step="1" aria-describedby="mwi-guild-point-budget-help mwi-guild-point-budget-error" placeholder="${escapeHtml(t("budgetOptional"))}" value="${state.manualGuildPoints === null ? "" : state.manualGuildPoints}"></label><small id="mwi-guild-point-budget-help">${escapeHtml(t("manualBudget"))}</small><small id="mwi-guild-point-budget-error" class="mwi-field-error" hidden>${escapeHtml(t("invalidGuildPointBudget"))}</small></div>
        <div class="mwi-construction-metric"><small>${escapeHtml(t("plannedSpend"))}</small><strong data-role="construction-planned-spend">${formatNumber(plan.totalCost)}</strong></div>
        <div class="mwi-construction-metric"><small data-role="construction-affordable-label">${escapeHtml(coverageLabel)}</small><strong data-role="construction-affordable">${coverageValue}</strong></div>
        <div class="mwi-construction-metric" data-role="construction-balance-metric" data-state="${hasBudget && remaining < 0 ? "danger" : "safe"}"><small data-role="construction-balance-label">${escapeHtml(remainingTitle)}</small><strong data-role="construction-balance">${remainingLabel}</strong></div>
        <output class="mwi-construction-budget-summary" data-role="construction-budget-summary">${escapeHtml(guildConstructionBudgetSummary(plan, definitions))}</output>
      </section>`;
    }

    function renderGuildBuildingTile(definition, plan, liveLevel, spriteBaseHref) {
      const displayLevel = liveLevel === null ? (plan ? plan.startLevel : null) : liveLevel;
      const currentLabel = displayLevel === null ? "?" : formatNumber(displayLevel);
      const label = guildBuildingLabel(definition);
      const searchText =
        `${label} ${constructionCategoryLabel(definition.category)} ${definition.hrid}`.toLocaleLowerCase(ui().locale);
      const accessibleLabel = plan
        ? t("buildingTilePlannedLabel", { building: label, target: formatNumber(plan.targetLevel) })
        : liveLevel === null
          ? t("buildingTileUnknownLabel", { building: label })
          : t("buildingTileAddLabel", { building: label, current: formatNumber(liveLevel) });
      const atMaxLevel = !plan && liveLevel !== null && liveLevel >= definition.maxLevel;
      return `<button class="mwi-building-tile" data-role="building-tile" data-building-hrid="${escapeHtml(definition.hrid)}" data-category="${definition.category}" data-planned="${String(Boolean(plan))}" data-level-known="${String(liveLevel !== null)}" data-building-search="${escapeHtml(searchText)}" aria-label="${escapeHtml(atMaxLevel ? t("buildingTileMaxLabel", { building: label }) : accessibleLabel)}" title="${escapeHtml(atMaxLevel ? t("buildingTileMaxLabel", { building: label }) : accessibleLabel)}" type="button"${atMaxLevel ? " disabled" : ""}>${guildBuildingIconMarkup(definition, spriteBaseHref)}<span class="mwi-building-level-badge" data-level-known="${String(liveLevel !== null)}">${currentLabel}</span>${plan ? `<span class="mwi-building-target-badge">${formatNumber(plan.targetLevel)}</span>` : ""}<span class="mwi-building-tile-name">${escapeHtml(label)}</span></button>`;
    }

    function renderPendingGuildBuilding(definitions) {
      const definition = definitions.find((entry) => entry.hrid === constructionUi.pendingBuildingHrid);
      if (!definition) return "";
      const label = guildBuildingLabel(definition);
      const errorId = "mwi-pending-building-level-error";
      const helpId = "mwi-pending-building-level-help";
      const error = constructionUi.pendingStartErrorKey
        ? t(constructionUi.pendingStartErrorKey, { max: formatNumber(Math.max(0, definition.maxLevel - 1)) })
        : "";
      return `<form class="mwi-building-start-form" data-role="pending-building-start" data-building-hrid="${escapeHtml(definition.hrid)}" novalidate><span class="mwi-building-start-copy"><strong>${escapeHtml(label)}</strong><small>${escapeHtml(t("currentBuildingLevelRequired"))}</small></span><label><span>${escapeHtml(t("currentBuildingLevelLabel", { building: label }))}</span><input data-role="pending-building-start-level" data-building-hrid="${escapeHtml(definition.hrid)}" type="number" min="0" max="${definition.maxLevel - 1}" step="1" inputmode="numeric" aria-describedby="${helpId} ${errorId}"${error ? ' aria-invalid="true"' : ""} value="${escapeHtml(constructionUi.pendingStartValue)}"></label><small id="${helpId}">${escapeHtml(t("currentBuildingLevelHelp", { max: formatNumber(Math.max(0, definition.maxLevel - 1)) }))}</small><small id="${errorId}" class="mwi-field-error"${error ? "" : " hidden"}>${escapeHtml(error)}</small><span class="mwi-building-start-actions"><button type="submit">${escapeHtml(t("addBuildingToPlan"))}</button><button class="mwi-secondary-button" data-role="cancel-pending-building" data-building-hrid="${escapeHtml(definition.hrid)}" type="button">${escapeHtml(t("cancel"))}</button></span></form>`;
    }

    function renderGuildBuildingPicker(definitions, levels, plansByHrid, spriteBaseHref) {
      const categories = ["all", "core", "life", "combat", "shrine"]
        .map(
          (category) =>
            `<button data-role="building-category" data-category="${category}" data-active="${String(category === state.buildingCategory)}" aria-pressed="${String(category === state.buildingCategory)}" type="button">${escapeHtml(constructionCategoryLabel(category))}</button>`
        )
        .join("");
      const tiles = definitions
        .map((definition) =>
          renderGuildBuildingTile(
            definition,
            plansByHrid.get(definition.hrid),
            levels.levels.get(definition.hrid),
            spriteBaseHref
          )
        )
        .join("");
      const unknownCount = Math.max(0, levels.totalCount - levels.knownCount);
      const status = t("buildingLevelsCoverage", {
        known: formatNumber(levels.knownCount),
        total: formatNumber(levels.totalCount)
      });
      return `<section class="mwi-building-picker" data-open="${String(constructionUi.pickerOpen)}"><button class="mwi-building-picker-toggle" data-role="toggle-building-picker" type="button" aria-expanded="${String(constructionUi.pickerOpen)}" aria-controls="mwi-building-picker-body"><span class="mwi-building-picker-plus" aria-hidden="true">＋</span><span><strong>${escapeHtml(constructionUi.pickerOpen ? t("closeBuildingPicker") : t("addBuilding"))}</strong><small class="mwi-building-level-status" data-known-count="${levels.knownCount}" data-total-count="${levels.totalCount}" data-complete="${String(levels.knownCount === levels.totalCount)}">${escapeHtml(status)}</small></span><span class="mwi-building-picker-chevron" aria-hidden="true">${constructionUi.pickerOpen ? "▴" : "▾"}</span></button><div id="mwi-building-picker-body" class="mwi-building-picker-body"${constructionUi.pickerOpen ? "" : " hidden"}>${renderPendingGuildBuilding(definitions)}<div class="mwi-building-pane-heading"><span><h4>${escapeHtml(t("buildingCatalog"))}</h4><small>${escapeHtml(unknownCount ? t("buildingLevelsPartialHint", { unknown: formatNumber(unknownCount) }) : t("buildingCatalogHint"))}</small></span><input data-role="building-search" type="search" placeholder="${escapeHtml(t("searchBuildings"))}" aria-label="${escapeHtml(t("searchBuildings"))}" value="${escapeHtml(state.buildingSearch)}"></div><div class="mwi-building-categories" role="group" aria-label="${escapeHtml(t("buildingCategoryFilter"))}">${categories}</div><div class="mwi-building-grid">${tiles}</div><div class="mwi-empty" data-role="building-filter-empty" role="status" aria-live="polite" aria-atomic="true" hidden></div></div></section>`;
    }

    function renderGuildConstructionActions(plan) {
      const disabled = plan.steps.length ? "" : " disabled";
      return `<div class="mwi-construction-actions"><button data-role="copy-building-plan" type="button"${disabled}>${escapeHtml(t("copyBuildingPlan"))}</button><button data-role="export-building-plan" type="button"${disabled}>${escapeHtml(t("exportBuildingCsv"))}</button><details class="mwi-construction-more"${plan.steps.length ? "" : " hidden"}><summary aria-label="${escapeHtml(t("moreConstructionActions"))}" title="${escapeHtml(t("moreConstructionActions"))}">•••</summary><div><button class="mwi-clear-building-plans" data-role="clear-building-plans" type="button">${escapeHtml(t("clearBuildingPlans"))}</button></div></details></div>`;
    }

    function renderGuildConstructionQueue(plan, definitions, spriteBaseHref) {
      const byHrid = new Map(definitions.map((definition) => [definition.hrid, definition]));
      const groups = plan.plans.map((buildingPlan, planIndex) => {
        const definition = byHrid.get(buildingPlan.buildingHrid);
        const label = guildBuildingLabel(definition);
        const expanded = constructionUi.expandedBuildingHrids.has(buildingPlan.buildingHrid);
        const stepsId = `mwi-building-steps-${String(buildingPlan.buildingHrid)
          .split("/")
          .pop()
          .replace(/[^a-z0-9_-]/gi, "-")}`;
        const options = Array.from(
          { length: definition.maxLevel - buildingPlan.startLevel },
          (_, index) => buildingPlan.startLevel + index + 1
        )
          .map(
            (level) =>
              `<option value="${level}"${level === buildingPlan.targetLevel ? " selected" : ""}>${escapeHtml(t("level", { level: formatNumber(level) }))}</option>`
          )
          .join("");
        const cutoffInGroup = buildingPlan.steps.some((step) => step.globalIndex === plan.firstOverBudgetIndex);
        const cutoff = cutoffInGroup
          ? `<div class="mwi-budget-cutoff"><span>${escapeHtml(
              t("constructionGroupBudgetCutoff", {
                level: formatNumber(buildingPlan.affordableTargetLevel),
                count: formatNumber(buildingPlan.nextStepShortfall || 0)
              })
            )}</span></div>`
          : "";
        const budgetStateKey =
          {
            unbudgeted: "constructionBudgetUnbudgeted",
            within: "constructionWithinBudget",
            partial: "constructionPartiallyWithinBudget",
            outside: "constructionOverBudget"
          }[buildingPlan.budgetState] || "constructionBudgetUnbudgeted";
        const steps = buildingPlan.steps
          .map(
            (step) =>
              `<div class="mwi-construction-step" data-over-budget="${String(step.fitsBudget === false)}"><span class="mwi-construction-step-index">${formatNumber(step.globalIndex + 1)}</span><span class="mwi-construction-step-copy"><small>${formatNumber(step.fromLevel)} → ${formatNumber(step.toLevel)} · ${escapeHtml(step.fitsBudget === false ? t("constructionOverBudget") : t("constructionWithinBudget"))}</small></span><span class="mwi-construction-step-cost">${formatNumber(step.cost)}</span></div>`
          )
          .join("");
        return `<li class="mwi-construction-group" data-sort-key="${escapeHtml(buildingPlan.buildingHrid)}" data-building-hrid="${escapeHtml(buildingPlan.buildingHrid)}" data-budget-state="${buildingPlan.budgetState}" data-expanded="${String(expanded)}" aria-posinset="${planIndex + 1}" aria-setsize="${plan.plans.length}"><div class="mwi-construction-row"><button class="mwi-construction-drag-handle" data-role="construction-drag-handle" data-building-hrid="${escapeHtml(buildingPlan.buildingHrid)}" type="button" aria-describedby="mwi-construction-sort-hint" aria-label="${escapeHtml(t("dragConstructionPlan", { building: label }))}" title="${escapeHtml(t("dragConstructionPlan", { building: label }))}"><span aria-hidden="true"></span></button><span class="mwi-construction-building-icon">${guildBuildingIconMarkup(definition, spriteBaseHref)}</span><span class="mwi-construction-identity"><strong title="${escapeHtml(label)}">${escapeHtml(label)}</strong><small>${escapeHtml(t("constructionPlanRowMeta", { position: formatNumber(planIndex + 1), start: formatNumber(buildingPlan.startLevel), target: formatNumber(buildingPlan.targetLevel), count: formatNumber(buildingPlan.steps.length) }))}</small></span><span class="mwi-construction-cost"><small>${escapeHtml(t("buildingPlanCost"))}</small><strong>${formatNumber(buildingPlan.totalCost)}</strong><em>${escapeHtml(t(budgetStateKey))}</em></span><div class="mwi-construction-row-actions"><label class="mwi-construction-target"><span>${escapeHtml(t("targetLevel"))}</span><select data-role="building-target" data-building-hrid="${escapeHtml(buildingPlan.buildingHrid)}" aria-label="${escapeHtml(t("buildingTargetLabel", { building: label }))}">${options}</select></label><button class="mwi-construction-level-button" data-role="adjust-building-target" data-building-hrid="${escapeHtml(buildingPlan.buildingHrid)}" data-delta="1" type="button" aria-label="${escapeHtml(t("increaseBuildingTarget", { building: label, count: formatNumber(1) }))}" title="${escapeHtml(t("increaseBuildingTarget", { building: label, count: formatNumber(1) }))}"${buildingPlan.targetLevel >= definition.maxLevel ? " disabled" : ""}>+1</button><button class="mwi-construction-level-button" data-role="adjust-building-target" data-building-hrid="${escapeHtml(buildingPlan.buildingHrid)}" data-delta="5" type="button" aria-label="${escapeHtml(t("increaseBuildingTarget", { building: label, count: formatNumber(5) }))}" title="${escapeHtml(t("increaseBuildingTarget", { building: label, count: formatNumber(5) }))}"${buildingPlan.targetLevel >= definition.maxLevel ? " disabled" : ""}>+5</button><span class="mwi-construction-order-actions"><button class="mwi-icon-button mwi-icon-up" data-role="move-building-plan" data-building-hrid="${escapeHtml(buildingPlan.buildingHrid)}" data-direction="-1" type="button" aria-label="${escapeHtml(t("movePlanUp", { building: label }))}" title="${escapeHtml(t("movePlanUp", { building: label }))}"${planIndex <= 0 ? " disabled" : ""}></button><button class="mwi-icon-button mwi-icon-down" data-role="move-building-plan" data-building-hrid="${escapeHtml(buildingPlan.buildingHrid)}" data-direction="1" type="button" aria-label="${escapeHtml(t("movePlanDown", { building: label }))}" title="${escapeHtml(t("movePlanDown", { building: label }))}"${planIndex >= plan.plans.length - 1 ? " disabled" : ""}></button></span><button class="mwi-construction-expand" data-role="toggle-building-steps" data-building-hrid="${escapeHtml(buildingPlan.buildingHrid)}" type="button" aria-expanded="${String(expanded)}" aria-controls="${stepsId}" aria-label="${escapeHtml(t(expanded ? "collapseBuildingSteps" : "expandBuildingSteps", { building: label }))}" title="${escapeHtml(t(expanded ? "collapseBuildingSteps" : "expandBuildingSteps", { building: label }))}"><span aria-hidden="true">${expanded ? "▴" : "▾"}</span></button><button class="mwi-construction-remove" data-role="remove-building-plan" data-building-hrid="${escapeHtml(buildingPlan.buildingHrid)}" type="button" aria-label="${escapeHtml(t("removeBuildingFromPlan", { building: label }))}" title="${escapeHtml(t("removeBuildingFromPlan", { building: label }))}">×</button></div></div>${cutoff}<div id="${stepsId}" class="mwi-construction-group-steps"${expanded ? "" : " hidden"}>${steps}</div></li>`;
      });
      return `<section class="mwi-construction-queue" aria-label="${escapeHtml(t("constructionQueue"))}"><div class="mwi-construction-queue-heading"><span><h4>${escapeHtml(t("constructionQueue"))}</h4><small id="mwi-construction-sort-hint">${escapeHtml(t("constructionQueueDragHint"))}</small></span><span class="mwi-construction-queue-meta"><small>${escapeHtml(t("constructionSummary", { buildings: formatNumber(plan.plans.length), steps: formatNumber(plan.steps.length) }))}</small>${renderGuildConstructionActions(plan)}</span></div>${groups.length ? `<ol class="mwi-construction-rail" data-role="construction-sort-list">${groups.join("")}</ol>` : `<div class="mwi-construction-empty"><strong>${escapeHtml(t("constructionQueueEmptyTitle"))}</strong><small>${escapeHtml(t("constructionQueueEmpty"))}</small></div>`}</section>`;
    }

    function renderGuildConstruction(plan, definitions) {
      const plansByHrid = new Map(state.buildingPlans.map((entry) => [entry.buildingHrid, entry]));
      const levels = guildBuildingLevelSnapshot(definitions);
      const spriteBaseHref = guildBuildingSpriteBaseHref();
      return `${renderGuildBuildingBudget(plan, definitions)}<div class="mwi-construction-layout" data-picker-open="${String(constructionUi.pickerOpen)}"><div class="mwi-construction-queue-pane">${renderGuildConstructionQueue(plan, definitions, spriteBaseHref)}</div>${renderGuildBuildingPicker(definitions, levels, plansByHrid, spriteBaseHref)}</div>`;
    }

    function applyGuildBuildingFilters(results) {
      if (!results) return 0;
      const normalizedSearch = state.buildingSearch.trim().toLocaleLowerCase(ui().locale);
      let visibleCount = 0;
      for (const tile of results.querySelectorAll(".mwi-building-tile")) {
        const matchesCategory = state.buildingCategory === "all" || tile.dataset.category === state.buildingCategory;
        const matchesSearch = !normalizedSearch || String(tile.dataset.buildingSearch || "").includes(normalizedSearch);
        tile.hidden = !(matchesCategory && matchesSearch);
        if (!tile.hidden) visibleCount += 1;
      }
      for (const button of results.querySelectorAll('[data-role="building-category"]')) {
        const active = button.dataset.category === state.buildingCategory;
        button.dataset.active = String(active);
        button.setAttribute("aria-pressed", String(active));
      }
      const empty = results.querySelector('[data-role="building-filter-empty"]');
      if (empty) {
        empty.textContent = visibleCount === 0 ? t("noBuildingMatches") : "";
        empty.hidden = visibleCount !== 0;
      }
      return visibleCount;
    }

    function refreshGuildConstructionBudgetPreview(panel) {
      const results = panel && panel.querySelector('[data-role="construction-results"]');
      if (!results) return;
      const definitions = guildBuildingDefinitions();
      const plan = guildBuildingPlan(definitions);
      const budget = results.querySelector(".mwi-construction-budget");
      if (budget) {
        const hasBudget = plan.availableGuildPoints !== null;
        const remaining = plan.remainingGuildPoints;
        budget.dataset.overBudget = String(Boolean(plan.overBudget));
        const spend = budget.querySelector('[data-role="construction-planned-spend"]');
        const affordableLabel = budget.querySelector('[data-role="construction-affordable-label"]');
        const affordable = budget.querySelector('[data-role="construction-affordable"]');
        const balanceLabel = budget.querySelector('[data-role="construction-balance-label"]');
        const balance = budget.querySelector('[data-role="construction-balance"]');
        const balanceMetric = budget.querySelector('[data-role="construction-balance-metric"]');
        const summary = budget.querySelector('[data-role="construction-budget-summary"]');
        if (spend) spend.textContent = formatNumber(plan.totalCost);
        if (affordableLabel) affordableLabel.textContent = hasBudget ? t("affordableUpgrades") : t("plannedUpgrades");
        if (affordable)
          affordable.textContent = hasBudget
            ? `${formatNumber(plan.affordableStepCount)} / ${formatNumber(plan.steps.length)}`
            : formatNumber(plan.steps.length);
        if (balanceLabel)
          balanceLabel.textContent = hasBudget && remaining < 0 ? t("overBudgetBy") : t("remainingPoints");
        if (balance) balance.textContent = hasBudget ? formatNumber(Math.abs(remaining)) : "-";
        if (balanceMetric) balanceMetric.dataset.state = hasBudget && remaining < 0 ? "danger" : "safe";
        if (summary) summary.textContent = guildConstructionBudgetSummary(plan, definitions);
      }
      const queuePane = results.querySelector(".mwi-construction-queue-pane");
      if (queuePane)
        queuePane.innerHTML = renderGuildConstructionQueue(plan, definitions, guildBuildingSpriteBaseHref());
    }

    function refreshGuildConstruction(panel) {
      hydrateBridgeData();
      extractItemDetailsFromReact();
      hydrateLocalInitData();
      const definitions = guildBuildingDefinitions();
      const plan = guildBuildingPlan(definitions);
      const status = panel.querySelector('[data-role="construction-status"]');
      const results = panel.querySelector('[data-role="construction-results"]');
      const statusText = status && status.querySelector('[data-role="construction-status-text"]');
      const undoButton = status && status.querySelector('[data-role="undo-clear-building-plans"]');
      if (statusText) statusText.textContent = state.buildingPlanNotice || "";
      else if (status) status.textContent = state.buildingPlanNotice || "";
      if (undoButton) undoButton.hidden = !hasGuildBuildingClearUndo();
      if (status) status.hidden = !state.buildingPlanNotice && !hasGuildBuildingClearUndo();
      updateRenderedMarkup(results, renderGuildConstruction(plan, definitions));
      applyGuildBuildingFilters(results);
    }

    function guildConstructionText(plan, definitions) {
      const byHrid = new Map(definitions.map((definition) => [definition.hrid, definition]));
      const budget = plan.availableGuildPoints === null ? "-" : formatNumber(plan.availableGuildPoints);
      const remaining = plan.remainingGuildPoints === null ? "-" : formatNumber(plan.remainingGuildPoints);
      return [
        t("guildConstruction"),
        `${t("guildPointBudget")}: ${budget}`,
        `${t("plannedSpend")}: ${formatNumber(plan.totalCost)}`,
        `${t("remainingPoints")}: ${remaining}`,
        "",
        ...plan.steps.map(
          (step, index) =>
            `${formatNumber(index + 1)}. ${guildBuildingLabel(byHrid.get(step.buildingHrid))} ${formatNumber(step.fromLevel)} → ${formatNumber(step.toLevel)} · ${formatNumber(step.cost)}`
        )
      ].join("\n");
    }

    async function copyGuildConstructionPlan(panel) {
      const definitions = guildBuildingDefinitions();
      const plan = guildBuildingPlan(definitions);
      const text = guildConstructionText(plan, definitions);
      try {
        if (
          !pageWindow.navigator ||
          !pageWindow.navigator.clipboard ||
          typeof pageWindow.navigator.clipboard.writeText !== "function"
        )
          throw new Error("clipboard unavailable");
        await pageWindow.navigator.clipboard.writeText(text);
        state.buildingPlanNotice = t("buildingPlanCopied");
      } catch (_) {
        state.buildingPlanNotice = t("buildingPlanCopyFailed");
      }
      refreshGuildConstruction(panel);
    }

    function exportGuildConstructionCsv() {
      const definitions = guildBuildingDefinitions();
      const plan = guildBuildingPlan(definitions);
      const byHrid = new Map(definitions.map((definition) => [definition.hrid, definition]));
      const escapeCsv = (value) => `"${String(value).replaceAll('"', '""')}"`;
      const rows = [
        [
          t("constructionOrder"),
          t("guildConstruction"),
          "HRID",
          t("fromLevel"),
          t("toLevel"),
          t("stepCost"),
          t("cumulativeCost"),
          t("constructionWithinBudget")
        ]
      ];
      for (let index = 0; index < plan.steps.length; index += 1) {
        const step = plan.steps[index];
        rows.push([
          index + 1,
          guildBuildingLabel(byHrid.get(step.buildingHrid)),
          step.buildingHrid,
          step.fromLevel,
          step.toLevel,
          step.cost,
          step.cumulativeCost,
          step.fitsBudget === false ? t("constructionOverBudget") : t("constructionWithinBudget")
        ]);
      }
      const csv = `\uFEFF${rows.map((row) => row.map(escapeCsv).join(",")).join("\r\n")}`;
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = t("buildingCsvFileName");
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      pageWindow.setTimeout(() => URL.revokeObjectURL(url), 0);
    }

    function dispose() {
      discardGuildBuildingClearUndo();
    }

    return {
      guildBuildingDefinitions,
      currentGuildBuildingLevel,
      addGuildBuildingPlan,
      setGuildBuildingTarget,
      removeGuildBuildingPlan,
      moveGuildBuildingPlan,
      reorderGuildBuildingPlan,
      setGuildBuildingPickerOpen,
      setPendingGuildBuildingStartValue,
      clearPendingGuildBuilding,
      toggleGuildBuildingSteps,
      clearGuildBuildingPlans,
      undoClearGuildBuildingPlans,
      hasGuildBuildingClearUndo,
      applyGuildBuildingFilters,
      refreshGuildConstructionBudgetPreview,
      refreshGuildConstruction,
      copyGuildConstructionPlan,
      exportGuildConstructionCsv,
      dispose
    };
  }

  return { createConstructionView };
});


// SOURCE: src/ui/upgrade-view.js
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MwiGuildCreditUpgradeView = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function createUpgradeView(dependencies) {
    const {
      core,
      state,
      t,
      ui,
      escapeHtml,
      resolveItemName,
      simpleItemName,
      titleCase,
      formatNumber,
      iconMarkup,
      marketItemIconMarkup,
      itemQuantity,
      creditQuantity,
      snapshotOrderBook,
      allConversions,
      CREDIT_TYPES,
      GUILD_TOKEN_CREDIT_CONVERSIONS,
      GUILD_TOKEN_BUDGET_SNAP_PERCENTAGES,
      GUILD_TOKEN_BUDGET_SNAP_THRESHOLD_PERCENTAGE,
      GUILD_SHRINE_NAME_KEYS,
      SHOW_ALL_CREDIT_TOKEN_TOGGLE,
      guildShrineLevelRecordKey,
      persistPluginUiState,
      updateRenderedMarkup,
      hydrateBridgeData,
      extractItemDetailsFromReact,
      hydrateLocalInitData,
      loadSnapshot,
      refreshOfficialItemNameCatalog,
      scheduleShrineGuide,
      scheduleGuildExchangeAdvisor,
      guildTokenBudgetRefreshTask
    } = dependencies;

    function guildBuffEntries() {
      hydrateBridgeData();
      extractItemDetailsFromReact();
      hydrateLocalInitData();
      const details = Array.isArray(state.guildBuffDetails)
        ? state.guildBuffDetails.map((detail) => [detail && (detail.hrid || detail.guildBuffHrid), detail])
        : Object.entries(state.guildBuffDetails || {});
      return details
        .map(([hrid, detail]) => ({ hrid: (detail && (detail.hrid || detail.guildBuffHrid)) || hrid, detail }))
        .filter(({ hrid, detail }) => hrid && detail && detail.levelCosts)
        .map(({ hrid, detail }) => ({
          hrid,
          detail,
          maxLevel: Array.isArray(detail.levelCosts)
            ? detail.levelCosts.length - 1
            : Math.max(...Object.keys(detail.levelCosts).map(Number).filter(Number.isSafeInteger))
        }))
        .filter(({ maxLevel }) => Number.isSafeInteger(maxLevel) && maxLevel > 0)
        .sort((left, right) =>
          guildBuffLabel(left.detail, left.hrid).localeCompare(guildBuffLabel(right.detail, right.hrid), ui().locale)
        );
    }

    function guildBuffLabel(detail, fallbackHrid) {
      const shrineKey = GUILD_SHRINE_NAME_KEYS[detail && detail.shrineHrid];
      const shrineName = shrineKey
        ? t(shrineKey)
        : titleCase(simpleItemName((detail && detail.shrineHrid) || fallbackHrid));
      const domain =
        detail && detail.isCombat === true
          ? t("domainCombat")
          : detail && detail.isCombat === false
            ? t("domainLife")
            : "";
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
      return Object.fromEntries(
        CREDIT_TYPES.map(([creditItemHrid]) => {
          const targetCredits = targetCreditsByHrid ? Number(targetCreditsByHrid[creditItemHrid]) : 1;
          if (!Number.isSafeInteger(targetCredits) || targetCredits <= 0) return [creditItemHrid, null];
          const conversions = allConversions(creditItemHrid);
          const books = Object.fromEntries(
            conversions.map((conversion) => [conversion.itemHrid, snapshotOrderBook(conversion.itemHrid)])
          );
          return [
            creditItemHrid,
            core.rankConversions(conversions, books, targetCredits).find((row) => row.status === "ok") || null
          ];
        })
      );
    }

    function bestCreditUnitCosts() {
      const tokenCreditTargets = Object.fromEntries(
        GUILD_TOKEN_CREDIT_CONVERSIONS.map((rule) => [rule.creditItemHrid, rule.creditCount])
      );
      return Object.fromEntries(
        Object.entries(bestCreditConversions(tokenCreditTargets)).map(([creditItemHrid, best]) => [
          creditItemHrid,
          best ? best.costPerCredit : null
        ])
      );
    }

    function bestCreditMaterialPlans(estimate) {
      const missingCredits = Object.fromEntries(
        ((estimate && estimate.rows) || []).map((row) => [row.itemHrid, row.remainingMissing ?? row.missing])
      );
      return bestCreditConversions(missingCredits);
    }

    function currentGuildBuffLevel(entry) {
      const stored = Array.isArray(state.guildBuffLevels)
        ? state.guildBuffLevels.find((value) => value && (value.guildBuffHrid || value.hrid) === entry.hrid)
        : state.guildBuffLevels && state.guildBuffLevels[entry.hrid];
      const value = stored && typeof stored === "object" ? (stored.level ?? stored.currentLevel) : stored;
      const level = Number(value);
      return Number.isSafeInteger(level) && level >= 0 ? Math.min(level, entry.maxLevel) : 0;
    }

    function shrineLevelValue(value) {
      const raw =
        value && typeof value === "object"
          ? (value.level ?? value.currentLevel ?? value.guildBuildingLevel ?? value.buildingLevel)
          : value;
      const level = Number(raw);
      return Number.isSafeInteger(level) && level >= 0 ? level : null;
    }

    function shrineIdentityValues(record, fallbackHrid) {
      const values = [fallbackHrid];
      if (!record || typeof record !== "object") return values;
      for (const key of [
        "guildShrineHrid",
        "shrineHrid",
        "guildBuildingHrid",
        "hrid",
        "id",
        "guildBuffHrid",
        "name",
        "displayName",
        "label"
      ]) {
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
      const shrineKey = String(shrineHrid || "")
        .split("/")
        .pop()
        .toLowerCase();
      if (!shrineKey) return false;
      const detail = guildShrineDetailFor(record, fallbackHrid);
      const candidates = [...shrineIdentityValues(record, fallbackHrid), ...shrineIdentityValues(detail, "")].filter(
        (value) => typeof value === "string"
      );
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
        ? source.map((record) => [
            record && (record.guildShrineHrid || record.shrineHrid || record.guildBuildingHrid || record.hrid),
            record
          ])
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
      const requestedDomainEntries = entries.filter((entry) => isCombatGuildBuff(entry) === combat);
      const { eligibleEntries: domainEntries, preservedPlans } = core.selectGuildShrineAutofillScope({
        entries,
        plans: state.upgradePlans,
        domain,
        excludedGuildBuffHrids: state.guildShrineAutofillExcludedBuffHrids
      });
      if (!requestedDomainEntries.length) return false;
      if (!domainEntries.length) {
        state.upgradePresetNotice = t("guildAutofillAllExcluded", {
          domain: combat ? t("domainCombat") : t("domainLife")
        });
        return false;
      }
      const targets = guildShrineTargetLevels(domainEntries);
      if (!domainEntries.length || domainEntries.some((entry) => !Object.hasOwn(targets, entry.detail.shrineHrid)))
        return false;
      const planned = domainEntries
        .map((entry) => {
          const startLevel = currentGuildBuffLevel(entry);
          const targetLevel = targets[entry.detail.shrineHrid];
          return targetLevel > startLevel
            ? { id: `plan-${state.nextUpgradePlanId++}`, guildBuffHrid: entry.hrid, startLevel, targetLevel }
            : null;
        })
        .filter(Boolean);
      state.upgradePlans = [...preservedPlans, ...planned];
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
      const startLevel =
        Number.isSafeInteger(rawStart) && rawStart >= 0 && rawStart < entry.maxLevel ? rawStart : currentLevel;
      const rawTarget = Number(plan.targetLevel);
      const targetLevel =
        Number.isSafeInteger(rawTarget) && rawTarget > startLevel && rawTarget <= entry.maxLevel
          ? rawTarget
          : Math.min(startLevel + 1, entry.maxLevel);
      return { ...plan, guildBuffHrid: entry.hrid, startLevel, targetLevel };
    }

    function addGuildUpgradePlan(entries) {
      const plannedHrids = new Set(state.upgradePlans.map((plan) => plan.guildBuffHrid));
      const entry = entries.find(
        (candidate) => !plannedHrids.has(candidate.hrid) && currentGuildBuffLevel(candidate) < candidate.maxLevel
      );
      if (!entry) return false;
      const startLevel = currentGuildBuffLevel(entry);
      state.upgradePlans.push({
        id: `plan-${state.nextUpgradePlanId++}`,
        guildBuffHrid: entry.hrid,
        startLevel,
        targetLevel: startLevel + 1
      });
      state.upgradePresetNotice = "";
      return true;
    }

    function clearGuildUpgradePlans() {
      state.upgradePlans = [];
      state.upgradePresetNotice = t("plansCleared");
    }

    function removeGuildUpgradePlan(planId) {
      const previousLength = state.upgradePlans.length;
      state.upgradePlans = state.upgradePlans.filter((plan) => plan.id !== planId);
      if (state.upgradePlans.length === previousLength) return false;
      const removedLastPlan = state.upgradePlans.length === 0;
      state.upgradePresetNotice = removedLastPlan ? t("plansCleared") : "";
      return true;
    }

    function ensureGuildUpgradePlans(entries) {
      state.upgradePlans = state.upgradePlans.map((plan) => normalizeUpgradePlan(plan, entries)).filter(Boolean);
      persistPluginUiState();
    }

    function levelOptionMarkup(start, end, selected) {
      return Array.from({ length: Math.max(end - start + 1, 0) }, (_, index) => start + index)
        .map(
          (level) =>
            `<option value="${level}" ${level === selected ? "selected" : ""}>${escapeHtml(t("level", { level: formatNumber(level) }))}</option>`
        )
        .join("");
    }

    function updateGuildShrineTargetActions(panel, entries) {
      const targets = guildShrineTargetLevels(entries);
      const summaries = [];
      const excludedDomainNotices = [];
      for (const domain of ["life", "combat"]) {
        const combat = domain === "combat";
        const domainLabel = combat ? t("domainCombat") : t("domainLife");
        const domainEntries = entries.filter((entry) => isCombatGuildBuff(entry) === combat);
        const { eligibleEntries } = core.selectGuildShrineAutofillScope({
          entries,
          plans: [],
          domain,
          excludedGuildBuffHrids: state.guildShrineAutofillExcludedBuffHrids
        });
        const eligibleTargets = guildShrineTargetLevels(eligibleEntries);
        const ready =
          eligibleEntries.length > 0 &&
          eligibleEntries.every((entry) => Object.hasOwn(eligibleTargets, entry.detail.shrineHrid));
        const missing = Array.from(
          new Set(
            eligibleEntries
              .filter((entry) => !Object.hasOwn(eligibleTargets, entry.detail.shrineHrid))
              .map((entry) => {
                const nameKey = GUILD_SHRINE_NAME_KEYS[entry.detail.shrineHrid];
                return nameKey ? t(nameKey) : entry.detail.shrineHrid;
              })
          )
        );
        const button = panel.querySelector(`[data-role="set-guild-shrine-target"][data-domain="${domain}"]`);
        const excludedDomainNotice =
          !eligibleEntries.length && domainEntries.length
            ? t("guildAutofillDomainExcluded", { domain: domainLabel })
            : "";
        if (excludedDomainNotice) excludedDomainNotices.push(excludedDomainNotice);
        if (button) {
          button.disabled = !ready;
          button.title =
            excludedDomainNotice ||
            (ready
              ? t("targetButtonReady")
              : t("targetButtonMissing", { missing: missing.join(ui().locale === "zh-CN" ? "、" : ", ") }));
        }
        const count = Object.keys(targets).filter((shrineHrid) =>
          domainEntries.some((entry) => entry.detail.shrineHrid === shrineHrid)
        ).length;
        const missingText = missing.length
          ? t("targetSummaryMissing", { missing: missing.join(ui().locale === "zh-CN" ? "、" : ", ") })
          : "";
        summaries.push(
          t("targetSummary", {
            domain: domainLabel,
            count: formatNumber(count),
            total: formatNumber(domainEntries.length),
            missing: missingText
          })
        );
      }
      const status = panel.querySelector('[data-role="guild-shrine-target-status"]');
      if (status) {
        const levelStatus = state.guildShrineLevels
          ? t("shrineLevelsRead", { summaries: summaries.join(" · ") })
          : t("shrineLevelsReading");
        status.textContent = [levelStatus, ...excludedDomainNotices].join(" ");
      }
    }

    function renderGuildUpgradePlans(panel, entries) {
      const list = panel.querySelector('[data-role="upgrade-plan-list"]');
      const plannedHrids = new Set(state.upgradePlans.map((plan) => plan.guildBuffHrid));
      const plansMarkup = state.upgradePlans
        .map((plan) => {
          const entry = entries.find((candidate) => candidate.hrid === plan.guildBuffHrid);
          if (!entry) return "";
          const buffOptions = entries
            .map(
              (candidate) =>
                `<option value="${escapeHtml(candidate.hrid)}" ${candidate.hrid === plan.guildBuffHrid ? "selected" : ""} ${candidate.hrid !== plan.guildBuffHrid && (plannedHrids.has(candidate.hrid) || currentGuildBuffLevel(candidate) >= candidate.maxLevel) ? "disabled" : ""}>${escapeHtml(guildBuffLabel(candidate.detail, candidate.hrid))}</option>`
            )
            .join("");
          const shrineHrid = (entry.detail && entry.detail.shrineHrid) || "";
          const domain = isCombatGuildBuff(entry) ? "combat" : "life";
          return `<div class="mwi-upgrade-plan" data-plan-id="${escapeHtml(plan.id)}" data-guild-buff-hrid="${escapeHtml(entry.hrid)}" data-shrine-hrid="${escapeHtml(shrineHrid)}" data-domain="${domain}">
          <label class="mwi-upgrade-plan-shrine"><span class="mwi-upgrade-field-label">${escapeHtml(t("shrine"))}</span><select data-role="plan-buff" aria-label="${escapeHtml(t("shrine"))}">${buffOptions}</select></label>
          <label class="mwi-upgrade-plan-start"><span class="mwi-upgrade-field-label">${escapeHtml(t("startLevel"))}</span><select data-role="plan-start" aria-label="${escapeHtml(t("startLevel"))}">${levelOptionMarkup(0, entry.maxLevel - 1, plan.startLevel)}</select></label>
          <span class="mwi-upgrade-level-arrow" aria-hidden="true">→</span>
          <label class="mwi-upgrade-plan-target"><span class="mwi-upgrade-field-label">${escapeHtml(t("targetLevel"))}</span><select data-role="plan-target" aria-label="${escapeHtml(t("targetLevel"))}">${levelOptionMarkup(plan.startLevel + 1, entry.maxLevel, plan.targetLevel)}</select></label>
          <button class="mwi-remove-plan" data-role="remove-plan" type="button" title="${escapeHtml(t("removePlan"))}" aria-label="${escapeHtml(t("removePlan"))}">×</button>
        </div>`;
        })
        .join("");
      const columnHeaders = state.upgradePlans.length
        ? `<div class="mwi-upgrade-plan-columns" aria-hidden="true"><span>${escapeHtml(t("shrine"))}</span><span>${escapeHtml(t("startLevel"))}</span><span></span><span>${escapeHtml(t("targetLevel"))}</span><span></span></div>`
        : "";
      updateRenderedMarkup(list, columnHeaders + plansMarkup);
      const count = panel.querySelector('[data-role="upgrade-plan-count"]');
      if (count) count.textContent = t("selectedUpgradePlanCount", { count: formatNumber(state.upgradePlans.length) });
      updateGuildShrineTargetActions(panel, entries);
    }

    function guildTokenCreditSelectionState() {
      const selectedCount = CREDIT_TYPES.reduce(
        (count, [hrid]) => count + (state.guildTokenCreditHrids.has(hrid) ? 1 : 0),
        0
      );
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
      const snapMarks = GUILD_TOKEN_BUDGET_SNAP_PERCENTAGES.map(
        (percentage) => `<i data-percentage="${percentage}" style="--mwi-snap-position:${percentage}%"></i>`
      ).join("");
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
      const max =
        hasInventory && estimate ? Math.max(0, Math.floor(Number(estimate.autoGuildTokenBudgetAvailable) || 0)) : 0;
      const effective = state.autoGuildTokenBudget === null ? max : Math.min(max, state.autoGuildTokenBudget);
      for (const input of [range, number]) {
        input.max = String(max);
        input.value = String(effective);
        input.disabled = !hasInventory;
      }
      const effectivePercentage = core.guildTokenBudgetPercentage(effective, max);
      const snappedTo =
        range.dataset.dragging === "true" && GUILD_TOKEN_BUDGET_SNAP_PERCENTAGES.includes(effectivePercentage)
          ? effectivePercentage
          : null;
      updateGuildTokenBudgetPercentage(panel, effective, max, snappedTo);
      available.textContent = t("autoGuildTokenBudgetAvailable", { count: formatNumber(max) });
    }

    function setGuildTokenBudget(panel, rawValue, options = {}) {
      const range = panel.querySelector('[data-role="guild-token-budget-range"]');
      const number = panel.querySelector('[data-role="guild-token-budget-number"]');
      if (!range || !number || rawValue === "") return;
      const max = Math.max(0, Number(range.max) || 0);
      const resolved = options.snap
        ? core.snapGuildTokenBudget(rawValue, max, {
            snapPercentages: GUILD_TOKEN_BUDGET_SNAP_PERCENTAGES,
            thresholdPercentage: GUILD_TOKEN_BUDGET_SNAP_THRESHOLD_PERCENTAGE
          })
        : { value: Math.min(max, Math.max(0, Math.floor(Number(rawValue) || 0))), snappedTo: null };
      const value = resolved.value;
      state.autoGuildTokenBudget = value;
      range.value = String(value);
      number.value = String(value);
      updateGuildTokenBudgetPercentage(panel, value, max, resolved.snappedTo);
      persistPluginUiState();
      guildTokenBudgetRefreshTask.schedule(panel);
    }

    function renderUpgradeCostText(gold, guildTokens, showZeroGuildTokens) {
      const parts = [`${core.formatCompactCost(gold)} ${t("gold")}`];
      if (guildTokens > 0 || showZeroGuildTokens) parts.push(`${formatNumber(guildTokens)} ${t("guildTokens")}`);
      return parts.join(" + ");
    }

    function renderUpgradeCostSummary(estimate, hasInventory) {
      if (!estimate)
        return `<div class="mwi-upgrade-cost-summary mwi-upgrade-cost-unavailable">${escapeHtml(t("noSnapshotEstimate"))}</div>`;
      const partial = estimate.status !== "ok";
      const missingNames = estimate.unpricedItemHrids
        .map(itemNameForMaterial)
        .join(ui().locale === "zh-CN" ? "、" : ", ");
      const totalLabel = partial ? t("partialEstimatedCost") : t("estimatedTotalCost");
      const missingLabel = partial ? t("partialAfterInventory") : t("afterInventory");
      const inventoryNote = hasInventory
        ? ""
        : `<div class="mwi-upgrade-cost-note">${escapeHtml(t("inventoryUnavailable"))}</div>`;
      const priceNote = partial
        ? `<div class="mwi-upgrade-cost-note">${escapeHtml(t("noCreditPrice", { items: missingNames }))}</div>`
        : "";
      const tokenExchangeNote =
        estimate.guildTokenCreditExchangeRequired > 0
          ? `<div class="mwi-upgrade-cost-note mwi-upgrade-token-note">${escapeHtml(t("guildTokenCreditPlanSummary", { count: formatNumber(estimate.guildTokenCreditExchangeRequired) }))}</div>`
          : "";
      const autoTokenNote =
        estimate.autoGuildTokenCreditExchangeUsed > 0
          ? `<div class="mwi-upgrade-cost-note mwi-upgrade-auto-token-note">${escapeHtml(t("autoGuildTokenPlanSummary", { count: formatNumber(estimate.autoGuildTokenCreditExchangeUsed) }))}</div>`
          : "";
      return `<section class="mwi-upgrade-cost-summary"><div class="mwi-upgrade-cost-title">${escapeHtml(t("costSummary"))}</div><div><span>${escapeHtml(totalLabel)}</span><strong>${renderUpgradeCostText(estimate.totalGold, estimate.guildTokensRequired)}</strong></div><div><span>${escapeHtml(missingLabel)}</span><strong>${renderUpgradeCostText(estimate.missingGold, estimate.guildTokensMissing, estimate.guildTokenCreditExchangeRequired > 0)}</strong></div>${tokenExchangeNote}${autoTokenNote}${inventoryNote}${priceNote}</section>`;
    }

    function renderGuildTokenMaterialPlan(exchange, hasInventory, materialInventory, automatic) {
      const requiredGuildTokens = automatic ? exchange.spentGuildTokens : exchange.requiredGuildTokens;
      const detail = automatic
        ? t("autoGuildTokenCoverage", { count: formatNumber(exchange.coveredCredits) })
        : t("backpackInventory", {
            count: hasInventory
              ? formatNumber(Number(materialInventory && materialInventory["/items/guild_token"]) || 0)
              : t("notRead")
          });
      const needLabel = automatic ? t("autoGuildTokenExchangeNeeds") : t("guildTokenExchangeNeeds");
      return `<div class="mwi-material-plan-item" data-guide-item-hrid="/items/guild_token"><span class="mwi-material-plan-icon">${iconMarkup("/items/guild_token", itemNameForMaterial("/items/guild_token"))}</span><span><b>${escapeHtml(itemNameForMaterial("/items/guild_token"))}</b><small>${escapeHtml(detail)}</small></span></div><div class="mwi-material-plan-need"><small>${escapeHtml(needLabel)}</small><strong>${formatNumber(requiredGuildTokens)}</strong></div><span class="mwi-material-plan-rate">${escapeHtml(t("exchangeRate", { items: `${formatNumber(exchange.guildTokenCount)} ${t("guildTokens")}`, credits: creditQuantity(exchange.creditCount) }))}</span>`;
    }

    function renderOptimalMaterialPlan(plan, hasInventory, materialInventory) {
      if (!plan)
        return `<div class="mwi-material-plan-unavailable">${escapeHtml(t("optimalExchangeUnavailable"))}</div>`;
      return `<div class="mwi-material-plan-item" data-guide-item-hrid="${escapeHtml(plan.itemHrid)}"><span class="mwi-material-plan-icon">${marketItemIconMarkup(plan.itemHrid, itemNameForMaterial(plan.itemHrid))}</span><span><b>${escapeHtml(itemNameForMaterial(plan.itemHrid))}</b><small>${escapeHtml(t("backpackInventory", { count: hasInventory ? formatNumber(Number(materialInventory && materialInventory[plan.itemHrid]) || 0) : t("notRead") }))}</small></span></div><div class="mwi-material-plan-need"><small>${escapeHtml(t("optimalExchangeNeeds"))}</small><strong>${formatNumber(plan.requiredItems)}</strong></div><span class="mwi-material-plan-rate">${escapeHtml(t("exchangeRate", { items: itemQuantity(plan.itemCount), credits: creditQuantity(plan.creditCount) }))}</span>`;
    }

    function renderMaterialTotals(results, totals, estimate, hasInventory, creditMaterialPlans, materialInventory) {
      const planSummary = results
        .map((plan) => {
          const entry = guildBuffEntries().find((candidate) => candidate.hrid === plan.guildBuffHrid);
          const label = entry ? guildBuffLabel(entry.detail, entry.hrid) : plan.guildBuffHrid;
          return `<span>${escapeHtml(label)} ${plan.startLevel} -> ${plan.targetLevel}</span>`;
        })
        .join(`<span class="mwi-plan-separator">${ui().locale === "zh-CN" ? "，" : ", "}</span>`);
      const estimateRows = Object.fromEntries(((estimate && estimate.rows) || []).map((row) => [row.itemHrid, row]));
      const displayTotals =
        estimate && estimate.rows.length
          ? estimate.rows.map((row) => ({ itemHrid: row.itemHrid, count: row.required }))
          : totals;
      const materials = [...displayTotals]
        .sort(materialOrder)
        .map((item) => {
          const row = estimateRows[item.itemHrid];
          const inventoryText = row
            ? t("inventoryAndMissing", { owned: formatNumber(row.owned), missing: formatNumber(row.missing) })
            : t("inventoryNotRead");
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
              conversionPlans.push(
                `<div class="mwi-material-plan">${renderGuildTokenMaterialPlan(tokenExchange, hasInventory, materialInventory, false)}</div>`
              );
            } else {
              if (autoTokenExchange)
                conversionPlans.push(
                  `<div class="mwi-material-plan mwi-material-plan-auto">${renderGuildTokenMaterialPlan(autoTokenExchange, hasInventory, materialInventory, true)}</div>`
                );
              if ((row.remainingMissing ?? row.missing) > 0)
                conversionPlans.push(
                  `<div class="mwi-material-plan">${renderOptimalMaterialPlan(plan, hasInventory, materialInventory)}</div>`
                );
            }
          }
          if (row && row.missing <= 0 && isGuildCredit)
            conversionPlans.push(
              `<div class="mwi-material-plan-covered">✓ ${escapeHtml(t("inventoryCoveredNoExchange"))}</div>`
            );
          const rowClass = item.itemHrid === "/items/guild_token" ? " mwi-material-row-token" : "";
          const materialIcon =
            isGuildCredit || item.itemHrid === "/items/guild_token" || item.itemHrid === "/items/coin"
              ? iconMarkup(item.itemHrid, itemNameForMaterial(item.itemHrid))
              : marketItemIconMarkup(item.itemHrid, itemNameForMaterial(item.itemHrid));
          const guideMissing = row ? Math.max(0, Number(row.remainingMissing ?? row.missing) || 0) : 0;
          return `<article class="mwi-material-row${rowClass}" data-item-hrid="${escapeHtml(item.itemHrid)}" data-guide-missing="${escapeHtml(guideMissing)}" style="--mwi-material-accent:${accent}"><div class="mwi-material-credit">${materialIcon}<span class="mwi-material-copy"><span class="mwi-material-name">${escapeHtml(itemNameForMaterial(item.itemHrid))}</span><small>${escapeHtml(hasInventory ? inventoryText : t("inventoryNotRead"))}</small></span></div><div class="mwi-material-required"><small>${escapeHtml(t("requiredThisTime"))}</small><strong>${formatNumber(item.count)}</strong></div>${exchangeModeMarkup || '<span class="mwi-material-exchange-mode-spacer" aria-hidden="true"></span>'}<div class="mwi-material-plans">${conversionPlans.join("")}</div></article>`;
        })
        .join("");
      return `<div class="mwi-plan-summary">${planSummary}</div>${renderUpgradeCostSummary(estimate, hasInventory)}<div class="mwi-material-list">${materials}</div>`;
    }

    function shrineGuidePlans(entries) {
      const byHrid = new Map(entries.map((entry) => [entry.hrid, entry]));
      return state.upgradePlans.flatMap((plan) => {
        const entry = byHrid.get(plan.guildBuffHrid);
        if (!entry || !entry.detail || !entry.detail.shrineHrid) return [];
        return [
          {
            guildBuffHrid: entry.hrid,
            shrineHrid: entry.detail.shrineHrid,
            domain: isCombatGuildBuff(entry) ? "combat" : "life",
            label: guildBuffLabel(entry.detail, entry.hrid),
            currentLevel: currentGuildBuffLevel(entry),
            targetLevel: plan.targetLevel
          }
        ];
      });
    }

    function setShrineGuideContext(context) {
      state.shrineGuideContext = context;
      scheduleShrineGuide();
      scheduleGuildExchangeAdvisor(true);
    }

    async function refreshGuildUpgrade(panel) {
      const refreshId = ++state.upgradeRefreshId;
      updateGuildTokenCreditPlanButton(panel);
      refreshOfficialItemNameCatalog();
      const status = panel.querySelector('[data-role="upgrade-status"]');
      const results = panel.querySelector('[data-role="upgrade-results"]');
      const entries = guildBuffEntries();
      if (!entries.length) {
        setShrineGuideContext(null);
        updateGuildTokenBudgetControl(panel, null, false);
        status.textContent = t("noGuildRules");
        updateRenderedMarkup(results, "");
        return;
      }
      ensureGuildUpgradePlans(entries);
      renderGuildUpgradePlans(panel, entries);
      if (!state.upgradePlans.length) {
        const hasAvailableUpgrade = entries.some((entry) => currentGuildBuffLevel(entry) < entry.maxLevel);
        const emptyStatus =
          state.upgradePresetNotice || (hasAvailableUpgrade ? t("noUpgradePlans") : t("allBuffsMaxed"));
        const emptyMessage =
          state.upgradePresetNotice || (hasAvailableUpgrade ? t("noUpgradePlansHint") : t("noUpgradeMaterials"));
        setShrineGuideContext({ plans: [], estimate: { rows: [] }, creditMaterialPlans: {} });
        updateGuildTokenBudgetControl(panel, null, Array.isArray(state.characterItems));
        status.textContent = emptyStatus;
        updateRenderedMarkup(results, `<div class="mwi-empty">${escapeHtml(emptyMessage)}</div>`);
        return;
      }

      const result = core.aggregateGuildBuffPlans(
        state.upgradePlans.map((plan) => {
          const entry = entries.find((candidate) => candidate.hrid === plan.guildBuffHrid);
          return { ...plan, levelCosts: entry && entry.detail.levelCosts };
        })
      );
      if (result.status !== "ok") {
        setShrineGuideContext({ plans: shrineGuidePlans(entries), estimate: null, creditMaterialPlans: {} });
        const failed = result.result || {};
        status.textContent =
          failed.status === "missing_cost"
            ? t("missingLevelCost", { level: formatNumber(failed.missingLevel) })
            : t("invalidLevels");
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
      let guideEstimate = estimate;
      let guideCreditMaterialPlans = creditMaterialPlans;
      const activeGuidePlanInputs = state.upgradePlans.flatMap((plan) => {
        const entry = entries.find((candidate) => candidate.hrid === plan.guildBuffHrid);
        if (!entry) return [];
        const currentLevel = currentGuildBuffLevel(entry);
        if (currentLevel >= plan.targetLevel) return [];
        return [{ ...plan, startLevel: Math.max(currentLevel, plan.startLevel), levelCosts: entry.detail.levelCosts }];
      });
      if (
        activeGuidePlanInputs.length !== state.upgradePlans.length ||
        activeGuidePlanInputs.some((plan) => {
          const original = state.upgradePlans.find((candidate) => candidate.id === plan.id);
          return original && original.startLevel !== plan.startLevel;
        })
      ) {
        const guideResult = core.aggregateGuildBuffPlans(activeGuidePlanInputs);
        if (guideResult.status === "ok") {
          guideEstimate = core.estimateGuildUpgradeCosts(guideResult.totals, creditUnitCosts, materialInventory, {
            guildTokenCreditHrids: Array.from(state.guildTokenCreditHrids),
            guildTokenCreditConversions: GUILD_TOKEN_CREDIT_CONVERSIONS,
            autoAllocateSurplusGuildTokens: hasInventory,
            autoGuildTokenBudget: state.autoGuildTokenBudget
          });
          guideCreditMaterialPlans =
            !snapshotFailed && needsMarketSnapshot ? bestCreditMaterialPlans(guideEstimate) : null;
        } else {
          guideEstimate = null;
          guideCreditMaterialPlans = null;
        }
      }
      setShrineGuideContext({
        plans: shrineGuidePlans(entries),
        estimate: guideEstimate,
        creditMaterialPlans: guideCreditMaterialPlans || {}
      });
      const notices = [
        state.upgradePresetNotice ||
          (state.guildBuffLevels
            ? t("mergedUpgradePlans", { count: formatNumber(result.plans.length) })
            : t("unknownCurrentLevels"))
      ];
      const tokenSelection = guildTokenCreditSelectionState();
      if (tokenSelection.allSelected) notices.push(t("guildTokenCreditPlanActive"));
      else if (tokenSelection.partiallySelected)
        notices.push(t("guildTokenCreditPlanPartialActive", { count: formatNumber(tokenSelection.selectedCount) }));
      if (snapshotFailed) notices.push(t("snapshotFailed"));
      if (!hasInventory) notices.push(t("inventoryUnavailable"));
      status.textContent = notices.join(" ");
      updateRenderedMarkup(
        results,
        renderMaterialTotals(
          result.plans,
          result.totals,
          estimate,
          hasInventory,
          creditMaterialPlans,
          materialInventory
        )
      );
    }

    return {
      guildBuffEntries,
      guildBuffLabel,
      itemNameForMaterial,
      currentGuildBuffLevel,
      shrineLevelValue,
      shrineIdentityValues,
      applyGuildShrineTargets,
      updateGuildShrineTargetActions,
      addGuildUpgradePlan,
      ensureGuildUpgradePlans,
      clearGuildUpgradePlans,
      removeGuildUpgradePlan,
      guildTokenCreditSelectionState,
      updateGuildTokenCreditPlanButton,
      renderGuildTokenCreditPlanToggle,
      renderGuildTokenBudgetControl,
      setGuildTokenBudget,
      refreshGuildUpgrade
    };
  }

  return { createUpgradeView };
});


// SOURCE: src/ui/settings-view.js
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MwiGuildCreditSettingsView = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function createSettingsView(dependencies) {
    const { state, t, ui, escapeHtml, guildBuffEntries, guildBuffLabel, updateRenderedMarkup } = dependencies;

    function currentExcludedGuildBuffHrids() {
      const value = state.guildShrineAutofillExcludedBuffHrids;
      if (value instanceof Set) return value;
      return new Set(Array.isArray(value) ? value : []);
    }

    function guildBuffSettingsSnapshot() {
      const entries = guildBuffEntries()
        .filter((entry) => entry && entry.hrid && entry.detail)
        .sort((left, right) =>
          guildBuffLabel(left.detail, left.hrid).localeCompare(guildBuffLabel(right.detail, right.hrid), ui().locale)
        );
      return {
        entries,
        ready: entries.length > 0 || (state.guildBuffDetails !== null && state.guildBuffDetails !== undefined)
      };
    }

    function guildBuffInputId(entry) {
      return `mwi-settings-autofill-${String(entry.hrid).replace(/[^a-zA-Z0-9_-]+/g, "-")}`;
    }

    function renderGuildBuffOption(entry) {
      const id = guildBuffInputId(entry);
      const label = guildBuffLabel(entry.detail, entry.hrid);
      return `<label class="mwi-settings-option" for="${escapeHtml(id)}"><input id="${escapeHtml(id)}" data-role="settings-shrine-autofill" data-guild-buff-hrid="${escapeHtml(entry.hrid)}" type="checkbox"><span>${escapeHtml(label)}</span></label>`;
    }

    function renderGuildBuffDomain(domain, entries) {
      const combat = domain === "combat";
      const matching = entries.filter((entry) => (entry.detail && entry.detail.isCombat === true) === combat);
      return `<fieldset class="mwi-settings-domain" data-domain="${domain}"><legend>${escapeHtml(
        combat ? t("domainCombat") : t("domainLife")
      )}</legend><div class="mwi-settings-options">${matching.map(renderGuildBuffOption).join("")}</div></fieldset>`;
    }

    function renderShrineAutofillSettings(snapshot) {
      if (!snapshot.ready)
        return `<p class="mwi-settings-placeholder" data-role="settings-shrines-loading" role="status">${escapeHtml(
          t("settingsShrinesLoading")
        )}</p>`;
      if (!snapshot.entries.length)
        return `<p class="mwi-settings-placeholder" data-role="settings-shrines-empty" role="status">${escapeHtml(
          t("settingsShrinesEmpty")
        )}</p>`;
      return `<div class="mwi-settings-domains">${renderGuildBuffDomain(
        "life",
        snapshot.entries
      )}${renderGuildBuffDomain("combat", snapshot.entries)}</div>`;
    }

    function renderSettingsContent(snapshot) {
      return `<section class="mwi-settings-block" aria-labelledby="mwi-settings-autofill-heading"><div class="mwi-settings-block-heading"><h4 id="mwi-settings-autofill-heading">${escapeHtml(
        t("shrineAutofillRange")
      )}</h4><p>${escapeHtml(t("shrineAutofillRangeHint"))}</p></div>${renderShrineAutofillSettings(
        snapshot
      )}</section><section class="mwi-settings-block" aria-labelledby="mwi-settings-interface-heading"><div class="mwi-settings-block-heading"><h4 id="mwi-settings-interface-heading">${escapeHtml(
        t("interfaceVisibility")
      )}</h4></div><label class="mwi-settings-switch"><span class="mwi-settings-switch-copy"><strong>${escapeHtml(
        t("showConstructionView")
      )}</strong><small id="mwi-settings-construction-hint">${escapeHtml(
        t("showConstructionViewHint")
      )}</small></span><input class="mwi-settings-switch-input" data-role="settings-show-construction" type="checkbox" role="switch" aria-describedby="mwi-settings-construction-hint"></label></section>`;
    }

    function renderSettingsMarkup() {
      const snapshot = guildBuffSettingsSnapshot();
      const hidden = state.settingsOpen === true ? "" : " hidden";
      return `<section id="mwi-settings-panel" class="mwi-settings-panel" data-role="settings-panel" aria-labelledby="mwi-settings-title" tabindex="-1"${hidden}><header class="mwi-settings-header"><span><h3 id="mwi-settings-title">${escapeHtml(
        t("interfaceSettings")
      )}</h3><p>${escapeHtml(t("interfaceSettingsHint"))}</p></span><button class="mwi-settings-close" data-role="settings-close" type="button" title="${escapeHtml(
        t("closeInterfaceSettings")
      )}" aria-label="${escapeHtml(t("closeInterfaceSettings"))}">×</button></header><div class="mwi-settings-content" data-role="settings-content">${renderSettingsContent(
        snapshot
      )}</div><p class="mwi-settings-status" data-role="settings-status" role="status" aria-live="polite" aria-atomic="true"></p></section>`;
    }

    function refreshSettings(panel) {
      if (!panel || typeof panel.querySelector !== "function") return null;
      const settingsPanel =
        (typeof panel.matches === "function" && panel.matches('[data-role="settings-panel"]') && panel) ||
        panel.querySelector('[data-role="settings-panel"]');
      if (!settingsPanel) return null;
      settingsPanel.hidden = state.settingsOpen !== true;
      const content = settingsPanel.querySelector('[data-role="settings-content"]');
      const snapshot = guildBuffSettingsSnapshot();
      updateRenderedMarkup(content, renderSettingsContent(snapshot));
      const excludedHrids = currentExcludedGuildBuffHrids();
      for (const input of settingsPanel.querySelectorAll('[data-role="settings-shrine-autofill"]'))
        input.checked = !excludedHrids.has(input.dataset.guildBuffHrid);
      const constructionInput = settingsPanel.querySelector('[data-role="settings-show-construction"]');
      if (constructionInput) constructionInput.checked = state.showConstructionView !== false;
      return settingsPanel;
    }

    return { renderSettingsMarkup, refreshSettings };
  }

  return { createSettingsView };
});


// SOURCE: src/ui/shrine-guide-ui.js
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MwiGuildCreditShrineGuideUi = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function shrineGuideAutofillQuantity(step) {
    const quantity = Number(step && step.suggestedCredits);
    return Number.isSafeInteger(quantity) && quantity >= 0 ? quantity : null;
  }

  function setNativeInputValue(input, value) {
    if (!input) return false;
    const nextValue = String(value);
    if (String(input.value) === nextValue) return false;
    const view = (input.ownerDocument && input.ownerDocument.defaultView) || globalThis;
    const prototype = view.HTMLInputElement && view.HTMLInputElement.prototype;
    const descriptor = prototype && Object.getOwnPropertyDescriptor(prototype, "value");
    if (descriptor && descriptor.set) descriptor.set.call(input, nextValue);
    else input.value = nextValue;
    const EventConstructor = view.Event || Event;
    input.dispatchEvent(new EventConstructor("input", { bubbles: true }));
    input.dispatchEvent(new EventConstructor("change", { bubbles: true }));
    return true;
  }

  function createShrineGuideUi(dependencies) {
    const {
      state,
      document,
      window,
      stylesApi,
      t,
      ui,
      formatNumber,
      itemNameForMaterial,
      CREDIT_TYPES,
      shrineGuideApi,
      refreshGuildUpgrade,
      persistPluginUiState,
      scheduleGuildExchangeAdvisor,
      guildExchangeMutationObserver,
      findGuildExchangeModal
    } = dependencies;

    const SHRINE_GUIDE_STYLE_ID = "mwi-shrine-guide-native-style";
    const SHRINE_GUIDE_QUANTITY_HINT_ID = "mwi-shrine-guide-quantity-hint";
    let autofillInput = null;
    let autofillSignature = "";

    function ensureShrineGuideStyle() {
      if (document.getElementById(SHRINE_GUIDE_STYLE_ID)) return;
      const style = document.createElement("style");
      style.id = SHRINE_GUIDE_STYLE_ID;
      style.textContent = stylesApi.shrineGuideStyles(SHRINE_GUIDE_QUANTITY_HINT_ID);
      (document.head || document.documentElement).append(style);
    }

    function clearShrineGuideHighlights() {
      for (const node of state.shrineGuideObservedNodes) {
        if (!node || !node.removeAttribute) continue;
        node.removeAttribute("data-mwi-shrine-guide");
        if (node.style) node.style.removeProperty("--mwi-guide-color");
      }
      state.shrineGuideObservedNodes.clear();
    }

    function removeShrineGuideQuantityHint() {
      const hint = document.getElementById(SHRINE_GUIDE_QUANTITY_HINT_ID);
      const input = hint && hint.__mwiGuideQuantityInput;
      if (input && input.getAttribute) {
        const ids = String(input.getAttribute("aria-describedby") || "")
          .split(/\s+/)
          .filter((id) => id && id !== SHRINE_GUIDE_QUANTITY_HINT_ID);
        if (ids.length) input.setAttribute("aria-describedby", ids.join(" "));
        else input.removeAttribute("aria-describedby");
      }
      if (hint) hint.remove();
      const visualHint = state.exchangeAdvisorUi && state.exchangeAdvisorUi.quantityHint;
      if (visualHint && !visualHint.hidden) {
        visualHint.hidden = true;
        scheduleGuildExchangeAdvisor();
      }
    }

    function resetShrineGuideAutofill() {
      autofillInput = null;
      autofillSignature = "";
    }

    function prefillShrineGuideQuantityInput(modal, step) {
      const input = modal && modal.quantityInput;
      const quantity = shrineGuideAutofillQuantity(step);
      if (!input || !input.isConnected || quantity === null) return false;
      const signature = [step.creditItemHrid, step.recommendedItemHrid, quantity].join(":");
      if (autofillInput === input && autofillSignature === signature) return false;
      autofillInput = input;
      autofillSignature = signature;
      return setNativeInputValue(input, quantity);
    }

    function shrineGuideQuantityRow(modal) {
      const input = modal && modal.quantityInput;
      const surface = modal && modal.element;
      if (!input || !surface || !surface.contains(input)) return null;
      const targetQuantityGroup = input.closest && input.closest('[class*="GuildPanel_quantityInputs"]');
      if (targetQuantityGroup && surface.contains(targetQuantityGroup)) return targetQuantityGroup;
      let fallback = input.parentElement;
      let candidate = fallback;
      for (let depth = 0; candidate && candidate !== surface && depth < 4; depth += 1) {
        if (candidate.querySelectorAll("input").length === 1 && candidate.querySelector("button")) return candidate;
        candidate = candidate.parentElement;
      }
      return fallback && fallback !== surface ? fallback : input.parentElement;
    }

    function shrineGuideQuantityInputIsTopmost(modal) {
      const input = modal && modal.quantityInput;
      if (!visibleGuideNode(input) || typeof document.elementFromPoint !== "function")
        return Boolean(input && input.isConnected);
      const rect = input.getBoundingClientRect();
      const x = Math.max(
        0,
        Math.min((document.documentElement.clientWidth || window.innerWidth) - 1, rect.left + rect.width / 2)
      );
      const y = Math.max(
        0,
        Math.min((document.documentElement.clientHeight || window.innerHeight) - 1, rect.top + rect.height / 2)
      );
      const topNode = document.elementFromPoint(x, y);
      return topNode === input || Boolean(topNode && topNode.closest && topNode.closest("input") === input);
    }

    function updateShrineGuideQuantityHint(modal, step, color) {
      const input = modal && modal.quantityInput;
      const quantityRow = shrineGuideQuantityRow(modal);
      if (
        !input ||
        !input.isConnected ||
        !quantityRow ||
        !step ||
        !Number.isSafeInteger(step.suggestedBatches) ||
        step.suggestedBatches < 0 ||
        !shrineGuideQuantityInputIsTopmost(modal)
      ) {
        removeShrineGuideQuantityHint();
        return;
      }
      ensureShrineGuideStyle();
      let hint = document.getElementById(SHRINE_GUIDE_QUANTITY_HINT_ID);
      if (!hint) {
        hint = document.createElement("aside");
        hint.id = SHRINE_GUIDE_QUANTITY_HINT_ID;
        hint.setAttribute("role", "status");
        hint.setAttribute("aria-live", "polite");
      }
      if (hint.previousElementSibling !== quantityRow || hint.parentElement !== quantityRow.parentElement)
        quantityRow.insertAdjacentElement("afterend", hint);
      if (hint.__mwiGuideQuantityInput && hint.__mwiGuideQuantityInput !== input) {
        const previous = hint.__mwiGuideQuantityInput;
        const previousIds = String(previous.getAttribute("aria-describedby") || "")
          .split(/\s+/)
          .filter((id) => id && id !== SHRINE_GUIDE_QUANTITY_HINT_ID);
        if (previousIds.length) previous.setAttribute("aria-describedby", previousIds.join(" "));
        else previous.removeAttribute("aria-describedby");
      }
      hint.__mwiGuideQuantityInput = input;
      const describedBy = new Set(
        String(input.getAttribute("aria-describedby") || "")
          .split(/\s+/)
          .filter(Boolean)
      );
      describedBy.add(SHRINE_GUIDE_QUANTITY_HINT_ID);
      input.setAttribute("aria-describedby", Array.from(describedBy).join(" "));
      const suggestedBatches = formatNumber(step.suggestedBatches);
      const limited = step.suggestedBatches < step.batches;
      const detail =
        step.method === "guild_token"
          ? t("guideTokenQuantityDetail", {
              batches: suggestedBatches,
              items: formatNumber(step.suggestedItems)
            })
          : limited
            ? t("guideQuantityCurrentExchange", { count: suggestedBatches })
            : "";
      const planSummary = t("guideQuantityPlanSummary", {
        item: itemNameForMaterial(step.recommendedItemHrid),
        items: formatNumber(step.requiredItems),
        credit: itemNameForMaterial(step.creditItemHrid),
        credits: formatNumber(step.actualCredits)
      });
      const accessibleText = detail ? `${planSummary} ${detail}` : planSummary;
      setGuideText(hint, accessibleText);
      hint.setAttribute("aria-label", accessibleText);

      const advisorUi = state.exchangeAdvisorUi;
      const visualHint = advisorUi && advisorUi.quantityHint;
      if (!visualHint) return;
      advisorUi.surface.style.setProperty("--credit", color || "#63e6c8");
      setGuideText(visualHint.querySelector('[data-role="quantity-hint-summary"]'), planSummary);
      const detailNode = visualHint.querySelector('[data-role="quantity-hint-detail"]');
      detailNode.hidden = !detail;
      setGuideText(detailNode, detail);
      visualHint.hidden = false;
      scheduleGuildExchangeAdvisor();
    }

    function markShrineGuideNode(node, role, color) {
      if (!node || !node.setAttribute) return false;
      node.setAttribute("data-mwi-shrine-guide", role);
      if (node.style) node.style.setProperty("--mwi-guide-color", color || "#63e6c8");
      state.shrineGuideObservedNodes.add(node);
      return true;
    }

    function guideCreditColor(itemHrid) {
      return CREDIT_TYPES.find(([candidate]) => candidate === itemHrid)?.[1] || "#63e6c8";
    }

    function visibleGuideNode(node) {
      if (!node || !node.isConnected || node.closest("#mwi-credit-optimizer")) return false;
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    }

    function nativeUseNodes(fragment) {
      return Array.from(document.querySelectorAll("use")).filter((use) => {
        const href = use.getAttribute("href") || use.getAttribute("xlink:href") || "";
        return href.endsWith(`#${fragment}`);
      });
    }

    function nativeCreditCards(itemHrid) {
      const fragment = String(itemHrid || "")
        .split("/")
        .pop();
      return nativeUseNodes(fragment).flatMap((use) => {
        const tile = use.closest('[class*="GuildPanel_guildTile"]');
        return tile && visibleGuideNode(tile) ? [tile] : [];
      });
    }

    function nativeRecommendedItems(itemHrid) {
      const fragment = String(itemHrid || "")
        .split("/")
        .pop();
      return nativeUseNodes(fragment).flatMap((use) => {
        const item = use.closest('[class*="Item_item"]');
        const exchangeSurface =
          item &&
          item.closest('[class*="GuildPanel_exchangeModalContent"],[class*="Modal_modal"],[class*="ItemSelector"]');
        return item && exchangeSurface && visibleGuideNode(item) ? [item] : [];
      });
    }

    function nativeShrineCards(plan) {
      const fragment = `guild_shrine_${String(plan.shrineHrid || "")
        .split("/")
        .pop()}`;
      const domainAliases =
        plan.domain === "combat" ? [t("domainCombat"), "Combat"] : [t("domainLife"), "Life", "Skilling"];
      const cards = nativeUseNodes(fragment).flatMap((use) => {
        const tile = use.closest('[class*="GuildPanel_guildTile"]');
        return tile && visibleGuideNode(tile) ? [tile] : [];
      });
      const exact = cards.filter((card) =>
        domainAliases.some((alias) => String(card.textContent || "").includes(alias))
      );
      return exact.length ? exact : cards;
    }

    function nativeGuildTab(aliases) {
      return (
        Array.from(document.querySelectorAll('[role="tab"]')).find(
          (tab) => aliases.includes(String(tab.textContent || "").trim()) && visibleGuideNode(tab)
        ) || null
      );
    }

    function guideAttributeSelectorValue(value) {
      if (window.CSS && typeof window.CSS.escape === "function") return window.CSS.escape(String(value || ""));
      return String(value || "")
        .replaceAll("\\", "\\\\")
        .replaceAll('"', '\\"');
    }

    function shrineGuideStatusCopy(model) {
      if (!model || model.status === "inactive") return { title: t("guideReady"), detail: t("guideReadyHint") };
      if (model.status === "no_plans") return { title: t("guideNoPlans"), detail: t("guideNoPlansHint") };
      if (model.status === "loading") return { title: t("guideLoading"), detail: t("guideLoadingHint") };
      if (model.status === "complete") return { title: t("guideComplete"), detail: t("guideCompleteHint") };
      if (model.status === "choose_credit") {
        const names = model.missingCredits
          .map((step) => itemNameForMaterial(step.creditItemHrid))
          .join(ui().locale === "zh-CN" ? "、" : ", ");
        return {
          title: t("guideMissingCredits", { count: formatNumber(model.missingCredits.length) }),
          detail: t("guideMissingCreditsHint", { items: names })
        };
      }
      if (model.status === "choose_item") {
        const step = model.activeCredit;
        return {
          title: t("guideChooseItem", { item: itemNameForMaterial(step.recommendedItemHrid) }),
          detail: t("guideChooseItemHint", { credit: itemNameForMaterial(step.creditItemHrid) })
        };
      }
      if (model.status === "set_quantity") {
        const step = model.activeCredit;
        const limited = step.suggestedBatches < step.batches;
        return {
          title: t("guideSetQuantity", { count: formatNumber(step.suggestedBatches) }),
          detail: limited
            ? t("guideSetQuantityLimitHint", {
                remaining: formatNumber(step.batches),
                max: formatNumber(step.maxBatches)
              })
            : t("guideSetQuantityHint", {
                items: formatNumber(step.suggestedItems),
                item: itemNameForMaterial(step.recommendedItemHrid),
                credits: formatNumber(step.suggestedCredits)
              })
        };
      }
      if (model.status === "use_guild_token") {
        const step = model.activeCredit;
        return {
          title: t("guideUseGuildTokens", { count: formatNumber(step.requiredItems) }),
          detail: t("guideUseGuildTokensHint", { credit: itemNameForMaterial(step.creditItemHrid) })
        };
      }
      if (model.status === "unavailable") return { title: t("guideUnavailable"), detail: t("guideUnavailableHint") };
      if (model.status === "blocked") {
        const items = model.blockers
          .map((item) => `${itemNameForMaterial(item.itemHrid)} × ${formatNumber(item.missing)}`)
          .join(ui().locale === "zh-CN" ? "、" : ", ");
        return { title: t("guideBlocked"), detail: t("guideBlockedHint", { items }) };
      }
      const names = model.targetPlans.map((plan) => plan.label).join(ui().locale === "zh-CN" ? "、" : ", ");
      return { title: t("guideUpgradeShrine"), detail: t("guideUpgradeShrineHint", { shrines: names }) };
    }

    function setGuideText(node, value) {
      if (node && node.textContent !== value) node.textContent = value;
    }

    function updateShrineGuideUi(model) {
      const panel = state.panel;
      if (!panel) return;
      const route = panel.querySelector('[data-role="shrine-guide-route"]');
      const button = panel.querySelector('[data-role="toggle-shrine-guide"]');
      if (!route || !button) return;
      const copy = shrineGuideStatusCopy(model);
      route.dataset.active = String(state.shrineGuideEnabled);
      route.dataset.status = (model && model.status) || "inactive";
      button.setAttribute("aria-pressed", String(state.shrineGuideEnabled));
      setGuideText(
        button.querySelector("span:last-child"),
        state.shrineGuideEnabled ? t("guideDisable") : t("guideEnable")
      );
      setGuideText(route.querySelector('[data-role="shrine-guide-title"]'), copy.title);
      setGuideText(route.querySelector('[data-role="shrine-guide-detail"]'), copy.detail);
    }

    function applyShrineGuide(model, modal) {
      clearShrineGuideHighlights();
      updateShrineGuideUi(model);
      if (!state.shrineGuideEnabled || !model || model.status !== "set_quantity") {
        resetShrineGuideAutofill();
        removeShrineGuideQuantityHint();
      }
      if (!state.shrineGuideEnabled || !model || ["inactive", "no_plans", "complete"].includes(model.status)) return;
      ensureShrineGuideStyle();

      for (const plan of model.targetPlans) {
        const selector = `.mwi-upgrade-plan[data-guild-buff-hrid="${guideAttributeSelectorValue(plan.guildBuffHrid)}"]`;
        markShrineGuideNode(
          state.panel && state.panel.querySelector(selector),
          model.status === "upgrade_shrine" ? "active" : "goal",
          "#9b8cff"
        );
        for (const card of nativeShrineCards(plan))
          markShrineGuideNode(card, model.status === "upgrade_shrine" ? "active" : "goal", "#9b8cff");
      }

      let foundNativeCredit = false;
      for (const step of model.missingCredits) {
        const active = model.activeCredit && model.activeCredit.creditItemHrid === step.creditItemHrid;
        const role = active ? "active" : "pending";
        const color = guideCreditColor(step.creditItemHrid);
        const selector = `.mwi-material-row[data-item-hrid="${guideAttributeSelectorValue(step.creditItemHrid)}"]`;
        markShrineGuideNode(state.panel && state.panel.querySelector(selector), role, color);
        for (const card of nativeCreditCards(step.creditItemHrid)) {
          foundNativeCredit = true;
          markShrineGuideNode(card, role, color);
        }
      }

      if (model.missingCredits.length && !foundNativeCredit && !modal) {
        markShrineGuideNode(nativeGuildTab([t("nativeGuildShopTab"), "Shop"]), "active", "#63e6c8");
      }
      if (model.activeCredit) {
        const step = model.activeCredit;
        const color = guideCreditColor(step.creditItemHrid);
        const pluginItem =
          state.panel &&
          state.panel.querySelector(
            `[data-guide-item-hrid="${guideAttributeSelectorValue(step.recommendedItemHrid)}"]`
          );
        markShrineGuideNode(pluginItem, "active", color);
        if (step.recommendedItemHrid) {
          for (const item of nativeRecommendedItems(step.recommendedItemHrid))
            markShrineGuideNode(item, "active", color);
        }
        if (model.status === "set_quantity" && modal && modal.quantityInput) {
          markShrineGuideNode(modal.quantityInput, "active", color);
          prefillShrineGuideQuantityInput(modal, step);
          updateShrineGuideQuantityHint(modal, step, color);
        }
      }
      if (model.status === "upgrade_shrine" && !model.targetPlans.some((plan) => nativeShrineCards(plan).length)) {
        markShrineGuideNode(nativeGuildTab([t("nativeGuildShopTab"), "Shop"]), "active", "#9b8cff");
      }
    }

    function refreshShrineGuide() {
      const modal = findGuildExchangeModal();
      const context = state.shrineGuideContext || {};
      const model = shrineGuideApi.deriveShrineGuide({
        enabled: state.shrineGuideEnabled,
        plans: context.plans || [],
        estimate: context.estimate || null,
        creditMaterialPlans: context.creditMaterialPlans || {},
        creditOrder: CREDIT_TYPES.map(([itemHrid]) => itemHrid),
        characterItems: state.characterItems,
        modal
      });
      state.shrineGuideModel = model;
      applyShrineGuide(model, modal);
    }

    function scheduleShrineGuide() {
      if (state.shrineGuideFrame !== null) return;
      const requestFrame =
        typeof window.requestAnimationFrame === "function"
          ? window.requestAnimationFrame.bind(window)
          : (handler) => window.setTimeout(handler, 0);
      state.shrineGuideFrame = requestFrame(() => {
        state.shrineGuideFrame = null;
        refreshShrineGuide();
      });
    }

    function guideMutationMayMatter(node) {
      if (!node || node.nodeType !== 1) return false;
      if (node.id === "mwi-credit-optimizer" || (node.closest && node.closest("#mwi-credit-optimizer"))) return true;
      const selector =
        '[class*="GuildPanel_guildTile"],[class*="GuildPanel_exchangeModalContent"],[class*="Modal_modal"],[class*="ItemSelector"],[class*="Item_item"],[role="tab"]';
      if (node.matches && node.matches(selector)) return true;
      return Boolean(node.querySelector && node.querySelector(selector));
    }

    function guideInteractionMayMatter(target) {
      if (!target || typeof target.closest !== "function") return false;
      return Boolean(
        target.closest(
          '#mwi-credit-optimizer,[class*="GuildPanel"],[class*="Modal_modal"],[class*="ItemSelector"],[role="tab"]'
        )
      );
    }

    function startShrineGuideObserver() {
      ensureShrineGuideStyle();
      if (document.body && !state.shrineGuideObserver) {
        const Observer = guildExchangeMutationObserver();
        if (Observer) {
          state.shrineGuideObserver = new Observer((mutations) => {
            if (
              mutations.some((mutation) =>
                [...Array.from(mutation.addedNodes || []), ...Array.from(mutation.removedNodes || [])].some(
                  guideMutationMayMatter
                )
              )
            )
              scheduleShrineGuide();
          });
          state.shrineGuideObserver.observe(document.body, { childList: true, subtree: true });
        }
      }
      if (!state.shrineGuideDocumentListenersInstalled) {
        const schedule = (event) => {
          if (state.shrineGuideEnabled && guideInteractionMayMatter(event.target)) scheduleShrineGuide();
        };
        const schedulePosition = () => {
          if (state.shrineGuideEnabled) scheduleShrineGuide();
        };
        document.addEventListener("click", schedule, true);
        document.addEventListener("input", schedule, true);
        document.addEventListener("change", schedule, true);
        document.addEventListener("scroll", schedulePosition, true);
        window.addEventListener("resize", schedulePosition, true);
        state.shrineGuideDocumentHandlers = { schedule, schedulePosition };
        state.shrineGuideDocumentListenersInstalled = true;
      }
    }

    function stopShrineGuideObserver() {
      if (state.shrineGuideObserver) state.shrineGuideObserver.disconnect();
      state.shrineGuideObserver = null;
      if (state.shrineGuideDocumentHandlers) {
        const { schedule, schedulePosition } = state.shrineGuideDocumentHandlers;
        document.removeEventListener("click", schedule, true);
        document.removeEventListener("input", schedule, true);
        document.removeEventListener("change", schedule, true);
        document.removeEventListener("scroll", schedulePosition, true);
        window.removeEventListener("resize", schedulePosition, true);
      }
      state.shrineGuideDocumentHandlers = null;
      state.shrineGuideDocumentListenersInstalled = false;
      clearShrineGuideHighlights();
      removeShrineGuideQuantityHint();
    }

    function setShrineGuideEnabled(panel, enabled) {
      state.shrineGuideEnabled = enabled === true;
      persistPluginUiState();
      if (state.shrineGuideEnabled) {
        startShrineGuideObserver();
        scheduleShrineGuide();
        refreshGuildUpgrade(panel);
      } else {
        stopShrineGuideObserver();
        scheduleShrineGuide();
      }
      scheduleGuildExchangeAdvisor(true);
    }

    return {
      scheduleShrineGuide,
      startShrineGuideObserver,
      stopShrineGuideObserver,
      setShrineGuideEnabled
    };
  }

  return { createShrineGuideUi, shrineGuideAutofillQuantity, setNativeInputValue };
});


// SOURCE: src/ui/exchange-advisor.js
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MwiGuildCreditExchangeAdvisor = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function guildExchangeQuantityInputs(element) {
    if (!element || typeof element.querySelectorAll !== "function") return { paymentInput: null, quantityInput: null };
    const containers = Array.from(element.querySelectorAll('[class*="GuildPanel_inputContainer"]'));
    const fields = containers
      .map((container) => {
        const input = container.querySelector("input");
        const label = container.querySelector('[class*="GuildPanel_label"]');
        return {
          input,
          label: String((label && label.textContent) || "")
            .replaceAll("\n", " ")
            .trim()
        };
      })
      .filter((field) => field.input);
    if (fields.length) {
      const targetField = fields.find((field) => /你获得|\byou\s+(?:receive|get)\b/i.test(field.label));
      const paymentField = fields.find((field) => /你支付|\byou\s+pay\b/i.test(field.label));
      return {
        paymentInput: (paymentField && paymentField.input) || (fields.length > 1 ? fields[0].input : null),
        quantityInput: (targetField && targetField.input) || fields[fields.length - 1].input
      };
    }
    const legacyInput =
      element.querySelector('input[type="number"]') ||
      element.querySelector('input[inputmode="numeric"]') ||
      element.querySelector('input[type="text"]');
    return { paymentInput: null, quantityInput: legacyInput || null };
  }

  function guildExchangeBatches(modalData, conversion) {
    const itemCount = Number(conversion && conversion.itemCount);
    const creditCount = Number(conversion && conversion.creditCount);
    const paymentQuantity = Number(modalData && modalData.paymentQuantity);
    const targetQuantity = Number(modalData && modalData.targetQuantity);
    if (
      Number.isSafeInteger(paymentQuantity) &&
      paymentQuantity > 0 &&
      Number.isSafeInteger(itemCount) &&
      itemCount > 0 &&
      paymentQuantity % itemCount === 0
    )
      return paymentQuantity / itemCount;
    if (
      Number.isSafeInteger(targetQuantity) &&
      targetQuantity > 0 &&
      Number.isSafeInteger(creditCount) &&
      creditCount > 0 &&
      targetQuantity % creditCount === 0
    )
      return targetQuantity / creditCount;
    const fallback = Number(modalData && modalData.batches);
    return Number.isSafeInteger(fallback) && fallback > 0 ? fallback : 1;
  }

  function inputMaximum(input) {
    if (!input) return null;
    const attributeValue = input.getAttribute && input.getAttribute("max");
    const raw = String(
      attributeValue === null || attributeValue === undefined ? input.max || "" : attributeValue
    ).trim();
    if (!raw) return null;
    const value = Number(raw);
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  }

  function createExchangeAdvisor(dependencies) {
    const {
      state,
      document,
      window,
      pageWindow,
      stylesApi,
      CREDIT_TYPES,
      SELLER_TAX_RATE,
      t,
      escapeHtml,
      formatNumber,
      itemNameForMaterial,
      itemHridFromIcon,
      enhancementLevelFromIcon,
      itemQuantity,
      creditQuantity,
      iconMarkup,
      priceReference,
      core,
      loadSnapshot,
      snapshotOrderBook,
      snapshotImmediateSellPrice,
      snapshotPrice,
      allConversions,
      exchangeAdvisorFrameTask
    } = dependencies;

    function isVisible(node) {
      const modal = (node && node.closest && node.closest('[class*="Modal_modal"]')) || node;
      if (!modal || !modal.isConnected || modal.hidden || modal.getAttribute("aria-hidden") === "true") return false;
      const rect = modal.getBoundingClientRect();
      const style = getComputedStyle(modal);
      const opacity = Number(style.opacity);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        style.pointerEvents !== "none" &&
        (!Number.isFinite(opacity) || opacity > 0.01)
      );
    }

    function findGuildExchangeModal() {
      const candidates = Array.from(document.querySelectorAll('[class*="GuildPanel_exchangeModalContent"]')).filter(
        isVisible
      );
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
        const { paymentInput, quantityInput } = guildExchangeQuantityInputs(element);
        const paymentQuantity = Number(paymentInput && paymentInput.value);
        const targetQuantity = Number(quantityInput && quantityInput.value);
        const maxTargetQuantity = inputMaximum(quantityInput);
        if (!credit) continue;
        return {
          element,
          modal,
          creditItemHrid: credit.itemHrid,
          selectedItemHrid: (selected && selected.itemHrid) || null,
          selectedEnhancementLevel: (selected && selected.enhancementLevel) || 0,
          paymentInput,
          paymentQuantity: Number.isSafeInteger(paymentQuantity) && paymentQuantity > 0 ? paymentQuantity : null,
          quantityInput,
          targetQuantity: Number.isSafeInteger(targetQuantity) && targetQuantity > 0 ? targetQuantity : null,
          maxTargetQuantity,
          batches: Number.isSafeInteger(targetQuantity) && targetQuantity > 0 ? targetQuantity : 1
        };
      }
      return null;
    }

    const GUILD_EXCHANGE_ADVISOR_HOST_ID = "mwi-guild-exchange-advisor-host";

    function createGuildExchangeAdvisorUi() {
      if (!document.body || state.exchangeAdvisorUi) return state.exchangeAdvisorUi;
      if (document.getElementById(GUILD_EXCHANGE_ADVISOR_HOST_ID)) return null;
      const host = document.createElement("div");
      host.id = GUILD_EXCHANGE_ADVISOR_HOST_ID;
      const shadow = host.attachShadow({ mode: "open" });
      shadow.innerHTML = `<style>${stylesApi.GUILD_EXCHANGE_ADVISOR_STYLES}</style><div class="advisor-stack" data-role="advisor-stack" hidden><aside class="advisor" data-role="advisor" aria-live="polite" hidden></aside><aside class="guide-quantity" data-role="quantity-guide" aria-hidden="true" hidden><span class="guide-quantity-summary" data-role="quantity-hint-summary"></span><small class="guide-quantity-detail" data-role="quantity-hint-detail" hidden></small></aside></div>`;
      document.body.append(host);
      state.exchangeAdvisorUi = {
        host,
        shadow,
        surface: shadow.querySelector('[data-role="advisor-stack"]'),
        card: shadow.querySelector('[data-role="advisor"]'),
        quantityHint: shadow.querySelector('[data-role="quantity-guide"]'),
        signature: "",
        modal: null
      };
      return state.exchangeAdvisorUi;
    }

    function hideGuildExchangeAdvisor(modalData) {
      const ui = state.exchangeAdvisorUi;
      if (!ui) return;
      ui.card.hidden = true;
      ui.signature = "";
      const modal = (modalData && modalData.modal) || null;
      if (modal && ui.quantityHint && !ui.quantityHint.hidden) {
        ui.modal = modal;
        observeActiveGuildExchangeModal(modal);
        positionGuildExchangeAdvisor(ui, modal);
        return;
      }
      ui.surface.hidden = true;
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
      if (modalRect.right + gap + width <= window.innerWidth - margin)
        return { placement: "right", left: modalRect.right + gap, top: clampTop(modalRect.top) };
      if (modalRect.left - gap - width >= margin)
        return { placement: "left", left: modalRect.left - gap - width, top: clampTop(modalRect.top) };
      if (modalRect.bottom + gap + height <= window.innerHeight - margin)
        return {
          placement: "bottom",
          left: clampLeft(modalRect.left + (modalRect.width - width) / 2),
          top: modalRect.bottom + gap
        };
      if (modalRect.top - gap - height >= margin)
        return {
          placement: "top",
          left: clampLeft(modalRect.left + (modalRect.width - width) / 2),
          top: modalRect.top - gap - height
        };
      return {
        placement: "overlay",
        left: clampLeft(modalRect.left + (modalRect.width - width) / 2),
        top: clampTop(window.innerHeight - height - margin)
      };
    }

    function positionGuildExchangeAdvisor(ui, modal) {
      const surface = ui && ui.surface;
      if (!surface) return false;
      if (!modal || !modal.isConnected || !isVisible(modal)) {
        surface.hidden = true;
        return false;
      }
      if (ui.card.hidden && ui.quantityHint.hidden) {
        surface.hidden = true;
        return false;
      }
      const wasHidden = surface.hidden;
      if (wasHidden) {
        surface.style.visibility = "hidden";
        surface.hidden = false;
      }
      const modalRect = modal.getBoundingClientRect();
      const surfaceRect = surface.getBoundingClientRect();
      if (modalRect.width <= 0 || modalRect.height <= 0 || surfaceRect.width <= 0 || surfaceRect.height <= 0) {
        surface.hidden = true;
        surface.style.removeProperty("visibility");
        return false;
      }
      const position = calculateGuildExchangeAdvisorPosition(modalRect, surfaceRect);
      surface.dataset.placement = position.placement;
      ui.card.dataset.placement = position.placement;
      surface.style.left = `${Math.round(position.left)}px`;
      surface.style.top = `${Math.round(position.top)}px`;
      surface.hidden = false;
      surface.style.removeProperty("visibility");
      return true;
    }

    function advisorOptionMarkup(label, option, details, best) {
      const primary = details
        ? `${formatNumber(details.credits)}<small>${escapeHtml(t("credits"))}</small>`
        : `${core.formatCompactCost(option.costPerCredit)}<small>${escapeHtml(t("goldPerCredit"))}</small>`;
      const first = details
        ? [details.firstLabel, details.firstValue]
        : [
            t("singleExchange"),
            t("exchangeRate", { items: itemQuantity(option.itemCount), credits: creditQuantity(option.creditCount) })
          ];
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
      else if (comparison && data.replacement.creditDifference > 0)
        summary = t("sellAndBuyMore", {
          count: formatNumber(data.replacement.creditDifference),
          credit: escapeHtml(data.creditName)
        });
      else if (comparison && data.replacement.creditDifference < 0)
        summary = t("directMore", {
          count: formatNumber(-data.replacement.creditDifference),
          credit: escapeHtml(data.creditName)
        });
      else if (comparison) summary = t("sameCredits");
      const selected = comparison
        ? advisorOptionMarkup(t("selected"), data.selected, {
            credits: data.replacement.directCredits,
            firstLabel: t("directExchange"),
            firstValue: t("exchangeRate", {
              items: itemQuantity(data.replacement.sale.quantity),
              credits: creditQuantity(data.replacement.directCredits)
            }),
            secondLabel: t("afterTax"),
            secondValue: `${core.formatCompactCost(data.replacement.sale.net)} ${t("gold")}`
          })
        : "";
      const best = advisorOptionMarkup(
        data.selectedOptimal ? t("selectedOptimal") : t("bestItem"),
        data.best,
        comparison
          ? {
              credits: data.replacement.best.actualCredits,
              firstLabel: t("buybackExchange"),
              firstValue: t("exchangeRate", {
                items: itemQuantity(data.replacement.best.requiredItems),
                credits: creditQuantity(data.replacement.best.actualCredits)
              }),
              secondLabel: t("purchaseCost"),
              secondValue: `${core.formatCompactCost(data.replacement.best.cost)} ${t("gold")}`
            }
          : null,
        true
      );
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
      ui.card.hidden = false;
      ui.modal = modalData.modal;
      observeActiveGuildExchangeModal(modalData.modal);
      ui.card.setAttribute("aria-label", t("exchangeRecommendation"));
      ui.surface.style.setProperty("--credit", data.color);
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
        hideGuildExchangeAdvisor(modalData);
        return false;
      }

      if (!state.snapshot) {
        hideGuildExchangeAdvisor(modalData);
        if (state.exchangeAdvisorSnapshotFailed) return;
        if (!state.exchangeAdvisorLoadInFlight) {
          state.exchangeAdvisorLoadInFlight = true;
          loadSnapshot(false)
            .catch(() => {
              state.exchangeAdvisorSnapshotFailed = true;
              return null;
            })
            .finally(() => {
              state.exchangeAdvisorLoadInFlight = false;
              scheduleGuildExchangeAdvisor(true);
            });
        }
        return false;
      }

      const books = Object.fromEntries(
        conversions.map((conversion) => [conversion.itemHrid, snapshotOrderBook(conversion.itemHrid)])
      );
      let best = core.rankConversions(conversions, books, 1).find((result) => result.status === "ok");
      if (!best) {
        hideGuildExchangeAdvisor(modalData);
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
          const buyPrices = Object.fromEntries(
            conversions.map((conversion) => [
              conversion.itemHrid,
              snapshotPrice(conversion.itemHrid, state.priceReference)
            ])
          );
          replacement = core.estimateSaleReplacement({
            selectedConversion,
            batches: guildExchangeBatches(modalData, selectedConversion),
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
            unavailableReason =
              replacement.status === "no_affordable_conversion"
                ? t("noAffordableReplacement", { gold: `${core.formatCompactCost(replacement.sale.net)} ${t("gold")}` })
                : t("noSellPrice");
            replacement = null;
          } else {
            selected = selectedConversion;
          }
        }
      }
      const creditName = itemNameForMaterial(modalData.creditItemHrid);
      return renderGuildExchangeAdvisor(
        modalData,
        {
          creditName,
          color: CREDIT_TYPES.find(([hrid]) => hrid === modalData.creditItemHrid)?.[1] || "#4fcdb5",
          best: replacement ? replacement.best : best,
          selected,
          selectedOptimal,
          replacement,
          unavailableReason
        },
        forceRender
      );
    }

    function scheduleGuildExchangeAdvisor(forceRender) {
      if (!state.exchangeAdvisorUi) return;
      exchangeAdvisorFrameTask.schedule(Boolean(forceRender));
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
        if (
          Array.from(mutations || []).some((mutation) =>
            Array.from(mutation.addedNodes || []).some(nodeMayContainGuildExchangeModal)
          )
        ) {
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
        state.exchangeAdvisorRepositionHandler = reposition;
        state.exchangeAdvisorListenersInstalled = true;
      }
      scheduleGuildExchangeAdvisor(true);
    }

    function startGuildExchangeAdvisor() {
      if (!createGuildExchangeAdvisorUi()) return;
      watchGuildExchangeModals();
      scheduleGuildExchangeAdvisor(true);
    }

    return {
      findGuildExchangeModal,
      refreshGuildExchangeAdvisor,
      scheduleGuildExchangeAdvisor,
      guildExchangeMutationObserver,
      startGuildExchangeAdvisor
    };
  }

  return { createExchangeAdvisor, guildExchangeQuantityInputs, guildExchangeBatches, inputMaximum };
});


// SOURCE: src/ui/panel-shell.js
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MwiGuildCreditPanelShell = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const NUMBER_STEP_REPEAT_DELAY_MS = 450;
  const NUMBER_STEP_REPEAT_INTERVAL_MS = 90;

  function createPanelShell(dependencies) {
    const {
      state,
      document,
      stylesApi,
      sortableApi,
      t,
      escapeHtml,
      PANEL_VIEWS,
      DEFAULT_PANEL_ORDER,
      CREDIT_TYPES,
      FALLBACK_INSTALL_URL,
      priceReference,
      normalizePanelView,
      persistPluginUiState,
      checkPluginUpdate,
      refreshPanel,
      refreshGuildUpgrade,
      refreshGuildConstruction,
      refreshGuildExchangeAdvisor,
      renderSettingsMarkup,
      refreshSettings,
      renderGuildTokenCreditPlanToggle,
      renderGuildTokenBudgetControl,
      updateGuildTokenCreditPlanButton,
      setGuildTokenBudget,
      setShrineGuideEnabled,
      guildBuffEntries,
      currentGuildBuffLevel,
      applyGuildShrineTargets,
      addGuildUpgradePlan,
      clearGuildUpgradePlans,
      removeGuildUpgradePlan,
      guildTokenCreditSelectionState,
      guildBuildingDefinitions,
      addGuildBuildingPlan,
      setGuildBuildingTarget,
      removeGuildBuildingPlan,
      moveGuildBuildingPlan,
      reorderGuildBuildingPlan,
      setGuildBuildingPickerOpen,
      setPendingGuildBuildingStartValue,
      clearPendingGuildBuilding,
      toggleGuildBuildingSteps,
      clearGuildBuildingPlans,
      undoClearGuildBuildingPlans,
      hasGuildBuildingClearUndo,
      applyGuildBuildingFilters,
      refreshGuildConstructionBudgetPreview,
      copyGuildConstructionPlan,
      exportGuildConstructionCsv,
      persistGuildBuildingPlannerState,
      setPriceReference,
      openMarketplaceForItem
    } = dependencies;
    const sortableControllers = [];
    const numberStepperCleanups = [];

    const panelViewLabels = {
      upgrade: "shrineUpgrade",
      credit: "creditValue",
      construction: "guildConstruction"
    };

    function panelViewEnabled(view) {
      return view !== "construction" || state.showConstructionView !== false;
    }

    function normalizedPanelOrder() {
      state.panelOrder = sortableApi.normalizeOrder(state.panelOrder, PANEL_VIEWS, DEFAULT_PANEL_ORDER);
      return state.panelOrder;
    }

    function visiblePanelOrder() {
      return normalizedPanelOrder().filter(panelViewEnabled);
    }

    function nearestVisiblePanelView(view) {
      const order = normalizedPanelOrder();
      const index = order.indexOf(view);
      for (let distance = 1; distance < order.length; distance += 1) {
        const after = order[index + distance];
        if (after && panelViewEnabled(after)) return after;
        const before = order[index - distance];
        if (before && panelViewEnabled(before)) return before;
      }
      return visiblePanelOrder()[0] || "credit";
    }

    function renderPanelTabs() {
      return normalizedPanelOrder()
        .map(
          (view) =>
            `<span class="mwi-view-tab-item" data-sort-key="${view}"${panelViewEnabled(view) ? "" : " hidden"}><button id="mwi-view-tab-${view}" class="mwi-view-tab${state.activeView === view ? " mwi-view-tab-active" : ""}" data-role="view-${view}" role="tab" aria-controls="mwi-view-panel-${view}" aria-selected="${String(state.activeView === view)}" tabindex="${state.activeView === view ? "0" : "-1"}" type="button">${escapeHtml(t(panelViewLabels[view]))}</button></span>`
        )
        .join("");
    }

    function reorderPanelView(panel, view, targetIndex) {
      const visibleOrder = visiblePanelOrder();
      const nextOrder = sortableApi.reorderVisibleByIndex(state.panelOrder, visibleOrder, view, targetIndex);
      if (nextOrder.every((candidate, index) => candidate === state.panelOrder[index])) return false;
      state.panelOrder = nextOrder;
      const tabList = panel.querySelector(".mwi-view-tabs");
      for (const candidate of state.panelOrder) {
        const item = tabList.querySelector(`[data-sort-key="${candidate}"]`);
        if (item) tabList.append(item);
      }
      persistPluginUiState();
      updatePanelOrderButtons(panel);
      return true;
    }

    function updatePanelOrderButtons(panel) {
      const visibleOrder = visiblePanelOrder();
      const index = visibleOrder.indexOf(state.activeView);
      const previous = panel.querySelector('[data-role="move-active-view"][data-direction="-1"]');
      const next = panel.querySelector('[data-role="move-active-view"][data-direction="1"]');
      if (previous) previous.disabled = index <= 0;
      if (next) next.disabled = index < 0 || index >= visibleOrder.length - 1;
    }

    function syncPanelViewVisibility(panel) {
      for (const candidate of PANEL_VIEWS) {
        const enabled = panelViewEnabled(candidate);
        const item = panel.querySelector(`.mwi-view-tab-item[data-sort-key="${candidate}"]`);
        const tab = panel.querySelector(`[data-role="view-${candidate}"]`);
        const content = panel.querySelector(`[data-role="${candidate}-view"]`);
        if (item) item.hidden = !enabled;
        if (!enabled && tab) {
          tab.setAttribute("aria-selected", "false");
          tab.setAttribute("tabindex", "-1");
          tab.classList.remove("mwi-view-tab-active");
        }
        if (!enabled && content) content.hidden = true;
      }
      updatePanelOrderButtons(panel);
    }

    function findConstructionControl(panel, target) {
      if (!target || !target.role) return null;
      return Array.from(panel.querySelectorAll(`[data-role="${target.role}"]`)).find((element) => {
        if (target.buildingHrid && element.dataset.buildingHrid !== target.buildingHrid) return false;
        if (target.direction !== undefined && element.dataset.direction !== String(target.direction)) return false;
        if (target.delta !== undefined && element.dataset.delta !== String(target.delta)) return false;
        return !element.disabled && !element.hidden && !element.closest("[hidden]");
      });
    }

    function focusConstructionControl(panel, target, reveal = true) {
      const control = findConstructionControl(panel, target);
      if (!control) return false;
      try {
        control.focus({ preventScroll: true });
      } catch (_) {
        control.focus();
      }
      if (reveal && typeof control.scrollIntoView === "function") {
        control.scrollIntoView({ block: "nearest", inline: "nearest" });
        const controlRect = control.getBoundingClientRect();
        const panelRect = panel.getBoundingClientRect();
        const viewportHeight = document.defaultView ? document.defaultView.innerHeight : panelRect.bottom;
        const visibleTop = Math.max(0, panelRect.top);
        const visibleBottom = Math.min(viewportHeight, panelRect.bottom);
        if (controlRect.top < visibleTop) panel.scrollTop += controlRect.top - visibleTop;
        else if (controlRect.bottom > visibleBottom) panel.scrollTop += controlRect.bottom - visibleBottom;
      }
      return true;
    }

    function refreshConstructionAndFocus(panel, target, fallbackTarget = null) {
      refreshGuildConstruction(panel);
      return focusConstructionControl(panel, target) || focusConstructionControl(panel, fallbackTarget);
    }

    function setGuildPointBudgetValidity(panel, input, valid) {
      const error = panel.querySelector("#mwi-guild-point-budget-error");
      if (valid) input.removeAttribute("aria-invalid");
      else input.setAttribute("aria-invalid", "true");
      if (error) error.hidden = valid;
    }

    function guildPointBudgetInputValue(input) {
      const raw = input.value.trim();
      if (raw === "") return { valid: true, value: null };
      const value = Number(raw);
      return Number.isSafeInteger(value) && value >= 0
        ? { valid: true, value }
        : { valid: false, value: state.manualGuildPoints };
    }

    function clearConstructionNotice(panel) {
      state.buildingPlanNotice = "";
      const status = panel.querySelector('[data-role="construction-status"]');
      const statusText = status && status.querySelector('[data-role="construction-status-text"]');
      if (statusText) statusText.textContent = "";
      if (status) status.hidden = !hasGuildBuildingClearUndo();
    }

    function setPanelView(panel, view) {
      const selectedView = normalizePanelView(view);
      if (!panelViewEnabled(selectedView)) return false;
      for (const candidate of PANEL_VIEWS) {
        const content = panel.querySelector(`[data-role="${candidate}-view"]`);
        const tab = panel.querySelector(`[data-role="view-${candidate}"]`);
        const active = candidate === selectedView;
        if (content) content.hidden = !active;
        if (tab) {
          tab.setAttribute("aria-selected", String(active));
          tab.setAttribute("tabindex", active ? "0" : "-1");
          tab.classList.toggle("mwi-view-tab-active", active);
        }
      }
      panel.dataset.activeView = selectedView;
      state.activeView = selectedView;
      const persisted = persistPluginUiState();
      updatePanelOrderButtons(panel);
      if (selectedView === "upgrade") refreshGuildUpgrade(panel);
      else if (selectedView === "construction") refreshGuildConstruction(panel);
      else refreshPanel(panel);
      return persisted;
    }

    function setSettingsStatus(panel, key) {
      const status = panel.querySelector('[data-role="settings-status"]');
      if (status) {
        status.textContent = key ? t(key) : "";
        status.dataset.error = String(key === "settingsSaveFailed");
      }
    }

    function setSettingsOpen(panel, open, { restoreFocus = false } = {}) {
      state.settingsOpen = Boolean(open);
      const trigger = panel.querySelector('[data-role="toggle-settings"]');
      const settings = panel.querySelector('[data-role="settings-panel"]');
      if (settings) settings.hidden = !state.settingsOpen;
      if (trigger) {
        trigger.setAttribute("aria-expanded", String(state.settingsOpen));
        const label = t(state.settingsOpen ? "closeInterfaceSettings" : "openInterfaceSettings");
        trigger.setAttribute("aria-label", label);
        trigger.setAttribute("title", label);
      }
      if (state.settingsOpen) {
        const refreshedSettings = refreshSettings(panel);
        const firstControl =
          refreshedSettings &&
          (refreshedSettings.querySelector('[data-role="settings-shrine-autofill"]') ||
            refreshedSettings.querySelector('[data-role="settings-show-construction"]') ||
            refreshedSettings.querySelector('[data-role="settings-close"]'));
        if (firstControl) {
          try {
            firstControl.focus({ preventScroll: true });
          } catch (_) {
            firstControl.focus();
          }
          if (typeof firstControl.scrollIntoView === "function")
            firstControl.scrollIntoView({ block: "nearest", inline: "nearest" });
        }
      }
      if (restoreFocus && trigger) trigger.focus();
    }

    function setConstructionViewVisibility(panel, visible) {
      state.showConstructionView = Boolean(visible);
      if (!state.showConstructionView && state.activeView === "construction") {
        setPanelView(panel, nearestVisiblePanelView("construction"));
      }
      syncPanelViewVisibility(panel);
      const persisted = persistPluginUiState();
      setSettingsStatus(
        panel,
        persisted === false
          ? "settingsSaveFailed"
          : state.showConstructionView
            ? "constructionViewShown"
            : "constructionViewHidden"
      );
    }

    function updatePriceReferenceButtons(panel) {
      for (const button of panel.querySelectorAll('[data-role="price-reference"]')) {
        const active = button.dataset.priceReference === state.priceReference;
        button.dataset.active = String(active);
        button.setAttribute("aria-pressed", String(active));
      }
    }

    function maxItemUnitPriceMillionsValue() {
      return Number.isSafeInteger(state.maxConversionItemUnitPrice) && state.maxConversionItemUnitPrice > 0
        ? String(state.maxConversionItemUnitPrice / 1_000_000)
        : "";
    }

    function setMaxItemUnitPriceError(panel, key = "") {
      const input = panel.querySelector('[data-role="max-item-unit-price-millions"]');
      const error = panel.querySelector('[data-role="max-item-unit-price-error"]');
      if (!input || !error) return;
      const hasError = Boolean(key);
      input.setAttribute("aria-invalid", String(hasError));
      error.hidden = !hasError;
      error.textContent = hasError ? t(key) : "";
    }

    function parseMaxItemUnitPrice(input) {
      const rawValue = String(input.value || "").trim();
      if (!rawValue) return { valid: true, value: null };
      const millions = Number(rawValue);
      const coins = Math.round(millions * 1_000_000);
      return !Number.isFinite(millions) || millions <= 0 || !Number.isSafeInteger(coins) || coins <= 0
        ? { valid: false, value: null }
        : { valid: true, value: coins };
    }

    function applyMaxItemUnitPrice(panel, input) {
      const parsed = parseMaxItemUnitPrice(input);
      if (!parsed.valid) {
        setMaxItemUnitPriceError(panel, "maxItemUnitPriceInvalid");
        return false;
      }
      const nextValue = parsed.value;
      state.maxConversionItemUnitPrice = nextValue;
      const persisted = persistPluginUiState();
      setMaxItemUnitPriceError(panel, persisted === false ? "maxItemUnitPriceSaveFailed" : "");
      refreshPanel(panel);
      refreshGuildUpgrade(panel);
      refreshGuildExchangeAdvisor(true);
      return true;
    }

    function numberInputForStepButton(panel, button) {
      const inputRole = button.dataset.inputRole;
      return inputRole === "target" || inputRole === "max-item-unit-price-millions"
        ? panel.querySelector(`[data-role="${inputRole}"]`)
        : null;
    }

    function dispatchNumberInputChange(input) {
      const EventConstructor = input.ownerDocument.defaultView.Event;
      input.dispatchEvent(new EventConstructor("change", { bubbles: true }));
    }

    function adjustNumberInput(panel, button, { commit = true } = {}) {
      const input = numberInputForStepButton(panel, button);
      const direction = Number(button.dataset.direction);
      const step = Number(input && input.step);
      if (!input || (direction !== -1 && direction !== 1) || !Number.isFinite(step) || step <= 0) return false;

      const rawValue = String(input.value || "").trim();
      const min = input.min === "" ? null : Number(input.min);
      const max = input.max === "" ? null : Number(input.max);
      if (!rawValue) {
        if (direction < 0) return false;
        input.value = String(min !== null && Number.isFinite(min) ? min : step);
      } else {
        const current = Number(rawValue);
        if (!Number.isFinite(current)) return false;
        let next = current + direction * step;
        if (min !== null && Number.isFinite(min)) next = Math.max(min, next);
        if (max !== null && Number.isFinite(max)) next = Math.min(max, next);
        if (next === current) return false;
        input.value = String(next);
      }

      const EventConstructor = input.ownerDocument.defaultView.Event;
      input.dispatchEvent(new EventConstructor("input", { bubbles: true }));
      if (commit) dispatchNumberInputChange(input);
      return true;
    }

    function bindNumberStepperControls(panel) {
      const controls = panel.querySelector(".mwi-controls");
      const view = document.defaultView;
      let activeButton = null;
      let activeInput = null;
      let activePointerId = null;
      let adjusted = false;
      let repeatDelayTimer = null;
      let repeatIntervalTimer = null;

      function clearRepeatTimers() {
        if (repeatDelayTimer !== null) view.clearTimeout(repeatDelayTimer);
        if (repeatIntervalTimer !== null) view.clearInterval(repeatIntervalTimer);
        repeatDelayTimer = null;
        repeatIntervalTimer = null;
      }

      function finishNumberStep(event = null, { commit = true } = {}) {
        if (event && activePointerId !== null && event.pointerId !== activePointerId) return;
        clearRepeatTimers();
        const input = activeInput;
        const shouldCommit = commit && adjusted && input;
        if (activeButton) delete activeButton.dataset.pressed;
        activeButton = null;
        activeInput = null;
        activePointerId = null;
        adjusted = false;
        if (shouldCommit) dispatchNumberInputChange(input);
      }

      function finishPointerStep(event) {
        if (!activeButton || (activePointerId !== null && event.pointerId !== activePointerId)) return;
        finishNumberStep(event);
      }

      function finishBlurredStep() {
        finishNumberStep();
      }

      controls.addEventListener("pointerdown", (event) => {
        const button = event.target.closest('[data-role="number-step"]');
        if (!button || button.disabled || event.button !== 0 || event.isPrimary === false) return;
        finishNumberStep();
        event.preventDefault();
        activeButton = button;
        activeInput = numberInputForStepButton(panel, button);
        activePointerId = event.pointerId;
        button.dataset.pressed = "true";
        try {
          button.focus({ preventScroll: true });
        } catch (_) {
          button.focus();
        }
        try {
          button.setPointerCapture(event.pointerId);
        } catch (_) {
          // Synthetic events and older browsers can reject pointer capture; local listeners still handle release.
        }
        adjusted = adjustNumberInput(panel, button, { commit: false });
        repeatDelayTimer = view.setTimeout(() => {
          repeatDelayTimer = null;
          repeatIntervalTimer = view.setInterval(() => {
            adjusted = adjustNumberInput(panel, button, { commit: false }) || adjusted;
          }, NUMBER_STEP_REPEAT_INTERVAL_MS);
        }, NUMBER_STEP_REPEAT_DELAY_MS);
      });

      controls.addEventListener("lostpointercapture", finishPointerStep);
      controls.addEventListener("contextmenu", (event) => {
        if (event.target.closest('[data-role="number-step"]')) event.preventDefault();
      });
      controls.addEventListener("click", (event) => {
        const button = event.target.closest('[data-role="number-step"]');
        if (!button || event.detail !== 0) return;
        adjustNumberInput(panel, button);
      });
      view.addEventListener("pointerup", finishPointerStep, true);
      view.addEventListener("pointercancel", finishPointerStep, true);
      view.addEventListener("blur", finishBlurredStep);

      return () => {
        finishNumberStep();
        view.removeEventListener("pointerup", finishPointerStep, true);
        view.removeEventListener("pointercancel", finishPointerStep, true);
        view.removeEventListener("blur", finishBlurredStep);
      };
    }

    function createPanel() {
      const savedActiveView = state.activeView;
      normalizedPanelOrder();
      if (!panelViewEnabled(state.activeView)) state.activeView = nearestVisiblePanelView(state.activeView);
      const panel = document.createElement("section");
      panel.id = "mwi-credit-optimizer";
      panel.dataset.activeView = state.activeView;
      panel.innerHTML = `
        <style>
          ${stylesApi.PANEL_STYLES}
        </style>
        <h3>${escapeHtml(t("panelTitle"))}</h3>
        <div class="mwi-plugin-version" data-role="version-status" aria-live="polite"></div>
        <div class="mwi-view-tabs-shell">
          <div class="mwi-view-tabs" role="tablist" aria-label="${escapeHtml(t("panelViewOrder"))}">${renderPanelTabs()}</div>
          <div class="mwi-view-order-actions" role="group" aria-label="${escapeHtml(t("panelViewOrder"))}"><button class="mwi-icon-button mwi-icon-left" data-role="move-active-view" data-direction="-1" type="button" aria-label="${escapeHtml(t("moveViewLeft"))}" title="${escapeHtml(t("moveViewLeft"))}"></button><button class="mwi-icon-button mwi-icon-right" data-role="move-active-view" data-direction="1" type="button" aria-label="${escapeHtml(t("moveViewRight"))}" title="${escapeHtml(t("moveViewRight"))}"></button></div>
          <button class="mwi-icon-button mwi-settings-trigger" data-role="toggle-settings" type="button" aria-expanded="${String(state.settingsOpen)}" aria-controls="mwi-settings-panel" aria-label="${escapeHtml(t(state.settingsOpen ? "closeInterfaceSettings" : "openInterfaceSettings"))}" title="${escapeHtml(t(state.settingsOpen ? "closeInterfaceSettings" : "openInterfaceSettings"))}"><span aria-hidden="true">&#9881;</span></button>
        </div>
        ${renderSettingsMarkup()}
        <div id="mwi-view-panel-credit" data-role="credit-view" role="tabpanel" aria-labelledby="mwi-view-tab-credit"${state.activeView === "credit" ? "" : " hidden"}>
          <div class="mwi-controls">
            <div class="mwi-number-field"><label for="mwi-target-credit">${escapeHtml(t("targetCredits"))}</label><span class="mwi-number-stepper mwi-target-credit-stepper"><input id="mwi-target-credit" data-role="target" type="number" min="1" step="100" inputmode="numeric" value="${state.targetCredit}"><span class="mwi-stepper-buttons"><button class="mwi-stepper-button mwi-stepper-up" data-role="number-step" data-input-role="target" data-direction="1" type="button" aria-label="${escapeHtml(t("increaseTargetCredits"))}" title="${escapeHtml(t("increaseTargetCredits"))}"><svg viewBox="0 0 16 10" aria-hidden="true"><path d="M2 8 8 2l6 6"></path></svg></button><button class="mwi-stepper-button mwi-stepper-down" data-role="number-step" data-input-role="target" data-direction="-1" type="button" aria-label="${escapeHtml(t("decreaseTargetCredits"))}" title="${escapeHtml(t("decreaseTargetCredits"))}"><svg viewBox="0 0 16 10" aria-hidden="true"><path d="M2 2l6 6 6-6"></path></svg></button></span></span></div>
            <div class="mwi-price-reference" role="group" aria-label="${escapeHtml(t("marketReference"))}"><span class="mwi-price-reference-label">${escapeHtml(t("priceReference"))}</span><button data-role="price-reference" data-price-reference="a" type="button" title="${escapeHtml(priceReference("a").title)}">${escapeHtml(priceReference("a").label)}</button><button data-role="price-reference" data-price-reference="b" type="button" title="${escapeHtml(priceReference("b").title)}">${escapeHtml(priceReference("b").label)}</button></div>
            <button data-role="refresh" type="button">${escapeHtml(t("refreshEstimate"))}</button>
            <div class="mwi-price-limit-control">
              <div class="mwi-price-limit" title="${escapeHtml(t("maxItemUnitPriceHint"))}"><span>${escapeHtml(t("maxItemUnitPricePrefix"))}</span><span class="mwi-number-stepper mwi-price-limit-stepper"><input data-role="max-item-unit-price-millions" type="number" min="10" step="10" inputmode="decimal" value="${escapeHtml(maxItemUnitPriceMillionsValue())}" placeholder="${escapeHtml(t("maxItemUnitPricePlaceholder"))}" aria-label="${escapeHtml(t("maxItemUnitPriceInput"))}" aria-describedby="mwi-max-item-unit-price-error" aria-invalid="false"><span class="mwi-stepper-buttons"><button class="mwi-stepper-button mwi-stepper-up" data-role="number-step" data-input-role="max-item-unit-price-millions" data-direction="1" type="button" aria-label="${escapeHtml(t("increaseMaxItemUnitPrice"))}" title="${escapeHtml(t("increaseMaxItemUnitPrice"))}"><svg viewBox="0 0 16 10" aria-hidden="true"><path d="M2 8 8 2l6 6"></path></svg></button><button class="mwi-stepper-button mwi-stepper-down" data-role="number-step" data-input-role="max-item-unit-price-millions" data-direction="-1" type="button" aria-label="${escapeHtml(t("decreaseMaxItemUnitPrice"))}" title="${escapeHtml(t("decreaseMaxItemUnitPrice"))}"><svg viewBox="0 0 16 10" aria-hidden="true"><path d="M2 2l6 6 6-6"></path></svg></button></span></span><span>${escapeHtml(t("maxItemUnitPriceSuffix"))}</span></div>
              <small id="mwi-max-item-unit-price-error" class="mwi-price-limit-error" data-role="max-item-unit-price-error" role="status" aria-live="polite" hidden></small>
            </div>
          </div>
          <div class="mwi-status" data-role="status">${escapeHtml(t("waitingExchangeRules"))}</div>
          <div data-role="results"></div>
        </div>
        <div id="mwi-view-panel-upgrade" data-role="upgrade-view" role="tabpanel" aria-labelledby="mwi-view-tab-upgrade"${state.activeView === "upgrade" ? "" : " hidden"}>
          <section class="mwi-upgrade-planner" aria-label="${escapeHtml(t("guildShrineBatchPlan"))}">
            <div class="mwi-upgrade-preset">
              <div class="mwi-upgrade-preset-copy"><strong>${escapeHtml(t("guildShrineBatchPlan"))}</strong><small data-role="guild-shrine-target-status" role="status" aria-live="polite">${escapeHtml(t("shrineLevelsReading"))}</small></div>
              <div class="mwi-upgrade-preset-buttons"><button data-role="set-guild-shrine-target" data-domain="life" type="button">${escapeHtml(t("setGuildLifeTarget"))}</button><button data-role="set-guild-shrine-target" data-domain="combat" type="button">${escapeHtml(t("setGuildCombatTarget"))}</button></div>
            </div>
            <div class="mwi-upgrade-plan-list" data-role="upgrade-plan-list"></div>
            <div class="mwi-upgrade-actions"><small data-role="upgrade-plan-count">${escapeHtml(t("selectedUpgradePlanCount", { count: "0" }))}</small><span><button data-role="add-upgrade-plan" type="button">＋ ${escapeHtml(t("addShrine"))}</button><button class="mwi-clear-upgrade-plans" data-role="clear-upgrade-plans" type="button">${escapeHtml(t("clearAll"))}</button></span></div>
          </section>
          <section class="mwi-shrine-guide-route" data-role="shrine-guide-route" data-active="${String(state.shrineGuideEnabled)}" data-status="inactive" aria-live="polite">
            <button class="mwi-shrine-guide-toggle" data-role="toggle-shrine-guide" type="button" aria-pressed="${String(state.shrineGuideEnabled)}"><span class="mwi-shrine-guide-beacon" aria-hidden="true"></span><span>${escapeHtml(state.shrineGuideEnabled ? t("guideDisable") : t("guideEnable"))}</span></button>
            <span class="mwi-shrine-guide-copy"><strong data-role="shrine-guide-title">${escapeHtml(t("guideReady"))}</strong><small data-role="shrine-guide-detail">${escapeHtml(t("guideReadyHint"))}</small></span>
          </section>
          ${renderGuildTokenBudgetControl()}
          ${renderGuildTokenCreditPlanToggle()}
          <div class="mwi-status" data-role="upgrade-status">${escapeHtml(t("waitingUpgradeRules"))}</div>
          <div data-role="upgrade-results"></div>
        </div>
        <div id="mwi-view-panel-construction" data-role="construction-view" role="tabpanel" aria-labelledby="mwi-view-tab-construction"${state.activeView === "construction" ? "" : " hidden"}>
          <div class="mwi-status mwi-construction-status" data-role="construction-status" hidden><span data-role="construction-status-text" role="status" aria-live="polite" aria-atomic="true"></span><button data-role="undo-clear-building-plans" type="button" hidden>${escapeHtml(t("undoClearBuildingPlans"))}</button></div>
          <div data-role="construction-results"></div>
        </div>
        <footer class="mwi-plugin-footer">${escapeHtml(t("author"))}<br>${escapeHtml(t("support"))}<br><a href="${escapeHtml(FALLBACK_INSTALL_URL)}" target="_blank" rel="noopener noreferrer">${escapeHtml(t("fallbackInstaller"))}</a></footer>`;
      panel.querySelector('[data-role="refresh"]').addEventListener("click", () => refreshPanel(panel, true));
      const numberStepperCleanup = bindNumberStepperControls(panel);
      panel.__mwiNumberStepperCleanup = numberStepperCleanup;
      numberStepperCleanups.push(numberStepperCleanup);
      panel.querySelector('[data-role="target"]').addEventListener("change", (event) => {
        const target = Number(event.target.value);
        if (Number.isSafeInteger(target) && target > 0) state.targetCredit = target;
        else event.target.value = String(state.targetCredit);
        persistPluginUiState();
        refreshPanel(panel);
      });
      const maxItemUnitPriceInput = panel.querySelector('[data-role="max-item-unit-price-millions"]');
      maxItemUnitPriceInput.addEventListener("input", (event) => {
        setMaxItemUnitPriceError(panel, parseMaxItemUnitPrice(event.target).valid ? "" : "maxItemUnitPriceInvalid");
      });
      maxItemUnitPriceInput.addEventListener("change", (event) => {
        applyMaxItemUnitPrice(panel, event.target);
      });
      maxItemUnitPriceInput.addEventListener("blur", (event) => {
        const inputValue = String(event.target.value || "").trim();
        if (inputValue === maxItemUnitPriceMillionsValue() && event.target.getAttribute("aria-invalid") !== "true")
          return;
        applyMaxItemUnitPrice(panel, event.target);
      });
      const settingsTrigger = panel.querySelector('[data-role="toggle-settings"]');
      const settingsPanel = panel.querySelector('[data-role="settings-panel"]');
      settingsTrigger.addEventListener("click", () => setSettingsOpen(panel, !state.settingsOpen));
      settingsPanel.querySelector('[data-role="settings-close"]').addEventListener("click", () => {
        setSettingsOpen(panel, false, { restoreFocus: true });
      });
      settingsPanel.addEventListener("keydown", (event) => {
        if (event.key !== "Escape" || !state.settingsOpen) return;
        event.preventDefault();
        event.stopPropagation();
        setSettingsOpen(panel, false, { restoreFocus: true });
      });
      settingsPanel.addEventListener("change", (event) => {
        if (event.target.matches('[data-role="settings-shrine-autofill"]')) {
          const guildBuffHrid = event.target.dataset.guildBuffHrid;
          if (!guildBuffEntries().some((entry) => entry.hrid === guildBuffHrid)) return;
          if (event.target.checked) state.guildShrineAutofillExcludedBuffHrids.delete(guildBuffHrid);
          else state.guildShrineAutofillExcludedBuffHrids.add(guildBuffHrid);
          const persisted = persistPluginUiState();
          setSettingsStatus(panel, persisted === false ? "settingsSaveFailed" : "settingsSaved");
          if (state.activeView === "upgrade") refreshGuildUpgrade(panel);
          return;
        }
        if (event.target.matches('[data-role="settings-show-construction"]')) {
          setConstructionViewVisibility(panel, event.target.checked);
        }
      });
      panel.querySelector(".mwi-price-reference").addEventListener("click", (event) => {
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
        const section = toggle && toggle.closest("[data-credit-item-hrid]");
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
      panel
        .querySelector('[data-role="view-construction"]')
        .addEventListener("click", () => setPanelView(panel, "construction"));
      panel.querySelector(".mwi-view-order-actions").addEventListener("click", (event) => {
        const button = event.target.closest('[data-role="move-active-view"]');
        if (!button) return;
        const index = visiblePanelOrder().indexOf(state.activeView);
        reorderPanelView(panel, state.activeView, index + Number(button.dataset.direction));
      });
      updatePanelOrderButtons(panel);
      panel.querySelector(".mwi-view-tabs").addEventListener("keydown", (event) => {
        if (event.altKey) return;
        const tabs = Array.from(panel.querySelectorAll(".mwi-view-tab-item:not([hidden]) .mwi-view-tab"));
        const current = event.target.closest(".mwi-view-tab");
        const index = tabs.indexOf(current);
        if (index < 0) return;
        let nextIndex = index;
        if (event.key === "ArrowLeft") nextIndex = (index - 1 + tabs.length) % tabs.length;
        else if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
        else if (event.key === "Home") nextIndex = 0;
        else if (event.key === "End") nextIndex = tabs.length - 1;
        else return;
        event.preventDefault();
        tabs[nextIndex].focus();
        setPanelView(panel, tabs[nextIndex].dataset.role.replace("view-", ""));
      });
      const constructionResults = panel.querySelector('[data-role="construction-results"]');
      constructionResults.addEventListener("input", (event) => {
        if (event.target.matches('[data-role="guild-point-budget"]')) {
          const parsed = guildPointBudgetInputValue(event.target);
          setGuildPointBudgetValidity(panel, event.target, parsed.valid);
          if (!parsed.valid) return;
          state.manualGuildPoints = parsed.value;
          clearConstructionNotice(panel);
          refreshGuildConstructionBudgetPreview(panel);
          return;
        }
        if (event.target.matches('[data-role="pending-building-start-level"]')) {
          setPendingGuildBuildingStartValue(event.target.value);
          event.target.removeAttribute("aria-invalid");
          const error = panel.querySelector("#mwi-pending-building-level-error");
          if (error) error.hidden = true;
          return;
        }
        if (event.target.matches('[data-role="building-search"]')) {
          state.buildingSearch = event.target.value;
          applyGuildBuildingFilters(constructionResults);
        }
      });
      constructionResults.addEventListener("change", (event) => {
        if (event.target.matches('[data-role="guild-point-budget"]')) {
          const parsed = guildPointBudgetInputValue(event.target);
          setGuildPointBudgetValidity(panel, event.target, parsed.valid);
          if (!parsed.valid) return;
          state.manualGuildPoints = parsed.value;
          clearConstructionNotice(panel);
          persistGuildBuildingPlannerState();
          refreshConstructionAndFocus(panel, { role: "guild-point-budget" }, null);
          return;
        }
        if (event.target.matches('[data-role="building-search"]')) {
          state.buildingSearch = event.target.value;
          applyGuildBuildingFilters(constructionResults);
          return;
        }
        if (event.target.matches('[data-role="building-target"]')) {
          const buildingHrid = event.target.dataset.buildingHrid;
          setGuildBuildingTarget(guildBuildingDefinitions(), buildingHrid, Number(event.target.value));
          refreshConstructionAndFocus(panel, { role: "building-target", buildingHrid });
        }
      });
      constructionResults.addEventListener("submit", (event) => {
        const form = event.target.closest('[data-role="pending-building-start"]');
        if (!form) return;
        event.preventDefault();
        const input = form.querySelector('[data-role="pending-building-start-level"]');
        if (!input) return;
        setPendingGuildBuildingStartValue(input.value);
        const buildingHrid = form.dataset.buildingHrid;
        const result = addGuildBuildingPlan(guildBuildingDefinitions(), buildingHrid, input.value);
        if (result.status === "added") {
          refreshConstructionAndFocus(panel, { role: "building-target", buildingHrid });
          return;
        }
        refreshConstructionAndFocus(panel, { role: "pending-building-start-level", buildingHrid });
      });
      constructionResults.addEventListener("keydown", (event) => {
        if (event.key !== "Escape" || !event.target.closest(".mwi-building-picker-body")) return;
        event.preventDefault();
        setGuildBuildingPickerOpen(false);
        refreshConstructionAndFocus(panel, { role: "toggle-building-picker" });
      });
      constructionResults.addEventListener("click", (event) => {
        const button = event.target.closest("button");
        if (!button) return;
        const definitions = guildBuildingDefinitions();
        if (button.matches('[data-role="toggle-building-picker"]')) {
          const open = button.getAttribute("aria-expanded") !== "true";
          setGuildBuildingPickerOpen(open);
          refreshConstructionAndFocus(panel, { role: open ? "building-search" : "toggle-building-picker" });
          return;
        }
        if (button.matches('[data-role="building-tile"]')) {
          const buildingHrid = button.dataset.buildingHrid;
          const result = addGuildBuildingPlan(definitions, buildingHrid);
          if (result.status === "added") {
            refreshConstructionAndFocus(panel, { role: "building-target", buildingHrid });
            return;
          }
          if (result.status === "already_planned") {
            focusConstructionControl(panel, { role: "building-target", buildingHrid });
            return;
          }
          if (result.status === "requires_start_level")
            refreshConstructionAndFocus(panel, { role: "pending-building-start-level", buildingHrid });
          return;
        }
        if (button.matches('[data-role="cancel-pending-building"]')) {
          const buildingHrid = button.dataset.buildingHrid;
          clearPendingGuildBuilding();
          const focused = refreshConstructionAndFocus(
            panel,
            { role: "building-tile", buildingHrid },
            { role: "building-search" }
          );
          if (!focused) focusConstructionControl(panel, { role: "toggle-building-picker" });
          return;
        }
        if (button.matches('[data-role="building-category"]')) {
          state.buildingCategory = button.dataset.category;
          persistGuildBuildingPlannerState();
          applyGuildBuildingFilters(constructionResults);
          return;
        }
        if (button.matches('[data-role="adjust-building-target"]')) {
          const definition = definitions.find((entry) => entry.hrid === button.dataset.buildingHrid);
          if (!definition) return;
          const existing = state.buildingPlans.find((plan) => plan.buildingHrid === definition.hrid);
          if (!existing) return;
          const delta = Number(button.dataset.delta || 0);
          const targetLevel = Math.min(definition.maxLevel, existing.targetLevel + delta);
          setGuildBuildingTarget(definitions, definition.hrid, targetLevel);
          refreshConstructionAndFocus(
            panel,
            { role: "adjust-building-target", buildingHrid: definition.hrid, delta },
            { role: "building-target", buildingHrid: definition.hrid }
          );
          return;
        }
        if (button.matches('[data-role="remove-building-plan"]')) {
          const result = removeGuildBuildingPlan(definitions, button.dataset.buildingHrid);
          if (result.status !== "removed") return;
          const neighbor = state.buildingPlans[Math.min(result.removedIndex, state.buildingPlans.length - 1)];
          refreshConstructionAndFocus(
            panel,
            neighbor
              ? { role: "building-target", buildingHrid: neighbor.buildingHrid }
              : { role: "toggle-building-picker" }
          );
          return;
        }
        if (button.matches('[data-role="move-building-plan"]')) {
          const buildingHrid = button.dataset.buildingHrid;
          if (moveGuildBuildingPlan(buildingHrid, Number(button.dataset.direction)))
            refreshConstructionAndFocus(panel, { role: "construction-drag-handle", buildingHrid });
          return;
        }
        if (button.matches('[data-role="toggle-building-steps"]')) {
          const buildingHrid = button.dataset.buildingHrid;
          const definition = definitions.find((entry) => entry.hrid === buildingHrid);
          if (!definition) return;
          const expanded = toggleGuildBuildingSteps(buildingHrid);
          const group = button.closest(".mwi-construction-group");
          const details = group && group.querySelector(".mwi-construction-group-steps");
          if (group) group.dataset.expanded = String(expanded);
          if (details) details.hidden = !expanded;
          button.setAttribute("aria-expanded", String(expanded));
          button.setAttribute(
            "aria-label",
            t(expanded ? "collapseBuildingSteps" : "expandBuildingSteps", {
              building: definitions.find((entry) => entry.hrid === buildingHrid)?.nameKey
                ? t(definition.nameKey)
                : buildingHrid
            })
          );
          button.setAttribute("title", button.getAttribute("aria-label"));
          const icon = button.querySelector("span");
          if (icon) icon.textContent = expanded ? "▴" : "▾";
          return;
        }
        if (button.matches('[data-role="clear-building-plans"]')) {
          if (
            clearGuildBuildingPlans(() => {
              const undo = panel.querySelector('[data-role="undo-clear-building-plans"]');
              if (!undo) return;
              if (document.activeElement === undo) {
                const restored = focusConstructionControl(panel, { role: "toggle-building-picker" });
                if (!restored) panel.querySelector('[data-role="view-construction"]')?.focus();
              }
              undo.hidden = true;
            })
          )
            refreshConstructionAndFocus(panel, { role: "undo-clear-building-plans" });
          return;
        }
        if (button.matches('[data-role="copy-building-plan"]')) {
          void copyGuildConstructionPlan(panel).then(() => {
            if (state.activeView !== "construction") return;
            if (document.activeElement && document.activeElement !== document.body) return;
            focusConstructionControl(panel, { role: "copy-building-plan" });
          });
          return;
        }
        if (button.matches('[data-role="export-building-plan"]')) exportGuildConstructionCsv();
      });
      panel.querySelector('[data-role="undo-clear-building-plans"]').addEventListener("click", () => {
        if (!undoClearGuildBuildingPlans()) return;
        const firstPlan = state.buildingPlans[0];
        refreshConstructionAndFocus(
          panel,
          firstPlan
            ? { role: "building-target", buildingHrid: firstPlan.buildingHrid }
            : { role: "toggle-building-picker" }
        );
      });
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
      panel.querySelector('[data-role="add-upgrade-plan"]').addEventListener("click", () => {
        addGuildUpgradePlan(guildBuffEntries());
        persistPluginUiState();
        refreshGuildUpgrade(panel);
      });
      panel.querySelector('[data-role="clear-upgrade-plans"]').addEventListener("click", () => {
        clearGuildUpgradePlans();
        persistPluginUiState();
        refreshGuildUpgrade(panel);
      });
      panel
        .querySelector('[data-role="toggle-shrine-guide"]')
        .addEventListener("click", () => setShrineGuideEnabled(panel, !state.shrineGuideEnabled));
      const guildTokenBudgetControl = panel.querySelector('[data-role="guild-token-budget-control"]');
      const guildTokenBudgetRange = panel.querySelector('[data-role="guild-token-budget-range"]');
      guildTokenBudgetControl.addEventListener("input", (event) => {
        if (!event.target.matches('[data-role="guild-token-budget-range"], [data-role="guild-token-budget-number"]'))
          return;
        const snap = event.target === guildTokenBudgetRange && guildTokenBudgetRange.dataset.dragging === "true";
        setGuildTokenBudget(panel, event.target.value, { snap });
      });
      guildTokenBudgetRange.addEventListener("pointerdown", () => {
        guildTokenBudgetRange.dataset.dragging = "true";
      });
      for (const eventName of ["pointerup", "pointercancel", "blur"]) {
        guildTokenBudgetRange.addEventListener(eventName, () => {
          guildTokenBudgetRange.dataset.dragging = "false";
        });
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
      panel.querySelector(".mwi-upgrade-preset-buttons").addEventListener("click", (event) => {
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
          if (
            state.upgradePlans.some((candidate) => candidate.id !== plan.id && candidate.guildBuffHrid === targetHrid)
          )
            return;
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
      const tabSortable = sortableApi.createPointerSortable({
        root: panel,
        containerSelector: ".mwi-view-tabs",
        itemSelector: ".mwi-view-tab-item:not([hidden])",
        handleSelector: ".mwi-view-tab-item:not([hidden])",
        axis: "x",
        onCommit: ({ key, toIndex }) => reorderPanelView(panel, key, toIndex)
      });
      const constructionSortable = sortableApi.createPointerSortable({
        root: panel,
        containerSelector: '[data-role="construction-sort-list"]',
        itemSelector: ".mwi-construction-group",
        handleSelector: ".mwi-construction-drag-handle",
        axis: "y",
        onCommit: ({ key, toIndex }) => {
          if (!reorderGuildBuildingPlan(key, toIndex)) return;
          refreshConstructionAndFocus(panel, { role: "construction-drag-handle", buildingHrid: key });
        }
      });
      panel.__mwiSortableControllers = [tabSortable, constructionSortable];
      sortableControllers.push(tabSortable, constructionSortable);
      if (state.activeView !== savedActiveView) persistPluginUiState();
      checkPluginUpdate(panel);
      return panel;
    }

    function destroyPanel(panel) {
      const numberStepperCleanup = panel && panel.__mwiNumberStepperCleanup;
      if (numberStepperCleanup) {
        const cleanupIndex = numberStepperCleanups.indexOf(numberStepperCleanup);
        if (cleanupIndex >= 0) numberStepperCleanups.splice(cleanupIndex, 1);
        numberStepperCleanup();
        delete panel.__mwiNumberStepperCleanup;
      }
      const controllers = Array.isArray(panel && panel.__mwiSortableControllers) ? panel.__mwiSortableControllers : [];
      for (const controller of controllers) {
        const index = sortableControllers.indexOf(controller);
        if (index >= 0) sortableControllers.splice(index, 1);
        controller.destroy();
      }
      if (panel) delete panel.__mwiSortableControllers;
    }

    function recreatePanel(previousPanel) {
      const active = previousPanel && previousPanel.contains(document.activeElement) ? document.activeElement : null;
      const focusSnapshot = active
        ? { id: active.id || "", role: active.dataset.role || "", dataset: { ...active.dataset } }
        : null;
      const scrollTop = previousPanel ? previousPanel.scrollTop : 0;
      destroyPanel(previousPanel);
      if (previousPanel) previousPanel.remove();
      const panel = createPanel();
      Promise.resolve().then(() => {
        if (!panel.isConnected) return;
        panel.scrollTop = scrollTop;
        if (!focusSnapshot) return;
        const candidates = Array.from(panel.querySelectorAll(focusSnapshot.role ? "[data-role]" : "[id]"));
        const target = candidates.find((candidate) => {
          if (focusSnapshot.role && candidate.dataset.role !== focusSnapshot.role) return false;
          if (!focusSnapshot.role && candidate.id !== focusSnapshot.id) return false;
          return Object.entries(focusSnapshot.dataset).every(([key, value]) => candidate.dataset[key] === value);
        });
        if (!target || target.disabled || target.closest("[hidden]")) return;
        try {
          target.focus({ preventScroll: true });
        } catch (_) {
          target.focus();
        }
      });
      return panel;
    }

    function dispose() {
      for (const cleanup of numberStepperCleanups.splice(0)) cleanup();
      for (const controller of sortableControllers.splice(0)) controller.destroy();
    }

    return { createPanel, recreatePanel, dispose };
  }

  return { createPanelShell };
});


// SOURCE: src/ui/credit-view.js
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MwiGuildCreditCreditView = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function createCreditView(dependencies) {
    const {
      state,
      window,
      t,
      escapeHtml,
      formatNumber,
      iconMarkup,
      marketItemIconMarkup,
      itemNameForMaterial,
      creditQuantity,
      itemQuantity,
      core,
      GUILD_TOKEN_CREDIT_CONVERSIONS,
      loadSnapshot,
      creditConversionGroups,
      snapshotOrderBook,
      refreshOfficialItemNameCatalog
    } = dependencies;

    function renderCreditSection(creditItemHrid, color, ranked, priceLimited) {
      const available = ranked.filter((row) => row.status === "ok").slice(0, 5);
      const creditName = itemNameForMaterial(creditItemHrid);
      const icon = iconMarkup(creditItemHrid, creditName);
      const collapsed = state.collapsedCreditSections.has(creditItemHrid);
      const heading = `<button class="mwi-credit-heading" data-role="toggle-credit-section" type="button" aria-expanded="${String(!collapsed)}">${icon}<span>${escapeHtml(creditName)}</span><span class="mwi-collapse-icon" aria-hidden="true">${collapsed ? "▸" : "▾"}</span></button>`;
      if (!available.length) {
        const emptyMessage =
          priceLimited && state.maxConversionItemUnitPrice
            ? t("noMarketEstimateWithinPriceLimit", {
                limit: formatNumber(state.maxConversionItemUnitPrice / 1_000_000, 2)
              })
            : t("noMarketEstimate");
        return `<section class="mwi-credit-section" data-credit-item-hrid="${escapeHtml(creditItemHrid)}" data-collapsed="${String(collapsed)}" style="--mwi-credit-color:${color}">${heading}<div class="mwi-credit-body"${collapsed ? " hidden" : ""}><div class="mwi-empty">${escapeHtml(emptyMessage)}</div></div></section>`;
      }
      const itemLabel = escapeHtml(t("item"));
      const exchangeLabel = escapeHtml(t("exchange"));
      const perCreditLabel = escapeHtml(t("perCredit"));
      const targetCostLabel = escapeHtml(t("targetCost"));
      return `<section class="mwi-credit-section" data-credit-item-hrid="${escapeHtml(creditItemHrid)}" data-collapsed="${String(collapsed)}" style="--mwi-credit-color:${color}">${heading}<div class="mwi-credit-body"${collapsed ? " hidden" : ""}><table><colgroup><col class="mwi-credit-item-column"><col class="mwi-credit-exchange-column"><col class="mwi-credit-unit-cost-column"><col class="mwi-credit-target-cost-column"></colgroup><thead><tr><th>${itemLabel}</th><th>${exchangeLabel}</th><th>${perCreditLabel}</th><th>${targetCostLabel}</th></tr></thead><tbody>${available.map((row) => `<tr><td data-label="${itemLabel}" title="${escapeHtml(row.itemName)}"><span class="mwi-item">${marketItemIconMarkup(row.itemHrid, row.itemName)}<span class="mwi-item-name">${escapeHtml(row.itemName)}</span></span></td><td data-label="${exchangeLabel}">${escapeHtml(t("exchangeRate", { items: itemQuantity(row.itemCount), credits: creditQuantity(row.creditCount) }))}</td><td class="mwi-cost" data-label="${perCreditLabel}">${formatNumber(row.costPerCredit, 2)}</td><td data-label="${targetCostLabel}">${core.formatCompactCost(row.cost)}</td></tr>`).join("")}</tbody></table></div></section>`;
    }

    function renderGuildTokenValues(values) {
      const valuesByCredit = new Map(values.map((value) => [value.creditItemHrid, value]));
      const rows = GUILD_TOKEN_CREDIT_CONVERSIONS.map((rule) => {
        const value = valuesByCredit.get(rule.creditItemHrid) || { status: "unpriced", ...rule };
        const creditName = itemNameForMaterial(value.creditItemHrid);
        const exchange = t("exchangeRate", {
          items: `${formatNumber(value.guildTokenCount)} ${t("guildTokens")}`,
          credits: creditQuantity(value.creditCount)
        });
        if (value.status !== "ok") {
          return `<div class="mwi-token-value-row"><span class="mwi-item">${iconMarkup(value.creditItemHrid, creditName)}<span class="mwi-item-name">${escapeHtml(creditName)}</span></span><span class="mwi-token-value-exchange">${escapeHtml(exchange)}</span><span class="mwi-token-value-unpriced">${escapeHtml(t("noMarketValue"))}</span></div>`;
        }
        return `<div class="mwi-token-value-row"><span class="mwi-item">${iconMarkup(value.creditItemHrid, creditName)}<span class="mwi-item-name">${escapeHtml(creditName)}</span></span><span class="mwi-token-value-exchange">${escapeHtml(exchange)}</span><span class="mwi-cost">${core.formatCompactCost(value.goldValuePerToken)} ${escapeHtml(t("gold"))}</span></div>`;
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

      const unfilteredCreditGroups = creditConversionGroups({ applyPriceLimit: false });
      const conversionCount = unfilteredCreditGroups.reduce((total, group) => total + group.conversions.length, 0);
      if (!conversionCount) {
        status.textContent = t("noExchangeRules");
        button.disabled = false;
        finishRefresh(panel);
        return;
      }
      status.textContent = t("readingRules", { count: formatNumber(conversionCount) });

      try {
        await loadSnapshot(Boolean(forceSnapshot));
        const creditGroups = creditConversionGroups();
        const unfilteredConversionCounts = new Map(
          unfilteredCreditGroups.map((group) => [group.creditItemHrid, group.conversions.length])
        );
        const rankedGroups = creditGroups.map((group) => {
          const books = Object.fromEntries(
            group.conversions.map((conversion) => [conversion.itemHrid, snapshotOrderBook(conversion.itemHrid)])
          );
          const tokenRule = GUILD_TOKEN_CREDIT_CONVERSIONS.find((rule) => rule.creditItemHrid === group.creditItemHrid);
          return {
            ...group,
            priceLimited: group.conversions.length < (unfilteredConversionCounts.get(group.creditItemHrid) || 0),
            ranked: core.rankConversions(group.conversions, books, target),
            tokenRanked: core.rankConversions(group.conversions, books, tokenRule.creditCount)
          };
        });
        const tokenValues = core.rankGuildTokenCreditValues(
          GUILD_TOKEN_CREDIT_CONVERSIONS,
          Object.fromEntries(rankedGroups.map((group) => [group.creditItemHrid, group.tokenRanked]))
        );
        status.textContent = "";
        status.hidden = true;
        results.innerHTML = `${renderGuildTokenValues(tokenValues)}<div class="mwi-credit-grid">${rankedGroups.map((group) => renderCreditSection(group.creditItemHrid, group.color, group.ranked, group.priceLimited)).join("")}</div>`;
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

    return { refreshPanel };
  }

  return { createCreditView };
});


// SOURCE: src/userscript.js
(function () {
  "use strict";

  const core = window.MwiGuildCreditCore;
  const marketDataApi = window.MwiGuildCreditMarketData;
  const itemNameCatalogApi = window.MwiGuildCreditItemNameCatalog;
  const releaseInfoApi = window.MwiGuildCreditReleaseInfo;
  const localizationApi = window.MwiGuildCreditLocalization;
  const buildingDataApi = window.MwiGuildBuildingData;
  const shrineGuideApi = window.MwiGuildCreditShrineGuide;
  const configApi = window.MwiGuildCreditConfig;
  const storageApi = window.MwiGuildCreditStorage;
  const schedulerApi = window.MwiGuildCreditScheduler;
  const gameStateApi = window.MwiGuildCreditGameState;
  const gameDataApi = window.MwiGuildCreditGameData;
  const domApi = window.MwiGuildCreditDom;
  const sidebarIntegrationApi = window.MwiGuildCreditSidebarIntegration;
  const sortableApi = window.MwiGuildCreditSortable;
  const stylesApi = window.MwiGuildCreditStyles;
  const constructionViewApi = window.MwiGuildCreditConstructionView;
  const upgradeViewApi = window.MwiGuildCreditUpgradeView;
  const settingsViewApi = window.MwiGuildCreditSettingsView;
  const shrineGuideUiApi = window.MwiGuildCreditShrineGuideUi;
  const exchangeAdvisorApi = window.MwiGuildCreditExchangeAdvisor;
  const panelShellApi = window.MwiGuildCreditPanelShell;
  const creditViewApi = window.MwiGuildCreditCreditView;
  if (
    !core ||
    !marketDataApi ||
    !itemNameCatalogApi ||
    !releaseInfoApi ||
    !localizationApi ||
    !buildingDataApi ||
    !shrineGuideApi ||
    !configApi ||
    !storageApi ||
    !schedulerApi ||
    !gameStateApi ||
    !gameDataApi ||
    !domApi ||
    !sidebarIntegrationApi ||
    !sortableApi ||
    !stylesApi ||
    !constructionViewApi ||
    !upgradeViewApi ||
    !settingsViewApi ||
    !shrineGuideUiApi ||
    !exchangeAdvisorApi ||
    !panelShellApi ||
    !creditViewApi
  )
    return;
  const pageWindow = typeof unsafeWindow === "undefined" ? window : unsafeWindow;
  const PLUGIN_VERSION = String(window.MwiGuildCreditVersion || "0.0.0");
  const {
    UPDATE_SCRIPT_URL,
    FALLBACK_INSTALL_URL,
    UPDATE_CHECK_TIMEOUT_MS,
    SHOW_ALL_CREDIT_TOKEN_TOGGLE,
    PRICE_REFERENCES,
    GUILD_TOKEN_BUDGET_SNAP_PERCENTAGES,
    GUILD_TOKEN_BUDGET_SNAP_THRESHOLD_PERCENTAGE,
    RENDERED_MARKUP_PROPERTY,
    PANEL_VIEWS,
    DEFAULT_PANEL_ORDER,
    CREDIT_TYPES,
    GUILD_TOKEN_CREDIT_CONVERSIONS,
    SELLER_TAX_RATE,
    GUILD_SHRINE_NAME_KEYS
  } = configApi;
  const pluginStorage = storageApi.createPluginStorage({
    storage: pageWindow.localStorage,
    location: pageWindow.location,
    config: configApi,
    buildingDataApi,
    marketDataApi
  });
  const savedUiState = pluginStorage.loadSavedPluginUiState();
  const savedBuildingPlannerState = pluginStorage.loadSavedGuildBuildingPlannerState();
  const savedMarketState = pluginStorage.loadSavedLiveMarketData();
  const itemNameCatalog = itemNameCatalogApi.createItemNameCatalog({
    pageWindow,
    document,
    storage: pageWindow.localStorage,
    version: PLUGIN_VERSION
  });
  const updateChecker = releaseInfoApi.createVersionChecker({
    fetchImpl: pageWindow.fetch && pageWindow.fetch.bind(pageWindow),
    url: UPDATE_SCRIPT_URL,
    timeoutMs: UPDATE_CHECK_TIMEOUT_MS,
    setTimeout: pageWindow.setTimeout && pageWindow.setTimeout.bind(pageWindow),
    clearTimeout: pageWindow.clearTimeout && pageWindow.clearTimeout.bind(pageWindow),
    AbortController: pageWindow.AbortController
  });
  const state = {
    itemDetails: null,
    conversionCache: new Map(),
    guildBuffDetails: null,
    guildBuffLevels: null,
    guildShrineLevels: null,
    guildShrineDetails: null,
    characterItems: null,
    characterItemsBridgeRevision: 0,
    guildBuffLevelsBridgeRevision: 0,
    detectedGameLocale: null,
    panelLocale: null,
    sidebarIntegrationObserver: null,
    upgradePlans: savedUiState.upgradePlans.map((plan, index) => ({ id: `plan-${index + 1}`, ...plan })),
    nextUpgradePlanId: savedUiState.upgradePlans.length + 1,
    upgradePresetNotice: "",
    guildTokenCreditHrids: new Set(savedUiState.guildTokenCreditHrids),
    autoGuildTokenBudget: savedUiState.autoGuildTokenBudget,
    shrineGuideEnabled: savedUiState.shrineGuideEnabled,
    maxConversionItemUnitPrice: savedUiState.maxConversionItemUnitPrice,
    guildShrineAutofillExcludedBuffHrids: new Set(savedUiState.guildShrineAutofillExcludedBuffHrids),
    showConstructionView: savedUiState.showConstructionView,
    settingsOpen: false,
    shrineGuideContext: null,
    shrineGuideModel: null,
    shrineGuideFrame: null,
    shrineGuideObserver: null,
    shrineGuideObservedNodes: new Set(),
    shrineGuideDocumentListenersInstalled: false,
    shrineGuideDocumentHandlers: null,
    snapshot: null,
    snapshotTimestamp: 0,
    marketSnapshotCandidateSignature: "",
    marketSnapshotCandidateTimestamp: 0,
    marketSnapshotCandidateConfirmations: 0,
    marketLiveData: savedMarketState.liveData,
    marketLiveRevision: savedMarketState.revision,
    marketBridgeRevision: 0,
    marketUpdateSignatures: Object.create(null),
    priceReference: pluginStorage.loadPriceReference(),
    targetCredit: savedUiState.targetCredit,
    activeView: savedUiState.activeView,
    panelOrder: savedUiState.panelOrder,
    panel: null,
    creditTab: null,
    hiddenSidebarNodes: [],
    refreshTimer: null,
    refreshInFlight: false,
    refreshQueued: false,
    panelSearchTimer: null,
    collapsedCreditSections: new Set(savedUiState.collapsedCreditSections),
    guildTokenValuesCollapsed: savedUiState.guildTokenValuesCollapsed,
    upgradeRefreshId: 0,
    exchangeAdvisorUi: null,
    exchangeAdvisorRootObserver: null,
    exchangeAdvisorModalObserver: null,
    exchangeAdvisorObservedModal: null,
    exchangeAdvisorListenersInstalled: false,
    exchangeAdvisorRepositionHandler: null,
    exchangeAdvisorLoadInFlight: false,
    exchangeAdvisorSnapshotFailed: false
  };
  state.guildBuildingLevels = null;
  state.guildBuildingLevelsComplete = false;
  state.guildBuildingDetails = null;
  state.buildingPlans = savedBuildingPlannerState.plans.map((plan, index) => ({
    id: `building-plan-${index + 1}`,
    ...plan
  }));
  state.nextBuildingPlanId = state.buildingPlans.length + 1;
  state.manualGuildPoints = savedBuildingPlannerState.manualGuildPoints;
  state.buildingCategory = savedBuildingPlannerState.category;
  state.buildingSearch = "";
  state.buildingPlanNotice = "";
  let guildBuildingSpriteHref = "";
  let guildBuildingSpriteLoadPromise = null;
  const gameState = gameStateApi.createGameStateAdapter(state);
  const { guildShrineLevelRecordKey } = gameStateApi;
  const {
    setItemDetails,
    setGuildBuffDetails,
    setCharacterItems,
    setGuildBuffLevelsFrom,
    setGuildShrineLevelsFrom,
    setGuildShrineDetailsFrom,
    setGuildBuildingLevelsFrom,
    seedCompleteGuildBuildingLevelsFrom,
    setGuildBuildingDetailsFrom
  } = gameState;
  const updateRenderedMarkup = (element, markup) =>
    domApi.updateRenderedMarkup(element, markup, RENDERED_MARKUP_PROPERTY);
  const escapeHtml = domApi.escapeHtml;
  const itemHridFromIcon = domApi.itemHridFromIcon;
  const enhancementLevelFromIcon = domApi.enhancementLevelFromIcon;

  const guildTokenBudgetRefreshTask = schedulerApi.createDebouncedTask({
    task: (panel) => refreshGuildUpgrade(panel),
    delay: 80,
    setTimer: window.setTimeout.bind(window),
    clearTimer: window.clearTimeout.bind(window)
  });
  const marketDataRefreshTask = schedulerApi.createDebouncedTask({
    task: () => {
      if (state.panel && state.panel.isConnected && !state.panel.hidden) {
        if (state.panel.dataset.activeView === "upgrade") refreshGuildUpgrade(state.panel);
        else refreshPanel(state.panel);
      }
      scheduleGuildExchangeAdvisor(true);
    },
    delay: 120,
    setTimer: window.setTimeout.bind(window),
    clearTimer: window.clearTimeout.bind(window)
  });
  const inventoryDataRefreshTask = schedulerApi.createDebouncedTask({
    task: () => {
      if (
        state.panel &&
        state.panel.isConnected &&
        !state.panel.hidden &&
        state.panel.dataset.activeView === "upgrade"
      ) {
        refreshGuildUpgrade(state.panel);
      }
      scheduleGuildExchangeAdvisor(true);
      scheduleShrineGuide();
    },
    delay: 120,
    setTimer: window.setTimeout.bind(window),
    clearTimer: window.clearTimeout.bind(window)
  });
  const guildDataRefreshTask = schedulerApi.createDebouncedTask({
    task: () => {
      if (state.panel && state.panel.isConnected && state.panel.dataset.activeView === "upgrade")
        refreshGuildUpgrade(state.panel);
      else if (state.panel && state.panel.isConnected && state.panel.dataset.activeView === "construction")
        refreshGuildConstruction(state.panel);
      else scheduleShrineGuide();
      if (state.panel && state.panel.isConnected && state.settingsOpen) refreshSettings(state.panel);
    },
    delay: 120,
    setTimer: window.setTimeout.bind(window),
    clearTimer: window.clearTimeout.bind(window)
  });
  const sidebarIntegrationTask = schedulerApi.createDebouncedTask({
    task: () => ensureSidebarIntegration(),
    delay: 75,
    setTimer: window.setTimeout.bind(window),
    clearTimer: window.clearTimeout.bind(window)
  });
  const requestAdvisorFrame =
    typeof window.requestAnimationFrame === "function"
      ? window.requestAnimationFrame.bind(window)
      : (handler) => window.setTimeout(handler, 0);
  const cancelAdvisorFrame =
    typeof window.cancelAnimationFrame === "function"
      ? window.cancelAnimationFrame.bind(window)
      : window.clearTimeout.bind(window);
  const exchangeAdvisorFrameTask = schedulerApi.createFrameTask({
    task: (forceRender) => refreshGuildExchangeAdvisor(Boolean(forceRender)),
    requestFrame: requestAdvisorFrame,
    cancelFrame: cancelAdvisorFrame,
    merge: (current, next) => Boolean(current || next)
  });

  function normalizePanelView(view) {
    return storageApi.normalizePanelView(view, PANEL_VIEWS);
  }

  function persistGuildBuildingPlannerState() {
    pluginStorage.persistGuildBuildingPlannerState(state);
  }

  function persistPluginUiState() {
    return pluginStorage.persistPluginUiState(state);
  }

  function persistLiveMarketData() {
    pluginStorage.persistLiveMarketData(state.marketLiveData, state.marketLiveRevision);
  }

  function setPriceReference(reference) {
    if (!PRICE_REFERENCES[reference]) return;
    state.priceReference = reference;
    pluginStorage.persistPriceReference(reference);
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
    return String(itemHrid || t("unknownItem"))
      .split("/")
      .pop()
      .replaceAll("_", " ");
  }

  function titleCase(value) {
    return String(value || "").replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function currentGameLocale() {
    const candidates = [state.detectedGameLocale];
    try {
      candidates.push(
        pageWindow.i18next && pageWindow.i18next.resolvedLanguage,
        pageWindow.i18next && pageWindow.i18next.language,
        pageWindow.i18n && pageWindow.i18n.resolvedLanguage,
        pageWindow.i18n && pageWindow.i18n.language,
        pageWindow.localStorage && pageWindow.localStorage.getItem("i18nextLng")
      );
    } catch (_) {}
    candidates.push(document.documentElement.lang);
    return localizationApi.resolveLocaleCandidates(candidates, "zh-CN");
  }

  function refreshOfficialItemNameCatalog(force, requiredItemHrids) {
    return itemNameCatalog.refreshIfDue({
      force: force === true,
      requiredItemHrids: Array.isArray(requiredItemHrids) ? requiredItemHrids : []
    }).changed;
  }

  // This is the sole item-name resolver used by the UI. Official game names
  // remain authoritative; stable guild currencies have a bundled localized
  // fallback for environments where the game's i18n catalog is unavailable.
  function resolveItemName(itemHrid, englishFallback) {
    const localizer = ui();
    if (localizer.locale === "zh-CN") refreshOfficialItemNameCatalog(false, [itemHrid]);
    return itemNameCatalog.resolveItemName({
      itemHrid,
      englishFallback: localizer.itemName(itemHrid) || englishFallback,
      locale: localizer.locale
    });
  }

  // The game persists initClientData with LZString.compressToUTF16. Reading it
  // avoids depending on the timing of the one-time WebSocket initialization.
  const gameData = gameDataApi.createGameData({
    state,
    pageWindow,
    document,
    marketDataApi,
    core,
    setItemDetails,
    setGuildBuffDetails,
    setCharacterItems,
    setGuildBuffLevelsFrom,
    setGuildShrineLevelsFrom,
    setGuildShrineDetailsFrom,
    setGuildBuildingLevelsFrom,
    seedCompleteGuildBuildingLevelsFrom,
    setGuildBuildingDetailsFrom,
    persistLiveMarketData,
    scheduleMarketDataRefresh,
    scheduleInventoryDataRefresh,
    scheduleGuildDataRefresh,
    t,
    resolveItemName,
    CREDIT_TYPES
  });
  const {
    hydrateLocalInitData,
    extractItemDetailsFromReact,
    hydrateBridgeData,
    loadSnapshot,
    snapshotOrderBook,
    snapshotPrice,
    snapshotImmediateSellPrice,
    allConversions,
    creditConversionGroups
  } = gameData;

  function itemSpriteHref(itemHrid) {
    const spriteUse = document.querySelector('use[href*="items_sprite"]');
    const href = spriteUse && spriteUse.getAttribute("href");
    if (!href || !href.includes("#")) return "";
    return `${href.slice(0, href.indexOf("#"))}#${String(itemHrid || "")
      .split("/")
      .pop()}`;
  }

  function iconMarkup(itemHrid, label) {
    const href = itemSpriteHref(itemHrid);
    if (!href) return '<span class="mwi-item-icon mwi-item-icon-fallback" aria-hidden="true"></span>';
    return `<svg class="mwi-item-icon" role="img" aria-label="${escapeHtml(label)}"><use href="${escapeHtml(href)}"></use></svg>`;
  }

  function guildBuildingSpriteBaseHref() {
    if (guildBuildingSpriteHref) return guildBuildingSpriteHref;
    const discovered = domApi.findSpriteBaseHref(document, "misc_sprite");
    if (discovered) {
      guildBuildingSpriteHref = discovered;
      return guildBuildingSpriteHref;
    }
    void loadGuildBuildingSpriteBaseHref();
    return "";
  }

  function loadGuildBuildingSpriteBaseHref() {
    if (guildBuildingSpriteHref) return Promise.resolve(guildBuildingSpriteHref);
    if (guildBuildingSpriteLoadPromise) return guildBuildingSpriteLoadPromise;
    const fetchImpl = pageWindow.fetch && pageWindow.fetch.bind(pageWindow);
    if (!fetchImpl || !pageWindow.location || !pageWindow.location.origin) return Promise.resolve("");
    const manifestUrl = new URL("/asset-manifest.json", pageWindow.location.origin).href;
    guildBuildingSpriteLoadPromise = fetchImpl(manifestUrl, { cache: "force-cache" })
      .then((response) => {
        if (!response || !response.ok) throw new Error("asset manifest unavailable");
        return response.json();
      })
      .then((manifest) => {
        const reference = domApi.spriteBaseFromAssetManifest(manifest, "misc_sprite");
        if (!reference) throw new Error("misc sprite unavailable");
        guildBuildingSpriteHref = new URL(reference, pageWindow.location.origin).href;
        if (
          state.panel &&
          state.panel.isConnected &&
          !state.panel.hidden &&
          state.panel.dataset.activeView === "construction"
        )
          refreshGuildConstruction(state.panel);
        return guildBuildingSpriteHref;
      })
      .catch(() => "");
    return guildBuildingSpriteLoadPromise;
  }

  function guildBuildingIconMarkup(definition, spriteBaseHref) {
    const symbolId = definition && (definition.iconSymbolId || buildingDataApi.iconSymbolId(definition.hrid));
    if (!spriteBaseHref || !symbolId)
      return '<span class="mwi-building-icon mwi-building-icon-fallback" aria-hidden="true"><svg viewBox="0 0 50 50" focusable="false"><path d="M7 43V20l18-12 18 12v23H7Z"></path><path d="M17 43V28h16v15M4 43h42"></path></svg></span>';
    const href = `${spriteBaseHref}#${symbolId}`;
    return `<span class="mwi-building-icon" data-icon-source="game"><svg aria-hidden="true" focusable="false" viewBox="0 0 50 50" width="100%" height="100%"><use href="${escapeHtml(href)}" width="50" height="50"></use></svg></span>`;
  }

  function marketItemIconMarkup(itemHrid, label, className = "") {
    const marketLabel = t("marketItem", { item: label });
    return `<button class="mwi-market-item-link ${escapeHtml(className)}" data-role="market-item-link" data-item-hrid="${escapeHtml(itemHrid)}" data-item-name="${escapeHtml(label)}" type="button" title="${escapeHtml(marketLabel)}" aria-label="${escapeHtml(marketLabel)}">${iconMarkup(itemHrid, label)}</button>`;
  }

  function marketplaceSearchInput() {
    return (
      Array.from(document.querySelectorAll("input")).find((input) => {
        if (input.closest("#mwi-credit-optimizer")) return false;
        const text =
          `${input.getAttribute("placeholder") || ""} ${input.getAttribute("aria-label") || ""}`.toLowerCase();
        return text.includes("物品搜索") || text.includes("search") || text.includes("item");
      }) || null
    );
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

  const upgradeView = upgradeViewApi.createUpgradeView({
    core,
    state,
    t,
    ui,
    escapeHtml,
    resolveItemName,
    simpleItemName,
    titleCase,
    formatNumber,
    iconMarkup,
    marketItemIconMarkup,
    itemQuantity,
    creditQuantity,
    snapshotOrderBook,
    allConversions,
    CREDIT_TYPES,
    GUILD_TOKEN_CREDIT_CONVERSIONS,
    GUILD_TOKEN_BUDGET_SNAP_PERCENTAGES,
    GUILD_TOKEN_BUDGET_SNAP_THRESHOLD_PERCENTAGE,
    GUILD_SHRINE_NAME_KEYS,
    SHOW_ALL_CREDIT_TOKEN_TOGGLE,
    guildShrineLevelRecordKey,
    persistPluginUiState,
    updateRenderedMarkup,
    hydrateBridgeData,
    extractItemDetailsFromReact,
    hydrateLocalInitData,
    loadSnapshot,
    refreshOfficialItemNameCatalog,
    scheduleShrineGuide: (...args) => scheduleShrineGuide(...args),
    scheduleGuildExchangeAdvisor: (...args) => scheduleGuildExchangeAdvisor(...args),
    guildTokenBudgetRefreshTask
  });
  const {
    guildBuffEntries,
    guildBuffLabel,
    itemNameForMaterial,
    currentGuildBuffLevel,
    shrineLevelValue,
    shrineIdentityValues,
    applyGuildShrineTargets,
    addGuildUpgradePlan,
    clearGuildUpgradePlans,
    removeGuildUpgradePlan,
    guildTokenCreditSelectionState,
    updateGuildTokenCreditPlanButton,
    renderGuildTokenCreditPlanToggle,
    renderGuildTokenBudgetControl,
    setGuildTokenBudget,
    refreshGuildUpgrade
  } = upgradeView;

  const settingsView = settingsViewApi.createSettingsView({
    state,
    t,
    ui,
    escapeHtml,
    guildBuffEntries,
    guildBuffLabel,
    updateRenderedMarkup
  });
  const { renderSettingsMarkup, refreshSettings } = settingsView;

  const constructionView = constructionViewApi.createConstructionView({
    state,
    buildingDataApi,
    t,
    ui,
    core,
    escapeHtml,
    formatNumber,
    titleCase,
    simpleItemName,
    shrineIdentityValues,
    shrineLevelValue,
    guildBuildingSpriteBaseHref,
    guildBuildingIconMarkup,
    updateRenderedMarkup,
    persistGuildBuildingPlannerState,
    hydrateBridgeData,
    extractItemDetailsFromReact,
    hydrateLocalInitData,
    pageWindow,
    document,
    URL,
    Blob
  });
  const {
    guildBuildingDefinitions,
    addGuildBuildingPlan,
    setGuildBuildingTarget,
    removeGuildBuildingPlan,
    moveGuildBuildingPlan,
    reorderGuildBuildingPlan,
    setGuildBuildingPickerOpen,
    setPendingGuildBuildingStartValue,
    clearPendingGuildBuilding,
    toggleGuildBuildingSteps,
    clearGuildBuildingPlans,
    undoClearGuildBuildingPlans,
    hasGuildBuildingClearUndo,
    applyGuildBuildingFilters,
    refreshGuildConstructionBudgetPreview,
    refreshGuildConstruction,
    copyGuildConstructionPlan,
    exportGuildConstructionCsv,
    dispose: disposeConstructionView
  } = constructionView;

  const shrineGuideUi = shrineGuideUiApi.createShrineGuideUi({
    state,
    document,
    window,
    stylesApi,
    t,
    ui,
    formatNumber,
    itemNameForMaterial,
    CREDIT_TYPES,
    shrineGuideApi,
    refreshGuildUpgrade,
    persistPluginUiState,
    scheduleGuildExchangeAdvisor: (...args) => scheduleGuildExchangeAdvisor(...args),
    guildExchangeMutationObserver: (...args) => guildExchangeMutationObserver(...args),
    findGuildExchangeModal: (...args) => findGuildExchangeModal(...args)
  });
  const { scheduleShrineGuide, startShrineGuideObserver, stopShrineGuideObserver, setShrineGuideEnabled } =
    shrineGuideUi;

  const panelShell = panelShellApi.createPanelShell({
    state,
    document,
    stylesApi,
    sortableApi,
    t,
    escapeHtml,
    PANEL_VIEWS,
    DEFAULT_PANEL_ORDER,
    CREDIT_TYPES,
    FALLBACK_INSTALL_URL,
    priceReference,
    normalizePanelView,
    persistPluginUiState,
    checkPluginUpdate,
    refreshPanel: (...args) => refreshPanel(...args),
    refreshGuildUpgrade,
    refreshGuildConstruction,
    refreshGuildExchangeAdvisor: (...args) => refreshGuildExchangeAdvisor(...args),
    renderSettingsMarkup,
    refreshSettings,
    renderGuildTokenCreditPlanToggle,
    renderGuildTokenBudgetControl,
    updateGuildTokenCreditPlanButton,
    setGuildTokenBudget,
    setShrineGuideEnabled,
    guildBuffEntries,
    currentGuildBuffLevel,
    applyGuildShrineTargets,
    addGuildUpgradePlan,
    clearGuildUpgradePlans,
    removeGuildUpgradePlan,
    guildTokenCreditSelectionState,
    guildBuildingDefinitions,
    addGuildBuildingPlan,
    setGuildBuildingTarget,
    removeGuildBuildingPlan,
    moveGuildBuildingPlan,
    reorderGuildBuildingPlan,
    setGuildBuildingPickerOpen,
    setPendingGuildBuildingStartValue,
    clearPendingGuildBuilding,
    toggleGuildBuildingSteps,
    clearGuildBuildingPlans,
    undoClearGuildBuildingPlans,
    hasGuildBuildingClearUndo,
    applyGuildBuildingFilters,
    refreshGuildConstructionBudgetPreview,
    copyGuildConstructionPlan,
    exportGuildConstructionCsv,
    persistGuildBuildingPlannerState,
    setPriceReference,
    openMarketplaceForItem
  });
  const { createPanel, recreatePanel, dispose: disposePanelShell } = panelShell;

  const creditView = creditViewApi.createCreditView({
    state,
    window,
    t,
    escapeHtml,
    formatNumber,
    iconMarkup,
    marketItemIconMarkup,
    itemNameForMaterial,
    creditQuantity,
    itemQuantity,
    core,
    GUILD_TOKEN_CREDIT_CONVERSIONS,
    loadSnapshot,
    creditConversionGroups,
    snapshotOrderBook,
    refreshOfficialItemNameCatalog
  });
  const { refreshPanel } = creditView;

  function scheduleMarketDataRefresh() {
    marketDataRefreshTask.schedule();
  }

  function scheduleInventoryDataRefresh() {
    inventoryDataRefreshTask.schedule();
  }

  function scheduleGuildDataRefresh() {
    guildDataRefreshTask.schedule();
  }

  const exchangeAdvisor = exchangeAdvisorApi.createExchangeAdvisor({
    state,
    document,
    window,
    pageWindow,
    stylesApi,
    CREDIT_TYPES,
    SELLER_TAX_RATE,
    t,
    escapeHtml,
    formatNumber,
    itemNameForMaterial,
    itemHridFromIcon,
    enhancementLevelFromIcon,
    itemQuantity,
    creditQuantity,
    iconMarkup,
    priceReference,
    core,
    loadSnapshot,
    snapshotOrderBook,
    snapshotImmediateSellPrice,
    snapshotPrice,
    allConversions,
    exchangeAdvisorFrameTask
  });
  const {
    findGuildExchangeModal,
    refreshGuildExchangeAdvisor,
    scheduleGuildExchangeAdvisor,
    guildExchangeMutationObserver,
    startGuildExchangeAdvisor
  } = exchangeAdvisor;

  function findSidebarTabBar() {
    return sidebarIntegrationApi.findSidebarIntegration(document, currentGameLocale());
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
    const tabsRoot =
      tabBar &&
      tabBar.parentElement &&
      tabBar.parentElement.parentElement &&
      tabBar.parentElement.parentElement.parentElement;
    const sidebar = tabsRoot && tabsRoot.parentElement;
    const panelHost =
      sidebar && Array.from(sidebar.children).find((node) => /tabPanelsContainer/.test(String(node.className)));
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
    refreshActivePanel(state.panel);
  }

  function refreshActivePanel(panel) {
    if (state.settingsOpen) refreshSettings(panel);
    if (panel.dataset.activeView === "upgrade") refreshGuildUpgrade(panel);
    else if (panel.dataset.activeView === "construction") refreshGuildConstruction(panel);
    else refreshPanel(panel);
  }

  function ensureSidebarIntegration() {
    const itemNamesChanged = refreshOfficialItemNameCatalog();
    const integration = findSidebarTabBar();
    if (!integration || !integration.panelHost) return false;
    const { tabBar, tabPrototype, panelHost } = integration;
    if (integration.detectedLocale) state.detectedGameLocale = integration.detectedLocale;
    const locale = currentGameLocale();
    const localeChanged = Boolean(state.panel && state.panelLocale && state.panelLocale !== locale);
    const currentIntegrationMatches = Boolean(
      state.panel &&
      state.panel.isConnected &&
      state.panel.parentElement === panelHost &&
      state.creditTab &&
      state.creditTab.isConnected &&
      state.creditTab.parentElement === tabBar
    );
    if (currentIntegrationMatches && !localeChanged) {
      if (itemNamesChanged && !state.panel.hidden) refreshActivePanel(state.panel);
      stopSidebarIntegrationObserver();
      return true;
    }

    const keepPanelOpen = Boolean(
      state.panel && !state.panel.hidden && state.creditTab && state.creditTab.getAttribute("aria-selected") === "true"
    );
    const replacementPanel =
      localeChanged && state.panel && state.panel.isConnected ? recreatePanel(state.panel) : null;
    hideCreditPanel();
    if (state.creditTab && state.creditTab.isConnected) state.creditTab.remove();
    const existingTab = tabBar.querySelector('[data-mwi-credit-tab="true"]');
    if (existingTab) existingTab.remove();

    if (replacementPanel) state.panel = replacementPanel;
    else if (state.panel && !state.panel.isConnected) state.panel = null;
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
        if (!state.creditTab || state.creditTab.parentElement !== tabBar || !state.creditTab.contains(event.target))
          hideCreditPanel();
      });
    }
    state.panel = panel;
    state.panelLocale = locale;
    state.creditTab = creditTab;
    if (state.shrineGuideEnabled) {
      startShrineGuideObserver();
      refreshGuildUpgrade(panel);
    } else {
      scheduleShrineGuide();
    }
    if (keepPanelOpen) showCreditPanel(panelHost, tabBar);
    stopSidebarIntegrationObserver();
    return true;
  }

  function scheduleSidebarIntegration() {
    sidebarIntegrationTask.schedule();
  }

  function sidebarIntegrationMounted() {
    return Boolean(state.panel && state.panel.isConnected && state.creditTab && state.creditTab.isConnected);
  }

  function stopSidebarIntegrationObserver() {
    if (!state.sidebarIntegrationObserver) return;
    state.sidebarIntegrationObserver.disconnect();
    state.sidebarIntegrationObserver = null;
  }

  function watchForSidebarIntegration() {
    if (sidebarIntegrationMounted() || state.sidebarIntegrationObserver || typeof MutationObserver !== "function")
      return;
    const target = document.documentElement || document;
    state.sidebarIntegrationObserver = new MutationObserver(() => {
      if (sidebarIntegrationMounted()) {
        stopSidebarIntegrationObserver();
        return;
      }
      if (!sidebarIntegrationTask.pending()) scheduleSidebarIntegration();
    });
    state.sidebarIntegrationObserver.observe(target, { childList: true, subtree: true });
  }

  function bootstrapSidebarIntegration() {
    if (!ensureSidebarIntegration()) watchForSidebarIntegration();
  }

  function exchangeModalInteractionHandler(event) {
    const target = event.target && (event.target.nodeType === 1 ? event.target : event.target.parentElement);
    if (target && target.closest && target.closest('[class*="GuildPanel_exchangeModalContent"]'))
      scheduleGuildExchangeAdvisor();
  }

  function disposeRuntime() {
    disposePanelShell();
    disposeConstructionView();
    guildTokenBudgetRefreshTask.dispose();
    marketDataRefreshTask.dispose();
    inventoryDataRefreshTask.dispose();
    guildDataRefreshTask.dispose();
    sidebarIntegrationTask.dispose();
    exchangeAdvisorFrameTask.dispose();
    stopSidebarIntegrationObserver();
    window.clearTimeout(state.refreshTimer);
    window.clearInterval(state.panelSearchTimer);
    stopShrineGuideObserver();
    if (state.exchangeAdvisorRootObserver) state.exchangeAdvisorRootObserver.disconnect();
    if (state.exchangeAdvisorModalObserver) state.exchangeAdvisorModalObserver.disconnect();
    if (state.exchangeAdvisorRepositionHandler) {
      const reposition = state.exchangeAdvisorRepositionHandler;
      window.removeEventListener("resize", reposition);
      window.removeEventListener("orientationchange", reposition);
      window.removeEventListener("scroll", reposition, true);
    }
    document.removeEventListener("pointerdown", activateCreditTabFromPointer, true);
    document.removeEventListener("click", activateCreditTabFromPointer, true);
    document.removeEventListener("input", exchangeModalInteractionHandler, true);
    document.removeEventListener("click", exchangeModalInteractionHandler, true);
    window.removeEventListener("resize", scheduleSidebarIntegration);
    window.removeEventListener("orientationchange", scheduleSidebarIntegration);
  }

  hydrateBridgeData();
  extractItemDetailsFromReact();
  hydrateLocalInitData();
  document.addEventListener("pointerdown", activateCreditTabFromPointer, true);
  document.addEventListener("click", activateCreditTabFromPointer, true);
  document.addEventListener("input", exchangeModalInteractionHandler, true);
  document.addEventListener("click", exchangeModalInteractionHandler, true);
  state.panelSearchTimer = window.setInterval(bootstrapSidebarIntegration, 3000);
  window.addEventListener("resize", scheduleSidebarIntegration, { passive: true });
  window.addEventListener("orientationchange", scheduleSidebarIntegration, { passive: true });
  window.addEventListener("pagehide", disposeRuntime, { once: true });
  if (document.body) startGuildExchangeAdvisor();
  else document.addEventListener("DOMContentLoaded", startGuildExchangeAdvisor, { once: true });
  bootstrapSidebarIntegration();
})();
