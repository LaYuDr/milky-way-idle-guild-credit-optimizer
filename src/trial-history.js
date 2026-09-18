(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MwiGuildTrialHistory = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
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

  return { updateContext, completedSnapshots, validSnapshot };
});
