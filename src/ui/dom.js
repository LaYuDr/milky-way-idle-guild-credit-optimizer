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

  function spriteBaseFromReference(reference, marker) {
    const value = String(reference || "").trim();
    const normalizedMarker = String(marker || "")
      .trim()
      .toLowerCase();
    if (!value || !normalizedMarker) return "";
    const hashIndex = value.lastIndexOf("#");
    const base = hashIndex >= 0 ? value.slice(0, hashIndex) : value;
    return base.toLowerCase().includes(normalizedMarker) ? base : "";
  }

  function findSpriteBaseHref(root, marker) {
    if (!root || typeof root.querySelectorAll !== "function") return "";
    for (const useElement of root.querySelectorAll("use")) {
      const reference = useElement.getAttribute("href") || useElement.getAttribute("xlink:href");
      const base = spriteBaseFromReference(reference, marker);
      if (base) return base;
    }
    return "";
  }

  function spriteBaseFromAssetManifest(manifest, marker) {
    if (!manifest || typeof manifest !== "object" || !manifest.files || typeof manifest.files !== "object") return "";
    for (const [name, reference] of Object.entries(manifest.files)) {
      const base = spriteBaseFromReference(reference, marker);
      if (
        base ||
        String(name)
          .toLowerCase()
          .includes(String(marker || "").toLowerCase())
      )
        return base || String(reference);
    }
    return "";
  }

  return {
    updateRenderedMarkup,
    escapeHtml,
    itemHridFromIcon,
    enhancementLevelFromIcon,
    spriteBaseFromReference,
    findSpriteBaseHref,
    spriteBaseFromAssetManifest
  };
});
