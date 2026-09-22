(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MwiGuildTrialHistoryView = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function projectIconSpec(record, detail = record.trialDetail) {
    const project = String(record.trialHrid || "")
      .split("/")
      .pop();
    let sprite, symbol;
    if (record.kind === "skilling") {
      sprite = "skills_sprite";
      symbol = String(detail?.skillHrid || project)
        .split("/")
        .pop();
    } else if (record.kind === "combat") {
      const monsters = [...new Set(Array.isArray(detail?.monsterHrids) ? detail.monsterHrids : [])];
      if (monsters.length === 1) {
        sprite = "combat_monsters_sprite";
        symbol = String(monsters[0]).split("/").pop();
      } else if (monsters.length > 1 || project === "swarm") {
        sprite = "misc_sprite";
        symbol = "trial_swarm";
      } else if (["badger", "chameleon", "hedgehog", "jellyfish"].includes(project)) {
        sprite = "combat_monsters_sprite";
        symbol = `trial_${project}`;
      }
    }
    return sprite && /^[a-z0-9_]+$/.test(symbol || "") ? { sprite, symbol } : null;
  }

  function createTrialHistoryView({
    document,
    domApi,
    pageWindow,
    t,
    escapeHtml,
    pluginStorage,
    trialHistoryApi,
    playerViewApi,
    profileTooltipApi,
    profileReaderApi,
    resolveItemName,
    getBridge,
    getPanel
  }) {
    let mode = "week";
    let screenshotMode = false;
    const isScreenshotMode = () => screenshotMode;
    const formatMemberName = playerViewApi.createMemberNameFormatter({ t, isScreenshotMode });
    let selectedWeek = "";
    let selectedProject = "";
    let resetScroll = false;
    let resizeObserver = null;
    let profileTooltip = null;
    let records = [];
    let multipleGuilds = false;
    let loadFailed = false;
    let importPreview = null;
    let importNotice = null;
    let importBusy = false;
    let importRevision = 0;
    let guideOpen = false;
    let displaySettingsOpen = false;
    let displaySaveFailed = false;
    let displaySettings = pluginStorage.loadTrialDisplay();
    const unsaved = new Map();
    const spriteBases = {};
    let spriteLoadPromise = null;
    let disposed = false;
    let displayedMembers = [];
    let highlightedMember = null;
    let hoveredMemberCell = null;
    let focusedMemberCell = null;
    let selectedMember = null;
    let profileState = { status: "loading" };
    const profileSectionsOpen = { overview: true, skills: true, equipment: true };
    let profileRevision = 0;
    let playerReturn = null;
    let playerSearch = "";
    let playerPickerOpen = true;
    let playerSearchComposing = false;

    function projectIcon(record) {
      const detail = getBridge()?.trialHistoryContext?.details?.[record.trialHrid] || record.trialDetail;
      const spec = projectIconSpec(record, detail);
      return spec ? gameIcon(spec.sprite, spec.symbol, "mwi-trial-project-icon") : "";
    }

    function profileIcon(kind, hrid) {
      return gameIcon(
        kind === "skill" ? "skills_sprite" : kind === "ability" ? "abilities_sprite" : "items_sprite",
        String(hrid || "")
          .split("/")
          .pop(),
        "mwi-trial-profile-icon"
      );
    }

    function gameIcon(sprite, symbol, className) {
      if (!/^[a-z0-9_]+$/.test(symbol || "")) return "";
      let base = spriteBases[sprite] || domApi.findSpriteBaseHref(document, sprite);
      if (base) spriteBases[sprite] = base;
      else if (!spriteLoadPromise && pageWindow.fetch && pageWindow.location?.origin) {
        spriteLoadPromise = pageWindow
          .fetch(new URL("/asset-manifest.json", pageWindow.location.origin).href, { cache: "force-cache" })
          .then((response) => (response.ok ? response.json() : null))
          .then((manifest) => {
            for (const sprite of [
              "skills_sprite",
              "items_sprite",
              "abilities_sprite",
              "combat_monsters_sprite",
              "misc_sprite"
            ]) {
              const reference = domApi.spriteBaseFromAssetManifest(manifest, sprite);
              if (reference) spriteBases[sprite] = new URL(reference, pageWindow.location.origin).href;
            }
            const panel = getPanel();
            if (!disposed && panel?.isConnected && panel.dataset.activeView === "trials") refresh(panel);
          })
          .catch(() => {});
      }
      return base
        ? `<svg class="${className}" width="20" height="20" aria-hidden="true" focusable="false"><use href="${escapeHtml(`${base}#${symbol}`)}" width="100%" height="100%"></use></svg>`
        : "";
    }
    const trialName = (record) => {
      const key = String(record.trialDetail?.skillHrid || record.trialHrid)
        .split("/")
        .pop();
      const label = t(`trialName_${key}`);
      return label === `trialName_${key}` ? String(record.trialDetail?.name || key) : label;
    };
    const number = (value) => (typeof value === "number" && Number.isFinite(value) ? String(value) : "—");

    function reload() {
      const loaded = pluginStorage.loadTrialHistory();
      loadFailed = loaded.failed;
      const merged = new Map(loaded.records.map((record) => [record.key, record]));
      for (const [key, record] of unsaved) merged.set(key, record);
      records = Array.from(merged.values()).sort(trialHistoryApi.compareSnapshots);
      multipleGuilds =
        new Set(
          records.map((record) => JSON.stringify([record.guildId, record.guildId == null ? record.guildName : null]))
        ).size > 1;
    }

    function capture() {
      const bridge = getBridge();
      for (const record of bridge?.pendingTrialSnapshots?.splice(0) || []) unsaved.set(record.key, record);
      reload();
      for (const record of records) {
        const enriched = trialHistoryApi.withMembershipEvidence(
          trialHistoryApi.withMemberLevels(record, bridge?.trialHistoryContext),
          bridge?.trialHistoryContext
        );
        if (enriched !== record) unsaved.set(record.key, enriched);
      }
      for (const [key, record] of unsaved) {
        if (pluginStorage.saveTrialSnapshot(record)) unsaved.delete(key);
      }
      reload();
    }

    function recordDate(record) {
      if (record.weekStartAt) {
        const start = new Date(record.weekStartAt);
        const week = t("guildPointWeekWithDate", {
          count: trialHistoryApi.weekNumber(record.weekStartAt),
          date: `${start.getUTCMonth() + 1}/${start.getUTCDate()}`
        });
        return record.trialDate ? `${week} · ${record.trialDate}` : week;
      }
      return record.trialDate || t("trialUnknownDate");
    }

    function renderImport() {
      const preview = importPreview ? trialHistoryApi.previewImport(importPreview.records, records) : [];
      const count = (status) => preview.filter((entry) => entry.status === status).length;
      const summary = {
        added: count("new"),
        dated: count("dated"),
        duplicates: count("duplicate"),
        conflicts: count("conflict")
      };
      let markup = `<section class="mwi-trial-import" aria-label="${escapeHtml(t("trialDataTransfer"))}" aria-busy="${importBusy}">
        <header class="mwi-trial-toolbar"><div class="mwi-trial-heading"><h2>${escapeHtml(t("trialHistory"))}</h2><p class="mwi-trial-notice" data-state="${unsaved.size || loadFailed ? "warning" : "saved"}" role="status" aria-live="polite">${escapeHtml(t(unsaved.size ? "trialSaveFailed" : loadFailed ? "trialLoadFailed" : "trialSavedCount", { count: records.length }))}</p></div><div class="mwi-trial-controls"><button type="button" data-trial-screenshot-mode aria-pressed="${screenshotMode}" title="${escapeHtml(t("trialScreenshotHint"))}">${escapeHtml(t(screenshotMode ? "trialScreenshotExit" : "trialScreenshotMode"))}</button><button type="button" data-role="trial-import-open"${importBusy ? " disabled" : ""}>${escapeHtml(t("trialImport"))}</button>
        <button type="button" data-role="trial-export"${records.length ? "" : ` disabled title="${escapeHtml(t("trialHistoryEmpty"))}"`}>${escapeHtml(t("trialExport"))}</button></div></header>
        <input type="file" accept=".json,application/json" data-role="trial-import-file" aria-label="${escapeHtml(t("trialImportFile"))}" hidden>
        <details class="mwi-trial-guide"${guideOpen ? " open" : ""}><summary>${escapeHtml(t("trialGuide"))}</summary><div class="mwi-trial-purpose" data-role="trial-purpose"><p>${escapeHtml(t("trialDisplayNotice"))}</p><p>${escapeHtml(t("trialFeedbackNotice"))}</p></div><p class="mwi-trial-help">${escapeHtml(t("trialHistoryHint"))}</p><p class="mwi-trial-help">${escapeHtml(t("trialImportHint"))}</p></details>
        <p data-role="trial-import-status" role="status" aria-live="polite" tabindex="-1">${escapeHtml(importBusy ? t("trialImportReading") : importNotice ? t(importNotice.key, importNotice.values) : "")}</p>`;
      if (importPreview) {
        markup += `<div class="mwi-trial-import-preview"><h3>${escapeHtml(t("trialImportPreview"))}</h3>
          <p class="mwi-trial-meta">${screenshotMode ? "" : `${escapeHtml(importPreview.name)}<br>`}${escapeHtml(t("trialImportSummary", summary))}</p>
          <ul class="mwi-trial-import-list" tabindex="0" aria-label="${escapeHtml(t("trialImportPreview"))}">${preview.map(({ record, status }) => `<li><strong>${escapeHtml(trialName(record))} · ${escapeHtml(t(`trialImportStatus_${status}`))}</strong><span>${escapeHtml(`${recordDate(record)} · ${record.guildName || t("trialUnknownGuild")}`)}</span><span>${escapeHtml(t("trialImportMemberCount", { count: record.rows.length }))} · ${escapeHtml(t(record.source === "manual" ? "trialManualSource" : "trialAutomaticSource"))}</span></li>`).join("")}</ul>
          <div class="mwi-trial-controls"><button type="button" data-role="trial-import-confirm"${!(summary.added + summary.dated) || importBusy ? " disabled" : ""}>${escapeHtml(t("trialImportConfirm", { count: summary.added + summary.dated }))}</button>
          <button type="button" data-role="trial-import-cancel">${escapeHtml(t("trialImportCancel"))}</button></div></div>`;
      }
      return markup + "</section>";
    }

    async function readImport(file, panel) {
      if (!file) return;
      const revision = ++importRevision;
      importPreview = null;
      importNotice = null;
      importBusy = true;
      refresh(panel);
      try {
        if (file.size > trialHistoryApi.MAX_IMPORT_BYTES)
          throw Object.assign(new Error(), { code: "trialImportTooLarge" });
        const text = await file.text();
        if (revision !== importRevision) return;
        importPreview = { name: file.name, records: trialHistoryApi.parseImport(text) };
      } catch (error) {
        if (revision !== importRevision) return;
        importNotice = {
          key:
            typeof error.code === "string" && error.code.startsWith("trialImport")
              ? error.code
              : "trialImportReadFailed",
          values: { index: error.recordIndex || "—" }
        };
      }
      if (revision !== importRevision) return;
      importBusy = false;
      refresh(panel);
      const next =
        panel.querySelector('[data-role="trial-import-confirm"]:not(:disabled)') ||
        panel.querySelector('[data-role="trial-import-cancel"]') ||
        panel.querySelector('[data-role="trial-import-status"]');
      next?.focus();
    }

    function confirmImport(panel) {
      if (!importPreview || importBusy) return;
      // Pending automatic captures also count as existing; never replace them
      // with an imported copy while browser storage is unavailable.
      capture();
      const plan = trialHistoryApi.previewImport(importPreview.records, records);
      const additions = plan.filter((entry) => ["new", "dated"].includes(entry.status)).map((entry) => entry.record);
      const result = additions.length
        ? pluginStorage.importTrialHistory(additions)
        : { status: "imported", added: 0, dated: 0, duplicates: 0, conflicts: 0 };
      result.duplicates += plan.filter((entry) => entry.status === "duplicate").length;
      result.conflicts += plan.filter((entry) => entry.status === "conflict").length;
      if (result.status === "imported") {
        if (result.added + result.dated) {
          selectedWeek = trialHistoryApi.historyWeeks([additions[0]])[0].key;
          selectedProject = trialHistoryApi.historyProjectKey(additions[0]);
          resetScroll = true;
        }
        importPreview = null;
      }
      importNotice = {
        key:
          result.status === "imported"
            ? "trialImportComplete"
            : result.status === "partial"
              ? "trialImportPartial"
              : "trialImportSaveFailed",
        values: result
      };
      refresh(panel);
      panel.querySelector('[data-role="trial-import-status"]')?.focus();
    }

    function weekLabel(week) {
      if (week.weekNumber === null) return t("trialUnknownWeek");
      const start = new Date(week.weekStartAt);
      return t("guildPointWeekWithDate", {
        count: week.weekNumber,
        date: `${start.getUTCMonth() + 1}/${start.getUTCDate()}`
      });
    }

    const tableSorts = new Map();
    function getSort(key, kind) {
      const fields = visibleFields(kind);
      const saved = tableSorts.get(key);
      if (saved && (saved.field === "member" || fields.includes(saved.field))) return saved;
      if (kind === "combat") return null;
      const field = ["workDone", "workShare", "workMultiple"].find((value) => fields.includes(value)) || "member";
      return { field, direction: field === "member" ? "asc" : "desc" };
    }
    function renderSortHeader(key, field, sort) {
      const label = t(field === "member" ? "trialMember" : `trialField_${field}`);
      const active = sort?.field === field;
      const next = active ? (sort.direction === "asc" ? "desc" : "asc") : field === "member" ? "asc" : "desc";
      const action = t(next === "asc" ? "trialSortAscending" : "trialSortDescending", { field: label });
      return `<th scope="col" aria-sort="${active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}"><button type="button" class="mwi-trial-sort" data-trial-sort="${field}" data-trial-sort-key="${escapeHtml(key)}" data-trial-sort-next="${next}" aria-label="${escapeHtml(action)}" title="${escapeHtml(action)}"><span>${escapeHtml(label)}</span><svg width="12" height="14" viewBox="0 0 12 14" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">${!active || sort.direction === "asc" ? '<path d="m3 5 3-3 3 3"/>' : ""}${!active || sort.direction === "desc" ? '<path d="m3 9 3 3 3-3"/>' : ""}</svg></button></th>`;
    }

    const playerRenderer = playerViewApi.createRenderer({
      t,
      escapeHtml,
      trialHistoryApi,
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
      isScreenshotMode
    });

    function readPlayerProfile(panel, force = false) {
      const revision = ++profileRevision;
      const member = selectedMember;
      profileState = { status: "loading" };
      refresh(panel);
      const receive = (result) => {
        if (disposed || revision !== profileRevision || mode !== "player" || selectedMember !== member) return;
        if (result.status === "ready") {
          const identity = profileReaderApi.profileIdentity(result.profile);
          if (member.id !== null && identity.id !== null && member.id !== identity.id) result = { status: "mismatch" };
        }
        profileState = result;
        refresh(panel);
      };
      const name =
        member.id != null ? getBridge()?.trialHistoryContext?.members?.[member.id]?.name || member.name : member.name;
      if (getBridge()?.requestProfile?.(name, receive, force) !== true) receive({ status: "unavailable" });
    }

    function leavePlayer() {
      profileRevision += 1;
      selectedMember = null;
      playerPickerOpen = true;
    }

    function renderMember(record, row) {
      const rawName = record.members?.[row.memberKey ?? row.characterId]?.name;
      const name = formatMemberName(trialHistoryApi.memberIdentity(record, row));
      const absent = trialHistoryApi.memberAbsent(record, row, getBridge()?.trialHistoryContext);
      const label = escapeHtml(t("trialMemberAbsent"));
      return (
        (rawName
          ? `<button type="button" class="mwi-trial-profile-link" data-trial-profile="${escapeHtml(rawName)}" data-trial-identity="${escapeHtml(JSON.stringify(trialHistoryApi.memberIdentity(record, row)))}" aria-label="${escapeHtml(t("trialOpenProfile", { name }))}">${escapeHtml(name)}</button>`
          : escapeHtml(name)) +
        (absent
          ? ` <span class="mwi-trial-member-absent" role="img" tabindex="0" title="${label}" aria-label="${label}"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="8" cy="8" r="6"/><path d="M8 4.5v4M8 10.5v1"/></svg></span>`
          : "")
      );
    }

    function memberAttributes(record, row) {
      if (mode !== "project" && mode !== "player") return "";
      return memberIdentityAttributes(trialHistoryApi.memberIdentity(record, row));
    }

    function memberIdentityAttributes(member) {
      const index = displayedMembers.push(member) - 1;
      return ` data-trial-member="${index}"`;
    }

    function updateMemberInteraction(host, target, keyboard) {
      const candidate = target?.closest?.("[data-trial-member]");
      const cell = candidate && host.contains(candidate) ? candidate : null;
      if (keyboard) focusedMemberCell = cell;
      else hoveredMemberCell = cell;
      highlightMember(host, hoveredMemberCell || focusedMemberCell);
    }

    function highlightMember(host, target) {
      const cell = target?.closest?.("[data-trial-member]");
      const index = cell && host.contains(cell) ? cell.dataset.trialMember : null;
      if (index === highlightedMember) return;
      highlightedMember = index;
      const member = index === null ? null : displayedMembers[Number(index)];
      for (const name of host.querySelectorAll("[data-trial-member]")) {
        name
          .closest("tr")
          .classList.toggle(
            "mwi-trial-member-highlight",
            Boolean(member && trialHistoryApi.sameMember(member, displayedMembers[Number(name.dataset.trialMember)]))
          );
      }
    }

    function visibleFields(kind) {
      return (
        kind === "combat"
          ? ["level", "damageDealt", "healingDone", "premitigatedDamageTaken"]
          : ["level", "workDone", "workShare", "workMultiple"]
      ).filter((field) => displaySettings[field] !== false);
    }

    function renderDisplaySettings() {
      return `<details class="mwi-trial-display-settings" ${displaySettingsOpen ? "open" : ""}><summary>${escapeHtml(t("trialDisplaySettings"))}</summary><fieldset><legend>${escapeHtml(t("trialMemberColumns"))}</legend><div class="mwi-trial-display-options">${["level", "workDone", "workShare", "workMultiple", "levelSummary", "workSummary"].map((field) => `<label><input type="checkbox" data-trial-display="${field}" ${displaySettings[field] ? "checked" : ""}>${escapeHtml(t(`trialField_${field}`))}</label>`).join("")}</div><p>${escapeHtml(t("trialDisplaySettingsHint"))}</p></fieldset>${displaySaveFailed ? `<p role="status">${escapeHtml(t("trialDisplaySaveFailed"))}</p>` : ""}</details>`;
    }

    function summaryNumber(value) {
      return value === null || !Number.isFinite(value) ? "—" : String(Number(value.toFixed(2)));
    }

    function renderOverview(record, summaries) {
      const items = Object.entries(summaries)
        .filter(([field]) => displaySettings[field === "level" ? "levelSummary" : "workSummary"])
        .map(
          ([field, stats]) =>
            `<div class="mwi-trial-overview-metric" data-trial-overview="${field}"><dl>${["total", "average", "median"].map((aggregate) => `<div><dt>${escapeHtml(t(`trialAggregate_${field}_${aggregate}`))}</dt><dd data-trial-aggregate="${aggregate}">${escapeHtml(summaryNumber(stats[aggregate]))}</dd></div>`).join("")}</dl>${stats.missing ? `<p>${escapeHtml(t("trialKnownCoverage", { field: t(`trialField_${field}`), count: stats.count, total: record.rows.length }))}</p>` : ""}</div>`
        )
        .join("");
      const partial =
        (displaySettings.workShare || displaySettings.workMultiple) &&
        record.kind === "skilling" &&
        summaries.workDone.missing
          ? `<p>${escapeHtml(t("trialPartialShare"))}</p>`
          : "";
      if (!items && !partial) return "";
      return `<div class="mwi-trial-overview" data-role="trial-overview" aria-label="${escapeHtml(t("trialOverview"))}">${items}${partial}</div>`;
    }

    function renderRecord(record, showIdentity) {
      const fields = visibleFields(record.kind);
      const summaries = Object.fromEntries(
        (record.kind === "combat" ? ["level"] : ["level", "workDone"]).map((field) => [
          field,
          trialHistoryApi.summarizeMetric(record, field)
        ])
      );
      const cellValue = (row, field) => {
        if (field === "workMultiple") {
          const multiple = trialHistoryApi.metricAverageMultiple(record, row, "workDone", summaries.workDone);
          return multiple === null ? "—" : `${multiple.toFixed(2)}×`;
        }
        if (field === "workShare") {
          const share = trialHistoryApi.metricShare(record, row, "workDone", summaries.workDone);
          return share === null ? "—" : `${share.toFixed(2)}%`;
        }
        return number(
          field === "level" ? trialHistoryApi.memberLevel(record, row) : trialHistoryApi.metricValue(record, row, field)
        );
      };
      const caption = `${trialName(record)} · ${recordDate(record)} · ${t("trialStatsTable")}`;
      const sort = getSort(record.key, record.kind);
      const progress = trialHistoryApi.nextTierProgress(record);
      const progressLabel = progress === null ? "—" : `${Math.floor(progress * 100)}%`;
      // Sort only the displayed rows; stored records and raw JSON retain source order.
      return `<section class="mwi-trial-record" data-trial-record="${escapeHtml(record.key)}">
        ${showIdentity ? `<p class="mwi-trial-meta">${escapeHtml(record.guildName || t("trialUnknownGuild"))} · ${escapeHtml(t(record.source === "manual" ? "trialManualSource" : "trialAutomaticSource"))}</p>` : ""}
        <p class="mwi-trial-meta">${escapeHtml(t("trialSummary", { count: record.rows.length, points: number(record.points), tier: number(record.party.highestTier), progress: progressLabel }))}</p>
        ${renderOverview(record, summaries)}
        <div class="mwi-trial-table-scroll" data-trial-scroll-id="${escapeHtml(record.key)}" role="region" tabindex="0" aria-label="${escapeHtml(caption)}"><table class="mwi-trial-table" data-role="trial-stats-table"><caption>${escapeHtml(caption)}</caption><thead><tr>${["member", ...fields].map((field) => renderSortHeader(record.key, field, sort)).join("")}</tr></thead><tbody>${trialHistoryApi
          .displayRows(record, sort)
          .map(
            (row) =>
              `<tr${mode === "player" && trialHistoryApi.sameMember(selectedMember, trialHistoryApi.memberIdentity(record, row)) ? ' class="mwi-trial-player-selected" data-trial-selected-member' : ""}><th scope="row"${memberAttributes(record, row)}>${renderMember(record, row)}</th>${fields.map((field) => `<td data-trial-field="${field}">${escapeHtml(cellValue(row, field))}</td>`).join("")}</tr>`
          )
          .join("")}</tbody></table></div>
        ${screenshotMode ? "" : `<details class="mwi-trial-raw" data-trial-raw="${escapeHtml(record.key)}"><summary>${escapeHtml(t("trialRaw"))}</summary><pre>${escapeHtml(JSON.stringify(record, null, 2))}</pre></details>`}</section>`;
    }

    function renderColumn(title, items, attributes = "", jump = "", icon = "") {
      const showIdentity = items.length > 1 || multipleGuilds;
      return `<article class="mwi-trial-column" ${attributes}><h4>${jump ? `<button type="button" class="mwi-trial-heading-link" ${jump}>${icon}${escapeHtml(title)}</button>` : escapeHtml(title)}</h4>${items.length ? items.map((record) => renderRecord(record, showIdentity)).join("") : `<p class="mwi-trial-empty">${escapeHtml(t("trialMissingRecord"))}</p>`}</article>`;
    }

    function renderRail(id, title, columns, kind, timeline = false, showTitle = !timeline) {
      return `<section class="mwi-trial-group" data-trial-group="${id}" aria-labelledby="mwi-trial-heading-${id}"><header class="mwi-trial-group-header"><h3 id="mwi-trial-heading-${id}"${showTitle ? "" : " hidden"}>${escapeHtml(title)}</h3><div class="mwi-trial-scroll-buttons"><button type="button" data-trial-scroll="${id}" data-step="-1" aria-controls="mwi-trial-rail-${id}">${escapeHtml(t(timeline ? "trialNewer" : "trialScrollLeft"))}</button><button type="button" data-trial-scroll="${id}" data-step="1" aria-controls="mwi-trial-rail-${id}">${escapeHtml(t(timeline ? "trialOlder" : "trialScrollRight"))}</button></div></header><div class="mwi-trial-rail" id="mwi-trial-rail-${id}" data-trial-scroll-id="${id}" role="region" tabindex="0" aria-label="${escapeHtml(title)}"><div class="mwi-trial-columns ${timeline ? "mwi-trial-timeline" : "mwi-trial-week-grid"}" data-kind="${kind}">${columns}</div></div></section>`;
    }

    function updateScrollButtons(host) {
      for (const button of host.querySelectorAll("[data-trial-scroll]")) {
        const rail = host.querySelector(`#mwi-trial-rail-${button.dataset.trialScroll}`);
        button.disabled =
          !rail ||
          (button.dataset.step === "-1"
            ? rail.scrollLeft <= 1
            : rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 1);
      }
    }

    function renderChoices(kind, entries, current) {
      const label = t(
        kind === "week" ? "trialChooseWeek" : kind === "player" ? "trialChoosePlayer" : "trialChooseProject"
      );
      return `<div class="mwi-trial-choice-field"><span id="mwi-trial-choice-label">${escapeHtml(label)}</span><div class="mwi-trial-choices" data-role="trial-${kind}" data-trial-scroll-id="choice-${kind}" role="group" aria-labelledby="mwi-trial-choice-label">${entries.map(({ key, label: name, icon = "" }) => `<button type="button" data-trial-choice="${kind}" value="${escapeHtml(key)}" aria-pressed="${key === current}">${icon}<span>${escapeHtml(name)}</span></button>`).join("")}</div></div>`;
    }

    function renderPlayerResults(members, current) {
      const results = trialHistoryApi
        .searchHistoryMembers(
          members.map((member) => ({ member, name: formatMemberName(member) })),
          playerSearch
        )
        .map((result) => result.member);
      const names = new Map();
      for (const member of members) names.set(member.name, (names.get(member.name) || 0) + 1);
      return `<p class="mwi-trial-search-count" role="status">${escapeHtml(t("trialPlayerSearchCount", { count: results.length, total: members.length }))}</p><div class="mwi-trial-choices mwi-trial-player-results" data-role="trial-player" role="group" aria-label="${escapeHtml(t("trialChoosePlayer"))}">${results.map((member) => `<button type="button" data-trial-choice="player" value="${escapeHtml(member.key)}" aria-pressed="${member.key === current}"><span>${escapeHtml(formatMemberName(member))}</span>${!screenshotMode && names.get(member.name) > 1 ? `<small>${escapeHtml(member.id === null ? t("trialManualSource") : `ID ${member.id}`)}</small>` : ""}</button>`).join("")}</div>${results.length ? "" : `<p class="mwi-trial-empty">${escapeHtml(t(members.length ? "trialPlayerSearchEmpty" : "trialNoNamedPlayers"))}</p>`}`;
    }

    function renderPlayerPicker(members, current) {
      const searchForm = `<form class="mwi-trial-player-search" data-trial-player-search-form role="search"><label for="mwi-trial-player-search">${escapeHtml(t("trialPlayerSearchLabel"))}</label><div class="mwi-trial-player-search-bar"><input id="mwi-trial-player-search" type="text" enterkeyhint="search" data-trial-player-search autocomplete="off" spellcheck="false" placeholder="${escapeHtml(t("trialPlayerSearchPlaceholder"))}" value="${escapeHtml(playerSearch)}" aria-controls="mwi-trial-player-results"><div class="mwi-trial-player-search-actions"><button type="submit">${escapeHtml(t("trialPlayerSearchButton"))}</button><button type="button" data-trial-player-search-clear>${escapeHtml(t("trialPlayerSearchClear"))}</button></div></div></form>`;
      return `<details class="mwi-trial-player-picker mwi-trial-choice-field" ${playerPickerOpen ? "open" : ""}><summary>${escapeHtml(selectedMember ? t("trialPlayerSwitch", { name: formatMemberName(selectedMember) }) : t("trialPlayerFind"))}</summary>${searchForm}<div id="mwi-trial-player-results">${renderPlayerResults(members, current)}</div></details>`;
    }

    function filterPlayerResults(host) {
      const input = host.querySelector("[data-trial-player-search]");
      if (!input) return;
      playerSearch = input.value;
      const members = trialHistoryApi.historyMembers(records);
      const current =
        host.querySelector('[data-trial-choice="player"][aria-pressed="true"]')?.value ||
        members.find((member) => selectedMember && trialHistoryApi.sameMember(member, selectedMember))?.key ||
        "";
      host.querySelector("#mwi-trial-player-results").innerHTML = renderPlayerResults(members, current);
    }

    function revealChoice(button) {
      if (!button || button.dataset.trialChoice === "player") return;
      const rail = button.parentElement;
      const bounds = rail.getBoundingClientRect();
      const item = button.getBoundingClientRect();
      if (item.left < bounds.left + 4) rail.scrollLeft += item.left - bounds.left - 4;
      else if (item.right > bounds.right - 4) rail.scrollLeft += item.right - bounds.right + 4;
    }

    function refresh(panel) {
      profileTooltip?.hide();
      capture();
      const host = panel?.querySelector('[data-role="trials-view"]');
      if (!host) return;
      for (const section of host.querySelectorAll("[data-trial-profile-section]"))
        profileSectionsOpen[section.dataset.trialProfileSection] = section.open;
      const searchInput = document.activeElement?.matches("[data-trial-player-search]") ? document.activeElement : null;
      const searchSelection = searchInput ? [searchInput.selectionStart, searchInput.selectionEnd] : null;
      const rankingHelpOpen = Boolean(host.querySelector("[data-trial-ranking-help]")?.open);
      displayedMembers = [];
      highlightedMember = null;
      hoveredMemberCell = null;
      focusedMemberCell = null;
      const scroll = new Map(
        [...host.querySelectorAll("[data-trial-scroll-id]")].map((el) => [
          el.dataset.trialScrollId,
          [el.scrollLeft, el.scrollTop]
        ])
      );
      const openRecords = new Set(
        [...host.querySelectorAll("[data-trial-raw][open]")].map((el) => el.dataset.trialRaw)
      );
      const weeks = trialHistoryApi.historyWeeks(records);
      const details = getBridge()?.trialHistoryContext?.details || {};
      const projects = trialHistoryApi.historyProjects(records, details);
      const week = weeks.find((entry) => entry.key === selectedWeek) || weeks[0];
      const project = projects.find((entry) => entry.key === selectedProject) || projects[0];
      selectedWeek = week?.key || "";
      selectedProject = project?.key || "";
      let markup = renderImport();
      markup += `<div class="mwi-trial-display-controls"><div class="mwi-trial-mode" role="group" aria-label="${escapeHtml(t("trialDisplayMode"))}">${["week", "project", "player"].map((value) => `<button type="button" data-trial-mode="${value}" aria-pressed="${mode === value}">${escapeHtml(t(value === "week" ? "trialByWeek" : value === "project" ? "trialByProject" : "trialByPlayer"))}</button>`).join("")}</div>`;
      if (mode === "player") {
        const members = trialHistoryApi.historyMembers(records);
        const selectedKey = selectedMember
          ? JSON.stringify([selectedMember.id === null ? "name" : "id", selectedMember.id ?? selectedMember.name])
          : "";
        const current =
          members.find((member) => member.key === selectedKey)?.key ||
          (selectedMember?.id === null ? members.find((member) => member.name === selectedMember.name)?.key : "") ||
          "";
        markup += "</div>";
        if (!selectedMember)
          markup += playerRenderer.renderRankings({
            records,
            helpOpen: rankingHelpOpen
          });
        markup += renderPlayerPicker(members, current) + (selectedMember ? renderDisplaySettings() : "");
        host.innerHTML =
          markup +
          (selectedMember
            ? playerRenderer.render({
                member: selectedMember,
                projects: trialHistoryApi.playerProjectOverview(
                  records,
                  selectedMember,
                  getBridge()?.trialHistoryContext?.details || {}
                ),
                weeks: trialHistoryApi.memberHistory(records, selectedMember),
                profileState,
                profileSectionsOpen
              })
            : `<p class="mwi-status">${escapeHtml(t(members.length ? "trialSelectPlayerPrompt" : "trialNoNamedPlayers"))}</p>`);
        for (const el of host.querySelectorAll("[data-trial-scroll-id]")) {
          const position = scroll.get(el.dataset.trialScrollId);
          if (position && (!resetScroll || el.dataset.trialScrollId === "choice-player"))
            [el.scrollLeft, el.scrollTop] = position;
        }
        if (resetScroll) revealChoice(host.querySelector('[data-trial-choice="player"][aria-pressed="true"]'));
        for (const el of host.querySelectorAll("[data-trial-raw]")) el.open = openRecords.has(el.dataset.trialRaw);
        resetScroll = false;
        updateScrollButtons(host);
        if (searchSelection) {
          const input = host.querySelector("[data-trial-player-search]");
          input?.focus({ preventScroll: true });
          input?.setSelectionRange(...searchSelection);
        }
        return;
      }
      if (!records.length) {
        host.innerHTML = markup + `</div><p class="mwi-status">${escapeHtml(t("trialHistoryEmpty"))}</p>`;
        return;
      }
      if (mode === "week") {
        markup +=
          renderChoices(
            "week",
            weeks.map((entry) => ({ key: entry.key, label: weekLabel(entry) })),
            selectedWeek
          ) +
          "</div>" +
          renderDisplaySettings();
        for (const [kind, size] of [
          ["skilling", 4],
          ["combat", 2]
        ]) {
          const columns = trialHistoryApi
            .historyProjects(
              week.records.filter((record) => record.kind === kind),
              details
            )
            .map((entry) =>
              renderColumn(
                trialName(entry.records[0]),
                entry.records,
                `data-trial-project="${escapeHtml(entry.key)}"`,
                `data-trial-jump-project="${escapeHtml(entry.key)}"`,
                projectIcon(entry.records[0])
              )
            );
          while (columns.length < size)
            columns.push(renderColumn(t("trialUnrecordedProject"), [], 'data-trial-empty="true"'));
          markup += renderRail(kind, t(kind === "combat" ? "trialCombat" : "trialSkilling"), columns.join(""), kind);
        }
      } else {
        markup +=
          renderChoices(
            "project",
            projects.map((entry) => ({
              key: entry.key,
              label: trialName(entry.records[0]),
              icon: projectIcon(entry.records[0])
            })),
            selectedProject
          ) +
          "</div>" +
          renderDisplaySettings();
        const timeline = trialHistoryApi.historyWeeks(project.records);
        markup += renderRail(
          "timeline",
          trialName(project.records[0]),
          timeline
            .map((entry) =>
              renderColumn(
                weekLabel(entry),
                entry.records,
                `data-trial-week="${entry.key}"`,
                `data-trial-jump-week="${entry.key}"`
              )
            )
            .join(""),
          project.kind,
          true
        );
      }
      host.innerHTML = markup;
      for (const el of host.querySelectorAll("[data-trial-raw]")) el.open = openRecords.has(el.dataset.trialRaw);
      for (const el of host.querySelectorAll("[data-trial-scroll-id]")) {
        const position = scroll.get(el.dataset.trialScrollId);
        if (position && (!resetScroll || el.dataset.trialScrollId.startsWith("choice-")))
          [el.scrollLeft, el.scrollTop] = position;
      }
      if (resetScroll || !scroll.has(`choice-${mode}`))
        revealChoice(host.querySelector('[data-trial-choice][aria-pressed="true"]'));
      resetScroll = false;
      updateScrollButtons(host);
    }

    function exportHistory() {
      capture();
      const url = pageWindow.URL.createObjectURL(
        new pageWindow.Blob([JSON.stringify({ schemaVersion: 2, records }, null, 2)], { type: "application/json" })
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "guild-trial-history.json";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      pageWindow.setTimeout(() => pageWindow.URL.revokeObjectURL(url), 0);
    }

    function bind(panel) {
      const host = panel.querySelector('[data-role="trials-view"]');
      profileTooltip?.dispose();
      profileTooltip = profileTooltipApi?.createTooltip({
        document,
        pageWindow,
        host,
        getBridge,
        t,
        getData: playerRenderer.tooltipData,
        getProfile: () =>
          !screenshotMode && selectedMember && profileState.status === "ready" ? profileState.profile : null
      });
      if (pageWindow.ResizeObserver) {
        resizeObserver = new pageWindow.ResizeObserver(() => updateScrollButtons(host));
        resizeObserver.observe(host);
      }
      for (const type of ["mouseover", "focusin"])
        host.addEventListener(type, (event) => updateMemberInteraction(host, event.target, type === "focusin"));
      for (const type of ["mouseout", "focusout"])
        host.addEventListener(type, (event) => updateMemberInteraction(host, event.relatedTarget, type === "focusout"));
      host.addEventListener(
        "toggle",
        (event) => {
          if (event.target.matches(".mwi-trial-guide")) guideOpen = event.target.open;
          if (event.target.matches(".mwi-trial-display-settings")) displaySettingsOpen = event.target.open;
          if (event.target.matches(".mwi-trial-player-picker") && event.target.isConnected)
            playerPickerOpen = event.target.open;
        },
        true
      );
      host.addEventListener("change", (event) => {
        const field = event.target.dataset.trialDisplay;
        if (["level", "workDone", "workShare", "workMultiple", "levelSummary", "workSummary"].includes(field)) {
          displaySettings = { ...displaySettings, [field]: event.target.checked };
          displaySaveFailed = !pluginStorage.saveTrialDisplay(displaySettings);
          displaySettingsOpen = true;
          refresh(panel);
          host.querySelector(`[data-trial-display="${field}"]`)?.focus({ preventScroll: true });
          return;
        }
        if (event.target.dataset.role === "trial-import-file") {
          void readImport(event.target.files?.[0], panel);
          return;
        }
      });
      host.addEventListener("compositionstart", (event) => {
        if (event.target.matches("[data-trial-player-search]")) playerSearchComposing = true;
      });
      host.addEventListener("compositionend", (event) => {
        if (event.target.matches("[data-trial-player-search]")) {
          playerSearchComposing = false;
          filterPlayerResults(host);
        }
      });
      host.addEventListener("input", (event) => {
        if (event.target.matches("[data-trial-player-search]") && !event.isComposing && !playerSearchComposing)
          filterPlayerResults(host);
      });
      host.addEventListener("submit", (event) => {
        if (!event.target.matches("[data-trial-player-search-form]")) return;
        event.preventDefault();
        if (!playerSearchComposing) filterPlayerResults(host);
      });
      host.addEventListener("keydown", (event) => {
        const button = event.target.closest("[data-trial-choice]");
        if (!button || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const buttons = [...button.parentElement.querySelectorAll("[data-trial-choice]")];
        const current = buttons.indexOf(button);
        const index =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? buttons.length - 1
              : Math.max(0, Math.min(buttons.length - 1, current + (event.key === "ArrowRight" ? 1 : -1)));
        if (button.dataset.trialChoice === "player") buttons[index].focus();
        else buttons[index].click();
      });
      host.addEventListener("scroll", () => updateScrollButtons(host), true);
      host.addEventListener("click", (event) => {
        if (event.target.closest("[data-trial-screenshot-mode]")) {
          screenshotMode = !screenshotMode;
          playerSearch = "";
          playerSearchComposing = false;
          refresh(panel);
          host.querySelector("[data-trial-screenshot-mode]")?.focus({ preventScroll: true });
          return;
        }
        const rankingPlayer = event.target.closest("[data-trial-ranking-player]");
        if (rankingPlayer) {
          const member = trialHistoryApi
            .playerRankings(records)
            .find((entry) => entry.key === rankingPlayer.dataset.trialRankingPlayer);
          if (!member?.name) return;
          playerReturn = {
            mode: "player",
            rankingKey: member.key,
            rankingColumn: rankingPlayer.closest("[data-trial-ranking-column]").dataset.trialRankingColumn,
            scroll: [...host.querySelectorAll("[data-trial-scroll-id]")].map((el) => [
              el.dataset.trialScrollId,
              el.scrollLeft,
              el.scrollTop
            ])
          };
          selectedMember = { id: member.id, name: member.name };
          playerPickerOpen = false;
          resetScroll = true;
          readPlayerProfile(panel);
          host.querySelector("[data-trial-player-title]")?.focus({ preventScroll: true });
          return;
        }
        if (event.target.closest("[data-trial-player-search-clear]")) {
          const input = host.querySelector("[data-trial-player-search]");
          input.value = "";
          filterPlayerResults(host);
          input.focus();
          return;
        }
        const sortButton = event.target.closest("[data-trial-sort]");
        if (sortButton) {
          const { trialSort: field, trialSortKey: key, trialSortNext: direction } = sortButton.dataset;
          tableSorts.set(key, { field, direction });
          refresh(panel);
          [...host.querySelectorAll("[data-trial-sort]")]
            .find((button) => button.dataset.trialSortKey === key && button.dataset.trialSort === field)
            ?.focus({ preventScroll: true });
          return;
        }
        const profile = event.target.closest("[data-trial-profile]");
        if (profile) {
          if (mode !== "player")
            playerReturn = {
              mode,
              scroll: [...host.querySelectorAll("[data-trial-scroll-id]")].map((el) => [
                el.dataset.trialScrollId,
                el.scrollLeft,
                el.scrollTop
              ]),
              name: profile.dataset.trialProfile
            };
          selectedMember = JSON.parse(profile.dataset.trialIdentity);
          playerPickerOpen = false;
          resetScroll = true;
          mode = "player";
          readPlayerProfile(panel);
          host.querySelector("[data-trial-player-title]")?.focus({ preventScroll: true });
          return;
        }
        if (event.target.closest("[data-trial-profile-refresh]")) {
          readPlayerProfile(panel, true);
          return;
        }
        if (event.target.closest("[data-trial-player-back]")) {
          leavePlayer();
          mode = playerReturn?.mode || "week";
          refresh(panel);
          for (const [key, left, top] of playerReturn?.scroll || []) {
            const element = [...host.querySelectorAll("[data-trial-scroll-id]")].find(
              (el) => el.dataset.trialScrollId === key
            );
            if (element) {
              element.scrollLeft = left;
              element.scrollTop = top;
            }
          }
          const returnTarget =
            [...host.querySelectorAll("[data-trial-ranking-player]")].find(
              (el) =>
                el.dataset.trialRankingPlayer === playerReturn?.rankingKey &&
                el.closest("[data-trial-ranking-column]").dataset.trialRankingColumn === playerReturn?.rankingColumn
            ) ||
            [...host.querySelectorAll("[data-trial-profile]")].find(
              (el) => el.dataset.trialProfile === playerReturn?.name
            ) ||
            host.querySelector(`[data-trial-mode="${mode}"]`);
          returnTarget?.focus({ preventScroll: true });
          updateScrollButtons(host);
          return;
        }
        const jump = event.target.closest("[data-trial-jump-week], [data-trial-jump-project]");
        if (jump) {
          leavePlayer();
          if (jump.dataset.trialJumpWeek !== undefined) {
            mode = "week";
            selectedWeek = jump.dataset.trialJumpWeek;
          } else {
            mode = "project";
            selectedProject = jump.dataset.trialJumpProject;
          }
          resetScroll = true;
          refresh(panel);
          host.querySelector('[data-trial-choice][aria-pressed="true"]')?.focus({ preventScroll: true });
          return;
        }
        const choice = event.target.closest("[data-trial-choice]");
        if (choice) {
          resetScroll = true;
          if (choice.dataset.trialChoice === "player") {
            const member = trialHistoryApi.historyMembers(records).find((entry) => entry.key === choice.value);
            if (!member) return;
            selectedMember = { id: member.id, name: member.name };
            playerPickerOpen = false;
            readPlayerProfile(panel);
            host.querySelector("[data-trial-player-title]")?.focus({ preventScroll: true });
            return;
          } else {
            if (choice.dataset.trialChoice === "week") selectedWeek = choice.value;
            else selectedProject = choice.value;
            refresh(panel);
          }
          const active = host.querySelector('[data-trial-choice][aria-pressed="true"]');
          active?.focus({ preventScroll: true });
          revealChoice(active);
        }
        const modeButton = event.target.closest("[data-trial-mode]");
        if (modeButton) {
          const nextMode = modeButton.dataset.trialMode;
          if (nextMode !== mode) {
            if (nextMode === "player")
              playerReturn = {
                mode,
                scroll: [...host.querySelectorAll("[data-trial-scroll-id]")].map((el) => [
                  el.dataset.trialScrollId,
                  el.scrollLeft,
                  el.scrollTop
                ])
              };
            if (mode === "player") leavePlayer();
            mode = nextMode;
          } else if (mode === "player" && selectedMember) leavePlayer();
          resetScroll = true;
          refresh(panel);
          host.querySelector(`[data-trial-mode="${mode}"]`)?.focus();
        }
        const scrollButton = event.target.closest("[data-trial-scroll]");
        if (scrollButton) {
          const rail = host.querySelector(`#mwi-trial-rail-${scrollButton.dataset.trialScroll}`);
          rail?.scrollBy({ left: Number(scrollButton.dataset.step) * rail.clientWidth * 0.85 });
          updateScrollButtons(host);
        }
        if (event.target.closest('[data-role="trial-import-open"]'))
          host.querySelector('[data-role="trial-import-file"]').click();
        if (event.target.closest('[data-role="trial-import-confirm"]')) confirmImport(panel);
        if (event.target.closest('[data-role="trial-import-cancel"]')) {
          importRevision += 1;
          importPreview = null;
          importBusy = false;
          importNotice = null;
          refresh(panel);
          host.querySelector('[data-role="trial-import-open"]')?.focus();
        }
        if (event.target.closest('[data-role="trial-export"]')) exportHistory();
      });
    }
    const onStats = () => {
      capture();
      const panel = getPanel();
      if (panel && panel.dataset.activeView === "trials") refresh(panel);
    };
    function start() {
      disposed = false;
      const bridge = getBridge();
      if (bridge) bridge.onTrialStatsUpdated = onStats;
      capture();
    }
    function dispose() {
      profileTooltip?.dispose();
      disposed = true;
      profileRevision += 1;
      getBridge()?.disposeProfileReader?.();
      importRevision += 1;
      resizeObserver?.disconnect();
      const bridge = getBridge();
      if (bridge?.onTrialStatsUpdated === onStats) bridge.onTrialStatsUpdated = null;
    }
    return { start, dispose, bind, refresh };
  }
  return { createTrialHistoryView, projectIconSpec };
});
