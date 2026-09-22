(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MwiGuildProfileTooltips = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function componentClass(type) {
    const seen = new Set();
    while (type && !seen.has(type)) {
      seen.add(type);
      if (type.prototype?.render) return type;
      type = type.WrappedComponent || type.type;
    }
    return null;
  }

  function findElement(tree, predicate) {
    const pending = [tree];
    while (pending.length) {
      const element = pending.pop();
      if (Array.isArray(element)) pending.push(...element);
      else if (element && typeof element === "object") {
        if (predicate(element)) return element;
        pending.push(element.props?.children);
      }
    }
    return null;
  }

  // Reuse the installed game's renderers, never copy its XP/strengthening/effect formulas.
  // Unwrap only the native profile's read-only components, with fresh explicit props.
  function tooltipContent(controller, profile, kind, record) {
    if (typeof controller?.renderSharableProfile !== "function" || typeof controller.props?.t !== "function")
      return null;
    const copy = {
      ...profile,
      characterSkills: Object.values(profile.characterSkills || {}).map((entry) => ({ ...entry })),
      equippedAbilities: Object.values(profile.equippedAbilities || {}).map((entry) => ({ ...entry }))
    };
    const element = controller.renderSharableProfile.call({ state: { sharableProfile: copy } });
    const Profile = componentClass(element?.type);
    if (!Profile) return null;
    const props = { profile: copy, t: controller.props.t };
    const instance = new Profile(props);
    let tree;
    if (kind === "skill") tree = instance.renderSkillsTab?.();
    else if (kind === "item" || kind === "ability") tree = instance.renderEquipmentTab?.();
    else return null;
    const field = { skill: "skillHrid", item: "itemHrid", ability: "abilityHrid" }[kind];
    const template = findElement(tree, (entry) => entry.props?.[field] === record[field]);
    const Component = componentClass(template?.type);
    if (!Component) return null;
    const nativeProps = { ...template.props, ...record, t: props.t };
    // Never inherit action handlers or player equipment state from a live component.
    for (const key of Object.keys(nativeProps)) if (/Handler$/.test(key)) delete nativeProps[key];
    const native = new Component(nativeProps);
    if (kind === "skill") return native.renderTooltipContent?.() || null;
    if (kind === "ability") return native.renderTooltip?.() || null;
    const tooltip = findElement(native.render(), (entry) => entry.props?.itemHrid === record.itemHrid);
    const Tooltip = componentClass(tooltip?.type);
    return Tooltip ? new Tooltip({ ...tooltip.props, t: props.t }).renderTooltipContent?.() || null : null;
  }

  function createRenderer({ page, getController }) {
    let reactDOM = null;
    const mounted = new Set();
    function resolveReactDOM() {
      if (reactDOM) return reactDOM;
      const queue = page.webpackJsonprpg_web;
      if (!Array.isArray(queue) || queue.push === Array.prototype.push) return null;
      // Webpack 4 exposes no public require. Register one isolated local module to
      // inspect already-loaded exports; do not execute or replace any game module.
      const id = `mwi-profile-tooltip-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      let runtime;
      queue.push([
        [],
        {
          [id]: (_module, _exports, require) => {
            runtime = require;
          }
        },
        [[id]]
      ]);
      if (!runtime) return null;
      try {
        for (const module of Object.values(runtime.c || {})) {
          const value = module?.exports;
          if (typeof value?.render === "function" && typeof value?.unmountComponentAtNode === "function") {
            reactDOM = value;
            break;
          }
        }
      } finally {
        delete runtime.c?.[id];
        delete runtime.m?.[id];
      }
      return reactDOM;
    }
    function clear(container) {
      if (!mounted.delete(container)) return;
      try {
        reactDOM?.unmountComponentAtNode(container);
      } catch (_) {
        /* Optional tooltip. */
      }
    }
    function render(container, profile, kind, record) {
      clear(container);
      try {
        const content = tooltipContent(getController(), profile, kind, record);
        const renderer = content && resolveReactDOM();
        if (!renderer) return false;
        mounted.add(container);
        renderer.render(content, container);
        return true;
      } catch (_) {
        clear(container);
        return false;
      }
    }
    function dispose() {
      for (const container of mounted) clear(container);
    }
    return { render, clear, dispose };
  }
  return { componentClass, tooltipContent, createRenderer };
});
