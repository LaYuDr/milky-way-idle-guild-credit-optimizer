"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { equipmentLayout } = require("../src/ui/trial-player-view.js");
test("资料装备使用游戏槽位，双手装备占主手，未知和重复槽位不丢失", () => {
  const equipment = {
    a: { itemHrid: "/items/a", itemLocationHrid: "/item_locations/two_hand", enhancementLevel: 11 },
    b: { itemHrid: "/items/b", itemLocationHrid: "/item_locations/feet" },
    "/item_locations/milking_tool": { itemHrid: "/items/brush" },
    c: { itemHrid: "/items/c" },
    d: { itemHrid: "/items/d", itemLocationHrid: "/item_locations/feet" },
    invalid: null
  };
  const before = JSON.stringify(equipment);
  const { slots, extras } = equipmentLayout(equipment);
  assert.equal(slots.length, 24);
  assert.deepEqual(
    slots.find((slot) => slot.key === "main_hand"),
    { key: "main_hand", row: 2, column: 1, item: equipment.a }
  );
  assert.equal(slots.find((slot) => slot.key === "feet").row, 4);
  assert.equal(slots.find((slot) => slot.key === "milking_tool").row, 7);
  assert.equal(slots.find((slot) => slot.key === "milking_tool").item, equipment["/item_locations/milking_tool"]);
  assert.deepEqual(extras, [equipment.c, equipment.d]);
  assert.equal(JSON.stringify(equipment), before);
});
test("槽位缺失时可用官方物品类型补位，空槽位仍保留", () => {
  const item = { itemHrid: "/items/gloves" };
  const { slots, extras } = equipmentLayout(
    { unknown: item },
    { "/items/gloves": { equipmentDetail: { type: "/equipment_types/hands" } } }
  );
  assert.equal(slots.find((slot) => slot.key === "hands").item, item);
  assert.equal(slots.filter((slot) => !slot.item).length, 23);
  assert.equal(extras.length, 0);
});

test("技能方格固定五列和生活、基础战斗、战斗专精四行，缺失等级不补零", () => {
  const { skillLayout } = require("../src/ui/trial-player-view.js");
  const source = [
    { skillHrid: "/skills/magic", level: 98 },
    { skillHrid: "/skills/total_level", level: 1800 },
    { skillHrid: "/skills/milking", level: 0 },
    { skillHrid: "/skills/new_skill", level: 12 }
  ];
  const before = JSON.stringify(source);
  const slots = skillLayout(source);
  assert.deepEqual(
    slots.filter((slot) => slot.row === 1).map((slot) => slot.key),
    ["milking", "foraging", "woodcutting", "cheesesmithing", "crafting"]
  );
  assert.deepEqual(
    slots.filter((slot) => slot.row === 2).map((slot) => slot.key),
    ["tailoring", "cooking", "brewing", "alchemy", "enhancing"]
  );
  assert.deepEqual(
    slots.filter((slot) => slot.row === 3).map((slot) => slot.key),
    ["stamina", "intelligence", "attack", "defense"]
  );
  assert.deepEqual(
    slots.filter((slot) => slot.row === 4).map((slot) => slot.key),
    ["melee", "ranged", "magic"]
  );
  assert.equal(slots.find((slot) => slot.key === "milking").skill.level, 0);
  assert.equal(slots.find((slot) => slot.key === "foraging").skill, null);
  assert.equal(slots.find((slot) => slot.key === "magic").column, 3);
  assert.equal(slots.find((slot) => slot.key === "new_skill").row, 5);
  assert.ok(!slots.some((slot) => slot.key === "total_level"));
  assert.equal(JSON.stringify(source), before);
});

test("截图编号按角色身份稳定分配，同名不同 ID 与无 ID 记录保持独立", () => {
  const { createMemberNameFormatter } = require("../src/ui/trial-player-view.js");
  let enabled = false;
  const format = createMemberNameFormatter({
    isScreenshotMode: () => enabled,
    t: (key, values) => (key === "trialAnonymousPlayer" ? `玩家 ${values.number}` : "未知玩家")
  });
  const member = { id: "1", name: "Original" };
  assert.equal(format(member), "Original");
  enabled = true;
  assert.equal(format(member), "玩家 1");
  assert.equal(format({ id: "1", name: "Renamed" }), "玩家 1");
  assert.equal(format({ id: "2", name: "Original" }), "玩家 2");
  assert.equal(format({ id: null, name: "Original" }), "玩家 3");
  assert.equal(format({ id: null, name: "Original" }), "玩家 3");
  assert.equal(format({ id: null, name: "" }), "未知玩家");
  enabled = false;
  assert.equal(format(member), "Original");
  enabled = true;
  assert.equal(format(member), "玩家 1");
  assert.deepEqual(member, { id: "1", name: "Original" });
});

