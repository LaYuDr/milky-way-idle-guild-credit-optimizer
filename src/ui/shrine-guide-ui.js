(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MwiGuildCreditShrineGuideUi = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function shrineGuideAutofillQuantity(step) {
    const quantity = Number(step && step.suggestedCredits);
    return Number.isSafeInteger(quantity) && quantity >= 0 ? quantity : null;
  }

  function setNativeInputValue(input, value) {
    if (!input) return false;
    const nextValue = String(value);
    if (String(input.value) === nextValue) return false;
    const view = (input.ownerDocument && input.ownerDocument.defaultView) || globalThis;
    const prototype = view.HTMLInputElement && view.HTMLInputElement.prototype;
    const descriptor = prototype && Object.getOwnPropertyDescriptor(prototype, "value");
    if (descriptor && descriptor.set) descriptor.set.call(input, nextValue);
    else input.value = nextValue;
    const EventConstructor = view.Event || Event;
    input.dispatchEvent(new EventConstructor("input", { bubbles: true }));
    input.dispatchEvent(new EventConstructor("change", { bubbles: true }));
    return true;
  }

  function createShrineGuideUi(dependencies) {
    const {
      state,
      document,
      window,
      stylesApi,
      t,
      ui,
      formatNumber,
      itemNameForMaterial,
      CREDIT_TYPES,
      shrineGuideApi,
      refreshGuildUpgrade,
      persistPluginUiState,
      scheduleGuildExchangeAdvisor,
      guildExchangeMutationObserver,
      findGuildExchangeModal
    } = dependencies;

    const SHRINE_GUIDE_STYLE_ID = "mwi-shrine-guide-native-style";
    const SHRINE_GUIDE_QUANTITY_HINT_ID = "mwi-shrine-guide-quantity-hint";
    let autofillInput = null;
    let autofillSignature = "";

    function ensureShrineGuideStyle() {
      if (document.getElementById(SHRINE_GUIDE_STYLE_ID)) return;
      const style = document.createElement("style");
      style.id = SHRINE_GUIDE_STYLE_ID;
      style.textContent = stylesApi.shrineGuideStyles(SHRINE_GUIDE_QUANTITY_HINT_ID);
      (document.head || document.documentElement).append(style);
    }

    function clearShrineGuideHighlights() {
      for (const node of state.shrineGuideObservedNodes) {
        if (!node || !node.removeAttribute) continue;
        node.removeAttribute("data-mwi-shrine-guide");
        if (node.style) node.style.removeProperty("--mwi-guide-color");
      }
      state.shrineGuideObservedNodes.clear();
    }

    function removeShrineGuideQuantityHint() {
      const hint = document.getElementById(SHRINE_GUIDE_QUANTITY_HINT_ID);
      const input = hint && hint.__mwiGuideQuantityInput;
      if (input && input.getAttribute) {
        const ids = String(input.getAttribute("aria-describedby") || "")
          .split(/\s+/)
          .filter((id) => id && id !== SHRINE_GUIDE_QUANTITY_HINT_ID);
        if (ids.length) input.setAttribute("aria-describedby", ids.join(" "));
        else input.removeAttribute("aria-describedby");
      }
      if (hint) hint.remove();
      const visualHint = state.exchangeAdvisorUi && state.exchangeAdvisorUi.quantityHint;
      if (visualHint && !visualHint.hidden) {
        visualHint.hidden = true;
        scheduleGuildExchangeAdvisor();
      }
    }

    function resetShrineGuideAutofill() {
      autofillInput = null;
      autofillSignature = "";
    }

    function prefillShrineGuideQuantityInput(modal, step) {
      const input = modal && modal.quantityInput;
      const quantity = shrineGuideAutofillQuantity(step);
      if (!input || !input.isConnected || quantity === null) return false;
      const signature = [step.creditItemHrid, step.recommendedItemHrid, quantity].join(":");
      if (autofillInput === input && autofillSignature === signature) return false;
      autofillInput = input;
      autofillSignature = signature;
      return setNativeInputValue(input, quantity);
    }

    function shrineGuideQuantityRow(modal) {
      const input = modal && modal.quantityInput;
      const surface = modal && modal.element;
      if (!input || !surface || !surface.contains(input)) return null;
      const targetQuantityGroup = input.closest && input.closest('[class*="GuildPanel_quantityInputs"]');
      if (targetQuantityGroup && surface.contains(targetQuantityGroup)) return targetQuantityGroup;
      let fallback = input.parentElement;
      let candidate = fallback;
      for (let depth = 0; candidate && candidate !== surface && depth < 4; depth += 1) {
        if (candidate.querySelectorAll("input").length === 1 && candidate.querySelector("button")) return candidate;
        candidate = candidate.parentElement;
      }
      return fallback && fallback !== surface ? fallback : input.parentElement;
    }

    function shrineGuideQuantityInputIsTopmost(modal) {
      const input = modal && modal.quantityInput;
      if (!visibleGuideNode(input) || typeof document.elementFromPoint !== "function")
        return Boolean(input && input.isConnected);
      const rect = input.getBoundingClientRect();
      const x = Math.max(
        0,
        Math.min((document.documentElement.clientWidth || window.innerWidth) - 1, rect.left + rect.width / 2)
      );
      const y = Math.max(
        0,
        Math.min((document.documentElement.clientHeight || window.innerHeight) - 1, rect.top + rect.height / 2)
      );
      const topNode = document.elementFromPoint(x, y);
      return topNode === input || Boolean(topNode && topNode.closest && topNode.closest("input") === input);
    }

    function updateShrineGuideQuantityHint(modal, step, color) {
      const input = modal && modal.quantityInput;
      const quantityRow = shrineGuideQuantityRow(modal);
      if (
        !input ||
        !input.isConnected ||
        !quantityRow ||
        !step ||
        !Number.isSafeInteger(step.suggestedBatches) ||
        step.suggestedBatches < 0 ||
        !shrineGuideQuantityInputIsTopmost(modal)
      ) {
        removeShrineGuideQuantityHint();
        return;
      }
      ensureShrineGuideStyle();
      let hint = document.getElementById(SHRINE_GUIDE_QUANTITY_HINT_ID);
      if (!hint) {
        hint = document.createElement("aside");
        hint.id = SHRINE_GUIDE_QUANTITY_HINT_ID;
        hint.setAttribute("role", "status");
        hint.setAttribute("aria-live", "polite");
      }
      if (hint.previousElementSibling !== quantityRow || hint.parentElement !== quantityRow.parentElement)
        quantityRow.insertAdjacentElement("afterend", hint);
      if (hint.__mwiGuideQuantityInput && hint.__mwiGuideQuantityInput !== input) {
        const previous = hint.__mwiGuideQuantityInput;
        const previousIds = String(previous.getAttribute("aria-describedby") || "")
          .split(/\s+/)
          .filter((id) => id && id !== SHRINE_GUIDE_QUANTITY_HINT_ID);
        if (previousIds.length) previous.setAttribute("aria-describedby", previousIds.join(" "));
        else previous.removeAttribute("aria-describedby");
      }
      hint.__mwiGuideQuantityInput = input;
      const describedBy = new Set(
        String(input.getAttribute("aria-describedby") || "")
          .split(/\s+/)
          .filter(Boolean)
      );
      describedBy.add(SHRINE_GUIDE_QUANTITY_HINT_ID);
      input.setAttribute("aria-describedby", Array.from(describedBy).join(" "));
      const remainingBatches = formatNumber(step.batches);
      const suggestedBatches = formatNumber(step.suggestedBatches);
      const limited = step.suggestedBatches < step.batches;
      const detail =
        step.method === "guild_token"
          ? t("guideTokenQuantityDetail", {
              batches: suggestedBatches,
              items: formatNumber(step.suggestedItems)
            })
          : limited
            ? t("guideQuantityCurrentExchange", { count: suggestedBatches })
            : "";
      const accessibleQuantity = t("guideQuantityRemaining", { count: remainingBatches });
      const accessibleText = detail ? `${accessibleQuantity}. ${detail}` : accessibleQuantity;
      setGuideText(hint, accessibleText);
      hint.setAttribute("aria-label", accessibleText);

      const advisorUi = state.exchangeAdvisorUi;
      const visualHint = advisorUi && advisorUi.quantityHint;
      if (!visualHint) return;
      advisorUi.surface.style.setProperty("--credit", color || "#63e6c8");
      setGuideText(visualHint.querySelector('[data-role="quantity-hint-label"]'), t("guideQuantityLabel"));
      setGuideText(visualHint.querySelector('[data-role="quantity-hint-number"]'), remainingBatches);
      const detailNode = visualHint.querySelector('[data-role="quantity-hint-detail"]');
      detailNode.hidden = !detail;
      setGuideText(detailNode, detail);
      visualHint.hidden = false;
      scheduleGuildExchangeAdvisor();
    }

    function markShrineGuideNode(node, role, color) {
      if (!node || !node.setAttribute) return false;
      node.setAttribute("data-mwi-shrine-guide", role);
      if (node.style) node.style.setProperty("--mwi-guide-color", color || "#63e6c8");
      state.shrineGuideObservedNodes.add(node);
      return true;
    }

    function guideCreditColor(itemHrid) {
      return CREDIT_TYPES.find(([candidate]) => candidate === itemHrid)?.[1] || "#63e6c8";
    }

    function visibleGuideNode(node) {
      if (!node || !node.isConnected || node.closest("#mwi-credit-optimizer")) return false;
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    }

    function nativeUseNodes(fragment) {
      return Array.from(document.querySelectorAll("use")).filter((use) => {
        const href = use.getAttribute("href") || use.getAttribute("xlink:href") || "";
        return href.endsWith(`#${fragment}`);
      });
    }

    function nativeCreditCards(itemHrid) {
      const fragment = String(itemHrid || "")
        .split("/")
        .pop();
      return nativeUseNodes(fragment).flatMap((use) => {
        const tile = use.closest('[class*="GuildPanel_guildTile"]');
        return tile && visibleGuideNode(tile) ? [tile] : [];
      });
    }

    function nativeRecommendedItems(itemHrid) {
      const fragment = String(itemHrid || "")
        .split("/")
        .pop();
      return nativeUseNodes(fragment).flatMap((use) => {
        const item = use.closest('[class*="Item_item"]');
        const exchangeSurface =
          item &&
          item.closest('[class*="GuildPanel_exchangeModalContent"],[class*="Modal_modal"],[class*="ItemSelector"]');
        return item && exchangeSurface && visibleGuideNode(item) ? [item] : [];
      });
    }

    function nativeShrineCards(plan) {
      const fragment = `guild_shrine_${String(plan.shrineHrid || "")
        .split("/")
        .pop()}`;
      const domainAliases =
        plan.domain === "combat" ? [t("domainCombat"), "Combat"] : [t("domainLife"), "Life", "Skilling"];
      const cards = nativeUseNodes(fragment).flatMap((use) => {
        const tile = use.closest('[class*="GuildPanel_guildTile"]');
        return tile && visibleGuideNode(tile) ? [tile] : [];
      });
      const exact = cards.filter((card) =>
        domainAliases.some((alias) => String(card.textContent || "").includes(alias))
      );
      return exact.length ? exact : cards;
    }

    function nativeGuildTab(aliases) {
      return (
        Array.from(document.querySelectorAll('[role="tab"]')).find(
          (tab) => aliases.includes(String(tab.textContent || "").trim()) && visibleGuideNode(tab)
        ) || null
      );
    }

    function guideAttributeSelectorValue(value) {
      if (window.CSS && typeof window.CSS.escape === "function") return window.CSS.escape(String(value || ""));
      return String(value || "")
        .replaceAll("\\", "\\\\")
        .replaceAll('"', '\\"');
    }

    function shrineGuideStatusCopy(model) {
      if (!model || model.status === "inactive") return { title: t("guideReady"), detail: t("guideReadyHint") };
      if (model.status === "no_plans") return { title: t("guideNoPlans"), detail: t("guideNoPlansHint") };
      if (model.status === "loading") return { title: t("guideLoading"), detail: t("guideLoadingHint") };
      if (model.status === "complete") return { title: t("guideComplete"), detail: t("guideCompleteHint") };
      if (model.status === "choose_credit") {
        const names = model.missingCredits
          .map((step) => itemNameForMaterial(step.creditItemHrid))
          .join(ui().locale === "zh-CN" ? "、" : ", ");
        return {
          title: t("guideMissingCredits", { count: formatNumber(model.missingCredits.length) }),
          detail: t("guideMissingCreditsHint", { items: names })
        };
      }
      if (model.status === "choose_item") {
        const step = model.activeCredit;
        return {
          title: t("guideChooseItem", { item: itemNameForMaterial(step.recommendedItemHrid) }),
          detail: t("guideChooseItemHint", { credit: itemNameForMaterial(step.creditItemHrid) })
        };
      }
      if (model.status === "set_quantity") {
        const step = model.activeCredit;
        const limited = step.suggestedBatches < step.batches;
        return {
          title: t("guideSetQuantity", { count: formatNumber(step.suggestedBatches) }),
          detail: limited
            ? t("guideSetQuantityLimitHint", {
                remaining: formatNumber(step.batches),
                max: formatNumber(step.maxBatches)
              })
            : t("guideSetQuantityHint", {
                items: formatNumber(step.suggestedItems),
                item: itemNameForMaterial(step.recommendedItemHrid),
                credits: formatNumber(step.suggestedCredits)
              })
        };
      }
      if (model.status === "use_guild_token") {
        const step = model.activeCredit;
        return {
          title: t("guideUseGuildTokens", { count: formatNumber(step.requiredItems) }),
          detail: t("guideUseGuildTokensHint", { credit: itemNameForMaterial(step.creditItemHrid) })
        };
      }
      if (model.status === "unavailable") return { title: t("guideUnavailable"), detail: t("guideUnavailableHint") };
      if (model.status === "blocked") {
        const items = model.blockers
          .map((item) => `${itemNameForMaterial(item.itemHrid)} × ${formatNumber(item.missing)}`)
          .join(ui().locale === "zh-CN" ? "、" : ", ");
        return { title: t("guideBlocked"), detail: t("guideBlockedHint", { items }) };
      }
      const names = model.targetPlans.map((plan) => plan.label).join(ui().locale === "zh-CN" ? "、" : ", ");
      return { title: t("guideUpgradeShrine"), detail: t("guideUpgradeShrineHint", { shrines: names }) };
    }

    function setGuideText(node, value) {
      if (node && node.textContent !== value) node.textContent = value;
    }

    function updateShrineGuideUi(model) {
      const panel = state.panel;
      if (!panel) return;
      const route = panel.querySelector('[data-role="shrine-guide-route"]');
      const button = panel.querySelector('[data-role="toggle-shrine-guide"]');
      if (!route || !button) return;
      const copy = shrineGuideStatusCopy(model);
      route.dataset.active = String(state.shrineGuideEnabled);
      route.dataset.status = (model && model.status) || "inactive";
      button.setAttribute("aria-pressed", String(state.shrineGuideEnabled));
      setGuideText(
        button.querySelector("span:last-child"),
        state.shrineGuideEnabled ? t("guideDisable") : t("guideEnable")
      );
      setGuideText(route.querySelector('[data-role="shrine-guide-title"]'), copy.title);
      setGuideText(route.querySelector('[data-role="shrine-guide-detail"]'), copy.detail);
    }

    function applyShrineGuide(model, modal) {
      clearShrineGuideHighlights();
      updateShrineGuideUi(model);
      if (!state.shrineGuideEnabled || !model || model.status !== "set_quantity") {
        resetShrineGuideAutofill();
        removeShrineGuideQuantityHint();
      }
      if (!state.shrineGuideEnabled || !model || ["inactive", "no_plans", "complete"].includes(model.status)) return;
      ensureShrineGuideStyle();

      for (const plan of model.targetPlans) {
        const selector = `.mwi-upgrade-plan[data-guild-buff-hrid="${guideAttributeSelectorValue(plan.guildBuffHrid)}"]`;
        markShrineGuideNode(
          state.panel && state.panel.querySelector(selector),
          model.status === "upgrade_shrine" ? "active" : "goal",
          "#9b8cff"
        );
        for (const card of nativeShrineCards(plan))
          markShrineGuideNode(card, model.status === "upgrade_shrine" ? "active" : "goal", "#9b8cff");
      }

      let foundNativeCredit = false;
      for (const step of model.missingCredits) {
        const active = model.activeCredit && model.activeCredit.creditItemHrid === step.creditItemHrid;
        const role = active ? "active" : "pending";
        const color = guideCreditColor(step.creditItemHrid);
        const selector = `.mwi-material-row[data-item-hrid="${guideAttributeSelectorValue(step.creditItemHrid)}"]`;
        markShrineGuideNode(state.panel && state.panel.querySelector(selector), role, color);
        for (const card of nativeCreditCards(step.creditItemHrid)) {
          foundNativeCredit = true;
          markShrineGuideNode(card, role, color);
        }
      }

      if (model.missingCredits.length && !foundNativeCredit && !modal) {
        markShrineGuideNode(nativeGuildTab([t("nativeGuildShopTab"), "Shop"]), "active", "#63e6c8");
      }
      if (model.activeCredit) {
        const step = model.activeCredit;
        const color = guideCreditColor(step.creditItemHrid);
        const pluginItem =
          state.panel &&
          state.panel.querySelector(
            `[data-guide-item-hrid="${guideAttributeSelectorValue(step.recommendedItemHrid)}"]`
          );
        markShrineGuideNode(pluginItem, "active", color);
        if (step.recommendedItemHrid) {
          for (const item of nativeRecommendedItems(step.recommendedItemHrid))
            markShrineGuideNode(item, "active", color);
        }
        if (model.status === "set_quantity" && modal && modal.quantityInput) {
          markShrineGuideNode(modal.quantityInput, "active", color);
          prefillShrineGuideQuantityInput(modal, step);
          updateShrineGuideQuantityHint(modal, step, color);
        }
      }
      if (model.status === "upgrade_shrine" && !model.targetPlans.some((plan) => nativeShrineCards(plan).length)) {
        markShrineGuideNode(nativeGuildTab([t("nativeGuildShopTab"), "Shop"]), "active", "#9b8cff");
      }
    }

    function refreshShrineGuide() {
      const modal = findGuildExchangeModal();
      const context = state.shrineGuideContext || {};
      const model = shrineGuideApi.deriveShrineGuide({
        enabled: state.shrineGuideEnabled,
        plans: context.plans || [],
        estimate: context.estimate || null,
        creditMaterialPlans: context.creditMaterialPlans || {},
        creditOrder: CREDIT_TYPES.map(([itemHrid]) => itemHrid),
        characterItems: state.characterItems,
        modal
      });
      state.shrineGuideModel = model;
      applyShrineGuide(model, modal);
    }

    function scheduleShrineGuide() {
      if (state.shrineGuideFrame !== null) return;
      const requestFrame =
        typeof window.requestAnimationFrame === "function"
          ? window.requestAnimationFrame.bind(window)
          : (handler) => window.setTimeout(handler, 0);
      state.shrineGuideFrame = requestFrame(() => {
        state.shrineGuideFrame = null;
        refreshShrineGuide();
      });
    }

    function guideMutationMayMatter(node) {
      if (!node || node.nodeType !== 1) return false;
      if (node.id === "mwi-credit-optimizer" || (node.closest && node.closest("#mwi-credit-optimizer"))) return true;
      const selector =
        '[class*="GuildPanel_guildTile"],[class*="GuildPanel_exchangeModalContent"],[class*="Modal_modal"],[class*="ItemSelector"],[class*="Item_item"],[role="tab"]';
      if (node.matches && node.matches(selector)) return true;
      return Boolean(node.querySelector && node.querySelector(selector));
    }

    function guideInteractionMayMatter(target) {
      if (!target || typeof target.closest !== "function") return false;
      return Boolean(
        target.closest(
          '#mwi-credit-optimizer,[class*="GuildPanel"],[class*="Modal_modal"],[class*="ItemSelector"],[role="tab"]'
        )
      );
    }

    function startShrineGuideObserver() {
      ensureShrineGuideStyle();
      if (document.body && !state.shrineGuideObserver) {
        const Observer = guildExchangeMutationObserver();
        if (Observer) {
          state.shrineGuideObserver = new Observer((mutations) => {
            if (
              mutations.some((mutation) =>
                [...Array.from(mutation.addedNodes || []), ...Array.from(mutation.removedNodes || [])].some(
                  guideMutationMayMatter
                )
              )
            )
              scheduleShrineGuide();
          });
          state.shrineGuideObserver.observe(document.body, { childList: true, subtree: true });
        }
      }
      if (!state.shrineGuideDocumentListenersInstalled) {
        const schedule = (event) => {
          if (state.shrineGuideEnabled && guideInteractionMayMatter(event.target)) scheduleShrineGuide();
        };
        const schedulePosition = () => {
          if (state.shrineGuideEnabled) scheduleShrineGuide();
        };
        document.addEventListener("click", schedule, true);
        document.addEventListener("input", schedule, true);
        document.addEventListener("change", schedule, true);
        document.addEventListener("scroll", schedulePosition, true);
        window.addEventListener("resize", schedulePosition, true);
        state.shrineGuideDocumentHandlers = { schedule, schedulePosition };
        state.shrineGuideDocumentListenersInstalled = true;
      }
    }

    function stopShrineGuideObserver() {
      if (state.shrineGuideObserver) state.shrineGuideObserver.disconnect();
      state.shrineGuideObserver = null;
      if (state.shrineGuideDocumentHandlers) {
        const { schedule, schedulePosition } = state.shrineGuideDocumentHandlers;
        document.removeEventListener("click", schedule, true);
        document.removeEventListener("input", schedule, true);
        document.removeEventListener("change", schedule, true);
        document.removeEventListener("scroll", schedulePosition, true);
        window.removeEventListener("resize", schedulePosition, true);
      }
      state.shrineGuideDocumentHandlers = null;
      state.shrineGuideDocumentListenersInstalled = false;
      clearShrineGuideHighlights();
      removeShrineGuideQuantityHint();
    }

    function setShrineGuideEnabled(panel, enabled) {
      state.shrineGuideEnabled = enabled === true;
      persistPluginUiState();
      if (state.shrineGuideEnabled) {
        startShrineGuideObserver();
        scheduleShrineGuide();
        refreshGuildUpgrade(panel);
      } else {
        stopShrineGuideObserver();
        scheduleShrineGuide();
      }
      scheduleGuildExchangeAdvisor(true);
    }

    return {
      scheduleShrineGuide,
      startShrineGuideObserver,
      stopShrineGuideObserver,
      setShrineGuideEnabled
    };
  }

  return { createShrineGuideUi, shrineGuideAutofillQuantity, setNativeInputValue };
});
