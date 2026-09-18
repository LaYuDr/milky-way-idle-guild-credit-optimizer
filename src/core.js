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

  const DEFAULT_GUILD_TOKEN_BUDGET_SNAP_PERCENTAGES = [20, 40, 50, 60, 80, 100];

  function guildTokenBudgetPercentage(value, maximum) {
    const max = Math.max(0, Math.floor(Number(maximum) || 0));
    if (!max) return 0;
    const clamped = Math.min(max, Math.max(0, Math.floor(Number(value) || 0)));
    return Math.round((clamped / max) * 100);
  }

  function snapGuildTokenBudget(rawValue, maximum, options = {}) {
    const max = Math.max(0, Math.floor(Number(maximum) || 0));
    const value = Math.min(max, Math.max(0, Math.floor(Number(rawValue) || 0)));
    if (!max) return { value: 0, percentage: 0, snappedTo: null };
    const snapPercentages = (
      Array.isArray(options.snapPercentages) ? options.snapPercentages : DEFAULT_GUILD_TOKEN_BUDGET_SNAP_PERCENTAGES
    )
      .map(Number)
      .filter((percentage) => Number.isFinite(percentage) && percentage > 0 && percentage <= 100);
    const threshold = Math.max(0, Number(options.thresholdPercentage ?? 2.5) || 0);
    const rawPercentage = (value / max) * 100;
    const snappedTo = snapPercentages.reduce((nearest, percentage) => {
      if (nearest === null) return percentage;
      return Math.abs(percentage - rawPercentage) < Math.abs(nearest - rawPercentage) ? percentage : nearest;
    }, null);
    if (snappedTo === null || Math.abs(snappedTo - rawPercentage) > threshold) {
      return { value, percentage: guildTokenBudgetPercentage(value, max), snappedTo: null };
    }
    const snappedValue = Math.min(max, Math.max(0, Math.round((max * snappedTo) / 100)));
    return { value: snappedValue, percentage: guildTokenBudgetPercentage(snappedValue, max), snappedTo };
  }

  function normalizeAsks(orderBook) {
    if (!orderBook || !Array.isArray(orderBook.asks)) return [];
    return orderBook.asks
      .map((ask) => ({ price: Number(ask.price), quantity: Number(ask.quantity) }))
      .filter(
        (ask) => Number.isFinite(ask.price) && ask.price >= 0 && Number.isSafeInteger(ask.quantity) && ask.quantity > 0
      )
      .sort((left, right) => left.price - right.price);
  }

  function quoteAsks(orderBook, requestedQuantity) {
    const quantity = positiveInteger(requestedQuantity);
    if (!quantity)
      return { status: "invalid_quantity", requestedQuantity, availableQuantity: 0, cost: null, fills: [] };

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
        return (
          left.costPerCredit - right.costPerCredit ||
          left.cost - right.cost ||
          left.itemName.localeCompare(right.itemName, "zh-CN")
        );
      });
  }

  function rankGuildTokenCreditValues(exchangeRules, rankedCredits) {
    const rankings = rankedCredits && typeof rankedCredits === "object" ? rankedCredits : {};
    return (Array.isArray(exchangeRules) ? exchangeRules : []).map((rule) => {
      const guildTokenCount = positiveInteger(rule && rule.guildTokenCount);
      const creditCount = positiveInteger(rule && rule.creditCount);
      const creditItemHrid = rule && rule.creditItemHrid;
      if (!guildTokenCount || !creditCount || !creditItemHrid) {
        return { status: "invalid_rule", rule };
      }
      const best = (Array.isArray(rankings[creditItemHrid]) ? rankings[creditItemHrid] : []).find(
        (result) => result && result.status === "ok" && Number.isFinite(result.costPerCredit)
      );
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
    if (
      !itemCount ||
      !creditCount ||
      !Number.isFinite(price) ||
      price <= 0 ||
      !Number.isFinite(availableBudget) ||
      availableBudget < 0
    ) {
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
      .sort(
        (left, right) =>
          right.actualCredits - left.actualCredits ||
          left.costPerCredit - right.costPerCredit ||
          left.cost - right.cost ||
          left.itemName.localeCompare(right.itemName, "zh-CN")
      );
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
    if (
      !itemQuantity ||
      !Number.isFinite(price) ||
      price <= 0 ||
      !Number.isFinite(taxRate) ||
      taxRate < 0 ||
      taxRate >= 1
    ) {
      return { status: "invalid_sale", quantity, sellPrice, sellerTaxRate, gross: null, tax: null, net: null };
    }
    const gross = itemQuantity * price;
    const tax = Math.floor(gross * taxRate);
    return {
      status: "ok",
      quantity: itemQuantity,
      sellPrice: price,
      sellerTaxRate: taxRate,
      gross,
      tax,
      net: gross - tax
    };
  }

  function snapshotMarketPrice(snapshot, itemHrid, enhancementLevel, field) {
    const level = Number(enhancementLevel);
    if (!itemHrid || !Number.isSafeInteger(level) || level < 0 || (field !== "a" && field !== "b")) return null;
    const entry =
      snapshot && snapshot.marketData && snapshot.marketData[itemHrid] && snapshot.marketData[itemHrid][String(level)];
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

  function selectGuildShrineAutofillScope(options = {}) {
    const entries = Array.isArray(options.entries) ? options.entries : [];
    const plans = Array.isArray(options.plans) ? options.plans : [];
    const domain = options.domain === "combat" ? "combat" : options.domain === "life" ? "life" : null;
    if (!domain) return { eligibleEntries: [], preservedPlans: plans.slice() };

    const excludedSource = options.excludedGuildBuffHrids;
    const excludedGuildBuffHrids = new Set(
      excludedSource && typeof excludedSource !== "string" && typeof excludedSource[Symbol.iterator] === "function"
        ? excludedSource
        : []
    );
    const entriesByHrid = new Map(
      entries.filter((entry) => entry && typeof entry.hrid === "string").map((entry) => [entry.hrid, entry])
    );
    const entryDomain = (entry) => (entry && entry.detail && entry.detail.isCombat === true ? "combat" : "life");
    const eligibleEntries = entries.filter(
      (entry) =>
        entry &&
        typeof entry.hrid === "string" &&
        entryDomain(entry) === domain &&
        !excludedGuildBuffHrids.has(entry.hrid)
    );
    const preservedPlans = plans.filter((plan) => {
      const guildBuffHrid = plan && plan.guildBuffHrid;
      const entry = entriesByHrid.get(guildBuffHrid);
      return !entry || entryDomain(entry) !== domain || excludedGuildBuffHrids.has(guildBuffHrid);
    });
    return { eligibleEntries, preservedPlans };
  }

  function aggregateGuildBuffLevelCosts(levelCosts, startLevel, targetLevel) {
    const start = Number(startLevel);
    const target = Number(targetLevel);
    const costs = Array.isArray(levelCosts)
      ? levelCosts
      : levelCosts && typeof levelCosts === "object"
        ? levelCosts
        : null;
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
        return {
          status: "missing_cost",
          startLevel: start,
          targetLevel: target,
          maxLevel,
          missingLevel: level,
          totals: []
        };
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
      const result = aggregateGuildBuffLevelCosts(
        plan && plan.levelCosts,
        plan && plan.startLevel,
        plan && plan.targetLevel
      );
      if (result.status !== "ok")
        return { status: "invalid_plan", planIndex: index, result, plans: results, totals: [] };
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

  function aggregateGuildBuildingLevelCosts(levelCosts, startLevel, targetLevel) {
    const start = Number(startLevel);
    const target = Number(targetLevel);
    const costs = Array.isArray(levelCosts)
      ? levelCosts
      : levelCosts && typeof levelCosts === "object"
        ? levelCosts
        : null;
    if (!costs || !Number.isSafeInteger(start) || !Number.isSafeInteger(target) || start < 0 || target <= start) {
      return { status: "invalid_range", startLevel, targetLevel, totalCost: 0, steps: [] };
    }
    const maxLevel = Array.isArray(costs)
      ? costs.length - 1
      : Math.max(...Object.keys(costs).map(Number).filter(Number.isSafeInteger));
    if (!Number.isSafeInteger(maxLevel) || target > maxLevel) {
      return { status: "invalid_range", startLevel: start, targetLevel: target, maxLevel, totalCost: 0, steps: [] };
    }
    const steps = [];
    let totalCost = 0;
    for (let level = start + 1; level <= target; level += 1) {
      const record = costs[level];
      const rawCost = record && (record.guildPointCost ?? record.guildPoints ?? record.cost);
      const cost = Number(rawCost);
      if (rawCost === null || rawCost === undefined || !Number.isFinite(cost) || cost < 0) {
        return {
          status: "missing_cost",
          startLevel: start,
          targetLevel: target,
          maxLevel,
          missingLevel: level,
          totalCost: 0,
          steps: []
        };
      }
      totalCost += cost;
      steps.push({ fromLevel: level - 1, toLevel: level, cost });
    }
    return { status: "ok", startLevel: start, targetLevel: target, maxLevel, totalCost, steps };
  }

  function buildGuildConstructionPlan(plans, availableGuildPoints) {
    const inputPlans = Array.isArray(plans) ? plans : [];
    const hasBudget =
      availableGuildPoints !== null && availableGuildPoints !== undefined && availableGuildPoints !== "";
    const budgetNumber = Number(availableGuildPoints);
    if (hasBudget && (!Number.isFinite(budgetNumber) || budgetNumber < 0)) {
      return { status: "invalid_budget", plans: [], steps: [], totalCost: 0, availableGuildPoints };
    }
    const budget = hasBudget ? Math.floor(budgetNumber) : null;
    const results = [];
    const steps = [];
    let cumulativeCost = 0;
    for (let planIndex = 0; planIndex < inputPlans.length; planIndex += 1) {
      const plan = inputPlans[planIndex] || {};
      const result = aggregateGuildBuildingLevelCosts(plan.levelCosts, plan.startLevel, plan.targetLevel);
      if (result.status !== "ok") {
        return {
          status: "invalid_plan",
          planIndex,
          result,
          plans: results,
          steps: [],
          totalCost: 0,
          availableGuildPoints: budget
        };
      }
      const annotatedSteps = [];
      let affordableStepCount = 0;
      let nextStepShortfall = null;
      for (const step of result.steps) {
        cumulativeCost += step.cost;
        const fitsBudget = budget === null ? null : cumulativeCost <= budget;
        const annotatedStep = {
          ...step,
          id: plan.id,
          buildingHrid: plan.buildingHrid,
          globalIndex: steps.length,
          cumulativeCost,
          fitsBudget,
          remainingGuildPoints: budget === null ? null : budget - cumulativeCost
        };
        steps.push(annotatedStep);
        annotatedSteps.push(annotatedStep);
        if (fitsBudget !== false) affordableStepCount += 1;
        else if (nextStepShortfall === null) nextStepShortfall = cumulativeCost - budget;
      }
      const budgetState =
        budget === null
          ? "unbudgeted"
          : affordableStepCount === annotatedSteps.length
            ? "within"
            : affordableStepCount > 0
              ? "partial"
              : "outside";
      results.push({
        ...result,
        id: plan.id,
        buildingHrid: plan.buildingHrid,
        steps: annotatedSteps,
        budgetState,
        affordableStepCount,
        affordableTargetLevel: result.startLevel + affordableStepCount,
        nextStepShortfall
      });
    }
    const firstOverBudgetIndex = budget === null ? -1 : steps.findIndex((step) => !step.fitsBudget);
    return {
      status: "ok",
      plans: results,
      steps,
      totalCost: cumulativeCost,
      availableGuildPoints: budget,
      remainingGuildPoints: budget === null ? null : budget - cumulativeCost,
      overBudget: budget === null ? false : cumulativeCost > budget,
      affordableStepCount:
        budget === null ? steps.length : firstOverBudgetIndex < 0 ? steps.length : firstOverBudgetIndex,
      firstOverBudgetIndex
    };
  }

  const GUILD_POINT_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  const DEFAULT_GUILD_POINT_FORECAST_WEEKS = 6;
  const MIN_GUILD_POINT_FORECAST_WEEKS = 2;
  const MAX_GUILD_POINT_FORECAST_WEEKS = 12;

  function normalizeGuildPointForecastWeeks(value) {
    const weeks = Number(value);
    return Number.isSafeInteger(weeks) &&
      weeks >= MIN_GUILD_POINT_FORECAST_WEEKS &&
      weeks <= MAX_GUILD_POINT_FORECAST_WEEKS
      ? weeks
      : DEFAULT_GUILD_POINT_FORECAST_WEEKS;
  }

  function guildPointObservation(value) {
    const lifetimePoints = Number(value && value.lifetimePoints);
    const availablePoints = Number(value && value.availablePoints);
    const observedAt = Number(value && value.observedAt);
    const parsedWeekStart = Date.parse(value && value.weekStartAt);
    const numericWeekStart = Number(value && value.weekStartAt);
    const weekStartAt =
      Number.isSafeInteger(numericWeekStart) && numericWeekStart > 0 ? numericWeekStart : parsedWeekStart;
    if (
      !Number.isSafeInteger(lifetimePoints) ||
      lifetimePoints < 0 ||
      !Number.isSafeInteger(availablePoints) ||
      availablePoints < 0 ||
      !Number.isSafeInteger(observedAt) ||
      observedAt <= 0
    )
      return null;
    return {
      guildId: String((value && value.guildId) || ""),
      lifetimePoints,
      availablePoints,
      weekStartAt: Number.isSafeInteger(weekStartAt) && weekStartAt > 0 ? weekStartAt : null,
      observedAt
    };
  }

  function normalizeGuildPointWeeks(value) {
    const byWeek = new Map();
    for (const record of Array.isArray(value) ? value : []) {
      const weekStartAt = Number(record && record.weekStartAt);
      const earnedPoints = Number(record && record.earnedPoints);
      const observedAt = Number(record && record.observedAt);
      if (
        !Number.isSafeInteger(weekStartAt) ||
        weekStartAt <= 0 ||
        !Number.isSafeInteger(earnedPoints) ||
        earnedPoints < 0
      )
        continue;
      const previous = byWeek.get(weekStartAt);
      byWeek.set(weekStartAt, {
        weekStartAt,
        earnedPoints: previous ? previous.earnedPoints + earnedPoints : earnedPoints,
        complete: Boolean((previous && previous.complete) || (record && record.complete)),
        ...(record && ["tracked", "manual", "estimated"].includes(record.source)
          ? { source: record.source }
          : previous && previous.source
            ? { source: previous.source }
            : {}),
        observedAt:
          Number.isSafeInteger(observedAt) && observedAt > 0
            ? Math.max(previous ? previous.observedAt : 0, observedAt)
            : previous
              ? previous.observedAt
              : weekStartAt
      });
    }
    return Array.from(byWeek.values())
      .sort((left, right) => left.weekStartAt - right.weekStartAt)
      .slice(-104);
  }

  function normalizeManualGuildPointWeeks(value) {
    const byWeek = new Map();
    for (const record of Array.isArray(value) ? value : []) {
      const weekStartAt = Number(record && record.weekStartAt);
      const earnedPoints = Number(record && record.earnedPoints);
      const observedAt = Number(record && record.observedAt);
      if (
        !Number.isSafeInteger(weekStartAt) ||
        weekStartAt <= 0 ||
        !Number.isSafeInteger(earnedPoints) ||
        earnedPoints < 0
      )
        continue;
      byWeek.set(weekStartAt, {
        weekStartAt,
        earnedPoints,
        observedAt: Number.isSafeInteger(observedAt) && observedAt > 0 ? observedAt : weekStartAt
      });
    }
    return Array.from(byWeek.values())
      .sort((left, right) => left.weekStartAt - right.weekStartAt)
      .slice(-104);
  }

  function normalizedGuildPointHistory(history) {
    const source = history && typeof history === "object" ? history : {};
    return {
      guildId: String(source.guildId || ""),
      lastObservation: guildPointObservation(source.lastObservation),
      weeks: normalizeGuildPointWeeks(source.weeks),
      manualWeeks: normalizeManualGuildPointWeeks(source.manualWeeks)
    };
  }

  function recordGuildPointObservation(history, rawObservation) {
    const observation = guildPointObservation(rawObservation);
    const previousHistory = normalizedGuildPointHistory(history);
    const { weeks, manualWeeks, lastObservation } = previousHistory;
    const guildId = String(previousHistory.guildId || (lastObservation && lastObservation.guildId) || "");
    if (!observation) return { changed: false, history: { guildId, lastObservation, weeks, manualWeeks } };

    const guildChanged = Boolean(
      lastObservation &&
      lastObservation.guildId &&
      observation.guildId &&
      lastObservation.guildId !== observation.guildId
    );
    if (!lastObservation || guildChanged || observation.lifetimePoints < lastObservation.lifetimePoints) {
      return {
        changed: true,
        history: {
          guildId: observation.guildId,
          lastObservation: observation,
          weeks: guildChanged || observation.lifetimePoints < (lastObservation?.lifetimePoints ?? 0) ? [] : weeks,
          manualWeeks: guildChanged ? [] : manualWeeks
        }
      };
    }

    const weekChanged = observation.weekStartAt !== lastObservation.weekStartAt;
    if (
      observation.weekStartAt &&
      lastObservation.weekStartAt &&
      observation.weekStartAt < lastObservation.weekStartAt
    ) {
      return {
        changed: false,
        history: { guildId: observation.guildId || guildId, lastObservation, weeks, manualWeeks }
      };
    }

    const earnedPoints = observation.lifetimePoints - lastObservation.lifetimePoints;
    if (!observation.weekStartAt && !lastObservation.weekStartAt) {
      return {
        changed: false,
        history: { guildId: observation.guildId || guildId, lastObservation, weeks, manualWeeks }
      };
    }

    const officialWeekGap =
      observation.weekStartAt && lastObservation.weekStartAt
        ? observation.weekStartAt - lastObservation.weekStartAt
        : null;
    const completedWeek = officialWeekGap !== null && officialWeekGap >= GUILD_POINT_WEEK_MS * 0.5;
    const ambiguousGap = officialWeekGap !== null && officialWeekGap > GUILD_POINT_WEEK_MS * 1.5;
    if (ambiguousGap) {
      return {
        changed: true,
        skippedAmbiguousIncrease: observation.lifetimePoints - lastObservation.lifetimePoints,
        history: {
          guildId: observation.guildId || guildId,
          lastObservation: observation,
          weeks,
          manualWeeks
        }
      };
    }

    if (!weekChanged && earnedPoints === 0) {
      return {
        changed: false,
        history: { guildId: observation.guildId || guildId, lastObservation, weeks, manualWeeks }
      };
    }
    if (!completedWeek && earnedPoints === 0) {
      return {
        changed: true,
        history: { guildId: observation.guildId || guildId, lastObservation: observation, weeks, manualWeeks }
      };
    }
    const targetWeekStart =
      observation.weekStartAt && lastObservation.weekStartAt && observation.weekStartAt > lastObservation.weekStartAt
        ? lastObservation.weekStartAt
        : observation.weekStartAt || lastObservation.weekStartAt || observation.observedAt;
    const nextWeeks = normalizeGuildPointWeeks([
      ...weeks,
      { weekStartAt: targetWeekStart, earnedPoints, complete: completedWeek, observedAt: observation.observedAt }
    ]);
    return {
      changed: true,
      recordedPoints: earnedPoints,
      history: {
        guildId: observation.guildId || guildId,
        lastObservation: observation,
        weeks: nextWeeks,
        manualWeeks
      }
    };
  }

  function setManualGuildPointWeek(
    history,
    rawWeekStartAt,
    rawEarnedPoints,
    observedAt,
    firstTrialStartAt,
    options = {}
  ) {
    const normalized = normalizedGuildPointHistory(history);
    const weekStartAt = Number(rawWeekStartAt);
    const earnedPoints = Number(rawEarnedPoints);
    const observed = Number(observedAt);
    const firstTrial = Number(firstTrialStartAt);
    const pastWeekCount = Math.floor((observed - firstTrial) / GUILD_POINT_WEEK_MS);
    const ordinal = (weekStartAt - firstTrial) / GUILD_POINT_WEEK_MS;
    if (
      !Number.isSafeInteger(weekStartAt) ||
      !Number.isSafeInteger(earnedPoints) ||
      earnedPoints < 0 ||
      !Number.isSafeInteger(observed) ||
      !Number.isSafeInteger(firstTrial) ||
      !Number.isInteger(ordinal) ||
      ordinal < 0 ||
      ordinal >= pastWeekCount
    )
      return { status: "invalid", history: normalized };
    if (
      options.allowTrackedOverride !== true &&
      normalized.weeks.some((record) => record.complete && record.weekStartAt === weekStartAt)
    )
      return { status: "tracked", history: normalized };
    return {
      status: "saved",
      history: {
        ...normalized,
        manualWeeks: normalizeManualGuildPointWeeks([
          ...normalized.manualWeeks.filter((record) => record.weekStartAt !== weekStartAt),
          { weekStartAt, earnedPoints, observedAt: observed }
        ])
      }
    };
  }

  function removeManualGuildPointWeek(history, rawWeekStartAt, options = {}) {
    const normalized = normalizedGuildPointHistory(history);
    const weekStartAt = Number(rawWeekStartAt);
    const manualWeeks = normalized.manualWeeks.filter((record) => record.weekStartAt !== weekStartAt);
    // A zero remains a valid observation unless the user explicitly clears it.
    const weeks =
      options.discardZeroTracked === true
        ? normalized.weeks.filter(
            (record) => !(record.weekStartAt === weekStartAt && record.complete && record.earnedPoints === 0)
          )
        : normalized.weeks;
    return {
      changed: manualWeeks.length !== normalized.manualWeeks.length || weeks.length !== normalized.weeks.length,
      history: { ...normalized, weeks, manualWeeks }
    };
  }

  function supplementGuildPointHistory(
    history,
    lifetimePoints,
    currentWeekPoints,
    observedAt,
    firstTrialStartAt,
    options = {}
  ) {
    const normalized = normalizedGuildPointHistory(history);
    const coldStart = estimateGuildPointColdStart(lifetimePoints, currentWeekPoints, observedAt, firstTrialStartAt);
    if (coldStart.status !== "ok") return { status: coldStart.status, history: normalized, estimatedCount: 0 };
    const firstTrial = Number(firstTrialStartAt);
    const completeTracked = new Map(
      normalized.weeks.filter((record) => record.complete).map((record) => [record.weekStartAt, record])
    );
    const manual = new Map(normalized.manualWeeks.map((record) => [record.weekStartAt, record]));
    const records = [];
    const missing = [];
    let knownPoints = 0;
    for (let index = 0; index < coldStart.pastWeekCount; index += 1) {
      const weekStartAt = firstTrial + index * GUILD_POINT_WEEK_MS;
      const trackedRecord = completeTracked.get(weekStartAt);
      const manualRecord = manual.get(weekStartAt);
      const record = manualRecord
        ? { ...manualRecord, complete: true, source: "manual" }
        : trackedRecord
          ? { ...trackedRecord, source: "tracked" }
          : null;
      if (record) {
        records.push(record);
        knownPoints += record.earnedPoints;
      } else {
        missing.push({ weekStartAt, ordinal: index + 1 });
      }
    }
    const historicalTotal = Number(lifetimePoints) - Number(currentWeekPoints);
    if (knownPoints > historicalTotal) {
      return {
        status: "known_points_exceed_total",
        history: normalized,
        estimatedCount: 0,
        manualCount: records.filter((record) => record.source === "manual").length,
        trackedCount: records.filter((record) => record.source === "tracked").length,
        averageWeeklyChange: null,
        forecastPoints: null,
        growthRate: null,
        forecastSampleCount: 0
      };
    }
    const remainingPoints = historicalTotal - knownPoints;
    const estimateBase = missing.length ? Math.floor(remainingPoints / missing.length) : 0;
    const estimateRemainder = missing.length ? remainingPoints % missing.length : 0;
    const estimates = missing.map((record, index) => ({
      weekStartAt: record.weekStartAt,
      earnedPoints: estimateBase + (index >= missing.length - estimateRemainder ? 1 : 0)
    }));
    for (const record of estimates) {
      records.push({
        weekStartAt: record.weekStartAt,
        earnedPoints: record.earnedPoints,
        complete: true,
        observedAt: Number(observedAt),
        source: "estimated"
      });
    }
    records.sort((left, right) => left.weekStartAt - right.weekStartAt);
    const outsideRange = normalized.weeks.filter(
      (record) => !record.complete || record.weekStartAt < firstTrial || record.weekStartAt >= Number(observedAt)
    );
    const forecast = summarizeGuildPointHistory({ weeks: records }, { forecastWeekCount: options.forecastWeekCount });
    return {
      status: "ok",
      history: { ...normalized, weeks: [...records, ...outsideRange] },
      estimatedCount: estimates.length,
      manualCount: records.filter((record) => record.source === "manual").length,
      trackedCount: records.filter((record) => record.source === "tracked").length,
      averageWeeklyChange: forecast.averageWeeklyChange,
      forecastPoints: forecast.forecastPoints,
      growthRate: forecast.growthRate,
      forecastSampleCount: forecast.forecastSampleCount
    };
  }

  function summarizeGuildPointHistory(history, options = {}) {
    const trackedWeeks = normalizeGuildPointWeeks(history && history.weeks);
    const weeks = trackedWeeks.filter((record) => record.complete);
    const latest = weeks.at(-1) || null;
    const previous = weeks.at(-2) || null;
    const growthRate =
      previous && previous.earnedPoints > 0
        ? (latest.earnedPoints - previous.earnedPoints) / previous.earnedPoints
        : null;
    const forecastWeekCount = normalizeGuildPointForecastWeeks(options.forecastWeekCount);
    const consecutive = latest ? [latest] : [];
    for (let index = weeks.length - 2; index >= 0 && consecutive.length < forecastWeekCount; index -= 1) {
      const newer = consecutive[0];
      const candidate = weeks[index];
      const gap = newer.weekStartAt - candidate.weekStartAt;
      if (gap < GUILD_POINT_WEEK_MS * 0.5 || gap > GUILD_POINT_WEEK_MS * 1.5) break;
      consecutive.unshift(candidate);
    }
    let forecastPoints = null;
    let averageWeeklyChange = null;
    if (consecutive.length >= 2) {
      averageWeeklyChange =
        consecutive
          .slice(1)
          .reduce((total, record, index) => total + record.earnedPoints - consecutive[index].earnedPoints, 0) /
        (consecutive.length - 1);
      forecastPoints = Math.max(0, Math.round(consecutive.at(-1).earnedPoints + averageWeeklyChange));
    }
    return {
      trackedWeeks,
      weeks,
      latest,
      previous,
      growthRate,
      forecastPoints,
      averageWeeklyChange,
      forecastSampleCount: consecutive.length,
      forecastWeekCount
    };
  }

  function estimateGuildPointColdStart(lifetimePoints, currentWeekPoints, observedAt, firstTrialStartAt) {
    if (currentWeekPoints === null || currentWeekPoints === undefined)
      return { status: "unavailable", pastWeekCount: 0, forecastPoints: null };
    const lifetime = Number(lifetimePoints);
    const currentWeek = Number(currentWeekPoints);
    const observed = Number(observedAt);
    const firstTrial = Number(firstTrialStartAt);
    if (
      !Number.isSafeInteger(lifetime) ||
      lifetime < 0 ||
      !Number.isSafeInteger(currentWeek) ||
      currentWeek < 0 ||
      currentWeek > lifetime ||
      !Number.isSafeInteger(observed) ||
      observed <= 0 ||
      !Number.isSafeInteger(firstTrial) ||
      firstTrial <= 0
    ) {
      return { status: "unavailable", pastWeekCount: 0, forecastPoints: null };
    }
    if (observed < firstTrial) {
      return { status: "before_first_trial", pastWeekCount: 0, forecastPoints: null };
    }
    const pastWeekCount = Math.floor((observed - firstTrial) / GUILD_POINT_WEEK_MS);
    if (pastWeekCount < 1) {
      return { status: "insufficient_history", pastWeekCount, forecastPoints: null };
    }
    const historicalAveragePoints = (lifetime - currentWeek) / pastWeekCount;
    const latestWeekOrdinal = pastWeekCount + 1;
    const historicalMidpoint = (pastWeekCount + 1) / 2;
    const weeklyGrowthPoints = null;
    const forecastPoints = Math.max(0, Math.round(historicalAveragePoints));
    return {
      status: "ok",
      pastWeekCount,
      historicalAveragePoints,
      currentWeekPoints: currentWeek,
      historicalMidpoint,
      latestWeekOrdinal,
      weeklyGrowthPoints,
      growthRate: null,
      forecastPoints
    };
  }

  function estimateGuildConstructionWeeks(totalCost, availablePoints, weeklyForecast) {
    const cost = Number(totalCost);
    if (!Number.isSafeInteger(cost) || cost <= 0)
      return { status: "no_plan", shortfall: 0, weeks: null, weeklyForecast: null };
    const available = availablePoints === null || availablePoints === undefined ? NaN : Number(availablePoints);
    if (!Number.isSafeInteger(available) || available < 0)
      return { status: "missing_balance", shortfall: null, weeks: null, weeklyForecast: null };
    const shortfall = Math.max(0, cost - available);
    if (shortfall === 0) return { status: "covered", shortfall, weeks: 0, weeklyForecast: null };
    const forecast = weeklyForecast === null || weeklyForecast === undefined ? NaN : Number(weeklyForecast);
    if (!Number.isSafeInteger(forecast) || forecast < 0)
      return { status: "missing_forecast", shortfall, weeks: null, weeklyForecast: null };
    if (forecast === 0) return { status: "no_growth", shortfall, weeks: null, weeklyForecast: forecast };
    return {
      status: "ok",
      shortfall,
      weeks: Math.ceil(shortfall / forecast),
      weeklyForecast: forecast
    };
  }

  function calculateGuildPointPlanningBudget(basePoints, weeklyForecast, planningWeeks) {
    const base = basePoints === null || basePoints === undefined ? NaN : Number(basePoints);
    const weeks = Number(planningWeeks);
    if (!Number.isSafeInteger(base) || base < 0)
      return { status: "missing_balance", basePoints: null, weeks: 0, forecastPoints: null, budget: null };
    if (!Number.isSafeInteger(weeks) || weeks < 0 || weeks > 12)
      return { status: "invalid_weeks", basePoints: base, weeks: 0, forecastPoints: null, budget: base };
    if (weeks === 0) return { status: "ok", basePoints: base, weeks, forecastPoints: null, budget: base };
    const forecast = weeklyForecast === null || weeklyForecast === undefined ? NaN : Number(weeklyForecast);
    if (!Number.isSafeInteger(forecast) || forecast < 0)
      return { status: "missing_forecast", basePoints: base, weeks, forecastPoints: null, budget: base };
    return {
      status: "ok",
      basePoints: base,
      weeks,
      forecastPoints: forecast,
      budget: base + weeks * forecast
    };
  }

  function allocateSurplusGuildTokens(creditRows, exchangeRules, availableGuildTokens) {
    const budget = Math.max(0, Math.floor(Number(availableGuildTokens) || 0));
    const rules = new Map();
    for (const rule of Array.isArray(exchangeRules) ? exchangeRules : []) {
      const creditItemHrid = rule && rule.creditItemHrid;
      const guildTokenCount = positiveInteger(rule && rule.guildTokenCount);
      const creditCount = positiveInteger(rule && rule.creditCount);
      if (!creditItemHrid || !guildTokenCount || !creditCount || rules.has(creditItemHrid)) continue;
      rules.set(creditItemHrid, { creditItemHrid, guildTokenCount, creditCount });
    }

    const candidates = (Array.isArray(creditRows) ? creditRows : [])
      .map((row) => {
        const rule = row && rules.get(row.itemHrid);
        const missing = Math.max(0, Number(row && row.missing) || 0);
        const unitCost = Number(row && row.unitCost);
        if (!rule || missing <= 0 || !Number.isFinite(unitCost) || unitCost <= 0) return null;
        return {
          ...rule,
          missing,
          goldValuePerToken: (unitCost * rule.creditCount) / rule.guildTokenCount
        };
      })
      .filter(Boolean)
      .sort(
        (left, right) =>
          right.goldValuePerToken - left.goldValuePerToken || left.creditItemHrid.localeCompare(right.creditItemHrid)
      );

    let remainingGuildTokens = budget;
    const allocations = [];
    for (const candidate of candidates) {
      const affordableBatches = Math.floor(remainingGuildTokens / candidate.guildTokenCount);
      const requiredBatches = Math.ceil(candidate.missing / candidate.creditCount);
      const batches = Math.min(affordableBatches, requiredBatches);
      if (batches <= 0) continue;
      const spentGuildTokens = batches * candidate.guildTokenCount;
      const actualCredits = batches * candidate.creditCount;
      allocations.push({
        ...candidate,
        batches,
        actualCredits,
        coveredCredits: Math.min(candidate.missing, actualCredits),
        spentGuildTokens
      });
      remainingGuildTokens -= spentGuildTokens;
    }

    return {
      availableGuildTokens: budget,
      spentGuildTokens: budget - remainingGuildTokens,
      remainingGuildTokens,
      allocations
    };
  }

  function estimateGuildUpgradeCosts(totals, creditUnitCosts, inventoryCounts, options) {
    const unitCosts = creditUnitCosts && typeof creditUnitCosts === "object" ? creditUnitCosts : {};
    const inventory = inventoryCounts && typeof inventoryCounts === "object" ? inventoryCounts : {};
    const settings = options && typeof options === "object" ? options : {};
    const autoAllocateSurplusGuildTokens = settings.autoAllocateSurplusGuildTokens === true;
    const useGuildTokensForAllMissingCredits = settings.useGuildTokensForMissingCredits === true;
    const guildTokenCreditHrids = new Set(
      Array.isArray(settings.guildTokenCreditHrids)
        ? settings.guildTokenCreditHrids.filter((itemHrid) => typeof itemHrid === "string" && itemHrid)
        : []
    );
    const useGuildTokensForMissingCredits = useGuildTokensForAllMissingCredits || guildTokenCreditHrids.size > 0;
    const guildTokenCreditRules = new Map();
    for (const rule of Array.isArray(settings.guildTokenCreditConversions)
      ? settings.guildTokenCreditConversions
      : []) {
      const creditItemHrid = rule && rule.creditItemHrid;
      const guildTokenCount = positiveInteger(rule && rule.guildTokenCount);
      const creditCount = positiveInteger(rule && rule.creditCount);
      if (!creditItemHrid || !guildTokenCount || !creditCount || guildTokenCreditRules.has(creditItemHrid)) continue;
      guildTokenCreditRules.set(creditItemHrid, { creditItemHrid, guildTokenCount, creditCount });
    }
    const rows = [];
    const unpricedItemHrids = [];
    let totalGold = 0;
    let missingGold = 0;
    let guildTokensRequired = 0;
    const guildTokensOwned = Math.max(0, Number(inventory["/items/guild_token"]) || 0);
    let guildTokenCreditExchangeRequired = 0;
    let guildTokenRow = null;

    for (const item of Array.isArray(totals) ? totals : []) {
      const itemHrid = item && item.itemHrid;
      const required = Number(item && item.count);
      if (!itemHrid || !Number.isFinite(required) || required <= 0) continue;
      const owned = Math.max(0, Number(inventory[itemHrid]) || 0);
      const missing = Math.max(0, required - owned);
      if (itemHrid === "/items/guild_token") {
        guildTokensRequired += required;
        guildTokenRow = { itemHrid, required, owned, missing, unitCost: null, totalCost: null, missingCost: null };
        rows.push(guildTokenRow);
        continue;
      }
      const guildTokenRule =
        (useGuildTokensForAllMissingCredits || guildTokenCreditHrids.has(itemHrid)) &&
        guildTokenCreditRules.get(itemHrid);
      if (guildTokenRule) {
        const batches = missing > 0 ? Math.ceil(missing / guildTokenRule.creditCount) : 0;
        const requiredGuildTokens = batches * guildTokenRule.guildTokenCount;
        guildTokenCreditExchangeRequired += requiredGuildTokens;
        rows.push({
          itemHrid,
          required,
          owned,
          missing,
          unitCost: null,
          totalCost: null,
          missingCost: null,
          guildTokenExchange: {
            ...guildTokenRule,
            batches,
            actualCredits: batches * guildTokenRule.creditCount,
            requiredGuildTokens
          }
        });
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

    const manualGuildTokenCreditExchangeRequired = guildTokenCreditExchangeRequired;
    const reservedGuildTokens = guildTokensRequired + manualGuildTokenCreditExchangeRequired;
    const availableSurplusGuildTokens = autoAllocateSurplusGuildTokens
      ? Math.max(0, Math.floor(guildTokensOwned - reservedGuildTokens))
      : 0;
    const requestedAutoGuildTokenBudget = Number(settings.autoGuildTokenBudget);
    const hasConfiguredAutoGuildTokenBudget =
      settings.autoGuildTokenBudget !== null &&
      settings.autoGuildTokenBudget !== undefined &&
      Number.isFinite(requestedAutoGuildTokenBudget) &&
      requestedAutoGuildTokenBudget >= 0;
    const autoGuildTokenBudget = hasConfiguredAutoGuildTokenBudget
      ? Math.min(availableSurplusGuildTokens, Math.floor(requestedAutoGuildTokenBudget))
      : availableSurplusGuildTokens;
    const autoGuildTokenPlan = allocateSurplusGuildTokens(
      rows,
      Array.from(guildTokenCreditRules.values()),
      autoGuildTokenBudget
    );
    const autoAllocationsByCredit = new Map(
      autoGuildTokenPlan.allocations.map((allocation) => [allocation.creditItemHrid, allocation])
    );
    if (autoAllocateSurplusGuildTokens) {
      for (const row of rows) {
        if (!guildTokenCreditRules.has(row.itemHrid) || row.guildTokenExchange) continue;
        const allocation = autoAllocationsByCredit.get(row.itemHrid);
        row.remainingMissing = row.missing;
        if (!allocation) continue;
        row.autoGuildTokenExchange = allocation;
        row.remainingMissing = Math.max(0, row.missing - allocation.coveredCredits);
        if (row.unitCost !== null) {
          const coveredGold = allocation.coveredCredits * row.unitCost;
          totalGold = Math.max(0, totalGold - coveredGold);
          missingGold = Math.max(0, missingGold - coveredGold);
          row.totalCost = Math.max(0, row.totalCost - coveredGold);
          row.missingCost = row.remainingMissing * row.unitCost;
        }
      }
    }
    const autoGuildTokenCreditExchangeUsed = autoGuildTokenPlan.spentGuildTokens;
    guildTokenCreditExchangeRequired += autoGuildTokenCreditExchangeUsed;
    guildTokensRequired += guildTokenCreditExchangeRequired;
    const guildTokensMissing = Math.max(0, guildTokensRequired - guildTokensOwned);
    if (guildTokensRequired > 0) {
      if (!guildTokenRow) {
        guildTokenRow = {
          itemHrid: "/items/guild_token",
          required: guildTokensRequired,
          owned: guildTokensOwned,
          missing: guildTokensMissing,
          unitCost: null,
          totalCost: null,
          missingCost: null
        };
        rows.push(guildTokenRow);
      } else {
        guildTokenRow.required = guildTokensRequired;
        guildTokenRow.missing = guildTokensMissing;
      }
      guildTokenRow.shrineRequired = guildTokensRequired - guildTokenCreditExchangeRequired;
      guildTokenRow.creditExchangeRequired = guildTokenCreditExchangeRequired;
      if (autoAllocateSurplusGuildTokens) {
        guildTokenRow.manualCreditExchangeRequired = manualGuildTokenCreditExchangeRequired;
        guildTokenRow.autoCreditExchangeUsed = autoGuildTokenCreditExchangeUsed;
      }
    }

    return {
      status: unpricedItemHrids.length ? "partial" : "ok",
      totalGold,
      missingGold,
      guildTokensRequired,
      guildTokensOwned,
      guildTokensMissing,
      guildTokenCreditExchangeRequired,
      manualGuildTokenCreditExchangeRequired,
      autoGuildTokenCreditExchangeUsed,
      autoGuildTokenBudgetAvailable: availableSurplusGuildTokens,
      autoGuildTokenBudget,
      autoGuildTokenAllocations: autoGuildTokenPlan.allocations,
      useGuildTokensForMissingCredits: useGuildTokensForMissingCredits || autoGuildTokenCreditExchangeUsed > 0,
      guildTokenCreditHrids: Array.from(guildTokenCreditHrids),
      unpricedItemHrids,
      rows
    };
  }

  function conversionsFromItemDetails(itemDetails, creditItemHrid) {
    const details = Array.isArray(itemDetails)
      ? itemDetails.map((detail) => [detail && (detail.itemHrid || detail.hrid), detail])
      : Object.entries(itemDetails || {});
    return details.flatMap(([itemKey, detail]) =>
      (detail && Array.isArray(detail.guildCreditConversions) ? detail.guildCreditConversions : [])
        .filter((conversion) => conversion.creditItemHrid === creditItemHrid)
        .map((conversion) => ({
          itemHrid: detail.itemHrid || detail.hrid || itemKey,
          itemName: detail.name || detail.itemHrid || detail.hrid || itemKey,
          creditItemHrid: conversion.creditItemHrid,
          itemCount: conversion.itemCount,
          creditCount: conversion.creditCount
        }))
        .filter(
          (conversion) =>
            conversion.itemHrid && positiveInteger(conversion.itemCount) && positiveInteger(conversion.creditCount)
        )
    );
  }

  function isUnitPriceWithinLimit(unitPrice, maxUnitPrice) {
    const limit = Number(maxUnitPrice);
    if (!Number.isSafeInteger(limit) || limit <= 0) return true;
    const price = Number(unitPrice);
    return !Number.isFinite(price) || price <= 0 || price <= limit;
  }

  return {
    normalizeAsks,
    quoteAsks,
    evaluateConversion,
    rankConversions,
    rankGuildTokenCreditValues,
    evaluateBudgetConversion,
    bestConversionForBudget,
    calculateSaleProceeds,
    estimateSaleReplacement,
    snapshotMarketPrice,
    formatCompactCost,
    compareVersions,
    selectGuildShrineAutofillScope,
    aggregateGuildBuffLevelCosts,
    aggregateGuildBuffPlans,
    aggregateGuildBuildingLevelCosts,
    buildGuildConstructionPlan,
    normalizeGuildPointForecastWeeks,
    recordGuildPointObservation,
    setManualGuildPointWeek,
    removeManualGuildPointWeek,
    supplementGuildPointHistory,
    summarizeGuildPointHistory,
    estimateGuildPointColdStart,
    estimateGuildConstructionWeeks,
    calculateGuildPointPlanningBudget,
    allocateSurplusGuildTokens,
    estimateGuildUpgradeCosts,
    conversionsFromItemDetails,
    isUnitPriceWithinLimit,
    guildTokenBudgetPercentage,
    snapGuildTokenBudget
  };
});
