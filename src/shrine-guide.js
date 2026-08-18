(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MwiGuildCreditShrineGuide = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function positiveInteger(value) {
    const number = Number(value);
    return Number.isSafeInteger(number) && number > 0 ? number : null;
  }

  function nonNegativeInteger(value) {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    return Number.isSafeInteger(number) && number >= 0 ? number : null;
  }

  function nonNegativeNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : 0;
  }

  function normalizePlan(plan) {
    if (!plan || typeof plan.guildBuffHrid !== "string" || typeof plan.shrineHrid !== "string") return null;
    const targetLevel = positiveInteger(plan.targetLevel);
    const currentLevel = Math.max(0, Math.floor(Number(plan.currentLevel) || 0));
    if (!targetLevel) return null;
    return {
      guildBuffHrid: plan.guildBuffHrid,
      shrineHrid: plan.shrineHrid,
      domain: plan.domain === "combat" ? "combat" : "life",
      label: String(plan.label || plan.guildBuffHrid),
      currentLevel,
      targetLevel,
      complete: currentLevel >= targetLevel
    };
  }

  function inventoryCountForItem(characterItems, itemHrid) {
    if (!Array.isArray(characterItems) || !itemHrid) return null;
    let total = 0;
    for (const item of characterItems) {
      if (!item || item.itemHrid !== itemHrid || item.itemLocationHrid !== "/item_locations/inventory") continue;
      const count = nonNegativeInteger(item.count);
      if (count !== null) total += count;
    }
    return total;
  }

  function normalizeCreditStep(row, materialPlan) {
    if (!row || !row.itemHrid) return null;
    const remainingMissing = Math.ceil(nonNegativeNumber(row && (row.remainingMissing ?? row.missing)));
    const automaticExchange = row.guildTokenExchange ? null : row.autoGuildTokenExchange;
    const hasAutomaticExchange = Boolean(
      automaticExchange &&
      positiveInteger(automaticExchange.batches) &&
      positiveInteger(automaticExchange.spentGuildTokens) &&
      positiveInteger(automaticExchange.actualCredits)
    );
    if (remainingMissing <= 0 && !hasAutomaticExchange) return null;
    if (row.guildTokenExchange || hasAutomaticExchange) {
      const exchange = row.guildTokenExchange || automaticExchange;
      return {
        creditItemHrid: row.itemHrid,
        remainingMissing: hasAutomaticExchange ? Math.ceil(nonNegativeNumber(row.missing)) : remainingMissing,
        method: "guild_token",
        recommendedItemHrid: "/items/guild_token",
        batches: positiveInteger(exchange.batches) || 0,
        requiredItems: positiveInteger(exchange.requiredGuildTokens) || positiveInteger(exchange.spentGuildTokens) || 0,
        actualCredits: positiveInteger(exchange.actualCredits) || 0,
        itemCount: positiveInteger(exchange.guildTokenCount) || 0,
        creditCount: positiveInteger(exchange.creditCount) || 0
      };
    }
    if (!materialPlan) {
      return {
        creditItemHrid: row.itemHrid,
        remainingMissing,
        method: "unavailable",
        recommendedItemHrid: null,
        batches: 0,
        requiredItems: 0,
        actualCredits: 0,
        itemCount: 0,
        creditCount: 0
      };
    }
    const itemCount = positiveInteger(materialPlan.itemCount) || 0;
    const creditCount = positiveInteger(materialPlan.creditCount) || 0;
    const batches =
      positiveInteger(materialPlan.batches) || (creditCount ? Math.ceil(remainingMissing / creditCount) : 0);
    return {
      creditItemHrid: row.itemHrid,
      remainingMissing,
      method: "market_item",
      recommendedItemHrid: materialPlan.itemHrid || null,
      batches,
      requiredItems: positiveInteger(materialPlan.requiredItems) || batches * itemCount,
      actualCredits: positiveInteger(materialPlan.actualCredits) || batches * creditCount,
      itemCount,
      creditCount
    };
  }

  function deriveShrineGuide(options) {
    const settings = options && typeof options === "object" ? options : {};
    const plans = (Array.isArray(settings.plans) ? settings.plans : []).map(normalizePlan).filter(Boolean);
    const base = {
      enabled: settings.enabled === true,
      status: "inactive",
      plans,
      targetPlans: plans.filter((plan) => !plan.complete),
      missingCredits: [],
      blockers: [],
      activeCredit: null
    };
    if (!base.enabled) return base;
    if (!plans.length) return { ...base, status: "no_plans" };
    if (!base.targetPlans.length) return { ...base, status: "complete" };
    if (!settings.estimate || !Array.isArray(settings.estimate.rows)) return { ...base, status: "loading" };

    const creditOrder = Array.isArray(settings.creditOrder) ? settings.creditOrder : [];
    const creditIndex = new Map(creditOrder.map((itemHrid, index) => [itemHrid, index]));
    const creditSet = new Set(creditOrder);
    const materialPlans =
      settings.creditMaterialPlans && typeof settings.creditMaterialPlans === "object"
        ? settings.creditMaterialPlans
        : {};
    const missingCredits = settings.estimate.rows
      .filter((row) => creditSet.has(row && row.itemHrid))
      .map((row) => normalizeCreditStep(row, materialPlans[row.itemHrid]))
      .filter(Boolean)
      .sort(
        (left, right) =>
          (creditIndex.get(left.creditItemHrid) ?? Number.MAX_SAFE_INTEGER) -
          (creditIndex.get(right.creditItemHrid) ?? Number.MAX_SAFE_INTEGER)
      );
    const blockers = settings.estimate.rows
      .filter(
        (row) => row && !creditSet.has(row.itemHrid) && nonNegativeNumber(row.remainingMissing ?? row.missing) > 0
      )
      .map((row) => ({
        itemHrid: row.itemHrid,
        missing: Math.ceil(nonNegativeNumber(row.remainingMissing ?? row.missing))
      }));
    const modal = settings.modal && typeof settings.modal === "object" ? settings.modal : null;
    const matchedCredit =
      (modal && missingCredits.find((step) => step.creditItemHrid === modal.creditItemHrid)) || null;
    const legacyModalMaxBatches = nonNegativeInteger(modal && modal.maxBatches);
    const modalMaxTargetQuantity = nonNegativeInteger(modal && modal.maxTargetQuantity);
    const inputMaxBatches =
      matchedCredit && modalMaxTargetQuantity !== null && matchedCredit.creditCount > 0
        ? Math.floor(modalMaxTargetQuantity / matchedCredit.creditCount)
        : null;
    const ownedItems = matchedCredit
      ? inventoryCountForItem(settings.characterItems, matchedCredit.recommendedItemHrid)
      : null;
    const inventoryMaxBatches =
      matchedCredit && ownedItems !== null && matchedCredit.itemCount > 0
        ? Math.floor(ownedItems / matchedCredit.itemCount)
        : null;
    const availableBatchLimits = [legacyModalMaxBatches, inputMaxBatches, inventoryMaxBatches].filter(
      (value) => value !== null
    );
    const modalMaxBatches = availableBatchLimits.length ? Math.min(...availableBatchLimits) : null;
    const suggestedBatches = matchedCredit
      ? Math.min(matchedCredit.batches, modalMaxBatches === null ? matchedCredit.batches : modalMaxBatches)
      : 0;
    const activeCredit = matchedCredit
      ? {
          ...matchedCredit,
          maxBatches: modalMaxBatches,
          suggestedBatches,
          suggestedItems: suggestedBatches * matchedCredit.itemCount,
          suggestedCredits: suggestedBatches * matchedCredit.creditCount
        }
      : null;
    const result = { ...base, missingCredits, blockers, activeCredit };

    if (activeCredit) {
      if (activeCredit.method === "unavailable") return { ...result, status: "unavailable" };
      if (modal.selectedItemHrid === activeCredit.recommendedItemHrid) return { ...result, status: "set_quantity" };
      if (activeCredit.method === "guild_token") return { ...result, status: "use_guild_token" };
      return { ...result, status: "choose_item" };
    }
    if (missingCredits.length) return { ...result, status: "choose_credit" };
    if (blockers.length) return { ...result, status: "blocked" };
    return { ...result, status: "upgrade_shrine" };
  }

  return { deriveShrineGuide, inventoryCountForItem };
});
