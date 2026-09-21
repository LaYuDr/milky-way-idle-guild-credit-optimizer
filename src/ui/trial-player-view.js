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
    getSort,
    renderSortHeader
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
      return weeks
        .map(
          (week) =>
            `<section class="mwi-trial-player-week"><h3><button type="button" class="mwi-trial-heading-link" data-trial-jump-week="${e(week.key)}">${e(weekLabel(week))}</button></h3>${[
              "skilling",
              "combat"
            ]
              .map((kind) => {
                const records = week.records.filter((record) => record.kind === kind);
                if (!records.length) return "";
                const fields =
                  kind === "skilling"
                    ? ["level", "workDone"]
                    : ["level", "damageDealt", "healingDone", "premitigatedDamageTaken"];
                const key = JSON.stringify(["player", week.key, kind]);
                const sort = getSort(key);
                const rows = api
                  .historyProjects(records)
                  .flatMap((project) =>
                    project.records.flatMap((record) => record.rows.map((row) => ({ project, record, row })))
                  );
                return `<div class="mwi-trial-table-scroll" data-trial-scroll-id="${e(key)}" role="region" tabindex="0" aria-label="${e(t(kind === "skilling" ? "trialSkilling" : "trialCombat"))}"><table class="mwi-trial-table"><caption>${e(t(kind === "skilling" ? "trialSkilling" : "trialCombat"))}</caption><thead><tr><th scope="col">${e(t("trialChooseProject"))}</th>${fields.map((field) => renderSortHeader(key, field, sort)).join("")}</tr></thead><tbody>${api
                  .sortEntries(rows, sort)
                  .map(
                    ({ project, record, row }) =>
                      `<tr data-trial-player-row><th scope="row"><button type="button" class="mwi-trial-heading-link" data-trial-jump-project="${e(project.key)}">${projectIcon(record)}${e(trialName(record))}</button><small>${e(record.guildName || t("trialUnknownGuild"))} · ${e(t(record.source === "manual" ? "trialManualSource" : "trialAutomaticSource"))}</small></th>${fields.map((field) => `<td data-trial-field="${field}">${e(number(field === "level" ? api.memberLevel(record, row) : api.metricValue(record, row, field)))}</td>`).join("")}</tr>`
                  )
                  .join("")}</tbody></table></div>`;
              })
              .join("")}</section>`
        )
        .join("");
    }
    function render({ member, weeks, profileState }) {
      return `<div class="mwi-trial-player-toolbar"><button type="button" data-trial-player-back>${e(t("trialPlayerBack"))}</button><h3 tabindex="-1" data-trial-player-title>${e(member.name)} · ${e(t("trialPlayerHistory"))}</h3></div><div class="mwi-trial-player-layout"><aside class="mwi-trial-player-profile" aria-label="${e(t("trialPlayerProfile"))}"><header><h3>${e(t("trialPlayerProfile"))}</h3><button type="button" data-trial-profile-refresh ${profileState.status === "loading" ? "disabled" : ""}>${e(t("trialProfileRefresh"))}</button></header><div data-trial-profile-content>${profileMarkup(profileState)}</div></aside><div class="mwi-trial-player-history">${historyMarkup(weeks)}</div></div>`;
    }
    return { render };
  }
  return { createRenderer };
});