test("入会时间在资料就绪及加载失败时均可显示，未知时不产生虚假日期", () => {
  const { createRenderer } = require("../src/ui/trial-player-view.js");
  const api = require("../src/trial-history.js");
  const { createLocalizer } = require("../src/localization.js");
  const joinedAt = "2026-08-01T12:34:00.000Z";
  let context = api.updateContext(
    {},
    {
      guild: { id: "7" },
      guildCharacterMap: { 1: { joinTime: joinedAt } }
    },
    Date.parse("2026-09-01T00:00:00Z")
  );
  for (const locale of ["zh-CN", "en"]) {
    const { t } = createLocalizer(locale);
    const renderer = createRenderer({
      t,
      escapeHtml: (value) => String(value).replaceAll('"', "&quot;"),
      trialHistoryApi: api,
      getBridge: () => ({ trialHistoryContext: context }),
      isScreenshotMode: () => true,
      formatMemberName: (member) => member.name,
      profileIcon: () => "",
      resolveItemName: (hrid) => hrid
    });
    const render = (status, member = { id: "1", name: "Alpha" }) =>
      renderer.render({
        member,
        weeks: [],
        profileState: { status, profile: { totalLevel: 1800, combatLevel: 112.8 } }
      });
    for (const status of ["ready", "loading", "timeout", "unavailable", "mismatch"]) {
      const html = render(status);
      assert.match(html, /<time datetime="2026-08-01T12:34:00.000Z">\d{4}-\d{2}-\d{2} \d{2}:\d{2}<\/time>/);
      assert.ok(html.includes(t("trialProfileJoinedAt")));
      assert.ok(html.indexOf("data-trial-profile-joined-at") < html.indexOf('data-trial-profile-section="overview"'));
      if (status === "ready") assert.ok(html.indexOf("112.8") < html.indexOf("data-trial-profile-joined-at"));
    }
    const unknown = render("ready", { id: "2", name: "Alpha" });
    assert.ok(unknown.includes(`<dd>${t("trialProfileJoinedAtUnknown")}</dd>`));
    assert.ok(!unknown.includes("<time"));
  }
  context = {};
});

test("入会榜只列当前成员，按时间升序并列，未知排最后且无名次", () => {
  const { createRenderer } = require("../src/ui/trial-player-view.js");
  const api = require("../src/trial-history.js");
  const { createLocalizer } = require("../src/localization.js");
  const { rankingColumns } = require("../src/trial-display.js");
  const context = api.updateContext(
    {},
    {
      guild: { id: "g" },
      guildCharacterMap: {
        1: { name: "Later", joinTime: "2026-09-20T00:00:00Z" },
        2: { name: "Earlier", joinTime: "2026-08-01T00:00:00Z" },
        3: { name: "Unknown" },
        4: { name: "Equal", joinTime: "2026-08-01T00:00:00Z" }
      }
    },
    Date.parse("2026-09-26T00:00:00Z")
  );
  context.membershipEvidence.push({ characterId: "5", name: "Former", joinedAt: 1, observedAt: 2 });
  const before = JSON.stringify(context);
  assert.deepEqual(api.currentMembershipRankings({}), []);
  assert.equal(api.currentMembershipRankings(context).length, 4);
  for (const locale of ["zh-CN", "en"]) {
    const { t } = createLocalizer(locale);
    const renderer = createRenderer({
      t,
      escapeHtml: (s) => String(s).replaceAll('"', "&quot;"),
      trialHistoryApi: api,
      getBridge: () => ({ trialHistoryContext: context }),
      formatMemberName: (entry) => entry.name,
      memberIdentityAttributes: () => "",
      renderRail: (id, title, columns) => columns
    });
    const html = renderer.renderRankings({
      records: [],
      rankingOrder: ["joinedAt", ...rankingColumns.filter((key) => key !== "joinedAt")]
    });
    assert.ok(
      html.indexOf('data-trial-ranking-column="joinedAt"') < html.indexOf('data-trial-ranking-column="participations"')
    );
    assert.ok(html.indexOf(">Earlier</button>") < html.indexOf(">Later</button>"));
    assert.ok(html.indexOf(">Later</button>") < html.indexOf(">Unknown</button>"));
    const ranks = [...html.matchAll(/<tr data-trial-ranking-row="[^"]+"><td>(.*?)<\/td>/g)].map((match) => match[1]);
    assert.deepEqual(ranks, ["1", "1", "3", "—"]);
    assert.ok(html.includes(t("trialProfileJoinedAtUnknown")));
    assert.ok(!html.includes("Former"));
    assert.ok(html.includes('<time datetime="2026-09-20T00:00:00.000Z">'));
  }
  assert.equal(JSON.stringify(context), before);
});
