(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MwiGuildTrialHistoryView = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function createTrialHistoryView({
    document,
    pageWindow,
    t,
    escapeHtml,
    pluginStorage,
    trialHistoryApi,
    getBridge,
    getPanel
  }) {
    let mode = "week";
    let selectedWeek = "";
    let selectedProject = "";
    let resetScroll = false;
    let resizeObserver = null;
    let records = [];
    let multipleGuilds = false;
    let loadFailed = false;
    let importPreview = null;
    let importNotice = null;
    let importBusy = false;
    let importRevision = 0;
    let guideOpen = false;
    const unsaved = new Map();
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
        <header class="mwi-trial-toolbar"><div class="mwi-trial-heading"><h2>${escapeHtml(t("trialHistory"))}</h2><p class="mwi-trial-notice" data-state="${unsaved.size || loadFailed ? "warning" : "saved"}" role="status" aria-live="polite">${escapeHtml(t(unsaved.size ? "trialSaveFailed" : loadFailed ? "trialLoadFailed" : "trialSavedCount", { count: records.length }))}</p></div><div class="mwi-trial-controls"><button type="button" data-role="trial-import-open"${importBusy ? " disabled" : ""}>${escapeHtml(t("trialImport"))}</button>
        <button type="button" data-role="trial-export"${records.length ? "" : ` disabled title="${escapeHtml(t("trialHistoryEmpty"))}"`}>${escapeHtml(t("trialExport"))}</button></div></header>
        <input type="file" accept=".json,application/json" data-role="trial-import-file" aria-label="${escapeHtml(t("trialImportFile"))}" hidden>
        <details class="mwi-trial-guide"${guideOpen ? " open" : ""}><summary>${escapeHtml(t("trialGuide"))}</summary><p class="mwi-trial-help">${escapeHtml(t("trialHistoryHint"))}</p><p class="mwi-trial-help">${escapeHtml(t("trialImportHint"))}</p></details>
        <p data-role="trial-import-status" role="status" aria-live="polite" tabindex="-1">${escapeHtml(importBusy ? t("trialImportReading") : importNotice ? t(importNotice.key, importNotice.values) : "")}</p>`;
      if (importPreview) {
        markup += `<div class="mwi-trial-import-preview"><h3>${escapeHtml(t("trialImportPreview"))}</h3>
          <p class="mwi-trial-meta">${escapeHtml(importPreview.name)}<br>${escapeHtml(t("trialImportSummary", summary))}</p>
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

    function renderRecord(record, showIdentity) {
      const fields =
        record.kind === "combat" ? ["damageDealt", "healingDone", "premitigatedDamageTaken"] : ["workDone"];
      const caption = `${trialName(record)} · ${recordDate(record)} · ${t("trialStatsTable")}`;
      // Keep source order and exact numeric values; this is a record viewer, not a ranking.
      return `<section class="mwi-trial-record" data-trial-record="${escapeHtml(record.key)}">
        ${showIdentity ? `<p class="mwi-trial-meta">${escapeHtml(record.guildName || t("trialUnknownGuild"))} · ${escapeHtml(t(record.source === "manual" ? "trialManualSource" : "trialAutomaticSource"))}</p>` : ""}
        <p class="mwi-trial-meta">${escapeHtml(t("trialSummary", { count: record.rows.length, points: number(record.points), tier: number(record.party.highestTier) }))}</p>
        <div class="mwi-trial-table-scroll" data-trial-scroll-id="${escapeHtml(record.key)}" role="region" tabindex="0" aria-label="${escapeHtml(caption)}"><table class="mwi-trial-table" data-role="trial-stats-table"><caption>${escapeHtml(caption)}</caption><thead><tr><th scope="col">${escapeHtml(t("trialMember"))}</th>${fields.map((field) => `<th scope="col">${escapeHtml(t(`trialField_${field}`))}</th>`).join("")}</tr></thead><tbody>${record.rows.map((row) => `<tr><th scope="row"${row.characterId == null ? "" : ` title="ID ${escapeHtml(row.characterId)}"`}>${escapeHtml(record.members?.[row.memberKey ?? row.characterId]?.name || t("trialFormerMember"))}</th>${fields.map((field) => `<td>${escapeHtml(number(trialHistoryApi.metricValue(record, row, field)))}</td>`).join("")}</tr>`).join("")}</tbody></table></div>
        <details class="mwi-trial-raw" data-trial-raw="${escapeHtml(record.key)}"><summary>${escapeHtml(t("trialRaw"))}</summary><pre>${escapeHtml(JSON.stringify(record, null, 2))}</pre></details></section>`;
    }

    function renderColumn(title, items, attributes = "") {
      const showIdentity = items.length > 1 || multipleGuilds;
      return `<article class="mwi-trial-column" ${attributes}><h4>${escapeHtml(title)}</h4>${items.length ? items.map((record) => renderRecord(record, showIdentity)).join("") : `<p class="mwi-trial-empty">${escapeHtml(t("trialMissingRecord"))}</p>`}</article>`;
    }

    function renderRail(id, title, columns, kind, timeline = false) {
      return `<section class="mwi-trial-group" data-trial-group="${id}" aria-labelledby="mwi-trial-heading-${id}"><header class="mwi-trial-group-header"><h3 id="mwi-trial-heading-${id}"${timeline ? " hidden" : ""}>${escapeHtml(title)}</h3><div class="mwi-trial-scroll-buttons"><button type="button" data-trial-scroll="${id}" data-step="-1" aria-controls="mwi-trial-rail-${id}">${escapeHtml(t(timeline ? "trialNewer" : "trialScrollLeft"))}</button><button type="button" data-trial-scroll="${id}" data-step="1" aria-controls="mwi-trial-rail-${id}">${escapeHtml(t(timeline ? "trialOlder" : "trialScrollRight"))}</button></div></header><div class="mwi-trial-rail" id="mwi-trial-rail-${id}" data-trial-scroll-id="${id}" role="region" tabindex="0" aria-label="${escapeHtml(title)}"><div class="mwi-trial-columns ${timeline ? "mwi-trial-timeline" : "mwi-trial-week-grid"}" data-kind="${kind}">${columns}</div></div></section>`;
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

    function refresh(panel) {
      capture();
      const host = panel?.querySelector('[data-role="trials-view"]');
      if (!host) return;
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
      const projects = trialHistoryApi.historyProjects(records);
      const week = weeks.find((entry) => entry.key === selectedWeek) || weeks[0];
      const project = projects.find((entry) => entry.key === selectedProject) || projects[0];
      selectedWeek = week?.key || "";
      selectedProject = project?.key || "";
      let markup = renderImport();
      if (!records.length) {
        host.innerHTML = markup + `<p class="mwi-status">${escapeHtml(t("trialHistoryEmpty"))}</p>`;
        return;
      }
      markup += `<div class="mwi-trial-display-controls"><div class="mwi-trial-mode" role="group" aria-label="${escapeHtml(t("trialDisplayMode"))}">${["week", "project"].map((value) => `<button type="button" data-trial-mode="${value}" aria-pressed="${mode === value}">${escapeHtml(t(value === "week" ? "trialByWeek" : "trialByProject"))}</button>`).join("")}</div><div class="mwi-trial-controls">`;
      if (mode === "week") {
        markup += `<label>${escapeHtml(t("trialChooseWeek"))}<select data-role="trial-week">${weeks.map((entry) => `<option value="${entry.key}"${entry.key === selectedWeek ? " selected" : ""}>${escapeHtml(weekLabel(entry))}</option>`).join("")}</select></label></div></div>`;
        for (const [kind, size] of [
          ["skilling", 4],
          ["combat", 2]
        ]) {
          const columns = trialHistoryApi
            .historyProjects(week.records.filter((record) => record.kind === kind))
            .map((entry) =>
              renderColumn(trialName(entry.records[0]), entry.records, `data-trial-project="${escapeHtml(entry.key)}"`)
            );
          while (columns.length < size)
            columns.push(renderColumn(t("trialUnrecordedProject"), [], 'data-trial-empty="true"'));
          markup += renderRail(kind, t(kind === "combat" ? "trialCombat" : "trialSkilling"), columns.join(""), kind);
        }
      } else {
        markup += `<label>${escapeHtml(t("trialChooseProject"))}<select data-role="trial-project">${projects.map((entry) => `<option value="${escapeHtml(entry.key)}"${entry.key === selectedProject ? " selected" : ""}>${escapeHtml(trialName(entry.records[0]))}</option>`).join("")}</select></label></div></div>`;
        const timeline = trialHistoryApi.historyWeeks(project.records);
        markup += renderRail(
          "timeline",
          trialName(project.records[0]),
          timeline
            .map((entry) => renderColumn(weekLabel(entry), entry.records, `data-trial-week="${entry.key}"`))
            .join(""),
          project.kind,
          true
        );
      }
      host.innerHTML = markup;
      for (const el of host.querySelectorAll("[data-trial-raw]")) el.open = openRecords.has(el.dataset.trialRaw);
      if (!resetScroll)
        for (const el of host.querySelectorAll("[data-trial-scroll-id]")) {
          const position = scroll.get(el.dataset.trialScrollId);
          if (position) [el.scrollLeft, el.scrollTop] = position;
        }
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
      if (pageWindow.ResizeObserver) {
        resizeObserver = new pageWindow.ResizeObserver(() => updateScrollButtons(host));
        resizeObserver.observe(host);
      }
      host.addEventListener(
        "toggle",
        (event) => {
          if (event.target.matches(".mwi-trial-guide")) guideOpen = event.target.open;
        },
        true
      );
      host.addEventListener("change", (event) => {
        if (event.target.dataset.role === "trial-import-file") {
          void readImport(event.target.files?.[0], panel);
          return;
        }
        const role = event.target.dataset.role;
        if (role === "trial-week") selectedWeek = event.target.value;
        else if (role === "trial-project") selectedProject = event.target.value;
        else return;
        resetScroll = true;
        refresh(panel);
        host.querySelector(`[data-role="${role}"]`)?.focus();
      });
      host.addEventListener("scroll", () => updateScrollButtons(host), true);
      host.addEventListener("click", (event) => {
        const modeButton = event.target.closest("[data-trial-mode]");
        if (modeButton) {
          mode = modeButton.dataset.trialMode;
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
      const bridge = getBridge();
      if (bridge) bridge.onTrialStatsUpdated = onStats;
      capture();
    }
    function dispose() {
      importRevision += 1;
      resizeObserver?.disconnect();
      const bridge = getBridge();
      if (bridge?.onTrialStatsUpdated === onStats) bridge.onTrialStatsUpdated = null;
    }
    return { start, dispose, bind, refresh };
  }
  return { createTrialHistoryView };
});
