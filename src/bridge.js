(function () {
  "use strict";

  const page = typeof unsafeWindow === "undefined" ? window : unsafeWindow;
  const bridge = page.__mwiGuildCreditBridge || (page.__mwiGuildCreditBridge = {
    messages: [],
    itemDetails: null,
    guildBuffDetails: null,
    guildBuffLevels: null,
    guildShrineLevels: null,
    guildShrineDetails: null,
    characterItems: null
  });

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

  function keepGuildData(message) {
    if (!message || typeof message !== "object") return;
    const visited = new Set();
    const pending = [message];
    let scanned = 0;
    while (pending.length && scanned < 400) {
      const value = pending.pop();
      if (!value || typeof value !== "object" || visited.has(value)) continue;
      visited.add(value);
      scanned += 1;
      const itemDetails = value.itemDetailMap || value.itemDetailDict;
      const guildBuffDetails = value.guildBuffDetailMap || value.guildBuffDetailDict;
      const guildBuffLevels = value.characterGuildBuffMap || value.characterGuildBuffDict || value.characterGuildBuffs || value.characterGuildBuffLevelMap || value.characterGuildBuffLevelDict;
      const guildShrineLevelCandidates = [
        value.guildShrineMap, value.guildShrineDict, value.guildShrines,
        value.guildShrineLevelMap, value.guildShrineLevelDict, value.guildShrineLevels,
        value.guildBuildingMap, value.guildBuildingDict, value.guildBuildings,
        value.guildBuildingLevelMap, value.guildBuildingLevelDict, value.guildBuildingLevels
      ];
      const guildShrineDetailCandidates = [
        value.guildShrineDetailMap, value.guildShrineDetailDict, value.guildShrineDetails,
        value.guildBuildingDetailMap, value.guildBuildingDetailDict, value.guildBuildingDetails
      ];
      const characterItems = value.characterItems;
      if (itemDetails && typeof itemDetails === "object") bridge.itemDetails = itemDetails;
      if (guildBuffDetails && typeof guildBuffDetails === "object") bridge.guildBuffDetails = guildBuffDetails;
      if (guildBuffLevels && typeof guildBuffLevels === "object") bridge.guildBuffLevels = guildBuffLevels;
      for (const guildShrineLevels of guildShrineLevelCandidates) {
        if (guildShrineLevels && typeof guildShrineLevels === "object") {
          bridge.guildShrineLevels = mergeGuildShrineLevels(bridge.guildShrineLevels, guildShrineLevels);
        }
      }
      for (const guildShrineDetails of guildShrineDetailCandidates) {
        if (guildShrineDetails && typeof guildShrineDetails === "object") {
          bridge.guildShrineDetails = mergeGuildShrineLevels(bridge.guildShrineDetails, guildShrineDetails);
        }
      }
      if (Array.isArray(characterItems)) bridge.characterItems = characterItems;
      for (const child of Object.values(value)) pending.push(child);
    }
  }

  const NativeWebSocket = page.WebSocket;
  if (!NativeWebSocket || NativeWebSocket.__mwiGuildCreditBridge) return;
  function ObservedWebSocket(...args) {
    const socket = new NativeWebSocket(...args);
    socket.addEventListener("message", (event) => {
      if (typeof event.data !== "string") return;
      bridge.messages.push(event.data);
      if (bridge.messages.length > 80) bridge.messages.shift();
      try {
        keepGuildData(JSON.parse(event.data));
      } catch (_) {
        // Ignore non-JSON protocol frames.
      }
    });
    return socket;
  }
  ObservedWebSocket.prototype = NativeWebSocket.prototype;
  Object.setPrototypeOf(ObservedWebSocket, NativeWebSocket);
  ObservedWebSocket.__mwiGuildCreditBridge = true;
  page.WebSocket = ObservedWebSocket;
})();
