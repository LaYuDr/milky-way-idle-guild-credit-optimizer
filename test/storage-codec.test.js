"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const codec = require("../src/runtime/storage-codec.js");
const lz = require("../src/vendor/lz-string.js");
const storageApi = require("../src/runtime/storage.js");
const history = require("../src/trial-history.js");
const config = require("../src/runtime/config.js");
const market = require("../src/market-data.js");
const names = require("../src/item-name-catalog.js");

const host = "www.milkywayidlecn.com";
const prefix = `${config.TRIAL_HISTORY_STORAGE_PREFIX}:${config.GUILD_BUILDING_PLAN_STORAGE_PREFIX}:${host}:123:`;
const marketKey = config.MARKETPLACE_SNAPSHOT_STORAGE_KEY;
function memoryStorage(seed = {}) {
  const values = new Map(Object.entries(seed));
  return {
    values,
    writes: 0,
    get length() {
      return values.size;
    },
    key(index) {
      return [...values.keys()][index] ?? null;
    },
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      this.writes += 1;
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    }
  };
}
function plugin(storage, characterId = "123") {
  return storageApi.createPluginStorage({
    storage,
    config,
    marketDataApi: market,
    trialHistoryApi: history,
    location: { hostname: host, href: `https://${host}/game?characterId=${characterId}` }
  });
}
function record(id = "a") {
  const trialHrid = "/guild_skilling/milking";
  const members = Object.fromEntries(
    Array.from({ length: 80 }, (_, index) => [
      `row-${index}`,
      { name: `成员🐄-${index}`, note: "历史信息与未知字段均保留".repeat(5), empty: null }
    ])
  );
  return {
    schemaVersion: 2,
    source: "manual",
    recordId: id,
    key: JSON.stringify(["manual", id]),
    guildId: null,
    guildName: null,
    weekStartAt: null,
    trialDate: null,
    capturedAt: null,
    trialHrid,
    kind: "skilling",
    points: null,
    party: { done: true, highestTier: null },
    members,
    rows: Object.keys(members).map((memberKey, index) => ({
      memberKey,
      characterId: null,
      trialHrid,
      workDone: index === 0 ? 0 : index + 0.123456789,
      future: { formula: "=SUM(C4:C41)", unknown: null, exact: Number.MAX_SAFE_INTEGER }
    })),
    sourceText: "保留手动导入原文\n".repeat(100)
  };
}
const recordKey = (value) => prefix + encodeURIComponent(value.key);

test("无损压缩逐字符保留中文、代理对、未知字段、精度和 JSON 空白", () => {
  const text = JSON.stringify({ ...record(), string: "\u0000\ud800\udfff\u2028\u2029" }, null, 2);
  const packed = codec.encode(text);
  assert.ok(packed.length < text.length * 0.3);
  assert.equal(codec.decode(packed), text);
  assert.deepEqual(JSON.parse(codec.decode(packed)), JSON.parse(text));
  assert.equal(codec.decode(null), null);
});

test("小值、不可压缩文本和损坏 JSON 保持原文", () => {
  const bytes = crypto.randomBytes(16384);
  const random = JSON.stringify(
    Array.from({ length: bytes.length / 2 }, (_, i) =>
      String.fromCharCode(0x4e00 + (bytes.readUInt16LE(i * 2) % 20000))
    ).join("")
  );
  for (const text of ["b", "null", "{}", "x".repeat(6000), random]) {
    assert.equal(codec.encode(text), text);
  }
});

test("损坏、未知版本、伪造长度和截断数据不会作为空历史返回", () => {
  const packed = codec.encode(JSON.stringify(record()));
  const header = /^(MWIGC:1:)([0-9]+):([0-9a-f]+):/.exec(packed);
  assert.ok(header);
  for (const broken of [
    "MWIGC:2:1:00000000:x",
    "MWIGC:1:",
    "MWIGC:1:-1:00000000:x",
    `MWIGC:1:${codec.MAX_LENGTH + 1}:00000000:x`,
    packed.replace(header[3], "00000000"),
    packed.slice(0, packed.length - 10),
    packed.replace(`${header[2]}:`, "8:")
  ]) {
    assert.throws(() => codec.decode(broken));
  }
  const r = record();
  const raw = memoryStorage({ [recordKey(r)]: packed.slice(0, -10) });
  const api = plugin(raw);
  assert.deepEqual(api.loadTrialHistory(), { records: [], failed: true });
  assert.equal(api.saveTrialSnapshot(r), false, "不能覆盖不可还原的旧档案");
  assert.equal(raw.writes, 0);
});

