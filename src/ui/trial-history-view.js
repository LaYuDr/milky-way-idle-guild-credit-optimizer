(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MwiGuildTrialHistoryView = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function createTrialHistoryView({ document, pageWindow, t, escapeHtml, pluginStorage, getBridge, getPanel }) {
    let selectedKey = "";
    let records = [];
    let loadFailed = false;
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
      records = Array.from(merged.values()).sort(
        (a, b) => b.weekStartAt - a.weekStartAt || a.trialHrid.localeCompare(b.trialHrid)
      );
    }

    function capture() {
      const bridge = getBridge();
      for (const record of bridge?.pendingTrialSnapshots?.splice(0) || []) unsaved.set(record.key, record);
      for (const [key, record] of unsaved) {
        if (pluginStorage.saveTrialSnapshot(record)) unsaved.delete(key);
      }
      reload();
    }

    function refresh(panel) {
      capture();
      const host = panel?.querySelector('[data-role="trials-view"]');
      if (!host) return;
      const selected = records.find((record) => record.key === selectedKey) || records[0];
      selectedKey = selected?.key || "";
      let markup = `<p class="mwi-trial-help">${escapeHtml(t("trialHistoryHint"))}</p>
        <p class="mwi-trial-notice" role="status" aria-live="polite">${escapeHtml(t(unsaved.size ? "trialSaveFailed" : loadFailed ? "trialLoadFailed" : "trialSavedCount", { count: records.length }))}</p>`;
      if (!selected) {
        host.innerHTML = markup + `<p class="mwi-status">${escapeHtml(t("trialHistoryEmpty"))}</p>`;
        return;
      }
      markup += `<div class="mwi-trial-controls"><label>${escapeHtml(t("trialChoose"))}<select data-role="trial-select">${records
        .map(
          (record, index) =>
            `<option value="${index}"${record.key === selectedKey ? " selected" : ""}>${escapeHtml(`${date(record.weekStartAt)} · ${record.guildName} · ${trialName(record)}`)}</option>`
        )
        .join("")}</select></label>
        <button type="button" data-role="trial-export">${escapeHtml(t("trialExport"))}</button></div>
        <h3 class="mwi-trial-title">${escapeHtml(trialName(selected))}</h3>
        <p class="mwi-trial-meta">${escapeHtml(t(selected.kind === "combat" ? "trialCombat" : "trialSkilling"))} · ${escapeHtml(t("trialSummary", { count: selected.rows.length, points: number(selected.points), tier: number(selected.party.highestTier) }))}<br>${escapeHtml(t("trialCaptured", { time: date(selected.capturedAt) }))}</p>`;
      const fields =
        selected.kind === "combat" ? ["damageDealt", "healingDone", "premitigatedDamageTaken"] : ["workDone"];
      const rows = [...selected.rows].sort((a, b) => {
        for (const field of fields) {
          const diff = (Number(b[field]) || 0) - (Number(a[field]) || 0);
          if (diff) return diff;
        }
        return String(a.characterId).localeCompare(String(b.characterId));
      });
      markup += `<div class="mwi-trial-table-scroll" role="region" tabindex="0" aria-label="${escapeHtml(t("trialStatsTable"))}"><table class="mwi-trial-table"><caption>${escapeHtml(t("trialStatsTable"))}</caption><thead><tr><th scope="col">${escapeHtml(t("trialMember"))}</th>${fields.map((field) => `<th scope="col">${escapeHtml(t(`trialField_${field}`))}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr><th scope="row">${escapeHtml(selected.members?.[row.characterId]?.name || t("trialFormerMember"))}<small>ID ${escapeHtml(row.characterId)}</small></th>${fields.map((field) => `<td>${escapeHtml(number(row[field]))}</td>`).join("")}</tr>`).join("")}</tbody></table></div>
        <details class="mwi-trial-raw"><summary>${escapeHtml(t("trialRaw"))}</summary><pre>${escapeHtml(JSON.stringify(selected, null, 2))}</pre></details>`;
      host.innerHTML = markup;
    }

    function exportHistory() {
      capture();
      const url = pageWindow.URL.createObjectURL(
        new pageWindow.Blob([JSON.stringify({ schemaVersion: 1, records }, null, 2)], { type: "application/json" })
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
        if (event.target.dataset.role !== "trial-select") return;
        selectedKey = records[Number(event.target.value)]?.key || "";
        refresh(panel);
        host.querySelector('[data-role="trial-select"]')?.focus();
      });
      host.addEventListener("click", (event) => {
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
      const bridge = getBridge();
      if (bridge?.onTrialStatsUpdated === onStats) bridge.onTrialStatsUpdated = null;
    }
    return { start, dispose, bind, refresh };
  }
  return { createTrialHistoryView };
});
