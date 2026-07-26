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
