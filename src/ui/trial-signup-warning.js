(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MwiGuildTrialSignupWarning = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const MODAL = '[class*="GuildPanel_signupModal__"]';
  const NAME = '[class*="GuildPanel_memberName__"]';
  const MARK = "data-mwi-trial-low-work";

  // Only decorate native signup names. React keeps the original nodes/handlers.
  function create({ document, pageWindow, trialHistoryApi, getRecords, getContext, t }) {
    const marked = new Map();
    let observer = null;
    let frame = null;
    let active = false;
    function restore(node, old) {
      node.removeAttribute(MARK);
      for (const key of ["title", "aria-description"])
        if (node.getAttribute(key) === old.message) {
          if (old[key] === null) node.removeAttribute(key);
          else node.setAttribute(key, old[key]);
        }
    }
    function refresh() {
      frame = null;
      if (!active) return;
      const context = getContext() || {};
      const wanted = new Map();
      for (const modal of document.querySelectorAll(MODAL)) {
        const heading = modal.querySelector('[class*="GuildPanel_name__"]')?.textContent.trim();
        // Resolve the project using the visible native title and known skilling
        // signups. Combat titles never enter this candidate set.
        const projects = [
          ...new Set(Object.values(context.signups || {}).map((s) => s?.signedUpSkillingTrialHrid))
        ].filter((hrid) => hrid && t(`trialName_${hrid.split("/").pop()}`) === heading);
        if (projects.length !== 1) continue;
        const warnings = trialHistoryApi.signupWorkWarnings(getRecords(), context, projects[0]);
        const byName = new Map();
        for (const [id, member] of Object.entries(context.roster || {})) {
          const name = member?.name || context.members?.[id]?.name;
          if (name) byName.set(name, byName.has(name) ? null : id);
        }
        for (const node of modal.querySelectorAll(NAME)) {
          const warning = warnings.get(byName.get(node.textContent.trim()));
          if (warning)
            wanted.set(
              node,
              t("trialSignupLowWork", {
                share: Math.floor(warning.share * 10000) / 10000,
                week: trialHistoryApi.weekNumber(warning.weekStartAt)
              })
            );
        }
      }
      for (const [node, old] of marked) {
        if (wanted.get(node) === old.message) continue;
        restore(node, old);
        marked.delete(node);
      }
      for (const [node, message] of wanted) {
        if (marked.has(node)) continue;
        marked.set(node, {
          title: node.getAttribute("title"),
          "aria-description": node.getAttribute("aria-description"),
          message
        });
        node.setAttribute(MARK, "true");
        node.setAttribute("title", message);
        node.setAttribute("aria-description", message);
      }
    }
    function schedule() {
      if (active && frame === null) frame = pageWindow.requestAnimationFrame(refresh);
    }
    function start() {
      if (active) return;
      active = true;
      observer = new pageWindow.MutationObserver((changes) => {
        if (
          changes.some((change) => {
            const target = change.target.nodeType === 1 ? change.target : change.target.parentElement;
            return (
              target?.closest?.(MODAL) ||
              [...change.addedNodes, ...change.removedNodes].some(
                (node) => node.nodeType === 1 && (node.matches(MODAL) || node.querySelector(MODAL))
              )
            );
          })
        )
          schedule();
      });
      // The development runtime can arrive at document-start, before body exists.
      // Watching the document also catches the initial body and later replacements.
      observer.observe(document, { childList: true, subtree: true, characterData: true });
      refresh();
    }
    function dispose() {
      active = false;
      observer?.disconnect();
      if (frame !== null) pageWindow.cancelAnimationFrame(frame);
      frame = null;
      for (const [node, old] of marked) restore(node, old);
      marked.clear();
    }
    return { start, refresh: schedule, dispose };
  }
  return { create };
});
