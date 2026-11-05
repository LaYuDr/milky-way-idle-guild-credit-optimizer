(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MwiGuildLabyrinthPrefill = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const TABLE = 'table[class*="LabyrinthPanel_automationTable"]';
  const THRESHOLD = '[class*="LabyrinthPanel_skipThreshold"]';
  const INPUT = '[class*="LabyrinthPanel_thresholdInputContainer"] input';
  const RECOMMEND = "td.mwi-lab-auto-recommend-cell";

  function readRecommendation(row) {
    const cells = row.querySelectorAll(RECOMMEND);
    if (cells.length !== 1) return null;
    const cell = cells[0];
    const text = cell.textContent.trim();
    const token = cell.getAttribute("data-mwi-auto-recommend-token");
    if (!/^[+-]?\d+$/.test(text) || (token && !token.startsWith("ready:"))) return null;
    const value = Number(text);
    // Match the native threshold handler. Do not clamp a recommendation silently.
    if (!Number.isSafeInteger(value) || value < -999 || value > 999) return null;
    return { value: String(value), text, token, key: cell.getAttribute("data-mwi-auto-room-key") };
  }

  function create({ document, pageWindow, t, getEnabled = () => true, setEnabled = () => true }) {
    const controls = new Map();
    let mountObserver = null;
    let enabled = getEnabled() !== false;
    let pending = null;
    let active = false;
    function cancel() {
      if (!pending) return;
      pending.observer.disconnect();
      pageWindow.clearTimeout(pending.timer);
      pending = null;
    }
    function refreshControls() {
      for (const [table, label] of controls) {
        if (!table.isConnected || !label.isConnected) {
          label.remove();
          controls.delete(table);
        }
      }
      for (const table of document.querySelectorAll(TABLE)) {
        if (controls.has(table)) continue;
        const label = document.createElement("label");
        label.className = "mwi-labyrinth-prefill-toggle";
        label.style.cssText =
          "display:flex;align-items:center;gap:8px;max-width:100%;min-height:36px;margin:8px 0;font-size:14px;font-weight:400;line-height:1.45;cursor:pointer;color:inherit;";
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = enabled;
        checkbox.style.cssText = "flex:0 0 auto;width:18px;height:18px;margin:0;accent-color:#a4afff;";
        const text = document.createElement("span");
        text.textContent = t("labyrinthPrefillToggle");
        text.style.cssText = "min-width:0;overflow-wrap:anywhere;";
        label.title = t("labyrinthPrefillHint");
        label.append(checkbox, text);
        checkbox.addEventListener("change", () => {
          enabled = checkbox.checked;
          cancel();
          const saved = setEnabled(enabled);
          for (const control of controls.values()) {
            control.querySelector("input").checked = enabled;
            control.title = t(saved === false ? "labyrinthPrefillSaveFailed" : "labyrinthPrefillHint");
          }
        });
        controls.set(table, label);
        table.before(label);
      }
    }
    function fill() {
      if (!pending) return;
      if (!enabled) {
        cancel();
        return;
      }
      const { row, recommendation } = pending;
      const current = readRecommendation(row);
      if (!row.isConnected || !current || JSON.stringify(current) !== JSON.stringify(recommendation)) {
        cancel();
        return;
      }
      const inputs = row.querySelectorAll(INPUT);
      if (inputs.length !== 1) return;
      const input = inputs[0];
      cancel(); // One edit, one write. Later typing/calculation must never overwrite it.
      if (input.disabled || input.readOnly || input.type !== "number") return;
      const value = Number(recommendation.value);
      if ((input.min !== "" && value < Number(input.min)) || (input.max !== "" && value > Number(input.max))) return;
      // Bypass React's per-element value tracker, then let its onChange update
      // the unsaved native draft. Never call save handlers or game APIs.
      const setter = Object.getOwnPropertyDescriptor(pageWindow.HTMLInputElement.prototype, "value")?.set;
      if (!setter) return;
      setter.call(input, recommendation.value);
      input.dispatchEvent(new pageWindow.Event("input", { bubbles: true }));
    }
    function onClick(event) {
      cancel();
      if (!enabled) return;
      const button = event.target?.closest?.('button, [role="button"], [class*="Button_button__"]');
      if (!button || button.disabled || button.getAttribute("aria-disabled") === "true") return;
      if (!/^(编辑|Edit)$/i.test(button.textContent.trim())) return;
      const threshold = button.closest(THRESHOLD);
      const row = threshold?.closest("tr");
      if (!row?.closest(TABLE) || row.querySelector(INPUT)) return;
      const recommendation = readRecommendation(row);
      if (!recommendation) return;
      const observer = new pageWindow.MutationObserver(fill);
      pending = { row, recommendation, observer, timer: pageWindow.setTimeout(cancel, 1000) };
      observer.observe(row, { childList: true, subtree: true, characterData: true, attributes: true });
    }
    function onInput(event) {
      if (pending?.row.contains(event.target)) cancel();
    }
    return {
      start() {
        if (active) return;
        active = true;
        enabled = getEnabled() !== false;
        refreshControls();
        mountObserver = new pageWindow.MutationObserver((mutations) => {
          // Ignore ordinary game updates; only reconcile table mounts/removals
          // and React replacing our local control.
          if (
            [...controls].some(([table, label]) => !table.isConnected || !label.isConnected) ||
            mutations.some((mutation) =>
              [...mutation.addedNodes].some(
                (node) => node.nodeType === 1 && (node.matches(TABLE) || node.querySelector(TABLE))
              )
            )
          )
            refreshControls();
        });
        mountObserver.observe(document, { childList: true, subtree: true });
        document.addEventListener("click", onClick, true);
        document.addEventListener("input", onInput, true);
      },
      dispose() {
        active = false;
        mountObserver?.disconnect();
        mountObserver = null;
        for (const label of controls.values()) label.remove();
        controls.clear();
        cancel();
        document.removeEventListener("click", onClick, true);
        document.removeEventListener("input", onInput, true);
      }
    };
  }

  return { create, readRecommendation };
});
