(function () {
  "use strict";

  const page = typeof unsafeWindow === "undefined" ? window : unsafeWindow;
  const bridge = page.__mwiGuildCreditBridge || (page.__mwiGuildCreditBridge = {
    messages: [],
    itemDetails: null,
    guildBuffDetails: null,
    guildBuffLevels: null,
    characterItems: null
  });

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
      const characterItems = value.characterItems;
      if (itemDetails && typeof itemDetails === "object") bridge.itemDetails = itemDetails;
      if (guildBuffDetails && typeof guildBuffDetails === "object") bridge.guildBuffDetails = guildBuffDetails;
      if (guildBuffLevels && typeof guildBuffLevels === "object") bridge.guildBuffLevels = guildBuffLevels;
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
