(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MwiGuildShrinePicker = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  let sequence = 0;
  const chevron =
    '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>';
  const check =
    '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m3 8 3 3 7-7"/></svg>';

  // The hidden select remains the local plan adapter; only these controls receive user input.
  function createManager(host, escapeHtml) {
    const doc = host.ownerDocument;
    const win = doc.defaultView;
    const controls = new WeakMap();
    let opened = null;
    let describe = () => ({});

    function close(restoreFocus = false) {
      if (!opened) return;
      const { trigger, popup, controller, observer } = opened;
      opened = null;
      controller.abort();
      observer.disconnect();
      trigger.setAttribute("aria-expanded", "false");
      popup.remove();
      if (restoreFocus && trigger.isConnected) trigger.focus({ preventScroll: true });
    }

    function open(select, initial = null) {
      close();
      const trigger = controls.get(select);
      if (!trigger || select.disabled || !trigger.isConnected) return;
      const options = [...select.options];
      const popup = doc.createElement("div");
      popup.className = "mwi-shrine-picker-popover";
      popup.id = trigger.getAttribute("aria-controls");
      popup.setAttribute("popover", "auto");
      popup.setAttribute("role", "listbox");
      popup.setAttribute("aria-label", select.getAttribute("aria-label"));
      popup.tabIndex = -1;
      let previousGroup = null;
      let groupNode = popup;
      options.forEach((option, index) => {
        const group = option.parentElement.tagName === "OPTGROUP" ? option.parentElement : null;
        if (group !== previousGroup) {
          previousGroup = group;
          groupNode = doc.createElement("div");
          groupNode.setAttribute("role", "group");
          const heading = doc.createElement("div");
          heading.className = "mwi-shrine-picker-group";
          heading.id = `${popup.id}-group-${index}`;
          heading.textContent = group.label;
          groupNode.setAttribute("aria-labelledby", heading.id);
          groupNode.append(heading);
          popup.append(groupNode);
        }
        const item = doc.createElement("div");
        const details = describe(select, option);
        item.id = `${popup.id}-option-${index}`;
        item.className = "mwi-shrine-picker-option";
        item.dataset.optionIndex = String(index);
        item.setAttribute("role", "option");
        item.setAttribute("aria-selected", String(option.selected));
        item.setAttribute("aria-disabled", String(option.disabled || group?.disabled || false));
        item.setAttribute("aria-labelledby", `${item.id}-name`);
        if (details.description || details.reason) item.setAttribute("aria-describedby", `${item.id}-description`);
        item.innerHTML = `${details.icon ? `<span class="mwi-shrine-picker-icon" aria-hidden="true">${details.icon}</span>` : ""}<span class="mwi-shrine-picker-copy"><span id="${item.id}-name">${escapeHtml(option.textContent)}</span>${details.description || details.reason ? `<small id="${item.id}-description">${escapeHtml([details.description, details.reason].filter(Boolean).join(" · "))}</small>` : ""}</span><span class="mwi-shrine-picker-check">${option.selected ? check : ""}</span>`;
        groupNode.append(item);
      });
      doc.body.append(popup);
      const controller = new win.AbortController();
      const observer = new win.MutationObserver(() => {
        if (!trigger.isConnected || !trigger.getClientRects().length) close();
      });
      const events = { signal: controller.signal };
      const items = [...popup.querySelectorAll('[role="option"]')];
      const enabled = items.filter((item) => item.getAttribute("aria-disabled") !== "true");
      let activeIndex = -1;
      let typed = "";
      let typedAt = 0;
      function activate(item) {
        if (!item || !enabled.includes(item)) return;
        items[activeIndex]?.removeAttribute("data-active");
        activeIndex = items.indexOf(item);
        item.dataset.active = "true";
        popup.setAttribute("aria-activedescendant", item.id);
        item.scrollIntoView({ block: "nearest" });
      }
      function choose(item) {
        if (!enabled.includes(item)) return;
        const value = options[Number(item.dataset.optionIndex)].value;
        close(true);
        if (value === select.value) return;
        select.value = value;
        select.dispatchEvent(new win.Event("change", { bubbles: true }));
      }
      function position() {
        if (!trigger.isConnected || !trigger.getClientRects().length) return close();
        const rect = trigger.getBoundingClientRect();
        const panel = host.closest("#mwi-credit-optimizer").getBoundingClientRect();
        const width = Math.min(
          select.dataset.role === "plan-buff" ? Math.max(rect.width, 280) : Math.max(rect.width, 144),
          panel.width - 24,
          win.innerWidth - 16
        );
        popup.style.width = `${width}px`;
        popup.style.left = `${Math.max(8, Math.min(rect.left, panel.right - width - 12, win.innerWidth - width - 8))}px`;
        const below = win.innerHeight - rect.bottom - 12;
        const above = rect.top - 12;
        const upwards = below < Math.min(300, popup.scrollHeight) && above > below;
        popup.style.maxHeight = `${Math.max(80, Math.min(420, upwards ? above : below))}px`;
        popup.style.top = `${upwards ? Math.max(8, rect.top - popup.getBoundingClientRect().height - 6) : rect.bottom + 6}px`;
      }
      opened = { select, trigger, popup, controller, observer };
      trigger.setAttribute("aria-expanded", "true");
      if (typeof popup.showPopover === "function") popup.showPopover();
      else popup.dataset.fallback = "true";
      position();
      popup.focus({ preventScroll: true });
      activate(
        items.find((item, index) => options[index].value === initial) || items[select.selectedIndex] || enabled[0]
      );
      if (activeIndex < 0) activate(enabled[0]);
      popup.addEventListener("click", (event) => choose(event.target.closest('[role="option"]')), events);
      popup.addEventListener("pointermove", (event) => activate(event.target.closest('[role="option"]')), events);
      popup.addEventListener(
        "keydown",
        (event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            close(true);
          } else if (event.key === "Tab") {
            close(true); // Native Tab proceeds from the trigger to the next/previous field.
          } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
            event.preventDefault();
            const index = enabled.indexOf(items[activeIndex]);
            const next =
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? enabled.length - 1
                  : (index + (event.key === "ArrowDown" ? 1 : -1) + enabled.length) % enabled.length;
            activate(enabled[next]);
          } else if (["Enter", " "].includes(event.key)) {
            event.preventDefault();
            choose(items[activeIndex]);
          } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
            const now = Date.now();
            typed = now - typedAt > 700 ? event.key : typed + event.key;
            typedAt = now;
            const query = typed.toLocaleLowerCase();
            activate(
              enabled.find((item) =>
                (select.dataset.role !== "plan-buff"
                  ? options[Number(item.dataset.optionIndex)].value
                  : options[Number(item.dataset.optionIndex)].textContent
                )
                  .trim()
                  .toLocaleLowerCase()
                  .startsWith(query)
              )
            );
          }
        },
        events
      );
      popup.addEventListener(
        "toggle",
        (event) => {
          if (event.newState === "closed" && opened?.popup === popup) close();
        },
        events
      );
      doc.addEventListener(
        "pointerdown",
        (event) => {
          if (!popup.contains(event.target) && !trigger.contains(event.target)) close();
        },
        events
      );
      doc.addEventListener(
        "scroll",
        (event) => {
          if (!popup.contains(event.target)) close();
        },
        { ...events, capture: true }
      );
      win.addEventListener("resize", position, events);
      observer.observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });
    }

    function capture() {
      const active = doc.activeElement;
      const select = opened?.select || (active?.dataset?.pickerRole ? active.previousElementSibling : null);
      if (!select || !host.contains(select)) return null;
      return {
        plan: select.closest("[data-plan-id]").dataset.planId,
        role: select.dataset.role,
        open: Boolean(opened)
      };
    }

    function sync(description, snapshot, replaced) {
      describe = description;
      if (replaced) close();
      for (const select of host.querySelectorAll(
        'select[data-role="plan-buff"],select[data-role="plan-start"],select[data-role="plan-target"]'
      )) {
        let trigger = controls.get(select);
        if (!trigger) {
          select.hidden = true;
          select.tabIndex = -1;
          trigger = doc.createElement("button");
          trigger.type = "button";
          trigger.className = "mwi-shrine-picker-trigger";
          trigger.dataset.pickerRole = select.dataset.role;
          trigger.setAttribute("role", "combobox");
          trigger.setAttribute("aria-haspopup", "listbox");
          trigger.setAttribute("aria-expanded", "false");
          trigger.setAttribute("aria-controls", `mwi-shrine-picker-${++sequence}`);
          select.after(trigger);
          controls.set(select, trigger);
          trigger.addEventListener("click", () => (opened?.select === select ? close(true) : open(select)));
          trigger.addEventListener("keydown", (event) => {
            if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
              event.preventDefault();
              const enabled = [...select.options].filter((option) => !option.disabled);
              open(
                select,
                event.key === "Home" ? enabled[0]?.value : event.key === "End" ? enabled.at(-1)?.value : null
              );
            }
          });
        }
        trigger.disabled = select.disabled;
        const label = select.getAttribute("aria-label");
        const value = select.selectedOptions[0]?.textContent || "";
        trigger.setAttribute("aria-label", `${label}: ${value}`);
        trigger.innerHTML = `<span>${escapeHtml(value)}</span>${chevron}`;
      }
      if (snapshot && replaced) {
        const row = [...host.querySelectorAll("[data-plan-id]")].find((node) => node.dataset.planId === snapshot.plan);
        const select = [...(row?.querySelectorAll("select[data-role]") || [])].find(
          (node) => node.dataset.role === snapshot.role
        );
        if (select) {
          controls.get(select)?.focus({ preventScroll: true });
          if (snapshot.open) open(select);
        }
      }
    }
    return { capture, sync };
  }
  return { createManager };
});
