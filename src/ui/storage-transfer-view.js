(function (root, factory) {
  const api = factory(
    typeof module !== "undefined" && module.exports
      ? require("../runtime/storage-transfer.js")
      : root.MwiGuildStorageTransfer
  );
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MwiGuildStorageTransferView = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (transferApi) {
  "use strict";

  function create({ document, pageWindow, storage, version, t, escapeHtml, onFinished = () => {} }) {
    const service = transferApi.create({ storage, origin: pageWindow.location.origin, version });
    let phase = "idle";
    let pending = null;
    let imported = null;
    let plan = null;
    let verified = false;
    let overwrite = false;
    let busy = false;
    let notice = { key: "", values: {} };
    let revision = 0;
    let resumeWrites = null;
    function pauseWrites() {
      resumeWrites ??= service.pauseWrites();
    }
    function resume() {
      resumeWrites?.();
      resumeWrites = null;
    }
    const label = (key, values) => escapeHtml(t(key, values));
    const size = (entries) => `${(transferApi.byteSize(entries) / 1024).toFixed(1)} KiB`;
    function render() {
      let markup = `<section class="mwi-settings-block" data-cache-transfer aria-labelledby="mwi-cache-title" aria-busy="${busy}"><div class="mwi-settings-block-heading"><h4 id="mwi-cache-title">${label("cacheTitle")}</h4></div><p class="mwi-trial-help">${label("cacheScope")}</p><p class="mwi-trial-help">${label("cacheBoundary")}</p>`;
      if (phase === "verify" || phase === "import") markup += `<p class="mwi-trial-notice">${label("cachePaused")}</p>`;
      if (phase === "done") {
        markup += `<button type="button" data-cache-action="reload">${label("cacheReload")}</button>`;
      } else if (phase === "verify") {
        markup += `<p class="mwi-trial-notice">${label(pending.kind === "clear" ? "cacheClearWarning" : "cacheReplaceWarning", { count: pending.backup.entries.length, size: size(pending.backup.entries) })}</p><label class="mwi-settings-switch-copy" for="mwi-cache-verify">${label("cacheVerifyFile")}</label><input id="mwi-cache-verify" data-cache-file="verify" type="file" style="width:100%;max-width:100%;min-width:0" accept=".json,application/json"${busy ? " disabled" : ""}><div class="mwi-trial-controls"><button type="button" data-cache-action="commit"${!verified || busy ? " disabled" : ""}>${label(pending.kind === "clear" ? "cacheConfirmClear" : "cacheConfirmReplace")}</button><button type="button" data-cache-action="cancel"${busy ? " disabled" : ""}>${label("cacheCancel")}</button></div>`;
      } else {
        markup += `<div class="mwi-trial-controls"><button type="button" data-cache-action="export"${busy ? " disabled" : ""}>${label("cacheExport")}</button><button type="button" data-cache-action="export-clear"${busy ? " disabled" : ""}>${label("cacheExportClear")}</button></div><label class="mwi-settings-switch-copy" for="mwi-cache-import">${label("cacheImport")}</label><input id="mwi-cache-import" data-cache-file="import" type="file" style="width:100%;max-width:100%;min-width:0" accept=".json,application/json"${busy ? " disabled" : ""}>`;
        if (phase === "import") {
          const count = (status) => plan.entries.filter((entry) => entry.status === status).length;
          markup += `<div data-cache-preview><p class="mwi-trial-meta">${label("cacheImportSummary", { added: count("new"), duplicates: count("duplicate"), conflicts: count("conflict"), size: size(plan.entries) })}</p><p class="mwi-trial-help">${label("cacheImportHint")}</p><ul class="mwi-trial-import-list" tabindex="0" aria-label="${label("cacheImportPreview")}">${plan.entries.map((entry) => `<li><strong>${label(`cacheStatus_${entry.status}`)}</strong><span style="overflow-wrap:anywhere">${escapeHtml(entry.key)}</span></li>`).join("")}</ul>${count("conflict") ? `<label class="mwi-settings-switch"><span class="mwi-settings-switch-copy">${label("cacheOverwrite")}</span><input data-cache-overwrite type="checkbox"${overwrite ? " checked" : ""}${busy ? " disabled" : ""}></label>` : ""}<div class="mwi-trial-controls"><button type="button" data-cache-action="import"${busy || !(count("new") + (overwrite ? count("conflict") : 0)) ? " disabled" : ""}>${label(overwrite && count("conflict") ? "cachePrepareReplace" : "cacheConfirmImport")}</button><button type="button" data-cache-action="cancel"${busy ? " disabled" : ""}>${label("cacheCancel")}</button></div></div>`;
        }
      }
      return (
        markup +
        `<p class="mwi-settings-status" data-cache-status role="status" aria-live="polite" aria-atomic="true">${notice.key ? label(notice.key, notice.values) : ""}</p></section>`
      );
    }
    function refresh() {
      const host = document.querySelector("[data-cache-transfer]");
      if (!host) return;
      const focused = document.activeElement;
      const action = host.contains(focused) ? focused?.dataset?.cacheAction : null;
      host.outerHTML = render();
      if (action) document.querySelector(`[data-cache-action="${action}"]`)?.focus({ preventScroll: true });
    }
    function report(error) {
      notice = {
        key: ["cacheDataChanged", "cacheWrongOrigin", "cacheInvalidBackup", "cacheFileTooLarge"].includes(error?.code)
          ? error.code
          : "cacheAccessFailed",
        values: {}
      };
    }
    function download(backup) {
      const text = JSON.stringify(backup, null, 2);
      if (text.length > transferApi.MAX_TEXT) throw Object.assign(new Error(), { code: "cacheFileTooLarge" });
      const url = pageWindow.URL.createObjectURL(new pageWindow.Blob([text], { type: "application/json" }));
      try {
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `mwi-guild-local-backup-${new Date(backup.exportedAt).toISOString().replace(/[:.]/g, "-")}.json`;
        document.body.appendChild(anchor);
        try {
          anchor.click();
        } finally {
          anchor.remove();
        }
      } finally {
        pageWindow.setTimeout(() => pageWindow.URL.revokeObjectURL(url), 1000);
      }
    }
    function prepare(kind) {
      if (kind !== "export") pauseWrites();
      const backup = service.snapshot();
      if (kind === "clear" && !backup.entries.length) {
        notice = { key: "cacheEmpty", values: {} };
        resume();
        return;
      }
      download(backup);
      if (kind === "export") {
        notice = { key: "cacheDownloadStarted", values: {} };
        return;
      }
      pending = { kind, backup, imported, plan };
      verified = false;
      phase = "verify";
      notice = { key: "cacheDownloadVerify", values: {} };
    }
    function finish(result, kind) {
      resume();
      notice = {
        key:
          result.status === "applied"
            ? kind === "clear"
              ? "cacheCleared"
              : "cacheImported"
            : result.status === "stale"
              ? "cacheDataChanged"
              : result.status === "partial"
                ? "cachePartial"
                : "cacheSaveFailed",
        values: { count: result.changed }
      };
      if (result.needsReload) {
        phase = "done";
        imported = pending = plan = null;
        onFinished();
      } else {
        phase = "idle";
        imported = pending = plan = null;
      }
    }
    function onClick(event) {
      const target = event.target?.closest?.("[data-cache-action]");
      if (!target?.closest("[data-cache-transfer]") || target.disabled || busy) return;
      const action = target.dataset.cacheAction;
      if (action === "reload") {
        pageWindow.location.reload();
        return;
      }
      if (phase === "done") return;
      try {
        if (action === "export" || action === "export-clear") prepare(action === "export" ? "export" : "clear");
        else if (action === "cancel") {
          revision += 1;
          phase = "idle";
          resume();
          imported = pending = plan = null;
          verified = overwrite = false;
          notice = { key: "cacheCancelled", values: {} };
        } else if (action === "import" && plan) {
          if (!transferApi.sameEntries(plan.current.entries, service.snapshot().entries))
            throw Object.assign(new Error(), { code: "cacheDataChanged" });
          if (overwrite && plan.entries.some((entry) => entry.status === "conflict")) prepare("replace");
          else finish(service.restore(plan), "import");
        } else if (action === "commit" && pending && verified) {
          if (!transferApi.sameEntries(pending.backup.entries, service.snapshot().entries))
            throw Object.assign(new Error(), { code: "cacheDataChanged" });
          finish(
            pending.kind === "clear" ? service.clear(pending.backup) : service.restore(pending.plan, true),
            pending.kind
          );
        }
      } catch (error) {
        report(error);
        if (phase === "idle") resume();
        if (error?.code === "cacheDataChanged") {
          resume();
          phase = "idle";
          imported = pending = plan = null;
          verified = false;
        }
      }
      refresh();
    }
    async function onChange(event) {
      const input = event.target;
      if (!input?.closest?.("[data-cache-transfer]") || busy || phase === "done") return;
      if (input.matches("[data-cache-overwrite]")) {
        overwrite = input.checked;
        refresh();
        return;
      }
      if (!input.dataset.cacheFile) return;
      const file = input.files?.[0];
      if (!file) return;
      const mode = input.dataset.cacheFile;
      const request = ++revision;
      busy = true;
      if (mode === "verify") verified = false;
      notice = { key: "cacheReading", values: {} };
      refresh();
      try {
        if (file.size > transferApi.MAX_FILE_BYTES) throw Object.assign(new Error(), { code: "cacheFileTooLarge" });
        const text = await file.text();
        if (request !== revision) return;
        if (mode === "verify") {
          if (!pending || !service.verifyFile(text, pending.backup))
            throw Object.assign(new Error(), { code: "cacheInvalidBackup" });
          verified = true;
          notice = { key: "cacheVerified", values: {} };
        } else {
          imported = service.parse(text);
          pauseWrites();
          plan = service.preview(imported);
          overwrite = false;
          phase = "import";
          notice = { key: "cachePreviewReady", values: {} };
        }
      } catch (error) {
        if (request !== revision) return;
        if (mode === "import") {
          imported = plan = null;
          phase = "idle";
          resume();
        }
        report(error);
      } finally {
        if (request === revision) {
          busy = false;
          refresh();
        }
      }
    }
    document.addEventListener("click", onClick);
    document.addEventListener("change", onChange);
    return {
      render,
      dispose() {
        revision += 1;
        resume();
        document.removeEventListener("click", onClick);
        document.removeEventListener("change", onChange);
      }
    };
  }
  return { create };
});
