"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const trialApi = require("../src/trial-history.js");
const bridgeSource = fs.readFileSync(require.resolve("../src/bridge.js"), "utf8");
const loaderSource = fs.readFileSync(require.resolve("../dist/milky-way-idle-guild-credit-dev-loader.user.js"), "utf8");

for (const isolated of [false, true]) {
  test(`开发加载器交接缓存和后续名册消息（隔离窗口：${isolated}）`, () => {
    let constructions = 0;
    class FakeWebSocket {
      constructor(url) {
        this.url = url;
        this.listeners = new Map();
        constructions++;
      }
      addEventListener(type, listener) {
        const listeners = this.listeners.get(type) || [];
        listeners.push(listener);
        this.listeners.set(type, listeners);
      }
      receive(message) {
        for (const listener of this.listeners.get("message") || []) listener({ data: JSON.stringify(message) });
      }
    }
    const page = { WebSocket: FakeWebSocket };
    const window = isolated ? {} : page;
    window.MwiGuildTrialHistory = trialApi;
    const sandbox = {
      window,
      unsafeWindow: page,
      URL,
      GM_xmlhttpRequest() {},
      GM_addElement() {
        assert.fail("已有开发加载器时直接交接，不再注入第二套消息监听");
      }
    };
    vm.runInNewContext(loaderSource, sandbox);
    const socket = new page.WebSocket("wss://api.milkywayidlecn.com/ws");
    const joinedAt = "2026-08-01T00:00:00Z";
    socket.receive({
      type: "init_character_data",
      guild: { id: 7 },
      guildCharacterMap: { 1: { joinTime: joinedAt } },
      guildSharableCharacterMap: { 1: { name: "Member" } }
    });
    vm.runInNewContext(bridgeSource, sandbox);
    const bridge = window.__mwiGuildCreditBridge;
    assert.equal(trialApi.currentMembershipRankings(bridge.trialHistoryContext).length, 1);
    assert.equal(trialApi.currentMemberJoinedAt(bridge.trialHistoryContext, { id: 1 }), Date.parse(joinedAt));
    assert.equal(bridge.messages.length, 1, "缓存回放不重复入队");
    assert.equal(bridge.diagnostics.messageCount, 1);
    assert.equal(constructions, 1, "交接不建立额外连接");
    let refreshes = 0;
    bridge.onTrialStatsUpdated = () => refreshes++;
    socket.receive({ type: "guild_characters_updated", guildCharacterMap: {} });
    assert.equal(trialApi.currentMembershipRankings(bridge.trialHistoryContext).length, 0);
    assert.equal(refreshes, 1);
    assert.equal(bridge.messages.length, 2);

    const reconnected = new page.WebSocket("wss://api.milkywayidlecn.com/ws");
    reconnected.receive({
      type: "guild_characters_updated",
      guildCharacterMap: { 2: { joinTime: joinedAt } },
      guildSharableCharacterMap: { 2: { name: "New member" } }
    });
    assert.equal(trialApi.currentMemberJoinedAt(bridge.trialHistoryContext, { id: 2 }), Date.parse(joinedAt));
    assert.equal(refreshes, 2);
    assert.equal(bridge.messages.length, 3);
    const wrapper = page.WebSocket;
    vm.runInNewContext(bridgeSource, sandbox);
    assert.equal(page.WebSocket, wrapper, "重复运行不重复包装或回放");
    reconnected.receive({ type: "guild_updated", guild: null });
    assert.equal(refreshes, 3);
    assert.equal(bridge.diagnostics.messageCount, 4);
    assert.equal(trialApi.currentMembershipRankings(bridge.trialHistoryContext).length, 0);

    const unrelated = new page.WebSocket("wss://example.invalid/ws");
    unrelated.receive({ type: "guild_updated", guild: { id: 9 } });
    assert.equal(bridge.diagnostics.messageCount, 4, "不采集非官方连接");
    assert.equal(bridge.trialHistoryContext.guild, null);
  });
}
