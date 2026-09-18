(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MwiGuildTrialAnalytics = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const COMBAT_FIELDS = ["damageDealt", "healingDone", "premitigatedDamageTaken"];
  const fields = (record) => (record.kind === "combat" ? COMBAT_FIELDS : ["workDone"]);
  const scopeKey = (record) =>
    record.guildId !== null && record.guildId !== undefined
      ? JSON.stringify(["guild", String(record.guildId)])
      : JSON.stringify(["manual", record.guildName || null]);
  function metricValue(record, row, field) {
    const value = row[field];
    if (value === undefined && record.schemaVersion === 1) return 0;
    return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
  }
  function entries(record) {
    const names = record.rows.map((row) => record.members?.[row.memberKey ?? row.characterId]?.name || "");
    const counts = new Map();
    names.forEach((name) => counts.set(name, (counts.get(name) || 0) + 1));
    return record.rows.map((row, index) => {
      const name = names[index];
      const hasId = row.characterId !== null && row.characterId !== undefined && row.characterId !== "";
      const match = hasId
        ? "id"
        : name && counts.get(name) === 1 && !/^(前成员|former member)$/i.test(name)
          ? "name"
          : "isolated";
      const identity = JSON.stringify([
        scopeKey(record),
        match,
        match === "id" ? String(row.characterId) : match === "name" ? name : [record.key, row.memberKey ?? index]
      ]);
      return {
        identity,
        name,
        match,
        row,
        values: Object.fromEntries(fields(record).map((field) => [field, metricValue(record, row, field)]))
      };
    });
  }
  function summary(rows, field) {
    const values = rows
      .map((entry) => entry.values[field])
      .filter((value) => typeof value === "number")
      .sort((a, b) => a - b);
    const total = values.length ? values.reduce((a, b) => a + b, 0) : null;
    const n = values.length;
    return {
      count: rows.length,
      known: n,
      total,
      mean: n ? total / n : null,
      median: n ? (values[Math.floor((n - 1) / 2)] + values[Math.floor(n / 2)]) / 2 : null,
      top5Share: total > 0 ? values.slice(-5).reduce((a, b) => a + b, 0) / total : null
    };
  }
  function ranking(rows, field) {
    const total = summary(rows, field).total;
    const sorted = rows
      .slice()
      .sort((a, b) => (b.values[field] ?? -1) - (a.values[field] ?? -1) || a.name.localeCompare(b.name));
    let rank = null,
      previous = null;
    return sorted.map((entry, index) => {
      const value = entry.values[field] ?? null;
      if (value !== null && (index === 0 || value !== previous)) rank = index + 1;
      previous = value;
      return {
        ...entry,
        value,
        rank: value === null ? null : rank,
        share: total > 0 && value !== null ? value / total : null
      };
    });
  }
  function scoped(records, selected) {
    return records.filter((record) => scopeKey(record) === scopeKey(selected));
  }
  function timeline(records, selected) {
    const weeks = new Map();
    if (!selected.weekStartAt) return { records: [], ambiguousWeeks: 0 };
    for (const record of scoped(records, selected)) {
      if (record.trialHrid !== selected.trialHrid || !record.weekStartAt || record.weekStartAt > selected.weekStartAt)
        continue;
      const group = weeks.get(record.weekStartAt) || [];
      group.push(record);
      weeks.set(record.weekStartAt, group);
    }
    // Selecting a record explicitly resolves its own week, never other weeks.
    weeks.set(selected.weekStartAt, [selected]);
    return {
      records: [...weeks.values()]
        .filter((group) => group.length === 1)
        .map((group) => group[0])
        .sort((a, b) => a.weekStartAt - b.weekStartAt),
      ambiguousWeeks: [...weeks.values()].filter((group) => group.length > 1).length
    };
  }
  function comparison(records, selected, field, mode = "all", start = 0) {
    const timelineResult = timeline(records, selected);
    const selectedRecords = timelineResult.records.filter((record) => record.weekStartAt >= start);
    const lists = selectedRecords.map(entries);
    let shared = new Set(lists[0]?.map((entry) => entry.identity) || []);
    for (const list of lists.slice(1)) {
      const ids = new Set(list.map((entry) => entry.identity));
      shared = new Set([...shared].filter((id) => ids.has(id)));
    }
    return {
      ambiguousWeeks: timelineResult.ambiguousWeeks,
      sharedCount: shared.size,
      points: selectedRecords.map((record, index) => ({
        record,
        stats: summary(
          mode === "shared" ? lists[index].filter((entry) => shared.has(entry.identity)) : lists[index],
          field
        )
      }))
    };
  }
  function change(before, after) {
    return {
      absolute: before === null || after === null ? null : after - before,
      percent: before > 0 && after !== null ? (after - before) / before : null
    };
  }
  function members(records) {
    const map = new Map();
    for (const record of [...records].sort((a, b) => (a.weekStartAt || 0) - (b.weekStartAt || 0)))
      for (const entry of entries(record)) map.set(entry.identity, entry);
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }
  function memberHistory(records, identity, field) {
    return [...records]
      .sort((a, b) => (a.weekStartAt || 0) - (b.weekStartAt || 0) || a.trialHrid.localeCompare(b.trialHrid))
      .flatMap((record) => {
        const metric = fields(record).includes(field) ? field : fields(record)[0];
        const entry = ranking(entries(record), metric).find((entry) => entry.identity === identity);
        return entry ? [{ record, entry, field: metric }] : [];
      });
  }
  function coverage(record, identity) {
    const entry = entries(record).find((entry) => entry.identity === identity);
    if (!entry) return { state: "absent", entry: null };
    const values = Object.values(entry.values);
    return {
      state: values.some((v) => v > 0) ? "positive" : values.some((v) => v === null) ? "unknown" : "zero",
      entry
    };
  }
  return {
    fields,
    scopeKey,
    metricValue,
    entries,
    summary,
    ranking,
    scoped,
    timeline,
    comparison,
    change,
    members,
    memberHistory,
    coverage
  };
});
