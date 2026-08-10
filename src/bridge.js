(function () {
  "use strict";

  const page = typeof unsafeWindow === "undefined" ? window : unsafeWindow;
  const marketDataApi = page.MwiGuildCreditMarketData || window.MwiGuildCreditMarketData;
  const marketDomApi = page.MwiGuildCreditMarketDom || window.MwiGuildCreditMarketDom;
  const bridge =
    window.__mwiGuildCreditBridge ||
    (window.__mwiGuildCreditBridge = {
      messages: [],
      itemDetails: null,
      guildBuffDetails: null,
      guildBuffLevels: null,
      guildShrineLevels: null,
      guildShrineDetails: null,
      guildBuildingLevels: null,
      guildBuildingDetails: null,
      characterItems: null,
      characterItemsRevision: 0,
      guildBuffLevelsRevision: 0,
      marketOrderBooks: Object.create(null),
      marketOrderBookRevision: 0
    });
  if (!("guildBuildingLevels" in bridge)) bridge.guildBuildingLevels = null;
  if (!("guildBuildingDetails" in bridge)) bridge.guildBuildingDetails = null;
  if (!bridge.marketOrderBooks || typeof bridge.marketOrderBooks !== "object")
    bridge.marketOrderBooks = Object.create(null);
  if (!Number.isSafeInteger(bridge.marketOrderBookRevision)) bridge.marketOrderBookRevision = 0;
  if (!Number.isSafeInteger(bridge.characterItemsRevision)) bridge.characterItemsRevision = 0;
  if (!Number.isSafeInteger(bridge.guildBuffLevelsRevision)) bridge.guildBuffLevelsRevision = 0;
  if (bridge.marketObserverActive !== true) bridge.marketObserverActive = false;
  const SOCKET_MESSAGE_EVENT = "__mwiGuildCreditSocketMessageV1";
  const SOCKET_READY_EVENT = "__mwiGuildCreditSocketReadyV1";
  const DIAGNOSTICS_ATTRIBUTE = "data-mwi-credit-bridge-diagnostics";
  const diagnostics =
    bridge.diagnostics && typeof bridge.diagnostics === "object"
      ? bridge.diagnostics
      : (bridge.diagnostics = {
          scriptStartedAt: Date.now(),
          injectionAttempted: false,
          injectionReady: false,
          installMode: "initializing",
          observerActive: false,
          messageCount: 0,
          lastMessageAt: 0,
          lastMessageType: "",
          lastCharacterItemsUpdatedAt: 0,
          lastCharacterItemsSource: "",
          lastGuildBuffLevelsUpdatedAt: 0,
          lastMarketItemHrid: "",
          lastMarketLevels: null,
          lastMarketReceivedAt: 0,
          lastMarketSource: "",
          domObserverActive: false,
          domSnapshotCount: 0
        });

  function publishBridgeDiagnostics() {
    const documentRef = window.document;
    const root = documentRef && documentRef.documentElement;
    if (!root || typeof root.setAttribute !== "function") return false;
    try {
      root.setAttribute(
        DIAGNOSTICS_ATTRIBUTE,
        JSON.stringify({
          ...diagnostics,
          characterItemsRevision: bridge.characterItemsRevision,
          guildBuffLevelsRevision: bridge.guildBuffLevelsRevision,
          marketOrderBookRevision: bridge.marketOrderBookRevision
        })
      );
      return true;
    } catch (_) {
      return false;
    }
  }
  publishBridgeDiagnostics();
  if (window.document && !window.document.documentElement && typeof window.addEventListener === "function") {
    window.addEventListener("DOMContentLoaded", publishBridgeDiagnostics, { once: true });
  }

  function keepMarketData(message, source) {
    if (!marketDataApi || !message || String(message.type || "") !== "market_item_order_books_updated") return;
    const update = marketDataApi.normalizeMarketOrderBooksUpdate(message);
    if (!update) return;
    const normalizedSource = source === "market_dom" ? "market_dom" : "websocket";
    const receivedAt = Date.now();
    const revision = Math.min(Number.MAX_SAFE_INTEGER, bridge.marketOrderBookRevision + 1);
    bridge.marketOrderBookRevision = revision;
    bridge.marketOrderBooks[update.itemHrid] = {
      update,
      revision,
      receivedAt,
      source: normalizedSource
    };
    diagnostics.lastMarketItemHrid = update.itemHrid;
    diagnostics.lastMarketLevels = update.levels;
    diagnostics.lastMarketReceivedAt = receivedAt;
    diagnostics.lastMarketSource = normalizedSource;
    publishBridgeDiagnostics();
    if (typeof bridge.onMarketOrderBooksUpdated === "function") {
      try {
        bridge.onMarketOrderBooksUpdated();
      } catch (_) {
        // The observer is optional and must never affect the game socket.
      }
    }
  }

  function isGameWebSocketUrl(value) {
    try {
      const url = new URL(String(value || ""));
      return url.protocol === "wss:" && /^api(?:-test)?\.milkywayidle(?:cn)?\.com$/i.test(url.hostname);
    } catch (_) {
      return false;
    }
  }

  // The game owns the market navigation state. Reuse its controller instead
  // of reconstructing navigation and the market search field in the plugin.
  // React keeps this controller private, so resolve it only when the player
  // clicks one of our item links; never retain a stale component instance.
  function reactFiberRoots() {
    const documentRef = page.document;
    const root = documentRef && documentRef.getElementById && documentRef.getElementById("root");
    if (!root) return [];
    const roots = [];
    const append = (value) => {
      if (value && typeof value === "object") roots.push(value);
    };
    for (const key of Object.getOwnPropertyNames(root)) {
      if (key.startsWith("__reactContainer$") || key.startsWith("__reactFiber$")) append(root[key]);
    }
    append(root._reactRootContainer);
    append(root._reactRootContainer && root._reactRootContainer._internalRoot);
    return roots;
  }

  function findMarketplaceController() {
    const pending = reactFiberRoots();
    const visited = new Set();
    let inspected = 0;
    while (pending.length && inspected < 50000) {
      const fiber = pending.pop();
      if (!fiber || typeof fiber !== "object" || visited.has(fiber)) continue;
      visited.add(fiber);
      inspected += 1;
      const stateNode = fiber.stateNode;
      if (stateNode && typeof stateNode.handleGoToMarketplace === "function") return stateNode;
      if (fiber.current) pending.push(fiber.current);
      if (fiber.child) pending.push(fiber.child);
      if (fiber.sibling) pending.push(fiber.sibling);
      if (fiber.alternate) pending.push(fiber.alternate);
    }
    return null;
  }

  bridge.goToMarketplace = function (itemHrid, enhancementLevel) {
    if (typeof itemHrid !== "string" || !itemHrid.startsWith("/items/")) return false;
    const controller = findMarketplaceController();
    if (!controller) return false;
    // The native item UI always supplies a numeric level (0 for ordinary
    // materials). An undefined level builds an invalid market order-book key
    // and can make the game's market renderer fail before it can recover.
    const normalizedEnhancementLevel =
      Number.isInteger(enhancementLevel) && enhancementLevel >= 0 ? enhancementLevel : 0;
    try {
      controller.handleGoToMarketplace(itemHrid, normalizedEnhancementLevel);
      return true;
    } catch (_) {
      return false;
    }
  };

  function levelRecordKey(record, fallbackKey) {
    if (record && typeof record === "object") {
      const explicitKey = record.guildShrineHrid || record.shrineHrid || record.guildBuildingHrid || record.hrid;
      if (typeof explicitKey === "string" && explicitKey) return explicitKey;
    }
    return String(fallbackKey || "");
  }

  // Guild-building snapshots can arrive in separate WebSocket frames. Keep a
  // union keyed by the game's own HRID instead of replacing a complete
  // snapshot with a later, partial update.
  function mergeGuildShrineLevels(previous, incoming) {
    if (!incoming || typeof incoming !== "object") return previous;
    const merged = Object.create(null);
    const append = (source) => {
      const entries = Array.isArray(source)
        ? source.map((record, index) => [levelRecordKey(record, index), record])
        : Object.entries(source || {});
      for (const [fallbackKey, record] of entries) {
        const key = levelRecordKey(record, fallbackKey);
        if (key) merged[key] = record;
      }
    };
    append(previous);
    append(incoming);
    return merged;
  }

  function characterItemKey(record) {
    if (!record || typeof record !== "object") return "";
    if (typeof record.hash === "string" && record.hash) return `hash:${record.hash}`;
    if (typeof record.itemHrid !== "string" || !record.itemHrid.startsWith("/items/")) return "";
    if (typeof record.itemLocationHrid !== "string" || !record.itemLocationHrid.startsWith("/item_locations/"))
      return "";
    const enhancementLevel = Number(record.enhancementLevel) || 0;
    return `stack:${record.itemLocationHrid}::${record.itemHrid}::${enhancementLevel}`;
  }

  function characterItemCount(record) {
    const count = Number(record && record.count);
    return Number.isFinite(count) ? count : null;
  }

  function characterItemsEqual(left, right) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    const leftCounts = new Map();
    for (const record of left) {
      const key = characterItemKey(record);
      const count = characterItemCount(record);
      if (key && count !== null) leftCounts.set(key, count);
    }
    if (leftCounts.size !== right.length) return false;
    for (const record of right) {
      const key = characterItemKey(record);
      const count = characterItemCount(record);
      if (!key || count === null || leftCounts.get(key) !== count) return false;
    }
    return true;
  }

  function replaceCharacterItems(incoming) {
    if (!Array.isArray(incoming)) return false;
    const next = incoming.filter((record) => {
      const count = characterItemCount(record);
      return characterItemKey(record) && count !== null && count !== 0;
    });
    if (characterItemsEqual(bridge.characterItems, next)) return false;
    bridge.characterItems = next;
    return true;
  }

  // Runtime inventory changes arrive as endCharacterItems. The game applies
  // those records by stack hash and deletes a stack when its count reaches 0.
  function mergeCharacterItems(incoming) {
    if (!Array.isArray(incoming) || !incoming.length) return false;
    const itemMap = new Map();
    for (const record of bridge.characterItems || []) {
      const key = characterItemKey(record);
      if (key) itemMap.set(key, record);
    }
    for (const record of incoming) {
      const key = characterItemKey(record);
      const count = characterItemCount(record);
      if (!key || count === null) continue;
      if (count === 0) itemMap.delete(key);
      else itemMap.set(key, record);
    }
    const next = Array.from(itemMap.values());
    if (characterItemsEqual(bridge.characterItems, next)) return false;
    bridge.characterItems = next;
    return true;
  }

  function publishCharacterItemsUpdate(source) {
    bridge.characterItemsRevision = Math.min(Number.MAX_SAFE_INTEGER, bridge.characterItemsRevision + 1);
    diagnostics.lastCharacterItemsUpdatedAt = Date.now();
    diagnostics.lastCharacterItemsSource = source;
    publishBridgeDiagnostics();
    if (typeof bridge.onCharacterItemsUpdated === "function") {
      try {
        bridge.onCharacterItemsUpdated();
      } catch (_) {
        // The observer is optional and must never affect the game socket.
      }
    }
  }

  function recordSignature(value) {
    try {
      return JSON.stringify(value || null);
    } catch (_) {
      return "";
    }
  }

  function publishGuildBuffLevelsUpdate() {
    bridge.guildBuffLevelsRevision = Math.min(Number.MAX_SAFE_INTEGER, bridge.guildBuffLevelsRevision + 1);
    diagnostics.lastGuildBuffLevelsUpdatedAt = Date.now();
    publishBridgeDiagnostics();
    if (typeof bridge.onGuildBuffLevelsUpdated === "function") {
      try {
        bridge.onGuildBuffLevelsUpdated();
      } catch (_) {
        // The observer is optional and must never affect the game socket.
      }
    }
  }

  function keepGuildData(message) {
    if (!message || typeof message !== "object") return;
    const visited = new Set();
    const pending = [message];
    let scanned = 0;
    let characterItemsChanged = false;
    let characterItemsSource = "";
    const previousGuildBuffLevelsSignature = recordSignature(bridge.guildBuffLevels);
    while (pending.length && scanned < 400) {
      const value = pending.pop();
      if (!value || typeof value !== "object" || visited.has(value)) continue;
      visited.add(value);
      scanned += 1;
      const itemDetails = value.itemDetailMap || value.itemDetailDict;
      const guildBuffDetails = value.guildBuffDetailMap || value.guildBuffDetailDict;
      const guildBuffLevels =
        value.characterGuildBuffMap ||
        value.characterGuildBuffDict ||
        value.characterGuildBuffs ||
        value.characterGuildBuffLevelMap ||
        value.characterGuildBuffLevelDict;
      const guildShrineLevelCandidates = [
        value.guildShrineMap,
        value.guildShrineDict,
        value.guildShrines,
        value.guildShrineLevelMap,
        value.guildShrineLevelDict,
        value.guildShrineLevels,
        value.guildBuildingMap,
        value.guildBuildingDict,
        value.guildBuildings,
        value.guildBuildingLevelMap,
        value.guildBuildingLevelDict,
        value.guildBuildingLevels
      ];
      const guildBuildingLevelCandidates = [
        value.guildBuildingMap,
        value.guildBuildingDict,
        value.guildBuildings,
        value.guildBuildingLevelMap,
        value.guildBuildingLevelDict,
        value.guildBuildingLevels
      ];
      const guildShrineDetailCandidates = [
        value.guildShrineDetailMap,
        value.guildShrineDetailDict,
        value.guildShrineDetails,
        value.guildBuildingDetailMap,
        value.guildBuildingDetailDict,
        value.guildBuildingDetails
      ];
      const guildBuildingDetailCandidates = [
        value.guildBuildingDetailMap,
        value.guildBuildingDetailDict,
        value.guildBuildingDetails
      ];
      const characterItems = value.characterItems;
      const endCharacterItems = value.endCharacterItems;
      if (itemDetails && typeof itemDetails === "object") bridge.itemDetails = itemDetails;
      if (guildBuffDetails && typeof guildBuffDetails === "object") bridge.guildBuffDetails = guildBuffDetails;
      if (guildBuffLevels && typeof guildBuffLevels === "object") bridge.guildBuffLevels = guildBuffLevels;
      for (const guildShrineLevels of guildShrineLevelCandidates) {
        if (guildShrineLevels && typeof guildShrineLevels === "object") {
          bridge.guildShrineLevels = mergeGuildShrineLevels(bridge.guildShrineLevels, guildShrineLevels);
        }
      }
      for (const guildBuildingLevels of guildBuildingLevelCandidates) {
        if (guildBuildingLevels && typeof guildBuildingLevels === "object") {
          bridge.guildBuildingLevels = mergeGuildShrineLevels(bridge.guildBuildingLevels, guildBuildingLevels);
        }
      }
      for (const guildShrineDetails of guildShrineDetailCandidates) {
        if (guildShrineDetails && typeof guildShrineDetails === "object") {
          bridge.guildShrineDetails = mergeGuildShrineLevels(bridge.guildShrineDetails, guildShrineDetails);
        }
      }
      for (const guildBuildingDetails of guildBuildingDetailCandidates) {
        if (guildBuildingDetails && typeof guildBuildingDetails === "object") {
          bridge.guildBuildingDetails = mergeGuildShrineLevels(bridge.guildBuildingDetails, guildBuildingDetails);
        }
      }
      if (Array.isArray(characterItems) && replaceCharacterItems(characterItems)) {
        characterItemsChanged = true;
        characterItemsSource = "snapshot";
      }
      if (Array.isArray(endCharacterItems) && mergeCharacterItems(endCharacterItems)) {
        characterItemsChanged = true;
        characterItemsSource = "incremental";
      }
      for (const child of Object.values(value)) pending.push(child);
    }
    if (characterItemsChanged) publishCharacterItemsUpdate(characterItemsSource);
    if (recordSignature(bridge.guildBuffLevels) !== previousGuildBuffLevelsSignature) publishGuildBuffLevelsUpdate();
  }

  function keepSocketMessage(rawMessage) {
    if (typeof rawMessage !== "string") return;
    bridge.messages.push(rawMessage);
    if (bridge.messages.length > 80) bridge.messages.shift();
    diagnostics.messageCount = Math.min(Number.MAX_SAFE_INTEGER, diagnostics.messageCount + 1);
    diagnostics.lastMessageAt = Date.now();
    try {
      const message = JSON.parse(rawMessage);
      diagnostics.lastMessageType = String((message && message.type) || "");
      keepMarketData(message, "websocket");
      keepGuildData(message);
    } catch (_) {
      diagnostics.lastMessageType = "non_json";
      // Ignore non-JSON protocol frames.
    }
    publishBridgeDiagnostics();
  }

  let lastMarketDomSignature = "";
  let marketDomScanScheduled = false;
  let marketDomObserver = null;

  function scanMarketDom() {
    marketDomScanScheduled = false;
    if (!marketDomApi || typeof marketDomApi.readMarketDomSnapshot !== "function") return false;
    const snapshot = marketDomApi.readMarketDomSnapshot(window.document);
    if (!snapshot || snapshot.signature === lastMarketDomSignature) return false;
    const message = marketDomApi.createMarketMessage(snapshot);
    if (!message) return false;
    lastMarketDomSignature = snapshot.signature;
    diagnostics.domSnapshotCount = Math.min(Number.MAX_SAFE_INTEGER, diagnostics.domSnapshotCount + 1);
    keepMarketData(message, "market_dom");
    return true;
  }

  function scheduleMarketDomScan() {
    if (marketDomScanScheduled) return;
    marketDomScanScheduled = true;
    const schedule = typeof window.setTimeout === "function" ? window.setTimeout.bind(window) : setTimeout;
    schedule(scanMarketDom, 40);
  }

  function installMarketDomObserver() {
    if (marketDomObserver || !marketDomApi || !window.document) return false;
    const root = window.document.documentElement;
    const Observer = window.MutationObserver || (typeof MutationObserver === "function" ? MutationObserver : null);
    if (!root || typeof Observer !== "function") return false;
    marketDomObserver = new Observer(scheduleMarketDomScan);
    marketDomObserver.observe(root, { subtree: true, childList: true, characterData: true });
    bridge.marketDomObserverActive = true;
    diagnostics.domObserverActive = true;
    publishBridgeDiagnostics();
    scheduleMarketDomScan();
    return true;
  }

  if (!installMarketDomObserver() && typeof window.addEventListener === "function") {
    window.addEventListener("DOMContentLoaded", installMarketDomObserver, { once: true });
  }

  // Tampermonkey can expose unsafeWindow through an isolated-world proxy whose
  // expando assignments do not replace the game's real globals. Inject the
  // socket wrapper into MAIN_WORLD and carry only string payloads back through
  // DOM events, which are shared across the two worlds.
  function installPageSocketTap(messageEventName, readyEventName) {
    const dispatchReady = (active) => {
      window.dispatchEvent(new CustomEvent(readyEventName, { detail: active ? "1" : "0" }));
    };
    const NativeWebSocket = window.WebSocket;
    if (typeof NativeWebSocket !== "function") {
      dispatchReady(false);
      return;
    }
    if (NativeWebSocket.__mwiGuildCreditBridge === true) {
      dispatchReady(true);
      return;
    }
    const instrumentedSockets = new WeakSet();
    const isOfficialSocket = (value) => {
      try {
        const url = new URL(String(value || ""));
        return url.protocol === "wss:" && /^api(?:-test)?\.milkywayidle(?:cn)?\.com$/i.test(url.hostname);
      } catch (_) {
        return false;
      }
    };
    const instrumentSocket = (socket) => {
      if (
        !socket ||
        !isOfficialSocket(socket.url) ||
        typeof socket.addEventListener !== "function" ||
        instrumentedSockets.has(socket)
      ) {
        return socket;
      }
      instrumentedSockets.add(socket);
      socket.addEventListener("message", (event) => {
        if (typeof event.data !== "string") return;
        window.dispatchEvent(new CustomEvent(messageEventName, { detail: event.data }));
      });
      return socket;
    };
    function ObservedWebSocket(...args) {
      return instrumentSocket(new NativeWebSocket(...args));
    }
    ObservedWebSocket.prototype = NativeWebSocket.prototype;
    try {
      Object.setPrototypeOf(ObservedWebSocket, NativeWebSocket);
    } catch (_) {
      // Static WebSocket constants are copied below when inheritance is blocked.
    }
    for (const constant of ["CONNECTING", "OPEN", "CLOSING", "CLOSED"]) {
      if (constant in ObservedWebSocket) continue;
      try {
        Object.defineProperty(ObservedWebSocket, constant, {
          configurable: true,
          enumerable: true,
          value: NativeWebSocket[constant]
        });
      } catch (_) {
        // Missing constants do not affect socket construction or observation.
      }
    }
    Object.defineProperty(ObservedWebSocket, "__mwiGuildCreditBridge", { value: true });
    try {
      window.WebSocket = ObservedWebSocket;
      dispatchReady(window.WebSocket === ObservedWebSocket);
    } catch (_) {
      dispatchReady(false);
    }
  }

  let pageSocketTapInstalled = false;
  if (typeof window.addEventListener === "function") {
    window.addEventListener(SOCKET_MESSAGE_EVENT, (event) => {
      keepSocketMessage(event && event.detail);
    });
    window.addEventListener(
      SOCKET_READY_EVENT,
      (event) => {
        pageSocketTapInstalled = Boolean(event && event.detail === "1");
        diagnostics.injectionReady = pageSocketTapInstalled;
        diagnostics.installMode = pageSocketTapInstalled ? "gm_add_element_main_world" : "gm_add_element_rejected";
        diagnostics.observerActive = pageSocketTapInstalled;
        publishBridgeDiagnostics();
      },
      { once: true }
    );
  }
  if (typeof GM_addElement === "function") {
    diagnostics.injectionAttempted = true;
    diagnostics.installMode = "gm_add_element_pending";
    publishBridgeDiagnostics();
    try {
      const source = `;(${installPageSocketTap.toString()})(${JSON.stringify(SOCKET_MESSAGE_EVENT)},${JSON.stringify(SOCKET_READY_EVENT)});`;
      const injected = GM_addElement("script", { textContent: source });
      if (injected && typeof injected.remove === "function") injected.remove();
    } catch (error) {
      diagnostics.installMode = "gm_add_element_error";
      diagnostics.injectionError = String((error && error.message) || error || "unknown");
      publishBridgeDiagnostics();
      // Fall back to unsafeWindow for userscript managers without GM_addElement.
    }
  }
  if (pageSocketTapInstalled) {
    bridge.marketObserverActive = true;
    diagnostics.observerActive = true;
    publishBridgeDiagnostics();
    return;
  }

  const NativeWebSocket = page.WebSocket;
  if (!NativeWebSocket || NativeWebSocket.__mwiGuildCreditBridge) {
    diagnostics.installMode = NativeWebSocket ? "existing_wrapper" : "websocket_unavailable";
    diagnostics.observerActive = Boolean(NativeWebSocket && NativeWebSocket.__mwiGuildCreditBridge);
    publishBridgeDiagnostics();
    return;
  }
  const instrumentedSockets = new WeakSet();

  function instrumentSocket(socket) {
    if (
      !socket ||
      !isGameWebSocketUrl(socket.url) ||
      typeof socket.addEventListener !== "function" ||
      instrumentedSockets.has(socket)
    ) {
      return socket;
    }
    instrumentedSockets.add(socket);
    socket.addEventListener("message", (event) => {
      keepSocketMessage(event.data);
    });
    return socket;
  }

  function ObservedWebSocket(...args) {
    return instrumentSocket(new NativeWebSocket(...args));
  }
  ObservedWebSocket.prototype = NativeWebSocket.prototype;
  Object.setPrototypeOf(ObservedWebSocket, NativeWebSocket);
  ObservedWebSocket.__mwiGuildCreditBridge = true;
  page.WebSocket = ObservedWebSocket;
  bridge.marketObserverActive = true;
  diagnostics.installMode = page === window ? "direct_main_world" : "unsafe_window_fallback";
  diagnostics.injectionReady = page.WebSocket === ObservedWebSocket;
  diagnostics.observerActive = true;
  publishBridgeDiagnostics();
})();
