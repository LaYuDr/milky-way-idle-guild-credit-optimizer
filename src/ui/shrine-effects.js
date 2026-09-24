(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MwiGuildShrineEffects = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  function createFormatter({ core, t, ui }) {
    const effectNameKeys = {
      action_speed: "shrineEffectActionSpeed",
      attack_speed: "shrineEffectAttackSpeed",
      cast_speed: "shrineEffectCastSpeed",
      efficiency: "shrineEffectEfficiency",
      damage: "shrineEffectDamage",
      essence_find: "shrineEffectEssenceFind",
      max_hitpoints: "shrineEffectMaxHp",
      max_manapoints: "shrineEffectMaxMp",
      rare_find: "shrineEffectRareFind",
      wisdom: "shrineEffectExperience",
      skilling_experience: "shrineEffectExperience",
      combat_experience: "shrineEffectExperience"
    };
    const flatPercentTypes = new Set([
      "action_speed",
      "cast_speed",
      "efficiency",
      "essence_find",
      "rare_find",
      "wisdom",
      "skilling_experience",
      "combat_experience",
      "damage",
      "critical_rate",
      "critical_damage",
      "physical_amplify",
      "water_amplify",
      "nature_amplify",
      "fire_amplify",
      "healing_amplify",
      "life_steal",
      "physical_thorns",
      "elemental_thorns",
      "retaliation",
      "hp_regen",
      "mp_regen",
      "combat_drop_rate",
      "combat_drop_quantity",
      "gathering",
      "task_action_speed",
      "gourmet",
      "processing",
      "artisan",
      "blessed"
    ]);

    function name(effect) {
      const type = effect.typeHrid.split("/").pop();
      return effectNameKeys[type] ? t(effectNameKeys[type]) : effect.typeHrid;
    }
    function value(effect, number) {
      if (number === null || !Number.isFinite(number)) return "—";
      const percent = effect.kind === "ratio" || flatPercentTypes.has(effect.typeHrid.split("/").pop());
      return new Intl.NumberFormat(ui().locale, {
        style: percent ? "percent" : "decimal",
        maximumFractionDigits: 3,
        signDisplay: "always"
      }).format(number);
    }
    function perLevel(detail, separator = " · ") {
      const effects = core.guildBuffLevelEffects(detail);
      if (!effects.length) return t("shrineEffectsUnavailable");
      return effects
        .map((effect) =>
          t(effect.first === effect.increment ? "shrineEffectPerLevel" : "shrineEffectFirstAndPerLevel", {
            effect: name(effect),
            value: value(effect, effect.increment),
            first: value(effect, effect.first)
          })
        )
        .join(separator);
    }
    return { name, value, perLevel };
  }
  return { createFormatter };
});
