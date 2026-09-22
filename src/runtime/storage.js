(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MwiGuildCreditStorage = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const GUILD_BUFF_HRID_PATTERN = /^\/guild_buffs\/[A-Za-z0-9_./-]+$/;
  const GUILD_POINT_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  const LEGACY_GUILD_TRIAL_FIRST_START_AT = Date.parse("2026-07-13T00:00:00Z");
  const GUILD_BUILDING_PLANNER_SCHEMA_VERSION = 7;

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

  function normalizeSidebarDisplayName(value) {
    return typeof value === "string" ? Array.from(value.trim().replace(/\s+/g, " ")).slice(0, 24).join("") : "";
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

  function normalizeGuildPointHistory(value) {
    const source = value && typeof value === "object" ? value : {};
    const normalizeObservation = (observation) => {
      const lifetimePoints = Number(observation && observation.lifetimePoints);
      const availablePoints = Number(observation && observation.availablePoints);
      const weekStartAt = Number(observation && observation.weekStartAt);
      const observedAt = Number(observation && observation.observedAt);
      if (
        !Number.isSafeInteger(lifetimePoints) ||
        lifetimePoints < 0 ||
        !Number.isSafeInteger(availablePoints) ||
        availablePoints < 0 ||
        !Number.isSafeInteger(observedAt) ||
        observedAt <= 0
      )
        return null;
      return {
        guildId: String((observation && observation.guildId) || "").slice(0, 160),
        lifetimePoints,
        availablePoints,
        weekStartAt: Number.isSafeInteger(weekStartAt) && weekStartAt > 0 ? weekStartAt : null,
        observedAt
      };
    };
    const byWeek = new Map();
    for (const record of Array.isArray(source.weeks) ? source.weeks : []) {
      const weekStartAt = Number(record && record.weekStartAt);
      const earnedPoints = Number(record && record.earnedPoints);
      const observedAt = Number(record && record.observedAt);
      if (
        !Number.isSafeInteger(weekStartAt) ||
        weekStartAt <= 0 ||
        !Number.isSafeInteger(earnedPoints) ||
        earnedPoints < 0
      )
        continue;
      const previous = byWeek.get(weekStartAt);
      byWeek.set(weekStartAt, {
        weekStartAt,
        earnedPoints: previous ? previous.earnedPoints + earnedPoints : earnedPoints,
        complete: Boolean((previous && previous.complete) || (record && record.complete)),
        observedAt:
          Number.isSafeInteger(observedAt) && observedAt > 0
            ? Math.max(previous ? previous.observedAt : 0, observedAt)
            : previous
              ? previous.observedAt
              : weekStartAt
      });
    }
    const manualByWeek = new Map();
    for (const record of Array.isArray(source.manualWeeks) ? source.manualWeeks : []) {
      const weekStartAt = Number(record && record.weekStartAt);
      const earnedPoints = Number(record && record.earnedPoints);
      const observedAt = Number(record && record.observedAt);
      if (
        !Number.isSafeInteger(weekStartAt) ||
        weekStartAt <= 0 ||
        !Number.isSafeInteger(earnedPoints) ||
        earnedPoints < 0
      )
        continue;
      manualByWeek.set(weekStartAt, {
        weekStartAt,
        earnedPoints,
        observedAt: Number.isSafeInteger(observedAt) && observedAt > 0 ? observedAt : weekStartAt
      });
    }
    return {
      guildId: String(source.guildId || "").slice(0, 160),
      lastObservation: normalizeObservation(source.lastObservation),
      weeks: Array.from(byWeek.values())
        .sort((left, right) => left.weekStartAt - right.weekStartAt)
        .slice(-12),
      manualWeeks: Array.from(manualByWeek.values())
        .sort((left, right) => left.weekStartAt - right.weekStartAt)
        .slice(-104)
    };
  }

  function migrateLegacyGuildPointManualWeeks(value, schemaVersion, firstTrialStartAt) {
    const normalized = normalizeGuildPointHistory(value);
    if (Number(schemaVersion) >= GUILD_BUILDING_PLANNER_SCHEMA_VERSION) return normalized;
    const firstTrial = Number(firstTrialStartAt);
    if (!Number.isSafeInteger(firstTrial) || firstTrial <= 0) return normalized;
    const currentWeekStarts = new Set(
      normalized.manualWeeks
        .filter((record) => (record.weekStartAt - firstTrial) % GUILD_POINT_WEEK_MS === 0)
        .map((record) => record.weekStartAt)
    );
    const manualWeeks = normalized.manualWeeks.flatMap((record) => {
      const ordinal = (record.weekStartAt - LEGACY_GUILD_TRIAL_FIRST_START_AT) / GUILD_POINT_WEEK_MS;
      if (!Number.isInteger(ordinal) || ordinal < 0) return [record];
      const weekStartAt = firstTrial + ordinal * GUILD_POINT_WEEK_MS;
      return currentWeekStarts.has(weekStartAt) ? [] : [{ ...record, weekStartAt }];
    });
    return normalizeGuildPointHistory({ ...normalized, manualWeeks });
  }

  function normalizeGuildPointSnapshot(value) {
    if (!value || typeof value !== "object") return null;
    const lifetimePoints = Number(value.lifetimePoints);
    const availablePoints = Number(value.availablePoints);
    const currentWeekPoints =
      value.currentWeekPoints === null || value.currentWeekPoints === undefined ? NaN : Number(value.currentWeekPoints);
    const weekStartAt = Number(value.weekStartAt);
    const observedAt = Number(value.observedAt);
    if (
      !Number.isSafeInteger(lifetimePoints) ||
      lifetimePoints < 0 ||
      !Number.isSafeInteger(availablePoints) ||
      availablePoints < 0 ||
      !Number.isSafeInteger(weekStartAt) ||
      weekStartAt <= 0 ||
      !Number.isSafeInteger(observedAt) ||
      observedAt <= 0
    )
      return null;
    return {
      guildId: String(value.guildId || "").slice(0, 160),
      lifetimePoints,
      availablePoints,
      currentWeekPoints: Number.isSafeInteger(currentWeekPoints) && currentWeekPoints >= 0 ? currentWeekPoints : null,
      weekStartAt,
      observedAt
    };
  }

  function guildPointStateFromSnapshot(value, now = Date.now()) {
    const snapshot = normalizeGuildPointSnapshot(value);
    if (!snapshot)
      return {
        guildPointSummary: null,
        guildWeekStartAt: null,
        guildPointSummaryObservedAt: null,
        guildPointSummaryCached: false
      };
    const { weekStartAt, observedAt, currentWeekPoints, ...summary } = snapshot;
    return {
      guildPointSummary: {
        ...summary,
        ...(Number.isSafeInteger(currentWeekPoints) && now >= weekStartAt && now < weekStartAt + GUILD_POINT_WEEK_MS
          ? { currentWeekPoints }
          : {})
      },
      guildWeekStartAt: weekStartAt,
      guildPointSummaryObservedAt: observedAt,
      guildPointSummaryCached: true
    };
  }

  function normalizeTrialDisplay(value) {
    return Object.fromEntries(
      Object.entries({
        level: true,
        workDone: true,
        workShare: false,
        workMultiple: false,
        levelSummary: true,
        workSummary: true
      }).map(([key, fallback]) => [key, typeof value?.[key] === "boolean" ? value[key] : fallback])
    );
  }

  function createPluginStorage(options) {
    const { storage, location, config, buildingDataApi, marketDataApi, trialHistoryApi } = options;
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

    function trialHistoryPrefix() {
      return `${config.TRIAL_HISTORY_STORAGE_PREFIX}:${guildBuildingPlannerStorageKey()}:`;
    }

    function trialDisplayKey() {
      return `${config.TRIAL_DISPLAY_STORAGE_PREFIX}:${guildBuildingPlannerStorageKey()}`;
    }

    function loadTrialDisplay() {
      try {
        return normalizeTrialDisplay(JSON.parse(storage.getItem(trialDisplayKey())));
      } catch (_) {
        return normalizeTrialDisplay(null);
      }
    }

    function saveTrialDisplay(value) {
      try {
        storage.setItem(trialDisplayKey(), JSON.stringify(normalizeTrialDisplay(value)));
        return true;
      } catch (_) {
        return false;
      }
    }

    function loadTrialHistory() {
      const records = [];
      let failed = false;
      try {
        for (let index = 0; index < storage.length; index += 1) {
          const key = storage.key(index);
          if (!key || !key.startsWith(trialHistoryPrefix())) continue;
          try {
            const record = trialHistoryApi.normalizeSnapshot(JSON.parse(storage.getItem(key)));
            if (trialHistoryApi.validSnapshot(record)) records.push(record);
            else failed = true;
          } catch (_) {
            failed = true;
          }
        }
      } catch (_) {
        failed = true;
      }
      return {
        records: records.sort(trialHistoryApi.compareSnapshots),
        failed
      };
    }

    function importTrialHistory(incoming) {
      const written = [];
      let duplicates = 0;
      let conflicts = 0;
      try {
        const validated = trialHistoryApi.parseImport(JSON.stringify({ schemaVersion: 2, records: incoming }));
        for (const record of validated) {
          const key = trialHistoryPrefix() + encodeURIComponent(record.key);
          const previous = storage.getItem(key);
          if (previous !== null) {
            let existing;
            try {
              existing = JSON.parse(previous);
            } catch (_) {
              existing = { key: record.key };
            }
            const status = trialHistoryApi.previewImport([record], [existing || { key: record.key }])[0].status;
            if (status === "duplicate") duplicates += 1;
            else if (status !== "dated") conflicts += 1;
            if (status !== "dated") continue;
          }
          const text = JSON.stringify(record);
          storage.setItem(key, text);
          written.push({ key, text, previous });
        }
        return {
          status: "imported",
          added: written.filter((entry) => entry.previous === null).length,
          dated: written.filter((entry) => entry.previous !== null).length,
          duplicates,
          conflicts
        };
      } catch (_) {
        let added = 0;
        let dated = 0;
        // Restore only our own writes, including the exact pre-import value
        // when enriching a date. Do not overwrite another page's newer write.
        for (const { key, text, previous } of written) {
          let retained = false;
          try {
            if (storage.getItem(key) === text) {
              if (previous === null) storage.removeItem(key);
              else storage.setItem(key, previous);
            }
            retained = storage.getItem(key) !== previous;
          } catch (_) {
            retained = true;
          }
          if (retained && previous === null) added += 1;
          else if (retained) dated += 1;
        }
        return { status: added + dated ? "partial" : "failed", added, dated, duplicates, conflicts };
      }
    }

    function saveTrialSnapshot(record) {
      try {
        if (!trialHistoryApi.validSnapshot(record)) return false;
        const key = trialHistoryPrefix() + encodeURIComponent(record.key);
        const previous = JSON.parse(storage.getItem(key) || "null");
        const members = { ...(previous?.members || {}), ...record.members };
        // One key per trial: a quota error cannot destroy any older records.
        const levels =
          previous?.memberLevels || record.memberLevels
            ? {
                memberLevels: Object.fromEntries(
                  record.rows.flatMap((row) => {
                    const level =
                      trialHistoryApi.memberLevel(previous || {}, row) ?? trialHistoryApi.memberLevel(record, row);
                    return level === null ? [] : [[row.memberKey ?? row.characterId, level]];
                  })
                )
              }
            : {};
        storage.setItem(
          key,
          JSON.stringify({
            ...trialHistoryApi.withSavedProgress(record, previous),
            members,
            ...levels,
            ...(record.weekTrials || previous?.weekTrials
              ? { weekTrials: record.weekTrials || previous.weekTrials }
              : {}),
            ...(record.membershipEvidence || previous?.membershipEvidence
              ? {
                  membershipEvidence: trialHistoryApi.mergeMembershipEvidence(
                    previous?.membershipEvidence || [],
                    record.membershipEvidence || []
                  )
                }
              : {})
          })
        );
        return true;
      } catch (_) {
        return false;
      }
    }

    function loadSavedPluginUiState() {
      const fallback = {
        collapsedCreditSections: [],
        guildTokenValuesCollapsed: false,
        guildTokenCreditHrids: [],
        autoGuildTokenBudget: null,
        shrineGuideEnabled: false,
        maxConversionItemUnitPrice: null,
        guildShrineAutofillExcludedBuffHrids: [],
        showConstructionView: true,
        showTrialHistoryView: true,
        sidebarDisplayName: "",
        activeView: "credit",
        panelOrder: normalizePanelOrder([], config.PANEL_VIEWS, config.DEFAULT_PANEL_ORDER),
        targetCredit: config.DEFAULT_TARGET_CREDIT,
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
        const maxConversionItemUnitPriceValue = Number(stored.maxConversionItemUnitPrice);
        const maxConversionItemUnitPrice =
          stored.maxConversionItemUnitPrice !== null &&
          stored.maxConversionItemUnitPrice !== undefined &&
          Number.isSafeInteger(maxConversionItemUnitPriceValue) &&
          maxConversionItemUnitPriceValue > 0
            ? maxConversionItemUnitPriceValue
            : null;
        return {
          collapsedCreditSections,
          guildTokenValuesCollapsed: stored.guildTokenValuesCollapsed === true,
          guildTokenCreditHrids,
          autoGuildTokenBudget,
          shrineGuideEnabled: stored.shrineGuideEnabled === true,
          maxConversionItemUnitPrice,
          guildShrineAutofillExcludedBuffHrids: normalizeGuildShrineAutofillExcludedBuffHrids(
            stored.guildShrineAutofillExcludedBuffHrids
          ),
          showConstructionView: stored.showConstructionView !== false,
          showTrialHistoryView: stored.showTrialHistoryView !== false,
          sidebarDisplayName: normalizeSidebarDisplayName(stored.sidebarDisplayName),
          activeView: normalizePanelView(stored.activeView, config.PANEL_VIEWS),
          panelOrder: normalizePanelOrder(stored.panelOrder, config.PANEL_VIEWS, config.DEFAULT_PANEL_ORDER),
          targetCredit: Number.isSafeInteger(targetCredit) && targetCredit > 0 ? targetCredit : fallback.targetCredit,
          upgradePlans
        };
      } catch (_) {
        return fallback;
      }
    }

    function loadSavedGuildBuildingPlannerState() {
      const fallback = {
        plans: [],
        manualGuildPoints: null,
        guildPointSettings: { guildPointForecastWeeks: 6, guildPointPlanningWeeks: 0 },
        category: "all",
        guildPointHistory: normalizeGuildPointHistory(null),
        guildPointSnapshot: null
      };
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
        const guildPointForecastWeeksValue = Number(stored.guildPointForecastWeeks);
        const guildPointPlanningWeeksValue = Number(stored.guildPointPlanningWeeks);
        return {
          plans,
          manualGuildPoints,
          guildPointSettings: {
            guildPointForecastWeeks:
              Number.isSafeInteger(guildPointForecastWeeksValue) &&
              guildPointForecastWeeksValue >= 2 &&
              guildPointForecastWeeksValue <= 12
                ? guildPointForecastWeeksValue
                : 6,
            guildPointPlanningWeeks:
              Number.isSafeInteger(guildPointPlanningWeeksValue) &&
              guildPointPlanningWeeksValue >= 0 &&
              guildPointPlanningWeeksValue <= 12
                ? guildPointPlanningWeeksValue
                : 0
          },
          category,
          guildPointHistory: migrateLegacyGuildPointManualWeeks(
            stored.guildPointHistory,
            stored.schemaVersion,
            config.GUILD_TRIAL_FIRST_START_AT
          ),
          // Older snapshots may have copied the available balance into weekly
          // progress. Preserve all other data and wait for a fresh weekly read.
          guildPointSnapshot: normalizeGuildPointSnapshot(
            stored.guildPointSnapshot && !(Number(stored.schemaVersion) >= 7)
              ? { ...stored.guildPointSnapshot, currentWeekPoints: null }
              : stored.guildPointSnapshot
          )
        };
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
              schemaVersion: GUILD_BUILDING_PLANNER_SCHEMA_VERSION,
              rulesVersion: buildingDataApi.RULES_VERSION,
              manualGuildPoints: state.manualGuildPoints,
              guildPointForecastWeeks: state.guildPointForecastWeeks,
              guildPointPlanningWeeks: state.guildPointPlanningWeeks,
              category: state.buildingCategory,
              guildPointHistory: normalizeGuildPointHistory(state.guildPointHistory),
              guildPointSnapshot: normalizeGuildPointSnapshot({
                ...state.guildPointSummary,
                weekStartAt: state.guildWeekStartAt,
                observedAt: state.guildPointSummaryObservedAt
              }),
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
            maxConversionItemUnitPrice:
              Number.isSafeInteger(state.maxConversionItemUnitPrice) && state.maxConversionItemUnitPrice > 0
                ? state.maxConversionItemUnitPrice
                : null,
            guildShrineAutofillExcludedBuffHrids: normalizeGuildShrineAutofillExcludedBuffHrids(
              state.guildShrineAutofillExcludedBuffHrids
            ),
            showConstructionView: state.showConstructionView === true,
            showTrialHistoryView: state.showTrialHistoryView === true,
            sidebarDisplayName: normalizeSidebarDisplayName(state.sidebarDisplayName),
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

    function loadSavedMarketSnapshot() {
      const fallback = { snapshot: null, fetchedAt: 0 };
      try {
        const raw = storage && storage.getItem(config.MARKETPLACE_SNAPSHOT_STORAGE_KEY);
        if (!raw) return fallback;
        const stored = JSON.parse(raw);
        const fetchedAt = Number(stored && stored.fetchedAt);
        const timestamp = marketDataApi.normalizeMarketTimestamp(stored && stored.timestamp);
        const marketData = marketDataApi.sanitizeMarketData(stored && stored.marketData);
        if (
          !stored ||
          stored.schemaVersion !== 1 ||
          !Number.isSafeInteger(fetchedAt) ||
          fetchedAt <= 0 ||
          timestamp <= 0 ||
          !Object.keys(marketData).length
        )
          return fallback;
        return { snapshot: { timestamp, marketData }, fetchedAt };
      } catch (_) {
        return fallback;
      }
    }

    function persistMarketSnapshot(snapshot, fetchedAt) {
      try {
        if (!storage || typeof storage.setItem !== "function") return false;
        const timestamp = marketDataApi.normalizeMarketTimestamp(snapshot && snapshot.timestamp);
        const marketData = marketDataApi.sanitizeMarketData(snapshot && snapshot.marketData);
        const normalizedFetchedAt = Number(fetchedAt);
        if (
          timestamp <= 0 ||
          !Object.keys(marketData).length ||
          !Number.isSafeInteger(normalizedFetchedAt) ||
          normalizedFetchedAt <= 0
        )
          return false;
        storage.setItem(
          config.MARKETPLACE_SNAPSHOT_STORAGE_KEY,
          JSON.stringify({ schemaVersion: 1, fetchedAt: normalizedFetchedAt, timestamp, marketData })
        );
        return true;
      } catch (_) {
        return false;
      }
    }

    function loadMarketplaceRequestState() {
      const forbiddenUntilByOrigin = Object.create(null);
      try {
        const raw = storage && storage.getItem(config.MARKETPLACE_REQUEST_STATE_STORAGE_KEY);
        if (!raw) return { forbiddenUntilByOrigin };
        const stored = JSON.parse(raw);
        if (!stored || stored.schemaVersion !== 1 || !stored.forbiddenUntilByOrigin) {
          return { forbiddenUntilByOrigin };
        }
        for (const origin of config.MARKETPLACE_SNAPSHOT_ORIGINS) {
          const forbiddenUntil = Number(stored.forbiddenUntilByOrigin[origin]);
          if (Number.isSafeInteger(forbiddenUntil) && forbiddenUntil > 0) {
            forbiddenUntilByOrigin[origin] = forbiddenUntil;
          }
        }
      } catch (_) {
        // Invalid request metadata should never block a new request.
      }
      return { forbiddenUntilByOrigin };
    }

    function persistMarketplaceRequestState(requestState) {
      try {
        if (!storage || typeof storage.setItem !== "function") return false;
        const forbiddenUntilByOrigin = Object.create(null);
        for (const origin of config.MARKETPLACE_SNAPSHOT_ORIGINS) {
          const forbiddenUntil = Number(
            requestState && requestState.forbiddenUntilByOrigin && requestState.forbiddenUntilByOrigin[origin]
          );
          if (Number.isSafeInteger(forbiddenUntil) && forbiddenUntil > 0) {
            forbiddenUntilByOrigin[origin] = forbiddenUntil;
          }
        }
        if (!Object.keys(forbiddenUntilByOrigin).length) {
          storage.removeItem(config.MARKETPLACE_REQUEST_STATE_STORAGE_KEY);
          return true;
        }
        storage.setItem(
          config.MARKETPLACE_REQUEST_STATE_STORAGE_KEY,
          JSON.stringify({ schemaVersion: 1, forbiddenUntilByOrigin })
        );
        return true;
      } catch (_) {
        return false;
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
      loadTrialHistory,
      loadTrialDisplay,
      saveTrialDisplay,
      saveTrialSnapshot,
      importTrialHistory,
      loadSavedPluginUiState,
      loadSavedGuildBuildingPlannerState,
      persistGuildBuildingPlannerState,
      persistPluginUiState,
      loadSavedLiveMarketData,
      persistLiveMarketData,
      loadSavedMarketSnapshot,
      persistMarketSnapshot,
      loadMarketplaceRequestState,
      persistMarketplaceRequestState,
      loadPriceReference,
      persistPriceReference
    };
  }

  return {
    normalizeSidebarDisplayName,
    normalizeTrialDisplay,
    normalizePanelView,
    normalizePanelOrder,
    normalizeGuildPointHistory,
    guildPointStateFromSnapshot,
    normalizeGuildShrineAutofillExcludedBuffHrids,
    createPluginStorage
  };
});
