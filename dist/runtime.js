// MWI_GUILD_CREDIT_RUNTIME
window.MwiGuildCreditVersion = "0.4.45";

(function () {
  "use strict";

  const page = typeof unsafeWindow === "undefined" ? window : unsafeWindow;
  const bridge = page.__mwiGuildCreditBridge || (page.__mwiGuildCreditBridge = {
    messages: [],
    itemDetails: null,
    guildBuffDetails: null,
    guildBuffLevels: null,
    characterItems: null
  });

  function keepGuildData(message) {
    if (!message || typeof message !== "object") return;
    const visited = new Set();
    const pending = [message];
    let scanned = 0;
    while (pending.length && scanned < 400) {
      const value = pending.pop();
      if (!value || typeof value !== "object" || visited.has(value)) continue;
      visited.add(value);
      scanned += 1;
      const itemDetails = value.itemDetailMap || value.itemDetailDict;
      const guildBuffDetails = value.guildBuffDetailMap || value.guildBuffDetailDict;
      const guildBuffLevels = value.characterGuildBuffMap || value.characterGuildBuffDict || value.characterGuildBuffs || value.characterGuildBuffLevelMap || value.characterGuildBuffLevelDict;
      const characterItems = value.characterItems;
      if (itemDetails && typeof itemDetails === "object") bridge.itemDetails = itemDetails;
      if (guildBuffDetails && typeof guildBuffDetails === "object") bridge.guildBuffDetails = guildBuffDetails;
      if (guildBuffLevels && typeof guildBuffLevels === "object") bridge.guildBuffLevels = guildBuffLevels;
      if (Array.isArray(characterItems)) bridge.characterItems = characterItems;
      for (const child of Object.values(value)) pending.push(child);
    }
  }

  const NativeWebSocket = page.WebSocket;
  if (!NativeWebSocket || NativeWebSocket.__mwiGuildCreditBridge) return;
  function ObservedWebSocket(...args) {
    const socket = new NativeWebSocket(...args);
    socket.addEventListener("message", (event) => {
      if (typeof event.data !== "string") return;
      bridge.messages.push(event.data);
      if (bridge.messages.length > 80) bridge.messages.shift();
      try {
        keepGuildData(JSON.parse(event.data));
      } catch (_) {
        // Ignore non-JSON protocol frames.
      }
    });
    return socket;
  }
  ObservedWebSocket.prototype = NativeWebSocket.prototype;
  Object.setPrototypeOf(ObservedWebSocket, NativeWebSocket);
  ObservedWebSocket.__mwiGuildCreditBridge = true;
  page.WebSocket = ObservedWebSocket;
})();


