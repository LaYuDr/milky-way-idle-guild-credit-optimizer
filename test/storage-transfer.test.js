"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const api = require("../src/runtime/storage-transfer.js");
const codec = require("../src/runtime/storage-codec.js");
const config = require("../src/runtime/config.js");
const origin = "https://www.milkywayidlecn.com";
const planKey = "mwi-guild-building-planner-v1:www.milkywayidlecn.com:123";
const trialKey = `mwi-guild-trial-history-v1:${planKey}:%5B%22game%22%5D`;
function fixture(seed = {}, hooks = {}) {
  const values = new Map(Object.entries(seed));
  function adapter() {
    return {
      get length() {
        return values.size;
      },
      key: (index) => [...values.keys()][index] ?? null,
      getItem(key) {
        hooks.read?.(key, values);
        return values.get(key) ?? null;
      },
      setItem(key, value) {
        hooks.write?.(key, value, values);
        values.set(key, String(value));
      },
      removeItem(key) {
        hooks.remove?.(key, values);
        values.delete(key);
      }
    };
  }
  const storage = adapter();
  return {
    values,
    storage,
    adapter,
    service: api.create({ storage, origin, version: "1.2.67", now: () => 1793000000000 })
  };
}
function backup(entries, overrides = {}) {
  return {
    format: api.FORMAT,
    schemaVersion: 1,
    origin,
    pluginVersion: "1.2.67",
    exportedAt: 1793000000000,
    entries: Object.entries(entries).map(([key, rawValue]) => ({ key, rawValue })),
    ...overrides
  };
}
function current(f) {
  return f.service.snapshot().entries;
}

test("完整范围包含所有角色的历史、计划、设置、恢复备份和缓存，排除游戏与其他插件", () => {
  const owned = [
    ...[
      config.PRICE_REFERENCE_STORAGE_KEY,
      config.UI_STATE_STORAGE_KEY,
      config.MARKET_LIVE_STORAGE_KEY,
      config.MARKETPLACE_SNAPSHOT_STORAGE_KEY,
      config.MARKETPLACE_REQUEST_STATE_STORAGE_KEY,
      "mwi-official-item-name-catalog-v1"
    ],
    planKey,
    planKey.replace(":123", ":hero-7"),
    trialKey,
    `mwi-guild-trial-display-v1:${planKey}`,
    `mwi-guild-trial-display-v1:${planKey}:view`,
    `mwi-guild-trial-display-v1:${planKey}:ranking-order`,
    `mwi-guild-trial-recovery-v1:${planKey}:%5B%22game%22%5D:uuid`,
    `mwi-guild-trial-history-v1:${planKey.replace(":123", ":default")}:encoded`
  ];
  const unrelated = [
    "initClientData",
    "i18nextLng",
    "token",
    "mwi-layu:partitions:v1",
    "MWICore_marketData",
    "mwi-guild-credit-ui-state-v1-extra",
    codec.GENERATION_KEY,
    `${planKey}:other`,
    `mwi-guild-trial-display-v1:${planKey}:unknown`
  ];
  for (const key of owned) assert.equal(api.ownsKey(key), true, key);
  for (const key of unrelated) assert.equal(api.ownsKey(key), false, key);
  const f = fixture(Object.fromEntries([...owned, ...unrelated].map((key) => [key, "value"])));
  assert.equal(current(f).length, owned.length);
});

