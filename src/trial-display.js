(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MwiGuildTrialDisplay = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const combatMetrics = ["damageDealt", "healingDone", "premitigatedDamageTaken"];
  const aggregates = ["total", "average", "median"];
  const groups = [
    { key: "basic", fields: ["member", "level"] },
    { key: "skilling", fields: ["workDone", "workShare", "workMultiple"] },
    ...combatMetrics.map((key) => ({ key, fields: [key, `${key}Share`, `${key}Multiple`] })),
    ...["level", "workDone"].map((key) => ({
      key: `${key}Summary`,
      fields: aggregates.map((aggregate) => `${key}_${aggregate}`)
    }))
  ];
  const defaults = Object.fromEntries(
    groups.flatMap(({ fields }) => fields.map((field) => [field, !/(Share|Multiple)$/.test(field)]))
  );

  function normalize(value) {
    return Object.fromEntries(
      Object.entries(defaults).map(([field, fallback]) => {
        let legacy;
        if (combatMetrics.some((metric) => field === `${metric}Share`)) legacy = "combatShare";
        if (combatMetrics.some((metric) => field === `${metric}Multiple`)) legacy = "combatMultiple";
        if (field.startsWith("level_")) legacy = "levelSummary";
        if (field.startsWith("workDone_")) legacy = "workSummary";
        return [
          field,
          typeof value?.[field] === "boolean"
            ? value[field]
            : legacy && typeof value?.[legacy] === "boolean"
              ? value[legacy]
              : fallback
        ];
      })
    );
  }

  function fields(kind, settings) {
    const all = [
      "member",
      "level",
      ...(kind === "combat"
        ? combatMetrics.flatMap((field) => [field, `${field}Share`, `${field}Multiple`])
        : ["workDone", "workShare", "workMultiple"])
    ];
    return all.filter((field) => settings[field] !== false);
  }

  function preset(name) {
    if (name === "default") return { ...defaults };
    if (name === "all") return Object.fromEntries(Object.keys(defaults).map((field) => [field, true]));
    if (name === "compact")
      return Object.fromEntries(
        Object.keys(defaults).map((field) => [field, ["member", "level", "workDone", ...combatMetrics].includes(field)])
      );
    return null;
  }

  return { groups, defaults, normalize, fields, preset };
});