// Derived item-name mapping from the public Milky Way Idle Chinese translation
// (Greasy Fork script 490242), extracted on 2026-07-13.
(function (root, factory) {
  const names = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = names;
  root.MwiGuildCreditChineseItems = names;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  return Object.freeze({
  "Currencie": "货币",
  "Food": "食物",
  "Drink": "饮料",
  "Resource": "资源",
  "Consumable": "消耗品",
  "Ability Book": "技能书",
  "Equipment": "装备",
  "Tool": "工具",
  "Coin": "硬币",
  "Basic currency": "基础货币",
  "Task Token": "任务代币",
  "Cowbell": "牛铃",
  "Bag Of 10 Cowbells": "10牛铃包",
  "Milk": "牛奶",
  "mooo": "哞",
  "Verdant Milk": "翠绿牛奶",
  "moooo": "哞哞",
  "Azure Milk": "蔚蓝牛奶",
  "mooooo": "哞哞哞",
  "Burble Milk": "深紫牛奶",
  "moooooo": "哞哞哞哞",
  "Crimson Milk": "深红牛奶",
  "mooooooo": "哞哞哞哞哞",
  "Rainbow Milk": "彩虹牛奶",
  "moooooooo": "哞哞哞哞哞哞",
  "Holy Milk": "圣奶",
  "mooooooooo": "哞哞哞哞哞哞哞",
  "Cheese": "奶酪",
  "Verdant Cheese": "翠绿奶酪",
  "Azure Cheese": "蔚蓝奶酪",
  "Burble Cheese": "深紫奶酪",
  "Crimson Cheese": "深红奶酪",
  "Rainbow Cheese": "彩虹奶酪",
  "Holy Cheese": "圣奶酪",
  "Log": "原木",
  "Birch Log": "白桦原木",
  "Cedar Log": "雪松原木",
  "Purpleheart Log": "紫心原木",
  "Ginkgo Log": "银杏原木",
  "Redwood Log": "红木",
  "Arcane Log": "神秘原木",
  "Lumber": "木板",
  "Birch Lumber": "白桦木板",
  "Cedar Lumber": "雪松木板",
  "Purpleheart Lumber": "紫心木板",
  "Ginkgo Lumber": "银杏木板",
  "Redwood Lumber": "红木板",
  "Arcane Lumber": "神秘木板",
  "Rough Hide": "粗糙兽皮",
  "Reptile Hide": "爬行动物皮",
  "Gobo Hide": "哥布林皮",
  "Beast Hide": "野兽皮",
  "Umbral Hide": "暗影皮",
  "Rough Leather": "粗糙皮革",
  "Reptile Leather": "爬行动物皮革",
  "Gobo Leather": "哥布林皮革",
  "Beast Leather": "野兽皮革",
  "Umbral Leather": "暗影皮革",
  "Cotton": "棉花",
  "Flax": "亚麻",
  "Bamboo Branch": "竹子",
  "Cocoon": "茧",
  "Radiant Fiber": "光辉纤维",
  "Cotton Fabric": "棉花布料",
  "Linen Fabric": "亚麻布料",
  "Bamboo Fabric": "竹子布料",
  "Silk Fabric": "丝绸",
  "Radiant Fabric": "光辉布料",
  "Egg": "鸡蛋",
  "Wheat": "小麦",
  "Sugar": "糖",
  "Blueberry": "蓝莓",
  "Blackberry": "黑莓",
  "Strawberry": "草莓",
  "Mooberry": "月梅",
  "Marsberry": "火星梅",
  "Spaceberry": "太空梅",
  "Apple": "苹果",
  "Orange": "橙子",
  "Plum": "李子",
  "Peach": "桃子",
  "Dragon Fruit": "火龙果",
  "Star Fruit": "杨桃",
  "Arabica Coffee Bean": "小果咖啡豆",
  "Robusta Coffee Bean": "中果咖啡豆",
  "Liberica Coffee Bean": "大果咖啡豆",
  "Excelsa Coffee Bean": "高产咖啡豆",
  "Fieriosa Coffee Bean": "火山咖啡豆",
  "Spacia Coffee Bean": "太空咖啡豆",
  "Green Tea Leaf": "绿茶叶",
  "Black Tea Leaf": "黑茶叶",
  "Burble Tea Leaf": "紫茶叶",
  "Moolong Tea Leaf": "月亮茶叶",
  "Red Tea Leaf": "红茶叶",
  "Emp Tea Leaf": "虚空茶叶",
  "Snake Fang": "蛇牙",
  "Material used in smithing Snake Fang Dirk": "用于锻造蛇牙短剑的材料",
  "Shoebill Feather": "鲸头鹳羽毛",
  "Material used in tailoring Shoebill Shoes": "用于缝鲸头鹳鞋的材料",
  "Snail Shell": "蜗牛壳",
  "Crab Pincer": "蟹钳",
  "Material used in smithing Pincer Gloves": "用于锻造螯钳手套的材料",
  "Turtle Shell": "乌龟壳",
  "Marine Scale": "海洋鳞片",
  "Treant Bark": "树皮",
  "Material used in crafting Treant Shield": "用于制作树人盾的材料",
  "Centaur Hoof": "半人马蹄",
  "Material used in tailoring Centaur Boots": "用于缝半人马靴的材料",
  "Luna Wing": "月神翼",
  "Gobo Rag": "哥布林破布",
  "Goggles": "护目镜",
  "Material used in smithing Vision Helmet": "用于锻造视觉头盔的材料",
  "Magnifying Glass": "放大镜",
  "Eye Of The Watcher": "观察者之眼",
  "Icy Cloth": "冰霜布料",
  "Flaming Cloth": "燃烧的布料",
  "Sorcerer's Sole": "魔法师的鞋底",
  "Material used in tailoring Sorcerer Boots": "用于缝魔法师靴的材料",
  "Chrono Sphere": "时空球",
  "Frost Sphere": "冰霜球",
  "Material used in crafting Frost Staff": "用于制作霜之法杖的材料",
  "Panda Fluff": "熊猫绒",
  "Material used in smithing Panda Gloves": "用于锻造熊猫手套的材料",
  "Black Bear Fluff": "黑熊绒",
  "Material used in smithing Black Bear Shoes": "用于锻造黑熊鞋的材料",
  "Grizzly Bear Fluff": "灰熊绒",
  "Polar Bear Fluff": "北极熊绒",
  "Material used in smithing Polar Bear Shoes": "用于锻造北极熊鞋的材料",
  "Red Panda Fluff": "小熊猫绒",
  "Magnet": "磁铁",
  "Material used in smithing Magnetic Gloves": "用于锻造磁力手套的材料",
  "Stalactite Shard": "钟乳石碎片",
  "Living Granite": "活花岗岩",
  "Colossus Core": "巨像核心",
  "Vampire Fang": "吸血鬼牙",
  "Werewolf Claw": "狼爪",
  "Revenant Anima": "亡者之魂",
  "Soul Fragment": "灵魂碎片",
  "Infernal Ember": "地狱余烬",
  "Demonic Core": "恶魔核心",
  "Swamp Essence": "沼泽精华",
  "Aqua Essence": "海洋精华",
  "Jungle Essence": "丛林精华",
  "Gobo Essence": "哥布林精华",
  "Eyessence": "眼球精华",
  "Sorcerer Essence": "法师精华",
  "Bear Essence": "熊精华",
  "Golem Essence": "魔像精华",
  "Twilight Essence": "暮光之城精华",
  "Abyssal Essence": "地狱精华",
  "Star Fragment": "星星碎片",
  "Pearl": "珍珠",
  "Amber": "琥珀",
  "Garnet": "石榴石",
  "Jade": "翡翠",
  "Amethyst": "紫水晶",
  "Moonstone": "月亮石",
  "Crushed Pearl": "珍珠碎片",
  "Used to be a piece of pearl": "曾经是一颗珍珠",
  "Crushed Amber": "琥珀碎片",
  "Used to be a piece of amber": "曾经是一块琥珀",
  "Crushed Garnet": "石榴石碎片",
  "Used to be a piece of garnet": "曾经是一颗石榴石",
  "Crushed Jade": "翡翠碎片",
  "Used to be a piece of jade": "曾经是一块翡翠",
  "Crushed Amethyst": "紫水晶碎片",
  "Used to be a piece of amethyst": "曾经是一颗紫水晶",
  "Crushed Moonstone": "月亮石碎片",
  "Used to be a piece of moonstone": "曾经是一块月亮石",
  "Shard Of Protection": "保护碎片",
  "Mirror Of Protection": "保护之镜",
  "Donut": "甜甜圈",
  "Blueberry Donut": "蓝莓甜甜圈",
  "Blackberry Donut": "黑莓甜甜圈",
  "Strawberry Donut": "草莓甜甜圈",
  "Mooberry Donut": "月莓甜甜圈",
  "Marsberry Donut": "火星莓甜甜圈",
  "Spaceberry Donut": "太空莓甜甜圈",
  "Cupcake": "纸杯蛋糕",
  "Blueberry Cake": "蓝莓蛋糕",
  "Blackberry Cake": "黑莓蛋糕",
  "Strawberry Cake": "草莓蛋糕",
  "Mooberry Cake": "月莓蛋糕",
  "Marsberry Cake": "火星莓蛋糕",
  "Spaceberry Cake": "太空莓蛋糕",
  "Gummy": "软糖",
  "Apple Gummy": "苹果软糖",
  "Orange Gummy": "橙子软糖",
  "Plum Gummy": "李子软糖",
  "Peach Gummy": "桃子软糖",
  "Dragon Fruit Gummy": "火龙果软糖",
  "Star Fruit Gummy": "杨桃软糖",
  "Yogurt": "酸奶",
  "Apple Yogurt": "苹果酸奶",
  "Orange Yogurt": "橙子酸奶",
  "Plum Yogurt": "李子酸奶",
  "Peach Yogurt": "桃子酸奶",
  "Dragon Fruit Yogurt": "火龙果酸奶",
  "Star Fruit Yogurt": "杨桃酸奶",
  "Milking Tea": "挤奶茶",
  "Foraging Tea": "采集茶",
  "Woodcutting Tea": "伐木茶",
  "Cooking Tea": "烹饪茶",
  "Brewing Tea": "冲泡茶",
  "Enhancing Tea": "强化茶",
  "Cheesesmithing Tea": "奶酪锻造茶",
  "Crafting Tea": "制作茶",
  "Tailoring Tea": "裁缝茶",
  "Super Milking Tea": "超级挤奶茶",
  "Super Foraging Tea": "超级采集茶",
  "Super Woodcutting Tea": "超级伐木茶",
  "Super Cooking Tea": "超级烹饪茶",
  "Super Brewing Tea": "超级冲泡茶",
  "Super Enhancing Tea": "超级强化茶",
  "Super Cheesesmithing Tea": "超级奶酪锻造茶",
  "Super Crafting Tea": "超级制作茶",
  "Super Tailoring Tea": "超级裁缝茶",
  "Gathering Tea": "收集茶",
  "Gourmet Tea": "双倍茶",
  "Wisdom Tea": "经验茶",
  "Processing Tea": "加工茶",
  "Efficiency Tea": "效率茶",
  "Artisan Tea": "工匠茶",
  "Blessed Tea": "祝福茶",
  "Stamina Coffee": "体力咖啡",
  "Intelligence Coffee": "智力咖啡",
  "Defense Coffee": "防御咖啡",
  "Attack Coffee": "攻击咖啡",
  "Power Coffee": "力量咖啡",
  "Ranged Coffee": "远程咖啡",
  "Magic Coffee": "魔法咖啡",
  "Super Stamina Coffee": "超级体力咖啡",
  "Super Intelligence Coffee": "超级智力咖啡",
  "Super Defense Coffee": "超级防御咖啡",
  "Super Attack Coffee": "超级攻击咖啡",
  "Super Power Coffee": "超级力量咖啡",
  "Super Ranged Coffee": "超级远程咖啡",
  "Super Magic Coffee": "超级魔法咖啡",
  "Wisdom Coffee": "经验咖啡",
  "Lucky Coffee": "幸运咖啡",
  "Swiftness Coffee": "迅捷咖啡",
  "Channeling Coffee": "引导咖啡",
  "Critical Coffee": "暴击咖啡",
  "Poke": "戳",
  "Pokes the targeted enemy": "戳向目标敌人",
  "Pierce": "刺",
  "Pierces the targeted enemy": "刺穿目标敌人",
  "Puncture": "穿刺",
  "Scratch": "抓挠",
  "Scratches the targeted enemy": "抓伤目标敌人",
  "Cleave": "劈砍",
  "Cleaves all enemies": "劈砍所有敌人",
  "Maim": "重砍",
  "Smack": "锤击",
  "Smacks the targeted enemy": "猛击目标敌人",
  "Sweep": "横扫",
  "Performs a sweeping attack on all enemies": "对所有敌人进行横扫攻击",
  "Stunning Blow": "重锤",
  "Quick Shot": "快速射击",
  "Takes a quick shot at the targeted enemy": "对目标敌人进行快速射击",
  "Aqua Arrow": "流水箭",
  "Flame Arrow": "火焰箭",
  "Rain Of Arrows": "箭雨",
  "Shoots a rain of arrows on all enemies": "向所有敌人射出箭雨",
  "Silencing Shot": "沉默箭",
  "Steady Shot": "稳定射击",
  "Water Strike": "流水冲击",
  "Casts a water strike at the targeted enemy": "对目标敌人射出流水",
  "Ice Spear": "冰矛",
  "Casts an ice spear at the targeted enemy": "对目标敌人施放冰矛",
  "Frost Surge": "冰霜激涌",
  "Casts frost surge at all enemies": "对所有敌人施放冰霜激涌",
  "Entangle": "缠绕",
  "Entangles the targeted enemy": "缠绕目标敌人",
  "Toxic Pollen": "毒性花粉",
  "Casts toxic pollen at all enemies": "对所有敌人施放毒性花粉",
  "Nature's Veil": "自然面纱",
  "Fireball": "火球",
  "Casts a fireball at the targeted enemy": "对目标敌人施放火球",
  "Flame Blast": "火焰冲击",
  "Casts a flame blast at all enemies": "对所有敌人施放火焰冲击",
  "Firestorm": "火焰风暴",
  "Casts a firestorm at all enemies": "对所有敌人施放火焰风暴",
  "Minor Heal": "小治疗",
  "Casts minor heal on yourself": "对自己施放小治疗术",
  "Heal": "治疗",
  "Casts heal on yourself": "对自己施放治疗术",
  "Quick Aid": "快速援助",
  "Rejuvenate": "恢复活力",
  "Heals all allies": "治疗所有队友",
  "Taunt": "嘲讽",
  "Greatly increases threat rating": "大幅增加威胁等级",
  "Provoke": "挑衅",
  "Tremendously increases threat rating": "极大地增加威胁等级",
  "Toughness": "坚韧",
  "Elusiveness": "闪避",
  "Greatly increases evasion temporarily": "临时大幅增加闪避",
  "Precision": "精确",
  "Greatly increases accuracy temporarily": "临时大幅增加准确性",
  "Berserk": "狂暴",
  "Frenzy": "狂躁",
  "Greatly increases attack speed temporarily": "临时大幅增加攻击速度",
  "Elemental Affinity": "元素亲和",
  "Spike Shell": "尖刺壳",
  "Gains physical reflect power temporarily": "临时获得物理反射能力",
  "Vampirism": "吸血",
  "Gains lifesteal temporarily": "临时获得生命偷取",
  "Revive": "复活",
  "Revives a dead ally": "复活一个死亡的队友",
  "Insanity": "疯狂",
  "Invincible": "坚毅",
  "Fierce Aura": "物理光环",
  "Aqua Aura": "流水光环",
  "Sylvan Aura": "自然光环",
  "Flame Aura": "火焰光环",
  "Speed Aura": "速度光环",
  "Critical Aura": "暴击光环",
  "Increases critical rate for all allies": "增加所有队友的暴击率",
  "Gobo Stabber": "哥布林长剑",
  "Gobo Slasher": "哥布林关刀",
  "Gobo Smasher": "哥布林狼牙棒",
  "Spiked Bulwark": "尖刺盾",
  "Werewolf Slasher": "狼人关刀",
  "Gobo Shooter": "哥布林弹弓",
  "Vampiric Bow": "吸血弓",
  "Gobo Boomstick": "哥布林火枪",
  "Cheese Bulwark": "奶酪盾",
  "Verdant Bulwark": "翠绿盾",
  "Azure Bulwark": "蔚蓝盾",
  "Burble Bulwark": "深紫盾",
  "Crimson Bulwark": "深红盾",
  "Rainbow Bulwark": "彩虹盾",
  "Holy Bulwark": "神圣盾",
  "Wooden Bow": "木弓",
  "Birch Bow": "桦木弓",
  "Cedar Bow": "雪松弓",
  "Purpleheart Bow": "紫心弓",
  "Ginkgo Bow": "银杏弓",
  "Redwood Bow": "红木弓",
  "Arcane Bow": "神秘弓",
  "Stalactite Spear": "钟乳石长矛",
  "Granite Bludgeon": "花岗岩大棒",
  "Soul Hunter Crossbow": "灵魂猎手弩",
  "Frost Staff": "冰霜法杖",
  "Infernal Battlestaff": "炼狱法杖",
  "Cheese Sword": "奶酪剑",
  "Verdant Sword": "翠绿剑",
  "Azure Sword": "蔚蓝剑",
  "Burble Sword": "深紫剑",
  "Crimson Sword": "深红剑",
  "Rainbow Sword": "彩虹剑",
  "Holy Sword": "神圣剑",
  "Cheese Spear": "奶酪矛",
  "Verdant Spear": "翠绿矛",
  "Azure Spear": "蔚蓝矛",
  "Burble Spear": "深紫矛",
  "Crimson Spear": "深红矛",
  "Rainbow Spear": "彩虹矛",
  "Holy Spear": "神圣矛",
  "Cheese Mace": "奶酪狼牙棒",
  "Verdant Mace": "翠绿狼牙棒",
  "Azure Mace": "蔚蓝狼牙棒",
  "Burble Mace": "深紫狼牙棒",
  "Crimson Mace": "深红狼牙棒",
  "Rainbow Mace": "彩虹狼牙棒",
  "Holy Mace": "神圣狼牙棒",
  "Wooden Crossbow": "木弩",
  "Birch Crossbow": "桦木弩",
  "Cedar Crossbow": "雪松弩",
  "Purpleheart Crossbow": "紫心木弩",
  "Ginkgo Crossbow": "银杏弩",
  "Redwood Crossbow": "红木弩",
  "Arcane Crossbow": "神秘弩",
  "Wooden Water Staff": "木水法杖",
  "Birch Water Staff": "桦木水法杖",
  "Cedar Water Staff": "雪松水法杖",
  "Purpleheart Water Staff": "紫心木水法杖",
  "Ginkgo Water Staff": "银杏水法杖",
  "Redwood Water Staff": "红木水法杖",
  "Arcane Water Staff": "神秘水法杖",
  "Wooden Nature Staff": "木自然法杖",
  "Birch Nature Staff": "桦木自然法杖",
  "Cedar Nature Staff": "雪松自然法杖",
  "Purpleheart Nature Staff": "紫心木自然法杖",
  "Ginkgo Nature Staff": "银杏自然法杖",
  "Redwood Nature Staff": "红木自然法杖",
  "Arcane Nature Staff": "神秘自然法杖",
  "Wooden Fire Staff": "木火法杖",
  "Birch Fire Staff": "桦木火法杖",
  "Cedar Fire Staff": "雪松火法杖",
  "Purpleheart Fire Staff": "紫心木火法杖",
  "Ginkgo Fire Staff": "银杏火法杖",
  "Redwood Fire Staff": "红木火法杖",
  "Arcane Fire Staff": "神秘火法杖",
  "Eye Watch": "眼睛手表",
  "Snake Fang Dirk": "蛇牙短剑",
  "Vision Shield": "视觉盾",
  "Gobo Defender": "哥布林防御者",
  "Vampire Fang Dirk": "吸血鬼短剑",
  "Treant Shield": "树人盾",
  "Tome Of Healing": "治疗之书",
  "Tome Of The Elements": "元素之书",
  "Watchful Relic": "警戒遗物",
  "Cheese Buckler": "奶酪圆盾",
  "Verdant Buckler": "翠绿圆盾",
  "Azure Buckler": "蔚蓝圆盾",
  "Burble Buckler": "深紫圆盾",
  "Crimson Buckler": "深红圆盾",
  "Rainbow Buckler": "彩虹圆盾",
  "Holy Buckler": "神圣圆盾",
  "Wooden Shield": "木盾",
  "Birch Shield": "桦木盾",
  "Cedar Shield": "雪松盾",
  "Purpleheart Shield": "紫心木盾",
  "Ginkgo Shield": "银杏盾",
  "Redwood Shield": "红木盾",
  "Arcane Shield": "神秘盾",
  "Red Chef's Hat": "红色厨师帽",
  "Snail Shell Helmet": "蜗牛壳头盔",
  "Vision Helmet": "视觉头盔",
  "Fluffy Red Hat": "蓬松红帽子",
  "Cheese Helmet": "奶酪头盔",
  "Verdant Helmet": "翠绿头盔",
  "Azure Helmet": "蔚蓝头盔",
  "Burble Helmet": "深紫头盔",
  "Crimson Helmet": "深红头盔",
  "Rainbow Helmet": "彩虹头盔",
  "Holy Helmet": "神圣头盔",
  "Rough Hood": "粗糙兜帽",
  "Reptile Hood": "爬行动物兜帽",
  "Gobo Hood": "哥布林兜帽",
  "Beast Hood": "野兽兜帽",
  "Umbral Hood": "暗影兜帽",
  "Cotton Hat": "棉帽",
  "Linen Hat": "亚麻帽",
  "Bamboo Hat": "竹帽",
  "Silk Hat": "丝帽",
  "Radiant Hat": "光辉帽",
  "Gator Vest": "鳄鱼背心",
  "Turtle Shell Body": "龟壳板甲",
  "Colossus Plate Body": "巨像板甲",
  "Demonic Plate Body": "恶魔板甲",
  "Marine Tunic": "航海束腰",
  "Revenant Tunic": "亡灵外套",
  "Icy Robe Top": "冰霜长袍",
  "Flaming Robe Top": "燃烧长袍",
  "Luna Robe Top": "月亮长袍",
  "Cheese Plate Body": "奶酪板甲",
  "Verdant Plate Body": "翠绿板甲",
  "Azure Plate Body": "蔚蓝板甲",
  "Burble Plate Body": "深紫板甲",
  "Crimson Plate Body": "深红板甲",
  "Rainbow Plate Body": "彩虹板甲",
  "Holy Plate Body": "神圣板甲",
  "Rough Tunic": "粗糙束腰",
  "Reptile Tunic": "爬行动物束腰",
  "Gobo Tunic": "哥布林束腰",
  "Beast Tunic": "野兽束腰",
  "Umbral Tunic": "暗影束腰",
  "Cotton Robe Top": "棉布上衣",
  "Linen Robe Top": "亚麻上衣",
  "Bamboo Robe Top": "竹上衣",
  "Silk Robe Top": "丝绸上衣",
  "Radiant Robe Top": "光辉上衣",
  "Turtle Shell Legs": "龟壳护腿",
  "Colossus Plate Legs": "巨像板甲护腿",
  "Demonic Plate Legs": "恶魔板甲护腿",
  "Marine Chaps": "航海护腿",
  "Revenant Chaps": "亡灵护腿",
  "Icy Robe Bottoms": "冰霜下装",
  "Flaming Robe Bottoms": "燃烧下装",
  "Luna Robe Bottoms": "月亮下装",
  "Cheese Plate Legs": "奶酪板甲护腿",
  "Verdant Plate Legs": "翠绿板甲护腿",
  "Azure Plate Legs": "蔚蓝板甲护腿",
  "Burble Plate Legs": "深紫板甲护腿",
  "Crimson Plate Legs": "深红板甲护腿",
  "Rainbow Plate Legs": "彩虹板甲护腿",
  "Holy Plate Legs": "神圣板甲护腿",
  "Rough Chaps": "粗糙护腿",
  "Reptile Chaps": "爬行动物护腿",
  "Gobo Chaps": "哥布林护腿",
  "Beast Chaps": "野兽护腿",
  "Umbral Chaps": "暗影护腿",
  "Cotton Robe Bottoms": "棉长袍下装",
  "Linen Robe Bottoms": "亚麻长袍下装",
  "Bamboo Robe Bottoms": "竹长袍下装",
  "Silk Robe Bottoms": "丝长袍下装",
  "Radiant Robe Bottoms": "光辉长袍下装",
  "Enchanted Gloves": "附魔手套",
  "Pincer Gloves": "螯钳手套",
  "Panda Gloves": "熊猫手套",
  "Magnetic Gloves": "磁力手套",
  "Sighted Bracers": "瞄准护腕",
  "Chrono Gloves": "时空手套",
  "Cheese Gauntlets": "奶酪臂铠",
  "Verdant Gauntlets": "翠绿臂铠",
  "Azure Gauntlets": "蔚蓝臂铠",
  "Burble Gauntlets": "深紫臂铠",
  "Crimson Gauntlets": "深红臂铠",
  "Rainbow Gauntlets": "彩虹臂铠",
  "Holy Gauntlets": "神圣臂铠",
  "Rough Bracers": "粗糙护腕",
  "Reptile Bracers": "爬行动物护腕",
  "Gobo Bracers": "哥布林护腕",
  "Beast Bracers": "野兽护腕",
  "Umbral Bracers": "暗影护腕",
  "Cotton Gloves": "棉手套",
  "Linen Gloves": "亚麻手套",
  "Bamboo Gloves": "竹手套",
  "Silk Gloves": "丝手套",
  "Radiant Gloves": "光辉手套",
  "Collector's Boots": "收藏家靴",
  "Shoebill Shoes": "鲸头鹳鞋",
  "Black Bear Shoes": "黑熊鞋",
  "Grizzly Bear Shoes": "灰熊鞋",
  "Polar Bear Shoes": "北极熊鞋",
  "Centaur Boots": "半人马靴",
  "Sorcerer Boots": "巫师靴",
  "Cheese Boots": "奶酪靴",
  "Verdant Boots": "翠绿靴",
  "Azure Boots": "蔚蓝靴",
  "Burble Boots": "深紫靴",
  "Crimson Boots": "深红靴",
  "Rainbow Boots": "彩虹靴",
  "Holy Boots": "神圣靴",
  "Rough Boots": "粗糙靴",
  "Reptile Boots": "爬行动物靴",
  "Gobo Boots": "哥布林靴",
  "Beast Boots": "野兽靴",
  "Umbral Boots": "暗影靴",
  "Cotton Boots": "棉靴",
  "Linen Boots": "亚麻靴",
  "Bamboo Boots": "竹靴",
  "Silk Boots": "丝靴",
  "Radiant Boots": "光辉靴",
  "Necklace Of Efficiency": "效率项链",
  "Fighter Necklace": "战士项链",
  "Ranger Necklace": "游侠项链",
  "Wizard Necklace": "巫师项链",
  "Necklace Of Wisdom": "智慧项链",
  "Earrings Of Gathering": "采集耳环",
  "Earrings Of Armor": "护甲耳环",
  "Earrings Of Regeneration": "回复耳环",
  "Earrings Of Resistance": "抗性耳环",
  "Earrings Of Rare Find": "稀有发现耳环",
  "Ring Of Gathering": "采集戒指",
  "Ring Of Armor": "护甲戒指",
  "Ring Of Regeneration": "回复戒指",
  "Ring Of Resistance": "抗性戒指",
  "Ring Of Rare Find": "稀有发现戒指",
  "Small Pouch": "小袋子",
  "Medium Pouch": "中袋子",
  "Large Pouch": "大袋子",
  "Giant Pouch": "巨大袋子",
  "Cheese Brush": "奶酪刷子",
  "Verdant Brush": "翠绿刷子",
  "Azure Brush": "蔚蓝刷子",
  "Burble Brush": "深紫刷子",
  "Crimson Brush": "深红刷子",
  "Rainbow Brush": "彩虹刷子",
  "Holy Brush": "神圣刷子",
  "Cheese Shears": "奶酪剪刀",
  "Verdant Shears": "翠绿剪刀",
  "Azure Shears": "蔚蓝剪刀",
  "Burble Shears": "深紫剪刀",
  "Crimson Shears": "深红剪刀",
  "Rainbow Shears": "彩虹剪刀",
  "Holy Shears": "神圣剪刀",
  "Cheese Hatchet": "奶酪斧头",
  "Verdant Hatchet": "翠绿斧头",
  "Azure Hatchet": "蔚蓝斧头",
  "Burble Hatchet": "深紫斧头",
  "Crimson Hatchet": "深红斧头",
  "Holy Hatchet": "神圣斧头",
  "Rainbow Hatchet": "彩虹斧头",
  "Cheese Hammer": "奶酪锤",
  "Verdant Hammer": "翠绿锤",
  "Azure Hammer": "蔚蓝锤",
  "Burble Hammer": "深紫锤",
  "Crimson Hammer": "深红锤",
  "Rainbow Hammer": "彩虹锤",
  "Holy Hammer": "神圣锤",
  "Cheese Chisel": "奶酪凿子",
  "Verdant Chisel": "翠绿凿子",
  "Azure Chisel": "蔚蓝凿子",
  "Burble Chisel": "深紫凿子",
  "Crimson Chisel": "深红凿子",
  "Rainbow Chisel": "彩虹凿子",
  "Holy Chisel": "神圣凿子",
  "Cheese Spatula": "奶酪铲子",
  "Verdant Spatula": "翠绿铲子",
  "Azure Spatula": "蔚蓝铲子",
  "Burble Spatula": "深紫铲子",
  "Crimson Spatula": "深红铲子",
  "Rainbow Spatula": "彩虹铲子",
  "Holy Spatula": "神圣铲子",
  "Cheese Needle": "奶酪针",
  "Verdant Needle": "翠绿针",
  "Azure Needle": "蔚蓝针",
  "Burble Needle": "深紫针",
  "Crimson Needle": "深红针",
  "Rainbow Needle": "彩虹针",
  "Holy Needle": "神圣针",
  "Cheese Pot": "奶酪锅",
  "Verdant Pot": "翠绿锅",
  "Azure Pot": "蔚蓝锅",
  "Burble Pot": "深紫锅",
  "Crimson Pot": "深红锅",
  "Rainbow Pot": "彩虹锅",
  "Holy Pot": "神圣锅",
  "Cheese Enhancer": "奶酪强化器",
  "Verdant Enhancer": "翠绿强化器",
  "Azure Enhancer": "蔚蓝强化器",
  "Burble Enhancer": "深紫强化器",
  "Crimson Enhancer": "赤红强化器",
  "Rainbow Enhancer": "彩虹强化器",
  "Holy Enhancer": "神圣强化器",
  "Small Meteorite Cache": "小型陨石",
  "Medium Meteorite Cache": "中型陨石",
  "Large Meteorite Cache": "大型陨石",
  "Small Artisan's Crate": "工匠的小型箱子",
  "Medium Artisan's Crate": "工匠的中型箱子",
  "Large Artisan's Crate": "工匠的大型箱子",
  "Small Treasure Chest": "小型宝箱",
  "Medium Treasure Chest": "中型宝箱",
  "Large Treasure Chest": "大型宝箱",
  "Purple's Gift": "紫色的礼物"
});
});


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


