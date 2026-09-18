(function (root, factory) {
  const api = factory(
    typeof module !== "undefined" && module.exports ? require("./runtime/config.js") : root.MwiGuildCreditConfig
  );
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MwiGuildTrialHistory = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (config) {
  "use strict";

  function objectData(value) {
    try {
      const parsed = typeof value === "string" ? JSON.parse(value) : value;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  function updateContext(previous = {}, message) {
    if (!message || typeof message !== "object") return previous;
    let next = previous;
    if (message.guildTrialDetailMap) next = { ...next, details: message.guildTrialDetailMap };
    if (Object.hasOwn(message, "guild")) {
      const guild = message.guild;
      const changed = String(guild?.id || "") !== String(previous.guild?.id || "");
      next = { ...next, guild, members: changed ? {} : previous.members };
    }
    if (message.guildSharableCharacterMap) next = { ...next, members: message.guildSharableCharacterMap };
    return next;
  }

  // The official stats response contains every trial. Only completed parties
  // have final statistics; keep the entire row, including future server fields.
  function completedSnapshots(context, message, capturedAt = Date.now()) {
    if (message?.type !== "guild_trial_stats_updated" || !Array.isArray(message.guildTrialStatList)) return [];
    const guild = context?.guild;
    if (!guild?.id || String(message.guildId) !== String(guild.id)) return [];
    const weekStartAt =
      typeof guild.currentWeekStartAt === "number" ? guild.currentWeekStartAt : Date.parse(guild.currentWeekStartAt);
    if (!Number.isSafeInteger(weekStartAt) || weekStartAt <= 0 || weekStartAt > capturedAt) return [];
    const trials = objectData(guild.currentTrialsData);
    const snapshots = [];
    for (const kind of ["skilling", "combat"]) {
      for (const [trialHrid, party] of Object.entries(trials[kind]?.parties || {})) {
        if (party?.done !== true) continue;
        const rows = message.guildTrialStatList.filter((row) => row && row.trialHrid === trialHrid);
        // Empty responses can occur while the server is publishing stats.
        // Never let them overwrite an already captured complete result.
        if (!rows.length) continue;
        const members = {};
        for (const row of rows) {
          const member = context.members?.[row.characterId];
          if (member) members[row.characterId] = member;
        }
        snapshots.push(
          JSON.parse(
            JSON.stringify({
              schemaVersion: 1,
              key: JSON.stringify([String(guild.id), weekStartAt, trialHrid]),
              guildId: String(guild.id),
              guildName: String(guild.name || guild.id),
              weekStartAt,
              trialHrid,
              kind,
              capturedAt,
              points: trials.points?.[trialHrid] ?? null,
              party,
              rows,
              members,
              trialDetail: context.details?.[trialHrid] || null
            })
          )
        );
      }
    }
    return snapshots;
  }

  function validSnapshot(value) {
    if (value?.schemaVersion === 2) return validManualSnapshot(value);
    return Boolean(
      value &&
      value.schemaVersion === 1 &&
      typeof value.guildId === "string" &&
      Number.isSafeInteger(value.weekStartAt) &&
      value.weekStartAt > 0 &&
      typeof value.trialHrid === "string" &&
      ["combat", "skilling"].includes(value.kind) &&
      value.key === JSON.stringify([value.guildId, value.weekStartAt, value.trialHrid]) &&
      Number.isFinite(value.capturedAt) &&
      value.party?.done === true &&
      Array.isArray(value.rows) &&
      value.rows.length &&
      value.rows.every((row) => row && row.trialHrid === value.trialHrid)
    );
  }

  const MAX_IMPORT_BYTES = 10 * 1024 * 1024;
  const isObject = (value) => Boolean(value && typeof value === "object" && !Array.isArray(value));
  const isText = (value) => typeof value === "string" && value.length > 0 && value.length <= 500;
  const isMetric = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0;
  const validDate = (value) =>
    value === null ||
    (typeof value === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      Number.isFinite(Date.parse(value)) &&
      new Date(value).toISOString().slice(0, 10) === value);

  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  function weekNumber(weekStartAt) {
    return Math.floor((weekStartAt - config.GUILD_TRIAL_FIRST_START_AT) / WEEK_MS) + 1;
  }

  // Calendar dates are interpreted in UTC, independent of browser timezone.
  // Never infer a year from the current clock or a yearless chat timestamp.
  function normalizeSnapshot(record) {
    if (record?.schemaVersion !== 2 || typeof record.trialDate !== "string") return record;
    const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(record.trialDate);
    if (!match) return record;
    const trialDate = `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
    if (!validDate(trialDate)) return record;
    const weekStartAt =
      config.GUILD_TRIAL_FIRST_START_AT +
      Math.floor((Date.parse(trialDate) - config.GUILD_TRIAL_FIRST_START_AT) / WEEK_MS) * WEEK_MS;
    return { ...record, trialDate, weekStartAt: record.weekStartAt === null ? weekStartAt : record.weekStartAt };
  }

  function validManualSnapshot(value) {
    return Boolean(
      value &&
      value.schemaVersion === 2 &&
      value.source === "manual" &&
      isText(value.recordId) &&
      value.key === JSON.stringify(["manual", value.recordId]) &&
      value.guildId === null &&
      (value.guildName === null || isText(value.guildName)) &&
      validDate(value.trialDate) &&
      (value.trialDate === null
        ? value.weekStartAt === null
        : Date.parse(value.trialDate) >= config.GUILD_TRIAL_FIRST_START_AT &&
          (value.weekStartAt === null ||
            value.weekStartAt === normalizeSnapshot({ ...value, weekStartAt: null }).weekStartAt)) &&
      value.capturedAt === null &&
      isText(value.trialHrid) &&
      ["combat", "skilling"].includes(value.kind) &&
      isObject(value.party) &&
      value.party.done === true &&
      isObject(value.members) &&
      Array.isArray(value.rows) &&
      value.rows.length > 0 &&
      value.rows.every(
        (row) =>
          isObject(row) &&
          row.trialHrid === value.trialHrid &&
          row.characterId === null &&
          isText(row.memberKey) &&
          Object.hasOwn(value.members, row.memberKey) &&
          isText(value.members[row.memberKey]?.name)
      )
    );
  }

  function snapshotTime(record) {
    return record.weekStartAt || (record.trialDate ? Date.parse(record.trialDate) : 0);
  }

  function compareSnapshots(a, b) {
    return snapshotTime(b) - snapshotTime(a) || a.trialHrid.localeCompare(b.trialHrid);
  }

  function importError(code, index) {
    const error = new Error(code);
    error.code = code;
    if (index !== undefined) error.recordIndex = index + 1;
    throw error;
  }

  function parseImport(text) {
    if (typeof text !== "string" || text.length > MAX_IMPORT_BYTES) importError("trialImportTooLarge");
    let value;
    try {
      value = JSON.parse(text.replace(/^\uFEFF/, ""), (key, item) => {
        if (["__proto__", "constructor", "prototype"].includes(key)) throw new Error("unsafe key");
        return item;
      });
    } catch (_) {
      importError("trialImportInvalidJson");
    }
    if (
      !isObject(value) ||
      ![1, 2].includes(value.schemaVersion) ||
      !Array.isArray(value.records) ||
      !value.records.length ||
      value.records.length > 1000
    )
      importError("trialImportInvalidFile");
    const keys = new Set();
    value.records = value.records.map(normalizeSnapshot);
    for (const [index, record] of value.records.entries()) {
      if (
        !validSnapshot(record) ||
        !isObject(record.members) ||
        !isObject(record.party) ||
        !isText(record.trialHrid) ||
        record.rows.length > 1000 ||
        !(record.points === null || isMetric(record.points)) ||
        !(
          record.party.highestTier === undefined ||
          record.party.highestTier === null ||
          isMetric(record.party.highestTier)
        )
      )
        importError("trialImportInvalidRecord", index);
      if (
        record.schemaVersion === 1 &&
        (!isText(record.guildId) || !isText(record.guildName) || record.capturedAt <= 0 || record.source === "manual")
      )
        importError("trialImportInvalidRecord", index);
      const fields =
        record.kind === "combat" ? ["damageDealt", "healingDone", "premitigatedDamageTaken"] : ["workDone"];
      const memberKeys = new Set();
      for (const row of record.rows) {
        const id = record.source === "manual" ? row.memberKey : row.characterId;
        if (
          !(isText(id) || (Number.isSafeInteger(id) && id > 0)) ||
          memberKeys.has(String(id)) ||
          fields.some((field) => !(record.schemaVersion === 1 && row[field] === undefined) && !isMetric(row[field]))
        )
          importError("trialImportInvalidRecord", index);
        memberKeys.add(String(id));
        const member = record.members[id];
        if (member !== undefined && (!isObject(member) || !isText(member.name)))
          importError("trialImportInvalidRecord", index);
      }
      if (keys.has(record.key)) importError("trialImportDuplicateKey", index);
      keys.add(record.key);
    }
    return value.records;
  }

  function contentSignature(value) {
    if (Array.isArray(value)) return `[${value.map(contentSignature).join(",")}]`;
    if (isObject(value))
      return `{${Object.keys(value)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${contentSignature(value[key])}`)
        .join(",")}}`;
    return JSON.stringify(value);
  }

  function previewImport(incoming, existing) {
    const byKey = new Map(existing.map((record) => [record.key, normalizeSnapshot(record)]));
    return incoming.map(normalizeSnapshot).map((record) => {
      const previous = byKey.get(record.key);
      let status = !previous
        ? "new"
        : contentSignature(previous) === contentSignature(record)
          ? "duplicate"
          : "conflict";
      if (status === "conflict" && validManualSnapshot(previous) && validManualSnapshot(record)) {
        const withoutDate = (value) => contentSignature({ ...value, trialDate: null, weekStartAt: null });
        if (withoutDate(previous) === withoutDate(record)) {
          if (previous.trialDate === null && record.trialDate !== null) status = "dated";
          // Reimporting an older file must not erase known dates.
          else if (previous.trialDate !== null && record.trialDate === null) status = "duplicate";
        }
      }
      return { record, status };
    });
  }

  return {
    updateContext,
    completedSnapshots,
    validSnapshot,
    parseImport,
    previewImport,
    compareSnapshots,
    normalizeSnapshot,
    weekNumber,
    MAX_IMPORT_BYTES
  };
});
