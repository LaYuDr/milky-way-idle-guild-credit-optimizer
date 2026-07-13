// ==UserScript==
// @name         银河奶牛公会信用点性价比
// @namespace    https://www.milkywayidle.com/
// @version      0.4.17
// @author       柆雨
// @license      Copyright 柆雨
// @description  只读计算八种公会信用点性价比与神龛升级材料；不会自动交易、兑换或升级。
// @match        https://www.milkywayidle.com/*
// @match        https://www.milkywayidlecn.com/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

// MWI_GUILD_CREDIT_RUNTIME
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

  return { normalizeAsks, quoteAsks, evaluateConversion, rankConversions, evaluateBudgetConversion, bestConversionForBudget, calculateSaleProceeds, snapshotMarketPrice, formatCompactCost, aggregateGuildBuffLevelCosts, aggregateGuildBuffPlans, conversionsFromItemDetails };
});


(function () {
  "use strict";

  const core = window.MwiGuildCreditCore;
  const localization = window.MwiGuildCreditLocalization;
  if (!core || !localization) return;
  const pageWindow = typeof unsafeWindow === "undefined" ? window : unsafeWindow;

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
    "Philosopher's Necklace": "哲学家项链",
    "Philosopher's Ring": "哲学家戒指",
    "Necklace Of Speed": "速度项链",
    "Philosopher's Earrings": "哲学家耳环",
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
  const state = { itemDetails: null, guildBuffDetails: null, guildBuffLevels: null, pageItemNames: Object.create(null), upgradePlans: [], nextUpgradePlanId: 1, snapshot: null, panel: null, creditTab: null, hiddenSidebarNodes: [], refreshTimer: null, refreshInFlight: false, refreshQueued: false, panelSearchTimer: null, collapsedCreditSections: new Set(), exchangeAdvisor: null, exchangeAdvisorTimer: null, exchangeAdvisorLoadInFlight: false, exchangeAdvisorSnapshotFailed: false };

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

  function setGuildBuffLevelsFrom(source) {
    if (!source || typeof source !== "object") return false;
    return setGuildBuffLevels(
      source.characterGuildBuffMap || source.characterGuildBuffDict || source.characterGuildBuffs ||
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
    if (state.itemDetails && state.guildBuffDetails && state.guildBuffLevels) return true;
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
      return hasItems || hasGuildBuffs || hasGuildBuffLevels;
    } catch (_) {
      return false;
    }
  }

  function extractItemDetailsFromReact() {
    if (state.itemDetails && state.guildBuffDetails && state.guildBuffLevels) return true;
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
        if (state.itemDetails && state.guildBuffDetails && state.guildBuffLevels) return true;
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
    for (const child of Object.values(value)) scanMessage(child, depth + 1);
  }

  function hydrateBridgeData() {
    const bridge = pageWindow.__mwiGuildCreditBridge;
    if (!bridge || typeof bridge !== "object") return;
    setItemDetails(bridge.itemDetails);
    setGuildBuffLevelsFrom(bridge);
    if (Array.isArray(bridge.messages) && (!state.itemDetails || !state.guildBuffDetails || !state.guildBuffLevels)) {
      for (let index = bridge.messages.length - 1; index >= 0 && (!state.itemDetails || !state.guildBuffDetails || !state.guildBuffLevels); index -= 1) {
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

  function snapshotOrderBook(itemHrid) {
    const askPrice = snapshotPrice(itemHrid, "a");
    return askPrice === null ? null : { asks: [{ price: askPrice, quantity: Number.MAX_SAFE_INTEGER }] };
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
    return core.conversionsFromItemDetails(state.itemDetails, creditItemHrid).map((conversion) => ({
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

  function renderMaterialTotals(results, totals) {
    const planSummary = results.map((plan) => {
      const entry = guildBuffEntries().find((candidate) => candidate.hrid === plan.guildBuffHrid);
      const label = entry ? guildBuffLabel(entry.detail, entry.hrid) : plan.guildBuffHrid;
      return `<span>${escapeHtml(label)} ${plan.startLevel} -> ${plan.targetLevel}</span>`;
    }).join("<span class=\"mwi-plan-separator\">，</span>");
    const materials = totals.sort(materialOrder).map((item) => `<div class="mwi-material-row">${iconMarkup(item.itemHrid, itemNameForMaterial(item.itemHrid))}<span class="mwi-material-name">${escapeHtml(itemNameForMaterial(item.itemHrid))}</span><strong>${formatNumber(item.count)}</strong></div>`).join("");
    return `<div class="mwi-plan-summary">${planSummary}</div><div class="mwi-material-list">${materials}</div>`;
  }

  function refreshGuildUpgrade(panel) {
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
    status.textContent = state.guildBuffLevels
      ? `已合并 ${result.plans.length} 项神龛升级的材料成本。`
      : `未读取当前神龛等级，已按 0 级开始；请确认或手动调整“起始等级”。`;
    results.innerHTML = renderMaterialTotals(result.plans, result.totals);
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

  function createPanel() {
    const panel = document.createElement("section");
    panel.id = "mwi-credit-optimizer";
    panel.innerHTML = `
      <style>
        #mwi-credit-optimizer{position:relative;z-index:20;flex:1;min-height:0;height:100%;overflow-y:auto;overflow-x:hidden;margin:0;padding:12px;background:#202139;color:#f4f5ff;font:14px system-ui,sans-serif}
        #mwi-credit-optimizer[hidden]{display:none} [data-mwi-credit-tab="true"]{user-select:none;pointer-events:auto!important;cursor:pointer!important}
        #mwi-credit-optimizer *{box-sizing:border-box} #mwi-credit-optimizer h3{margin:0 0 10px;font-size:17px}
        #mwi-credit-optimizer .mwi-view-tabs{display:flex;border-bottom:1px solid #474969;margin:0 0 10px}.mwi-view-tab{min-height:30px!important;border-radius:0!important;background:transparent!important;color:#c9cbeb!important;padding:5px 10px!important}.mwi-view-tab-active{border-bottom:2px solid #43c4ad!important;color:#fff!important}
        #mwi-credit-optimizer .mwi-controls{display:flex;gap:8px;align-items:end;flex-wrap:wrap} #mwi-credit-optimizer label{display:grid;gap:4px;color:#d8d8e8}
        #mwi-credit-optimizer input,#mwi-credit-optimizer select{width:112px;min-height:32px;border:1px solid #7778b4;border-radius:4px;padding:4px 8px;background:#f1f2ff;color:#1f2030;font:inherit}
        #mwi-credit-optimizer button{min-height:32px;border:0;border-radius:4px;padding:5px 12px;background:#43c4ad;color:#10201f;font-weight:700;cursor:pointer}
        #mwi-credit-optimizer button:disabled{opacity:.55;cursor:wait} #mwi-credit-optimizer .mwi-status{margin:10px 0;color:#c9cbeb}
        #mwi-credit-optimizer .mwi-credit-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:10px}
        #mwi-credit-optimizer .mwi-credit-section{min-width:0;border:1px solid #474969;border-top:3px solid var(--mwi-credit-color);border-radius:6px;background:#292a46;overflow:hidden}
        #mwi-credit-optimizer .mwi-credit-heading{display:flex;align-items:center;gap:7px;width:100%;min-height:0!important;border:0;border-radius:0;background:transparent!important;color:#fff!important;padding:8px 9px 6px!important;font:inherit;text-align:left;font-size:13px;font-weight:700;cursor:pointer}.mwi-credit-heading:hover{background:#303151!important}.mwi-credit-heading .mwi-collapse-icon{margin-left:auto;color:#c9cbeb;font-size:15px;line-height:1}
        #mwi-credit-optimizer .mwi-credit-heading .mwi-item-icon{width:22px;height:22px;flex:0 0 22px}.mwi-credit-section table{width:100%;border-collapse:collapse;font-size:11px}
        #mwi-credit-optimizer th,#mwi-credit-optimizer td{padding:5px 6px;border-top:1px solid #474969;text-align:right;white-space:nowrap}
        #mwi-credit-optimizer th:first-child,#mwi-credit-optimizer td:first-child{text-align:left} #mwi-credit-optimizer th{color:#bfc2de;font-weight:600}
        #mwi-credit-optimizer .mwi-item{display:flex;align-items:center;gap:5px;min-width:0}.mwi-item-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        #mwi-credit-optimizer .mwi-item-icon{display:inline-block;width:24px;height:24px;flex:0 0 24px;vertical-align:middle}.mwi-item-icon-fallback{border-radius:4px;background:#45476b}
        #mwi-credit-optimizer .mwi-cost{color:#77f3d0;font-weight:700} #mwi-credit-optimizer .mwi-empty{padding:8px;color:#ffd17c;font-size:12px}
        #mwi-credit-optimizer .mwi-upgrade-plan-list{display:grid;gap:8px}#mwi-credit-optimizer .mwi-upgrade-plan{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) 32px;gap:8px;align-items:end;padding:8px;border:1px solid #474969;border-radius:4px;background:#292a46}#mwi-credit-optimizer .mwi-upgrade-plan label{min-width:0;text-align:left;justify-items:stretch}#mwi-credit-optimizer .mwi-upgrade-plan label:first-child{grid-column:1/-1;grid-row:1}#mwi-credit-optimizer .mwi-upgrade-plan label:nth-child(2){grid-column:1;grid-row:2}#mwi-credit-optimizer .mwi-upgrade-plan label:nth-child(3){grid-column:2;grid-row:2}#mwi-credit-optimizer .mwi-upgrade-plan select{width:100%!important;max-width:none;min-width:0}#mwi-credit-optimizer .mwi-remove-plan{grid-column:3;grid-row:2;width:32px;min-width:32px;padding:0!important;font-size:20px;line-height:1;background:#555773!important;color:#fff!important}#mwi-credit-optimizer .mwi-upgrade-actions{margin-top:10px}
        #mwi-credit-optimizer .mwi-material-list{border-top:1px solid #474969}.mwi-material-row{display:flex;align-items:center;gap:8px;padding:8px 4px;border-bottom:1px solid #474969}.mwi-material-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.mwi-material-row strong{color:#77f3d0;font-size:15px}.mwi-plan-summary{display:flex;flex-wrap:wrap;gap:2px 0;margin:10px 0 6px;color:#c9cbeb;font-size:12px}.mwi-plan-separator{padding-right:4px}.mwi-plugin-footer{margin-top:16px;padding:10px 4px 2px;border-top:1px solid #474969;color:#aeb1d3;font-size:12px;line-height:1.6;text-align:center}
        @media (max-width:430px){#mwi-credit-optimizer .mwi-credit-grid{grid-template-columns:1fr}}
      </style>
      <h3>公会助手</h3>
      <div class="mwi-view-tabs" role="tablist">
        <button class="mwi-view-tab mwi-view-tab-active" data-role="view-credit" role="tab" aria-selected="true" type="button">信用点性价比</button>
        <button class="mwi-view-tab" data-role="view-upgrade" role="tab" aria-selected="false" type="button">神龛升级</button>
      </div>
      <div data-role="credit-view">
        <div class="mwi-controls">
          <label>目标信用点<input data-role="target" type="number" min="1" step="1" value="1"></label>
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
      <footer class="mwi-plugin-footer">作者：柆雨<br>有问题请加群反馈：437320340</footer>`;
    panel.querySelector('[data-role="refresh"]').addEventListener("click", () => refreshPanel(panel, true));
    panel.querySelector('[data-role="target"]').addEventListener("change", () => refreshPanel(panel));
    panel.querySelector('[data-role="results"]').addEventListener("click", (event) => {
      const toggle = event.target.closest('[data-role="toggle-credit-section"]');
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
        return { ...group, ranked: core.rankConversions(group.conversions, books, target) };
      });
      status.textContent = "";
      status.hidden = true;
      results.innerHTML = `<div class="mwi-credit-grid">${rankedGroups.map((group) => renderCreditSection(group.creditItemHrid, group.label, group.color, group.ranked)).join("")}</div>`;
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
    if (!node || !node.isConnected) return false;
    const rect = node.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && getComputedStyle(node).visibility !== "hidden";
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
      if (!credit || !selected || !Number.isSafeInteger(batches) || batches <= 0) continue;
      return {
        element,
        creditItemHrid: credit.itemHrid,
        selectedItemHrid: selected.itemHrid,
        selectedEnhancementLevel: selected.enhancementLevel,
        batches
      };
    }
    return null;
  }

  function ensureGuildExchangeAdvisor() {
    if (state.exchangeAdvisor && state.exchangeAdvisor.isConnected) return state.exchangeAdvisor;
    const advisor = document.createElement("aside");
    advisor.id = "mwi-guild-exchange-advisor";
    advisor.setAttribute("aria-live", "polite");
    advisor.innerHTML = `<style>
      #mwi-guild-exchange-advisor{position:fixed;z-index:1501;box-sizing:border-box;padding:0;border:1px solid #4fcdb5;border-radius:7px;background:#202139;color:#f4f5ff;box-shadow:0 8px 24px rgba(0,0,0,.45);font:13px/1.4 system-ui,sans-serif;pointer-events:none;overflow:hidden}
      #mwi-guild-exchange-advisor[hidden]{display:none}#mwi-guild-exchange-advisor .mwi-advisor-head{display:flex;align-items:center;justify-content:space-between;padding:9px 11px 8px;border-bottom:1px solid #414361;background:#282a49;color:#dfe1f7;font-weight:700}#mwi-guild-exchange-advisor .mwi-advisor-tax{color:#bfc2de;font-size:11px;font-weight:500}#mwi-guild-exchange-advisor .mwi-advisor-body{padding:10px 11px 9px}#mwi-guild-exchange-advisor .mwi-advisor-result{display:flex;align-items:baseline;gap:5px;margin:0 0 9px;padding:7px 8px;border-radius:4px;background:#173c38;color:#d9fff4}#mwi-guild-exchange-advisor .mwi-advisor-result[data-state="neutral"]{background:#303149;color:#e7e8f6}#mwi-guild-exchange-advisor .mwi-advisor-result-label{font-size:12px}#mwi-guild-exchange-advisor .mwi-advisor-result strong{color:#77f3d0;font-size:21px;line-height:1}#mwi-guild-exchange-advisor .mwi-advisor-result[data-state="neutral"] strong{color:#e7e8f6}#mwi-guild-exchange-advisor .mwi-advisor-metrics{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:7px}#mwi-guild-exchange-advisor .mwi-advisor-metric{min-width:0;padding:6px 7px;border:1px solid #414361;border-radius:4px;background:#252640}#mwi-guild-exchange-advisor .mwi-advisor-metric-wide{grid-column:1/-1}#mwi-guild-exchange-advisor .mwi-advisor-metric span{display:block;margin-bottom:2px;color:#bfc2de;font-size:11px}#mwi-guild-exchange-advisor .mwi-advisor-metric b{display:block;overflow:hidden;color:#fff;font-size:13px;text-overflow:ellipsis;white-space:nowrap}#mwi-guild-exchange-advisor .mwi-advisor-metric em{margin-left:4px;color:#77f3d0;font-style:normal}
    </style><div class="mwi-advisor-head"><span>兑换替代估算</span><span class="mwi-advisor-tax">卖出税 2%</span></div><div class="mwi-advisor-body"><div class="mwi-advisor-result" data-role="result"><span class="mwi-advisor-result-label" data-role="result-label"></span><strong data-role="difference"></strong><span data-role="credit-label"></span></div><div class="mwi-advisor-metrics"><div class="mwi-advisor-metric"><span>出售</span><b data-role="sale-item"></b></div><div class="mwi-advisor-metric"><span>税后所得</span><b data-role="net-sale"></b></div><div class="mwi-advisor-metric mwi-advisor-metric-wide"><span>建议改买</span><b data-role="best-item"></b></div></div></div>`;
    document.body.append(advisor);
    state.exchangeAdvisor = advisor;
    return advisor;
  }

  function hideGuildExchangeAdvisor() {
    if (state.exchangeAdvisor) state.exchangeAdvisor.hidden = true;
  }

  function placeGuildExchangeAdvisor(advisor, modal) {
    const margin = 12;
    const gap = 12;
    const rect = modal.getBoundingClientRect();
    const maxWidth = Math.max(0, window.innerWidth - margin * 2);
    const maxHeight = Math.max(0, window.innerHeight - margin * 2);
    const rightSpace = Math.max(0, window.innerWidth - rect.right - gap - margin);
    const leftSpace = Math.max(0, rect.left - gap - margin);
    const sideSpace = Math.max(rightSpace, leftSpace);
    const width = Math.min(rect.width, sideSpace || maxWidth);
    const height = Math.min(rect.height, maxHeight);
    advisor.style.width = `${Math.round(width)}px`;
    advisor.style.height = `${Math.round(height)}px`;

    let left = rightSpace >= leftSpace ? rect.right + gap : rect.left - width - gap;
    let top = Math.max(margin, Math.min(rect.top, window.innerHeight - height - margin));
    if (sideSpace === 0) {
      left = Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin));
      top = Math.min(window.innerHeight - height - margin, rect.bottom + gap);
    }
    advisor.style.left = `${Math.round(left)}px`;
    advisor.style.top = `${Math.round(Math.max(margin, top))}px`;
  }

  function renderGuildExchangeAdvisor(modalData, data) {
    const advisor = ensureGuildExchangeAdvisor();
    const result = advisor.querySelector('[data-role="result"]');
    result.dataset.state = data.gain > 0 ? "gain" : "neutral";
    advisor.querySelector('[data-role="result-label"]').textContent = data.gain > 0 ? "改买后多获得" : "直接兑换更划算";
    advisor.querySelector('[data-role="difference"]').textContent = data.gain > 0 ? `+${formatNumber(data.gain)}` : "0";
    advisor.querySelector('[data-role="credit-label"]').textContent = `${data.creditLabel}信用点`;
    advisor.querySelector('[data-role="sale-item"]').textContent = data.saleItem;
    advisor.querySelector('[data-role="net-sale"]').textContent = `${core.formatCompactCost(data.netSale)} 金币`;
    advisor.querySelector('[data-role="best-item"]').textContent = "";
    const bestItem = advisor.querySelector('[data-role="best-item"]');
    bestItem.append(document.createTextNode(data.bestItem));
    const creditAmount = document.createElement("em");
    creditAmount.textContent = `${formatNumber(data.bestCredits)} 点`;
    bestItem.append(creditAmount);
    advisor.hidden = false;
    placeGuildExchangeAdvisor(advisor, modalData.element);
  }

  function refreshGuildExchangeAdvisor() {
    const modalData = findGuildExchangeModal();
    if (!modalData) {
      hideGuildExchangeAdvisor();
      return;
    }

    const conversions = allConversions(modalData.creditItemHrid);
    const selectedConversion = conversions.find((conversion) => conversion.itemHrid === modalData.selectedItemHrid);
    if (!selectedConversion) {
      hideGuildExchangeAdvisor();
      return;
    }

    if (!state.snapshot) {
      hideGuildExchangeAdvisor();
      if (state.exchangeAdvisorSnapshotFailed) return;
      if (!state.exchangeAdvisorLoadInFlight) {
        state.exchangeAdvisorLoadInFlight = true;
        loadSnapshot(false)
          .catch(() => { state.exchangeAdvisorSnapshotFailed = true; return null; })
          .finally(() => { state.exchangeAdvisorLoadInFlight = false; refreshGuildExchangeAdvisor(); });
      }
      return;
    }

    const sellPrice = snapshotImmediateSellPrice(selectedConversion.itemHrid, modalData.selectedEnhancementLevel);
    if (sellPrice === null) {
      hideGuildExchangeAdvisor();
      return;
    }

    const saleItemCount = modalData.batches * selectedConversion.itemCount;
    const sale = core.calculateSaleProceeds(saleItemCount, sellPrice, SELLER_TAX_RATE);
    if (sale.status !== "ok") {
      hideGuildExchangeAdvisor();
      return;
    }
    const buyPrices = Object.fromEntries(conversions.map((conversion) => [conversion.itemHrid, snapshotPrice(conversion.itemHrid, "a")]));
    const best = core.bestConversionForBudget(conversions, buyPrices, sale.net);
    if (!best) {
      hideGuildExchangeAdvisor();
      return;
    }

    const directCredits = modalData.batches * selectedConversion.creditCount;
    const creditLabel = CREDIT_TYPES.find(([hrid]) => hrid === modalData.creditItemHrid)?.[1] || "该颜色";
    const difference = best.actualCredits - directCredits;
    renderGuildExchangeAdvisor(modalData, {
      gain: Math.max(0, difference),
      creditLabel,
      saleItem: `${saleItemCount} 件${selectedConversion.itemName}${modalData.selectedEnhancementLevel > 0 ? ` +${modalData.selectedEnhancementLevel}` : ""}`,
      netSale: sale.net,
      bestItem: best.itemName,
      bestCredits: best.actualCredits
    });
  }

  function scheduleGuildExchangeAdvisor() {
    window.clearTimeout(state.exchangeAdvisorTimer);
    state.exchangeAdvisorTimer = window.setTimeout(refreshGuildExchangeAdvisor, 80);
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
    const rect = creditTab.getBoundingClientRect();
    const isHit = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
    if (!isHit) return false;
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
    if (event.target.closest('[class*="GuildPanel_exchangeModalContent"]')) scheduleGuildExchangeAdvisor();
  }, true);
  window.addEventListener("resize", scheduleGuildExchangeAdvisor);
  state.panelSearchTimer = window.setInterval(ensureSidebarIntegration, 3000);
  window.setInterval(refreshGuildExchangeAdvisor, 800);
  window.setTimeout(ensureSidebarIntegration, 1000);
  window.setTimeout(refreshGuildExchangeAdvisor, 1000);
})();