test("导出校验、清空、重新导入逐字符保留压缩、损坏、未知字段、0/null 与游戏/手动来源", () => {
  const values = {
    [trialKey]: codec.encode(
      JSON.stringify({ schemaVersion: 1, source: "game", future: "中文🐄\ud800".repeat(1000), zero: 0, unknown: null })
    ),
    [planKey]: '{"future":9007199254740991,"zero":0}',
    [config.UI_STATE_STORAGE_KEY]: "{invalid-json",
    [config.PRICE_REFERENCE_STORAGE_KEY]: "ask",
    [`mwi-guild-trial-history-v1:${planKey}:manual`]: '{"schemaVersion":2,"source":"manual"}',
    [`mwi-guild-trial-recovery-v1:${planKey}:damaged:uuid`]: "MWIGC:1:broken"
  };
  const f = fixture({ ...values, token: "game-only" });
  const saved = f.service.snapshot();
  const text = JSON.stringify(saved, null, 2);
  assert.equal(f.service.verifyFile(text, saved), true);
  assert.equal(f.service.verifyFile(JSON.stringify(backup({ [planKey]: "wrong" })), saved), false);
  assert.deepEqual(f.service.clear(saved), {
    status: "applied",
    changed: Object.keys(values).length,
    needsReload: true
  });
  assert.deepEqual(current(f), []);
  assert.equal(f.values.get("token"), "game-only");
  const parsed = f.service.parse(text);
  assert.equal(f.service.restore(f.service.preview(parsed)).status, "applied");
  assert.deepEqual(current(f), saved.entries);
  assert.equal(codec.decode(f.values.get(trialKey)), codec.decode(values[trialKey]));
});

test("导入默认跳过相同及冲突，明确覆盖只替换备份包含项，文件外数据始终保留", () => {
  const f = fixture({
    [planKey]: "current",
    [config.UI_STATE_STORAGE_KEY]: "same",
    [config.PRICE_REFERENCE_STORAGE_KEY]: "untouched"
  });
  const incoming = f.service.parse(
    JSON.stringify(backup({ [planKey]: "backup", [config.UI_STATE_STORAGE_KEY]: "same", [trialKey]: "new" }))
  );
  const plan = f.service.preview(incoming);
  assert.deepEqual(plan.entries.map((entry) => entry.status).sort(), ["conflict", "duplicate", "new"]);
  assert.equal(f.service.restore(plan).changed, 1);
  assert.equal(f.values.get(planKey), "current");
  assert.equal(f.service.restore(f.service.preview(incoming), true).changed, 1);
  assert.equal(f.values.get(planKey), "backup");
  assert.equal(f.values.get(config.PRICE_REFERENCE_STORAGE_KEY), "untouched");
});

test("拒绝跨区服、未知版本、重复键、游戏键、其他插件键、错类型和超限文件，不写入任何数据", () => {
  const f = fixture({ [planKey]: "keep" });
  for (const bad of [
    backup({}, { origin: "https://www.milkywayidle.com" }),
    backup({}, { schemaVersion: 2 }),
    backup({}, { format: "guild-trial-history" }),
    backup({}, { exportedAt: null }),
    backup({}, { pluginVersion: "bad" }),
    backup({ initClientData: "secret" }),
    backup({ "mwi-layu:history": "other" }),
    backup({ [planKey]: null }),
    backup({ [planKey]: {} }),
    backup(
      {},
      {
        entries: [
          { key: planKey, rawValue: "a" },
          { key: planKey, rawValue: "b" }
        ]
      }
    )
  ])
    assert.throws(() => f.service.parse(JSON.stringify(bad)));
  assert.throws(() => f.service.parse("null"), /cacheInvalidBackup/);
  assert.throws(() => f.service.parse("invalid"), /cacheInvalidBackup/);
  assert.throws(() => f.service.parse(" ".repeat(api.MAX_TEXT + 1)), /cacheFileTooLarge/);
  assert.deepEqual([...f.values], [[planKey, "keep"]]);
});

test("导出或预览后新增和变化都会停止操作，不删除下载文件未包含的新值", () => {
  const f = fixture({ [planKey]: "old" });
  const exported = f.service.snapshot();
  const planned = f.service.preview(backup({ [planKey]: "import" }));
  f.values.set(planKey, "newer");
  assert.deepEqual(f.service.clear(exported), { status: "stale", changed: 0, needsReload: false });
  assert.equal(f.service.restore(planned, true).status, "stale");
  assert.equal(f.values.get(planKey), "newer");
  f.values.set(planKey, "old");
  f.values.set(trialKey, "new-record");
  assert.equal(f.service.clear(exported).status, "stale");
  assert.equal(f.values.get(trialKey), "new-record");
});

