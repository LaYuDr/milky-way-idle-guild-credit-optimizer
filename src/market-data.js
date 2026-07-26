(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MwiGuildCreditMarketData = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const LIVE_MARKET_CACHE_SCHEMA_VERSION = 1;
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
    const snapshotTimestamp = normalizeMarketTimestamp(options && options.snapshotTimestamp);
    for (const [level, quote] of Object.entries(update.levels || {})) {
      // A newly opened order book is authoritative for that item and level.
      // Replace, rather than merge, so an absent side cannot leave stale data.
      levels[level] = { ...quote };
      revisionByLevel[level] = revision;
      receivedAtByLevel[level] = receivedAt;
      snapshotTimestampByLevel[level] = snapshotTimestamp;
    }
    if (!Object.keys(levels).length) return false;
    liveData[update.itemHrid] = {
      levels,
      revisionByLevel,
      receivedAtByLevel,
      snapshotTimestampByLevel,
      revision,
      receivedAt
    };
    return true;
  }

  function reconcileLiveMarketData(liveData, options) {
    if (!liveData || typeof liveData !== "object") return { changed: false, expired: false };
    const previousTimestamp = normalizeMarketTimestamp(options && options.previousSnapshotTimestamp);
    const nextTimestamp = normalizeMarketTimestamp(options && options.nextSnapshotTimestamp);
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
      for (const level of Object.keys(levels)) {
        const revision = Number(revisionByLevel[level] ?? entry.revision);
        const baselineTimestamp = normalizeMarketTimestamp(
          snapshotTimestampByLevel[level]
          ?? entry.snapshotTimestamp
          ?? previousTimestamp
        );
        if (Number.isSafeInteger(revision) && revision > coveredRevision) {
          if (nextTimestamp > baselineTimestamp) {
            snapshotTimestampByLevel[level] = nextTimestamp;
            changed = true;
          }
          continue;
        }
        if (baselineTimestamp > 0 && nextTimestamp > baselineTimestamp) {
          delete levels[level];
          delete revisionByLevel[level];
          delete receivedAtByLevel[level];
          delete snapshotTimestampByLevel[level];
          changed = true;
          expired = true;
        } else if (baselineTimestamp <= 0) {
          // A live quote can arrive before the plugin has loaded its first
          // public snapshot. Treat that first snapshot as the quote's baseline
          // instead of discarding a potentially newer live observation.
          snapshotTimestampByLevel[level] = nextTimestamp;
          changed = true;
        }
      }
      if (!Object.keys(levels).length) {
        delete liveData[itemHrid];
      } else {
        const revisions = Object.values(revisionByLevel).map(Number).filter(Number.isSafeInteger);
        const receivedTimes = Object.values(receivedAtByLevel).map(Number).filter(Number.isFinite);
        liveData[itemHrid] = {
          levels,
          revisionByLevel,
          receivedAtByLevel,
          snapshotTimestampByLevel,
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
      || stored.schemaVersion !== LIVE_MARKET_CACHE_SCHEMA_VERSION
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
      let levelCount = 0;
      for (const [rawLevel, rawQuote] of Object.entries(entry.levels || {})) {
        if (levelCount >= MAX_LEVELS_PER_ITEM) break;
        const level = normalizeEnhancementLevel(rawLevel);
        if (level === null || !rawQuote || typeof rawQuote !== "object" || Array.isArray(rawQuote)) continue;
        const quote = Object.create(null);
        for (const field of ["a", "b"]) {
          if (!Object.prototype.hasOwnProperty.call(rawQuote, field)) continue;
          const price = normalizeCachedPrice(rawQuote[field]);
          if (price !== null) quote[field] = price;
        }
        if (!Object.keys(quote).length) continue;
        const levelKey = String(level);
        const levelRevision = Number(
          entry.revisionByLevel && entry.revisionByLevel[levelKey] !== undefined
            ? entry.revisionByLevel[levelKey]
            : entry.revision
        );
        const receivedAt = Number(
          entry.receivedAtByLevel && entry.receivedAtByLevel[levelKey] !== undefined
            ? entry.receivedAtByLevel[levelKey]
            : entry.receivedAt
        );
        if (!Number.isSafeInteger(levelRevision) || levelRevision <= 0
          || !Number.isFinite(receivedAt) || receivedAt <= 0) continue;
        levels[levelKey] = quote;
        revisionByLevel[levelKey] = levelRevision;
        receivedAtByLevel[levelKey] = receivedAt;
        snapshotTimestampByLevel[levelKey] = normalizeMarketTimestamp(
          entry.snapshotTimestampByLevel && entry.snapshotTimestampByLevel[levelKey] !== undefined
            ? entry.snapshotTimestampByLevel[levelKey]
            : entry.snapshotTimestamp
        );
        revision = Math.max(revision, levelRevision);
        levelCount += 1;
      }
      if (!Object.keys(levels).length) continue;
      const revisions = Object.values(revisionByLevel);
      const receivedTimes = Object.values(receivedAtByLevel);
      liveData[itemHrid] = {
        levels,
        revisionByLevel,
        receivedAtByLevel,
        snapshotTimestampByLevel,
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
    normalizeMarketOrderBooksUpdate,
    applyLiveMarketUpdate,
    reconcileLiveMarketData,
    expireLiveMarketData,
    restoreLiveMarketData,
    serializeLiveMarketData,
    resolveMarketPrice
  };
});
