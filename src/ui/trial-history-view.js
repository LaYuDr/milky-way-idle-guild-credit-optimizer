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
    let selectedKey = "";
    let records = [];
    let loadFailed = false;
    let importPreview = null;
    let importNotice = null;
    let importBusy = false;
    let importRevision = 0;
    const unsaved = new Map();
    const date = (value) =>
      new Date(value).toLocaleString(undefined, {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
      });
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
      let markup = `<section class="mwi-trial-import" aria-label="${escapeHtml(t("trialImport"))}" aria-busy="${importBusy}">
        <button type="button" data-role="trial-import-open"${importBusy ? " disabled" : ""}>${escapeHtml(t("trialImport"))}</button>
        <input type="file" accept=".json,application/json" data-role="trial-import-file" aria-label="${escapeHtml(t("trialImportFile"))}" hidden>
        <p class="mwi-trial-help">${escapeHtml(t("trialImportHint"))}</p>
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
        if (result.added + result.dated) selectedKey = additions[0].key;
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

    function refresh(panel) {
      capture();
      const host = panel?.querySelector('[data-role="trials-view"]');
      if (!host) return;
      const selected = records.find((record) => record.key === selectedKey) || records[0];
      selectedKey = selected?.key || "";
      let markup = `<p class="mwi-trial-help">${escapeHtml(t("trialHistoryHint"))}</p>
        <p class="mwi-trial-notice" role="status" aria-live="polite">${escapeHtml(t(unsaved.size ? "trialSaveFailed" : loadFailed ? "trialLoadFailed" : "trialSavedCount", { count: records.length }))}</p>`;
      markup += renderImport();
      if (!selected) {
        host.innerHTML = markup + `<p class="mwi-status">${escapeHtml(t("trialHistoryEmpty"))}</p>`;
        return;
      }
      markup += `<div class="mwi-trial-controls"><label>${escapeHtml(t("trialChoose"))}<select data-role="trial-select">${records
        .map(
          (record, index) =>
            `<option value="${index}"${record.key === selectedKey ? " selected" : ""}>${escapeHtml(`${recordDate(record)} · ${record.guildName || t("trialUnknownGuild")} · ${trialName(record)}`)}</option>`
        )
        .join("")}</select></label>
        <button type="button" data-role="trial-export">${escapeHtml(t("trialExport"))}</button></div>
        <h3 class="mwi-trial-title">${escapeHtml(trialName(selected))}</h3>
        <p class="mwi-trial-meta">${escapeHtml(t(selected.kind === "combat" ? "trialCombat" : "trialSkilling"))} · ${escapeHtml(t("trialSummary", { count: selected.rows.length, points: number(selected.points), tier: number(selected.party.highestTier) }))}<br>${escapeHtml(selected.source === "manual" ? t("trialManualDescription", { date: recordDate(selected) }) : t("trialCaptured", { time: date(selected.capturedAt) }))}</p>`;
      if (selected.source === "manual" && typeof selected.sourceTimestamp === "string") {
        markup += `<p class="mwi-trial-meta">${escapeHtml(t("trialSourceMessageTime", { time: selected.sourceTimestamp }))}</p>`;
      }
      const fields =
        selected.kind === "combat" ? ["damageDealt", "healingDone", "premitigatedDamageTaken"] : ["workDone"];
      const rows = [...selected.rows].sort((a, b) => {
        for (const field of fields) {
          const diff = (Number(b[field]) || 0) - (Number(a[field]) || 0);
          if (diff) return diff;
        }
        return String(a.characterId).localeCompare(String(b.characterId));
      });
      markup += `<div class="mwi-trial-table-scroll" role="region" tabindex="0" aria-label="${escapeHtml(t("trialStatsTable"))}"><table class="mwi-trial-table"><caption>${escapeHtml(t("trialStatsTable"))}</caption><thead><tr><th scope="col">${escapeHtml(t("trialMember"))}</th>${fields.map((field) => `<th scope="col">${escapeHtml(t(`trialField_${field}`))}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr><th scope="row">${escapeHtml(selected.members?.[row.memberKey || row.characterId]?.name || t("trialFormerMember"))}${row.characterId === null ? "" : `<small>ID ${escapeHtml(row.characterId)}</small>`}</th>${fields.map((field) => `<td>${escapeHtml(number(row[field] ?? 0))}</td>`).join("")}</tr>`).join("")}</tbody></table></div>
        <details class="mwi-trial-raw"><summary>${escapeHtml(t("trialRaw"))}</summary><pre>${escapeHtml(JSON.stringify(selected, null, 2))}</pre></details>`;
      host.innerHTML = markup;
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
      host.addEventListener("change", (event) => {
        if (event.target.dataset.role === "trial-import-file") {
          void readImport(event.target.files?.[0], panel);
          return;
        }
        if (event.target.dataset.role !== "trial-select") return;
        selectedKey = records[Number(event.target.value)]?.key || "";
        refresh(panel);
        host.querySelector('[data-role="trial-select"]')?.focus();
      });
      host.addEventListener("click", (event) => {
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
      const bridge = getBridge();
      if (bridge?.onTrialStatsUpdated === onStats) bridge.onTrialStatsUpdated = null;
    }
    return { start, dispose, bind, refresh };
  }
  return { createTrialHistoryView };
});