test("清空中途失败精确回滚全部旧值，其他插件键不动", () => {
  let removed = 0;
  const f = fixture(
    { [planKey]: "one", [trialKey]: "MWIGC:broken", token: "keep" },
    {
      remove() {
        if (++removed === 2) throw new Error("denied");
      }
    }
  );
  const original = current(f);
  const result = f.service.clear(f.service.snapshot());
  assert.equal(result.status, "failed");
  assert.equal(result.changed, 0);
  assert.equal(result.needsReload, true);
  assert.deepEqual(current(f), original);
  assert.equal(f.values.get("token"), "keep");
});

test("覆盖导入遇到配额失败会撤回已写项，保留原始损坏值", () => {
  const f = fixture(
    { [planKey]: "invalid-json", [trialKey]: "old" },
    {
      write(key, value) {
        if (key === trialKey && value === "quota") throw new Error("QuotaExceededError");
      }
    }
  );
  const before = current(f);
  const result = f.service.restore(f.service.preview(backup({ [planKey]: "new", [trialKey]: "quota" })), true);
  assert.equal(result.status, "failed");
  assert.deepEqual(current(f), before);
});

test("回滚失败报告部分保留，不假称已全部撤回", () => {
  let removed = 0;
  const f = fixture(
    { [planKey]: "one", [trialKey]: "two" },
    {
      remove() {
        if (++removed === 2) throw new Error("denied");
      },
      write(key) {
        if (key === planKey) throw new Error("rollback denied");
      }
    }
  );
  const result = f.service.clear(f.service.snapshot());
  assert.equal(result.status, "partial");
  assert.equal(result.changed, 1);
  assert.equal(f.values.get(planKey), undefined);
  assert.equal(f.values.get(trialKey), "two");
});

test("并发页面的新值不被覆盖或撤销；新增未备份条目导致清空停止并回滚", () => {
  let removals = 0;
  const f = fixture(
    { [planKey]: "one", [trialKey]: "two" },
    {
      remove(key, map) {
        removals += 1;
        if (removals === 1) map.set(trialKey, "other-page");
      }
    }
  );
  assert.equal(f.service.clear(f.service.snapshot()).status, "stale");
  assert.equal(f.values.get(planKey), "one");
  assert.equal(f.values.get(trialKey), "other-page");
  const g = fixture(
    { [planKey]: "one" },
    {
      remove(key, map) {
        map.set(trialKey, "new-other-page");
      }
    }
  );
  assert.equal(g.service.clear(g.service.snapshot()).status, "stale");
  assert.equal(g.values.get(planKey), "one");
  assert.equal(g.values.get(trialKey), "new-other-page");
});

test("清空和导入的代次屏障阻止本页与其他旧页写回；刷新后的插件及游戏原生写入正常", () => {
  const f = fixture({ [planKey]: "old" });
  const local = codec.createStorage(f.storage);
  const other = codec.createStorage(f.adapter());
  const rawGuard = codec.guardStorage(f.storage);
  assert.equal(f.service.clear(f.service.snapshot()).status, "applied");
  for (const stale of [local, other, rawGuard]) {
    assert.throws(() => stale.setItem(planKey, "resurrect"), /reload/);
    assert.throws(() => stale.removeItem(trialKey), /reload/);
  }
  const fresh = codec.createStorage(f.adapter());
  fresh.setItem(planKey, "after-reload");
  assert.equal(f.values.get(planKey), "after-reload");
  assert.equal(f.service.restore(f.service.preview(backup({ [planKey]: "imported" })), true).status, "applied");
  assert.throws(() => fresh.setItem(planKey, "stale-overwrite"), /reload/);
  f.storage.setItem("game-token", "native-write");
  assert.equal(f.values.get("game-token"), "native-write");
});

