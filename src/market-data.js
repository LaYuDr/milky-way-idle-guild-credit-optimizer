(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MwiGuildCreditMarketData = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

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
    for (const [level, quote] of Object.entries(update.levels || {})) {
      // A newly opened order book is authoritative for that item and level.
      // Replace, rather than merge, so an absent side cannot leave stale data.
      levels[level] = { ...quote };
      revisionByLevel[level] = revision;
      receivedAtByLevel[level] = receivedAt;
    }
    if (!Object.keys(levels).length) return false;
    liveData[update.itemHrid] = {
      levels,
      revisionByLevel,
      receivedAtByLevel,
      revision,
      receivedAt
    };
    return true;
  }

  function expireLiveMarketData(liveData, options) {
    if (!liveData || typeof liveData !== "object") return false;
    const previousTimestamp = normalizeMarketTimestamp(options && options.previousSnapshotTimestamp);
    const nextTimestamp = normalizeMarketTimestamp(options && options.nextSnapshotTimestamp);
    const coveredRevision = Number(options && options.coveredRevision);
    if (previousTimestamp <= 0 || nextTimestamp <= previousTimestamp || !Number.isSafeInteger(coveredRevision)) return false;

    let changed = false;
    for (const [itemHrid, entry] of Object.entries(liveData)) {
      const levels = { ...(entry && entry.levels || {}) };
      const revisionByLevel = { ...(entry && entry.revisionByLevel || {}) };
      const receivedAtByLevel = { ...(entry && entry.receivedAtByLevel || {}) };
      for (const level of Object.keys(levels)) {
        const revision = Number(revisionByLevel[level] ?? entry.revision);
        if (Number.isSafeInteger(revision) && revision <= coveredRevision) {
          delete levels[level];
          delete revisionByLevel[level];
          delete receivedAtByLevel[level];
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
          revision: revisions.length ? Math.max(...revisions) : entry.revision,
          receivedAt: receivedTimes.length ? Math.max(...receivedTimes) : entry.receivedAt
        };
      }
    }
    return changed;
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
    expireLiveMarketData,
    resolveMarketPrice
  };
});
