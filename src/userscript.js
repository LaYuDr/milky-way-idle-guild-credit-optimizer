(function () {
  "use strict";

  const core = window.MwiGuildCreditCore;
  const marketDataApi = window.MwiGuildCreditMarketData;
  const itemNameCatalogApi = window.MwiGuildCreditItemNameCatalog;
  const releaseInfoApi = window.MwiGuildCreditReleaseInfo;
  const localizationApi = window.MwiGuildCreditLocalization;
  const buildingDataApi = window.MwiGuildBuildingData;
  const shrineGuideApi = window.MwiGuildCreditShrineGuide;
  const configApi = window.MwiGuildCreditConfig;
  const storageApi = window.MwiGuildCreditStorage;
  const schedulerApi = window.MwiGuildCreditScheduler;
  const gameStateApi = window.MwiGuildCreditGameState;
  const gameDataApi = window.MwiGuildCreditGameData;
  const domApi = window.MwiGuildCreditDom;
  const sidebarIntegrationApi = window.MwiGuildCreditSidebarIntegration;
  const sortableApi = window.MwiGuildCreditSortable;
  const stylesApi = window.MwiGuildCreditStyles;
  const constructionViewApi = window.MwiGuildCreditConstructionView;
  const upgradeViewApi = window.MwiGuildCreditUpgradeView;
  const settingsViewApi = window.MwiGuildCreditSettingsView;
  const shrineGuideUiApi = window.MwiGuildCreditShrineGuideUi;
  const exchangeAdvisorApi = window.MwiGuildCreditExchangeAdvisor;
  const panelShellApi = window.MwiGuildCreditPanelShell;
  const creditViewApi = window.MwiGuildCreditCreditView;
  if (
    !core ||
    !marketDataApi ||
    !itemNameCatalogApi ||
    !releaseInfoApi ||
    !localizationApi ||
    !buildingDataApi ||
    !shrineGuideApi ||
    !configApi ||
    !storageApi ||
    !schedulerApi ||
    !gameStateApi ||
    !gameDataApi ||
    !domApi ||
    !sidebarIntegrationApi ||
    !sortableApi ||
    !stylesApi ||
    !constructionViewApi ||
    !upgradeViewApi ||
    !settingsViewApi ||
    !shrineGuideUiApi ||
    !exchangeAdvisorApi ||
    !panelShellApi ||
    !creditViewApi
  )
    return;
  const pageWindow = typeof unsafeWindow === "undefined" ? window : unsafeWindow;
  const PLUGIN_VERSION = String(window.MwiGuildCreditVersion || "0.0.0");
  const {
    UPDATE_SOURCES,
    FALLBACK_INSTALL_URL,
    UPDATE_CHECK_TIMEOUT_MS,
    SHOW_ALL_CREDIT_TOKEN_TOGGLE,
    PRICE_REFERENCES,
    GUILD_TOKEN_BUDGET_SNAP_PERCENTAGES,
    GUILD_TOKEN_BUDGET_SNAP_THRESHOLD_PERCENTAGE,
    RENDERED_MARKUP_PROPERTY,
    PANEL_VIEWS,
    DEFAULT_PANEL_ORDER,
    CREDIT_TYPES,
    GUILD_TOKEN_CREDIT_CONVERSIONS,
    SELLER_TAX_RATE,
    GUILD_SHRINE_NAME_KEYS
  } = configApi;
  const pluginStorage = storageApi.createPluginStorage({
    storage: pageWindow.localStorage,
    location: pageWindow.location,
    config: configApi,
    buildingDataApi,
    marketDataApi
  });
  const savedUiState = pluginStorage.loadSavedPluginUiState();
  const savedBuildingPlannerState = pluginStorage.loadSavedGuildBuildingPlannerState();
  const savedMarketState = pluginStorage.loadSavedLiveMarketData();
  const savedMarketSnapshot = pluginStorage.loadSavedMarketSnapshot();
  const savedMarketplaceRequestState = pluginStorage.loadMarketplaceRequestState();
  const itemNameCatalog = itemNameCatalogApi.createItemNameCatalog({
    pageWindow,
    document,
    storage: pageWindow.localStorage,
    version: PLUGIN_VERSION
  });
  const updateChecker = releaseInfoApi.createVersionChecker({
    fetchImpl: pageWindow.fetch && pageWindow.fetch.bind(pageWindow),
    sources: UPDATE_SOURCES,
    timeoutMs: UPDATE_CHECK_TIMEOUT_MS,
    setTimeout: pageWindow.setTimeout && pageWindow.setTimeout.bind(pageWindow),
    clearTimeout: pageWindow.clearTimeout && pageWindow.clearTimeout.bind(pageWindow),
    AbortController: pageWindow.AbortController
  });
  const state = {
    itemDetails: null,
    conversionCache: new Map(),
    guildBuffDetails: null,
    guildBuffLevels: null,
    guildShrineLevels: null,
    guildShrineDetails: null,
    characterItems: null,
    characterItemsBridgeRevision: 0,
    guildBuffLevelsBridgeRevision: 0,
    detectedGameLocale: null,
    panelLocale: null,
    sidebarIntegrationObserver: null,
    upgradePlans: savedUiState.upgradePlans.map((plan, index) => ({ id: `plan-${index + 1}`, ...plan })),
    nextUpgradePlanId: savedUiState.upgradePlans.length + 1,
    upgradePresetNotice: "",
    guildTokenCreditHrids: new Set(savedUiState.guildTokenCreditHrids),
    autoGuildTokenBudget: savedUiState.autoGuildTokenBudget,
    shrineGuideEnabled: savedUiState.shrineGuideEnabled,
    maxConversionItemUnitPrice: savedUiState.maxConversionItemUnitPrice,
    guildShrineAutofillExcludedBuffHrids: new Set(savedUiState.guildShrineAutofillExcludedBuffHrids),
    showConstructionView: savedUiState.showConstructionView,
    settingsOpen: false,
    shrineGuideContext: null,
    shrineGuideModel: null,
    shrineGuideFrame: null,
    shrineGuideObserver: null,
    shrineGuideObservedNodes: new Set(),
    shrineGuideDocumentListenersInstalled: false,
    shrineGuideDocumentHandlers: null,
    snapshot: savedMarketSnapshot.snapshot,
    snapshotTimestamp: marketDataApi.normalizeMarketTimestamp(savedMarketSnapshot.snapshot?.timestamp),
    snapshotFetchedAt: savedMarketSnapshot.fetchedAt,
    marketSnapshotForbiddenUntilByOrigin: savedMarketplaceRequestState.forbiddenUntilByOrigin,
    marketSnapshotFallbackActive: false,
    marketSnapshotCandidateSignature: "",
    marketSnapshotCandidateTimestamp: 0,
    marketSnapshotCandidateConfirmations: 0,
    marketLiveData: savedMarketState.liveData,
    marketLiveRevision: savedMarketState.revision,
    marketBridgeRevision: 0,
    marketUpdateSignatures: Object.create(null),
    priceReference: pluginStorage.loadPriceReference(),
    targetCredit: savedUiState.targetCredit,
    activeView: savedUiState.activeView,
    panelOrder: savedUiState.panelOrder,
    panel: null,
    creditTab: null,
    hiddenSidebarNodes: [],
    refreshTimer: null,
    refreshInFlight: false,
    refreshQueued: false,
    panelSearchTimer: null,
    collapsedCreditSections: new Set(savedUiState.collapsedCreditSections),
    guildTokenValuesCollapsed: savedUiState.guildTokenValuesCollapsed,
    upgradeRefreshId: 0,
    exchangeAdvisorUi: null,
    exchangeAdvisorRootObserver: null,
    exchangeAdvisorModalObserver: null,
    exchangeAdvisorObservedModal: null,
    exchangeAdvisorListenersInstalled: false,
    exchangeAdvisorRepositionHandler: null,
    exchangeAdvisorLoadInFlight: false,
    exchangeAdvisorSnapshotFailed: false
  };
  state.guildBuildingLevels = null;
  state.guildBuildingLevelsComplete = false;
  state.guildBuildingDetails = null;
  state.buildingPlans = savedBuildingPlannerState.plans.map((plan, index) => ({
    id: `building-plan-${index + 1}`,
    ...plan
  }));
  state.nextBuildingPlanId = state.buildingPlans.length + 1;
  state.manualGuildPoints = savedBuildingPlannerState.manualGuildPoints;
  state.buildingCategory = savedBuildingPlannerState.category;
  state.buildingSearch = "";
  state.buildingPlanNotice = "";
  let guildBuildingSpriteHref = "";
  let guildBuildingSpriteLoadPromise = null;
  const gameState = gameStateApi.createGameStateAdapter(state);
  const { guildShrineLevelRecordKey } = gameStateApi;
  const {
    setItemDetails,
    setGuildBuffDetails,
    setCharacterItems,
    setGuildBuffLevelsFrom,
    setGuildShrineLevelsFrom,
    setGuildShrineDetailsFrom,
    setGuildBuildingLevelsFrom,
    seedCompleteGuildBuildingLevelsFrom,
    setGuildBuildingDetailsFrom
  } = gameState;
  const updateRenderedMarkup = (element, markup) =>
    domApi.updateRenderedMarkup(element, markup, RENDERED_MARKUP_PROPERTY);
  const escapeHtml = domApi.escapeHtml;
  const itemHridFromIcon = domApi.itemHridFromIcon;
  const enhancementLevelFromIcon = domApi.enhancementLevelFromIcon;

  const guildTokenBudgetRefreshTask = schedulerApi.createDebouncedTask({
    task: (panel) => refreshGuildUpgrade(panel),
    delay: 80,
    setTimer: window.setTimeout.bind(window),
    clearTimer: window.clearTimeout.bind(window)
  });
  const marketDataRefreshTask = schedulerApi.createDebouncedTask({
    task: () => {
      if (state.panel && state.panel.isConnected && !state.panel.hidden) {
        if (state.panel.dataset.activeView === "upgrade") refreshGuildUpgrade(state.panel);
        else refreshPanel(state.panel);
      }
      scheduleGuildExchangeAdvisor(true);
    },
    delay: 120,
    setTimer: window.setTimeout.bind(window),
    clearTimer: window.clearTimeout.bind(window)
  });
  const inventoryDataRefreshTask = schedulerApi.createDebouncedTask({
    task: () => {
      if (
        state.panel &&
        state.panel.isConnected &&
        !state.panel.hidden &&
        state.panel.dataset.activeView === "upgrade"
      ) {
        refreshGuildUpgrade(state.panel);
      }
      scheduleGuildExchangeAdvisor(true);
      scheduleShrineGuide();
    },
    delay: 120,
    setTimer: window.setTimeout.bind(window),
    clearTimer: window.clearTimeout.bind(window)
  });
  const guildDataRefreshTask = schedulerApi.createDebouncedTask({
    task: () => {
      if (state.panel && state.panel.isConnected && state.panel.dataset.activeView === "upgrade")
        refreshGuildUpgrade(state.panel);
      else if (state.panel && state.panel.isConnected && state.panel.dataset.activeView === "construction")
        refreshGuildConstruction(state.panel);
      else scheduleShrineGuide();
      if (state.panel && state.panel.isConnected && state.settingsOpen) refreshSettings(state.panel);
    },
    delay: 120,
    setTimer: window.setTimeout.bind(window),
    clearTimer: window.clearTimeout.bind(window)
  });
  const sidebarIntegrationTask = schedulerApi.createDebouncedTask({
    task: () => ensureSidebarIntegration(),
    delay: 75,
    setTimer: window.setTimeout.bind(window),
    clearTimer: window.clearTimeout.bind(window)
  });
  const requestAdvisorFrame =
    typeof window.requestAnimationFrame === "function"
      ? window.requestAnimationFrame.bind(window)
      : (handler) => window.setTimeout(handler, 0);
  const cancelAdvisorFrame =
    typeof window.cancelAnimationFrame === "function"
      ? window.cancelAnimationFrame.bind(window)
      : window.clearTimeout.bind(window);
  const exchangeAdvisorFrameTask = schedulerApi.createFrameTask({
    task: (forceRender) => refreshGuildExchangeAdvisor(Boolean(forceRender)),
    requestFrame: requestAdvisorFrame,
    cancelFrame: cancelAdvisorFrame,
    merge: (current, next) => Boolean(current || next)
  });

  function normalizePanelView(view) {
    return storageApi.normalizePanelView(view, PANEL_VIEWS);
  }

  function persistGuildBuildingPlannerState() {
    pluginStorage.persistGuildBuildingPlannerState(state);
  }

  function persistPluginUiState() {
    return pluginStorage.persistPluginUiState(state);
  }

  function persistLiveMarketData() {
    pluginStorage.persistLiveMarketData(state.marketLiveData, state.marketLiveRevision);
  }

  function setPriceReference(reference) {
    if (!PRICE_REFERENCES[reference]) return;
    state.priceReference = reference;
    pluginStorage.persistPriceReference(reference);
  }

  function ui() {
    return localizationApi.createLocalizer(currentGameLocale());
  }

  function t(key, values) {
    return ui().t(key, values);
  }

  function itemQuantity(value) {
    return ui().quantity("itemQuantity", value);
  }

  function creditQuantity(value) {
    return ui().quantity("creditQuantity", value);
  }

  function priceReference(reference) {
    const suffix = reference === "b" ? "B" : "A";
    return { label: t(`priceReference${suffix}`), title: t(`priceReference${suffix}Title`) };
  }

  function simpleItemName(itemHrid) {
    return String(itemHrid || t("unknownItem"))
      .split("/")
      .pop()
      .replaceAll("_", " ");
  }

  function titleCase(value) {
    return String(value || "").replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function currentGameLocale() {
    const candidates = [state.detectedGameLocale];
    try {
      candidates.push(
        pageWindow.i18next && pageWindow.i18next.resolvedLanguage,
        pageWindow.i18next && pageWindow.i18next.language,
        pageWindow.i18n && pageWindow.i18n.resolvedLanguage,
        pageWindow.i18n && pageWindow.i18n.language,
        pageWindow.localStorage && pageWindow.localStorage.getItem("i18nextLng")
      );
    } catch (_) {}
    candidates.push(document.documentElement.lang);
    return localizationApi.resolveLocaleCandidates(candidates, "zh-CN");
  }

  function refreshOfficialItemNameCatalog(force, requiredItemHrids) {
    return itemNameCatalog.refreshIfDue({
      force: force === true,
      requiredItemHrids: Array.isArray(requiredItemHrids) ? requiredItemHrids : []
    }).changed;
  }

  // This is the sole item-name resolver used by the UI. Official game names
  // remain authoritative; stable guild currencies have a bundled localized
  // fallback for environments where the game's i18n catalog is unavailable.
  function resolveItemName(itemHrid, englishFallback) {
    const localizer = ui();
    if (localizer.locale === "zh-CN") refreshOfficialItemNameCatalog(false, [itemHrid]);
    return itemNameCatalog.resolveItemName({
      itemHrid,
      englishFallback: localizer.itemName(itemHrid) || englishFallback,
      locale: localizer.locale
    });
  }

  // The game persists initClientData with LZString.compressToUTF16. Reading it
  // avoids depending on the timing of the one-time WebSocket initialization.
  const gameData = gameDataApi.createGameData({
    state,
    pageWindow,
    document,
    marketDataApi,
    core,
    setItemDetails,
    setGuildBuffDetails,
    setCharacterItems,
    setGuildBuffLevelsFrom,
    setGuildShrineLevelsFrom,
    setGuildShrineDetailsFrom,
    setGuildBuildingLevelsFrom,
    seedCompleteGuildBuildingLevelsFrom,
    setGuildBuildingDetailsFrom,
    persistLiveMarketData,
    pluginStorage,
    config: configApi,
    scheduleMarketDataRefresh,
    scheduleInventoryDataRefresh,
    scheduleGuildDataRefresh,
    resolveItemName,
    CREDIT_TYPES,
    fetchImpl: pageWindow.fetch && pageWindow.fetch.bind(pageWindow)
  });
  const {
    hydrateLocalInitData,
    extractItemDetailsFromReact,
    hydrateBridgeData,
    loadSnapshot,
    snapshotOrderBook,
    snapshotPrice,
    snapshotImmediateSellPrice,
    allConversions,
    creditConversionGroups
  } = gameData;

  function itemSpriteHref(itemHrid) {
    const spriteUse = document.querySelector('use[href*="items_sprite"]');
    const href = spriteUse && spriteUse.getAttribute("href");
    if (!href || !href.includes("#")) return "";
    return `${href.slice(0, href.indexOf("#"))}#${String(itemHrid || "")
      .split("/")
      .pop()}`;
  }

  function iconMarkup(itemHrid, label) {
    const href = itemSpriteHref(itemHrid);
    if (!href) return '<span class="mwi-item-icon mwi-item-icon-fallback" aria-hidden="true"></span>';
    return `<svg class="mwi-item-icon" role="img" aria-label="${escapeHtml(label)}"><use href="${escapeHtml(href)}"></use></svg>`;
  }

  function guildBuildingSpriteBaseHref() {
    if (guildBuildingSpriteHref) return guildBuildingSpriteHref;
    const discovered = domApi.findSpriteBaseHref(document, "misc_sprite");
    if (discovered) {
      guildBuildingSpriteHref = discovered;
      return guildBuildingSpriteHref;
    }
    void loadGuildBuildingSpriteBaseHref();
    return "";
  }

  function loadGuildBuildingSpriteBaseHref() {
    if (guildBuildingSpriteHref) return Promise.resolve(guildBuildingSpriteHref);
    if (guildBuildingSpriteLoadPromise) return guildBuildingSpriteLoadPromise;
    const fetchImpl = pageWindow.fetch && pageWindow.fetch.bind(pageWindow);
    if (!fetchImpl || !pageWindow.location || !pageWindow.location.origin) return Promise.resolve("");
    const manifestUrl = new URL("/asset-manifest.json", pageWindow.location.origin).href;
    guildBuildingSpriteLoadPromise = fetchImpl(manifestUrl, { cache: "force-cache" })
      .then((response) => {
        if (!response || !response.ok) throw new Error("asset manifest unavailable");
        return response.json();
      })
      .then((manifest) => {
        const reference = domApi.spriteBaseFromAssetManifest(manifest, "misc_sprite");
        if (!reference) throw new Error("misc sprite unavailable");
        guildBuildingSpriteHref = new URL(reference, pageWindow.location.origin).href;
        if (
          state.panel &&
          state.panel.isConnected &&
          !state.panel.hidden &&
          state.panel.dataset.activeView === "construction"
        )
          refreshGuildConstruction(state.panel);
        return guildBuildingSpriteHref;
      })
      .catch(() => "");
    return guildBuildingSpriteLoadPromise;
  }

  function guildBuildingIconMarkup(definition, spriteBaseHref) {
    const symbolId = definition && (definition.iconSymbolId || buildingDataApi.iconSymbolId(definition.hrid));
    if (!spriteBaseHref || !symbolId)
      return '<span class="mwi-building-icon mwi-building-icon-fallback" aria-hidden="true"><svg viewBox="0 0 50 50" focusable="false"><path d="M7 43V20l18-12 18 12v23H7Z"></path><path d="M17 43V28h16v15M4 43h42"></path></svg></span>';
    const href = `${spriteBaseHref}#${symbolId}`;
    return `<span class="mwi-building-icon" data-icon-source="game"><svg aria-hidden="true" focusable="false" viewBox="0 0 50 50" width="100%" height="100%"><use href="${escapeHtml(href)}" width="50" height="50"></use></svg></span>`;
  }

  function marketItemIconMarkup(itemHrid, label, className = "") {
    const marketLabel = t("marketItem", { item: label });
    return `<button class="mwi-market-item-link ${escapeHtml(className)}" data-role="market-item-link" data-item-hrid="${escapeHtml(itemHrid)}" data-item-name="${escapeHtml(label)}" type="button" title="${escapeHtml(marketLabel)}" aria-label="${escapeHtml(marketLabel)}">${iconMarkup(itemHrid, label)}</button>`;
  }

  function marketplaceSearchInput() {
    return (
      Array.from(document.querySelectorAll("input")).find((input) => {
        if (input.closest("#mwi-credit-optimizer")) return false;
        const text =
          `${input.getAttribute("placeholder") || ""} ${input.getAttribute("aria-label") || ""}`.toLowerCase();
        return text.includes("物品搜索") || text.includes("search") || text.includes("item");
      }) || null
    );
  }

  function openMarketplaceFallback(itemHrid, itemName) {
    const searchText = resolveItemName(itemHrid, itemName);
    const navigate = Array.from(document.querySelectorAll("button,[role='button'],a,div")).find((element) => {
      if (element.closest("#mwi-credit-optimizer")) return false;
      return ["市场", "Marketplace", "Market"].includes(String(element.textContent || "").trim());
    });
    if (navigate) navigate.click();
    let attempts = 0;
    const search = () => {
      const input = marketplaceSearchInput();
      if (!input && attempts++ < 20) {
        window.setTimeout(search, 80);
        return;
      }
      if (!input) return;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
      if (setter && setter.set) setter.set.call(input, searchText);
      else input.value = searchText;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      input.focus();
    };
    window.setTimeout(search, navigate ? 80 : 0);
  }

  function openMarketplaceForItem(itemHrid, itemName) {
    const bridge = window.__mwiGuildCreditBridge;
    try {
      // Our recommendation rows are unenhanced materials. Mirror the native
      // inventory action by explicitly using level 0 instead of leaving the
      // market order-book selection undefined.
      if (bridge && typeof bridge.goToMarketplace === "function" && bridge.goToMarketplace(itemHrid, 0)) return;
    } catch (_) {
      // Fall through to the compatibility path if the game changes its React internals.
    }
    openMarketplaceFallback(itemHrid, itemName);
  }

  function formatNumber(value, digits) {
    if (value === null || value === undefined || !Number.isFinite(value)) return "-";
    return ui().number(value, digits);
  }

  async function checkPluginUpdate(panel) {
    const status = panel.querySelector('[data-role="version-status"]');
    if (!status) return;
    status.textContent = t("updateChecking", { current: PLUGIN_VERSION });
    try {
      const { latestVersion, installUrl } = await updateChecker.latestRelease();
      if (core.compareVersions(PLUGIN_VERSION, latestVersion) < 0) {
        status.classList.add("mwi-update-available");
        status.replaceChildren(t("updateAvailable", { current: PLUGIN_VERSION, latest: latestVersion }));
        const updateLink = document.createElement("a");
        updateLink.className = "mwi-update-link";
        updateLink.href = installUrl;
        updateLink.target = "_blank";
        updateLink.rel = "noopener noreferrer";
        updateLink.textContent = t("updateNow");
        status.append(" · ", updateLink);
      } else {
        status.classList.remove("mwi-update-available");
        status.textContent = t("updateLatest", { current: PLUGIN_VERSION, latest: latestVersion });
      }
    } catch (_) {
      status.classList.remove("mwi-update-available");
      status.textContent = t("updateUnavailable", { current: PLUGIN_VERSION });
    }
  }

  const upgradeView = upgradeViewApi.createUpgradeView({
    core,
    state,
    t,
    ui,
    escapeHtml,
    resolveItemName,
    simpleItemName,
    titleCase,
    formatNumber,
    iconMarkup,
    marketItemIconMarkup,
    itemQuantity,
    creditQuantity,
    snapshotOrderBook,
    allConversions,
    CREDIT_TYPES,
    GUILD_TOKEN_CREDIT_CONVERSIONS,
    GUILD_TOKEN_BUDGET_SNAP_PERCENTAGES,
    GUILD_TOKEN_BUDGET_SNAP_THRESHOLD_PERCENTAGE,
    GUILD_SHRINE_NAME_KEYS,
    SHOW_ALL_CREDIT_TOKEN_TOGGLE,
    guildShrineLevelRecordKey,
    persistPluginUiState,
    updateRenderedMarkup,
    hydrateBridgeData,
    extractItemDetailsFromReact,
    hydrateLocalInitData,
    loadSnapshot,
    refreshOfficialItemNameCatalog,
    scheduleShrineGuide: (...args) => scheduleShrineGuide(...args),
    scheduleGuildExchangeAdvisor: (...args) => scheduleGuildExchangeAdvisor(...args),
    guildTokenBudgetRefreshTask
  });
  const {
    guildBuffEntries,
    guildBuffLabel,
    itemNameForMaterial,
    currentGuildBuffLevel,
    shrineLevelValue,
    shrineIdentityValues,
    applyGuildShrineTargets,
    addGuildUpgradePlan,
    clearGuildUpgradePlans,
    removeGuildUpgradePlan,
    guildTokenCreditSelectionState,
    updateGuildTokenCreditPlanButton,
    renderGuildTokenCreditPlanToggle,
    renderGuildTokenBudgetControl,
    setGuildTokenBudget,
    refreshGuildUpgrade
  } = upgradeView;

  const settingsView = settingsViewApi.createSettingsView({
    state,
    t,
    ui,
    escapeHtml,
    guildBuffEntries,
    guildBuffLabel,
    updateRenderedMarkup
  });
  const { renderSettingsMarkup, refreshSettings } = settingsView;

  const constructionView = constructionViewApi.createConstructionView({
    state,
    buildingDataApi,
    t,
    ui,
    core,
    escapeHtml,
    formatNumber,
    titleCase,
    simpleItemName,
    shrineIdentityValues,
    shrineLevelValue,
    guildBuildingSpriteBaseHref,
    guildBuildingIconMarkup,
    updateRenderedMarkup,
    persistGuildBuildingPlannerState,
    hydrateBridgeData,
    extractItemDetailsFromReact,
    hydrateLocalInitData,
    pageWindow,
    document,
    URL,
    Blob
  });
  const {
    guildBuildingDefinitions,
    addGuildBuildingPlan,
    setGuildBuildingTarget,
    removeGuildBuildingPlan,
    moveGuildBuildingPlan,
    reorderGuildBuildingPlan,
    setGuildBuildingPickerOpen,
    setPendingGuildBuildingStartValue,
    clearPendingGuildBuilding,
    toggleGuildBuildingSteps,
    clearGuildBuildingPlans,
    undoClearGuildBuildingPlans,
    hasGuildBuildingClearUndo,
    applyGuildBuildingFilters,
    refreshGuildConstructionBudgetPreview,
    refreshGuildConstruction,
    copyGuildConstructionPlan,
    exportGuildConstructionCsv,
    dispose: disposeConstructionView
  } = constructionView;

  const shrineGuideUi = shrineGuideUiApi.createShrineGuideUi({
    state,
    document,
    window,
    stylesApi,
    t,
    ui,
    formatNumber,
    itemNameForMaterial,
    CREDIT_TYPES,
    shrineGuideApi,
    refreshGuildUpgrade,
    persistPluginUiState,
    scheduleGuildExchangeAdvisor: (...args) => scheduleGuildExchangeAdvisor(...args),
    guildExchangeMutationObserver: (...args) => guildExchangeMutationObserver(...args),
    findGuildExchangeModal: (...args) => findGuildExchangeModal(...args)
  });
  const { scheduleShrineGuide, startShrineGuideObserver, stopShrineGuideObserver, setShrineGuideEnabled } =
    shrineGuideUi;

  const panelShell = panelShellApi.createPanelShell({
    state,
    document,
    stylesApi,
    sortableApi,
    t,
    escapeHtml,
    PANEL_VIEWS,
    DEFAULT_PANEL_ORDER,
    CREDIT_TYPES,
    FALLBACK_INSTALL_URL,
    priceReference,
    normalizePanelView,
    persistPluginUiState,
    checkPluginUpdate,
    refreshPanel: (...args) => refreshPanel(...args),
    refreshGuildUpgrade,
    refreshGuildConstruction,
    refreshGuildExchangeAdvisor: (...args) => refreshGuildExchangeAdvisor(...args),
    renderSettingsMarkup,
    refreshSettings,
    renderGuildTokenCreditPlanToggle,
    renderGuildTokenBudgetControl,
    updateGuildTokenCreditPlanButton,
    setGuildTokenBudget,
    setShrineGuideEnabled,
    guildBuffEntries,
    currentGuildBuffLevel,
    applyGuildShrineTargets,
    addGuildUpgradePlan,
    clearGuildUpgradePlans,
    removeGuildUpgradePlan,
    guildTokenCreditSelectionState,
    guildBuildingDefinitions,
    addGuildBuildingPlan,
    setGuildBuildingTarget,
    removeGuildBuildingPlan,
    moveGuildBuildingPlan,
    reorderGuildBuildingPlan,
    setGuildBuildingPickerOpen,
    setPendingGuildBuildingStartValue,
    clearPendingGuildBuilding,
    toggleGuildBuildingSteps,
    clearGuildBuildingPlans,
    undoClearGuildBuildingPlans,
    hasGuildBuildingClearUndo,
    applyGuildBuildingFilters,
    refreshGuildConstructionBudgetPreview,
    copyGuildConstructionPlan,
    exportGuildConstructionCsv,
    persistGuildBuildingPlannerState,
    setPriceReference,
    openMarketplaceForItem
  });
  const { createPanel, recreatePanel, dispose: disposePanelShell } = panelShell;

  const creditView = creditViewApi.createCreditView({
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
  });
  const { refreshPanel } = creditView;

  function scheduleMarketDataRefresh() {
    marketDataRefreshTask.schedule();
  }

  function scheduleInventoryDataRefresh() {
    inventoryDataRefreshTask.schedule();
  }

  function scheduleGuildDataRefresh() {
    guildDataRefreshTask.schedule();
  }

  const exchangeAdvisor = exchangeAdvisorApi.createExchangeAdvisor({
    state,
    document,
    window,
    pageWindow,
    stylesApi,
    CREDIT_TYPES,
    SELLER_TAX_RATE,
    t,
    escapeHtml,
    formatNumber,
    itemNameForMaterial,
    itemHridFromIcon,
    enhancementLevelFromIcon,
    itemQuantity,
    creditQuantity,
    iconMarkup,
    priceReference,
    core,
    loadSnapshot,
    snapshotOrderBook,
    snapshotImmediateSellPrice,
    snapshotPrice,
    allConversions,
    exchangeAdvisorFrameTask
  });
  const {
    findGuildExchangeModal,
    refreshGuildExchangeAdvisor,
    scheduleGuildExchangeAdvisor,
    guildExchangeMutationObserver,
    startGuildExchangeAdvisor
  } = exchangeAdvisor;

  function findSidebarTabBar() {
    return sidebarIntegrationApi.findSidebarIntegration(document, currentGameLocale());
  }

  function hideCreditPanel() {
    if (state.panel) state.panel.hidden = true;
    if (state.creditTab) {
      state.creditTab.classList.remove("Mui-selected");
      state.creditTab.setAttribute("aria-selected", "false");
    }
    for (const node of state.hiddenSidebarNodes) {
      if (!node.isConnected) continue;
      node.style.display = node.dataset.mwiCreditPreviousDisplay || "";
      delete node.dataset.mwiCreditPreviousDisplay;
    }
    state.hiddenSidebarNodes = [];
  }
  const sidebarActivationCoordinator = sidebarIntegrationApi.createDocumentActivationCoordinator(
    window,
    "mwi-guild-credit-optimizer",
    hideCreditPanel
  );

  function activateCreditTabFromPointer(event) {
    const creditTab = state.creditTab;
    if (!creditTab || !creditTab.isConnected) return false;
    const rawTarget = event.target;
    const target = rawTarget && rawTarget.nodeType === 1 ? rawTarget : rawTarget && rawTarget.parentElement;
    if (!target || !creditTab.contains(target)) return false;
    const integration = sidebarIntegrationApi.integrationForCustomTab(creditTab);
    if (!integration) return false;
    const { tabBar, panelHost } = integration;
    event.preventDefault();
    event.stopImmediatePropagation();
    showCreditPanel(panelHost, tabBar);
    return true;
  }

  function showCreditPanel(panelHost, tabBar) {
    if (!state.panel || !state.panel.isConnected) return;
    sidebarActivationCoordinator.announce();
    hideCreditPanel();
    state.hiddenSidebarNodes = Array.from(panelHost.children).filter((node) => node !== state.panel);
    for (const node of state.hiddenSidebarNodes) {
      node.dataset.mwiCreditPreviousDisplay = node.style.display;
      node.style.display = "none";
    }
    state.panel.hidden = false;
    for (const tab of tabBar.children) {
      tab.classList.remove("Mui-selected");
      tab.setAttribute("aria-selected", "false");
    }
    state.creditTab.classList.add("Mui-selected");
    state.creditTab.setAttribute("aria-selected", "true");
    hydrateBridgeData();
    extractItemDetailsFromReact();
    hydrateLocalInitData();
    refreshActivePanel(state.panel);
  }

  function refreshActivePanel(panel) {
    if (state.settingsOpen) refreshSettings(panel);
    if (panel.dataset.activeView === "upgrade") refreshGuildUpgrade(panel);
    else if (panel.dataset.activeView === "construction") refreshGuildConstruction(panel);
    else refreshPanel(panel);
  }

  function ensureSidebarIntegration() {
    const itemNamesChanged = refreshOfficialItemNameCatalog();
    const integration = findSidebarTabBar();
    if (!integration || !integration.panelHost) return false;
    const { tabBar, tabPrototype, panelHost } = integration;
    if (integration.detectedLocale) state.detectedGameLocale = integration.detectedLocale;
    const locale = currentGameLocale();
    const localeChanged = Boolean(state.panel && state.panelLocale && state.panelLocale !== locale);
    const currentIntegrationMatches = Boolean(
      state.panel &&
      state.panel.isConnected &&
      state.panel.parentElement === panelHost &&
      state.creditTab &&
      state.creditTab.isConnected &&
      state.creditTab.parentElement === tabBar
    );
    if (currentIntegrationMatches && !localeChanged) {
      if (itemNamesChanged && !state.panel.hidden) refreshActivePanel(state.panel);
      stopSidebarIntegrationObserver();
      return true;
    }

    const keepPanelOpen = Boolean(
      state.panel && !state.panel.hidden && state.creditTab && state.creditTab.getAttribute("aria-selected") === "true"
    );
    const replacementPanel =
      localeChanged && state.panel && state.panel.isConnected ? recreatePanel(state.panel) : null;
    hideCreditPanel();
    if (state.creditTab && state.creditTab.isConnected) state.creditTab.remove();
    const existingTab = tabBar.querySelector('[data-mwi-credit-tab="true"]');
    if (existingTab) existingTab.remove();

    if (replacementPanel) state.panel = replacementPanel;
    else if (state.panel && !state.panel.isConnected) state.panel = null;
    state.creditTab = null;

    const creditTab = tabPrototype.cloneNode(true);
    creditTab.dataset.mwiCreditTab = "true";
    creditTab.classList.remove("Mui-selected");
    creditTab.removeAttribute("id");
    creditTab.removeAttribute("disabled");
    creditTab.removeAttribute("aria-disabled");
    creditTab.setAttribute("aria-selected", "false");
    creditTab.setAttribute("role", "tab");
    if ("disabled" in creditTab) creditTab.disabled = false;
    creditTab.replaceChildren(document.createTextNode(t("sidebarCredit")));
    const activateCreditTab = (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      showCreditPanel(panelHost, tabBar);
    };
    creditTab.addEventListener("pointerdown", activateCreditTab, true);
    creditTab.addEventListener("click", activateCreditTab, true);
    tabBar.append(creditTab);

    const panel = state.panel || createPanel();
    panel.hidden = true;
    panelHost.append(panel);
    if (tabBar.dataset.mwiCreditNativeTabListener !== "true") {
      tabBar.dataset.mwiCreditNativeTabListener = "true";
      tabBar.addEventListener("click", (event) => {
        if (!state.creditTab || state.creditTab.parentElement !== tabBar || !state.creditTab.contains(event.target))
          hideCreditPanel();
      });
    }
    state.panel = panel;
    state.panelLocale = locale;
    state.creditTab = creditTab;
    if (state.shrineGuideEnabled) {
      startShrineGuideObserver();
      refreshGuildUpgrade(panel);
    } else {
      scheduleShrineGuide();
    }
    if (keepPanelOpen) showCreditPanel(panelHost, tabBar);
    stopSidebarIntegrationObserver();
    return true;
  }

  function scheduleSidebarIntegration() {
    sidebarIntegrationTask.schedule();
  }

  function sidebarIntegrationMounted() {
    return Boolean(state.panel && state.panel.isConnected && state.creditTab && state.creditTab.isConnected);
  }

  function stopSidebarIntegrationObserver() {
    if (!state.sidebarIntegrationObserver) return;
    state.sidebarIntegrationObserver.disconnect();
    state.sidebarIntegrationObserver = null;
  }

  function watchForSidebarIntegration() {
    if (sidebarIntegrationMounted() || state.sidebarIntegrationObserver || typeof MutationObserver !== "function")
      return;
    const target = document.documentElement || document;
    state.sidebarIntegrationObserver = new MutationObserver(() => {
      if (sidebarIntegrationMounted()) {
        stopSidebarIntegrationObserver();
        return;
      }
      if (!sidebarIntegrationTask.pending()) scheduleSidebarIntegration();
    });
    state.sidebarIntegrationObserver.observe(target, { childList: true, subtree: true });
  }

  function bootstrapSidebarIntegration() {
    if (!ensureSidebarIntegration()) watchForSidebarIntegration();
  }

  function exchangeModalInteractionHandler(event) {
    const target = event.target && (event.target.nodeType === 1 ? event.target : event.target.parentElement);
    if (target && target.closest && target.closest('[class*="GuildPanel_exchangeModalContent"]'))
      scheduleGuildExchangeAdvisor();
  }

  function disposeRuntime() {
    disposePanelShell();
    disposeConstructionView();
    guildTokenBudgetRefreshTask.dispose();
    marketDataRefreshTask.dispose();
    inventoryDataRefreshTask.dispose();
    guildDataRefreshTask.dispose();
    sidebarIntegrationTask.dispose();
    sidebarActivationCoordinator.destroy();
    exchangeAdvisorFrameTask.dispose();
    stopSidebarIntegrationObserver();
    window.clearTimeout(state.refreshTimer);
    window.clearInterval(state.panelSearchTimer);
    stopShrineGuideObserver();
    if (state.exchangeAdvisorRootObserver) state.exchangeAdvisorRootObserver.disconnect();
    if (state.exchangeAdvisorModalObserver) state.exchangeAdvisorModalObserver.disconnect();
    if (state.exchangeAdvisorRepositionHandler) {
      const reposition = state.exchangeAdvisorRepositionHandler;
      window.removeEventListener("resize", reposition);
      window.removeEventListener("orientationchange", reposition);
      window.removeEventListener("scroll", reposition, true);
    }
    document.removeEventListener("pointerdown", activateCreditTabFromPointer, true);
    document.removeEventListener("click", activateCreditTabFromPointer, true);
    document.removeEventListener("input", exchangeModalInteractionHandler, true);
    document.removeEventListener("click", exchangeModalInteractionHandler, true);
    window.removeEventListener("resize", scheduleSidebarIntegration);
    window.removeEventListener("orientationchange", scheduleSidebarIntegration);
  }

  hydrateBridgeData();
  extractItemDetailsFromReact();
  hydrateLocalInitData();
  document.addEventListener("pointerdown", activateCreditTabFromPointer, true);
  document.addEventListener("click", activateCreditTabFromPointer, true);
  document.addEventListener("input", exchangeModalInteractionHandler, true);
  document.addEventListener("click", exchangeModalInteractionHandler, true);
  state.panelSearchTimer = window.setInterval(bootstrapSidebarIntegration, 3000);
  window.addEventListener("resize", scheduleSidebarIntegration, { passive: true });
  window.addEventListener("orientationchange", scheduleSidebarIntegration, { passive: true });
  window.addEventListener("pagehide", disposeRuntime, { once: true });
  if (document.body) startGuildExchangeAdvisor();
  else document.addEventListener("DOMContentLoaded", startGuildExchangeAdvisor, { once: true });
  bootstrapSidebarIntegration();
})();
