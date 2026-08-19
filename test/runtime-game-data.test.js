"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const config = require("../src/runtime/config.js");
const marketDataApi = require("../src/market-data.js");
const gameDataApi = require("../src/runtime/game-data.js");

function createSnapshotState() {
  return {
    snapshot: null,
    snapshotTimestamp: 0,
    marketSnapshotCandidateSignature: "",
    marketSnapshotCandidateTimestamp: 0,
    marketSnapshotCandidateConfirmations: 0,
    marketLiveData: Object.create(null),
    marketLiveRevision: 0,
    marketUpdateSignatures: Object.create(null)
  };
}

function createSnapshotLoader(origin, fetchImpl) {
  const state = createSnapshotState();
  const gameData = gameDataApi.createGameData({
    state,
    pageWindow: { location: { origin, href: `${origin}/` } },
    document: {},
    marketDataApi,
    core: {},
    persistLiveMarketData() {},
    scheduleMarketDataRefresh() {},
    scheduleInventoryDataRefresh() {},
    scheduleGuildDataRefresh() {},
    resolveItemName: () => "",
    CREDIT_TYPES: [],
    fetchImpl,
    MARKETPLACE_SNAPSHOT_PATH: config.MARKETPLACE_SNAPSHOT_PATH,
    MARKETPLACE_SNAPSHOT_ORIGINS: config.MARKETPLACE_SNAPSHOT_ORIGINS
  });
  return { state, gameData };
}

test("市场快照在官方当前域名失败时按顺序回退到另一官方域名", async () => {
  const requests = [];
  const { state, gameData } = createSnapshotLoader("https://www.milkywayidlecn.com", async (url) => {
    requests.push(url);
    if (requests.length === 1) return { ok: false, status: 403 };
    return {
      ok: true,
      status: 200,
      json: async () => ({
        timestamp: "2026-08-19T14:06:01Z",
        marketData: { "/items/beast_hide": { 0: { a: 51, b: 49 } } }
      })
    };
  });

  const snapshot = await gameData.loadSnapshot(true);

  assert.deepEqual(requests, [
    "https://www.milkywayidlecn.com/game_data/marketplace.json",
    "https://www.milkywayidle.com/game_data/marketplace.json"
  ]);
  assert.equal(snapshot.marketData["/items/beast_hide"]["0"].a, 51);
  assert.equal(state.snapshot, snapshot);
});

test("非官方本地开发站点不会回退到生产域名", () => {
  assert.deepEqual(
    gameDataApi.marketplaceSnapshotUrls(
      { origin: "http://127.0.0.1:4173" },
      config.MARKETPLACE_SNAPSHOT_ORIGINS,
      config.MARKETPLACE_SNAPSHOT_PATH
    ),
    ["http://127.0.0.1:4173/game_data/marketplace.json"]
  );
});

test("所有官方快照源失败时保留各域名的 HTTP 状态", async () => {
  const { gameData } = createSnapshotLoader("https://www.milkywayidle.com", async () => ({
    ok: false,
    status: 403
  }));

  await assert.rejects(
    gameData.loadSnapshot(true),
    /www\.milkywayidle\.com: HTTP 403; www\.milkywayidlecn\.com: HTTP 403/
  );
});
