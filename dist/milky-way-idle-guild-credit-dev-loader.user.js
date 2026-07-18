// ==UserScript==
// @name         银河奶牛公会信用点性价比 开发加载器
// @namespace    https://www.milkywayidle.com/
// @version      0.4.51
// @author       柆雨
// @description  从本机开发服务加载银河奶牛信用点插件；仅用于开发和自动测试。
// @match        https://www.milkywayidle.com/*
// @match        https://www.milkywayidlecn.com/*
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      127.0.0.1
// @run-at       document-start
// ==/UserScript==

(function () {
  "use strict";
  const page = typeof unsafeWindow === "undefined" ? window : unsafeWindow;
  const bridge = page.__mwiGuildCreditBridge || (page.__mwiGuildCreditBridge = {
    messages: [],
    sockets: [],
    itemDetails: null
  });

  function rememberItemDetails(message) {
    if (!message || typeof message !== "object") return;
    const itemDetails = message.itemDetailMap || message.itemDetailDict;
    if (itemDetails && typeof itemDetails === "object") bridge.itemDetails = itemDetails;
  }

  // This loader runs before the game scripts. Preserve received data so the
  // separately loaded development runtime can inspect the game's read-only
  // initialization payload after it has finished loading.
  const NativeWebSocket = page.WebSocket;
  if (NativeWebSocket && !NativeWebSocket.__mwiGuildCreditBridge) {
    function ObservedWebSocket(...args) {
      const socket = new NativeWebSocket(...args);
      bridge.sockets.push(socket);
      socket.addEventListener("message", (event) => {
        if (typeof event.data !== "string") return;
        bridge.messages.push(event.data);
        if (bridge.messages.length > 40) bridge.messages.shift();
        try {
          rememberItemDetails(JSON.parse(event.data));
        } catch (_) {
          // The game WebSocket can carry unrelated text frames.
        }
      });
      socket.addEventListener("close", () => {
        const index = bridge.sockets.indexOf(socket);
        if (index >= 0) bridge.sockets.splice(index, 1);
      });
      return socket;
    }
    ObservedWebSocket.prototype = NativeWebSocket.prototype;
    Object.setPrototypeOf(ObservedWebSocket, NativeWebSocket);
    ObservedWebSocket.__mwiGuildCreditBridge = true;
    page.WebSocket = ObservedWebSocket;
  }
  const runtimeUrl = "http://127.0.0.1:4173/runtime.js?cacheBust=" + Date.now();
  GM_xmlhttpRequest({
    method: "GET",
    url: runtimeUrl,
    onload(response) {
      if (response.status !== 200 || !response.responseText.startsWith("// MWI_GUILD_CREDIT_RUNTIME")) {
        console.error("[MWI Credit] 开发运行时响应无效", response.status);
        return;
      }
      try {
        Function(response.responseText + "\n//# sourceURL=mwi-credit-runtime.js")();
      } catch (error) {
        console.error("[MWI Credit] 开发运行时加载失败", error);
      }
    },
    onerror(error) {
      console.error("[MWI Credit] 无法连接本机开发服务", error);
    }
  });
})();
