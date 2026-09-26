(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MwiGuildCreditSidebarInteraction = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const SIDEBAR_ACTIVATION_EVENT = "mwi:sidebar-plugin-activated";
  const WHEEL_ATTRIBUTE = "data-mwi-sidebar-wheel-scroll";
  // DOM attributes survive cloneNode(); event listeners do not.
  const wheelBindings = new WeakMap();
  const WHEEL_STYLES = {
    "max-width": "100%",
    "min-width": "0",
    "overflow-x": "auto",
    "overflow-y": "hidden",
    "overscroll-behavior-inline": "contain",
    "scrollbar-width": "none"
  };

  function styleProperty(name) {
    return name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
  }

  function readStyle(style, name) {
    return {
      value: style.getPropertyValue?.(name) ?? style[styleProperty(name)] ?? "",
      priority: style.getPropertyPriority?.(name) || ""
    };
  }

  function writeStyle(style, name, value, priority = "") {
    if (typeof style.setProperty === "function") {
      if (value === "") style.removeProperty(name);
      else style.setProperty(name, value, priority);
    } else style[styleProperty(name)] = value;
  }

  function claimStyle(node, name, value, priority = "") {
    const previous = readStyle(node.style, name);
    writeStyle(node.style, name, value, priority);
    return { previous, written: readStyle(node.style, name) };
  }

  function restoreStyle(node, name, record) {
    const current = readStyle(node.style, name);
    if (current.value === record.written.value && current.priority === record.written.priority)
      writeStyle(node.style, name, record.previous.value, record.previous.priority);
  }

  function enableSidebarTabWheelScrolling(tabBar) {
    if (!tabBar || typeof tabBar.addEventListener !== "function") return false;
    if (wheelBindings.has(tabBar)) return true;
    const styles = new Map();
    if (tabBar.style) {
      for (const [name, value] of Object.entries(WHEEL_STYLES)) styles.set(name, claimStyle(tabBar, name, value));
    }
    const listener = (event) => {
      if (event.ctrlKey || event.defaultPrevented || event.cancelable === false) return;
      const width = Number(tabBar.clientWidth);
      const max = Number(tabBar.scrollWidth) - width;
      if (!Number.isFinite(max) || max <= 0) return;
      const horizontal = Math.abs(event.deltaX) > Math.abs(event.deltaY);
      let delta = horizontal ? event.deltaX : event.deltaY;
      if (!Number.isFinite(delta) || delta === 0) return;
      if (event.deltaMode === 1) delta *= 16;
      else if (event.deltaMode === 2) delta *= Math.max(1, width);
      const raw = Number(tabBar.scrollLeft) || 0;
      const view = tabBar.ownerDocument?.defaultView;
      const direction = view?.getComputedStyle?.(tabBar)?.direction || tabBar.style?.direction;
      const rtl = direction === "rtl" || (direction !== "ltr" && raw < 0);
      // Horizontal gestures retain physical direction; vertical gestures advance
      // toward inline-end, including negative scrollLeft in modern RTL layouts.
      if (rtl && !horizontal) delta = -delta;
      const min = rtl ? -max : 0;
      const limit = rtl ? 0 : max;
      const current = Math.min(limit, Math.max(min, raw));
      const next = Math.min(limit, Math.max(min, current + delta));
      if (next === current) return;
      tabBar.scrollLeft = next;
      if (Number(tabBar.scrollLeft) !== raw) event.preventDefault();
    };
    tabBar.addEventListener("wheel", listener, { passive: false });
    tabBar.setAttribute?.(WHEEL_ATTRIBUTE, "true");
    wheelBindings.set(tabBar, { listener, styles });
    return true;
  }

  function disableSidebarTabWheelScrolling(tabBar) {
    const binding = tabBar && wheelBindings.get(tabBar);
    if (!binding) return false;
    tabBar.removeEventListener?.("wheel", binding.listener);
    for (const [name, record] of binding.styles) restoreStyle(tabBar, name, record);
    if (tabBar.getAttribute?.(WHEEL_ATTRIBUTE) === "true") tabBar.removeAttribute?.(WHEEL_ATTRIBUTE);
    wheelBindings.delete(tabBar);
    return true;
  }

  function createActivationCoordinator(options = {}) {
    const eventTarget = options.eventTarget;
    const CustomEventConstructor = options.CustomEvent;
    const owner = String(options.owner || "").trim();
    const onDeactivate = typeof options.onDeactivate === "function" ? options.onDeactivate : () => {};
    let started = false;
    function handleActivation(event) {
      const activeOwner = typeof event?.detail === "string" ? event.detail : "";
      if (activeOwner && activeOwner !== owner) onDeactivate(activeOwner);
    }
    function start() {
      if (started) return true;
      if (!owner || typeof eventTarget?.addEventListener !== "function") return false;
      eventTarget.addEventListener(SIDEBAR_ACTIVATION_EVENT, handleActivation);
      started = true;
      return true;
    }
    function announce() {
      if (!started) start();
      if (!started || typeof eventTarget?.dispatchEvent !== "function" || typeof CustomEventConstructor !== "function")
        return false;
      eventTarget.dispatchEvent(new CustomEventConstructor(SIDEBAR_ACTIVATION_EVENT, { detail: owner }));
      return true;
    }
    function destroy() {
      if (!started) return;
      eventTarget.removeEventListener(SIDEBAR_ACTIVATION_EVENT, handleActivation);
      started = false;
    }
    return Object.freeze({ start, announce, destroy });
  }

  function createDocumentActivationCoordinator(windowRef, owner, onDeactivate) {
    const coordinator = createActivationCoordinator({
      eventTarget: windowRef?.document,
      CustomEvent: windowRef?.CustomEvent,
      owner,
      onDeactivate
    });
    coordinator.start();
    return coordinator;
  }

  function selected(tab) {
    return tab.getAttribute("aria-selected") === "true" || tab.classList.contains("Mui-selected");
  }

  function restoreAttribute(node, name, previous, written) {
    if (node.getAttribute(name) !== written) return;
    if (previous === null) node.removeAttribute(name);
    else node.setAttribute(name, previous);
  }

  function createSelectionController(state) {
    const hiddenNodes = new Map();
    const tabStates = new Map();
    let active = null;

    function otherSelected(tabBar = active?.tabBar) {
      return Array.from(tabBar?.children || []).some((tab) => tab !== active?.tab && !tab.hidden && selected(tab));
    }

    function captureSiblings(panelHost, tabBar) {
      for (const node of panelHost.children) {
        if (node === active.panel || hiddenNodes.has(node) || !node.style) continue;
        hiddenNodes.set(node, claimStyle(node, "display", "none", "important"));
      }
      for (const tab of tabBar.children) {
        if (tab === active.tab || tab.hidden || tabStates.has(tab)) continue;
        tabStates.set(tab, {
          tabindex: tab.getAttribute("tabindex"),
          aria: tab.getAttribute("aria-selected"),
          selected: tab.classList.contains("Mui-selected")
        });
        tab.classList.remove("Mui-selected");
        tab.setAttribute("aria-selected", "false");
        tab.tabIndex = -1;
      }
    }

    function sync(panelHost, tabBar) {
      if (
        !active ||
        !panelHost ||
        !tabBar ||
        active.panel.hidden ||
        active.tab.getAttribute("aria-selected") !== "true" ||
        !active.tab.classList.contains("Mui-selected") ||
        otherSelected(tabBar)
      )
        return false;
      active.panelHost = panelHost;
      active.tabBar = tabBar;
      captureSiblings(panelHost, tabBar);
      return true;
    }

    function show(panelHost, tabBar) {
      if (!state.panel || !state.creditTab || !panelHost || !tabBar) return false;
      if (active) {
        if (active.panel === state.panel && active.tab === state.creditTab && sync(panelHost, tabBar)) return true;
        // Explicit activation may reclaim a sidebar after an external change;
        // passive sync never does. Release the previous ownership first.
        hide();
      }
      active = { panel: state.panel, tab: state.creditTab, panelHost, tabBar };
      captureSiblings(panelHost, tabBar);
      active.panel.hidden = false;
      active.tab.classList.add("Mui-selected");
      active.tab.setAttribute("aria-selected", "true");
      active.tab.tabIndex = 0;
      return true;
    }

    function hide() {
      if (!active) return;
      const { panel, tab: creditTab } = active;
      panel.hidden = true;
      creditTab.classList.remove("Mui-selected");
      restoreAttribute(creditTab, "aria-selected", "false", "true");
      restoreAttribute(creditTab, "tabindex", "-1", "0");
      for (const [node, record] of hiddenNodes) restoreStyle(node, "display", record);
      hiddenNodes.clear();
      const anotherSelected = otherSelected();
      for (const [tab, previous] of tabStates) {
        // Selection may have moved without a click. Do not restore a previously
        // selected native tab on top of another plugin's current selection.
        if (selected(tab)) continue;
        if (!anotherSelected || previous.tabindex !== "0") restoreAttribute(tab, "tabindex", previous.tabindex, "-1");
        if (!anotherSelected) {
          if (tab.getAttribute("aria-selected") === "false") {
            if (previous.selected) tab.classList.add("Mui-selected");
            restoreAttribute(tab, "aria-selected", previous.aria, "false");
          }
        }
      }
      tabStates.clear();
      active = null;
    }

    return { show, hide, sync, isActive: () => active !== null };
  }

  return {
    SIDEBAR_ACTIVATION_EVENT,
    enableSidebarTabWheelScrolling,
    disableSidebarTabWheelScrolling,
    createActivationCoordinator,
    createDocumentActivationCoordinator,
    createSelectionController
  };
});
