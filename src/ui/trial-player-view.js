(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MwiGuildTrialPlayerView = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  // Positions mirror the game's EquipmentLocationToSlotMap (rows 5–6 separate tools).
  const EQUIPMENT_SLOTS = [
    ["back", 1, 1],
    ["head", 1, 2],
    ["trinket", 1, 3],
    ["neck", 1, 5],
    ["main_hand", 2, 1],
    ["body", 2, 2],
    ["off_hand", 2, 3],
    ["earrings", 2, 5],
    ["hands", 3, 1],
    ["legs", 3, 2],
    ["pouch", 3, 3],
    ["ring", 3, 5],
    ["feet", 4, 2],
    ["charm", 4, 5],
    ["milking_tool", 7, 1],
    ["foraging_tool", 7, 2],
    ["woodcutting_tool", 7, 3],
    ["cheesesmithing_tool", 7, 4],
    ["crafting_tool", 7, 5],
    ["tailoring_tool", 8, 1],
    ["cooking_tool", 8, 2],
    ["brewing_tool", 8, 3],
    ["alchemy_tool", 8, 4],
    ["enhancing_tool", 8, 5]
  ];
  function equipmentLayout(wearableItemMap, itemDetails = {}) {
    const slots = EQUIPMENT_SLOTS.map(([key, row, column]) => ({ key, row, column, item: null }));
    const extras = [];
    for (const [key, item] of Object.entries(wearableItemMap || {})) {
      if (!item?.itemHrid) continue;
      const location =
        item.itemLocationHrid ||
        (key.startsWith("/item_locations/") ? key : null) ||
        itemDetails[item.itemHrid]?.equipmentDetail?.type ||
        key;
      let slotKey = String(location).split("/").pop();
      if (slotKey === "two_hand") slotKey = "main_hand";
      const slot = slots.find((slot) => slot.key === slotKey);
      if (slot && !slot.item) slot.item = item;
      else extras.push(item);
    }
    return { slots, extras };
  }

  function createRenderer({
    t,
    escapeHtml: e,
    trialHistoryApi: api,
    trialName,
    weekLabel,
    projectIcon,
    profileIcon,
    getBridge,
    resolveItemName,
    renderRecord,
    renderRail
  }) {
    const number = (value) => (typeof value === "number" && Number.isFinite(value) ? String(value) : "—");
    const entries = (value) => (Array.isArray(value) ? value : Object.values(value || {}));
    const suffix = (value) =>
      String(value || "")
        .split("/")
        .pop();
    const label = (hrid) => {
      const key = suffix(hrid);
      const translated = t(`trialName_${key}`);
      if (translated !== `trialName_${key}`) return translated;
      const skill = t(`trialSkill_${key}`);
      return skill !== `trialSkill_${key}` ? skill : key;
    };
    const metric = (name, value, icon = "") => `<div><dt>${icon}<span>${e(name)}</span></dt><dd>${e(value)}</dd></div>`;
    function equipmentTile(item, attributes = "") {
      const name = resolveItemName(
        item.itemHrid,
        getBridge()?.itemDetails?.[item.itemHrid]?.name || suffix(item.itemHrid)
      );
      const level = item.enhancementLevel > 0 ? `+${item.enhancementLevel}` : "";
      const description = `${name}${level ? ` ${level}` : ""}`;
      const icon = profileIcon("item", item.itemHrid);
      const tier = item.enhancementLevel >= 11 ? "gold" : item.enhancementLevel >= 8 ? "purple" : "blue";
      return `<div class="mwi-trial-equipment-slot" ${attributes} tabindex="0" role="img" aria-label="${e(description)}" title="${e(description)}">${icon || `<span class="mwi-trial-slot-label">${e(name)}</span>`}${level ? `<span class="mwi-trial-equipment-level" data-tier="${tier}">${e(level)}</span>` : ""}</div>`;
    }
    function equipmentMarkup(profile) {
      if (!profile.wearableItemMap) return "";
      const { slots, extras } = equipmentLayout(profile.wearableItemMap, getBridge()?.itemDetails);
      let html = `<h4>${e(t("trialProfileEquipment"))}</h4><div class="mwi-trial-equipment-grid">${slots
        .map(({ key, row, column, item }) => {
          const attributes = `data-equipment-slot="${key}" style="grid-row:${row};grid-column:${column}"`;
          return item
            ? equipmentTile(item, attributes)
            : `<div class="mwi-trial-equipment-slot mwi-trial-equipment-empty" ${attributes}><span>${e(t(`trialSlot_${key}`))}</span></div>`;
        })
        .join("")}</div>`;
      if (extras.length)
        html += `<div class="mwi-trial-equipment-extra">${extras.map((item) => equipmentTile(item)).join("")}</div>`;
      return html;
    }
    function abilitiesMarkup(profile) {
      const abilities = entries(profile.equippedAbilities)
        .filter((item) => item?.abilityHrid)
        .sort((a, b) => (a.slotNumber ?? 0) - (b.slotNumber ?? 0));
      if (!abilities.length) return "";
      return `<div class="mwi-trial-profile-abilities" aria-label="${e(t("trialProfileAbilities"))}">${abilities
        .map((item) => {
          const name = label(item.abilityHrid),
            level = `Lv.${number(item.level)}`;
          return `<div class="mwi-trial-equipment-slot mwi-trial-ability-slot" tabindex="0" role="img" aria-label="${e(`${name} ${level}`)}" title="${e(`${name} ${level}`)}">${profileIcon("ability", item.abilityHrid) || `<span class="mwi-trial-slot-label">${e(name)}</span>`}<span class="mwi-trial-equipment-level">${e(level)}</span></div>`;
        })
        .join("")}</div>`;
    }
    function profileMarkup(state) {
      if (state.status !== "ready")
        return `<p class="mwi-trial-meta" role="status">${e(t(state.status === "loading" ? "trialProfileLoading" : state.status === "timeout" ? "trialProfileTimeout" : state.status === "mismatch" ? "trialProfileMismatch" : "trialProfileUnavailable"))}</p>`;
      const profile = state.profile;
      const skills = entries(profile.characterSkills).filter((item) => item && item.skillHrid);
      const total = skills.find((item) => suffix(item.skillHrid) === "total_level");
      let html = `<dl class="mwi-trial-profile-facts">${metric(t("trialProfileGuild"), profile.guildName || "—")}${metric(t("trialProfileTotalLevel"), number(total?.level ?? profile.totalLevel))}${metric(t("trialProfileCombatLevel"), number(profile.combatLevel))}`;
      for (const field of [
        "totalTaskPoints",
        "labyrinthPoints",
        "labyrinthHighestFloor",
        "collectionPoints",
        "bestiaryPoints",
        "famePoints"
      ])
        if (profile[field] != null) html += metric(t(`trialProfile_${field}`), number(profile[field]));
      html += "</dl>";
      if (skills.length)
        html += `<h4>${e(t("trialProfileSkills"))}</h4><dl class="mwi-trial-profile-facts">${skills
          .filter((skill) => suffix(skill.skillHrid) !== "total_level")
          .map((skill) => metric(label(skill.skillHrid), number(skill.level), profileIcon("skill", skill.skillHrid)))
          .join("")}</dl>`;
      html += equipmentMarkup(profile) + abilitiesMarkup(profile);
      for (const [field, heading, hrid] of [["characterHouseRoomMap", "trialProfileHouse", "roomHrid"]]) {
        const values = entries(profile[field]).filter((item) => item?.[hrid]);
        if (values.length)
          html += `<h4>${e(t(heading))}</h4><dl class="mwi-trial-profile-facts">${values.map((item) => metric(label(item[hrid]), number(item.level))).join("")}</dl>`;
      }
      html += `<details class="mwi-trial-raw"><summary>${e(t("trialProfileRaw"))}</summary><pre>${e(JSON.stringify(profile, null, 2))}</pre></details>`;
      return html;
    }
    function historyMarkup(weeks) {
      if (!weeks.length) return `<p class="mwi-trial-meta">${e(t("trialPlayerEmpty"))}</p>`;
      return ["skilling", "combat"]
        .map((kind) => {
          const columns = weeks.flatMap((week) =>
            api
              .historyProjects(
                week.records.filter((record) => record.kind === kind),
                getBridge()?.trialHistoryContext?.details || {}
              )
              .flatMap((project) =>
                project.records.map(
                  (record) =>
                    `<article class="mwi-trial-column" data-trial-player-column data-trial-week="${e(week.key)}"><h4><button type="button" class="mwi-trial-heading-link" data-trial-jump-week="${e(week.key)}">${e(weekLabel(week))}</button></h4><h4><button type="button" class="mwi-trial-heading-link" data-trial-jump-project="${e(project.key)}">${projectIcon(record)}${e(trialName(record))}</button></h4>${renderRecord(record, true)}</article>`
                )
              )
          );
          if (!columns.length) return "";
          return renderRail(
            `player-${kind}`,
            t(kind === "skilling" ? "trialSkilling" : "trialCombat"),
            columns.join(""),
            kind,
            true,
            true
          );
        })
        .join("");
    }

    function render({ member, weeks, profileState }) {
      return `<div class="mwi-trial-player-toolbar"><button type="button" data-trial-player-back>${e(t("trialPlayerBack"))}</button><h3 tabindex="-1" data-trial-player-title>${e(member.name)} · ${e(t("trialPlayerHistory"))}</h3></div><div class="mwi-trial-player-layout"><aside class="mwi-trial-player-profile" aria-label="${e(t("trialPlayerProfile"))}"><header><h3>${e(t("trialPlayerProfile"))}</h3><button type="button" data-trial-profile-refresh ${profileState.status === "loading" ? "disabled" : ""}>${e(t("trialProfileRefresh"))}</button></header><div data-trial-profile-content>${profileMarkup(profileState)}</div></aside><div class="mwi-trial-player-history">${historyMarkup(weeks)}</div></div>`;
    }
    return { render };
  }
  return { createRenderer, equipmentLayout };
});
