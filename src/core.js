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
