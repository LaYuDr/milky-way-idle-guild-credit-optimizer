(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MwiGuildCreditSortable = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function normalizeOrder(order, allowed, fallback = allowed) {
    const allowedSet = new Set(allowed);
    const normalized = [];
    for (const value of Array.isArray(order) ? order : []) {
      if (allowedSet.has(value) && !normalized.includes(value)) normalized.push(value);
    }
    for (const value of fallback) {
      if (allowedSet.has(value) && !normalized.includes(value)) normalized.push(value);
    }
    for (const value of allowed) {
      if (!normalized.includes(value)) normalized.push(value);
    }
    return normalized;
  }

  function reorderByIndex(items, fromIndex, toIndex) {
    const next = Array.from(items || []);
    if (
      !Number.isInteger(fromIndex) ||
      !Number.isInteger(toIndex) ||
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= next.length ||
      toIndex >= next.length ||
      fromIndex === toIndex
    )
      return next;
    const [item] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, item);
    return next;
  }

  function reorderVisibleByIndex(order, visibleValues, value, toIndex) {
    const fullOrder = Array.from(order || []);
    const visibleSet = new Set(visibleValues || []);
    const visibleOrder = fullOrder.filter((candidate) => visibleSet.has(candidate));
    const fromIndex = visibleOrder.indexOf(value);
    const nextVisibleOrder = reorderByIndex(visibleOrder, fromIndex, toIndex);
    if (nextVisibleOrder.every((candidate, index) => candidate === visibleOrder[index])) return fullOrder;
    let visibleIndex = 0;
    return fullOrder.map((candidate) => (visibleSet.has(candidate) ? nextVisibleOrder[visibleIndex++] : candidate));
  }

  function createPointerSortable(options) {
    const {
      root,
      containerSelector,
      itemSelector,
      handleSelector = itemSelector,
      axis = "y",
      threshold = 6,
      onCommit
    } = options || {};
    if (!root || typeof root.addEventListener !== "function") return { destroy() {} };

    const ownerDocument = root.ownerDocument || (typeof document !== "undefined" ? document : null);
    const ownerWindow = ownerDocument && ownerDocument.defaultView;
    let drag = null;
    let suppressClick = false;
    root.querySelectorAll(containerSelector).forEach((container) => container.classList.add(`mwi-sort-axis-${axis}`));

    function sortableItems(container) {
      return Array.from(container.querySelectorAll(itemSelector)).filter((item) => item.parentElement === container);
    }

    function clearMarkers() {
      if (!drag) return;
      for (const item of sortableItems(drag.container)) {
        item.classList.remove("mwi-sort-drop-before", "mwi-sort-drop-after", "mwi-sort-dragging");
        item.style.removeProperty("transform");
        item.style.removeProperty("z-index");
      }
      drag.container.classList.remove("mwi-sort-active");
    }

    function finish(commit) {
      if (!drag) return;
      const finished = drag;
      clearMarkers();
      drag = null;
      if (commit && finished.dragging) suppressClick = true;
      if (commit && finished.dragging && finished.toIndex !== finished.fromIndex && typeof onCommit === "function") {
        onCommit({
          key: finished.key,
          fromIndex: finished.fromIndex,
          toIndex: finished.toIndex,
          container: finished.container
        });
      }
    }

    function indexAtPointer(items, coordinate) {
      let insertionIndex = items.length;
      for (let index = 0; index < items.length; index += 1) {
        const rect = items[index].getBoundingClientRect();
        const midpoint = axis === "x" ? rect.left + rect.width / 2 : rect.top + rect.height / 2;
        if (coordinate < midpoint) {
          insertionIndex = index;
          break;
        }
      }
      return insertionIndex;
    }

    function updateDropTarget(event) {
      const items = sortableItems(drag.container);
      const candidates = items.filter((item) => item !== drag.item);
      const coordinate = axis === "x" ? event.clientX : event.clientY;
      const insertionIndex = indexAtPointer(candidates, coordinate);
      const toIndex = Math.max(0, Math.min(items.length - 1, insertionIndex));
      drag.toIndex = toIndex;
      for (const item of items) item.classList.remove("mwi-sort-drop-before", "mwi-sort-drop-after");
      const markerIndex = Math.min(insertionIndex, candidates.length - 1);
      const marker = candidates[markerIndex];
      if (marker) {
        marker.classList.add(insertionIndex >= candidates.length ? "mwi-sort-drop-after" : "mwi-sort-drop-before");
      }

      const delta = coordinate - (axis === "x" ? drag.startX : drag.startY);
      drag.item.style.transform = axis === "x" ? `translateX(${delta}px)` : `translateY(${delta}px)`;
      drag.item.style.zIndex = "8";

      const scrollContainer = axis === "y" ? root : drag.container;
      const rect = scrollContainer.getBoundingClientRect();
      const edge = 36;
      const scrollDelta =
        coordinate < (axis === "x" ? rect.left : rect.top) + edge
          ? -12
          : coordinate > (axis === "x" ? rect.right : rect.bottom) - edge
            ? 12
            : 0;
      if (scrollDelta && typeof scrollContainer.scrollBy === "function") {
        scrollContainer.scrollBy(axis === "x" ? { left: scrollDelta } : { top: scrollDelta });
      }
    }

    function pointerDown(event) {
      if (event.button !== undefined && event.button !== 0) return;
      if (event.isPrimary === false) return;
      const target = event.target && (event.target.nodeType === 1 ? event.target : event.target.parentElement);
      const handle = target && target.closest(handleSelector);
      const item = handle && handle.closest(itemSelector);
      const container = item && item.closest(containerSelector);
      if (!handle || !item || !container || !root.contains(container) || item.parentElement !== container) return;
      container.classList.add(`mwi-sort-axis-${axis}`);
      const items = sortableItems(container);
      const fromIndex = items.indexOf(item);
      if (fromIndex < 0 || items.length < 2) return;
      drag = {
        pointerId: event.pointerId,
        handle,
        item,
        container,
        key: item.dataset.sortKey || "",
        startX: event.clientX,
        startY: event.clientY,
        fromIndex,
        toIndex: fromIndex,
        dragging: false
      };
    }

    function pointerMove(event) {
      if (!drag || (drag.pointerId !== undefined && event.pointerId !== drag.pointerId)) return;
      const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
      if (!drag.dragging && distance < threshold) return;
      if (!drag.dragging) {
        drag.dragging = true;
        if (typeof drag.handle.setPointerCapture === "function" && event.pointerId !== undefined) {
          try {
            drag.handle.setPointerCapture(event.pointerId);
          } catch (_) {
            // Some synthetic or detached pointer targets cannot capture safely.
          }
        }
        drag.item.classList.add("mwi-sort-dragging");
        drag.container.classList.add("mwi-sort-active");
      }
      event.preventDefault();
      updateDropTarget(event);
    }

    function pointerUp(event) {
      if (!drag || (drag.pointerId !== undefined && event.pointerId !== drag.pointerId)) return;
      finish(true);
    }

    function pointerCancel(event) {
      if (!drag || (drag.pointerId !== undefined && event.pointerId !== drag.pointerId)) return;
      finish(false);
    }

    function keyDown(event) {
      if (event.key === "Escape" && drag) {
        event.preventDefault();
        finish(false);
        return;
      }
      if (!event.altKey) return;
      const target = event.target && (event.target.nodeType === 1 ? event.target : event.target.parentElement);
      const handle = target && target.closest(handleSelector);
      const item = handle && handle.closest(itemSelector);
      const container = item && item.closest(containerSelector);
      if (!handle || !item || !container || !root.contains(container)) return;
      const backward = axis === "x" ? event.key === "ArrowLeft" : event.key === "ArrowUp";
      const forward = axis === "x" ? event.key === "ArrowRight" : event.key === "ArrowDown";
      if (!backward && !forward) return;
      event.preventDefault();
      const items = sortableItems(container);
      const fromIndex = items.indexOf(item);
      const toIndex = Math.max(0, Math.min(items.length - 1, fromIndex + (backward ? -1 : 1)));
      if (fromIndex === toIndex || typeof onCommit !== "function") return;
      onCommit({ key: item.dataset.sortKey || "", fromIndex, toIndex, container });
    }

    function click(event) {
      if (!suppressClick) return;
      suppressClick = false;
      event.preventDefault();
      event.stopPropagation();
    }

    function windowBlur() {
      finish(false);
    }

    root.addEventListener("pointerdown", pointerDown);
    root.addEventListener("pointermove", pointerMove, { passive: false });
    root.addEventListener("pointerup", pointerUp);
    root.addEventListener("pointercancel", pointerCancel);
    root.addEventListener("lostpointercapture", pointerCancel);
    root.addEventListener("keydown", keyDown);
    root.addEventListener("click", click, true);
    if (ownerWindow) ownerWindow.addEventListener("blur", windowBlur);
    return {
      destroy() {
        finish(false);
        root.removeEventListener("pointerdown", pointerDown);
        root.removeEventListener("pointermove", pointerMove);
        root.removeEventListener("pointerup", pointerUp);
        root.removeEventListener("pointercancel", pointerCancel);
        root.removeEventListener("lostpointercapture", pointerCancel);
        root.removeEventListener("keydown", keyDown);
        root.removeEventListener("click", click, true);
        if (ownerWindow) ownerWindow.removeEventListener("blur", windowBlur);
      }
    };
  }

  return { normalizeOrder, reorderByIndex, reorderVisibleByIndex, createPointerSortable };
});
