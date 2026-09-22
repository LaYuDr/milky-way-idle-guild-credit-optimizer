(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MwiGuildTrialPlayerView = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const SKILL_ROWS = [
    ["milking", "foraging", "woodcutting", "cheesesmithing", "crafting"],
    ["tailoring", "cooking", "brewing", "alchemy", "enhancing"],
    ["stamina", "intelligence", "attack", "defense"],
    ["melee", "ranged", "magic"]
  ];
  function skillLayout(skills) {
    const slots = SKILL_ROWS.flatMap((keys, row) =>
      keys.map((key, column) => ({
        key,
        row: row + 1,
        column: column + 1,
        skill: null
      }))
    );
    let extra = 0;
    for (const skill of skills) {
      if (!skill?.skillHrid) continue;
      const key = String(skill.skillHrid).split("/").pop();
      if (key === "total_level") continue;
      const slot = slots.find((slot) => slot.key === key && !slot.skill);
      if (slot) slot.skill = skill;
      else {
        slots.push({ key, row: 5 + Math.floor(extra / 5), column: (extra % 5) + 1, skill });
        extra += 1;
      }
    }
    return slots;
  }
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
    renderRail,
    memberIdentityAttributes
  }) {
    const tooltipRecords = new Map();
    function tooltipAttribute(kind, record) {
      if (!record) return "";
      const key = String(tooltipRecords.size);
      tooltipRecords.set(key, { kind, record });
      return `data-trial-profile-tooltip="${key}"`;
    }
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
      return `<div class="mwi-trial-equipment-slot" ${attributes} ${tooltipAttribute("item", item)} tabindex="0" role="img" aria-label="${e(description)}" title="${e(description)}">${icon || `<span class="mwi-trial-slot-label">${e(name)}</span>`}${level ? `<span class="mwi-trial-equipment-level" data-tier="${tier}">${e(level)}</span>` : ""}</div>`;
    }
    function equipmentMarkup(profile) {
      if (!profile.wearableItemMap) return "";
      const { slots, extras } = equipmentLayout(profile.wearableItemMap, getBridge()?.itemDetails);
      let html = `<div class="mwi-trial-equipment-grid">${slots
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
          return `<div class="mwi-trial-equipment-slot mwi-trial-ability-slot" ${tooltipAttribute("ability", item)} tabindex="0" role="img" aria-label="${e(`${name} ${level}`)}" title="${e(`${name} ${level}`)}">${profileIcon("ability", item.abilityHrid) || `<span class="mwi-trial-slot-label">${e(name)}</span>`}<span class="mwi-trial-equipment-level">${e(level)}</span></div>`;
        })
        .join("")}</div>`;
    }
    function skillsMarkup(skills) {
      if (!skills.some((skill) => suffix(skill.skillHrid) !== "total_level")) return "";
      return `<div class="mwi-trial-skill-grid" aria-label="${e(t("trialProfileSkills"))}">${skillLayout(skills)
        .map(({ key, row, column, skill }) => {
          const hrid = skill?.skillHrid || `/skills/${key}`;
          const name = label(hrid);
          const level = `Lv.${number(skill?.level)}`;
          const description = `${name} ${level}`;
          return `<div class="mwi-trial-equipment-slot mwi-trial-skill-slot" data-profile-skill="${e(key)}" ${tooltipAttribute("skill", skill)} style="grid-row:${row};grid-column:${column}" tabindex="0" role="img" aria-label="${e(description)}" title="${e(description)}">${profileIcon("skill", hrid) || `<span class="mwi-trial-slot-label">${e(name)}</span>`}<span class="mwi-trial-equipment-level">${e(level)}</span></div>`;
        })
        .join("")}</div>`;
    }
    function profileSection(key, title, content, sectionOpen) {
      if (!content) return "";
      return `<details class="mwi-trial-profile-section" data-trial-profile-section="${key}" ${sectionOpen[key] !== false ? "open" : ""}><summary>${e(t(title))}</summary>${content}</details>`;
    }
    function overviewMarkup(projects, sectionOpen) {
      const tables = ["skilling", "combat"]
        .map((kind) => {
          const rows = projects
            .filter((project) => project.kind === kind)
            .map(
              (project) =>
                `<tr data-trial-overview-project="${e(project.trialHrid)}"><th scope="row"><span>${projectIcon(project)}${e(trialName(project))}</span></th><td data-trial-overview-count>${project.participations}</td><td data-trial-overview-average>${project.average === null ? "—" : `${project.average.toFixed(2)}×`}</td></tr>`
            )
            .join("");
          return `<table class="mwi-trial-player-overview"><caption>${e(t(kind === "skilling" ? "trialSkilling" : "trialCombat"))}</caption><thead><tr><th scope="col">${e(t("trialOverviewProject"))}</th><th scope="col">${e(t("trialRankingCount"))}</th><th scope="col">${e(t("trialOverviewAverage"))}</th></tr></thead><tbody>${rows}</tbody></table>`;
        })
        .join("");
      return profileSection(
        "overview",
        "trialPlayerOverview",
        `${tables}<details class="mwi-trial-overview-help"><summary>${e(t("trialOverviewMethod"))}</summary><p>${e(t("trialOverviewHelp"))}</p></details>`,
        sectionOpen
      );
    }
    function profileMarkup(state, sectionOpen, projects) {
      const overview = overviewMarkup(projects, sectionOpen);
      if (state.status !== "ready")
        return `<p class="mwi-trial-meta" role="status">${e(t(state.status === "loading" ? "trialProfileLoading" : state.status === "timeout" ? "trialProfileTimeout" : state.status === "mismatch" ? "trialProfileMismatch" : "trialProfileUnavailable"))}</p>${overview}`;
      const profile = state.profile;
      const skills = entries(profile.characterSkills).filter((item) => item && item.skillHrid);
      const total = skills.find((item) => suffix(item.skillHrid) === "total_level");
      let html = `<dl class="mwi-trial-profile-facts">${metric(t("trialProfileTotalLevel"), number(total?.level ?? profile.totalLevel))}${metric(t("trialProfileCombatLevel"), number(profile.combatLevel))}</dl>`;
      html += overview;
      html += profileSection("skills", "trialProfileSkills", skillsMarkup(skills), sectionOpen);
      html += profileSection(
        "equipment",
        "trialProfileEquipment",
        equipmentMarkup(profile) + abilitiesMarkup(profile),
        sectionOpen
      );
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

    function renderRankingColumn(players, metric, scope) {
      const entries = [...players];
      const score = (entry) =>
        metric === "participations" ? entry.participations : scope === "all" ? entry.all.total : entry[scope].average;
      const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
      entries.sort((a, b) => {
        const left = score(a),
          right = score(b);
        if (left === null || right === null)
          return left === right ? collator.compare(a.name, b.name) : left === null ? 1 : -1;
        return right - left || collator.compare(a.name, b.name) || a.key.localeCompare(b.key);
      });
      let previous = null,
        rank = 0;
      const rows = entries
        .map((entry, index) => {
          const value = score(entry);
          if (value !== previous) rank = index + 1;
          previous = value;
          const name = entry.name || t("trialNameUnavailable");
          return `<tr data-trial-ranking-row="${e(entry.key)}"><td>${value === null ? "—" : rank}</td><th scope="row"${memberIdentityAttributes(entry)}>${entry.name ? `<button type="button" class="mwi-trial-heading-link" data-trial-ranking-player="${e(entry.key)}">${e(name)}</button>` : e(name)}</th><td><span data-trial-ranking-value>${value === null ? "—" : metric === "participations" ? value : `${value.toFixed(2)}×`}</span></td>${metric === "average" ? `<td data-trial-ranking-samples>${entry[scope].sampleCount}</td>` : ""}</tr>`;
        })
        .join("");
      const title =
        metric === "participations"
          ? t("trialRankingParticipations")
          : scope === "all"
            ? t("trialRankingTotalTitle")
            : t("trialRankingAverageTitle", { scope: t(`trialRankingScope_${scope}`) });
      return `<article class="mwi-trial-column" data-trial-ranking-column="${metric === "participations" ? metric : scope}"><h4>${e(title)}</h4>${entries.length ? `<table class="mwi-trial-table mwi-trial-ranking-table"><caption>${e(title)}</caption><thead><tr><th scope="col">${e(t("trialRankingRank"))}</th><th scope="col">${e(t("trialMember"))}</th><th scope="col">${e(t(metric === "participations" ? "trialRankingCount" : scope === "all" ? "trialRankingTotalMultiple" : "trialRankingMultiple"))}</th>${metric === "average" ? `<th scope="col">${e(t("trialRankingSamples"))}</th>` : ""}</tr></thead><tbody>${rows}</tbody></table>` : `<p class="mwi-trial-empty">${e(t("trialPlayerEmpty"))}</p>`}</article>`;
    }

    function renderRankings({ records, helpOpen }) {
      const players = api.playerRankings(records);
      const columns =
        renderRankingColumn(players, "participations") +
        ["skilling", "combat", "all"].map((scope) => renderRankingColumn(players, "average", scope)).join("");
      return `<div class="mwi-trial-rankings"><details class="mwi-trial-guide" data-trial-ranking-help ${helpOpen ? "open" : ""}><summary>${e(t("trialRankingMethod"))}</summary><p>${e(t("trialRankingCountHelp"))}</p><p>${e(t("trialRankingAverageHelp"))}</p></details>${renderRail("player-rankings", t("trialPlayerRankings"), columns, "rankings")}</div>`;
    }

    function render({ member, weeks, projects = [], profileState, profileSectionsOpen = {} }) {
      tooltipRecords.clear();
      return `<div class="mwi-trial-player-toolbar"><button type="button" data-trial-player-back>${e(t("trialPlayerBack"))}</button><h3 tabindex="-1" data-trial-player-title>${e(member.name)} · ${e(t("trialPlayerHistory"))}</h3></div><div class="mwi-trial-player-layout"><aside class="mwi-trial-player-profile" aria-label="${e(t("trialPlayerProfile"))}"><header><h3>${e(t("trialPlayerProfile"))}</h3><button type="button" data-trial-profile-refresh ${profileState.status === "loading" ? "disabled" : ""}>${e(t("trialProfileRefresh"))}</button></header><div data-trial-profile-content>${profileMarkup(profileState, profileSectionsOpen, projects)}</div></aside><div class="mwi-trial-player-history">${historyMarkup(weeks)}</div></div>`;
    }
    return { render, renderRankings, tooltipData: (key) => tooltipRecords.get(key) };
  }
  return { createRenderer, equipmentLayout, skillLayout };
});
