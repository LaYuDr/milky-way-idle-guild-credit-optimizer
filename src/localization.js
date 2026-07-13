(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MwiGuildCreditLocalization = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const CHARM_TIERS = Object.freeze({
    Trainee: "实习",
    Basic: "基础",
    Advanced: "高级",
    Expert: "专家",
    Master: "大师",
    Grandmaster: "宗师"
  });
  const CHARM_ATTRIBUTES = Object.freeze({
    Milking: "挤奶",
    Foraging: "采摘",
    Woodcutting: "伐木",
    Crafting: "制作",
    Tailoring: "缝纫",
    Cooking: "烹饪",
    Brewing: "冲泡",
    Alchemy: "炼金",
    Enhancing: "强化",
    Stamina: "耐力",
    Intelligence: "智力",
    Attack: "攻击",
    Defense: "防御",
    Melee: "近战",
    Ranged: "远程",
    Magic: "魔法"
  });

  function simpleItemName(itemHrid) {
    return String(itemHrid || "").split("/").pop().replaceAll("_", " ");
  }

  function titleCase(value) {
    return String(value || "").replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function normalizeLocale(locale) {
    const value = String(locale || "").toLowerCase();
    if (value.startsWith("zh")) return "zh-CN";
    if (value.startsWith("en")) return "en";
    return "en";
  }

  function chineseItemName(englishName, dictionary) {
    if (dictionary[englishName]) return dictionary[englishName];

    const refined = englishName.match(/^(.*) Refined$/);
    if (refined && dictionary[refined[1]]) return `${dictionary[refined[1]]}（精）`;

    const ultraTea = englishName.match(/^Ultra (.+ Tea)$/);
    if (ultraTea && dictionary[ultraTea[1]]) return `究极${dictionary[ultraTea[1]]}`;

    const charm = englishName.match(/^(Trainee|Basic|Advanced|Expert|Master|Grandmaster) (Milking|Foraging|Woodcutting|Crafting|Tailoring|Cooking|Brewing|Alchemy|Enhancing|Stamina|Intelligence|Attack|Defense|Melee|Ranged|Magic) Charm$/);
    if (charm) return `${CHARM_TIERS[charm[1]]}${CHARM_ATTRIBUTES[charm[2]]}护符`;

    return englishName;
  }

  function localizeItemName(options) {
    const itemName = options && options.itemName;
    const itemHrid = options && options.itemHrid;
    const dictionary = options && options.chineseNames || {};
    const englishName = itemName && !String(itemName).startsWith("/items/") ? String(itemName) : titleCase(simpleItemName(itemHrid));
    if (/[\u3400-\u9fff]/.test(englishName) || normalizeLocale(options && options.locale) !== "zh-CN") return englishName;
    return chineseItemName(englishName, dictionary);
  }

  return { normalizeLocale, localizeItemName };
});
