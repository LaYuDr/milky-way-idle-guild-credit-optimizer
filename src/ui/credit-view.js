(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MwiGuildCreditCreditView = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function createCreditView(dependencies) {
    const {
      state,
      window,
      t,
      escapeHtml,
      formatNumber,
      iconMarkup,
      marketItemIconMarkup,
      itemNameForMaterial,
      creditQuantity,
      itemQuantity,
      core,
      GUILD_TOKEN_CREDIT_CONVERSIONS,
      loadSnapshot,
      creditConversionGroups,
      snapshotOrderBook,
      refreshOfficialItemNameCatalog
    } = dependencies;

    function renderCreditSection(creditItemHrid, color, ranked, priceLimited) {
      const available = ranked.filter((row) => row.status === "ok").slice(0, 5);
      const creditName = itemNameForMaterial(creditItemHrid);
      const icon = iconMarkup(creditItemHrid, creditName);
      const collapsed = state.collapsedCreditSections.has(creditItemHrid);
      const heading = `<button class="mwi-credit-heading" data-role="toggle-credit-section" type="button" aria-expanded="${String(!collapsed)}">${icon}<span>${escapeHtml(creditName)}</span><span class="mwi-collapse-icon" aria-hidden="true">${collapsed ? "▸" : "▾"}</span></button>`;
      if (!available.length) {
        const emptyMessage =
          priceLimited && state.maxConversionItemUnitPrice
            ? t("noMarketEstimateWithinPriceLimit", {
                limit: formatNumber(state.maxConversionItemUnitPrice / 1_000_000, 2)
              })
            : t("noMarketEstimate");
        return `<section class="mwi-credit-section" data-credit-item-hrid="${escapeHtml(creditItemHrid)}" data-collapsed="${String(collapsed)}" style="--mwi-credit-color:${color}">${heading}<div class="mwi-credit-body"${collapsed ? " hidden" : ""}><div class="mwi-empty">${escapeHtml(emptyMessage)}</div></div></section>`;
      }
      const itemLabel = escapeHtml(t("item"));
      const exchangeLabel = escapeHtml(t("exchange"));
      const perCreditLabel = escapeHtml(t("perCredit"));
      const targetCostLabel = escapeHtml(t("targetCost"));
      return `<section class="mwi-credit-section" data-credit-item-hrid="${escapeHtml(creditItemHrid)}" data-collapsed="${String(collapsed)}" style="--mwi-credit-color:${color}">${heading}<div class="mwi-credit-body"${collapsed ? " hidden" : ""}><table><thead><tr><th>${itemLabel}</th><th>${exchangeLabel}</th><th>${perCreditLabel}</th><th>${targetCostLabel}</th></tr></thead><tbody>${available.map((row) => `<tr><td data-label="${itemLabel}" title="${escapeHtml(row.itemName)}"><span class="mwi-item">${marketItemIconMarkup(row.itemHrid, row.itemName)}<span class="mwi-item-name">${escapeHtml(row.itemName)}</span></span></td><td data-label="${exchangeLabel}">${escapeHtml(t("exchangeRate", { items: itemQuantity(row.itemCount), credits: creditQuantity(row.creditCount) }))}</td><td class="mwi-cost" data-label="${perCreditLabel}">${formatNumber(row.costPerCredit, 2)}</td><td data-label="${targetCostLabel}">${core.formatCompactCost(row.cost)}</td></tr>`).join("")}</tbody></table></div></section>`;
    }

    function renderGuildTokenValues(values) {
      const valuesByCredit = new Map(values.map((value) => [value.creditItemHrid, value]));
      const rows = GUILD_TOKEN_CREDIT_CONVERSIONS.map((rule) => {
        const value = valuesByCredit.get(rule.creditItemHrid) || { status: "unpriced", ...rule };
        const creditName = itemNameForMaterial(value.creditItemHrid);
        const exchange = t("exchangeRate", {
          items: `${formatNumber(value.guildTokenCount)} ${t("guildTokens")}`,
          credits: creditQuantity(value.creditCount)
        });
        if (value.status !== "ok") {
          return `<div class="mwi-token-value-row"><span class="mwi-item">${iconMarkup(value.creditItemHrid, creditName)}<span class="mwi-item-name">${escapeHtml(creditName)}</span></span><span class="mwi-token-value-exchange">${escapeHtml(exchange)}</span><span class="mwi-token-value-unpriced">${escapeHtml(t("noMarketValue"))}</span></div>`;
        }
        return `<div class="mwi-token-value-row"><span class="mwi-item">${iconMarkup(value.creditItemHrid, creditName)}<span class="mwi-item-name">${escapeHtml(creditName)}</span></span><span class="mwi-token-value-exchange">${escapeHtml(exchange)}</span><span class="mwi-cost">${core.formatCompactCost(value.goldValuePerToken)} ${escapeHtml(t("gold"))}</span></div>`;
      }).join("");
      const collapsed = state.guildTokenValuesCollapsed;
      const guildTokenName = itemNameForMaterial("/items/guild_token");
      const heading = `<button class="mwi-credit-heading mwi-token-value-heading" data-role="toggle-token-values" type="button" aria-expanded="${String(!collapsed)}">${iconMarkup("/items/guild_token", guildTokenName)}<span>${escapeHtml(t("tokenExchangeValue", { token: guildTokenName }))}</span><span class="mwi-collapse-icon" aria-hidden="true">${collapsed ? "▸" : "▾"}</span></button>`;
      return `<section class="mwi-token-value-section" data-collapsed="${String(collapsed)}">${heading}<div class="mwi-token-value-body mwi-token-value-list"${collapsed ? " hidden" : ""}>${rows}</div></section>`;
    }

    async function refreshPanel(panel, forceSnapshot) {
      refreshOfficialItemNameCatalog();
      if (state.refreshInFlight) {
        state.refreshQueued = true;
        return;
      }
      state.refreshInFlight = true;
      const status = panel.querySelector('[data-role="status"]');
      const results = panel.querySelector('[data-role="results"]');
      const button = panel.querySelector('[data-role="refresh"]');
      const target = Number(panel.querySelector('[data-role="target"]').value);
      button.disabled = true;
      status.hidden = false;
      results.replaceChildren();

      const unfilteredCreditGroups = creditConversionGroups({ applyPriceLimit: false });
      const conversionCount = unfilteredCreditGroups.reduce((total, group) => total + group.conversions.length, 0);
      if (!conversionCount) {
        status.textContent = t("noExchangeRules");
        button.disabled = false;
        finishRefresh(panel);
        return;
      }
      status.textContent = t("readingRules", { count: formatNumber(conversionCount) });

      try {
        await loadSnapshot(Boolean(forceSnapshot));
        const creditGroups = creditConversionGroups();
        const unfilteredConversionCounts = new Map(
          unfilteredCreditGroups.map((group) => [group.creditItemHrid, group.conversions.length])
        );
        const rankedGroups = creditGroups.map((group) => {
          const books = Object.fromEntries(
            group.conversions.map((conversion) => [conversion.itemHrid, snapshotOrderBook(conversion.itemHrid)])
          );
          const tokenRule = GUILD_TOKEN_CREDIT_CONVERSIONS.find((rule) => rule.creditItemHrid === group.creditItemHrid);
          return {
            ...group,
            priceLimited: group.conversions.length < (unfilteredConversionCounts.get(group.creditItemHrid) || 0),
            ranked: core.rankConversions(group.conversions, books, target),
            tokenRanked: core.rankConversions(group.conversions, books, tokenRule.creditCount)
          };
        });
        const tokenValues = core.rankGuildTokenCreditValues(
          GUILD_TOKEN_CREDIT_CONVERSIONS,
          Object.fromEntries(rankedGroups.map((group) => [group.creditItemHrid, group.tokenRanked]))
        );
        status.textContent = "";
        status.hidden = true;
        results.innerHTML = `${renderGuildTokenValues(tokenValues)}<div class="mwi-credit-grid">${rankedGroups.map((group) => renderCreditSection(group.creditItemHrid, group.color, group.ranked, group.priceLimited)).join("")}</div>`;
        button.disabled = false;
        finishRefresh(panel);
      } catch (error) {
        status.textContent = t("snapshotLoadFailed", { message: error.message });
        button.disabled = false;
        finishRefresh(panel);
      }
    }

    function finishRefresh(panel) {
      state.refreshInFlight = false;
      if (!state.refreshQueued) return;
      state.refreshQueued = false;
      window.clearTimeout(state.refreshTimer);
      state.refreshTimer = window.setTimeout(() => refreshPanel(panel), 250);
    }

    return { refreshPanel };
  }

  return { createCreditView };
});
