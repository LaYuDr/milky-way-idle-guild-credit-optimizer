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

  function updateContext(previous = {}, message, observedAt = Date.now()) {
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
        membershipEvidence: changed ? [] : previous.membershipEvidence,
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
    if (next.guild?.id != null && isObject(message.guildCharacterMap)) {
      next = {
        ...next,
        membershipEvidence: Object.entries(message.guildCharacterMap).flatMap(([id, member]) => {
          const joinedAt = timestamp(member?.joinTime);
          return Number.isSafeInteger(joinedAt) && joinedAt > 0 && joinedAt <= observedAt
            ? [{ characterId: String(id), name: next.members?.[id]?.name || member?.name || "", joinedAt, observedAt }]
            : [];
        })
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

  // Historical joins may belong to a previous membership period. Only use the
  // current guild roster's evidence when displaying a member's joining time.
  function currentMemberJoinedAt(context = {}, identity = {}) {
    if (context.guild?.id == null || identity.id == null || !Object.hasOwn(context.roster || {}, identity.id))
      return null;
    const entry = context.membershipEvidence?.find((entry) => entry.characterId === String(identity.id));
    return entry &&
      Number.isSafeInteger(entry.joinedAt) &&
      entry.joinedAt > 0 &&
      entry.joinedAt <= 8640000000000000 &&
      Number.isSafeInteger(entry.observedAt) &&
      entry.joinedAt <= entry.observedAt
      ? entry.joinedAt
      : null;
  }

  function currentMembershipRankings(context = {}) {
    if (context.guild?.id == null) return [];
    return Object.entries(context.roster || {}).map(([id, member]) => ({
      key: JSON.stringify(["id", id]),
      id,
      name: member?.name || context.members?.[id]?.name || "",
      joinedAt: currentMemberJoinedAt(context, { id })
    }));
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

  function mergeMembershipEvidence(...lists) {
    const merged = new Map();
    for (const entry of lists.flat()) {
      const key = JSON.stringify([entry.characterId, entry.joinedAt]);
      if (!merged.has(key) || merged.get(key).observedAt < entry.observedAt) merged.set(key, entry);
    }
    return [...merged.values()].sort((a, b) => a.characterId.localeCompare(b.characterId) || a.joinedAt - b.joinedAt);
  }

  function withMembershipEvidence(record, context = {}) {
    if (record.schemaVersion !== 1 || record.source === "manual" || record.guildId !== String(context.guild?.id))
      return record;
    const evidence = mergeMembershipEvidence(record.membershipEvidence || [], context.membershipEvidence || []);
    const trials = objectData(context.guild?.currentTrialsData);
    const weekTrials =
      !record.weekTrials &&
      record.weekStartAt === timestamp(context.guild?.currentWeekStartAt) &&
      isObject(trials.skilling?.parties) &&
      isObject(trials.combat?.parties)
        ? Object.fromEntries(["skilling", "combat"].map((kind) => [kind, Object.keys(trials[kind].parties)]))
        : record.weekTrials;
    const evidenceChanged =
      evidence.length > 0 && JSON.stringify(evidence) !== JSON.stringify(record.membershipEvidence);
    if (!evidenceChanged && weekTrials === record.weekTrials) return record;
    return {
      ...record,
      ...(evidenceChanged ? { membershipEvidence: evidence } : {}),
      ...(weekTrials ? { weekTrials } : {})
    };
  }

  function validMembershipEvidence(record) {
    if (record.membershipEvidence === undefined) return true;
    return (
      record.schemaVersion === 1 &&
      Array.isArray(record.membershipEvidence) &&
      record.membershipEvidence.length <= 10000 &&
      record.membershipEvidence.every(
        (entry) =>
          isObject(entry) &&
          isText(entry.characterId) &&
          typeof entry.name === "string" &&
          entry.name.length <= 500 &&
          Number.isSafeInteger(entry.joinedAt) &&
          entry.joinedAt > 0 &&
          Number.isSafeInteger(entry.observedAt) &&
          entry.observedAt >= entry.joinedAt
      )
    );
  }

  function validWeekTrials(record) {
    return (
      record.weekTrials === undefined ||
      (record.schemaVersion === 1 &&
        isObject(record.weekTrials) &&
        ["skilling", "combat"].every(
          (kind) =>
            Array.isArray(record.weekTrials[kind]) &&
            record.weekTrials[kind].length <= 100 &&
            record.weekTrials[kind].every(isText) &&
            new Set(record.weekTrials[kind]).size === record.weekTrials[kind].length
        ))
    );
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

  function historyMembers(records) {
    const members = new Map();
    const idsByName = new Map();
    for (const week of historyWeeks(records))
      for (const record of week.records)
        for (const row of record.rows) {
          const identity = memberIdentity(record, row);
          if (!identity.name) continue;
          const key = JSON.stringify([identity.id === null ? "name" : "id", identity.id ?? identity.name]);
          if (!members.has(key)) members.set(key, { key, ...identity });
          if (identity.id !== null) {
            if (!idsByName.has(identity.name)) idsByName.set(identity.name, new Set());
            idsByName.get(identity.name).add(identity.id);
          }
        }
    // Keep distinct IDs even when names coincide; collapse a manual alias only when unambiguous.
    return [...members.values()]
      .filter((member) => {
        if (member.id !== null || idsByName.get(member.name)?.size !== 1) return true;
        const [id] = idsByName.get(member.name);
        return members.get(JSON.stringify(["id", id]))?.name !== member.name;
      })
      .sort((a, b) => memberCollator.compare(a.name, b.name));
  }

  function memberHistory(records, identity) {
    return historyWeeks(
      records.filter((record) => record.rows.some((row) => sameMember(identity, memberIdentity(record, row))))
    );
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
                  weekTrials: Object.fromEntries(
                    ["skilling", "combat"].map((kind) => [kind, Object.keys(trials[kind]?.parties || {})])
                  ),
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
    return snapshots.map((record) => withMembershipEvidence(record, context));
  }

  // The game stores a 0–1 ratio and floors its percentage for display.
  // Missing progress in older archives is unknown, not zero.
  function nextTierProgress(record) {
    const value = record?.party?.nextTierProgress;
    return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;
  }

  function withSavedProgress(record, previous) {
    if (
      previous?.key !== record.key ||
      previous.kind !== record.kind ||
      !Number.isFinite(record.party?.highestTier) ||
      previous.party?.highestTier !== record.party.highestTier ||
      nextTierProgress(record) !== null ||
      nextTierProgress(previous) === null
    )
      return record;
    return { ...record, party: { ...record.party, nextTierProgress: nextTierProgress(previous) } };
  }

  function validSnapshot(value) {
    if (!validMemberLevels(value || {}) || !validMembershipEvidence(value || {}) || !validWeekTrials(value || {}))
      return false;
    if (value?.party?.nextTierProgress != null && nextTierProgress(value) === null) return false;
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

  // One verified legacy spreadsheet replaced k/K with 000 in its name column.
  // Scope corrections to its exact provenance, row and source cell; never infer
  // identities by globally replacing text or assign character IDs to imports.
  function repairLegacyMemberNames(record) {
    if (
      record?.schemaVersion !== 2 ||
      record.source !== "manual" ||
      record.recordId !== "7b1591d8-9b9c-5aaf-9552-39dcebea9277" ||
      record.sourceSha256 !== "f85b3a0c18ad9217bae121da5eeba254922f4907fa7a683a752f99025f68f1e8" ||
      record.kind !== "combat" ||
      record.trialHrid !== "/guild_combat/swarm" ||
      !isObject(record.members) ||
      !Array.isArray(record.rows)
    )
      return record;
    let members = record.members;
    for (const [line, originalName, name] of [
      [6, "000wy", "kwy"],
      [11, "BS000", "BSK"],
      [14, "ABCDEFGHIJ000MLN", "ABCDEFGHIJKMLN"],
      [19, "BigBa000a", "BigBaKa"],
      [29, "catcoo000ie", "catcookie"],
      [32, "tian000ongyiran", "tiankongyiran"],
      [35, "000aela", "Kaela"],
      [37, "su000hoiwham", "sukhoiwham"],
      [42, "Ryuu000u2", "Ryuuku2"],
      [47, "000ali000uno", "kalikuno"]
    ]) {
      const key = `excel-row-${line}`;
      const row = record.rows.find((entry) => entry?.memberKey === key);
      if (
        row?.characterId !== null ||
        row.sourceCells?.[`J${line}`]?.value !== originalName ||
        members[key]?.name !== originalName
      )
        continue;
      if (members === record.members) members = { ...members };
      members[key] = {
        ...members[key],
        name,
        nameCorrection: { originalName, reason: "legacy-excel-k-replacement" }
      };
    }
    return members === record.members ? record : { ...record, members };
  }

  // Calendar dates are interpreted in UTC, independent of browser timezone.
  // Never infer a year from the current clock or a yearless chat timestamp.
  function normalizeSnapshot(record) {
    record = repairLegacyMemberNames(record);
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

  const memberCollator = new Intl.Collator("zh-CN", { numeric: true, sensitivity: "base" });
  function summarizeMetric(record, field) {
    const values = record.rows
      .map((row) => (field === "level" ? memberLevel(record, row) : metricValue(record, row, field)))
      .filter((value) => value !== null)
      .sort((a, b) => a - b);
    const count = values.length;
    const sum = values.reduce((total, value) => total + value, 0);
    const middle = Math.floor(count / 2);
    return {
      count,
      missing: record.rows.length - count,
      total: count && Number.isFinite(sum) ? sum : null,
      average: count ? values.reduce((total, value) => total + value / count, 0) : null,
      median: count ? (count % 2 ? values[middle] : values[middle - 1] / 2 + values[middle] / 2) : null
    };
  }

  function metricShare(record, row, field, summary = summarizeMetric(record, field)) {
    const value = metricValue(record, row, field);
    return value !== null && summary.total > 0 ? (value / summary.total) * 100 : null;
  }

  function metricAverageMultiple(record, row, field, summary = summarizeMetric(record, field)) {
    const value = metricValue(record, row, field);
    if (value === null || !(summary.average > 0) || !Number.isFinite(summary.average)) return null;
    const multiple = value / summary.average;
    return Number.isFinite(multiple) ? multiple : null;
  }

  // Rankings use game-captured v1 records only; manual v2 transcripts remain in history.
  // Missing projects never imply absence or zero.
  function participationRankings(records) {
    const players = new Map();
    const seenRecords = new Set();
    const bucket = () => ({ count: 0, average: null });
    const add = (target, value) => {
      target.count += 1;
      target.average = target.average === null ? value : target.average + (value - target.average) / target.count;
    };
    for (const record of records) {
      if (record.schemaVersion !== 1 || record.source === "manual") continue;
      if (seenRecords.has(record.key)) continue;
      seenRecords.add(record.key);
      const fields =
        record.kind === "skilling" ? ["workDone"] : ["damageDealt", "healingDone", "premitigatedDamageTaken"];
      const summaries = fields.map((field) => summarizeMetric(record, field));
      const seenPlayers = new Set();
      for (const row of record.rows) {
        const identity = memberIdentity(record, row);
        if (identity.id === null && !identity.name) continue;
        // ID-less records stay separate from official identities, even when names match.
        const key = JSON.stringify([identity.id === null ? "name" : "id", identity.id ?? identity.name]);
        if (seenPlayers.has(key)) continue;
        seenPlayers.add(key);
        if (!players.has(key))
          players.set(key, {
            key,
            ...identity,
            participations: 0,
            skilling: bucket(),
            combat: bucket(),
            damageDealt: bucket(),
            healingDone: bucket(),
            premitigatedDamageTaken: bucket()
          });
        const player = players.get(key);
        if (!player.name && identity.name) player.name = identity.name;
        player.participations += 1;
        const multiples = fields
          .map((field, index) => {
            const value = metricAverageMultiple(record, row, field, summaries[index]);
            if (record.kind === "combat" && value !== null) add(player[field], value);
            return value;
          })
          .filter((value) => value !== null);
        if (!multiples.length) continue;
        const multiple = multiples.reduce((sum, value) => sum + value, 0);
        add(player[record.kind], multiple);
      }
    }
    return [...players.values()].map((player) => ({
      ...player,
      all: {
        count: player.skilling.count + player.combat.count,
        total:
          player.skilling.average === null
            ? player.combat.average
            : player.combat.average === null
              ? player.skilling.average
              : player.skilling.average + player.combat.average
      }
    }));
  }

  // A guild week is one denominator unit per category, regardless of project count.
  // Absence requires both membership evidence and a completely captured category.
  function playerRankings(records) {
    const captured = [
      ...new Map(
        records
          .filter((record) => record.schemaVersion === 1 && record.source !== "manual")
          .map((record) => [record.key, record])
      ).values()
    ];
    const players = new Map(participationRankings(captured).map((player) => [player.key, player]));
    const guilds = new Map();
    const weeks = new Map();
    for (const record of captured) {
      const guildKey = record.guildId ?? "";
      if (!guilds.has(guildKey)) guilds.set(guildKey, { players: new Set(), evidence: new Map() });
      const guild = guilds.get(guildKey);
      for (const row of record.rows) {
        const identity = memberIdentity(record, row);
        guild.players.add(JSON.stringify([identity.id === null ? "name" : "id", identity.id ?? identity.name]));
      }
      for (const entry of record.membershipEvidence || []) {
        const key = JSON.stringify(["id", entry.characterId]);
        guild.players.add(key);
        guild.evidence.set(key, mergeMembershipEvidence(guild.evidence.get(key) || [], [entry]));
        if (!players.has(key)) players.set(key, { key, id: entry.characterId, name: entry.name, participations: 0 });
      }
      const weekKey = JSON.stringify([guildKey, record.weekStartAt ?? record.key]);
      if (!weeks.has(weekKey)) weeks.set(weekKey, { guild, at: record.weekStartAt, records: [] });
      weeks.get(weekKey).records.push(record);
    }
    const bucket = () => ({
      count: 0,
      sampleCount: 0,
      average: null,
      absentWeeks: 0,
      unknownWeeks: 0,
      incomplete: false
    });
    for (const player of players.values()) {
      player.skilling = bucket();
      player.combat = bucket();
      for (const field of ["damageDealt", "healingDone", "premitigatedDamageTaken"]) player[field] = bucket();
    }
    for (const week of weeks.values()) {
      const attendees = new Map(participationRankings(week.records).map((player) => [player.key, player]));
      for (const key of week.guild.players) {
        const player = players.get(key);
        if (!player) continue;
        const attendance = attendees.get(key);
        const evidence = week.guild.evidence.get(key) || [];
        const eligible =
          attendance || evidence.some((entry) => entry.joinedAt < week.at && entry.observedAt >= week.at);
        // Exclude weeks before the earliest documented joining, unless actual attendance proves otherwise.
        if (!eligible && evidence.length && evidence.every((entry) => entry.joinedAt >= week.at)) continue;
        for (const scope of ["skilling", "combat", "damageDealt", "healingDone", "premitigatedDamageTaken"]) {
          const kind = scope === "skilling" ? "skilling" : "combat";
          const category = week.records.filter((record) => record.kind === kind);
          const expected = [...new Set(week.records.flatMap((record) => record.weekTrials?.[kind] || []))];
          if (!category.length && !expected.length) continue;
          const result = player[scope];
          const actual = attendance?.[scope];
          const appeared = category.some((record) =>
            record.rows.some((row) => {
              const identity = memberIdentity(record, row);
              return identity.id === player.id && (player.id !== null || identity.name === player.name);
            })
          );
          // Attendance samples are independent of the eligible-week averaging denominator.
          if (appeared) result.sampleCount += 1;
          const complete =
            expected.length > 0 && expected.every((hrid) => category.some((record) => record.trialHrid === hrid));
          const score = actual?.average ?? (!appeared && eligible && complete ? 0 : null);
          if (score === null) {
            result.unknownWeeks += 1;
            result.incomplete = true;
            continue;
          }
          result.count += 1;
          result.average = result.average === null ? score : result.average + (score - result.average) / result.count;
          if (!appeared) result.absentWeeks += 1;
        }
      }
    }
    // Flag gaps before/between saved weeks without inventing zero contributions.
    for (const guild of guilds.values()) {
      const guildWeeks = [...weeks.values()].filter((week) => week.guild === guild && Number.isFinite(week.at));
      for (const [key, evidence] of guild.evidence) {
        const player = players.get(key);
        for (const scope of ["skilling", "combat", "damageDealt", "healingDone", "premitigatedDamageTaken"]) {
          const kind = scope === "skilling" ? "skilling" : "combat";
          const dates = [
            ...new Set(
              guildWeeks.filter((week) => week.records.some((record) => record.kind === kind)).map((week) => week.at)
            )
          ];
          if (!dates.length) continue;
          const latest = Math.max(...dates);
          for (const entry of evidence) {
            const first = Math.max(
              config.GUILD_TRIAL_FIRST_START_AT,
              config.GUILD_TRIAL_FIRST_START_AT +
                (Math.floor((entry.joinedAt - config.GUILD_TRIAL_FIRST_START_AT) / WEEK_MS) + 1) * WEEK_MS
            );
            const last = Math.min(latest, entry.observedAt);
            const expected = Math.max(0, Math.floor((last - first) / WEEK_MS) + 1);
            if (dates.filter((at) => at >= first && at <= last).length < expected) player[scope].incomplete = true;
          }
        }
      }
    }
    return [...players.values()]
      .filter(
        (player) =>
          player.participations ||
          player.skilling.count ||
          player.combat.count ||
          player.skilling.unknownWeeks ||
          player.combat.unknownWeeks
      )
      .map((player) => ({
        ...player,
        all: {
          count: player.skilling.count + player.combat.count,
          sampleCount: player.skilling.sampleCount + player.combat.sampleCount,
          unknownWeeks: player.skilling.unknownWeeks + player.combat.unknownWeeks,
          incomplete: player.skilling.incomplete || player.combat.incomplete,
          total:
            player.skilling.average === null
              ? player.combat.average
              : player.combat.average === null
                ? player.skilling.average
                : player.skilling.average + player.combat.average
        }
      }));
  }

  function playerProjectOverview(records, identity, details = {}) {
    const captured = records.filter((record) => record.schemaVersion === 1 && record.source !== "manual");
    const catalog = new Map();
    for (const [kind, names] of [
      ["skilling", config.GUILD_TRIAL_SKILL_ORDER],
      ["combat", config.GUILD_TRIAL_COMBAT_ORDER]
    ])
      for (const [index, name] of names.entries()) {
        const trialHrid = `/guild_${kind}/${name}`;
        catalog.set(trialHrid, { kind, trialHrid, trialDetail: { sortIndex: index } });
      }
    for (const [trialHrid, detail] of Object.entries(details)) {
      const kind = trialHrid.startsWith("/guild_skilling/")
        ? "skilling"
        : trialHrid.startsWith("/guild_combat/")
          ? "combat"
          : null;
      if (kind)
        catalog.set(trialHrid, { kind, trialHrid, trialDetail: { ...catalog.get(trialHrid)?.trialDetail, ...detail } });
    }
    for (const record of captured)
      catalog.set(record.trialHrid, {
        ...record,
        trialDetail: { ...catalog.get(record.trialHrid)?.trialDetail, ...record.trialDetail }
      });
    const groups = new Map(historyProjects(captured, details).map((group) => [group.key, group.records]));
    return historyProjects([...catalog.values()], details).map((group) => {
      const project = group.records[0];
      const player = participationRankings(groups.get(group.key) || []).find((entry) =>
        identity.id != null ? entry.id === String(identity.id) : entry.id === null && entry.name === identity.name
      );
      const average = player?.[group.kind].average ?? null;
      const samples = player?.all.count || 0;
      const total = average === null ? null : average * samples;
      return {
        key: group.key,
        kind: group.kind,
        trialHrid: project.trialHrid,
        trialDetail: details[project.trialHrid] || project.trialDetail,
        participations: player?.participations || 0,
        average,
        samples,
        total: Number.isFinite(total) ? total : null
      };
    });
  }

  function summarizePlayerProjects(projects) {
    const measured = projects.filter((project) => project.samples > 0 && Number.isFinite(project.average));
    const samples = measured.reduce((sum, project) => sum + project.samples, 0);
    const total = measured.reduce((sum, project) => sum + project.average * project.samples, 0);
    return {
      participations: projects.reduce((sum, project) => sum + project.participations, 0),
      samples,
      average: samples
        ? Number.isFinite(total)
          ? total / samples
          : measured.reduce((sum, project) => sum + project.average * (project.samples / samples), 0)
        : null,
      total: samples && Number.isFinite(total) ? total : null
    };
  }

  function sortEntries(entries, sort) {
    const result = [...entries];
    if (
      !sort ||
      ![
        "member",
        "level",
        "workDone",
        "workShare",
        "workMultiple",
        "damageDealt",
        "healingDone",
        "premitigatedDamageTaken",
        ...["damageDealt", "healingDone", "premitigatedDamageTaken"].flatMap((field) => [
          field + "Share",
          field + "Multiple"
        ])
      ].includes(sort.field)
    )
      return result;
    const combatDerived = /^(damageDealt|healingDone|premitigatedDamageTaken)(Share|Multiple)$/.exec(sort.field);
    const summaries = new Map();
    if (combatDerived)
      for (const { record } of result)
        if (!summaries.has(record)) summaries.set(record, summarizeMetric(record, combatDerived[1]));
    const value = ({ record, row }) =>
      combatDerived
        ? (combatDerived[2] === "Share" ? metricShare : metricAverageMultiple)(
            record,
            row,
            combatDerived[1],
            summaries.get(record)
          )
        : sort.field === "member"
          ? memberIdentity(record, row).name || null
          : sort.field === "level"
            ? memberLevel(record, row)
            : metricValue(record, row, ["workShare", "workMultiple"].includes(sort.field) ? "workDone" : sort.field);
    const direction = sort.direction === "asc" ? 1 : -1;
    return result.sort((a, b) => {
      const left = value(a),
        right = value(b);
      // Unknown values stay last in either direction; equal values retain source order.
      if (left === null || right === null) return left === right ? 0 : left === null ? 1 : -1;
      return direction * (sort.field === "member" ? memberCollator.compare(left, right) : left - right);
    });
  }

  function displayRows(record, sort = record.kind === "skilling" ? { field: "workDone", direction: "desc" } : null) {
    return sortEntries(
      record.rows.map((row) => ({ record, row })),
      sort
    ).map((entry) => entry.row);
  }

  function searchHistoryMembers(members, query) {
    const needle = String(query || "")
      .trim()
      .toLocaleLowerCase();
    return members.filter((member) => !needle || member.name.toLocaleLowerCase().includes(needle));
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
    summarizeMetric,
    metricShare,
    metricAverageMultiple,
    playerRankings,
    playerProjectOverview,
    summarizePlayerProjects,
    displayRows,
    sortEntries,
    memberAbsent,
    memberIdentity,
    memberHistory,
    historyMembers,
    searchHistoryMembers,
    sameMember,
    memberLevel,
    currentMemberJoinedAt,
    currentMembershipRankings,
    withMemberLevels,
    withMembershipEvidence,
    mergeMembershipEvidence,
    updateContext,
    completedSnapshots,
    nextTierProgress,
    withSavedProgress,
    validSnapshot,
    parseImport,
    previewImport,
    compareSnapshots,
    normalizeSnapshot,
    weekNumber,
    MAX_IMPORT_BYTES
  };
});