(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MwiGuildCreditCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function positiveInteger(value) {
    const number = Number(value);
    return Number.isSafeInteger(number) && number > 0 ? number : null;
  }

  function normalizeAsks(orderBook) {
    if (!orderBook || !Array.isArray(orderBook.asks)) return [];
    return orderBook.asks
      .map((ask) => ({ price: Number(ask.price), quantity: Number(ask.quantity) }))
      .filter((ask) => Number.isFinite(ask.price) && ask.price >= 0 && Number.isSafeInteger(ask.quantity) && ask.quantity > 0)
      .sort((left, right) => left.price - right.price);
  }

  function quoteAsks(orderBook, requestedQuantity) {
    const quantity = positiveInteger(requestedQuantity);
    if (!quantity) return { status: "invalid_quantity", requestedQuantity, availableQuantity: 0, cost: null, fills: [] };

    let remaining = quantity;
    let cost = 0;
    let availableQuantity = 0;
    const fills = [];

    for (const ask of normalizeAsks(orderBook)) {
      availableQuantity += ask.quantity;
      if (remaining === 0) continue;
      const take = Math.min(remaining, ask.quantity);
      cost += take * ask.price;
      fills.push({ price: ask.price, quantity: take });
      remaining -= take;
    }

    if (remaining > 0) {
      return { status: "insufficient_depth", requestedQuantity: quantity, availableQuantity, cost: null, fills };
    }
    return { status: "ok", requestedQuantity: quantity, availableQuantity, cost, fills };
  }

  function evaluateConversion(conversion, orderBook, targetCredits) {
    const target = positiveInteger(targetCredits);
    const itemCount = positiveInteger(conversion && conversion.itemCount);
    const creditCount = positiveInteger(conversion && conversion.creditCount);
    if (!target || !itemCount || !creditCount) {
      return { status: "invalid_conversion", conversion, targetCredits };
    }

    const batches = Math.ceil(target / creditCount);
    const requiredItems = batches * itemCount;
    const actualCredits = batches * creditCount;
    const quote = quoteAsks(orderBook, requiredItems);
    const base = {
      status: quote.status,
      itemHrid: conversion.itemHrid,
      itemName: conversion.itemName || conversion.itemHrid,
      creditItemHrid: conversion.creditItemHrid,
      itemCount,
      creditCount,
      targetCredits: target,
      batches,
      requiredItems,
      actualCredits,
      availableQuantity: quote.availableQuantity,
      fills: quote.fills,
      buyerFee: 0
    };
    if (quote.status !== "ok") return { ...base, cost: null, costPerCredit: null };
    return { ...base, cost: quote.cost, costPerCredit: quote.cost / actualCredits };
  }

  function rankConversions(conversions, orderBooks, targetCredits) {
    return conversions
      .map((conversion) => evaluateConversion(conversion, orderBooks[conversion.itemHrid], targetCredits))
      .sort((left, right) => {
        if (left.status === "ok" && right.status !== "ok") return -1;
        if (right.status === "ok" && left.status !== "ok") return 1;
        if (left.status !== "ok" || right.status !== "ok") return left.itemName.localeCompare(right.itemName, "zh-CN");
        return left.costPerCredit - right.costPerCredit || left.cost - right.cost || left.itemName.localeCompare(right.itemName, "zh-CN");
      });
  }

  function rankGuildTokenCreditValues(exchangeRules, rankedCredits) {
    const rankings = rankedCredits && typeof rankedCredits === "object" ? rankedCredits : {};
    return (Array.isArray(exchangeRules) ? exchangeRules : [])
      .map((rule) => {
        const guildTokenCount = positiveInteger(rule && rule.guildTokenCount);
        const creditCount = positiveInteger(rule && rule.creditCount);
        const creditItemHrid = rule && rule.creditItemHrid;
        if (!guildTokenCount || !creditCount || !creditItemHrid) {
          return { status: "invalid_rule", rule };
        }
        const best = (Array.isArray(rankings[creditItemHrid]) ? rankings[creditItemHrid] : [])
          .find((result) => result && result.status === "ok" && Number.isFinite(result.costPerCredit));
        if (!best) {
          return { status: "unpriced", guildTokenCount, creditCount, creditItemHrid };
        }
        return {
          status: "ok",
          guildTokenCount,
          creditCount,
          creditItemHrid,
          // A token's value is based on the exchange rule's credit quantity, not
          // the minimum purchasable batch. This avoids overstating sparse credits.
          goldValue: best.costPerCredit * creditCount,
          goldValuePerToken: (best.costPerCredit * creditCount) / guildTokenCount,
          bestItemHrid: best.itemHrid,
          bestItemName: best.itemName
        };
      });
  }

  function evaluateBudgetConversion(conversion, buyPrice, budget) {
    const itemCount = positiveInteger(conversion && conversion.itemCount);
    const creditCount = positiveInteger(conversion && conversion.creditCount);
    const price = Number(buyPrice);
    const availableBudget = Number(budget);
    if (!itemCount || !creditCount || !Number.isFinite(price) || price <= 0 || !Number.isFinite(availableBudget) || availableBudget < 0) {
      return { status: "invalid_conversion", conversion, buyPrice, budget };
    }

    const batchCost = itemCount * price;
    const batches = Math.floor(availableBudget / batchCost);
    const requiredItems = batches * itemCount;
    const actualCredits = batches * creditCount;
    const cost = requiredItems * price;
    return {
      status: actualCredits > 0 ? "ok" : "unaffordable",
      itemHrid: conversion.itemHrid,
      itemName: conversion.itemName || conversion.itemHrid,
      creditItemHrid: conversion.creditItemHrid,
      itemCount,
      creditCount,
      buyPrice: price,
      budget: availableBudget,
      batches,
      requiredItems,
      actualCredits,
      cost,
      remainingBudget: availableBudget - cost,
      costPerCredit: batchCost / creditCount,
      buyerFee: 0
    };
  }

  function bestConversionForBudget(conversions, buyPrices, budget) {
    const candidates = (Array.isArray(conversions) ? conversions : [])
      .map((conversion) => evaluateBudgetConversion(conversion, buyPrices && buyPrices[conversion.itemHrid], budget))
      .filter((result) => result.status === "ok")
      .sort((left, right) => (
        right.actualCredits - left.actualCredits ||
        left.costPerCredit - right.costPerCredit ||
        left.cost - right.cost ||
        left.itemName.localeCompare(right.itemName, "zh-CN")
      ));
    return candidates[0] || null;
  }

  function estimateSaleReplacement(options) {
    const selectedConversion = options && options.selectedConversion;
    const batches = positiveInteger(options && options.batches);
    const selectedItemCount = positiveInteger(selectedConversion && selectedConversion.itemCount);
    const selectedCreditCount = positiveInteger(selectedConversion && selectedConversion.creditCount);
    if (!batches || !selectedItemCount || !selectedCreditCount) {
      return { status: "invalid_selection", options };
    }

    const directCredits = batches * selectedCreditCount;
    const sale = calculateSaleProceeds(
      batches * selectedItemCount,
      options && options.sellPrice,
      options && options.sellerTaxRate
    );
    if (sale.status !== "ok") return { status: sale.status, directCredits, sale };

    const best = bestConversionForBudget(options && options.conversions, options && options.buyPrices, sale.net);
    if (!best) return { status: "no_affordable_conversion", directCredits, sale, best: null };
    if (best.itemHrid === selectedConversion.itemHrid) {
      return { status: "already_optimal", directCredits, sale, best, creditDifference: 0 };
    }

    return {
      status: "ok",
      directCredits,
      sale,
      best,
      creditDifference: best.actualCredits - directCredits
    };
  }

  function calculateSaleProceeds(quantity, sellPrice, sellerTaxRate) {
    const itemQuantity = positiveInteger(quantity);
    const price = Number(sellPrice);
    const taxRate = Number(sellerTaxRate);
    if (!itemQuantity || !Number.isFinite(price) || price <= 0 || !Number.isFinite(taxRate) || taxRate < 0 || taxRate >= 1) {
      return { status: "invalid_sale", quantity, sellPrice, sellerTaxRate, gross: null, tax: null, net: null };
    }
    const gross = itemQuantity * price;
    const tax = Math.floor(gross * taxRate);
    return { status: "ok", quantity: itemQuantity, sellPrice: price, sellerTaxRate: taxRate, gross, tax, net: gross - tax };
  }

  function snapshotMarketPrice(snapshot, itemHrid, enhancementLevel, field) {
    const level = Number(enhancementLevel);
    if (!itemHrid || !Number.isSafeInteger(level) || level < 0 || (field !== "a" && field !== "b")) return null;
    const entry = snapshot && snapshot.marketData && snapshot.marketData[itemHrid] && snapshot.marketData[itemHrid][String(level)];
    const price = Number(entry && entry[field]);
    return Number.isFinite(price) && price > 0 ? price : null;
  }

  function formatCompactCost(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "-";
    const rounded = Math.round(number);
    if (rounded < 10000) return String(rounded);
    const thousands = Math.round(rounded / 1000);
    if (thousands < 10000) return `${thousands}k`;
    return `${Math.round(rounded / 1000000)}m`;
  }

  function compareVersions(currentVersion, latestVersion) {
    const parse = (value) => (String(value || "").match(/\d+/g) || []).map(Number);
    const current = parse(currentVersion);
    const latest = parse(latestVersion);
    const length = Math.max(current.length, latest.length);
    for (let index = 0; index < length; index += 1) {
      const difference = (current[index] || 0) - (latest[index] || 0);
      if (difference !== 0) return difference;
    }
    return 0;
  }

  function aggregateGuildBuffLevelCosts(levelCosts, startLevel, targetLevel) {
    const start = Number(startLevel);
    const target = Number(targetLevel);
    const costs = Array.isArray(levelCosts) ? levelCosts : levelCosts && typeof levelCosts === "object" ? levelCosts : null;
    if (!costs || !Number.isSafeInteger(start) || !Number.isSafeInteger(target) || start < 0 || target <= start) {
      return { status: "invalid_range", startLevel, targetLevel, totals: [] };
    }

    const maxLevel = Array.isArray(costs)
      ? costs.length - 1
      : Math.max(...Object.keys(costs).map(Number).filter(Number.isSafeInteger));
    if (!Number.isSafeInteger(maxLevel) || target > maxLevel) {
      return { status: "invalid_range", startLevel: start, targetLevel: target, maxLevel, totals: [] };
    }

    const totals = new Map();
    const add = (itemHrid, count) => {
      const quantity = Number(count);
      if (!itemHrid || !Number.isFinite(quantity) || quantity <= 0) return;
      totals.set(itemHrid, (totals.get(itemHrid) || 0) + quantity);
    };

    for (let level = start + 1; level <= target; level += 1) {
      const cost = costs[level];
      if (!cost || typeof cost !== "object") {
        return { status: "missing_cost", startLevel: start, targetLevel: target, maxLevel, missingLevel: level, totals: [] };
      }
      add("/items/guild_token", cost.guildTokenCost);
      for (const creditCost of cost.creditCosts || []) add(creditCost.itemHrid, creditCost.count);
    }

    return {
      status: "ok",
      startLevel: start,
      targetLevel: target,
      maxLevel,
      totals: [...totals.entries()]
        .map(([itemHrid, count]) => ({ itemHrid, count }))
        .sort((left, right) => left.itemHrid.localeCompare(right.itemHrid))
    };
  }

  function aggregateGuildBuffPlans(plans) {
    if (!Array.isArray(plans) || plans.length === 0) return { status: "invalid_plans", plans: [], totals: [] };

    const totals = new Map();
    const results = [];
    for (let index = 0; index < plans.length; index += 1) {
      const plan = plans[index];
      const result = aggregateGuildBuffLevelCosts(plan && plan.levelCosts, plan && plan.startLevel, plan && plan.targetLevel);
      if (result.status !== "ok") return { status: "invalid_plan", planIndex: index, result, plans: results, totals: [] };
      results.push({ ...result, id: plan && plan.id, guildBuffHrid: plan && plan.guildBuffHrid });
      for (const item of result.totals) totals.set(item.itemHrid, (totals.get(item.itemHrid) || 0) + item.count);
    }

    return {
      status: "ok",
      plans: results,
      totals: [...totals.entries()]
        .map(([itemHrid, count]) => ({ itemHrid, count }))
        .sort((left, right) => left.itemHrid.localeCompare(right.itemHrid))
    };
  }

  function estimateGuildUpgradeCosts(totals, creditUnitCosts, inventoryCounts) {
    const unitCosts = creditUnitCosts && typeof creditUnitCosts === "object" ? creditUnitCosts : {};
    const inventory = inventoryCounts && typeof inventoryCounts === "object" ? inventoryCounts : {};
    const rows = [];
    const unpricedItemHrids = [];
    let totalGold = 0;
    let missingGold = 0;
    let guildTokensRequired = 0;
    let guildTokensOwned = 0;

    for (const item of Array.isArray(totals) ? totals : []) {
      const itemHrid = item && item.itemHrid;
      const required = Number(item && item.count);
      if (!itemHrid || !Number.isFinite(required) || required <= 0) continue;
      const owned = Math.max(0, Number(inventory[itemHrid]) || 0);
      const missing = Math.max(0, required - owned);
      if (itemHrid === "/items/guild_token") {
        guildTokensRequired += required;
        guildTokensOwned += owned;
        rows.push({ itemHrid, required, owned, missing, unitCost: null, totalCost: null, missingCost: null });
        continue;
      }
      const unitCost = Number(unitCosts[itemHrid]);
      const priced = Number.isFinite(unitCost) && unitCost > 0;
      if (priced) {
        totalGold += required * unitCost;
        missingGold += missing * unitCost;
      } else {
        unpricedItemHrids.push(itemHrid);
      }
      rows.push({
        itemHrid,
        required,
        owned,
        missing,
        unitCost: priced ? unitCost : null,
        totalCost: priced ? required * unitCost : null,
        missingCost: priced ? missing * unitCost : null
      });
    }

    return {
      status: unpricedItemHrids.length ? "partial" : "ok",
      totalGold,
      missingGold,
      guildTokensRequired,
      guildTokensOwned,
      guildTokensMissing: Math.max(0, guildTokensRequired - guildTokensOwned),
      unpricedItemHrids,
      rows
    };
  }

  function conversionsFromItemDetails(itemDetails, creditItemHrid) {
    const details = Array.isArray(itemDetails)
      ? itemDetails.map((detail) => [detail && (detail.itemHrid || detail.hrid), detail])
      : Object.entries(itemDetails || {});
    return details.flatMap(([itemKey, detail]) => (detail && Array.isArray(detail.guildCreditConversions) ? detail.guildCreditConversions : [])
      .filter((conversion) => conversion.creditItemHrid === creditItemHrid)
      .map((conversion) => ({
        itemHrid: detail.itemHrid || detail.hrid || itemKey,
        itemName: detail.name || detail.itemHrid || detail.hrid || itemKey,
        creditItemHrid: conversion.creditItemHrid,
        itemCount: conversion.itemCount,
        creditCount: conversion.creditCount
      }))
      .filter((conversion) => conversion.itemHrid && positiveInteger(conversion.itemCount) && positiveInteger(conversion.creditCount)));
  }

  return { normalizeAsks, quoteAsks, evaluateConversion, rankConversions, rankGuildTokenCreditValues, evaluateBudgetConversion, bestConversionForBudget, calculateSaleProceeds, estimateSaleReplacement, snapshotMarketPrice, formatCompactCost, compareVersions, aggregateGuildBuffLevelCosts, aggregateGuildBuffPlans, estimateGuildUpgradeCosts, conversionsFromItemDetails };
});