test("无法保存操作屏障时不清空；读取不可用时不导出不完整备份", () => {
  const f = fixture(
    { [planKey]: "keep" },
    {
      write(key) {
        if (key === codec.GENERATION_KEY) throw new Error("quota");
      }
    }
  );
  assert.equal(f.service.clear(f.service.snapshot()).status, "failed");
  assert.equal(f.values.get(planKey), "keep");
  const g = fixture(
    { [planKey]: "keep" },
    {
      read() {
        throw new Error("denied");
      }
    }
  );
  assert.throws(() => g.service.snapshot(), /denied/);
  assert.deepEqual([...g.values], [[planKey, "keep"]]);
});

test("导入确认时不信任伪造的预览状态，未知键不能借预览写入", () => {
  const f = fixture({ [planKey]: "keep" });
  assert.throws(
    () =>
      f.service.restore({
        current: f.service.snapshot(),
        entries: [{ key: "game-token", rawValue: "injected", status: "new" }]
      }),
    /cacheInvalidBackup/
  );
  const plan = f.service.preview(backup({ [planKey]: "conflict" }));
  plan.entries[0].status = "new";
  assert.equal(f.service.restore(plan).changed, 0);
  assert.equal(f.values.get(planKey), "keep");
});

test("预览期间暂停本页写入，取消可恢复；不会暂停游戏原生存储或另一个页面", () => {
  const f = fixture({ [planKey]: "keep" });
  const local = codec.createStorage(f.storage);
  const other = codec.createStorage(f.adapter());
  const resume = f.service.pauseWrites();
  assert.throws(() => local.setItem(planKey, "paused"), /pending/);
  assert.throws(() => local.removeItem(planKey), /pending/);
  f.storage.setItem("game-native", "allowed");
  other.setItem(trialKey, "other-page-allowed");
  resume();
  resume();
  local.setItem(planKey, "after-cancel");
  assert.equal(f.values.get(planKey), "after-cancel");
  const again = f.service.pauseWrites();
  assert.equal(f.service.clear(f.service.snapshot()).status, "applied");
  again();
  assert.throws(() => local.setItem(planKey, "old-after-clear"), /reload/);
  assert.equal(f.values.get("game-native"), "allowed");
});

test("真正的游戏采集通过全部缓存备份恢复后仍可用于排名与报名判断", () => {
  const history = require("../src/trial-history.js");
  const week = config.GUILD_TRIAL_FIRST_START_AT + 13 * 604800000;
  const trialHrid = "/guild_skilling/milking";
  const context = {
    guild: {
      id: 7,
      name: "Test",
      currentWeekStartAt: week,
      currentTrialsData: { skilling: { parties: { [trialHrid]: { done: true } } } }
    },
    members: { 1: { name: "Low" }, 2: { name: "High" } }
  };
  const records = history.completedSnapshots(
    context,
    {
      type: "guild_trial_stats_updated",
      guildId: 7,
      guildTrialStatList: [
        { trialHrid, characterId: 1, workDone: 0 },
        { trialHrid, characterId: 2, workDone: 10000 }
      ]
    },
    week + 1000
  );
  const key = `mwi-guild-trial-history-v1:${planKey}:${encodeURIComponent(records[0].key)}`;
  const f = fixture({ [key]: JSON.stringify(records[0]) });
  const saved = f.service.parse(JSON.stringify(f.service.snapshot()));
  assert.equal(f.service.clear(saved).status, "applied");
  assert.equal(f.service.restore(f.service.preview(saved)).status, "applied");
  const restored = JSON.parse(codec.decode(f.values.get(key)));
  assert.equal(history.isGameCapture(restored), true);
  assert.deepEqual(history.playerRankings([restored]), history.playerRankings(records));
  const next = {
    guild: { id: 7, currentWeekStartAt: week + 604800000 },
    signups: { 1: { signedUpSkillingTrialHrid: trialHrid, signupWeekStartAt: week + 604800000 } }
  };
  assert.equal(history.signupWorkWarnings([restored], next, trialHrid).has("1"), true);
});
