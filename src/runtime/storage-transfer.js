(function (root, factory) {
  const api = factory(
    typeof module !== "undefined" && module.exports ? require("./config.js") : root.MwiGuildCreditConfig,
    typeof module !== "undefined" && module.exports ? require("./storage-codec.js") : root.MwiGuildStorageCodec
  );
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MwiGuildStorageTransfer = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (config, codec) {
  "use strict";

  const FORMAT = "mwi-guild-local-backup";
  const MAX_TEXT = 32 * 1024 * 1024;
  const MAX_FILE_BYTES = 64 * 1024 * 1024;
  const EXACT_KEYS = new Set([
    config.PRICE_REFERENCE_STORAGE_KEY,
    config.UI_STATE_STORAGE_KEY,
    config.MARKET_LIVE_STORAGE_KEY,
    config.MARKETPLACE_SNAPSHOT_STORAGE_KEY,
    config.MARKETPLACE_REQUEST_STATE_STORAGE_KEY,
    "mwi-official-item-name-catalog-v1"
  ]);
  const planner = `${config.GUILD_BUILDING_PLAN_STORAGE_PREFIX}:[a-zA-Z0-9.-]+:[^:]+`;
  const scoped = [
    new RegExp(`^${planner}$`),
    new RegExp(`^${config.TRIAL_DISPLAY_STORAGE_PREFIX}:${planner}(?::view|:ranking-order)?$`),
    new RegExp(`^${config.TRIAL_HISTORY_STORAGE_PREFIX}:${planner}:[^:]+$`),
    new RegExp(`^mwi-guild-trial-recovery-v1:${planner}:[^:]+:[^:]+$`)
  ];
  function ownsKey(key) {
    return typeof key === "string" && (EXACT_KEYS.has(key) || scoped.some((pattern) => pattern.test(key)));
  }
  function sameEntries(left, right) {
    return (
      left.length === right.length &&
      left.every((entry, index) => entry.key === right[index].key && entry.rawValue === right[index].rawValue)
    );
  }
  function byteSize(entries) {
    return entries.reduce((sum, entry) => sum + 2 * (entry.key.length + entry.rawValue.length), 0);
  }
  function fail(code) {
    throw Object.assign(new Error(code), { code });
  }

  function create({ storage, origin, version, now = Date.now }) {
    function keys() {
      const result = [];
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (ownsKey(key)) result.push(key);
      }
      return [...new Set(result)].sort();
    }
    function readEntries() {
      return keys().map((key) => {
        const rawValue = storage.getItem(key);
        if (typeof rawValue !== "string") fail("cacheDataChanged");
        return { key, rawValue };
      });
    }
    function snapshot() {
      const entries = readEntries();
      if (!sameEntries(entries, readEntries())) fail("cacheDataChanged");
      return { format: FORMAT, schemaVersion: 1, origin, pluginVersion: version, exportedAt: now(), entries };
    }
    function validate(backup) {
      if (
        backup?.format !== FORMAT ||
        backup.schemaVersion !== 1 ||
        !Array.isArray(backup.entries) ||
        backup.entries.length > 20000 ||
        !Number.isSafeInteger(backup.exportedAt) ||
        backup.exportedAt <= 0 ||
        typeof backup.pluginVersion !== "string" ||
        !/^\d+\.\d+\.\d+$/.test(backup.pluginVersion)
      )
        fail("cacheInvalidBackup");
      if (backup.origin !== origin) fail("cacheWrongOrigin");
      const seen = new Set();
      const entries = backup.entries.map((entry) => {
        if (
          !entry ||
          !ownsKey(entry.key) ||
          entry.key.length > 4096 ||
          seen.has(entry.key) ||
          typeof entry.rawValue !== "string" ||
          entry.rawValue.length > MAX_TEXT
        )
          fail("cacheInvalidBackup");
        seen.add(entry.key);
        return { key: entry.key, rawValue: entry.rawValue };
      });
      return { ...backup, entries: entries.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)) };
    }
    function parse(text) {
      if (typeof text !== "string" || text.length > MAX_TEXT) fail("cacheFileTooLarge");
      let value;
      try {
        value = JSON.parse(text);
      } catch (_) {
        fail("cacheInvalidBackup");
      }
      const backup = validate(value);
      // Use the same code-unit order as Storage snapshots, regardless of locale.
      backup.entries.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
      return backup;
    }
    function verifyFile(text, expected) {
      return sameEntries(parse(text).entries, expected.entries);
    }
    function preview(backup) {
      const incoming = validate(backup).entries;
      const current = snapshot();
      const existing = new Map(current.entries.map((entry) => [entry.key, entry.rawValue]));
      return {
        current,
        entries: incoming.map((entry) => ({
          ...entry,
          status: !existing.has(entry.key)
            ? "new"
            : existing.get(entry.key) === entry.rawValue
              ? "duplicate"
              : "conflict"
        }))
      };
    }

    function mutate(expected, changes) {
      let generation;
      const written = [];
      try {
        if (!sameEntries(expected.entries, snapshot().entries)) fail("cacheDataChanged");
        if (!changes.length) return { status: "applied", changed: 0, needsReload: false };
        generation = globalThis.crypto?.randomUUID?.() || `${now()}-${Math.random()}`;
        storage.setItem(codec.GENERATION_KEY, generation);
        if (storage.getItem(codec.GENERATION_KEY) !== generation) fail("cacheSaveFailed");
        for (const change of changes) {
          if (storage.getItem(codec.GENERATION_KEY) !== generation) fail("cacheDataChanged");
          if (storage.getItem(change.key) !== change.before) fail("cacheDataChanged");
          if (change.after === null) storage.removeItem(change.key);
          else storage.setItem(change.key, change.after);
          // Log before verification, so even a silently ignored write is handled.
          written.push(change);
          if (storage.getItem(change.key) !== change.after) fail("cacheSaveFailed");
        }
        const desired = new Map(expected.entries.map((entry) => [entry.key, entry.rawValue]));
        for (const { key, after } of changes) {
          if (after === null) desired.delete(key);
          else desired.set(key, after);
        }
        const actual = snapshot().entries;
        const target = [...desired]
          .map(([key, rawValue]) => ({ key, rawValue }))
          .sort((a, b) => (a.key < b.key ? -1 : 1));
        if (storage.getItem(codec.GENERATION_KEY) !== generation || !sameEntries(target, actual))
          fail("cacheDataChanged");
        return { status: "applied", changed: changes.length, needsReload: true };
      } catch (error) {
        let remaining = 0;
        for (const { key, before, after } of written.reverse()) {
          try {
            // Never roll back another page's newer value.
            if (storage.getItem(key) === after) {
              if (before === null) storage.removeItem(key);
              else storage.setItem(key, before);
            }
            if (storage.getItem(key) !== before) remaining += 1;
          } catch (_) {
            remaining += 1;
          }
        }
        return {
          status: remaining ? "partial" : error?.code === "cacheDataChanged" ? "stale" : "failed",
          changed: remaining,
          needsReload: generation !== undefined
        };
      }
    }
    function clear(backup) {
      validate(backup);
      return mutate(
        backup,
        backup.entries.map(({ key, rawValue }) => ({ key, before: rawValue, after: null }))
      );
    }
    function restore(plan, overwrite = false) {
      // Revalidate at the write boundary; never trust a caller-supplied status.
      validate({ ...plan.current, entries: plan.entries });
      const previous = new Map(plan.current.entries.map((entry) => [entry.key, entry.rawValue]));
      const changes = plan.entries.flatMap(({ key, rawValue }) => {
        const before = previous.get(key) ?? null;
        return before === rawValue || (before !== null && !overwrite) ? [] : [{ key, before, after: rawValue }];
      });
      return mutate(plan.current, changes);
    }
    return { snapshot, parse, verifyFile, preview, clear, restore, pauseWrites: () => codec.pauseStorage(storage) };
  }

  return { create, ownsKey, sameEntries, byteSize, FORMAT, MAX_TEXT, MAX_FILE_BYTES };
});
