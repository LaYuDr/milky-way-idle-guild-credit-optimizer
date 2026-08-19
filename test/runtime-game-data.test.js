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
    marketUpdateSignatures: Object.create(null),
    snapshotFetchedAt: 0,
    marketSnapshotForbiddenUntilByOrigin: Object.create(null),
    marketSnapshotFallbackActive: false,
    marketSnapshotFallbackError: ""
  };
}

function createSnapshotLoader(origin, fetchImpl, options = {}) {
  const state = Object.assign(createSnapshotState(), options.state);
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
    persistMarketSnapshot: options.persistMarketSnapshot || (() => {}),
    persistMarketplaceRequestState: options.persistMarketplaceRequestState || (() => {}),
    resolveItemName: () => "",
    CREDIT_TYPES: [],
    fetchImpl,
    MARKETPLACE_SNAPSHOT_PATH: config.MARKETPLACE_SNAPSHOT_PATH,
    MARKETPLACE_SNAPSHOT_ORIGINS: config.MARKETPLACE_SNAPSHOT_ORIGINS,
    MARKETPLACE_SNAPSHOT_MAX_AGE_MS: config.MARKETPLACE_SNAPSHOT_MAX_AGE_MS,
    MARKETPLACE_SNAPSHOT_REFRESH_COOLDOWN_MS: config.MARKETPLACE_SNAPSHOT_REFRESH_COOLDOWN_MS,
    MARKETPLACE_SNAPSHOT_FORBIDDEN_BACKOFF_MS: config.MARKETPLACE_SNAPSHOT_FORBIDDEN_BACKOFF_MS,
    now: options.now
  });
  return { state, gameData };
}

test("市场快照按当前域名、另一官方域名和备用接口顺序回退", async () => {
  const requests = [];
  const { state, gameData } = createSnapshotLoader("https://www.milkywayidlecn.com", async (url) => {
    requests.push(url);
    if (requests.length < 3) return { ok: false, status: 403 };
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
    "https://www.milkywayidle.com/game_data/marketplace.json",
    "https://q7.nainai.eu.org/game_data/marketplace.json"
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

test("所有快照源失败时保留各域名的 HTTP 状态", async () => {
  const { gameData } = createSnapshotLoader("https://www.milkywayidle.com", async () => ({
    ok: false,
    status: 403
  }));

  await assert.rejects(
    gameData.loadSnapshot(true),
    /www\.milkywayidle\.com: HTTP 403; www\.milkywayidlecn\.com: HTTP 403; q7\.nainai\.eu\.org: HTTP 403/
  );
});

test("新快照被 403 拒绝时返回已保存的旧快照", async () => {
  const requestedAt = Date.parse("2026-08-19T15:00:00Z");
  const oldSnapshot = {
    timestamp: Date.parse("2026-08-19T14:00:00Z"),
    marketData: marketDataApi.sanitizeMarketData({
      "/items/beast_hide": { 0: { a: 48, b: 46 } }
    })
  };
  let requests = 0;
  const { state, gameData } = createSnapshotLoader(
    "https://www.milkywayidle.com",
    async () => {
      requests += 1;
      return { ok: false, status: 403 };
    },
    {
      now: () => requestedAt,
      state: {
        snapshot: oldSnapshot,
        snapshotTimestamp: oldSnapshot.timestamp,
        snapshotFetchedAt: requestedAt - config.MARKETPLACE_SNAPSHOT_MAX_AGE_MS - 1
      }
    }
  );

  assert.equal(await gameData.loadSnapshot(false), oldSnapshot);
  assert.equal(requests, 3);
  assert.equal(state.marketSnapshotFallbackActive, true);
  assert.match(state.marketSnapshotFallbackError, /HTTP 403/);
});

test("有效本地快照在有效期内不发起网络请求", async () => {
  const requestedAt = Date.parse("2026-08-19T15:00:00Z");
  const cachedSnapshot = {
    timestamp: Date.parse("2026-08-19T14:55:00Z"),
    marketData: marketDataApi.sanitizeMarketData({
      "/items/beast_hide": { 0: { a: 50, b: 48 } }
    })
  };
  let requests = 0;
  const { gameData } = createSnapshotLoader(
    "https://www.milkywayidle.com",
    async () => {
      requests += 1;
      throw new Error("should not request");
    },
    {
      now: () => requestedAt,
      state: {
        snapshot: cachedSnapshot,
        snapshotTimestamp: cachedSnapshot.timestamp,
        snapshotFetchedAt: requestedAt - 1
      }
    }
  );

  assert.equal(await gameData.loadSnapshot(false), cachedSnapshot);
  assert.equal(requests, 0);
});

test("并发的市场快照读取合并为一次请求", async () => {
  let resolveResponse;
  let requests = 0;
  const responsePromise = new Promise((resolve) => {
    resolveResponse = resolve;
  });
  const { gameData } = createSnapshotLoader("https://www.milkywayidle.com", async () => {
    requests += 1;
    return responsePromise;
  });

  const first = gameData.loadSnapshot(false);
  const second = gameData.loadSnapshot(false);
  resolveResponse({
    ok: true,
    status: 200,
    json: async () => ({
      timestamp: "2026-08-19T14:06:01Z",
      marketData: { "/items/beast_hide": { 0: { a: 51, b: 49 } } }
    })
  });

  const [firstSnapshot, secondSnapshot] = await Promise.all([first, second]);
  assert.equal(firstSnapshot, secondSnapshot);
  assert.equal(requests, 1);
});

test("手动刷新在冷却期内复用刚取得的快照", async () => {
  let requestedAt = Date.parse("2026-08-19T15:00:00Z");
  const cacheModes = [];
  const { gameData } = createSnapshotLoader(
    "https://www.milkywayidle.com",
    async (_url, requestOptions) => {
      cacheModes.push(requestOptions.cache);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          timestamp: requestedAt,
          marketData: { "/items/beast_hide": { 0: { a: 51, b: 49 } } }
        })
      };
    },
    { now: () => requestedAt }
  );

  await gameData.loadSnapshot(false);
  await gameData.loadSnapshot(true);
  assert.deepEqual(cacheModes, ["default"]);

  requestedAt += config.MARKETPLACE_SNAPSHOT_REFRESH_COOLDOWN_MS + 1;
  await gameData.loadSnapshot(true);
  assert.deepEqual(cacheModes, ["default", "reload"]);
});

test("403 退避期内不重复请求已被拒绝的快照源", async () => {
  const requestedAt = Date.parse("2026-08-19T15:00:00Z");
  let requests = 0;
  const persisted = [];
  const { gameData } = createSnapshotLoader(
    "https://www.milkywayidle.com",
    async () => {
      requests += 1;
      return { ok: false, status: 403 };
    },
    {
      now: () => requestedAt,
      persistMarketplaceRequestState: (value) => persisted.push(JSON.parse(JSON.stringify(value)))
    }
  );

  await assert.rejects(gameData.loadSnapshot(false), /HTTP 403/);
  await assert.rejects(gameData.loadSnapshot(false), /HTTP 403 backoff/);
  assert.equal(requests, 3);
  assert.equal(persisted.length >= 2, true);
});
