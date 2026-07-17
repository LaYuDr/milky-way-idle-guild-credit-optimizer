(function () {
  "use strict";

  const core = window.MwiGuildCreditCore;
  const localization = window.MwiGuildCreditLocalization;
  if (!core || !localization) return;
  const pageWindow = typeof unsafeWindow === "undefined" ? window : unsafeWindow;
  const PLUGIN_VERSION = String(window.MwiGuildCreditVersion || "0.0.0");
  const UPDATE_SCRIPT_URL = "https://raw.githubusercontent.com/LaYuDr/milky-way-idle-guild-credit-optimizer/main/dist/milky-way-idle-guild-credit-optimizer.user.js";
  const PRICE_REFERENCE_STORAGE_KEY = "mwi-credit-price-reference";
  const UI_STATE_STORAGE_KEY = "mwi-guild-credit-ui-state-v1";
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
  const savedUiState = loadSavedPluginUiState();
  const state = { itemDetails: null, conversionCache: new Map(), guildBuffDetails: null, guildBuffLevels: null, characterItems: null, pageItemNames: Object.create(null), upgradePlans: savedUiState.upgradePlans.map((plan, index) => ({ id: `plan-${index + 1}`, ...plan })), nextUpgradePlanId: savedUiState.upgradePlans.length + 1, snapshot: null, priceReference: savedPriceReference(), targetCredit: savedUiState.targetCredit, panel: null, creditTab: null, hiddenSidebarNodes: [], refreshTimer: null, refreshInFlight: false, refreshQueued: false, panelSearchTimer: null, collapsedCreditSections: new Set(savedUiState.collapsedCreditSections), guildTokenValuesCollapsed: savedUiState.guildTokenValuesCollapsed, upgradeRefreshId: 0, exchangeAdvisorUi: null, exchangeAdvisorFrame: null, exchangeAdvisorForceRender: false, exchangeAdvisorObserver: null, exchangeAdvisorListenersInstalled: false, exchangeAdvisorLoadInFlight: false, exchangeAdvisorSnapshotFailed: false };

  function loadSavedPluginUiState() {
    const fallback = { collapsedCreditSections: [], guildTokenValuesCollapsed: false, targetCredit: 1, upgradePlans: [] };
    try {
      const raw = pageWindow.localStorage && pageWindow.localStorage.getItem(UI_STATE_STORAGE_KEY);
      if (!raw) return fallback;
      const stored = JSON.parse(raw);
      if (!stored || typeof stored !== "object") return fallback;
      const creditHrids = new Set(CREDIT_TYPES.map(([hrid]) => hrid));
      const collapsedCreditSections = Array.isArray(stored.collapsedCreditSections)
        ? Array.from(new Set(stored.collapsedCreditSections.filter((hrid) => creditHrids.has(hrid))))
        : [];
      const upgradePlans = Array.isArray(stored.upgradePlans)
        ? stored.upgradePlans
          .filter((plan) => plan && typeof plan.guildBuffHrid === "string" && Number.isSafeInteger(plan.startLevel) && Number.isSafeInteger(plan.targetLevel))
          .map((plan) => ({ guildBuffHrid: plan.guildBuffHrid, startLevel: plan.startLevel, targetLevel: plan.targetLevel }))
        : [];
      const targetCredit = Number(stored.targetCredit);
      return {
        collapsedCreditSections,
        guildTokenValuesCollapsed: stored.guildTokenValuesCollapsed === true,
        targetCredit: Number.isSafeInteger(targetCredit) && targetCredit > 0 ? targetCredit : 1,
        upgradePlans
      };
    } catch (_) {
      return fallback;
    }
  }

  function persistPluginUiState() {
    const upgradePlans = state.upgradePlans.map((plan) => ({
      guildBuffHrid: plan.guildBuffHrid,
      startLevel: plan.startLevel,
      targetLevel: plan.targetLevel
    }));
    try {
      pageWindow.localStorage && pageWindow.localStorage.setItem(UI_STATE_STORAGE_KEY, JSON.stringify({
        collapsedCreditSections: Array.from(state.collapsedCreditSections),
        guildTokenValuesCollapsed: state.guildTokenValuesCollapsed,
        targetCredit: state.targetCredit,
        upgradePlans
      }));
    } catch (_) {
      // Keep the current page state when browser storage is unavailable.
    }
  }

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
    persistPluginUiState();
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
          <label>目标信用点<input data-role="target" type="number" min="1" step="1" value="${state.targetCredit}"></label>
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
    panel.querySelector('[data-role="target"]').addEventListener("change", (event) => {
      const target = Number(event.target.value);
      if (Number.isSafeInteger(target) && target > 0) state.targetCredit = target;
      else event.target.value = String(state.targetCredit);
      persistPluginUiState();
      refreshPanel(panel);
    });
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
        persistPluginUiState();
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
      persistPluginUiState();
    });
    panel.querySelector('[data-role="view-credit"]').addEventListener("click", () => setPanelView(panel, "credit"));
    panel.querySelector('[data-role="view-upgrade"]').addEventListener("click", () => setPanelView(panel, "upgrade"));
    panel.querySelector('[data-role="add-upgrade-plan"]').addEventListener("click", () => { addGuildUpgradePlan(guildBuffEntries()); persistPluginUiState(); refreshGuildUpgrade(panel); });
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
      persistPluginUiState();
      refreshGuildUpgrade(panel);
    });
    panel.querySelector('[data-role="upgrade-plan-list"]').addEventListener("click", (event) => {
      const button = event.target.closest('[data-role="remove-plan"]');
      const row = button && button.closest("[data-plan-id]");
      if (!row) return;
      state.upgradePlans = state.upgradePlans.filter((plan) => plan.id !== row.dataset.planId);
      persistPluginUiState();
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
