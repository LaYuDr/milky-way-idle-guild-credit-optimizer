(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MwiGuildTrialPlayerView = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  function createRenderer({
    t,
    escapeHtml: e,
    trialHistoryApi: api,
    trialName,
    weekLabel,
    projectIcon,
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
    const metric = (name, value) => `<div><dt>${e(name)}</dt><dd>${e(value)}</dd></div>`;
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
          .map((skill) => metric(label(skill.skillHrid), number(skill.level)))
          .join("")}</dl>`;
      const equipment = entries(profile.wearableItemMap).filter((item) => item?.itemHrid);
      if (equipment.length)
        html += `<h4>${e(t("trialProfileEquipment"))}</h4><ul class="mwi-trial-profile-items">${equipment.map((item) => `<li>${e(resolveItemName(item.itemHrid, getBridge()?.itemDetails?.[item.itemHrid]?.name || suffix(item.itemHrid)))}${item.enhancementLevel ? ` +${e(item.enhancementLevel)}` : ""}</li>`).join("")}</ul>`;
      for (const [field, heading, hrid] of [
        ["equippedAbilities", "trialProfileAbilities", "abilityHrid"],
        ["characterHouseRoomMap", "trialProfileHouse", "roomHrid"]
      ]) {
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
  return { createRenderer };
});
