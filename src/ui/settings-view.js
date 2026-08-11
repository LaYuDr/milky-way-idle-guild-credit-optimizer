(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MwiGuildCreditSettingsView = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function createSettingsView(dependencies) {
    const { state, t, ui, escapeHtml, guildBuffEntries, guildBuffLabel, updateRenderedMarkup } = dependencies;

    function currentExcludedGuildBuffHrids() {
      const value = state.guildShrineAutofillExcludedBuffHrids;
      if (value instanceof Set) return value;
      return new Set(Array.isArray(value) ? value : []);
    }

    function guildBuffSettingsSnapshot() {
      const entries = guildBuffEntries()
        .filter((entry) => entry && entry.hrid && entry.detail)
        .sort((left, right) =>
          guildBuffLabel(left.detail, left.hrid).localeCompare(guildBuffLabel(right.detail, right.hrid), ui().locale)
        );
      return {
        entries,
        ready: entries.length > 0 || (state.guildBuffDetails !== null && state.guildBuffDetails !== undefined)
      };
    }

    function guildBuffInputId(entry) {
      return `mwi-settings-autofill-${String(entry.hrid).replace(/[^a-zA-Z0-9_-]+/g, "-")}`;
    }

    function renderGuildBuffOption(entry) {
      const id = guildBuffInputId(entry);
      const label = guildBuffLabel(entry.detail, entry.hrid);
      return `<label class="mwi-settings-option" for="${escapeHtml(id)}"><input id="${escapeHtml(id)}" data-role="settings-shrine-autofill" data-guild-buff-hrid="${escapeHtml(entry.hrid)}" type="checkbox"><span>${escapeHtml(label)}</span></label>`;
    }

    function renderGuildBuffDomain(domain, entries) {
      const combat = domain === "combat";
      const matching = entries.filter((entry) => (entry.detail && entry.detail.isCombat === true) === combat);
      return `<fieldset class="mwi-settings-domain" data-domain="${domain}"><legend>${escapeHtml(
        combat ? t("domainCombat") : t("domainLife")
      )}</legend><div class="mwi-settings-options">${matching.map(renderGuildBuffOption).join("")}</div></fieldset>`;
    }

    function renderShrineAutofillSettings(snapshot) {
      if (!snapshot.ready)
        return `<p class="mwi-settings-placeholder" data-role="settings-shrines-loading" role="status">${escapeHtml(
          t("settingsShrinesLoading")
        )}</p>`;
      if (!snapshot.entries.length)
        return `<p class="mwi-settings-placeholder" data-role="settings-shrines-empty" role="status">${escapeHtml(
          t("settingsShrinesEmpty")
        )}</p>`;
      return `<div class="mwi-settings-domains">${renderGuildBuffDomain(
        "life",
        snapshot.entries
      )}${renderGuildBuffDomain("combat", snapshot.entries)}</div>`;
    }

    function renderSettingsContent(snapshot) {
      return `<section class="mwi-settings-block" aria-labelledby="mwi-settings-autofill-heading"><div class="mwi-settings-block-heading"><h4 id="mwi-settings-autofill-heading">${escapeHtml(
        t("shrineAutofillRange")
      )}</h4><p>${escapeHtml(t("shrineAutofillRangeHint"))}</p></div>${renderShrineAutofillSettings(
        snapshot
      )}</section><section class="mwi-settings-block" aria-labelledby="mwi-settings-interface-heading"><div class="mwi-settings-block-heading"><h4 id="mwi-settings-interface-heading">${escapeHtml(
        t("interfaceVisibility")
      )}</h4></div><label class="mwi-settings-switch"><span class="mwi-settings-switch-copy"><strong>${escapeHtml(
        t("showConstructionView")
      )}</strong><small id="mwi-settings-construction-hint">${escapeHtml(
        t("showConstructionViewHint")
      )}</small></span><input class="mwi-settings-switch-input" data-role="settings-show-construction" type="checkbox" role="switch" aria-describedby="mwi-settings-construction-hint"></label></section>`;
    }

    function renderSettingsMarkup() {
      const snapshot = guildBuffSettingsSnapshot();
      const hidden = state.settingsOpen === true ? "" : " hidden";
      return `<section id="mwi-settings-panel" class="mwi-settings-panel" data-role="settings-panel" aria-labelledby="mwi-settings-title" tabindex="-1"${hidden}><header class="mwi-settings-header"><span><h3 id="mwi-settings-title">${escapeHtml(
        t("interfaceSettings")
      )}</h3><p>${escapeHtml(t("interfaceSettingsHint"))}</p></span><button class="mwi-settings-close" data-role="settings-close" type="button" title="${escapeHtml(
        t("closeInterfaceSettings")
      )}" aria-label="${escapeHtml(t("closeInterfaceSettings"))}">×</button></header><div class="mwi-settings-content" data-role="settings-content">${renderSettingsContent(
        snapshot
      )}</div><p class="mwi-settings-status" data-role="settings-status" role="status" aria-live="polite" aria-atomic="true"></p></section>`;
    }

    function refreshSettings(panel) {
      if (!panel || typeof panel.querySelector !== "function") return null;
      const settingsPanel =
        (typeof panel.matches === "function" && panel.matches('[data-role="settings-panel"]') && panel) ||
        panel.querySelector('[data-role="settings-panel"]');
      if (!settingsPanel) return null;
      settingsPanel.hidden = state.settingsOpen !== true;
      const content = settingsPanel.querySelector('[data-role="settings-content"]');
      const snapshot = guildBuffSettingsSnapshot();
      updateRenderedMarkup(content, renderSettingsContent(snapshot));
      const excludedHrids = currentExcludedGuildBuffHrids();
      for (const input of settingsPanel.querySelectorAll('[data-role="settings-shrine-autofill"]'))
        input.checked = !excludedHrids.has(input.dataset.guildBuffHrid);
      const constructionInput = settingsPanel.querySelector('[data-role="settings-show-construction"]');
      if (constructionInput) constructionInput.checked = state.showConstructionView !== false;
      return settingsPanel;
    }

    return { renderSettingsMarkup, refreshSettings };
  }

  return { createSettingsView };
});
