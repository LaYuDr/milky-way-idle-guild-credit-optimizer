(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MwiGuildCreditMarketDom = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const ITEM_HRID_PATTERN = /^[a-z0-9_]+$/;

  function parseCompactMarketValue(value) {
    const normalized = String(value || "")
      .replace(/,/g, "")
      .replace(/\s+/g, "")
      .trim();
    const match = normalized.match(/^([0-9]+(?:\.[0-9]+)?)([KMBT]?)$/i);
    if (!match) return null;
    const multiplier = {
      "": 1,
      K: 1_000,
      M: 1_000_000,
      B: 1_000_000_000,
      T: 1_000_000_000_000
    }[match[2].toUpperCase()];
    const result = Number(match[1]) * multiplier;
    return Number.isFinite(result) && result >= 0 ? Math.round(result) : null;
  }

  function orderBookEntries(table) {
    const entries = [];
    for (const row of Array.from(table.querySelectorAll("tbody tr"))) {
      const cells = Array.from(row.querySelectorAll("td"));
      if (cells.length < 2) continue;
      const quantity = parseCompactMarketValue(cells[0].textContent);
      const price = parseCompactMarketValue(cells[1].textContent);
      if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(price) || price <= 0) continue;
      entries.push({ price, quantity });
    }
    return entries;
  }

  function tableSide(table) {
    const actions = Array.from(table.querySelectorAll("button"))
      .map((button) => String(button.textContent || "").trim())
      .filter(Boolean);
    if (actions.some((value) => ["购买", "Buy"].includes(value))) return "asks";
    if (actions.some((value) => ["出售", "Sell"].includes(value))) return "bids";
    const heading = String((table.querySelector("thead") && table.querySelector("thead").textContent) || "");
    if (/出售价|Sell Price/i.test(heading)) return "asks";
    if (/收购价|Buy Price/i.test(heading)) return "bids";
    return "";
  }

  function currentMarketIdentity(documentRef) {
    const currentItem = documentRef.querySelector('[class*="MarketplacePanel_currentItem"]');
    if (!currentItem) return null;
    const use = currentItem.querySelector(
      '[class*="Item_itemContainer"] svg[role="img"] use[href*="items_sprite"],' +
        '[class*="Item_itemContainer"] svg[role="img"] use[xlink\\:href*="items_sprite"]'
    );
    const href = use && (use.getAttribute("href") || use.getAttribute("xlink:href"));
    const fragment = String(href || "")
      .split("#")
      .pop();
    if (!ITEM_HRID_PATTERN.test(fragment)) return null;
    const enhancementNode = currentItem.querySelector('[class*="Item_enhancementLevel"]');
    const enhancementMatch = String((enhancementNode && enhancementNode.textContent) || "").match(/\+?(\d+)/);
    const enhancementLevel = enhancementMatch ? Number(enhancementMatch[1]) : 0;
    return {
      itemHrid: `/items/${fragment}`,
      enhancementLevel: Number.isSafeInteger(enhancementLevel) && enhancementLevel >= 0 ? enhancementLevel : 0
    };
  }

  function tradableRange(documentRef) {
    if (!documentRef || typeof documentRef.querySelectorAll !== "function") return { min: null, max: null };
    for (const node of Array.from(documentRef.querySelectorAll('[class*="MarketplacePanel_"]'))) {
      const text = String(node.textContent || "").replace(/,/g, "");
      const match = text.match(
        /(?:可交易区间|Tradable\s+Range)\s*[:：]?\s*([0-9]+(?:\.[0-9]+)?[KMBT]?)\s*(?:-|–|—|~|至|到)\s*([0-9]+(?:\.[0-9]+)?[KMBT]?)/i
      );
      if (!match) continue;
      const min = parseCompactMarketValue(match[1]);
      const max = parseCompactMarketValue(match[2]);
      if (Number.isFinite(min) && min > 0 && Number.isFinite(max) && max >= min) return { min, max };
    }
    return { min: null, max: null };
  }

  function readMarketDomSnapshot(documentRef) {
    if (!documentRef || typeof documentRef.querySelector !== "function") return null;
    const identity = currentMarketIdentity(documentRef);
    const booksContainer = documentRef.querySelector('[class*="MarketplacePanel_orderBooksContainer"]');
    if (!identity || !booksContainer) return null;
    const snapshot = {
      ...identity,
      asks: null,
      bids: null,
      priceBandMin: null,
      priceBandMax: null
    };
    const range = tradableRange(documentRef);
    snapshot.priceBandMin = range.min;
    snapshot.priceBandMax = range.max;
    for (const table of Array.from(
      booksContainer.querySelectorAll('table[class*="MarketplacePanel_orderBookTable"]')
    )) {
      const side = tableSide(table);
      if (side) snapshot[side] = orderBookEntries(table);
    }
    if (!Array.isArray(snapshot.asks) && !Array.isArray(snapshot.bids)) return null;
    snapshot.signature = JSON.stringify([snapshot.itemHrid, snapshot.enhancementLevel, snapshot.asks, snapshot.bids]);
    return snapshot;
  }

  function createMarketMessage(snapshot) {
    if (!snapshot || !snapshot.itemHrid) return null;
    const book = {
      itemHrid: snapshot.itemHrid,
      enhancementLevel: snapshot.enhancementLevel
    };
    if (Array.isArray(snapshot.asks)) book.asks = snapshot.asks;
    if (Array.isArray(snapshot.bids)) book.bids = snapshot.bids;
    if (Number.isFinite(snapshot.priceBandMin) && snapshot.priceBandMin > 0) book.priceBandMin = snapshot.priceBandMin;
    if (Number.isFinite(snapshot.priceBandMax) && snapshot.priceBandMax > 0) book.priceBandMax = snapshot.priceBandMax;
    return {
      type: "market_item_order_books_updated",
      marketItemOrderBooks: book
    };
  }

  return Object.freeze({
    parseCompactMarketValue,
    tradableRange,
    readMarketDomSnapshot,
    createMarketMessage
  });
});
