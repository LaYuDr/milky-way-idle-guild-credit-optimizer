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
