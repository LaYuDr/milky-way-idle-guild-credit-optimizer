(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MwiGuildCreditStorage = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const GUILD_BUFF_HRID_PATTERN = /^\/guild_buffs\/[A-Za-z0-9_./-]+$/;

  function normalizeGuildShrineAutofillExcludedBuffHrids(value) {
    const values =
      Array.isArray(value) || (value && typeof value !== "string" && typeof value[Symbol.iterator] === "function")
        ? Array.from(value)
        : [];
    return Array.from(
      new Set(
        values.filter(
          (guildBuffHrid) => typeof guildBuffHrid === "string" && GUILD_BUFF_HRID_PATTERN.test(guildBuffHrid)
        )
      )
    );
  }

  function normalizePanelView(view, panelViews) {
    return panelViews.includes(view) ? view : "credit";
  }

  function normalizePanelOrder(order, panelViews, defaultOrder = panelViews) {
    const allowed = new Set(panelViews);
    const normalized = [];
    for (const view of Array.isArray(order) ? order : []) {
      if (allowed.has(view) && !normalized.includes(view)) normalized.push(view);
    }
    for (const view of defaultOrder) {
      if (allowed.has(view) && !normalized.includes(view)) normalized.push(view);
    }
    for (const view of panelViews) {
      if (!normalized.includes(view)) normalized.push(view);
    }
    return normalized;
  }

  function createPluginStorage(options) {
    const { storage, location, config, buildingDataApi, marketDataApi } = options;
    const creditHrids = new Set(config.CREDIT_TYPES.map(([hrid]) => hrid));

    function guildBuildingPlannerStorageKey() {
      let characterId = "default";
      try {
        characterId = new URL(location.href).searchParams.get("characterId") || characterId;
      } catch (_) {
        // A per-host fallback still prevents plans from crossing game regions.
      }
      const hostname = (location && location.hostname) || "game";
      return `${config.GUILD_BUILDING_PLAN_STORAGE_PREFIX}:${hostname}:${characterId}`;
    }

    function loadSavedPluginUiState() {
      const fallback = {
        collapsedCreditSections: [],
        guildTokenValuesCollapsed: false,
        guildTokenCreditHrids: [],
        autoGuildTokenBudget: null,
        shrineGuideEnabled: false,
        guildShrineAutofillExcludedBuffHrids: [],
        showConstructionView: true,
        activeView: "credit",
        panelOrder: normalizePanelOrder([], config.PANEL_VIEWS, config.DEFAULT_PANEL_ORDER),
        targetCredit: 1,
        upgradePlans: []
      };
      try {
        const raw = storage && storage.getItem(config.UI_STATE_STORAGE_KEY);
        if (!raw) return fallback;
        const stored = JSON.parse(raw);
        if (!stored || typeof stored !== "object") return fallback;
        const collapsedCreditSections = Array.isArray(stored.collapsedCreditSections)
          ? Array.from(new Set(stored.collapsedCreditSections.filter((hrid) => creditHrids.has(hrid))))
          : [];
        const upgradePlans = Array.isArray(stored.upgradePlans)
          ? stored.upgradePlans
              .filter(
                (plan) =>
                  plan &&
                  typeof plan.guildBuffHrid === "string" &&
                  Number.isSafeInteger(plan.startLevel) &&
                  Number.isSafeInteger(plan.targetLevel)
              )
              .map((plan) => ({
                guildBuffHrid: plan.guildBuffHrid,
                startLevel: plan.startLevel,
                targetLevel: plan.targetLevel
              }))
          : [];
        const targetCredit = Number(stored.targetCredit);
        const guildTokenCreditHrids = Array.isArray(stored.guildTokenCreditHrids)
          ? Array.from(new Set(stored.guildTokenCreditHrids.filter((hrid) => creditHrids.has(hrid))))
          : stored.useGuildTokensForMissingCredits === true
            ? Array.from(creditHrids)
            : [];
        const autoGuildTokenBudgetValue = Number(stored.autoGuildTokenBudget);
        const autoGuildTokenBudget =
          stored.autoGuildTokenBudget === null || stored.autoGuildTokenBudget === undefined
            ? null
            : Number.isSafeInteger(autoGuildTokenBudgetValue) && autoGuildTokenBudgetValue >= 0
              ? autoGuildTokenBudgetValue
              : null;
        return {
          collapsedCreditSections,
          guildTokenValuesCollapsed: stored.guildTokenValuesCollapsed === true,
          guildTokenCreditHrids,
          autoGuildTokenBudget,
          shrineGuideEnabled: stored.shrineGuideEnabled === true,
          guildShrineAutofillExcludedBuffHrids: normalizeGuildShrineAutofillExcludedBuffHrids(
            stored.guildShrineAutofillExcludedBuffHrids
          ),
          showConstructionView: stored.showConstructionView !== false,
          activeView: normalizePanelView(stored.activeView, config.PANEL_VIEWS),
          panelOrder: normalizePanelOrder(stored.panelOrder, config.PANEL_VIEWS, config.DEFAULT_PANEL_ORDER),
          targetCredit: Number.isSafeInteger(targetCredit) && targetCredit > 0 ? targetCredit : 1,
          upgradePlans
        };
      } catch (_) {
        return fallback;
      }
    }

    function loadSavedGuildBuildingPlannerState() {
      const fallback = { plans: [], manualGuildPoints: null, category: "all" };
      try {
        const raw = storage && storage.getItem(guildBuildingPlannerStorageKey());
        if (!raw) return fallback;
        const stored = JSON.parse(raw);
        if (!stored || typeof stored !== "object") return fallback;
        const definitions = new Map(buildingDataApi.definitions().map((entry) => [entry.hrid, entry]));
        const seenBuildingHrids = new Set();
        const plans = Array.isArray(stored.plans)
          ? stored.plans.flatMap((plan) => {
              const definition = plan && definitions.get(plan.buildingHrid);
              const startLevel = Number(plan && plan.startLevel);
              const targetLevel = Number(plan && plan.targetLevel);
              if (
                !definition ||
                !Number.isSafeInteger(startLevel) ||
                !Number.isSafeInteger(targetLevel) ||
                startLevel < 0 ||
                targetLevel <= startLevel ||
                targetLevel > definition.maxLevel
              )
                return [];
              if (seenBuildingHrids.has(definition.hrid)) return [];
              seenBuildingHrids.add(definition.hrid);
              return [{ buildingHrid: definition.hrid, startLevel, targetLevel }];
            })
          : [];
        const manualGuildPointsValue = Number(stored.manualGuildPoints);
        const manualGuildPoints =
          stored.manualGuildPoints === null || stored.manualGuildPoints === undefined || stored.manualGuildPoints === ""
            ? null
            : Number.isSafeInteger(manualGuildPointsValue) && manualGuildPointsValue >= 0
              ? manualGuildPointsValue
              : null;
        const category = ["all", "core", "life", "combat", "shrine"].includes(stored.category)
          ? stored.category
          : "all";
        return { plans, manualGuildPoints, category };
      } catch (_) {
        return fallback;
      }
    }

    function persistGuildBuildingPlannerState(state) {
      try {
        storage &&
          storage.setItem(
            guildBuildingPlannerStorageKey(),
            JSON.stringify({
              schemaVersion: 1,
              rulesVersion: buildingDataApi.RULES_VERSION,
              manualGuildPoints: state.manualGuildPoints,
              category: state.buildingCategory,
              plans: state.buildingPlans.map((plan) => ({
                buildingHrid: plan.buildingHrid,
                startLevel: plan.startLevel,
                targetLevel: plan.targetLevel
              }))
            })
          );
      } catch (_) {
        // Keep the current page state when browser storage is unavailable.
      }
    }

    function persistPluginUiState(state) {
      try {
        if (!storage || typeof storage.setItem !== "function") return false;
        const upgradePlans = state.upgradePlans.map((plan) => ({
          guildBuffHrid: plan.guildBuffHrid,
          startLevel: plan.startLevel,
          targetLevel: plan.targetLevel
        }));
        storage.setItem(
          config.UI_STATE_STORAGE_KEY,
          JSON.stringify({
            collapsedCreditSections: Array.from(state.collapsedCreditSections),
            guildTokenValuesCollapsed: state.guildTokenValuesCollapsed,
            guildTokenCreditHrids: Array.from(state.guildTokenCreditHrids),
            autoGuildTokenBudget: state.autoGuildTokenBudget,
            shrineGuideEnabled: state.shrineGuideEnabled,
            guildShrineAutofillExcludedBuffHrids: normalizeGuildShrineAutofillExcludedBuffHrids(
              state.guildShrineAutofillExcludedBuffHrids
            ),
            showConstructionView: state.showConstructionView !== false,
            activeView: state.activeView,
            panelOrder: normalizePanelOrder(state.panelOrder, config.PANEL_VIEWS, config.DEFAULT_PANEL_ORDER),
            useGuildTokensForMissingCredits: config.CREDIT_TYPES.every(([hrid]) =>
              state.guildTokenCreditHrids.has(hrid)
            ),
            targetCredit: state.targetCredit,
            upgradePlans
          })
        );
        return true;
      } catch (_) {
        // Keep the current page state when browser storage is unavailable.
        return false;
      }
    }

    function loadSavedLiveMarketData() {
      try {
        const raw = storage && storage.getItem(config.MARKET_LIVE_STORAGE_KEY);
        return marketDataApi.restoreLiveMarketData(raw);
      } catch (_) {
        return { liveData: Object.create(null), revision: 0, valid: false };
      }
    }

    function persistLiveMarketData(liveData, revision) {
      try {
        if (!storage) return;
        if (!Object.keys(liveData).length) {
          storage.removeItem(config.MARKET_LIVE_STORAGE_KEY);
          return;
        }
        const cache = marketDataApi.serializeLiveMarketData(liveData, { revision });
        storage.setItem(config.MARKET_LIVE_STORAGE_KEY, JSON.stringify(cache));
      } catch (_) {
        // A storage quota or privacy restriction must not interrupt the game.
      }
    }

    function loadPriceReference() {
      try {
        const saved = storage && storage.getItem(config.PRICE_REFERENCE_STORAGE_KEY);
        return config.PRICE_REFERENCES[saved] ? saved : "a";
      } catch (_) {
        return "a";
      }
    }

    function persistPriceReference(reference) {
      try {
        storage && storage.setItem(config.PRICE_REFERENCE_STORAGE_KEY, reference);
      } catch (_) {
        // Keep the current page choice even when browser storage is unavailable.
      }
    }

    return {
      guildBuildingPlannerStorageKey,
      loadSavedPluginUiState,
      loadSavedGuildBuildingPlannerState,
      persistGuildBuildingPlannerState,
      persistPluginUiState,
      loadSavedLiveMarketData,
      persistLiveMarketData,
      loadPriceReference,
      persistPriceReference
    };
  }

  return {
    normalizePanelView,
    normalizePanelOrder,
    normalizeGuildShrineAutofillExcludedBuffHrids,
    createPluginStorage
  };
});