(function () {
  "use strict";

  const core = window.MwiGuildCreditCore;
  const localization = window.MwiGuildCreditLocalization;
  if (!core || !localization) return;
  const pageWindow = typeof unsafeWindow === "undefined" ? window : unsafeWindow;
  const PLUGIN_VERSION = String(window.MwiGuildCreditVersion || "0.0.0");
  const UPDATE_SCRIPT_URL = "https://raw.githubusercontent.com/LaYuDr/milky-way-idle-guild-credit-optimizer/main/dist/milky-way-idle-guild-credit-optimizer.user.js";
  const PRICE_REFERENCE_STORAGE_KEY = "mwi-credit-price-reference";
  const PRICE_REFERENCES = {
    a: { label: "左一", title: "左一：最低出售价，可立即买入" },
    b: { label: "右一", title: "右一：最高收购价，仅作理论参考" }
  };

  const CREDIT_TYPES = [
    ["/items/green_guild_credit", "绿色", "#42c59f"],
    ["/items/brown_guild_credit", "棕色", "#c58a42"],
    ["/items/white_guild_credit", "白色", "#e8e9ef"],
    ["/items/blue_guild_credit", "蓝色", "#4c99e8"],
    ["/items/purple_guild_credit", "紫色", "#9567da"],
    ["/items/red_guild_credit", "红色", "#df4c5a"],
    ["/items/silver_guild_credit", "银色", "#c4cad5"],
    ["/items/gold_guild_credit", "金色", "#d8a33c"]
  ];
  const GUILD_TOKEN_CREDIT_CONVERSIONS = [
    { creditItemHrid: "/items/green_guild_credit", guildTokenCount: 1, creditCount: 10 },
    { creditItemHrid: "/items/brown_guild_credit", guildTokenCount: 1, creditCount: 10 },
    { creditItemHrid: "/items/white_guild_credit", guildTokenCount: 1, creditCount: 10 },
    { creditItemHrid: "/items/blue_guild_credit", guildTokenCount: 1, creditCount: 10 },
    { creditItemHrid: "/items/purple_guild_credit", guildTokenCount: 1, creditCount: 1 },
    { creditItemHrid: "/items/red_guild_credit", guildTokenCount: 1, creditCount: 1 },
    { creditItemHrid: "/items/silver_guild_credit", guildTokenCount: 10, creditCount: 1 },
    { creditItemHrid: "/items/gold_guild_credit", guildTokenCount: 60, creditCount: 1 }
  ];
  const SELLER_TAX_RATE = 0.02;
  const GUILD_SHRINE_NAMES = {
    "/guild_shrines/force": "力量神龛",
    "/guild_shrines/tempo": "节奏神龛",
    "/guild_shrines/spirit": "精神神龛",
    "/guild_shrines/rarity": "稀有神龛",
    "/guild_shrines/scholar": "学者神龛"
  };
  // Recent game items are not present in the historical public translation map.
  // Keep these overrides small and explicit so a new game item falls back to English
  // instead of receiving an unreliable machine translation.
  const chineseItemNames = {
    ...(window.MwiGuildCreditChineseItems || {}),
    "Shield Bash": "盾击",
    "Fracturing Impact": "碎裂冲击",
    "Life Drain": "生命汲取",
    "Retribution": "复仇",
    "Crippling Slash": "致残斩",
    "Catalytic Tea": "催化茶",
    "Red Culinary Hat": "红色厨师帽",
    "Philosopher's Necklace": "贤者项链",
    "Philosopher's Ring": "贤者戒指",
    "Necklace Of Speed": "速度项链",
    "Philosopher's Earrings": "贤者耳环",
    "Advanced Melee Charm": "高级近战护符",
    "Advanced Defense Charm": "高级防御护符",
    "Advanced Intelligence Charm": "高级智力护符",
    "Expert Melee Charm": "专家近战护符",
    "Basic Attack Charm": "基础攻击护符",
    "Labyrinth Refinement Shard": "迷宫精炼碎片",
    "Thread Of Expertise": "专精丝线",
    "Butter Of Proficiency": "熟练黄油",
    "Guild Token": "公会代币",
    "Master Magic Charm": "大师魔法护符",
    "Master Ranged Charm": "大师远程护符",
    "Master Stamina Charm": "大师体力护符",
    "Philosopher's Mirror": "贤者之镜",
    "Philosopher's Stone": "贤者之石"
  };
  const state = { itemDetails: null, conversionCache: new Map(), guildBuffDetails: null, guildBuffLevels: null, characterItems: null, pageItemNames: Object.create(null), upgradePlans: [], nextUpgradePlanId: 1, snapshot: null, priceReference: savedPriceReference(), panel: null, creditTab: null, hiddenSidebarNodes: [], refreshTimer: null, refreshInFlight: false, refreshQueued: false, panelSearchTimer: null, collapsedCreditSections: new Set(), guildTokenValuesCollapsed: false, upgradeRefreshId: 0, exchangeAdvisorUi: null, exchangeAdvisorFrame: null, exchangeAdvisorForceRender: false, exchangeAdvisorObserver: null, exchangeAdvisorListenersInstalled: false, exchangeAdvisorLoadInFlight: false, exchangeAdvisorSnapshotFailed: false };

  function savedPriceReference() {
    try {
      const saved = pageWindow.localStorage && pageWindow.localStorage.getItem(PRICE_REFERENCE_STORAGE_KEY);
      return PRICE_REFERENCES[saved] ? saved : "a";
    } catch (_) {
      return "a";
    }
  }

  function setPriceReference(reference) {
    if (!PRICE_REFERENCES[reference]) return;
    state.priceReference = reference;
    try {
      pageWindow.localStorage && pageWindow.localStorage.setItem(PRICE_REFERENCE_STORAGE_KEY, reference);
    } catch (_) {
      // Keep the current page choice even when browser storage is unavailable.
    }
  }

  function simpleItemName(itemHrid) {
    return String(itemHrid || "未知物品").split("/").pop().replaceAll("_", " ");
  }

  function titleCase(value) {
    return String(value || "").replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  // The Chinese UI translation writes the localized item name to the game's icon.
  // Reuse that live, user-visible value instead of maintaining a second translation.
  function refreshPageItemNames() {
    const uses = document.querySelectorAll('svg[role="img"][aria-label] use');
    for (const use of uses) {
      if (use.closest("#mwi-credit-optimizer")) continue;
      const icon = use.closest('svg[role="img"][aria-label]');
      const name = icon && icon.getAttribute("aria-label") && icon.getAttribute("aria-label").trim();
      const href = use.getAttribute("href") || use.getAttribute("xlink:href") || "";
      const itemId = href.slice(href.lastIndexOf("#") + 1);
      if (!itemId || !name || !/[\u3400-\u9fff]/.test(name)) continue;
      state.pageItemNames[`/items/${itemId}`] = name;
    }
  }

  function localizedItemName(itemName, itemHrid) {
    const visibleName = itemHrid && state.pageItemNames[itemHrid];
    if (visibleName) return visibleName;
    let locale = "zh-CN";
    try {
      locale = pageWindow.localStorage && pageWindow.localStorage.getItem("i18nextLng") || document.documentElement.lang || locale;
    } catch (_) {
      // Keep Chinese as the personal plugin's default if browser storage is unavailable.
    }
    return localization.localizeItemName({ itemName, itemHrid, chineseNames: chineseItemNames, locale });
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
  }

  function setItemDetails(candidate) {
    if (candidate && (Array.isArray(candidate) || typeof candidate === "object")) {
      if (state.itemDetails !== candidate) state.conversionCache.clear();
      state.itemDetails = candidate;
      return true;
    }
    return false;
  }

  function setGuildBuffDetails(candidate) {
    if (candidate && (Array.isArray(candidate) || typeof candidate === "object")) {
      state.guildBuffDetails = candidate;
      return true;
    }
    return false;
  }

  function setGuildBuffLevels(candidate) {
    if (candidate && (Array.isArray(candidate) || typeof candidate === "object")) {
      state.guildBuffLevels = candidate;
      return true;
    }
    return false;
  }

  function setCharacterItems(candidate) {
    if (Array.isArray(candidate)) {
      state.characterItems = candidate;
      return true;
    }
    return false;
  }

  function setGuildBuffLevelsFrom(source) {
    if (!source || typeof source !== "object") return false;
    return setGuildBuffLevels(
      source.characterGuildBuffMap || source.characterGuildBuffDict || source.characterGuildBuffs || source.characterGuildBuffLevelMap || source.characterGuildBuffLevelDict ||
      source.guildBuffLevelMap || source.guildBuffLevelDict || source.guildBuffLevels || source.guildBuffMap || source.guildBuffDict
    );
  }

  // The game persists initClientData with LZString.compressToUTF16. Reading it
  // avoids depending on the timing of the one-time WebSocket initialization.
  function decompressFromUtf16(compressed) {
    if (compressed == null) return "";
    if (compressed === "") return null;
    const dictionary = [0, 1, 2];
    let next;
    let enlargeIn = 4;
    let dictionarySize = 4;
    let numBits = 3;
    let entry = "";
    const result = [];
    let dataValue = compressed.charCodeAt(0) - 32;
    let dataPosition = 16384;
    let dataIndex = 1;

    const readBits = (count) => {
      let value = 0;
      let bit = 1;
      for (let power = 1, maxPower = 1 << count; power !== maxPower; power <<= 1) {
        const residue = dataValue & dataPosition;
        dataPosition >>= 1;
        if (dataPosition === 0) {
          dataPosition = 16384;
          dataValue = dataIndex < compressed.length ? compressed.charCodeAt(dataIndex) - 32 : 0;
          dataIndex += 1;
        }
        if (residue > 0) value |= bit;
        bit <<= 1;
      }
      return value;
    };

    const firstToken = readBits(2);
    if (firstToken === 0) entry = String.fromCharCode(readBits(8));
    else if (firstToken === 1) entry = String.fromCharCode(readBits(16));
    else return "";

    dictionary[3] = entry;
    let previous = entry;
    result.push(entry);

    while (true) {
      if (dataIndex > compressed.length) return "";
      const token = readBits(numBits);
      if (token === 0) {
        dictionary[dictionarySize] = String.fromCharCode(readBits(8));
        dictionarySize += 1;
        enlargeIn -= 1;
        next = dictionarySize - 1;
      } else if (token === 1) {
        dictionary[dictionarySize] = String.fromCharCode(readBits(16));
        dictionarySize += 1;
        enlargeIn -= 1;
        next = dictionarySize - 1;
      } else if (token === 2) {
        return result.join("");
      } else {
        next = token;
      }

      if (enlargeIn === 0) {
        enlargeIn = 1 << numBits;
        numBits += 1;
      }
      if (dictionary[next]) entry = dictionary[next];
      else if (next === dictionarySize) entry = previous + previous.charAt(0);
      else return null;

      result.push(entry);
      dictionary[dictionarySize] = previous + entry.charAt(0);
      dictionarySize += 1;
      enlargeIn -= 1;
      previous = entry;

      if (enlargeIn === 0) {
        enlargeIn = 1 << numBits;
        numBits += 1;
      }
    }
  }

  function hydrateLocalInitData() {
    if (state.itemDetails && state.guildBuffDetails && state.guildBuffLevels && state.characterItems) return true;
    let raw;
    try {
      raw = pageWindow.localStorage && pageWindow.localStorage.getItem("initClientData");
    } catch (_) {
      return false;
    }
    if (!raw) return false;
    try {
      const decoded = decompressFromUtf16(raw) || raw;
      const data = JSON.parse(decoded);
      const hasItems = setItemDetails(data.itemDetailMap || data.itemDetailDict);
      const hasGuildBuffs = setGuildBuffDetails(data.guildBuffDetailMap || data.guildBuffDetailDict);
      const hasGuildBuffLevels = setGuildBuffLevelsFrom(data) || setGuildBuffLevelsFrom(data.character);
      const hasCharacterItems = setCharacterItems(data.characterItems || data.character && data.character.items);
      return hasItems || hasGuildBuffs || hasGuildBuffLevels || hasCharacterItems;
    } catch (_) {
      return false;
    }
  }

  function extractItemDetailsFromReact() {
    if (state.itemDetails && state.guildBuffDetails && state.guildBuffLevels && state.characterItems) return true;
    const roots = [document.getElementById("root"), document.body].filter(Boolean);
    const visited = new Set();
    const stack = [];
    for (const root of roots) {
      for (const key of Object.keys(root)) {
        if (key.startsWith("__reactFiber$") || key.startsWith("__reactContainer$") || key.startsWith("__reactInternalInstance$")) stack.push(root[key]);
      }
    }
    let scanned = 0;
    let found = false;
    while (stack.length && scanned < 6000) {
      const fiber = stack.pop();
      if (!fiber || typeof fiber !== "object" || visited.has(fiber)) continue;
      visited.add(fiber);
      scanned += 1;
      const stateValue = fiber.stateNode && fiber.stateNode.state;
      const candidates = [fiber.memoizedProps, fiber.pendingProps, stateValue, fiber.memoizedState];
      for (const candidate of candidates) {
        if (!candidate || typeof candidate !== "object") continue;
        found = setItemDetails(candidate.itemDetailMap || candidate.itemDetailDict) || found;
        found = setGuildBuffDetails(candidate.guildBuffDetailMap || candidate.guildBuffDetailDict) || found;
        found = setGuildBuffLevelsFrom(candidate) || found;
        found = setCharacterItems(candidate.characterItems) || found;
        if (state.itemDetails && state.guildBuffDetails && state.guildBuffLevels && state.characterItems) return true;
      }
      // React 18 containers point at a FiberRoot whose active tree is .current.
      if (fiber.current) stack.push(fiber.current);
      if (fiber.stateNode && fiber.stateNode.current) stack.push(fiber.stateNode.current);
      if (fiber.child) stack.push(fiber.child);
      if (fiber.sibling) stack.push(fiber.sibling);
    }
    return found;
  }

  function scanMessage(value, depth) {
    if (!value || typeof value !== "object" || depth > 8) return;
    setItemDetails(value.itemDetailMap || value.itemDetailDict);
    setGuildBuffDetails(value.guildBuffDetailMap || value.guildBuffDetailDict);
    setGuildBuffLevelsFrom(value);
    setCharacterItems(value.characterItems);
    for (const child of Object.values(value)) scanMessage(child, depth + 1);
  }

  function hydrateBridgeData() {
    const bridge = pageWindow.__mwiGuildCreditBridge;
    if (!bridge || typeof bridge !== "object") return;
    setItemDetails(bridge.itemDetails);
    setGuildBuffDetails(bridge.guildBuffDetails);
    setGuildBuffLevelsFrom(bridge);
    setCharacterItems(bridge.characterItems);
    if (Array.isArray(bridge.messages) && (!state.itemDetails || !state.guildBuffDetails || !state.guildBuffLevels || !state.characterItems)) {
      for (let index = bridge.messages.length - 1; index >= 0 && (!state.itemDetails || !state.guildBuffDetails || !state.guildBuffLevels || !state.characterItems); index -= 1) {
        try {
          scanMessage(JSON.parse(bridge.messages[index]), 0);
        } catch (_) {
          // Ignore non-JSON protocol frames.
        }
      }
    }
  }

  async function loadSnapshot(force) {
    if (state.snapshot && !force) return state.snapshot;
    const response = await fetch("/game_data/marketplace.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`公开市场快照请求失败 (${response.status})`);
    state.snapshot = await response.json();
    return state.snapshot;
  }

  function snapshotOrderBook(itemHrid, reference = state.priceReference) {
    const price = snapshotPrice(itemHrid, reference);
    return price === null ? null : { asks: [{ price, quantity: Number.MAX_SAFE_INTEGER }] };
  }

  function snapshotPrice(itemHrid, field, enhancementLevel = 0) {
    return core.snapshotMarketPrice(state.snapshot, itemHrid, enhancementLevel, field);
  }

  function snapshotImmediateSellPrice(itemHrid, enhancementLevel = 0) {
    return snapshotPrice(itemHrid, "b", enhancementLevel);
  }

  function allConversions(creditItemHrid) {
    if (!state.itemDetails) {
      hydrateLocalInitData();
      hydrateBridgeData();
      extractItemDetailsFromReact();
    }
    let conversions = state.conversionCache.get(creditItemHrid);
    if (!conversions) {
      conversions = core.conversionsFromItemDetails(state.itemDetails, creditItemHrid);
      state.conversionCache.set(creditItemHrid, conversions);
    }
    return conversions.map((conversion) => ({
      ...conversion,
      itemName: localizedItemName(conversion.itemName, conversion.itemHrid)
    }));
  }

  function itemSpriteHref(itemHrid) {
    const spriteUse = document.querySelector('use[href*="items_sprite"]');
    const href = spriteUse && spriteUse.getAttribute("href");
    if (!href || !href.includes("#")) return "";
    return `${href.slice(0, href.indexOf("#"))}#${String(itemHrid || "").split("/").pop()}`;
  }

  function iconMarkup(itemHrid, label) {
    const href = itemSpriteHref(itemHrid);
    if (!href) return '<span class="mwi-item-icon mwi-item-icon-fallback" aria-hidden="true"></span>';
    return `<svg class="mwi-item-icon" role="img" aria-label="${escapeHtml(label)}"><use href="${escapeHtml(href)}"></use></svg>`;
  }

  function formatNumber(value, digits) {
    if (value === null || value === undefined || !Number.isFinite(value)) return "-";
    return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: digits === undefined ? 0 : digits }).format(value);
  }

  async function checkPluginUpdate(panel) {
    const status = panel.querySelector('[data-role="version-status"]');
    if (!status) return;
    status.textContent = `当前版本 v${PLUGIN_VERSION} · 最新版本：检查中...`;
    try {
      const response = await fetch(UPDATE_SCRIPT_URL, { cache: "no-store" });
      if (!response.ok) throw new Error(`更新信息请求失败 (${response.status})`);
      const source = await response.text();
      const match = source.match(/^\/\/ @version\s+(.+)$/m);
      if (!match) throw new Error("未找到最新版本号");
      const latestVersion = match[1].trim();
      if (core.compareVersions(PLUGIN_VERSION, latestVersion) < 0) {
        status.classList.add("mwi-update-available");
        status.replaceChildren(`当前版本 v${PLUGIN_VERSION} · 最新版本 v${latestVersion} · 发现新版本`);
        const updateLink = document.createElement("a");
        updateLink.className = "mwi-update-link";
        updateLink.href = UPDATE_SCRIPT_URL;
        updateLink.target = "_blank";
        updateLink.rel = "noopener noreferrer";
        updateLink.textContent = "立即更新";
        status.append(" · ", updateLink);
      } else {
        status.classList.remove("mwi-update-available");
        status.textContent = `当前版本 v${PLUGIN_VERSION} · 最新版本 v${latestVersion} · 已是最新`;
      }
    } catch (_) {
      status.classList.remove("mwi-update-available");
      status.textContent = `当前版本 v${PLUGIN_VERSION} · 最新版本：暂时无法读取`;
    }
  }

  function guildBuffEntries() {
    hydrateLocalInitData();
    hydrateBridgeData();
    extractItemDetailsFromReact();
    const details = Array.isArray(state.guildBuffDetails)
      ? state.guildBuffDetails.map((detail) => [detail && (detail.hrid || detail.guildBuffHrid), detail])
      : Object.entries(state.guildBuffDetails || {});
    return details
      .map(([hrid, detail]) => ({ hrid: detail && (detail.hrid || detail.guildBuffHrid) || hrid, detail }))
      .filter(({ hrid, detail }) => hrid && detail && detail.levelCosts)
      .map(({ hrid, detail }) => ({ hrid, detail, maxLevel: Array.isArray(detail.levelCosts) ? detail.levelCosts.length - 1 : Math.max(...Object.keys(detail.levelCosts).map(Number).filter(Number.isSafeInteger)) }))
      .filter(({ maxLevel }) => Number.isSafeInteger(maxLevel) && maxLevel > 0)
      .sort((left, right) => guildBuffLabel(left.detail, left.hrid).localeCompare(guildBuffLabel(right.detail, right.hrid), "zh-CN"));
  }

  function guildBuffLabel(detail, fallbackHrid) {
    const shrineName = GUILD_SHRINE_NAMES[detail && detail.shrineHrid] || titleCase(simpleItemName(detail && detail.shrineHrid || fallbackHrid));
    const domain = detail && detail.isCombat === true ? "战斗" : detail && detail.isCombat === false ? "生活" : "";
    return domain ? `${shrineName}（${domain}）` : shrineName;
  }

  function itemNameForMaterial(itemHrid) {
    const credit = CREDIT_TYPES.find(([hrid]) => hrid === itemHrid);
    if (credit) return `${credit[1]}公会信用点`;
    const details = Array.isArray(state.itemDetails)
      ? state.itemDetails.map((detail) => [detail && (detail.itemHrid || detail.hrid), detail])
      : Object.entries(state.itemDetails || {});
    const detail = details.find(([hrid]) => hrid === itemHrid);
    return localizedItemName(detail && detail[1] && detail[1].name, itemHrid);
  }

  function materialOrder(left, right) {
    if (left.itemHrid === "/items/guild_token") return -1;
    if (right.itemHrid === "/items/guild_token") return 1;
    const leftCredit = CREDIT_TYPES.findIndex(([hrid]) => hrid === left.itemHrid);
    const rightCredit = CREDIT_TYPES.findIndex(([hrid]) => hrid === right.itemHrid);
    if (leftCredit >= 0 && rightCredit >= 0) return leftCredit - rightCredit;
    if (leftCredit >= 0) return -1;
    if (rightCredit >= 0) return 1;
    return itemNameForMaterial(left.itemHrid).localeCompare(itemNameForMaterial(right.itemHrid), "zh-CN");
  }

  function inventoryItemCounts() {
    hydrateLocalInitData();
    hydrateBridgeData();
    extractItemDetailsFromReact();
    const counts = Object.create(null);
    for (const item of state.characterItems || []) {
      if (!item || item.itemLocationHrid !== "/item_locations/inventory") continue;
      const count = Number(item.count);
      if (!item.itemHrid || !Number.isFinite(count) || count <= 0) continue;
      counts[item.itemHrid] = (counts[item.itemHrid] || 0) + count;
    }
    return counts;
  }

  function bestCreditUnitCosts() {
    return Object.fromEntries(CREDIT_TYPES.map(([creditItemHrid]) => {
      const conversions = allConversions(creditItemHrid);
      const books = Object.fromEntries(conversions.map((conversion) => [conversion.itemHrid, snapshotOrderBook(conversion.itemHrid)]));
      const best = core.rankConversions(conversions, books, 1).find((row) => row.status === "ok");
      return [creditItemHrid, best ? best.costPerCredit : null];
    }));
  }

  function currentGuildBuffLevel(entry) {
    const stored = Array.isArray(state.guildBuffLevels)
      ? state.guildBuffLevels.find((value) => value && (value.guildBuffHrid || value.hrid) === entry.hrid)
      : state.guildBuffLevels && state.guildBuffLevels[entry.hrid];
    const value = stored && typeof stored === "object" ? stored.level ?? stored.currentLevel : stored;
    const level = Number(value);
    return Number.isSafeInteger(level) && level >= 0 ? Math.min(level, entry.maxLevel) : 0;
  }

  function normalizeUpgradePlan(plan, entries) {
    const entry = entries.find((candidate) => candidate.hrid === plan.guildBuffHrid);
    if (!entry) return null;
    const currentLevel = currentGuildBuffLevel(entry);
    const rawStart = Number(plan.startLevel);
    const startLevel = Number.isSafeInteger(rawStart) && rawStart >= 0 && rawStart < entry.maxLevel ? rawStart : currentLevel;
    const rawTarget = Number(plan.targetLevel);
    const targetLevel = Number.isSafeInteger(rawTarget) && rawTarget > startLevel && rawTarget <= entry.maxLevel
      ? rawTarget
      : Math.min(startLevel + 1, entry.maxLevel);
    return { ...plan, guildBuffHrid: entry.hrid, startLevel, targetLevel };
  }

  function addGuildUpgradePlan(entries) {
    const plannedHrids = new Set(state.upgradePlans.map((plan) => plan.guildBuffHrid));
    const entry = entries.find((candidate) => !plannedHrids.has(candidate.hrid) && currentGuildBuffLevel(candidate) < candidate.maxLevel);
    if (!entry) return false;
    const startLevel = currentGuildBuffLevel(entry);
    state.upgradePlans.push({ id: `plan-${state.nextUpgradePlanId++}`, guildBuffHrid: entry.hrid, startLevel, targetLevel: startLevel + 1 });
    return true;
  }

  function ensureGuildUpgradePlans(entries) {
    state.upgradePlans = state.upgradePlans.map((plan) => normalizeUpgradePlan(plan, entries)).filter(Boolean);
    if (!state.upgradePlans.length) addGuildUpgradePlan(entries);
  }

  function levelOptionMarkup(start, end, selected) {
    return Array.from({ length: Math.max(end - start + 1, 0) }, (_, index) => start + index)
      .map((level) => `<option value="${level}" ${level === selected ? "selected" : ""}>${level} 级</option>`).join("");
  }

  function renderGuildUpgradePlans(panel, entries) {
    const list = panel.querySelector('[data-role="upgrade-plan-list"]');
    const plannedHrids = new Set(state.upgradePlans.map((plan) => plan.guildBuffHrid));
    list.innerHTML = state.upgradePlans.map((plan) => {
      const entry = entries.find((candidate) => candidate.hrid === plan.guildBuffHrid);
      if (!entry) return "";
      const buffOptions = entries.map((candidate) => `<option value="${escapeHtml(candidate.hrid)}" ${candidate.hrid === plan.guildBuffHrid ? "selected" : ""} ${candidate.hrid !== plan.guildBuffHrid && (plannedHrids.has(candidate.hrid) || currentGuildBuffLevel(candidate) >= candidate.maxLevel) ? "disabled" : ""}>${escapeHtml(guildBuffLabel(candidate.detail, candidate.hrid))}</option>`).join("");
      return `<div class="mwi-upgrade-plan" data-plan-id="${escapeHtml(plan.id)}">
        <label>神龛<select data-role="plan-buff">${buffOptions}</select></label>
        <label>起始等级<select data-role="plan-start">${levelOptionMarkup(0, entry.maxLevel - 1, plan.startLevel)}</select></label>
        <label>目标等级<select data-role="plan-target">${levelOptionMarkup(plan.startLevel + 1, entry.maxLevel, plan.targetLevel)}</select></label>
        <button class="mwi-remove-plan" data-role="remove-plan" type="button" title="移除此项" aria-label="移除此项">×</button>
      </div>`;
    }).join("");
  }

  function renderUpgradeCostText(gold, guildTokens) {
    const parts = [`${core.formatCompactCost(gold)} 金币`];
    if (guildTokens > 0) parts.push(`${formatNumber(guildTokens)} 公会代币`);
    return parts.join(" + ");
  }

  function renderUpgradeCostSummary(estimate, hasInventory) {
    if (!estimate) return '<div class="mwi-upgrade-cost-summary mwi-upgrade-cost-unavailable">未读取到公开市场快照，暂无法估算金币成本。</div>';
    const partial = estimate.status !== "ok";
    const missingNames = estimate.unpricedItemHrids.map(itemNameForMaterial).join("、");
    const totalLabel = partial ? "预计成本（已定价部分）" : "预计总成本";
    const missingLabel = partial ? "库存后缺口（已定价部分）" : "库存后仍需";
    const inventoryNote = hasInventory ? "" : '<div class="mwi-upgrade-cost-note">未读取背包库存，缺口暂按 0 件库存计算。</div>';
    const priceNote = partial ? `<div class="mwi-upgrade-cost-note">以下信用点暂无可用市场价格：${escapeHtml(missingNames)}。</div>` : "";
    return `<div class="mwi-upgrade-cost-summary"><div><span>${totalLabel}</span><strong>${renderUpgradeCostText(estimate.totalGold, estimate.guildTokensRequired)}</strong></div><div><span>${missingLabel}</span><strong>${renderUpgradeCostText(estimate.missingGold, estimate.guildTokensMissing)}</strong></div>${inventoryNote}${priceNote}</div>`;
  }

  function renderMaterialTotals(results, totals, estimate, hasInventory) {
    const planSummary = results.map((plan) => {
      const entry = guildBuffEntries().find((candidate) => candidate.hrid === plan.guildBuffHrid);
      const label = entry ? guildBuffLabel(entry.detail, entry.hrid) : plan.guildBuffHrid;
      return `<span>${escapeHtml(label)} ${plan.startLevel} -> ${plan.targetLevel}</span>`;
    }).join("<span class=\"mwi-plan-separator\">，</span>");
    const estimateRows = Object.fromEntries((estimate && estimate.rows || []).map((row) => [row.itemHrid, row]));
    const materials = totals.sort(materialOrder).map((item) => {
      const row = estimateRows[item.itemHrid];
      const inventoryText = row ? `库存 ${formatNumber(row.owned)} · 缺 ${formatNumber(row.missing)}` : "库存未读取";
      return `<div class="mwi-material-row">${iconMarkup(item.itemHrid, itemNameForMaterial(item.itemHrid))}<span class="mwi-material-copy"><span class="mwi-material-name">${escapeHtml(itemNameForMaterial(item.itemHrid))}</span><small>${hasInventory ? inventoryText : "库存未读取"}</small></span><strong>${formatNumber(item.count)}</strong></div>`;
    }).join("");
    return `<div class="mwi-plan-summary">${planSummary}</div>${renderUpgradeCostSummary(estimate, hasInventory)}<div class="mwi-material-list">${materials}</div>`;
  }

  async function refreshGuildUpgrade(panel) {
    const refreshId = ++state.upgradeRefreshId;
    refreshPageItemNames();
    const status = panel.querySelector('[data-role="upgrade-status"]');
    const results = panel.querySelector('[data-role="upgrade-results"]');
    const entries = guildBuffEntries();
    if (!entries.length) {
      status.textContent = "未读取到神龛升级规则。请刷新游戏页面后重新打开公会。";
      results.replaceChildren();
      return;
    }
    ensureGuildUpgradePlans(entries);
    renderGuildUpgradePlans(panel, entries);
    if (!state.upgradePlans.length) {
      status.textContent = "当前所有神龛增益均已满级。";
      results.replaceChildren();
      return;
    }

    const result = core.aggregateGuildBuffPlans(state.upgradePlans.map((plan) => {
      const entry = entries.find((candidate) => candidate.hrid === plan.guildBuffHrid);
      return { ...plan, levelCosts: entry && entry.detail.levelCosts };
    }));
    if (result.status !== "ok") {
      const failed = result.result || {};
      status.textContent = failed.status === "missing_cost" ? `缺少 ${failed.missingLevel} 级升级成本数据。` : "起始等级或目标等级无效。";
      results.replaceChildren();
      return;
    }
    let estimate = null;
    let snapshotFailed = false;
    try {
      await loadSnapshot(false);
      if (refreshId !== state.upgradeRefreshId) return;
      estimate = core.estimateGuildUpgradeCosts(result.totals, bestCreditUnitCosts(), inventoryItemCounts());
    } catch (_) {
      snapshotFailed = true;
    }
    if (refreshId !== state.upgradeRefreshId) return;
    const hasInventory = Array.isArray(state.characterItems);
    const notices = [state.guildBuffLevels ? `已合并 ${result.plans.length} 项神龛升级的材料成本。` : "未读取当前神龛等级，已按 0 级开始；请确认或手动调整“起始等级”。"];
    if (snapshotFailed) notices.push("公开市场快照读取失败，暂未估算金币成本。");
    if (!hasInventory) notices.push("未读取背包库存，缺口暂按 0 件库存计算。");
    status.textContent = notices.join(" ");
    results.innerHTML = renderMaterialTotals(result.plans, result.totals, estimate, hasInventory);
  }

  function setPanelView(panel, view) {
    const creditView = panel.querySelector('[data-role="credit-view"]');
    const upgradeView = panel.querySelector('[data-role="upgrade-view"]');
    const creditTab = panel.querySelector('[data-role="view-credit"]');
    const upgradeTab = panel.querySelector('[data-role="view-upgrade"]');
    const showUpgrade = view === "upgrade";
    creditView.hidden = showUpgrade;
    upgradeView.hidden = !showUpgrade;
    creditTab.setAttribute("aria-selected", String(!showUpgrade));
    upgradeTab.setAttribute("aria-selected", String(showUpgrade));
    creditTab.classList.toggle("mwi-view-tab-active", !showUpgrade);
    upgradeTab.classList.toggle("mwi-view-tab-active", showUpgrade);
    panel.dataset.activeView = showUpgrade ? "upgrade" : "credit";
    if (showUpgrade) refreshGuildUpgrade(panel);
    else refreshPanel(panel);
  }

  function updatePriceReferenceButtons(panel) {
    for (const button of panel.querySelectorAll('[data-role="price-reference"]')) {
      const active = button.dataset.priceReference === state.priceReference;
      button.dataset.active = String(active);
      button.setAttribute("aria-pressed", String(active));
    }
  }

  function createPanel() {
    const panel = document.createElement("section");
    panel.id = "mwi-credit-optimizer";
    panel.innerHTML = `
      <style>
        #mwi-credit-optimizer{position:relative;z-index:20;flex:1;min-height:0;height:100%;overflow-y:auto;overflow-x:hidden;margin:0;padding:12px;background:#202139;color:#f4f5ff;font:14px system-ui,sans-serif}
        #mwi-credit-optimizer[hidden]{display:none} [data-mwi-credit-tab="true"]{user-select:none;pointer-events:auto!important;cursor:pointer!important}
        #mwi-credit-optimizer *{box-sizing:border-box} #mwi-credit-optimizer h3{margin:0 0 5px;font-size:17px}#mwi-credit-optimizer .mwi-plugin-version{margin:0 0 10px;padding:5px 7px;border:1px solid #474969;border-radius:4px;background:#292a46;color:#c9cbeb;font-size:11px;line-height:1.4}.mwi-plugin-version.mwi-update-available{border-color:#d8a33c;background:#463a21;color:#ffe09a;font-weight:700}
        #mwi-credit-optimizer .mwi-view-tabs{display:flex;border-bottom:1px solid #474969;margin:0 0 10px}.mwi-view-tab{min-height:30px!important;border-radius:0!important;background:transparent!important;color:#c9cbeb!important;padding:5px 10px!important}.mwi-view-tab-active{border-bottom:2px solid #43c4ad!important;color:#fff!important}
        #mwi-credit-optimizer .mwi-controls{display:flex;gap:8px;align-items:end;flex-wrap:wrap} #mwi-credit-optimizer label{display:grid;gap:4px;color:#d8d8e8}#mwi-credit-optimizer .mwi-price-reference{display:flex;align-items:center;gap:0;border:1px solid #5b5d7b;border-radius:4px;overflow:hidden;background:#292a46}#mwi-credit-optimizer .mwi-price-reference-label{padding:0 7px;color:#c9cbeb;font-size:11px;white-space:nowrap}#mwi-credit-optimizer .mwi-price-reference button{min-height:30px;border-radius:0;background:#353653;color:#c9cbeb;padding:5px 9px}#mwi-credit-optimizer .mwi-price-reference button+button{border-left:1px solid #5b5d7b}#mwi-credit-optimizer .mwi-price-reference button[data-active="true"]{background:#43c4ad;color:#10201f}
        #mwi-credit-optimizer input,#mwi-credit-optimizer select{width:112px;min-height:32px;border:1px solid #7778b4;border-radius:4px;padding:4px 8px;background:#f1f2ff;color:#1f2030;font:inherit}
        #mwi-credit-optimizer button{min-height:32px;border:0;border-radius:4px;padding:5px 12px;background:#43c4ad;color:#10201f;font-weight:700;cursor:pointer}
        #mwi-credit-optimizer button:disabled{opacity:.55;cursor:wait} #mwi-credit-optimizer .mwi-status{margin:10px 0;color:#c9cbeb}
        #mwi-credit-optimizer .mwi-credit-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:10px}
        #mwi-credit-optimizer .mwi-credit-section{min-width:0;border:1px solid #474969;border-top:3px solid var(--mwi-credit-color);border-radius:6px;background:#292a46;overflow:hidden}#mwi-credit-optimizer .mwi-credit-body[hidden],#mwi-credit-optimizer .mwi-token-value-body[hidden]{display:none!important}
        #mwi-credit-optimizer .mwi-credit-heading{display:flex;align-items:center;gap:7px;width:100%;min-height:0!important;border:0;border-radius:0;background:transparent!important;color:#fff!important;padding:8px 9px 6px!important;font:inherit;text-align:left;font-size:13px;font-weight:700;cursor:pointer}.mwi-credit-heading:hover{background:#303151!important}.mwi-credit-heading .mwi-collapse-icon{margin-left:auto;color:#c9cbeb;font-size:15px;line-height:1}
        #mwi-credit-optimizer .mwi-credit-heading .mwi-item-icon{width:22px;height:22px;flex:0 0 22px}.mwi-credit-section table{width:100%;border-collapse:collapse;font-size:11px}
        #mwi-credit-optimizer th,#mwi-credit-optimizer td{padding:5px 6px;border-top:1px solid #474969;text-align:right;white-space:nowrap}
        #mwi-credit-optimizer th:first-child,#mwi-credit-optimizer td:first-child{text-align:left} #mwi-credit-optimizer th{color:#bfc2de;font-weight:600}
        #mwi-credit-optimizer .mwi-item{display:flex;align-items:center;gap:5px;min-width:0}.mwi-item-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        #mwi-credit-optimizer .mwi-item-icon{display:inline-block;width:24px;height:24px;flex:0 0 24px;vertical-align:middle}.mwi-item-icon-fallback{border-radius:4px;background:#45476b}
        #mwi-credit-optimizer .mwi-cost{color:#77f3d0;font-weight:700} #mwi-credit-optimizer .mwi-empty{padding:8px;color:#ffd17c;font-size:12px}#mwi-credit-optimizer .mwi-token-value-section{margin:10px 0;border:1px solid #3a7b70;border-top:3px solid #43c4ad;border-radius:6px;background:#203b3a;overflow:hidden}#mwi-credit-optimizer .mwi-token-value-heading{border-bottom:1px solid #3a7b70}#mwi-credit-optimizer .mwi-token-value-heading .mwi-item-icon{width:22px;height:22px;flex:0 0 22px}#mwi-credit-optimizer .mwi-token-value-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:0}#mwi-credit-optimizer .mwi-token-value-row{display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:center;gap:8px;min-width:0;padding:8px;border-top:1px solid #315d58}#mwi-credit-optimizer .mwi-token-value-row .mwi-item-icon{width:21px;height:21px;flex:0 0 21px}#mwi-credit-optimizer .mwi-token-value-exchange{color:#d7f6ef;font-size:11px;white-space:nowrap}#mwi-credit-optimizer .mwi-token-value-row .mwi-cost{font-size:12px;white-space:nowrap}#mwi-credit-optimizer .mwi-token-value-unpriced{color:#ffd17c;font-size:11px;white-space:nowrap}
        #mwi-credit-optimizer .mwi-upgrade-plan-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:8px}#mwi-credit-optimizer .mwi-upgrade-plan{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) 32px;gap:8px;align-items:end;padding:8px;border:1px solid #474969;border-radius:4px;background:#292a46}#mwi-credit-optimizer .mwi-upgrade-plan label{min-width:0;text-align:left;justify-items:stretch}#mwi-credit-optimizer .mwi-upgrade-plan label:first-child{grid-column:1/-1;grid-row:1}#mwi-credit-optimizer .mwi-upgrade-plan label:nth-child(2){grid-column:1;grid-row:2}#mwi-credit-optimizer .mwi-upgrade-plan label:nth-child(3){grid-column:2;grid-row:2}#mwi-credit-optimizer .mwi-upgrade-plan select{width:100%!important;max-width:none;min-width:0}#mwi-credit-optimizer .mwi-remove-plan{grid-column:3;grid-row:2;width:32px;min-width:32px;padding:0!important;font-size:20px;line-height:1;background:#555773!important;color:#fff!important}#mwi-credit-optimizer .mwi-upgrade-actions{margin-top:10px}
        #mwi-credit-optimizer .mwi-material-list{border-top:1px solid #474969}.mwi-material-row{display:flex;align-items:center;gap:8px;padding:8px 4px;border-bottom:1px solid #474969}.mwi-material-copy{flex:1;min-width:0;display:grid;gap:1px}.mwi-material-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.mwi-material-copy small{color:#aeb1d3;font-size:11px}.mwi-material-row strong{color:#77f3d0;font-size:15px}.mwi-plan-summary{display:flex;flex-wrap:wrap;gap:2px 0;margin:10px 0 6px;color:#c9cbeb;font-size:12px}.mwi-plan-separator{padding-right:4px}.mwi-upgrade-cost-summary{display:grid;gap:6px;margin:8px 0 10px;padding:9px;border:1px solid #3a7b70;border-radius:4px;background:#203b3a}.mwi-upgrade-cost-summary>div:not(.mwi-upgrade-cost-note){display:flex;justify-content:space-between;gap:8px;align-items:baseline}.mwi-upgrade-cost-summary span{color:#d7f6ef}.mwi-upgrade-cost-summary strong{color:#77f3d0;font-size:14px;text-align:right}.mwi-upgrade-cost-note{color:#ffd17c;font-size:11px}.mwi-upgrade-cost-unavailable{color:#ffd17c;border-color:#80663f;background:#3b3323}.mwi-plugin-version .mwi-update-link{color:#fff;text-decoration:underline;text-underline-offset:2px}.mwi-plugin-version .mwi-update-link:hover{color:#77f3d0}.mwi-plugin-footer{margin-top:16px;padding:10px 4px 2px;border-top:1px solid #474969;color:#aeb1d3;font-size:12px;line-height:1.6;text-align:center}
        @media (max-width:430px){#mwi-credit-optimizer .mwi-credit-grid{grid-template-columns:1fr}}
      </style>
      <h3>公会助手</h3>
      <div class="mwi-plugin-version" data-role="version-status" aria-live="polite"></div>
      <div class="mwi-view-tabs" role="tablist">
        <button class="mwi-view-tab mwi-view-tab-active" data-role="view-credit" role="tab" aria-selected="true" type="button">信用点性价比</button>
        <button class="mwi-view-tab" data-role="view-upgrade" role="tab" aria-selected="false" type="button">神龛升级</button>
      </div>
      <div data-role="credit-view">
        <div class="mwi-controls">
          <label>目标信用点<input data-role="target" type="number" min="1" step="1" value="1"></label>
          <div class="mwi-price-reference" role="group" aria-label="市场价格参考"><span class="mwi-price-reference-label">价格参考</span><button data-role="price-reference" data-price-reference="a" type="button" title="左一：最低出售价，可立即买入">左一</button><button data-role="price-reference" data-price-reference="b" type="button" title="右一：最高收购价，仅作理论参考">右一</button></div>
          <button data-role="refresh" type="button">刷新市场估算</button>
        </div>
        <div class="mwi-status" data-role="status">等待游戏兑换数据...</div>
        <div data-role="results"></div>
      </div>
      <div data-role="upgrade-view" hidden>
        <div class="mwi-upgrade-plan-list" data-role="upgrade-plan-list"></div>
        <div class="mwi-upgrade-actions"><button data-role="add-upgrade-plan" type="button">添加神龛</button></div>
        <div class="mwi-status" data-role="upgrade-status">等待神龛升级数据...</div>
        <div data-role="upgrade-results"></div>
      </div>
      <footer class="mwi-plugin-footer">作者：柆雨<br>遇到问题或无法获取最新版，请加群：437320340</footer>`;
    panel.querySelector('[data-role="refresh"]').addEventListener("click", () => refreshPanel(panel, true));
    panel.querySelector('[data-role="target"]').addEventListener("change", () => refreshPanel(panel));
    panel.querySelector('.mwi-price-reference').addEventListener("click", (event) => {
      const button = event.target.closest('[data-role="price-reference"]');
      if (!button || button.dataset.priceReference === state.priceReference) return;
      setPriceReference(button.dataset.priceReference);
      updatePriceReferenceButtons(panel);
      refreshPanel(panel);
      refreshGuildUpgrade(panel);
      refreshGuildExchangeAdvisor();
    });
    updatePriceReferenceButtons(panel);
    panel.querySelector('[data-role="results"]').addEventListener("click", (event) => {
      const target = event.target && (event.target.nodeType === 1 ? event.target : event.target.parentElement);
      if (!target) return;
      const tokenToggle = target.closest('[data-role="toggle-token-values"]');
      if (tokenToggle) {
        const tokenSection = tokenToggle.closest(".mwi-token-value-section");
        const tokenBody = tokenSection && tokenSection.querySelector(".mwi-token-value-body");
        if (!tokenSection || !tokenBody) return;
        state.guildTokenValuesCollapsed = !state.guildTokenValuesCollapsed;
        tokenSection.dataset.collapsed = String(state.guildTokenValuesCollapsed);
        tokenToggle.setAttribute("aria-expanded", String(!state.guildTokenValuesCollapsed));
        const tokenIcon = tokenToggle.querySelector(".mwi-collapse-icon");
        if (tokenIcon) tokenIcon.textContent = state.guildTokenValuesCollapsed ? "▸" : "▾";
        tokenBody.hidden = state.guildTokenValuesCollapsed;
        return;
      }
      const toggle = target.closest('[data-role="toggle-credit-section"]');
      const section = toggle && toggle.closest('[data-credit-item-hrid]');
      if (!section) return;
      const creditItemHrid = section.dataset.creditItemHrid;
      const collapsed = !state.collapsedCreditSections.has(creditItemHrid);
      if (collapsed) state.collapsedCreditSections.add(creditItemHrid);
      else state.collapsedCreditSections.delete(creditItemHrid);
      section.dataset.collapsed = String(collapsed);
      toggle.setAttribute("aria-expanded", String(!collapsed));
      const icon = toggle.querySelector(".mwi-collapse-icon");
      if (icon) icon.textContent = collapsed ? "▸" : "▾";
      const body = section.querySelector(".mwi-credit-body");
      if (body) body.hidden = collapsed;
    });
    panel.querySelector('[data-role="view-credit"]').addEventListener("click", () => setPanelView(panel, "credit"));
    panel.querySelector('[data-role="view-upgrade"]').addEventListener("click", () => setPanelView(panel, "upgrade"));
    panel.querySelector('[data-role="add-upgrade-plan"]').addEventListener("click", () => { addGuildUpgradePlan(guildBuffEntries()); refreshGuildUpgrade(panel); });
    panel.querySelector('[data-role="upgrade-plan-list"]').addEventListener("change", (event) => {
      const row = event.target.closest("[data-plan-id]");
      const plan = row && state.upgradePlans.find((candidate) => candidate.id === row.dataset.planId);
      if (!plan) return;
      const entries = guildBuffEntries();
      if (event.target.matches('[data-role="plan-buff"]')) {
        const targetHrid = event.target.value;
        if (state.upgradePlans.some((candidate) => candidate.id !== plan.id && candidate.guildBuffHrid === targetHrid)) return;
        const entry = entries.find((candidate) => candidate.hrid === targetHrid);
        if (!entry || currentGuildBuffLevel(entry) >= entry.maxLevel) return;
        plan.guildBuffHrid = entry.hrid;
        plan.startLevel = currentGuildBuffLevel(entry);
        plan.targetLevel = Math.min(plan.startLevel + 1, entry.maxLevel);
      } else if (event.target.matches('[data-role="plan-start"]')) {
        plan.startLevel = Number(event.target.value);
        const entry = entries.find((candidate) => candidate.hrid === plan.guildBuffHrid);
        plan.targetLevel = Math.max(plan.startLevel + 1, Math.min(plan.targetLevel, entry.maxLevel));
      } else if (event.target.matches('[data-role="plan-target"]')) {
        plan.targetLevel = Number(event.target.value);
      }
      refreshGuildUpgrade(panel);
    });
    panel.querySelector('[data-role="upgrade-plan-list"]').addEventListener("click", (event) => {
      const button = event.target.closest('[data-role="remove-plan"]');
      const row = button && button.closest("[data-plan-id]");
      if (!row) return;
      state.upgradePlans = state.upgradePlans.filter((plan) => plan.id !== row.dataset.planId);
      refreshGuildUpgrade(panel);
    });
    checkPluginUpdate(panel);
    return panel;
  }

  function renderCreditSection(creditItemHrid, label, color, ranked) {
    const available = ranked.filter((row) => row.status === "ok").slice(0, 5);
    const icon = iconMarkup(creditItemHrid, `${label}公会信用点`);
    const collapsed = state.collapsedCreditSections.has(creditItemHrid);
    const heading = `<button class="mwi-credit-heading" data-role="toggle-credit-section" type="button" aria-expanded="${String(!collapsed)}">${icon}<span>${label}信用点</span><span class="mwi-collapse-icon" aria-hidden="true">${collapsed ? "▸" : "▾"}</span></button>`;
    if (!available.length) {
      return `<section class="mwi-credit-section" data-credit-item-hrid="${escapeHtml(creditItemHrid)}" data-collapsed="${String(collapsed)}" style="--mwi-credit-color:${color}">${heading}<div class="mwi-credit-body"${collapsed ? " hidden" : ""}><div class="mwi-empty">暂无可估算的市场价格</div></div></section>`;
    }
    return `<section class="mwi-credit-section" data-credit-item-hrid="${escapeHtml(creditItemHrid)}" data-collapsed="${String(collapsed)}" style="--mwi-credit-color:${color}">${heading}<div class="mwi-credit-body"${collapsed ? " hidden" : ""}><table><thead><tr><th>物品</th><th>兑换</th><th>每点</th><th>目标成本</th></tr></thead><tbody>${available.map((row) => `<tr><td title="${escapeHtml(row.itemName)}"><span class="mwi-item">${iconMarkup(row.itemHrid, row.itemName)}<span class="mwi-item-name">${escapeHtml(row.itemName)}</span></span></td><td>${row.itemCount} -> ${row.creditCount}</td><td class="mwi-cost">${formatNumber(row.costPerCredit, 2)}</td><td>${core.formatCompactCost(row.cost)}</td></tr>`).join("")}</tbody></table></div></section>`;
  }

  function renderGuildTokenValues(values) {
    const creditMeta = new Map(CREDIT_TYPES.map(([creditItemHrid, label, color]) => [creditItemHrid, { label, color }]));
    const valuesByCredit = new Map(values.map((value) => [value.creditItemHrid, value]));
    const rows = GUILD_TOKEN_CREDIT_CONVERSIONS.map((rule) => {
      const value = valuesByCredit.get(rule.creditItemHrid) || { status: "unpriced", ...rule };
      const meta = creditMeta.get(value.creditItemHrid) || { label: "未知", color: "#777" };
      const exchange = `${value.guildTokenCount} 代币 -> ${value.creditCount} 点`;
      if (value.status !== "ok") {
        return `<div class="mwi-token-value-row"><span class="mwi-item">${iconMarkup(value.creditItemHrid, `${meta.label}公会信用点`)}<span class="mwi-item-name">${meta.label}信用点</span></span><span class="mwi-token-value-exchange">${exchange}</span><span class="mwi-token-value-unpriced">暂无市场估算</span></div>`;
      }
      return `<div class="mwi-token-value-row"><span class="mwi-item">${iconMarkup(value.creditItemHrid, `${meta.label}公会信用点`)}<span class="mwi-item-name">${meta.label}信用点</span></span><span class="mwi-token-value-exchange">${exchange}</span><span class="mwi-cost">${core.formatCompactCost(value.goldValuePerToken)} 金币</span></div>`;
    }).join("");
    const collapsed = state.guildTokenValuesCollapsed;
    const heading = `<button class="mwi-credit-heading mwi-token-value-heading" data-role="toggle-token-values" type="button" aria-expanded="${String(!collapsed)}">${iconMarkup("/items/guild_token", "公会代币")}<span>公会代币兑换价值</span><span class="mwi-collapse-icon" aria-hidden="true">${collapsed ? "▸" : "▾"}</span></button>`;
    return `<section class="mwi-token-value-section" data-collapsed="${String(collapsed)}">${heading}<div class="mwi-token-value-body mwi-token-value-list"${collapsed ? " hidden" : ""}>${rows}</div></section>`;
  }

  async function refreshPanel(panel, forceSnapshot) {
    refreshPageItemNames();
    if (state.refreshInFlight) {
      state.refreshQueued = true;
      return;
    }
    state.refreshInFlight = true;
    const status = panel.querySelector('[data-role="status"]');
    const results = panel.querySelector('[data-role="results"]');
    const button = panel.querySelector('[data-role="refresh"]');
    const target = Number(panel.querySelector('[data-role="target"]').value);
    button.disabled = true;
    status.hidden = false;
    results.replaceChildren();

    const creditGroups = CREDIT_TYPES.map(([creditItemHrid, label, color]) => ({ creditItemHrid, label, color, conversions: allConversions(creditItemHrid) }));
    const conversionCount = creditGroups.reduce((total, group) => total + group.conversions.length, 0);
    if (!conversionCount) {
      status.textContent = "未读取到兑换规则。请刷新游戏页面后重新打开公会商店。";
      button.disabled = false;
      finishRefresh(panel);
      return;
    }
    status.textContent = `已读取 ${conversionCount} 条兑换规则，正在读取公开市场快照...`;

    try {
      await loadSnapshot(Boolean(forceSnapshot));
      const rankedGroups = creditGroups.map((group) => {
        const books = Object.fromEntries(group.conversions.map((conversion) => [
          conversion.itemHrid,
          snapshotOrderBook(conversion.itemHrid)
        ]));
        const tokenRule = GUILD_TOKEN_CREDIT_CONVERSIONS.find((rule) => rule.creditItemHrid === group.creditItemHrid);
        return {
          ...group,
          ranked: core.rankConversions(group.conversions, books, target),
          tokenRanked: core.rankConversions(group.conversions, books, tokenRule.creditCount)
        };
      });
      const tokenValues = core.rankGuildTokenCreditValues(GUILD_TOKEN_CREDIT_CONVERSIONS, Object.fromEntries(rankedGroups.map((group) => [group.creditItemHrid, group.tokenRanked])));
      status.textContent = "";
      status.hidden = true;
      results.innerHTML = `${renderGuildTokenValues(tokenValues)}<div class="mwi-credit-grid">${rankedGroups.map((group) => renderCreditSection(group.creditItemHrid, group.label, group.color, group.ranked)).join("")}</div>`;
      button.disabled = false;
      finishRefresh(panel);
    } catch (error) {
      status.textContent = `市场快照读取失败：${error.message}`;
      button.disabled = false;
      finishRefresh(panel);
    }
  }

  function finishRefresh(panel) {
    state.refreshInFlight = false;
    if (!state.refreshQueued) return;
    state.refreshQueued = false;
    window.clearTimeout(state.refreshTimer);
    state.refreshTimer = window.setTimeout(() => refreshPanel(panel), 250);
  }

  function isVisible(node) {
    const modal = node && node.closest && node.closest('[class*="Modal_modal"]') || node;
    if (!modal || !modal.isConnected || modal.hidden || modal.getAttribute("aria-hidden") === "true") return false;
    const rect = modal.getBoundingClientRect();
    const style = getComputedStyle(modal);
    const opacity = Number(style.opacity);
    return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden" && style.pointerEvents !== "none" && (!Number.isFinite(opacity) || opacity > 0.01);
  }

  function itemHridFromIcon(icon) {
    const use = icon && icon.querySelector("use");
    const href = use && (use.getAttribute("href") || use.getAttribute("xlink:href"));
    if (!href || !href.includes("#")) return null;
    return `/items/${href.slice(href.lastIndexOf("#") + 1)}`;
  }

  function enhancementLevelFromIcon(icon) {
    const item = icon && icon.closest('[class*="Item_item"]');
    const label = item && item.querySelector('[class*="Item_enhancementLevel"]');
    const match = String(label && label.textContent || "").trim().match(/^\+(\d+)$/);
    const level = Number(match && match[1]);
    return Number.isSafeInteger(level) && level >= 0 ? level : 0;
  }

  function findGuildExchangeModal() {
    const candidates = Array.from(document.querySelectorAll('[class*="GuildPanel_exchangeModalContent"]'))
      .filter(isVisible);
    for (const element of candidates) {
      const modal = element.closest('[class*="Modal_modal"]') || element;
      const icons = Array.from(element.querySelectorAll('svg[role="img"][aria-label]'))
        .map((icon) => ({
          itemHrid: itemHridFromIcon(icon),
          itemName: icon.getAttribute("aria-label") || "",
          enhancementLevel: enhancementLevelFromIcon(icon)
        }))
        .filter((item) => item.itemHrid);
      const credit = icons.find((item) => CREDIT_TYPES.some(([hrid]) => hrid === item.itemHrid));
      const selected = icons.find((item) => !CREDIT_TYPES.some(([hrid]) => hrid === item.itemHrid));
      const quantityInput = element.querySelector('input[type="number"]');
      const batches = Number(quantityInput && quantityInput.value);
      if (!credit) continue;
      return {
        element,
        modal,
        creditItemHrid: credit.itemHrid,
        selectedItemHrid: selected && selected.itemHrid || null,
        selectedEnhancementLevel: selected && selected.enhancementLevel || 0,
        batches: Number.isSafeInteger(batches) && batches > 0 ? batches : 1
      };
    }
    return null;
  }

  const GUILD_EXCHANGE_ADVISOR_HOST_ID = "mwi-guild-exchange-advisor-host";

  const GUILD_EXCHANGE_ADVISOR_STYLES = `
    :host{all:initial;color-scheme:dark;font-family:system-ui,-apple-system,"Microsoft YaHei",sans-serif}*,*::before,*::after{box-sizing:border-box}[hidden]{display:none!important}
    .advisor{--credit:#4fcdb5;position:fixed;z-index:1065;display:flex;flex-direction:column;width:min(400px,calc(100vw - 24px));max-height:calc(100dvh - 24px);overflow:auto;border:1px solid #414361;border-left:4px solid var(--credit);border-radius:7px;background:#171927;color:#f4f5ff;box-shadow:0 8px 24px rgba(0,0,0,.45);font-size:13px;line-height:1.4}
    .head{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;padding:10px 12px;border-bottom:1px solid #414361;background:#24263e}.title{display:grid;gap:2px;font-size:17px;font-weight:700}.credit{display:flex;align-items:center;gap:5px;color:#c7cae4;font-size:11px;font-weight:500}.credit::before{width:9px;height:9px;border-radius:2px;background:var(--credit);content:""}.reference{padding-top:3px;color:#bfc2de;font-size:11px;white-space:nowrap}.body{display:flex;flex:1;min-height:0;flex-direction:column;gap:9px;padding:11px 12px}.options{display:grid;flex:1;min-height:0;grid-template-columns:minmax(0,1fr) 32px minmax(0,1fr);align-items:stretch;gap:8px}.options.single{grid-template-columns:minmax(0,1fr)}.option{min-width:0;padding:8px;border:1px solid #414361;border-radius:5px;background:#202139}.option.best{border-color:var(--credit);background:#193836}.label{display:block;margin-bottom:6px;color:#bfc2de;font-size:11px}.item{display:flex;align-items:center;gap:6px;min-width:0;color:#fff;font-size:14px;font-weight:700}.item .mwi-item-icon{width:32px;height:32px;flex:0 0 32px}.name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.cost{margin:8px 0 5px;color:var(--credit);font-size:23px;font-weight:700;line-height:1}.cost small{margin-left:3px;color:#bfc2de;font-size:11px;font-weight:500}.detail{display:flex;justify-content:space-between;gap:5px;color:#bfc2de;font-size:11px;white-space:nowrap}.detail b{color:#e7e8f6;font-weight:600}.versus{display:grid;place-items:center;color:#aeb1d3;font-size:11px;font-weight:700}.versus span{display:grid;place-items:center;width:28px;height:28px;border:1px solid #58607a;border-radius:50%;background:#151722}.summary{padding:8px;border-top:1px solid #414361;color:#dfe1f7;text-align:center;font-size:12px;font-weight:600}.summary strong{color:var(--credit);font-size:16px}
    @media (max-width:600px){.advisor{max-height:min(300px,calc(100dvh - 24px))}.options{grid-template-columns:minmax(0,1fr) 28px minmax(0,1fr)}.body{padding:9px}.option{padding:7px}.cost{font-size:20px}}
  `;

  function createGuildExchangeAdvisorUi() {
    if (!document.body || state.exchangeAdvisorUi) return state.exchangeAdvisorUi;
    if (document.getElementById(GUILD_EXCHANGE_ADVISOR_HOST_ID)) return null;
    const host = document.createElement("div");
    host.id = GUILD_EXCHANGE_ADVISOR_HOST_ID;
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `<style>${GUILD_EXCHANGE_ADVISOR_STYLES}</style><aside class="advisor" data-role="advisor" aria-live="polite" hidden></aside>`;
    document.body.append(host);
    state.exchangeAdvisorUi = { host, shadow, card: shadow.querySelector('[data-role="advisor"]'), signature: "", modal: null };
    return state.exchangeAdvisorUi;
  }

  function hideGuildExchangeAdvisor() {
    const ui = state.exchangeAdvisorUi;
    if (!ui) return;
    ui.card.hidden = true;
    ui.signature = "";
    ui.modal = null;
  }

  function calculateGuildExchangeAdvisorPosition(modalRect, cardRect) {
    const margin = 12;
    const gap = 12;
    const width = Math.max(1, cardRect.width);
    const height = Math.max(1, cardRect.height);
    const clampLeft = (value) => Math.max(margin, Math.min(value, window.innerWidth - width - margin));
    const clampTop = (value) => Math.max(margin, Math.min(value, window.innerHeight - height - margin));
    if (modalRect.right + gap + width <= window.innerWidth - margin) return { placement: "right", left: modalRect.right + gap, top: clampTop(modalRect.top) };
    if (modalRect.left - gap - width >= margin) return { placement: "left", left: modalRect.left - gap - width, top: clampTop(modalRect.top) };
    if (modalRect.bottom + gap + height <= window.innerHeight - margin) return { placement: "bottom", left: clampLeft(modalRect.left + (modalRect.width - width) / 2), top: modalRect.bottom + gap };
    if (modalRect.top - gap - height >= margin) return { placement: "top", left: clampLeft(modalRect.left + (modalRect.width - width) / 2), top: modalRect.top - gap - height };
    return { placement: "overlay", left: clampLeft(modalRect.left + (modalRect.width - width) / 2), top: clampTop(window.innerHeight - height - margin) };
  }

  function positionGuildExchangeAdvisor(ui, modal) {
    const card = ui && ui.card;
    if (!card) return false;
    if (!modal || !modal.isConnected || !isVisible(modal)) {
      card.hidden = true;
      return false;
    }
    const wasHidden = card.hidden;
    if (wasHidden) {
      card.style.visibility = "hidden";
      card.hidden = false;
    }
    const modalRect = modal.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    if (modalRect.width <= 0 || modalRect.height <= 0 || cardRect.width <= 0 || cardRect.height <= 0) {
      card.hidden = true;
      card.style.removeProperty("visibility");
      return false;
    }
    const position = calculateGuildExchangeAdvisorPosition(modalRect, cardRect);
    card.dataset.placement = position.placement;
    card.style.left = `${Math.round(position.left)}px`;
    card.style.top = `${Math.round(position.top)}px`;
    card.hidden = false;
    card.style.removeProperty("visibility");
    return true;
  }

  function advisorOptionMarkup(label, option, details, best) {
    const primary = details
      ? `${formatNumber(details.credits)}<small>信用点</small>`
      : `${core.formatCompactCost(option.costPerCredit)}<small>金币 / 信用</small>`;
    const first = details
      ? [details.firstLabel, details.firstValue]
      : ["单次兑换", `${formatNumber(option.itemCount)} 件 -> ${formatNumber(option.creditCount)} 点`];
    const second = details
      ? [details.secondLabel, details.secondValue]
      : ["市场成本", `${core.formatCompactCost(option.cost)} 金币`];
    return `<section class="option${best ? " best" : ""}"><span class="label">${escapeHtml(label)}</span><div class="item">${iconMarkup(option.itemHrid, option.itemName)}<span class="name">${escapeHtml(option.itemName)}</span></div><div class="cost">${primary}</div><div class="detail"><span>${escapeHtml(first[0])}</span><b>${escapeHtml(first[1])}</b></div><div class="detail"><span>${escapeHtml(second[0])}</span><b>${escapeHtml(second[1])}</b></div></section>`;
  }

  function guildExchangeAdvisorMarkup(data) {
    const comparison = Boolean(data.selected && data.replacement);
    const header = `<header class="head"><div class="title"><span>兑换最优推荐</span><span class="credit">${escapeHtml(data.creditLabel)}信用点</span></div><span class="reference">${escapeHtml(data.selected ? `卖出右一（税 2%）·买入${PRICE_REFERENCES[state.priceReference].label}` : `买入参考${PRICE_REFERENCES[state.priceReference].label}`)}</span></header>`;
    let summary = "请选择兑换物品以计算卖出后替代方案。";
    if (data.selectedOptimal) summary = "当前选择已是最优物品，无需卖出再回购。";
    else if (!data.selected && data.unavailableReason) summary = data.unavailableReason;
    else if (comparison && data.replacement.creditDifference > 0) summary = `卖出后改买可多获得 <strong>+${formatNumber(data.replacement.creditDifference)}</strong> ${escapeHtml(data.creditLabel)}信用点。`;
    else if (comparison && data.replacement.creditDifference < 0) summary = `直接兑换可多获得 <strong>${formatNumber(-data.replacement.creditDifference)}</strong> ${escapeHtml(data.creditLabel)}信用点。`;
    else if (comparison) summary = "两种方案可获得相同的信用点。";
    const selected = comparison ? advisorOptionMarkup("当前选择", data.selected, {
      credits: data.replacement.directCredits,
      firstLabel: "直接兑换",
      firstValue: `${formatNumber(data.replacement.sale.quantity)} 件 -> ${formatNumber(data.replacement.directCredits)} 点`,
      secondLabel: "税后所得",
      secondValue: `${core.formatCompactCost(data.replacement.sale.net)} 金币`
    }) : "";
    const best = advisorOptionMarkup(data.selectedOptimal ? "当前选择（最优）" : "最优物品", data.best, comparison ? {
      credits: data.replacement.best.actualCredits,
      firstLabel: "回购兑换",
      firstValue: `${formatNumber(data.replacement.best.requiredItems)} 件 -> ${formatNumber(data.replacement.best.actualCredits)} 点`,
      secondLabel: "买入成本",
      secondValue: `${core.formatCompactCost(data.replacement.best.cost)} 金币`
    } : null, true);
    return `${header}<div class="body"><div class="options${comparison ? "" : " single"}">${selected}${comparison ? '<div class="versus"><span>VS</span></div>' : ""}${best}</div><div class="summary">${summary}</div></div>`;
  }

  function renderGuildExchangeAdvisor(modalData, data, forceRender) {
    const ui = state.exchangeAdvisorUi;
    if (!ui) return false;
    const markup = guildExchangeAdvisorMarkup(data);
    if (forceRender || ui.signature !== markup) {
      ui.card.innerHTML = markup;
      ui.signature = markup;
    }
    ui.modal = modalData.modal;
    ui.card.setAttribute("aria-label", "兑换最优推荐");
    ui.card.style.setProperty("--credit", data.color);
    return positionGuildExchangeAdvisor(ui, modalData.modal);
  }

  function refreshGuildExchangeAdvisor(forceRender) {
    const ui = state.exchangeAdvisorUi;
    if (!ui) return false;
    const modalData = findGuildExchangeModal();
    if (!modalData) {
      hideGuildExchangeAdvisor();
      return false;
    }

    const conversions = allConversions(modalData.creditItemHrid);
    if (!conversions.length) {
      hideGuildExchangeAdvisor();
      return false;
    }

    if (!state.snapshot) {
      hideGuildExchangeAdvisor();
      if (state.exchangeAdvisorSnapshotFailed) return;
      if (!state.exchangeAdvisorLoadInFlight) {
        state.exchangeAdvisorLoadInFlight = true;
        loadSnapshot(false)
          .catch(() => { state.exchangeAdvisorSnapshotFailed = true; return null; })
          .finally(() => { state.exchangeAdvisorLoadInFlight = false; scheduleGuildExchangeAdvisor(true); });
      }
      return false;
    }

    const books = Object.fromEntries(conversions.map((conversion) => [conversion.itemHrid, snapshotOrderBook(conversion.itemHrid)]));
    let best = core.rankConversions(conversions, books, 1).find((result) => result.status === "ok");
    if (!best) {
      hideGuildExchangeAdvisor();
      return false;
    }

    const selectedConversion = conversions.find((conversion) => conversion.itemHrid === modalData.selectedItemHrid);
    let selected = null;
    let replacement = null;
    let selectedOptimal = false;
    let unavailableReason = "";
    if (selectedConversion) {
      if (selectedConversion.itemHrid === best.itemHrid) {
        selectedOptimal = true;
      } else {
        const sellPrice = snapshotImmediateSellPrice(selectedConversion.itemHrid, modalData.selectedEnhancementLevel);
        const buyPrices = Object.fromEntries(conversions.map((conversion) => [conversion.itemHrid, snapshotPrice(conversion.itemHrid, state.priceReference)]));
        replacement = core.estimateSaleReplacement({
          selectedConversion,
          batches: modalData.batches,
          sellPrice,
          sellerTaxRate: SELLER_TAX_RATE,
          conversions,
          buyPrices
        });
        if (replacement.status === "already_optimal") {
          best = replacement.best;
          selectedOptimal = true;
          replacement = null;
        } else if (replacement.status !== "ok") {
          unavailableReason = "当前物品暂无公开收购价，无法估算卖出后回购。";
          replacement = null;
        } else {
          selected = selectedConversion;
        }
      }
    }
    const creditLabel = CREDIT_TYPES.find(([hrid]) => hrid === modalData.creditItemHrid)?.[1] || "该颜色";
    return renderGuildExchangeAdvisor(modalData, {
      creditLabel,
      color: CREDIT_TYPES.find(([hrid]) => hrid === modalData.creditItemHrid)?.[2] || "#4fcdb5",
      best: replacement ? replacement.best : best,
      selected,
      selectedOptimal,
      replacement,
      unavailableReason
    }, forceRender);
  }

  function scheduleGuildExchangeAdvisor(forceRender) {
    if (!state.exchangeAdvisorUi) return;
    state.exchangeAdvisorForceRender = state.exchangeAdvisorForceRender || Boolean(forceRender);
    if (state.exchangeAdvisorFrame !== null) return;
    const requestFrame = typeof window.requestAnimationFrame === "function"
      ? window.requestAnimationFrame.bind(window)
      : (handler) => window.setTimeout(handler, 0);
    state.exchangeAdvisorFrame = requestFrame(() => {
      state.exchangeAdvisorFrame = null;
      const shouldForceRender = state.exchangeAdvisorForceRender;
      state.exchangeAdvisorForceRender = false;
      refreshGuildExchangeAdvisor(shouldForceRender);
    });
  }

  function mutationMayAffectGuildExchangeAdvisor(mutation) {
    const activeModal = state.exchangeAdvisorUi && state.exchangeAdvisorUi.modal;
    const target = mutation.target && (mutation.target.nodeType === 1 ? mutation.target : mutation.target.parentElement);
    if (activeModal) {
      if (!activeModal.isConnected || mutation.target === activeModal || activeModal.contains(mutation.target)
        || (mutation.type === "attributes" && target && target.contains && target.contains(activeModal))) return true;
      return Array.from(mutation.addedNodes || []).concat(Array.from(mutation.removedNodes || []))
        .some((node) => node === activeModal || node.contains && node.contains(activeModal));
    }

    if (target && target.closest && target.closest('[class*="GuildPanel_exchangeModalContent"]')) return true;
    return Array.from(mutation.addedNodes || []).some((node) => node && node.nodeType === 1 && (
      node.matches('[class*="GuildPanel_exchangeModalContent"]') || node.querySelector('[class*="GuildPanel_exchangeModalContent"]')
    ));
  }

  function watchGuildExchangeModals() {
    if (!document.body || state.exchangeAdvisorObserver) return;
    const Observer = pageWindow.MutationObserver || (typeof MutationObserver === "function" ? MutationObserver : null);
    if (!Observer) return;
    state.exchangeAdvisorObserver = new Observer((mutations) => {
      if (Array.from(mutations || []).some(mutationMayAffectGuildExchangeAdvisor)) scheduleGuildExchangeAdvisor();
    });
    state.exchangeAdvisorObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ["aria-label", "class", "hidden", "href", "style", "xlink:href"],
      characterData: true,
      childList: true,
      subtree: true
    });
    if (!state.exchangeAdvisorListenersInstalled) {
      const reposition = () => scheduleGuildExchangeAdvisor();
      window.addEventListener("resize", reposition, { passive: true });
      window.addEventListener("orientationchange", reposition, { passive: true });
      window.addEventListener("scroll", reposition, { capture: true, passive: true });
      state.exchangeAdvisorListenersInstalled = true;
    }
    scheduleGuildExchangeAdvisor(true);
  }

  function startGuildExchangeAdvisor() {
    if (!createGuildExchangeAdvisorUi()) return;
    watchGuildExchangeModals();
    scheduleGuildExchangeAdvisor(true);
  }

  function findSidebarTabBar() {
    const expectedTabs = new Set(["库存", "装备", "技能", "房屋", "配装", "收获"]);
    const elements = document.getElementsByTagName("*");
    for (let index = 0; index < elements.length; index += 1) {
      const candidate = elements[index];
      const children = Array.from(candidate.children);
      if (children.length < 4) continue;
      const tabs = children.map((child) => ({
        element: child,
        label: String(child.innerText || child.textContent || "").replaceAll("\n", "").trim()
      }));
      const recognized = tabs.filter((tab) => expectedTabs.has(tab.label));
      if (recognized.length >= 4) {
        const prototype = recognized.find((tab) => tab.label === "库存") || recognized[0];
        const tabsRoot = candidate.parentElement && candidate.parentElement.parentElement && candidate.parentElement.parentElement.parentElement;
        const sidebar = tabsRoot && tabsRoot.parentElement;
        const panelHost = sidebar && Array.from(sidebar.children).find((node) => node !== tabsRoot && /tabPanelsContainer/.test(String(node.className)));
        if (panelHost) return { tabBar: candidate, tabPrototype: prototype.element, panelHost };
      }
    }
    return null;
  }

  function hideCreditPanel() {
    if (state.panel) state.panel.hidden = true;
    if (state.creditTab) {
      state.creditTab.classList.remove("Mui-selected");
      state.creditTab.setAttribute("aria-selected", "false");
    }
    for (const node of state.hiddenSidebarNodes) {
      if (!node.isConnected) continue;
      node.style.display = node.dataset.mwiCreditPreviousDisplay || "";
      delete node.dataset.mwiCreditPreviousDisplay;
    }
    state.hiddenSidebarNodes = [];
  }

  function activateCreditTabFromPointer(event) {
    const creditTab = state.creditTab;
    if (!creditTab || !creditTab.isConnected) return false;
    const rawTarget = event.target;
    const target = rawTarget && rawTarget.nodeType === 1 ? rawTarget : rawTarget && rawTarget.parentElement;
    if (!target || !creditTab.contains(target)) return false;
    const tabBar = creditTab.parentElement;
    const tabsRoot = tabBar && tabBar.parentElement && tabBar.parentElement.parentElement && tabBar.parentElement.parentElement.parentElement;
    const sidebar = tabsRoot && tabsRoot.parentElement;
    const panelHost = sidebar && Array.from(sidebar.children).find((node) => /tabPanelsContainer/.test(String(node.className)));
    if (!tabBar || !panelHost) return false;
    event.preventDefault();
    event.stopImmediatePropagation();
    showCreditPanel(panelHost, tabBar);
    return true;
  }

  function showCreditPanel(panelHost, tabBar) {
    if (!state.panel || !state.panel.isConnected) return;
    hideCreditPanel();
    state.hiddenSidebarNodes = Array.from(panelHost.children).filter((node) => node !== state.panel);
    for (const node of state.hiddenSidebarNodes) {
      node.dataset.mwiCreditPreviousDisplay = node.style.display;
      node.style.display = "none";
    }
    state.panel.hidden = false;
    for (const tab of tabBar.children) {
      tab.classList.remove("Mui-selected");
      tab.setAttribute("aria-selected", "false");
    }
    state.creditTab.classList.add("Mui-selected");
    state.creditTab.setAttribute("aria-selected", "true");
    hydrateLocalInitData();
    hydrateBridgeData();
    extractItemDetailsFromReact();
    if (state.panel.dataset.activeView === "upgrade") refreshGuildUpgrade(state.panel);
    else refreshPanel(state.panel);
  }

  function ensureSidebarIntegration() {
    refreshPageItemNames();
    if (state.panel && state.panel.isConnected && state.creditTab && state.creditTab.isConnected) return;
    const integration = findSidebarTabBar();
    if (!integration || !integration.panelHost) return;
    const { tabBar, tabPrototype, panelHost } = integration;
    const existingTab = tabBar.querySelector('[data-mwi-credit-tab="true"]');
    if (existingTab && state.panel && state.panel.isConnected) return;
    if (existingTab) existingTab.remove();

    if (state.panel && !state.panel.isConnected) state.panel = null;
    if (state.creditTab && !state.creditTab.isConnected) state.creditTab = null;

    const creditTab = tabPrototype.cloneNode(true);
    creditTab.dataset.mwiCreditTab = "true";
    creditTab.classList.remove("Mui-selected");
    creditTab.removeAttribute("id");
    creditTab.removeAttribute("disabled");
    creditTab.removeAttribute("aria-disabled");
    creditTab.setAttribute("aria-selected", "false");
    creditTab.setAttribute("role", "tab");
    if ("disabled" in creditTab) creditTab.disabled = false;
    creditTab.replaceChildren(document.createTextNode("信用"));
    const activateCreditTab = (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      showCreditPanel(panelHost, tabBar);
    };
    creditTab.addEventListener("pointerdown", activateCreditTab, true);
    creditTab.addEventListener("click", activateCreditTab, true);
    tabBar.append(creditTab);

    const panel = createPanel();
    panel.hidden = true;
    panelHost.append(panel);
    tabBar.addEventListener("click", (event) => {
      if (!creditTab.contains(event.target)) hideCreditPanel();
    });
    state.panel = panel;
    state.creditTab = creditTab;
  }

  hydrateLocalInitData();
  hydrateBridgeData();
  document.addEventListener("pointerdown", activateCreditTabFromPointer, true);
  document.addEventListener("click", activateCreditTabFromPointer, true);
  document.addEventListener("input", (event) => {
    const target = event.target && (event.target.nodeType === 1 ? event.target : event.target.parentElement);
    if (target && target.closest && target.closest('[class*="GuildPanel_exchangeModalContent"]')) scheduleGuildExchangeAdvisor();
  }, true);
  document.addEventListener("click", (event) => {
    const target = event.target && (event.target.nodeType === 1 ? event.target : event.target.parentElement);
    if (target && target.closest('[class*="GuildPanel_exchangeModalContent"]')) scheduleGuildExchangeAdvisor();
  }, true);
  state.panelSearchTimer = window.setInterval(ensureSidebarIntegration, 3000);
  if (document.body) startGuildExchangeAdvisor();
  else document.addEventListener("DOMContentLoaded", startGuildExchangeAdvisor, { once: true });
  window.setTimeout(ensureSidebarIntegration, 1000);
})();
