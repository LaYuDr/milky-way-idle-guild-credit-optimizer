(function () {
  "use strict";

  const core = window.MwiGuildCreditCore;
  const localization = window.MwiGuildCreditLocalization;
  if (!core || !localization) return;
  const pageWindow = typeof unsafeWindow === "undefined" ? window : unsafeWindow;
  const PLUGIN_VERSION = String(window.MwiGuildCreditVersion || "0.0.0");
  const UPDATE_SCRIPT_URL = "https://raw.githubusercontent.com/LaYuDr/milky-way-idle-guild-credit-optimizer/main/dist/milky-way-idle-guild-credit-optimizer.user.js";

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
  const state = { itemDetails: null, guildBuffDetails: null, guildBuffLevels: null, characterItems: null, pageItemNames: Object.create(null), upgradePlans: [], nextUpgradePlanId: 1, snapshot: null, panel: null, creditTab: null, hiddenSidebarNodes: [], refreshTimer: null, refreshInFlight: false, refreshQueued: false, panelSearchTimer: null, collapsedCreditSections: new Set(), guildTokenValuesCollapsed: false, upgradeRefreshId: 0, exchangeAdvisor: null, exchangeAdvisorTimer: null, exchangeAdvisorSuppressedModal: null, exchangeAdvisorLoadInFlight: false, exchangeAdvisorSnapshotFailed: false };

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

  function createPanel() {
    const panel = document.createElement("section");
    panel.id = "mwi-credit-optimizer";
    panel.innerHTML = `
      <style>
        #mwi-credit-optimizer{position:relative;z-index:20;flex:1;min-height:0;height:100%;overflow-y:auto;overflow-x:hidden;margin:0;padding:12px;background:#202139;color:#f4f5ff;font:14px system-ui,sans-serif}
        #mwi-credit-optimizer[hidden]{display:none} [data-mwi-credit-tab="true"]{user-select:none;pointer-events:auto!important;cursor:pointer!important}
        #mwi-credit-optimizer *{box-sizing:border-box} #mwi-credit-optimizer h3{margin:0 0 5px;font-size:17px}#mwi-credit-optimizer .mwi-plugin-version{margin:0 0 10px;padding:5px 7px;border:1px solid #474969;border-radius:4px;background:#292a46;color:#c9cbeb;font-size:11px;line-height:1.4}.mwi-plugin-version.mwi-update-available{border-color:#d8a33c;background:#463a21;color:#ffe09a;font-weight:700}
        #mwi-credit-optimizer .mwi-view-tabs{display:flex;border-bottom:1px solid #474969;margin:0 0 10px}.mwi-view-tab{min-height:30px!important;border-radius:0!important;background:transparent!important;color:#c9cbeb!important;padding:5px 10px!important}.mwi-view-tab-active{border-bottom:2px solid #43c4ad!important;color:#fff!important}
        #mwi-credit-optimizer .mwi-controls{display:flex;gap:8px;align-items:end;flex-wrap:wrap} #mwi-credit-optimizer label{display:grid;gap:4px;color:#d8d8e8}
        #mwi-credit-optimizer input,#mwi-credit-optimizer select{width:112px;min-height:32px;border:1px solid #7778b4;border-radius:4px;padding:4px 8px;background:#f1f2ff;color:#1f2030;font:inherit}
        #mwi-credit-optimizer button{min-height:32px;border:0;border-radius:4px;padding:5px 12px;background:#43c4ad;color:#10201f;font-weight:700;cursor:pointer}
        #mwi-credit-optimizer button:disabled{opacity:.55;cursor:wait} #mwi-credit-optimizer .mwi-status{margin:10px 0;color:#c9cbeb}
        #mwi-credit-optimizer .mwi-credit-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:10px}
        #mwi-credit-optimizer .mwi-credit-section{min-width:0;border:1px solid #474969;border-top:3px solid var(--mwi-credit-color);border-radius:6px;background:#292a46;overflow:hidden}
        #mwi-credit-optimizer .mwi-credit-heading{display:flex;align-items:center;gap:7px;width:100%;min-height:0!important;border:0;border-radius:0;background:transparent!important;color:#fff!important;padding:8px 9px 6px!important;font:inherit;text-align:left;font-size:13px;font-weight:700;cursor:pointer}.mwi-credit-heading:hover{background:#303151!important}.mwi-credit-heading .mwi-collapse-icon{margin-left:auto;color:#c9cbeb;font-size:15px;line-height:1}
        #mwi-credit-optimizer .mwi-credit-heading .mwi-item-icon{width:22px;height:22px;flex:0 0 22px}.mwi-credit-section table{width:100%;border-collapse:collapse;font-size:11px}
        #mwi-credit-optimizer th,#mwi-credit-optimizer td{padding:5px 6px;border-top:1px solid #474969;text-align:right;white-space:nowrap}
        #mwi-credit-optimizer th:first-child,#mwi-credit-optimizer td:first-child{text-align:left} #mwi-credit-optimizer th{color:#bfc2de;font-weight:600}
        #mwi-credit-optimizer .mwi-item{display:flex;align-items:center;gap:5px;min-width:0}.mwi-item-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        #mwi-credit-optimizer .mwi-item-icon{display:inline-block;width:24px;height:24px;flex:0 0 24px;vertical-align:middle}.mwi-item-icon-fallback{border-radius:4px;background:#45476b}
        #mwi-credit-optimizer .mwi-cost{color:#77f3d0;font-weight:700} #mwi-credit-optimizer .mwi-empty{padding:8px;color:#ffd17c;font-size:12px}#mwi-credit-optimizer .mwi-token-value-section{margin:10px 0;border:1px solid #3a7b70;border-top:3px solid #43c4ad;border-radius:6px;background:#203b3a;overflow:hidden}#mwi-credit-optimizer .mwi-token-value-heading{border-bottom:1px solid #3a7b70}#mwi-credit-optimizer .mwi-token-value-heading .mwi-item-icon{width:22px;height:22px;flex:0 0 22px}#mwi-credit-optimizer .mwi-token-value-section table{width:100%;border-collapse:collapse;font-size:12px}#mwi-credit-optimizer .mwi-token-value-section th,#mwi-credit-optimizer .mwi-token-value-section td{padding:7px 8px;border-top:1px solid #315d58;text-align:right;white-space:nowrap}#mwi-credit-optimizer .mwi-token-value-section th:first-child,#mwi-credit-optimizer .mwi-token-value-section td:first-child{text-align:left}#mwi-credit-optimizer .mwi-token-value-section th:nth-child(2),#mwi-credit-optimizer .mwi-token-value-section td:nth-child(2){text-align:center}#mwi-credit-optimizer .mwi-token-value-section .mwi-item-icon{width:21px;height:21px;flex:0 0 21px}#mwi-credit-optimizer .mwi-token-value-section .mwi-cost{font-size:13px}#mwi-credit-optimizer .mwi-token-value-unpriced{color:#ffd17c;font-size:11px}
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
      const tokenToggle = event.target.closest('[data-role="toggle-token-values"]');
      if (tokenToggle) {
        state.guildTokenValuesCollapsed = !state.guildTokenValuesCollapsed;
        const section = tokenToggle.closest(".mwi-token-value-section");
        if (!section) return;
        section.dataset.collapsed = String(state.guildTokenValuesCollapsed);
        tokenToggle.setAttribute("aria-expanded", String(!state.guildTokenValuesCollapsed));
        const icon = tokenToggle.querySelector(".mwi-collapse-icon");
        if (icon) icon.textContent = state.guildTokenValuesCollapsed ? "▸" : "▾";
        const body = section.querySelector(".mwi-token-value-body");
        if (body) body.hidden = state.guildTokenValuesCollapsed;
        return;
      }
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
        return `<tr><td><span class="mwi-item">${iconMarkup(value.creditItemHrid, `${meta.label}公会信用点`)}<span class="mwi-item-name">${meta.label}信用点</span></span></td><td>${exchange}</td><td class="mwi-token-value-unpriced">暂无市场估算</td></tr>`;
      }
      return `<tr><td><span class="mwi-item">${iconMarkup(value.creditItemHrid, `${meta.label}公会信用点`)}<span class="mwi-item-name">${meta.label}信用点</span></span></td><td>${exchange}</td><td class="mwi-cost">${core.formatCompactCost(value.goldValuePerToken)} 金币</td></tr>`;
    }).join("");
    const collapsed = state.guildTokenValuesCollapsed;
    const heading = `<button class="mwi-credit-heading mwi-token-value-heading" data-role="toggle-token-values" type="button" aria-expanded="${String(!collapsed)}">${iconMarkup("/items/guild_token", "公会代币")}<span>公会代币兑换价值</span><span class="mwi-collapse-icon" aria-hidden="true">${collapsed ? "▸" : "▾"}</span></button>`;
    return `<section class="mwi-token-value-section" data-collapsed="${String(collapsed)}">${heading}<div class="mwi-token-value-body"${collapsed ? " hidden" : ""}><table><thead><tr><th>信用点</th><th>兑换</th><th>金币价值</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
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
      #mwi-guild-exchange-advisor[hidden]{display:none}#mwi-guild-exchange-advisor .mwi-advisor-head{display:flex;align-items:center;justify-content:space-between;padding:9px 11px 8px;border-bottom:1px solid #414361;background:#282a49;color:#dfe1f7;font-weight:700}#mwi-guild-exchange-advisor .mwi-advisor-tax{color:#bfc2de;font-size:11px;font-weight:500}#mwi-guild-exchange-advisor .mwi-advisor-body{padding:10px 11px 9px}#mwi-guild-exchange-advisor .mwi-advisor-result{display:flex;align-items:baseline;gap:5px;margin:0 0 9px;padding:7px 8px;border-radius:4px;background:#173c38;color:#d9fff4}#mwi-guild-exchange-advisor .mwi-advisor-result[data-state="neutral"]{background:#303149;color:#e7e8f6}#mwi-guild-exchange-advisor .mwi-advisor-result-label{font-size:12px}#mwi-guild-exchange-advisor .mwi-advisor-result strong{color:#77f3d0;font-size:21px;line-height:1}#mwi-guild-exchange-advisor .mwi-advisor-result[data-state="neutral"] strong{color:#e7e8f6}#mwi-guild-exchange-advisor .mwi-advisor-metrics{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:7px}#mwi-guild-exchange-advisor .mwi-advisor-metric{min-width:0;padding:6px 7px;border:1px solid #414361;border-radius:4px;background:#252640}#mwi-guild-exchange-advisor .mwi-advisor-metric-wide{grid-column:1/-1}#mwi-guild-exchange-advisor .mwi-advisor-metric span{display:block;margin-bottom:2px;color:#bfc2de;font-size:11px}#mwi-guild-exchange-advisor .mwi-advisor-metric b{display:flex;align-items:center;gap:5px;overflow:hidden;color:#fff;font-size:13px;text-overflow:ellipsis;white-space:nowrap}#mwi-guild-exchange-advisor .mwi-advisor-metric .mwi-item-icon{width:24px;height:24px;flex:0 0 24px}#mwi-guild-exchange-advisor .mwi-advisor-metric em{margin-left:4px;color:#77f3d0;font-style:normal}
    </style><div class="mwi-advisor-head"><span>兑换替代估算</span><span class="mwi-advisor-tax">卖出税 2%</span></div><div class="mwi-advisor-body"><div class="mwi-advisor-result" data-role="result"><span class="mwi-advisor-result-label" data-role="result-label"></span><strong data-role="difference"></strong><span data-role="credit-label"></span></div><div class="mwi-advisor-metrics"><div class="mwi-advisor-metric"><span>出售</span><b data-role="sale-item"></b></div><div class="mwi-advisor-metric"><span>税后所得</span><b data-role="net-sale"></b></div><div class="mwi-advisor-metric mwi-advisor-metric-wide"><span>建议改买</span><b data-role="best-item"></b></div></div></div>`;
    document.body.append(advisor);
    state.exchangeAdvisor = advisor;
    return advisor;
  }

  function hideGuildExchangeAdvisor() {
    if (state.exchangeAdvisor) state.exchangeAdvisor.hidden = true;
  }

  function suppressGuildExchangeAdvisor(modal) {
    state.exchangeAdvisorSuppressedModal = modal;
    hideGuildExchangeAdvisor();
  }

  function isGuildExchangeCloseGesture(event, modal) {
    const target = event.target;
    // Tampermonkey and the game can expose DOM objects from different realms,
    // making instanceof Element unreliable for clicks on the game's close icon.
    if (!target || target.nodeType !== 1 || !modal.contains(target)) return false;
    const modalRect = modal.getBoundingClientRect();
    const closeAreaWidth = Math.min(96, modalRect.width * 0.25);
    const closeAreaHeight = Math.min(96, modalRect.height * 0.2);
    return event.clientX >= modalRect.right - closeAreaWidth && event.clientY <= modalRect.top + closeAreaHeight;
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
    const bestItem = advisor.querySelector('[data-role="best-item"]');
    bestItem.replaceChildren();
    bestItem.insertAdjacentHTML("beforeend", iconMarkup(data.bestItemHrid, data.bestItem));
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
      state.exchangeAdvisorSuppressedModal = null;
      hideGuildExchangeAdvisor();
      return;
    }

    if (state.exchangeAdvisorSuppressedModal === modalData.element) {
      hideGuildExchangeAdvisor();
      return;
    }
    state.exchangeAdvisorSuppressedModal = null;

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
      bestItemHrid: best.itemHrid,
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
  document.addEventListener("pointerdown", (event) => {
    const modalData = findGuildExchangeModal();
    if (modalData && isGuildExchangeCloseGesture(event, modalData.element)) {
      suppressGuildExchangeAdvisor(modalData.element);
    }
  }, true);
  document.addEventListener("click", activateCreditTabFromPointer, true);
  document.addEventListener("input", (event) => {
    if (event.target.closest('[class*="GuildPanel_exchangeModalContent"]')) scheduleGuildExchangeAdvisor();
  }, true);
  window.addEventListener("resize", scheduleGuildExchangeAdvisor);
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const modalData = findGuildExchangeModal();
    if (modalData) suppressGuildExchangeAdvisor(modalData.element);
  }, true);
  state.panelSearchTimer = window.setInterval(ensureSidebarIntegration, 3000);
  window.setInterval(refreshGuildExchangeAdvisor, 800);
  window.setTimeout(ensureSidebarIntegration, 1000);
  window.setTimeout(refreshGuildExchangeAdvisor, 1000);
})();
