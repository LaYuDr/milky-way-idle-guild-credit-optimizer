(function (root, factory) {
  const api = factory(
    typeof module !== "undefined" && module.exports ? require("./shrine-effects.js") : root.MwiGuildShrineEffects
  );
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MwiGuildCreditSettingsView = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (effectApi) {
  "use strict";

  function createSettingsView(dependencies) {
    const {
      state,
      t,
      ui,
      core,
      escapeHtml,
      guildBuffEntries,
      guildBuffLabel,
      guildBuildingSpriteBaseHref,
      guildBuildingIconMarkup,
      updateRenderedMarkup
    } = dependencies;
    const effects = effectApi.createFormatter({ core, t, ui });
    function renderGuildBuffEffects(detail) {
      return effects.perLevel(detail, "\n").split("\n").map(escapeHtml).join("<br>");
    }

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

    function renderGuildBuffOption(entry, spriteBaseHref) {
      const id = guildBuffInputId(entry);
      const label = guildBuffLabel(entry.detail, entry.hrid);
      const icon = guildBuildingIconMarkup({ hrid: entry.detail.shrineHrid }, spriteBaseHref);
      return `<label class="mwi-settings-option" for="${escapeHtml(id)}"><input id="${escapeHtml(id)}" data-role="settings-shrine-autofill" data-guild-buff-hrid="${escapeHtml(entry.hrid)}" type="checkbox" aria-labelledby="${escapeHtml(id)}-name" aria-describedby="${escapeHtml(id)}-effects"><span class="mwi-settings-shrine-icon" aria-hidden="true">${icon}</span><span class="mwi-settings-shrine-copy"><span id="${escapeHtml(id)}-name" class="mwi-settings-shrine-name">${escapeHtml(label)}</span><span id="${escapeHtml(id)}-effects" class="mwi-settings-shrine-effects">${renderGuildBuffEffects(entry.detail)}</span></span></label>`;
    }

    function renderGuildBuffDomain(domain, entries, spriteBaseHref) {
      const combat = domain === "combat";
      const matching = entries.filter((entry) => (entry.detail && entry.detail.isCombat === true) === combat);
      return `<fieldset class="mwi-settings-domain" data-domain="${domain}"><legend>${escapeHtml(
        combat ? t("domainCombat") : t("domainLife")
      )}</legend><div class="mwi-settings-options">${matching.map((entry) => renderGuildBuffOption(entry, spriteBaseHref)).join("")}</div></fieldset>`;
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
      const spriteBaseHref = guildBuildingSpriteBaseHref();
      return `<div class="mwi-settings-domains">${renderGuildBuffDomain(
        "life",
        snapshot.entries,
        spriteBaseHref
      )}${renderGuildBuffDomain("combat", snapshot.entries, spriteBaseHref)}</div>`;
    }

    function renderSettingsContent(snapshot) {
      return `<section class="mwi-settings-block" aria-labelledby="mwi-settings-autofill-heading"><div class="mwi-settings-block-heading"><h4 id="mwi-settings-autofill-heading">${escapeHtml(
        t("shrineAutofillRange")
      )}</h4><p>${escapeHtml(t("shrineAutofillRangeHint"))}</p></div>${renderShrineAutofillSettings(
        snapshot
      )}</section><section class="mwi-settings-block" aria-labelledby="mwi-settings-interface-heading"><div class="mwi-settings-block-heading"><h4 id="mwi-settings-interface-heading">${escapeHtml(
        t("interfaceVisibility")
      )}</h4></div><form class="mwi-settings-name" data-role="settings-sidebar-name-form"><label for="mwi-settings-sidebar-name">${escapeHtml(t("sidebarDisplayName"))}</label><div class="mwi-settings-name-controls"><input id="mwi-settings-sidebar-name" data-role="settings-sidebar-name" type="text" value="${escapeHtml(state.sidebarDisplayName || "")}" placeholder="${escapeHtml(t("sidebarCredit"))}" aria-describedby="mwi-settings-sidebar-name-hint" autocomplete="off"><button id="mwi-settings-sidebar-name-save" type="submit">${escapeHtml(t("sidebarNameSave"))}</button><button id="mwi-settings-sidebar-name-reset" type="button" data-role="settings-sidebar-name-reset">${escapeHtml(t("sidebarNameReset"))}</button></div><p id="mwi-settings-sidebar-name-hint">${escapeHtml(t("sidebarDisplayNameHint"))}</p></form><label class="mwi-settings-switch"><span class="mwi-settings-switch-copy"><strong>${escapeHtml(
        t("showConstructionView")
      )}</strong><small id="mwi-settings-construction-hint">${escapeHtml(
        t("showConstructionViewHint")
      )}</small></span><input id="mwi-settings-show-construction" class="mwi-settings-switch-input" data-role="settings-show-construction" type="checkbox" role="switch" aria-describedby="mwi-settings-construction-hint"></label><label class="mwi-settings-switch"><span class="mwi-settings-switch-copy"><strong>${escapeHtml(
        t("showTrialHistoryView")
      )}</strong><small id="mwi-settings-trials-hint">${escapeHtml(
        t("showTrialHistoryViewHint")
      )}</small></span><input id="mwi-settings-show-trials" class="mwi-settings-switch-input" data-role="settings-show-trials" type="checkbox" role="switch" aria-describedby="mwi-settings-trials-hint"></label></section>`;
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
      const nameInput = settingsPanel.querySelector('[data-role="settings-sidebar-name"]');
      const draftName = nameInput?.value;
      const focused = content?.ownerDocument?.activeElement;
      const focusedId = focused && content.contains(focused) ? focused.id : "";
      const selection = focused === nameInput ? [nameInput.selectionStart, nameInput.selectionEnd] : null;
      updateRenderedMarkup(content, renderSettingsContent(snapshot));
      const updatedNameInput = settingsPanel.querySelector('[data-role="settings-sidebar-name"]');
      if (updatedNameInput && draftName !== undefined) updatedNameInput.value = draftName;
      const excludedHrids = currentExcludedGuildBuffHrids();
      for (const input of settingsPanel.querySelectorAll('[data-role="settings-shrine-autofill"]'))
        input.checked = !excludedHrids.has(input.dataset.guildBuffHrid);
      const constructionInput = settingsPanel.querySelector('[data-role="settings-show-construction"]');
      if (constructionInput) constructionInput.checked = state.showConstructionView === true;
      const trialsInput = settingsPanel.querySelector('[data-role="settings-show-trials"]');
      if (trialsInput) trialsInput.checked = state.showTrialHistoryView === true;
      if (focusedId && !focused.isConnected) {
        const replacement = content.ownerDocument.getElementById(focusedId);
        if (replacement && content.contains(replacement)) {
          replacement.focus({ preventScroll: true });
          if (selection && typeof replacement.setSelectionRange === "function")
            replacement.setSelectionRange(...selection);
        }
      }
      return settingsPanel;
    }

    return { renderSettingsMarkup, refreshSettings };
  }

  return { createSettingsView };
});
