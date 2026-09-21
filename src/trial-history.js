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
      const weekChanged = timestamp(guild?.currentWeekStartAt) !== timestamp(previous.guild?.currentWeekStartAt);
      next = {
        ...next,
        guild,
        members: changed ? {} : previous.members,
        roster: changed ? null : previous.roster,
        signups: changed || weekChanged ? {} : previous.signups,
        signupLevels: changed || weekChanged ? {} : previous.signupLevels
      };
    }
    if (message.guildId != null && String(message.guildId) !== String(next.guild?.id)) return next;
    if (message.guildSharableCharacterMap) next = { ...next, members: message.guildSharableCharacterMap };
    // Stats can include names for historical participants. Only a current roster
    // response can establish membership; keep it separate from captured names.
    const roster =
      message.guildCharacterMap ??
      (message.type === "guild_characters_updated" ? message.guildSharableCharacterMap : null);
    if (next.guild?.id != null && roster && typeof roster === "object" && !Array.isArray(roster)) {
      next = {
        ...next,
        roster: Object.fromEntries(
          Object.entries(roster).map(([id, member]) => [
            id,
            { name: message.guildSharableCharacterMap?.[id]?.name || member?.name || null }
          ])
        )
      };
    }
    if (isObject(message.guildCharacterMap)) next = { ...next, signups: message.guildCharacterMap };
    if (isObject(message.guildTrialSignupLevelMap)) next = { ...next, signupLevels: message.guildTrialSignupLevelMap };
    else if (message.type === "guild_characters_updated") next = { ...next, signupLevels: {} };
    if (message.type === "guild_trial_signup_updated" && next.signups?.[message.characterId]) {
      next = {
        ...next,
        signups: {
          ...next.signups,
          [message.characterId]: {
            ...next.signups[message.characterId],
            signedUpSkillingTrialHrid: message.signedUpSkillingTrialHrid,
            signedUpCombatTrialHrid: message.signedUpCombatTrialHrid,
            signupWeekStartAt: message.signupWeekStartAt
          }
        },
        signupLevels: { ...next.signupLevels, [message.characterId]: message.trialSignupLevels || {} }
      };
    }
    return next;
  }

  function timestamp(value) {
    return typeof value === "number" ? value : Date.parse(value);
  }

  function memberLevel(record, row) {
    const level = record.memberLevels?.[row.memberKey ?? row.characterId];
    return isMetric(level) ? level : null;
  }

  function withMemberLevels(record, context = {}) {
    if (
      record.schemaVersion !== 1 ||
      String(context.guild?.id) !== record.guildId ||
      timestamp(context.guild?.currentWeekStartAt) !== record.weekStartAt
    )
      return record;
    const memberLevels = { ...record.memberLevels };
    let changed = false;
    for (const row of record.rows) {
      if (memberLevel(record, row) !== null) continue;
      const signup = context.signups?.[row.characterId];
      const project = record.kind === "combat" ? signup?.signedUpCombatTrialHrid : signup?.signedUpSkillingTrialHrid;
      if (project !== record.trialHrid || timestamp(signup?.signupWeekStartAt) !== record.weekStartAt) continue;
      const levels = context.signupLevels?.[row.characterId];
      const level = record.kind === "combat" ? levels?.combatLevel : levels?.skillingTrialLevel;
      if (!isMetric(level)) continue;
      memberLevels[row.characterId] = level;
      changed = true;
    }
    return changed ? { ...record, memberLevels } : record;
  }

  function validMemberLevels(record) {
    if (record.memberLevels === undefined) return true;
    if (!isObject(record.memberLevels) || !Array.isArray(record.rows)) return false;
    const ids = new Set(record.rows.map((row) => String(row?.memberKey ?? row?.characterId)));
    return Object.entries(record.memberLevels).every(
      ([id, level]) => ids.has(id) && (level === null || isMetric(level))
    );
  }

  function memberIdentity(record, row) {
    return {
      id: row.characterId == null ? null : String(row.characterId),
      name: record.members?.[row.memberKey ?? row.characterId]?.name || ""
    };
  }

  function sameMember(a, b) {
    if (a.id !== null && b.id !== null) return a.id === b.id;
    // Manual imports have no character ID; only an exact, known name can match.
    return Boolean(a.name && a.name === b.name);
  }

  function memberAbsent(record, row, context = {}) {
    if (!context.guild || !context.roster) return false;
    const sameGuild =
      record.guildId != null
        ? String(record.guildId) === String(context.guild.id)
        : Boolean(record.guildName && record.guildName === context.guild.name);
    if (!sameGuild) return false;
    if (row.characterId != null) return !Object.hasOwn(context.roster, String(row.characterId));
    const name = record.members?.[row.memberKey]?.name;
    const members = Object.values(context.roster);
    // ID-less imports can only be checked by name when every roster name is known.
    return Boolean(name && members.every((member) => member.name) && !members.some((member) => member.name === name));
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
            JSON.stringify(
              withMemberLevels(
                {
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
                },
                context
              )
            )
          )
        );
      }
    }
    return snapshots;
  }

  function validSnapshot(value) {
    if (!validMemberLevels(value || {})) return false;
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

  function historyProjectKey(record) {
    return JSON.stringify([record.kind, record.trialHrid]);
  }

  // Group records for display only: never combine member rows or discard duplicates.
  function historyProjects(records, details = {}) {
    const groups = new Map();
    for (const record of records) {
      const key = historyProjectKey(record);
      if (!groups.has(key)) groups.set(key, { key, kind: record.kind, records: [] });
      groups.get(key).records.push(record);
    }
    const order = (group) => {
      const record = group.records[0];
      if (group.kind === "skilling") {
        const skill = String(details[record.trialHrid]?.skillHrid || record.trialDetail?.skillHrid || record.trialHrid)
          .split("/")
          .pop();
        const index = config.GUILD_TRIAL_SKILL_ORDER.indexOf(skill);
        return index >= 0 ? index : Number.MAX_SAFE_INTEGER;
      }
      const index =
        details[record.trialHrid]?.sortIndex ??
        group.records.find((item) => Number.isFinite(item.trialDetail?.sortIndex))?.trialDetail.sortIndex;
      return Number.isFinite(index) ? index : Number.MAX_SAFE_INTEGER;
    };
    return [...groups.values()].sort(
      (a, b) =>
        Number(a.kind === "combat") - Number(b.kind === "combat") || order(a) - order(b) || a.key.localeCompare(b.key)
    );
  }

  function historyWeeks(records) {
    const groups = new Map();
    for (const record of records) {
      const normalized = normalizeSnapshot(record);
      const ordinal = normalized.weekStartAt ? weekNumber(normalized.weekStartAt) : null;
      const key = ordinal === null ? "unknown" : String(ordinal);
      if (!groups.has(key))
        groups.set(key, {
          key,
          weekNumber: ordinal,
          weekStartAt: ordinal === null ? null : config.GUILD_TRIAL_FIRST_START_AT + (ordinal - 1) * WEEK_MS,
          records: []
        });
      groups.get(key).records.push(record);
    }
    return [...groups.values()].sort((a, b) => (b.weekNumber ?? -1) - (a.weekNumber ?? -1));
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

  // Official v1 statistics omit zero fields; explicit null and manual gaps stay unknown.
  function metricValue(record, row, field) {
    const value = row[field];
    if (value === undefined && record.schemaVersion === 1) return 0;
    return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
  }

  function displayRows(record) {
    const rows = [...record.rows];
    if (record.kind !== "skilling") return rows;
    // Stable sorting preserves source order for ties; unknown values follow zero.
    return rows.sort((a, b) => (metricValue(record, b, "workDone") ?? -1) - (metricValue(record, a, "workDone") ?? -1));
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
    historyProjectKey,
    historyProjects,
    historyWeeks,
    metricValue,
    displayRows,
    memberAbsent,
    memberIdentity,
    sameMember,
    memberLevel,
    withMemberLevels,
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
