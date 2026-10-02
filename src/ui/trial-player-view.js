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
  // Official house room HRIDs, in the same skill order as the native profile.
  const SKILL_ROOMS = {
    milking: "dairy_barn",
    foraging: "garden",
    woodcutting: "log_shed",
    cheesesmithing: "forge",
    crafting: "workshop",
    tailoring: "sewing_parlor",
    cooking: "kitchen",
    brewing: "brewery",
    alchemy: "laboratory",
    enhancing: "observatory",
    stamina: "dining_room",
    intelligence: "library",
    attack: "dojo",
    defense: "armory",
    melee: "gym",
    ranged: "archery_range",
    magic: "mystical_study"
  };
  function skillHouseLevel(roomMap, skillKey) {
    const room = SKILL_ROOMS[skillKey];
    if (!room || !roomMap || typeof roomMap !== "object" || Array.isArray(roomMap)) return null;
    const hrid = `/house_rooms/${room}`;
    if (!Object.hasOwn(roomMap, hrid)) return null;
    const level = roomMap[hrid]?.level;
    return Number.isSafeInteger(level) && level >= 0 ? level : null;
  }

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

  function createMemberNameFormatter({ t, isScreenshotMode }) {
    const aliases = new Map();
    return (member) => {
      if (!isScreenshotMode()) return member.name || t("trialNameUnavailable");
      if (member.id == null && !member.name) return t("trialNameUnavailable");
      const key = JSON.stringify([member.id == null ? "name" : "id", member.id ?? member.name]);
      if (!aliases.has(key)) aliases.set(key, aliases.size + 1);
      return t("trialAnonymousPlayer", { number: aliases.get(key) });
    };
  }

  // Resolve CSS-module hashes from the loaded game stylesheet, so custom
  // gradients, shadows and pseudo-elements keep the game's own implementation.
  function nativeNameClasses(document) {
    const classes = new Map();
    const visit = (rules) => {
      for (const rule of rules || []) {
        for (const match of (rule.selectorText || "").matchAll(/\.(CharacterName_([A-Za-z0-9_]+?)__[A-Za-z0-9_-]+)/g))
          classes.set(match[2], match[1]);
        if (rule.cssRules) visit(rule.cssRules);
      }
    };
    for (const sheet of document.styleSheets || []) {
      try {
        visit(sheet.cssRules);
      } catch (_) {
        // Cross-origin stylesheets may be unreadable; names remain usable.
      }
    }
    return classes;
  }

  function createMemberNameRenderer({ escapeHtml: e, formatMemberName, isPlain, gameIcon, document }) {
    let classes = new Map();
    let cosmetics = new Map();
    const validHrid = (value, type) => typeof value === "string" && new RegExp(`^/${type}/[a-z0-9_]+$`).test(value);
    const render = (member, saved) => {
      const name = formatMemberName(member);
      if (isPlain()) return `<span class="mwi-trial-member-name">${e(name)}</span>`;
      const appearance = member.id == null ? saved : cosmetics.get(String(member.id)) || saved;
      const icons = [appearance?.specialChatIconHrid, appearance?.chatIconHrid]
        .filter((hrid) => validHrid(hrid, "chat_icons"))
        .map((hrid) => gameIcon("chat_icons_sprite", hrid.split("/").pop(), "mwi-trial-name-icon"))
        .join("");
      const color = validHrid(appearance?.nameColorHrid, "name_colors")
        ? classes.get(appearance.nameColorHrid.split("/").pop())
        : null;
      const native = color && classes.get("characterName") && classes.get("name");
      return `<span class="mwi-trial-member-name${native ? ` ${e(classes.get("characterName"))}` : ""}" translate="no">${icons}<span class="mwi-trial-name-text${native ? ` ${e(classes.get("name"))} ${e(color)}` : ""}"${native ? ` data-name="${e(name)}"` : ""}><span>${e(name)}</span></span></span>`;
    };
    render.refresh = (records, context = {}) => {
      classes = nativeNameClasses(document);
      cosmetics = new Map();
      // Most recently observed appearance wins; never match separate identities by name.
      for (const record of [...records].sort((a, b) => (a.capturedAt || 0) - (b.capturedAt || 0))) {
        for (const row of record.rows) {
          if (row.characterId == null) continue;
          const saved = record.members?.[row.memberKey ?? row.characterId];
          if (saved) cosmetics.set(String(row.characterId), saved);
        }
      }
      for (const [id, member] of Object.entries(context.members || {}))
        cosmetics.set(id, { ...cosmetics.get(id), ...member });
    };
    return render;
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
    memberIdentityAttributes,
    formatMemberName,
    renderMemberName = (member) => e(formatMemberName(member)),
    isScreenshotMode
  }) {
    const tooltipRecords = new Map();
    function tooltipAttribute(kind, record) {
      if (!record || isScreenshotMode()) return "";
      const key = String(tooltipRecords.size);
      tooltipRecords.set(key, { kind, record });
      return `data-trial-profile-tooltip="${key}"`;
    }
    const number = (value, digits) =>
      typeof value === "number" && Number.isFinite(value)
        ? digits === undefined
          ? String(value)
          : value.toFixed(digits)
        : "—";
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
    function skillsMarkup(skills, roomMap) {
      if (!skills.some((skill) => suffix(skill.skillHrid) !== "total_level")) return "";
      return `<div class="mwi-trial-skill-grid" aria-label="${e(t("trialProfileSkills"))}">${skillLayout(skills)
        .map(({ key, row, column, skill }) => {
          const hrid = skill?.skillHrid || `/skills/${key}`;
          const name = label(hrid);
          const level = `Lv.${number(skill?.level)}`;
          const houseLevel = skillHouseLevel(roomMap, key);
          const houseLabel = t("trialProfileHouseLevel", { level: number(houseLevel) });
          const description = `${name} ${level} · ${houseLabel}`;
          const houseBadge = `<span class="mwi-trial-skill-house" data-house-level="${e(number(houseLevel))}"${houseLevel === null ? ' data-unknown="true"' : ""} aria-hidden="true"><svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m1.5 7 6.5-5.5L14.5 7M3.5 5.5v8h9v-8M6.5 13.5v-5h3v5"/></svg><span>${e(number(houseLevel))}</span></span>`;
          return `<div class="mwi-trial-equipment-slot mwi-trial-skill-slot" data-profile-skill="${e(key)}" ${tooltipAttribute("skill", skill)} style="grid-row:${row};grid-column:${column}" tabindex="0" role="img" aria-label="${e(description)}" title="${e(description)}">${profileIcon("skill", hrid) || `<span class="mwi-trial-slot-label">${e(name)}</span>`}<span class="mwi-trial-equipment-level">${e(level)}</span>${houseBadge}</div>`;
        })
        .join("")}</div>`;
    }
    function profileSection(key, title, content, sectionOpen) {
      if (!content) return "";
      return `<details class="mwi-trial-profile-section" data-trial-profile-section="${key}" ${sectionOpen[key] !== false ? "open" : ""}><summary>${e(t(title))}</summary>${content}</details>`;
    }
    function overviewMarkup(projects, sectionOpen) {
      const multiple = (value) => (value === null ? "—" : `${value.toFixed(2)}×`);
      const cells = (values) =>
        `<td data-trial-overview-count>${values.participations}</td><td data-trial-overview-average>${multiple(values.average)}</td><td data-trial-overview-total>${multiple(values.total)}</td>`;
      const tables = ["skilling", "combat"]
        .map((kind) => {
          const categoryProjects = projects.filter((project) => project.kind === kind);
          const rows = categoryProjects
            .map(
              (project) =>
                `<tr data-trial-overview-project="${e(project.trialHrid)}"><th scope="row"><span>${projectIcon(project)}<span class="mwi-trial-overview-project-name">${e(trialName(project))}</span></span></th>${cells(project)}</tr>`
            )
            .join("");
          const summary = api.summarizePlayerProjects(categoryProjects);
          return `<table class="mwi-trial-player-overview" data-trial-overview-kind="${kind}"><caption>${e(t(kind === "skilling" ? "trialSkilling" : "trialCombat"))}</caption><colgroup><col class="mwi-trial-overview-name"><col class="mwi-trial-overview-count"><col><col></colgroup><thead><tr><th scope="col">${e(t("trialOverviewProject"))}</th><th scope="col">${e(t("trialRankingCount"))}</th><th scope="col">${e(t("trialOverviewAverage"))}</th><th scope="col">${e(t("trialOverviewTotal"))}</th></tr></thead><tbody>${rows}</tbody><tfoot><tr data-trial-overview-summary="${kind}"><th scope="row">${e(t("trialOverviewAllProjects"))}</th>${cells(summary)}</tr></tfoot></table>`;
        })
        .join("");
      return profileSection("overview", "trialPlayerOverview", tables, sectionOpen);
    }
    function joiningTime(value) {
      if (value === null) return e(t("trialProfileJoinedAtUnknown"));
      const date = new Date(value);
      const pad = (number) => String(number).padStart(2, "0");
      const local = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
      return `<time datetime="${e(date.toISOString())}">${e(local)}</time>`;
    }
    function joinedAtMarkup(member) {
      return `<div data-trial-profile-joined-at><dt><span>${e(t("trialProfileJoinedAt"))}</span></dt><dd>${joiningTime(api.currentMemberJoinedAt(getBridge()?.trialHistoryContext, member))}</dd></div>`;
    }
    function activityMarkup(profile) {
      const character = profile?.sharableCharacter;
      const action =
        typeof character?.actionType === "string" && /^\/action_types\/([a-z_]+)$/.exec(character.actionType)?.[1];
      const activity = SKILL_ROWS.slice(0, 2).flat().includes(action)
        ? t(`trialName_${action}`)
        : ["combat", "labyrinth", "special"].includes(action)
          ? t(`trialActivity_${action}`)
          : t("trialActivityUnknown");
      const presence =
        character?.hideOnlineStatus === true
          ? "hidden"
          : character?.isOnline === true
            ? "online"
            : character?.isOnline === false
              ? "offline"
              : "unknown";
      return `<div data-trial-profile-activity><dt><span>${e(t("trialProfileActivity"))}</span></dt><dd>${e(activity)}</dd></div><div data-trial-profile-presence="${presence}"><dt><span>${e(t("trialProfilePresence"))}</span></dt><dd>${e(t(`trialPresence_${presence}`))}</dd></div>`;
    }

    function profileMarkup(state, sectionOpen, projects, member) {
      const overview = overviewMarkup(projects, sectionOpen);
      const joinedAt = joinedAtMarkup(member);
      if (state.status !== "ready")
        return `<p class="mwi-trial-meta" role="status">${e(t(state.status === "loading" ? "trialProfileLoading" : state.status === "timeout" ? "trialProfileTimeout" : state.status === "mismatch" ? "trialProfileMismatch" : "trialProfileUnavailable"))}</p><dl class="mwi-trial-profile-facts">${activityMarkup(null)}${joinedAt}</dl>${overview}`;
      const profile = state.profile;
      const skills = entries(profile.characterSkills).filter((item) => item && item.skillHrid);
      const total = skills.find((item) => suffix(item.skillHrid) === "total_level");
      let html = `<dl class="mwi-trial-profile-facts">${activityMarkup(profile)}${metric(t("trialProfileTotalLevel"), number(total?.level ?? profile.totalLevel))}${metric(t("trialProfileCombatLevel"), number(profile.combatLevel, 1))}${joinedAt}</dl>`;
      html += overview;
      html += profileSection(
        "skills",
        "trialProfileSkills",
        skillsMarkup(skills, profile.characterHouseRoomMap),
        sectionOpen
      );
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
      if (!isScreenshotMode())
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

    function renderRankingColumn(players, metric, scope, index, count) {
      const entries = [...players];
      const score = (entry) =>
        metric === "joinedAt"
          ? entry.joinedAt
          : metric === "participations"
            ? entry.participations
            : scope === "all"
              ? entry.all.total
              : entry[scope].average;
      const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
      entries.sort((a, b) => {
        const left = score(a),
          right = score(b);
        if (left === null || right === null)
          return left === right ? collator.compare(a.name, b.name) : left === null ? 1 : -1;
        return (
          (metric === "joinedAt" ? left - right : right - left) ||
          collator.compare(a.name, b.name) ||
          a.key.localeCompare(b.key)
        );
      });
      let previous = null,
        rank = 0;
      const rows = entries
        .map((entry, index) => {
          const value = score(entry);
          if (value !== previous) rank = index + 1;
          previous = value;
          const name = renderMemberName(entry);
          return `<tr data-trial-ranking-row="${e(entry.key)}"><td>${value === null ? "—" : rank}</td><th scope="row"${memberIdentityAttributes(entry)}>${entry.name ? `<button type="button" class="mwi-trial-heading-link" data-trial-ranking-player="${e(entry.key)}">${name}</button>` : name}</th><td><span data-trial-ranking-value>${metric === "joinedAt" ? joiningTime(value) : value === null ? "—" : metric === "participations" ? value : `${value.toFixed(2)}×`}</span></td>${metric === "average" ? `<td data-trial-ranking-samples>${entry[scope].sampleCount}</td>` : ""}</tr>`;
        })
        .join("");
      const title =
        metric === "joinedAt"
          ? t("trialRankingJoinedAt")
          : metric === "participations"
            ? t("trialRankingParticipations")
            : scope === "all"
              ? t("trialRankingTotalTitle")
              : t("trialRankingAverageTitle", { scope: t(`trialRankingScope_${scope}`) });
      const key = metric === "average" ? scope : metric;
      const icon = (path) =>
        `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="${path}"/></svg>`;
      const controls = `<div class="mwi-trial-ranking-controls"><button type="button" data-trial-ranking-move="${key}" data-direction="-1" aria-label="${e(t("trialRankingMoveLeft", { name: title }))}" title="${e(t("trialRankingMoveLeft", { name: title }))}"${index === 0 ? " disabled" : ""}>${icon("m9 4-4 4 4 4")}</button><button type="button" data-trial-ranking-drag="${key}" aria-label="${e(t("trialRankingDrag", { name: title }))}" title="${e(t("trialRankingDrag", { name: title }))}">${icon("M5 3v2m6-2v2M5 7v2m6-2v2M5 11v2m6-2v2")}</button><button type="button" data-trial-ranking-move="${key}" data-direction="1" aria-label="${e(t("trialRankingMoveRight", { name: title }))}" title="${e(t("trialRankingMoveRight", { name: title }))}"${index === count - 1 ? " disabled" : ""}>${icon("m7 4 4 4-4 4")}</button></div>`;
      return `<article class="mwi-trial-column" data-sort-key="${key}" data-trial-ranking-column="${key}"><h4>${e(title)}</h4>${controls}${entries.length ? `<table class="mwi-trial-table mwi-trial-ranking-table"><caption>${e(title)}</caption><thead><tr><th scope="col">${e(t("trialRankingRank"))}</th><th scope="col">${e(t("trialMember"))}</th><th scope="col">${e(t(metric === "joinedAt" ? "trialProfileJoinedAt" : metric === "participations" ? "trialRankingCount" : scope === "all" ? "trialRankingTotalMultiple" : "trialRankingMultiple"))}</th>${metric === "average" ? `<th scope="col">${e(t("trialRankingSamples"))}</th>` : ""}</tr></thead><tbody>${rows}</tbody></table>` : `<p class="mwi-trial-empty">${e(t(metric === "joinedAt" ? "trialRankingRosterEmpty" : "trialPlayerEmpty"))}</p>`}</article>`;
    }

    function renderRankings({ records, rankingOrder, orderSaveFailed }) {
      const players = api.playerRankings(records);
      const members = api.currentMembershipRankings(getBridge()?.trialHistoryContext);
      const columns = rankingOrder
        .map((key, index) =>
          renderRankingColumn(
            key === "joinedAt" ? members : players,
            key === "participations" || key === "joinedAt" ? key : "average",
            key,
            index,
            rankingOrder.length
          )
        )
        .join("");
      return `<div class="mwi-trial-rankings"><p class="mwi-trial-help" data-trial-ranking-order-status role="status">${orderSaveFailed ? e(t("trialRankingOrderSaveFailed")) : ""}</p>${renderRail("player-rankings", t("trialPlayerRankings"), columns, "rankings")}</div>`;
    }

    function render({ member, weeks, projects = [], profileState, profileSectionsOpen = {} }) {
      tooltipRecords.clear();
      return `<div class="mwi-trial-player-toolbar"><button type="button" data-trial-player-back>${e(t("trialPlayerBack"))}</button><h3 tabindex="-1" data-trial-player-title>${renderMemberName(member)} · ${e(t("trialPlayerHistory"))}</h3></div><div class="mwi-trial-player-layout"><aside class="mwi-trial-player-profile" aria-label="${e(t("trialPlayerProfile"))}"><header><h3>${e(t("trialPlayerProfile"))}</h3><button type="button" data-trial-profile-refresh ${profileState.status === "loading" ? "disabled" : ""}>${e(t("trialProfileRefresh"))}</button></header><div data-trial-profile-content>${profileMarkup(profileState, profileSectionsOpen, projects, member)}</div></aside><div class="mwi-trial-player-history">${historyMarkup(weeks)}</div></div>`;
    }
    return { render, renderRankings, tooltipData: (key) => tooltipRecords.get(key) };
  }
  return {
    createRenderer,
    createMemberNameFormatter,
    createMemberNameRenderer,
    nativeNameClasses,
    equipmentLayout,
    skillLayout,
    skillHouseLevel
  };
});
