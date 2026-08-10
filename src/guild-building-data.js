(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MwiGuildBuildingData = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const RULES_VERSION = "2026-08-04-v1";
  const MAX_LEVEL = 20;
  const BASE_LEVEL_COSTS = Object.freeze([
    null,
    1000,
    1350,
    1800,
    2450,
    3300,
    4500,
    6050,
    8150,
    11050,
    14900,
    20100,
    27150,
    36650,
    49450,
    66800,
    90150,
    121700,
    164300,
    221800,
    299450
  ]);

  const BUILDINGS = Object.freeze([
    { hrid: "/guild_buildings/guild_hall", nameKey: "buildingGuildHall", category: "core", costMultiplier: 1 },
    { hrid: "/guild_buildings/builders_hall", nameKey: "buildingBuildersHall", category: "core", costMultiplier: 1 },
    { hrid: "/guild_buildings/archives", nameKey: "buildingArchives", category: "core", costMultiplier: 1 },
    { hrid: "/guild_buildings/treasury", nameKey: "buildingTreasury", category: "core", costMultiplier: 1 },
    {
      hrid: "/guild_buildings/skilling_encampment",
      nameKey: "buildingSkillingEncampment",
      category: "life",
      costMultiplier: 0.5
    },
    { hrid: "/guild_buildings/workshop", nameKey: "buildingWorkshop", category: "life", costMultiplier: 0.5 },
    { hrid: "/guild_buildings/forge", nameKey: "buildingForge", category: "life", costMultiplier: 0.5 },
    { hrid: "/guild_buildings/log_shed", nameKey: "buildingLogShed", category: "life", costMultiplier: 0.5 },
    { hrid: "/guild_buildings/garden", nameKey: "buildingGarden", category: "life", costMultiplier: 0.5 },
    { hrid: "/guild_buildings/dairy_barn", nameKey: "buildingDairyBarn", category: "life", costMultiplier: 0.5 },
    { hrid: "/guild_buildings/kitchen", nameKey: "buildingKitchen", category: "life", costMultiplier: 0.5 },
    { hrid: "/guild_buildings/sewing_parlor", nameKey: "buildingSewingParlor", category: "life", costMultiplier: 0.5 },
    { hrid: "/guild_buildings/brewery", nameKey: "buildingBrewery", category: "life", costMultiplier: 0.5 },
    { hrid: "/guild_buildings/library", nameKey: "buildingLibrary", category: "life", costMultiplier: 0.5 },
    { hrid: "/guild_buildings/laboratory", nameKey: "buildingLaboratory", category: "life", costMultiplier: 0.5 },
    {
      hrid: "/guild_buildings/mystical_study",
      nameKey: "buildingMysticalStudy",
      category: "life",
      costMultiplier: 0.5
    },
    {
      hrid: "/guild_buildings/combat_encampment",
      nameKey: "buildingCombatEncampment",
      category: "combat",
      costMultiplier: 0.5
    },
    { hrid: "/guild_buildings/gym", nameKey: "buildingGym", category: "combat", costMultiplier: 0.5 },
    { hrid: "/guild_buildings/dojo", nameKey: "buildingDojo", category: "combat", costMultiplier: 0.5 },
    {
      hrid: "/guild_buildings/archery_range",
      nameKey: "buildingArcheryRange",
      category: "combat",
      costMultiplier: 0.5
    },
    { hrid: "/guild_buildings/armory", nameKey: "buildingArmory", category: "combat", costMultiplier: 0.5 },
    { hrid: "/guild_buildings/dining_room", nameKey: "buildingDiningRoom", category: "combat", costMultiplier: 0.5 },
    { hrid: "/guild_buildings/observatory", nameKey: "buildingObservatory", category: "combat", costMultiplier: 0.5 },
    { hrid: "/guild_shrines/tempo", nameKey: "shrineTempo", category: "shrine", costMultiplier: 1 },
    { hrid: "/guild_shrines/spirit", nameKey: "shrineSpirit", category: "shrine", costMultiplier: 1 },
    { hrid: "/guild_shrines/force", nameKey: "shrineForce", category: "shrine", costMultiplier: 1 },
    { hrid: "/guild_shrines/rarity", nameKey: "shrineRarity", category: "shrine", costMultiplier: 1 },
    { hrid: "/guild_shrines/scholar", nameKey: "shrineScholar", category: "shrine", costMultiplier: 1 }
  ]);

  function iconSymbolId(buildingHrid) {
    const building = BUILDINGS.find((entry) => entry.hrid === buildingHrid);
    if (!building) return "";
    const [group, name] = building.hrid.split("/").filter(Boolean);
    if (group === "guild_buildings") return `guild_${name}`;
    if (group === "guild_shrines") return `guild_shrine_${name}`;
    return "";
  }

  function levelCostsForMultiplier(multiplier) {
    const factor = Number(multiplier);
    return BASE_LEVEL_COSTS.map((cost) => (cost === null ? null : { guildPointCost: Math.round(cost * factor) }));
  }

  function definitions() {
    return BUILDINGS.map((building) => ({
      ...building,
      iconSymbolId: iconSymbolId(building.hrid),
      maxLevel: MAX_LEVEL,
      levelCosts: levelCostsForMultiplier(building.costMultiplier),
      rulesVersion: RULES_VERSION
    }));
  }

  return { RULES_VERSION, MAX_LEVEL, BASE_LEVEL_COSTS, BUILDINGS, iconSymbolId, levelCostsForMultiplier, definitions };
});
