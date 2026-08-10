(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MwiGuildCreditDom = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function updateRenderedMarkup(element, markup, propertyName) {
    if (!element || element[propertyName] === markup) return false;
    element.innerHTML = markup;
    element[propertyName] = markup;
    return true;
  }

  function escapeHtml(value) {
    return String(value).replace(
      /[&<>'"]/g,
      (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]
    );
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
    const match = String((label && label.textContent) || "")
      .trim()
      .match(/^\+(\d+)$/);
    const level = Number(match && match[1]);
    return Number.isSafeInteger(level) && level >= 0 ? level : 0;
  }

  return { updateRenderedMarkup, escapeHtml, itemHridFromIcon, enhancementLevelFromIcon };
});
