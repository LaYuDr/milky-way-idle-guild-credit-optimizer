(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MwiGuildProfileTooltip = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  function createTooltip({ document, pageWindow, host, getData, getProfile, getBridge, t }) {
    let anchor = null;
    let tooltip = null;
    let originalTitle = null;
    let hideTimer = null;
    function cancelHide() {
      if (hideTimer !== null) pageWindow.clearTimeout(hideTimer);
      hideTimer = null;
    }
    const listeners = [];
    const on = (node, type, handler, capture = false) => {
      node.addEventListener(type, handler, capture);
      listeners.push(() => node.removeEventListener(type, handler, capture));
    };
    function hide() {
      cancelHide();
      if (anchor) {
        anchor.removeAttribute("aria-describedby");
        if (originalTitle !== null) anchor.setAttribute("title", originalTitle);
      }
      if (tooltip) {
        getBridge()?.clearProfileTooltip?.(tooltip);
        tooltip.remove();
      }
      anchor = tooltip = null;
      originalTitle = null;
    }
    function position() {
      if (!anchor || !tooltip) return;
      const bounds = anchor.getBoundingClientRect();
      const size = tooltip.getBoundingClientRect();
      const width = document.documentElement.clientWidth;
      const height = pageWindow.innerHeight;
      const left = Math.max(8, Math.min(width - size.width - 8, bounds.left + (bounds.width - size.width) / 2));
      const top =
        bounds.top >= size.height + 8
          ? bounds.top - size.height - 6
          : Math.min(height - size.height - 8, bounds.bottom + 6);
      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${Math.max(8, Math.min(height - size.height - 8, top))}px`;
    }
    function show(target) {
      const next = target.closest?.("[data-trial-profile-tooltip]");
      if (next) cancelHide();
      if (!next || next === anchor) return;
      hide();
      const data = getData(next.dataset.trialProfileTooltip);
      const profile = getProfile();
      if (!data || !profile) return;
      anchor = next;
      originalTitle = anchor.getAttribute("title");
      anchor.removeAttribute("title");
      tooltip = document.createElement("div");
      tooltip.id = "mwi-trial-profile-tooltip";
      tooltip.className = "mwi-trial-profile-tooltip";
      tooltip.setAttribute("role", "tooltip");
      document.body.appendChild(tooltip);
      const hasExperience =
        data.kind === "item" || (Number.isFinite(data.record.level) && Number.isFinite(data.record.experience));
      if (!hasExperience || getBridge()?.renderProfileTooltip?.(tooltip, profile, data.kind, data.record) !== true) {
        tooltip.textContent = `${anchor.getAttribute("aria-label")}\n${t("trialProfileTooltipUnavailable")}`;
      }
      anchor.setAttribute("aria-describedby", tooltip.id);
      tooltip.addEventListener("mouseleave", (event) => {
        if (!anchor?.contains(event.relatedTarget)) hide();
      });
      tooltip.addEventListener("mouseenter", cancelHide);
      position();
    }
    on(host, "mouseover", (event) => show(event.target));
    on(host, "focusin", (event) => show(event.target));
    on(host, "mouseout", (event) => {
      if (
        anchor?.contains(event.target) &&
        !anchor.contains(event.relatedTarget) &&
        !tooltip?.contains(event.relatedTarget)
      )
        hideTimer = pageWindow.setTimeout(hide, 120);
    });
    on(host, "focusout", (event) => {
      if (anchor?.contains(event.target)) hide();
    });
    on(document, "keydown", (event) => {
      if (event.key === "Escape") hide();
    });
    on(
      document,
      "scroll",
      (event) => {
        if (!tooltip?.contains(event.target)) hide();
      },
      true
    );
    on(pageWindow, "resize", hide);
    on(
      host,
      "toggle",
      (event) => {
        if (!event.target.open && event.target.contains(anchor)) hide();
      },
      true
    );
    const observer = new pageWindow.MutationObserver(() => {
      if (anchor && (!anchor.isConnected || !anchor.checkVisibility())) hide();
    });
    observer.observe(host.closest("#mwi-credit-optimizer") || host, {
      attributes: true,
      subtree: true,
      childList: true,
      attributeFilter: ["hidden", "open", "style", "class"]
    });
    function dispose() {
      hide();
      observer.disconnect();
      listeners.forEach((remove) => remove());
    }
    return { hide, dispose };
  }
  return { createTooltip };
});
