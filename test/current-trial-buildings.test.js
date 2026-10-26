"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const data = require("../src/guild-building-data.js");
const history = require("../src/trial-history.js");
const week = Date.parse("2026-10-23T00:00:00Z");
const now = week + 3600000;
const context = (skills) => ({ guild: { id: "7", currentWeekStartAt: week }, weeklyTrialSet: { skillHrids: skills } });
const names = (set) => [...set].map((hrid) => hrid.split("/").pop()).sort();

test("本周生活试炼与十种生活技能建筑准确对应，不包含通用营地或战斗建筑", () => {
  const skills = [
    "milking",
    "foraging",
    "woodcutting",
    "cheesesmithing",
    "crafting",
    "tailoring",
    "cooking",
    "brewing",
    "alchemy",
    "enhancing"
  ];
  const expected = [
    "dairy_barn",
    "garden",
    "log_shed",
    "forge",
    "workshop",
    "sewing_parlor",
    "kitchen",
    "brewery",
    "laboratory",
    "observatory"
  ];
  for (let index = 0; index < skills.length; index += 1) {
    const result = data.currentLifeTrialBuildings(context([`/guild_skilling/${skills[index]}`]), now);
    assert.deepEqual(names(result), [expected[index]]);
    assert.equal(data.definitions().find((entry) => entry.hrid === [...result][0]).category, "life");
  }
  assert.deepEqual(
    names(
      data.currentLifeTrialBuildings(
        context([
          "/guild_skilling/woodcutting",
          "/guild_skilling/tailoring",
          "/guild_skilling/brewing",
          "/guild_skilling/alchemy"
        ]),
        now
      )
    ),
    ["brewery", "laboratory", "log_shed", "sewing_parlor"]
  );
});

test("报名阶段优先本周官方项目表；明确空表不回退到旧项目", () => {
  const c = context(["/guild_skilling/milking"]);
  c.guild.currentTrialsData = { skilling: { parties: { "/guild_skilling/woodcutting": { done: true } } } };
  assert.deepEqual(names(data.currentLifeTrialBuildings(c, now)), ["dairy_barn"]);
  c.weeklyTrialSet.skillHrids = [];
  assert.deepEqual(names(data.currentLifeTrialBuildings(c, now)), []);
  delete c.weeklyTrialSet;
  assert.deepEqual(names(data.currentLifeTrialBuildings(c, now)), ["log_shed"]);
  c.guild.currentTrialsData.skilling.parties["/guild_skilling/woodcutting"].done = false;
  assert.deepEqual(names(data.currentLifeTrialBuildings(c, now)), ["log_shed"]);
});

test("未知或损坏数据、历史/未来周、不同公会均不误高亮，周末边界准时失效", () => {
  const c = context(["/guild_skilling/alchemy"]);
  for (const invalid of [
    null,
    {},
    { guild: {} },
    { ...c, guild: { id: "", currentWeekStartAt: week } },
    { ...c, guild: { id: 7, currentWeekStartAt: "bad" } }
  ])
    assert.equal(data.currentLifeTrialBuildings(invalid, now).size, 0);
  assert.equal(data.currentLifeTrialBuildings(c, week - 1).size, 0);
  assert.equal(data.currentLifeTrialBuildings(c, week).size, 1);
  assert.equal(data.currentLifeTrialBuildings(c, week + 604800000 - 1).size, 1);
  assert.equal(data.currentLifeTrialBuildings(c, week + 604800000).size, 0);
  assert.equal(data.currentLifeTrialBuildings(c, now, "other").size, 0);
  assert.equal(data.currentLifeTrialBuildings(c, now, 7).size, 1);
  assert.equal(data.currentLifeTrialBuildings(c, NaN).size, 0);
  c.guild.currentWeekStartAt = new Date(week).toISOString();
  assert.equal(data.currentLifeTrialBuildings(c, now).size, 1);
});

test("重复、未知及非生活项目被忽略，查询不改动官方上下文", () => {
  const c = context([
    "/guild_skilling/brewing",
    "/guild_skilling/brewing",
    "/guild_combat/badger",
    "/guild_skilling/unknown",
    null,
    {},
    "__proto__"
  ]);
  const before = JSON.stringify(c);
  assert.deepEqual(names(data.currentLifeTrialBuildings(c, now)), ["brewery"]);
  assert.equal(JSON.stringify(c), before);
  assert.deepEqual(
    names(
      data.currentLifeTrialBuildings(
        { guild: { id: 7, currentWeekStartAt: week, currentTrialsData: { skilling: { parties: [] } } } },
        now
      )
    ),
    []
  );
});

test("官方上下文换周、换公会清除旧项目，收到新表后才显示新项目", () => {
  const first = context(["/guild_skilling/woodcutting"]);
  const next = history.updateContext(first, { guild: { id: "7", currentWeekStartAt: week + 604800000 } });
  assert.equal(data.currentLifeTrialBuildings(next, week + 604800001).size, 0);
  const changed = history.updateContext(first, { guild: { id: "8", currentWeekStartAt: week } });
  assert.equal(data.currentLifeTrialBuildings(changed, now).size, 0);
  const updated = history.updateContext(changed, {
    guildId: 8,
    guildWeeklyTrialSet: { skillHrids: ["/guild_skilling/cooking"] }
  });
  assert.deepEqual(names(data.currentLifeTrialBuildings(updated, now, 8)), ["kitchen"]);
});
