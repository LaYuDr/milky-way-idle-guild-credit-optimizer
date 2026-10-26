"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict");
const core = require("../src/core.js"),
  api = require("../src/runtime/upgrade-planning.js");
const hrid = "/guild_buffs/tempo_skilling";
function fixture() {
  let characterId = 42;
  const source = {
    shrines: [
      {
        hrid,
        level: 6,
        maxLevel: 7,
        detail: {
          buffs: [{ typeHrid: "/buff_types/action_speed", flatBoost: 0.005, flatBoostLevelBonus: 0.005 }],
          levelCosts: {
            7: { guildTokenCost: 5000, creditCosts: [{ itemHrid: "/items/green_guild_credit", count: 100 }] }
          }
        }
      }
    ],
    unitCosts: { "/items/green_guild_credit": 2710000 },
    exchangeRules: [],
    policy: { tokenCreditHrids: [] }
  };
  return {
    source,
    setOwner: (id) => {
      characterId = id;
    },
    provider: api.create({
      core,
      capture: async () => source,
      owner: () => characterId,
      hostname: "game.example",
      now: () => 100,
      version: "test"
    })
  };
}
test("只读规划复用核心：总成本与库存后现金分离，不改原计划", async () => {
  const x = fixture(),
    before = JSON.stringify(x.source),
    s = await x.provider.take(42);
  const q = x.provider.quote({
    snapshotId: s.id,
    characterId: 42,
    plans: [{ hrid, start: 6, target: 7 }],
    inventory: { "/items/green_guild_credit": 10, "/items/guild_token": 128 }
  });
  assert.equal(q.total.totalGold, 271e6);
  assert.equal(q.total.guildTokensRequired, 5000);
  assert.equal(q.cash.missingGold, 243.9e6);
  assert.equal(q.cash.guildTokensMissing, 4872);
  assert.equal(JSON.stringify(x.source), before);
  s.unitCosts["/items/green_guild_credit"] = 1;
  assert.equal(
    x.provider.quote({ snapshotId: s.id, characterId: 42, plans: [{ hrid, start: 6, target: 7 }] }).total.totalGold,
    271e6
  );
});
test("角色、等级和任意外部计划受限，换角色后旧快照拒绝", async () => {
  const x = fixture();
  await assert.rejects(x.provider.take(43));
  const s = await x.provider.take(42);
  assert.throws(() =>
    x.provider.quote({
      snapshotId: s.id,
      characterId: 42,
      plans: [{ hrid: "/guild_buffs/tempo_combat", start: 6, target: 7 }]
    })
  );
  x.setOwner(43);
  assert.throws(() => x.provider.quote({ snapshotId: s.id, characterId: 42, plans: [{ hrid, start: 6, target: 7 }] }));
});