test("解压过程中限制展开长度，拒绝小声明中的大数据", () => {
  const data = lz.compressToUTF16("x".repeat(1_000_000));
  assert.throws(() => lz.decompressFromUTF16(data, 32), /declared length/);
});

test("旧缓存逐项迁移、重载可读，其他插件、设置和其他角色不被改写", () => {
  const r = record();
  const key = recordKey(r);
  const text = JSON.stringify(r);
  const otherCharacter = key.replace(`${host}:123:`, `${host}:456:`);
  const raw = memoryStorage({
    [key]: text,
    [otherCharacter]: text,
    unrelated: text,
    [config.UI_STATE_STORAGE_KEY]: text
  });
  const loaded = plugin(raw).loadTrialHistory();
  assert.equal(loaded.failed, false);
  assert.deepEqual(loaded.records, [r]);
  assert.ok(raw.getItem(key).startsWith("MWIGC:1:"));
  assert.equal(raw.getItem(otherCharacter), text);
  assert.equal(raw.getItem("unrelated"), text);
  assert.equal(raw.getItem(config.UI_STATE_STORAGE_KEY), text);
  assert.deepEqual(plugin(raw).loadTrialHistory(), loaded);
  assert.equal(raw.writes, 1, "重载不重复重写已压缩数据");
});

test("旧数据压缩替换被拒绝时仍可完整读取", () => {
  const r = record();
  const raw = memoryStorage({ [recordKey(r)]: JSON.stringify(r) });
  let attempts = 0;
  raw.setItem = () => {
    attempts += 1;
    throw Error("quota or read only");
  };
  const api = plugin(raw);
  assert.deepEqual(api.loadTrialHistory(), { records: [r], failed: false });
  assert.deepEqual(api.loadTrialHistory(), { records: [r], failed: false });
  assert.equal(attempts, 1, "不可写时避免每次刷新都重复压缩迁移");
  assert.equal(raw.getItem(recordKey(r)), JSON.stringify(r));
});

test("迁移前比较原值，不覆盖其他页面的新写入", () => {
  const original = JSON.stringify(record());
  const newer = JSON.stringify(record("newer"));
  const raw = memoryStorage({ [marketKey]: original });
  const read = raw.getItem.bind(raw);
  let reads = 0;
  raw.getItem = (key) => {
    if (key === marketKey) reads += 1;
    if (key === marketKey && reads === 2) raw.values.set(key, newer);
    return read(key);
  };
  const store = codec.createStorage(raw);
  assert.equal(store.getItem(marketKey), original);
  assert.equal(raw.writes, 0);
  assert.equal(store.getItem(marketKey), newer);
  assert.equal(codec.decode(raw.getItem(marketKey)), newer);
});

test("解压缓存跟随原值变化，删除后不复活，淘汰后仍能读取", () => {
  const raw = memoryStorage();
  const store = codec.createStorage(raw);
  const one = JSON.stringify(record());
  const two = JSON.stringify(record("two"));
  store.setItem(marketKey, one);
  assert.equal(store.getItem(marketKey), one);
  raw.setItem(marketKey, codec.encode(two));
  assert.equal(store.getItem(marketKey), two);
  for (let index = 0; index < 70; index += 1) store.setItem(`${prefix}${index}`, one);
  assert.equal(store.getItem(marketKey), two);
  store.removeItem(marketKey);
  assert.equal(store.getItem(marketKey), null);
});

test("保存、导出原格式、重复与冲突导入均兼容压缩历史", () => {
  const r = record();
  const raw = memoryStorage();
  const api = plugin(raw);
  assert.equal(api.saveTrialSnapshot(r), true);
  assert.ok(raw.getItem(recordKey(r)).startsWith("MWIGC:1:"));
  const loaded = plugin(raw).loadTrialHistory().records;
  const exported = history.parseImport(JSON.stringify({ schemaVersion: 2, records: loaded }));
  assert.deepEqual(exported, [r]);
  assert.deepEqual(api.importTrialHistory(exported), {
    status: "imported",
    added: 0,
    dated: 0,
    duplicates: 1,
    conflicts: 0
  });
  const conflict = structuredClone(r);
  conflict.rows[0].workDone = 77;
  assert.equal(api.importTrialHistory([conflict]).conflicts, 1);
  assert.deepEqual(plugin(raw).loadTrialHistory().records, loaded);
});

