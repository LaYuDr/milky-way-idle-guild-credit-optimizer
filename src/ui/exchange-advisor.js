(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MwiGuildCreditExchangeAdvisor = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function guildExchangeQuantityInputs(element) {
    if (!element || typeof element.querySelectorAll !== "function") return { paymentInput: null, quantityInput: null };
    const containers = Array.from(element.querySelectorAll('[class*="GuildPanel_inputContainer"]'));
    const fields = containers
      .map((container) => {
        const input = container.querySelector("input");
        const label = container.querySelector('[class*="GuildPanel_label"]');
        return {
          input,
          label: String((label && label.textContent) || "")
            .replaceAll("\n", " ")
            .trim()
        };
      })
      .filter((field) => field.input);
    if (fields.length) {
      const targetField = fields.find((field) => /你获得|\byou\s+(?:receive|get)\b/i.test(field.label));
      const paymentField = fields.find((field) => /你支付|\byou\s+pay\b/i.test(field.label));
      return {
        paymentInput: (paymentField && paymentField.input) || (fields.length > 1 ? fields[0].input : null),
        quantityInput: (targetField && targetField.input) || fields[fields.length - 1].input
      };
    }
    const legacyInput =
      element.querySelector('input[type="number"]') ||
      element.querySelector('input[inputmode="numeric"]') ||
      element.querySelector('input[type="text"]');
    return { paymentInput: null, quantityInput: legacyInput || null };
  }

  function guildExchangeBatches(modalData, conversion) {
    const itemCount = Number(conversion && conversion.itemCount);
    const creditCount = Number(conversion && conversion.creditCount);
    const paymentQuantity = Number(modalData && modalData.paymentQuantity);
    const targetQuantity = Number(modalData && modalData.targetQuantity);
    if (
      Number.isSafeInteger(paymentQuantity) &&
      paymentQuantity > 0 &&
      Number.isSafeInteger(itemCount) &&
      itemCount > 0 &&
      paymentQuantity % itemCount === 0
    )
      return paymentQuantity / itemCount;
    if (
      Number.isSafeInteger(targetQuantity) &&
      targetQuantity > 0 &&
      Number.isSafeInteger(creditCount) &&
      creditCount > 0 &&
      targetQuantity % creditCount === 0
    )
      return targetQuantity / creditCount;
    const fallback = Number(modalData && modalData.batches);
    return Number.isSafeInteger(fallback) && fallback > 0 ? fallback : 1;
  }

  function inputMaximum(input) {
    if (!input) return null;
    const attributeValue = input.getAttribute && input.getAttribute("max");
    const raw = String(
      attributeValue === null || attributeValue === undefined ? input.max || "" : attributeValue
    ).trim();
    if (!raw) return null;
    const value = Number(raw);
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  }

  function createExchangeAdvisor(dependencies) {
    const {
      state,
      document,
      window,
      pageWindow,
      stylesApi,
      CREDIT_TYPES,
      SELLER_TAX_RATE,
      t,
      escapeHtml,
      formatNumber,
      itemNameForMaterial,
      itemHridFromIcon,
      enhancementLevelFromIcon,
      itemQuantity,
      creditQuantity,
      iconMarkup,
      priceReference,
      core,
      loadSnapshot,
      snapshotOrderBook,
      snapshotImmediateSellPrice,
      snapshotPrice,
      allConversions,
      exchangeAdvisorFrameTask
    } = dependencies;

    function isVisible(node) {
      const modal = (node && node.closest && node.closest('[class*="Modal_modal"]')) || node;
      if (!modal || !modal.isConnected || modal.hidden || modal.getAttribute("aria-hidden") === "true") return false;
      const rect = modal.getBoundingClientRect();
      const style = getComputedStyle(modal);
      const opacity = Number(style.opacity);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        style.pointerEvents !== "none" &&
        (!Number.isFinite(opacity) || opacity > 0.01)
      );
    }

    function findGuildExchangeModal() {
      const candidates = Array.from(document.querySelectorAll('[class*="GuildPanel_exchangeModalContent"]')).filter(
        isVisible
      );
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
        const { paymentInput, quantityInput } = guildExchangeQuantityInputs(element);
        const paymentQuantity = Number(paymentInput && paymentInput.value);
        const targetQuantity = Number(quantityInput && quantityInput.value);
        const maxTargetQuantity = inputMaximum(quantityInput);
        if (!credit) continue;
        return {
          element,
          modal,
          creditItemHrid: credit.itemHrid,
          selectedItemHrid: (selected && selected.itemHrid) || null,
          selectedEnhancementLevel: (selected && selected.enhancementLevel) || 0,
          paymentInput,
          paymentQuantity: Number.isSafeInteger(paymentQuantity) && paymentQuantity > 0 ? paymentQuantity : null,
          quantityInput,
          targetQuantity: Number.isSafeInteger(targetQuantity) && targetQuantity > 0 ? targetQuantity : null,
          maxTargetQuantity,
          batches: Number.isSafeInteger(targetQuantity) && targetQuantity > 0 ? targetQuantity : 1
        };
      }
      return null;
    }

    const GUILD_EXCHANGE_ADVISOR_HOST_ID = "mwi-guild-exchange-advisor-host";

    function createGuildExchangeAdvisorUi() {
      if (!document.body || state.exchangeAdvisorUi) return state.exchangeAdvisorUi;
      if (document.getElementById(GUILD_EXCHANGE_ADVISOR_HOST_ID)) return null;
      const host = document.createElement("div");
      host.id = GUILD_EXCHANGE_ADVISOR_HOST_ID;
      const shadow = host.attachShadow({ mode: "open" });
      shadow.innerHTML = `<style>${stylesApi.GUILD_EXCHANGE_ADVISOR_STYLES}</style><div class="advisor-stack" data-role="advisor-stack" hidden><aside class="advisor" data-role="advisor" aria-live="polite" hidden></aside><aside class="guide-quantity" data-role="quantity-guide" aria-hidden="true" hidden><span class="guide-quantity-summary" data-role="quantity-hint-summary"></span><small class="guide-quantity-detail" data-role="quantity-hint-detail" hidden></small></aside></div>`;
      document.body.append(host);
      state.exchangeAdvisorUi = {
        host,
        shadow,
        surface: shadow.querySelector('[data-role="advisor-stack"]'),
        card: shadow.querySelector('[data-role="advisor"]'),
        quantityHint: shadow.querySelector('[data-role="quantity-guide"]'),
        signature: "",
        modal: null
      };
      return state.exchangeAdvisorUi;
    }

    function hideGuildExchangeAdvisor(modalData) {
      const ui = state.exchangeAdvisorUi;
      if (!ui) return;
      ui.card.hidden = true;
      ui.signature = "";
      const modal = (modalData && modalData.modal) || null;
      if (modal && ui.quantityHint && !ui.quantityHint.hidden) {
        ui.modal = modal;
        observeActiveGuildExchangeModal(modal);
        positionGuildExchangeAdvisor(ui, modal);
        return;
      }
      ui.surface.hidden = true;
      ui.modal = null;
      observeActiveGuildExchangeModal(null);
    }

    function calculateGuildExchangeAdvisorPosition(modalRect, cardRect) {
      const margin = 12;
      const gap = 12;
      const width = Math.max(1, cardRect.width);
      const height = Math.max(1, cardRect.height);
      const clampLeft = (value) => Math.max(margin, Math.min(value, window.innerWidth - width - margin));
      const clampTop = (value) => Math.max(margin, Math.min(value, window.innerHeight - height - margin));
      if (modalRect.right + gap + width <= window.innerWidth - margin)
        return { placement: "right", left: modalRect.right + gap, top: clampTop(modalRect.top) };
      if (modalRect.left - gap - width >= margin)
        return { placement: "left", left: modalRect.left - gap - width, top: clampTop(modalRect.top) };
      if (modalRect.bottom + gap + height <= window.innerHeight - margin)
        return {
          placement: "bottom",
          left: clampLeft(modalRect.left + (modalRect.width - width) / 2),
          top: modalRect.bottom + gap
        };
      if (modalRect.top - gap - height >= margin)
        return {
          placement: "top",
          left: clampLeft(modalRect.left + (modalRect.width - width) / 2),
          top: modalRect.top - gap - height
        };
      return {
        placement: "overlay",
        left: clampLeft(modalRect.left + (modalRect.width - width) / 2),
        top: clampTop(window.innerHeight - height - margin)
      };
    }

    function positionGuildExchangeAdvisor(ui, modal) {
      const surface = ui && ui.surface;
      if (!surface) return false;
      if (!modal || !modal.isConnected || !isVisible(modal)) {
        surface.hidden = true;
        return false;
      }
      if (ui.card.hidden && ui.quantityHint.hidden) {
        surface.hidden = true;
        return false;
      }
      const wasHidden = surface.hidden;
      if (wasHidden) {
        surface.style.visibility = "hidden";
        surface.hidden = false;
      }
      const modalRect = modal.getBoundingClientRect();
      const surfaceRect = surface.getBoundingClientRect();
      if (modalRect.width <= 0 || modalRect.height <= 0 || surfaceRect.width <= 0 || surfaceRect.height <= 0) {
        surface.hidden = true;
        surface.style.removeProperty("visibility");
        return false;
      }
      const position = calculateGuildExchangeAdvisorPosition(modalRect, surfaceRect);
      surface.dataset.placement = position.placement;
      ui.card.dataset.placement = position.placement;
      surface.style.left = `${Math.round(position.left)}px`;
      surface.style.top = `${Math.round(position.top)}px`;
      surface.hidden = false;
      surface.style.removeProperty("visibility");
      return true;
    }

    function advisorOptionMarkup(label, option, details, best) {
      const primary = details
        ? `${formatNumber(details.credits)}<small>${escapeHtml(t("credits"))}</small>`
        : `${core.formatCompactCost(option.costPerCredit)}<small>${escapeHtml(t("goldPerCredit"))}</small>`;
      const first = details
        ? [details.firstLabel, details.firstValue]
        : [
            t("singleExchange"),
            t("exchangeRate", { items: itemQuantity(option.itemCount), credits: creditQuantity(option.creditCount) })
          ];
      const second = details
        ? [details.secondLabel, details.secondValue]
        : [t("marketCost"), `${core.formatCompactCost(option.cost)} ${t("gold")}`];
      return `<section class="option${best ? " best" : ""}"><span class="label">${escapeHtml(label)}</span><div class="item">${iconMarkup(option.itemHrid, option.itemName)}<span class="name">${escapeHtml(option.itemName)}</span></div><div class="cost">${primary}</div><div class="detail"><span>${escapeHtml(first[0])}</span><b>${escapeHtml(first[1])}</b></div><div class="detail"><span>${escapeHtml(second[0])}</span><b>${escapeHtml(second[1])}</b></div></section>`;
    }

    function guildExchangeAdvisorMarkup(data) {
      const comparison = Boolean(data.selected && data.replacement);
      const reference = priceReference(state.priceReference).label;
      const header = `<header class="head"><div class="title"><span>${escapeHtml(t("exchangeRecommendation"))}</span><span class="credit">${escapeHtml(data.creditName)}</span></div><span class="reference">${escapeHtml(data.selected ? t("advisorReferenceSelected", { reference }) : t("advisorReference", { reference }))}</span></header>`;
      let summary = t("chooseItem");
      if (data.selectedOptimal) summary = t("alreadyOptimal");
      else if (!data.selected && data.unavailableReason) summary = data.unavailableReason;
      else if (comparison && data.replacement.creditDifference > 0)
        summary = t("sellAndBuyMore", {
          count: formatNumber(data.replacement.creditDifference),
          credit: escapeHtml(data.creditName)
        });
      else if (comparison && data.replacement.creditDifference < 0)
        summary = t("directMore", {
          count: formatNumber(-data.replacement.creditDifference),
          credit: escapeHtml(data.creditName)
        });
      else if (comparison) summary = t("sameCredits");
      const selected = comparison
        ? advisorOptionMarkup(t("selected"), data.selected, {
            credits: data.replacement.directCredits,
            firstLabel: t("directExchange"),
            firstValue: t("exchangeRate", {
              items: itemQuantity(data.replacement.sale.quantity),
              credits: creditQuantity(data.replacement.directCredits)
            }),
            secondLabel: t("afterTax"),
            secondValue: `${core.formatCompactCost(data.replacement.sale.net)} ${t("gold")}`
          })
        : "";
      const best = advisorOptionMarkup(
        data.selectedOptimal ? t("selectedOptimal") : t("bestItem"),
        data.best,
        comparison
          ? {
              credits: data.replacement.best.actualCredits,
              firstLabel: t("buybackExchange"),
              firstValue: t("exchangeRate", {
                items: itemQuantity(data.replacement.best.requiredItems),
                credits: creditQuantity(data.replacement.best.actualCredits)
              }),
              secondLabel: t("purchaseCost"),
              secondValue: `${core.formatCompactCost(data.replacement.best.cost)} ${t("gold")}`
            }
          : null,
        true
      );
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
      ui.card.hidden = false;
      ui.modal = modalData.modal;
      observeActiveGuildExchangeModal(modalData.modal);
      ui.card.setAttribute("aria-label", t("exchangeRecommendation"));
      ui.surface.style.setProperty("--credit", data.color);
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
      if (shrineGuideUsesGuildTokensFor(modalData.creditItemHrid)) {
        hideGuildExchangeAdvisor(modalData);
        return false;
      }

      const conversions = allConversions(modalData.creditItemHrid);
      if (!conversions.length) {
        hideGuildExchangeAdvisor(modalData);
        return false;
      }

      if (!state.snapshot) {
        hideGuildExchangeAdvisor(modalData);
        if (state.exchangeAdvisorSnapshotFailed) return;
        if (!state.exchangeAdvisorLoadInFlight) {
          state.exchangeAdvisorLoadInFlight = true;
          loadSnapshot(false)
            .catch(() => {
              state.exchangeAdvisorSnapshotFailed = true;
              return null;
            })
            .finally(() => {
              state.exchangeAdvisorLoadInFlight = false;
              scheduleGuildExchangeAdvisor(true);
            });
        }
        return false;
      }

      const books = Object.fromEntries(
        conversions.map((conversion) => [conversion.itemHrid, snapshotOrderBook(conversion.itemHrid)])
      );
      let best = core.rankConversions(conversions, books, 1).find((result) => result.status === "ok");
      if (!best) {
        hideGuildExchangeAdvisor(modalData);
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
          const buyPrices = Object.fromEntries(
            conversions.map((conversion) => [
              conversion.itemHrid,
              snapshotPrice(conversion.itemHrid, state.priceReference)
            ])
          );
          replacement = core.estimateSaleReplacement({
            selectedConversion,
            batches: guildExchangeBatches(modalData, selectedConversion),
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
            unavailableReason =
              replacement.status === "no_affordable_conversion"
                ? t("noAffordableReplacement", { gold: `${core.formatCompactCost(replacement.sale.net)} ${t("gold")}` })
                : t("noSellPrice");
            replacement = null;
          } else {
            selected = selectedConversion;
          }
        }
      }
      const creditName = itemNameForMaterial(modalData.creditItemHrid);
      return renderGuildExchangeAdvisor(
        modalData,
        {
          creditName,
          color: CREDIT_TYPES.find(([hrid]) => hrid === modalData.creditItemHrid)?.[1] || "#4fcdb5",
          best: replacement ? replacement.best : best,
          selected,
          selectedOptimal,
          replacement,
          unavailableReason
        },
        forceRender
      );
    }

    function shrineGuideUsesGuildTokensFor(creditItemHrid) {
      const rows =
        state.shrineGuideContext && state.shrineGuideContext.estimate && state.shrineGuideContext.estimate.rows;
      return Boolean(
        state.shrineGuideEnabled === true &&
        Array.isArray(rows) &&
        rows.some(
          (row) => row && row.itemHrid === creditItemHrid && (row.guildTokenExchange || row.autoGuildTokenExchange)
        )
      );
    }

    function scheduleGuildExchangeAdvisor(forceRender) {
      if (!state.exchangeAdvisorUi) return;
      exchangeAdvisorFrameTask.schedule(Boolean(forceRender));
    }

    function guildExchangeMutationObserver() {
      return pageWindow.MutationObserver || (typeof MutationObserver === "function" ? MutationObserver : null);
    }

    function nodeMayContainGuildExchangeModal(node) {
      if (!node || node.nodeType !== 1) return false;
      const selector = '[class*="GuildPanel_exchangeModalContent"]';
      if (node.matches(selector)) return true;
      // Only child-list changes reach this observer. Inspecting each newly added
      // subtree keeps portal mounting reliable without restoring the old, costly
      // whole-page attributes/text observer.
      return Boolean(node.querySelector(selector));
    }

    function observeActiveGuildExchangeModal(modal) {
      if (state.exchangeAdvisorObservedModal === modal) return;
      if (state.exchangeAdvisorModalObserver) state.exchangeAdvisorModalObserver.disconnect();
      state.exchangeAdvisorObservedModal = modal || null;
      state.exchangeAdvisorModalObserver = null;
      if (!modal || !modal.isConnected) return;
      const Observer = guildExchangeMutationObserver();
      if (!Observer) return;
      state.exchangeAdvisorModalObserver = new Observer(() => scheduleGuildExchangeAdvisor());
      state.exchangeAdvisorModalObserver.observe(modal, {
        attributes: true,
        attributeFilter: ["aria-hidden", "class", "hidden", "style"],
        childList: true,
        subtree: true
      });
    }

    function watchGuildExchangeModals() {
      if (!document.body || state.exchangeAdvisorRootObserver) return;
      const Observer = guildExchangeMutationObserver();
      if (!Observer) return;
      state.exchangeAdvisorRootObserver = new Observer((mutations) => {
        const activeModal = state.exchangeAdvisorUi && state.exchangeAdvisorUi.modal;
        if (activeModal && !activeModal.isConnected) {
          scheduleGuildExchangeAdvisor();
          return;
        }
        if (
          Array.from(mutations || []).some((mutation) =>
            Array.from(mutation.addedNodes || []).some(nodeMayContainGuildExchangeModal)
          )
        ) {
          scheduleGuildExchangeAdvisor();
        }
      });
      state.exchangeAdvisorRootObserver.observe(document.body, {
        childList: true,
        subtree: true
      });
      if (!state.exchangeAdvisorListenersInstalled) {
        const reposition = () => {
          if (state.exchangeAdvisorUi && state.exchangeAdvisorUi.modal) scheduleGuildExchangeAdvisor();
        };
        window.addEventListener("resize", reposition, { passive: true });
        window.addEventListener("orientationchange", reposition, { passive: true });
        window.addEventListener("scroll", reposition, { capture: true, passive: true });
        state.exchangeAdvisorRepositionHandler = reposition;
        state.exchangeAdvisorListenersInstalled = true;
      }
      scheduleGuildExchangeAdvisor(true);
    }

    function startGuildExchangeAdvisor() {
      if (!createGuildExchangeAdvisorUi()) return;
      watchGuildExchangeModals();
      scheduleGuildExchangeAdvisor(true);
    }

    return {
      findGuildExchangeModal,
      shrineGuideUsesGuildTokensFor,
      refreshGuildExchangeAdvisor,
      scheduleGuildExchangeAdvisor,
      guildExchangeMutationObserver,
      startGuildExchangeAdvisor
    };
  }

  return { createExchangeAdvisor, guildExchangeQuantityInputs, guildExchangeBatches, inputMaximum };
});