test("压缩导入中途配额失败时回滚新增项，保留此前压缩历史", () => {
  const old = record("old");
  const first = record("first");
  const second = record("second");
  const raw = memoryStorage();
  const api = plugin(raw);
  assert.equal(api.saveTrialSnapshot(old), true);
  const previous = raw.getItem(recordKey(old));
  const set = raw.setItem.bind(raw);
  raw.setItem = (key, value) => {
    if (key === recordKey(second)) throw Error("quota");
    set(key, value);
  };
  assert.deepEqual(api.importTrialHistory([first, second]), {
    status: "failed",
    added: 0,
    dated: 0,
    duplicates: 0,
    conflicts: 0
  });
  assert.equal(raw.getItem(recordKey(first)), null);
  assert.equal(raw.getItem(recordKey(old)), previous);
  assert.deepEqual(plugin(raw).loadTrialHistory().records, [old]);
});

test("保存压缩值失败不会损坏已有原文或压缩值", () => {
  for (const previous of [JSON.stringify(record()), codec.encode(JSON.stringify(record()))]) {
    const raw = memoryStorage({ [marketKey]: previous });
    raw.setItem = () => {
      throw Error("quota");
    };
    assert.throws(() => codec.createStorage(raw).setItem(marketKey, JSON.stringify(record("next"))));
    assert.equal(raw.getItem(marketKey), previous);
  }
});

test("已压缩手动档案补日期失败精确回滚，其他页面的新值不被撤销", () => {
  for (const concurrent of [false, true]) {
    const original = record("dated");
    const enriched = history.normalizeSnapshot({ ...original, trialDate: "2026-09-03" });
    const second = record("fails");
    const external = { ...original, sourceText: "其他页面后写入的原文" };
    const raw = memoryStorage();
    const api = plugin(raw);
    assert.equal(api.saveTrialSnapshot(original), true);
    const previous = raw.getItem(recordKey(original));
    const set = raw.setItem.bind(raw);
    raw.setItem = (key, value) => {
      if (key === recordKey(second)) {
        if (concurrent) set(recordKey(original), codec.encode(JSON.stringify(external)));
        throw Error("quota");
      }
      set(key, value);
    };
    const result = api.importTrialHistory([enriched, second]);
    assert.equal(result.status, concurrent ? "partial" : "failed");
    assert.equal(result.dated, concurrent ? 1 : 0);
    if (concurrent) assert.deepEqual(plugin(raw).loadTrialHistory().records, [external]);
    else assert.equal(raw.getItem(recordKey(original)), previous);
  }
});

test("名称目录迁移和市场快照读写仍返回原有数据结构", () => {
  const catalog = {
    schemaVersion: 1,
    names: Object.fromEntries(Array.from({ length: 300 }, (_, i) => [`/items/test_${i}`, `中文物品${i}`])),
    sources: ["react-provider"],
    updatedAt: "2026-10-26T00:00:00Z"
  };
  const raw = memoryStorage({ [names.STORAGE_KEY]: JSON.stringify(catalog) });
  const reader = names.createItemNameCatalog({ storage: raw });
  assert.equal(reader.metadata().entryCount, 300);
  assert.ok(raw.getItem(names.STORAGE_KEY).startsWith("MWIGC:1:"));
  assert.equal(names.createItemNameCatalog({ storage: raw }).metadata().entryCount, 300);
  const snapshot = {
    timestamp: Date.parse("2026-10-26T01:00:00Z"),
    marketData: Object.fromEntries(
      Array.from({ length: 300 }, (_, i) => [`/items/test_${i}`, { 0: { a: i + 1, b: -1 } }])
    )
  };
  const fetchedAt = snapshot.timestamp + 5000;
  assert.equal(plugin(raw).persistMarketSnapshot(snapshot, fetchedAt), true);
  assert.ok(raw.getItem(marketKey).startsWith("MWIGC:1:"));
  assert.deepEqual(plugin(raw).loadSavedMarketSnapshot(), {
    snapshot: { ...snapshot, marketData: market.sanitizeMarketData(snapshot.marketData) },
    fetchedAt
  });
});
