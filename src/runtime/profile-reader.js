(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MwiGuildProfileReader = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const keyFor = (name) => (typeof name === "string" ? name.trim().toLowerCase() : "");
  function profileIdentity(profile) {
    const character = profile?.sharableCharacter || {};
    const skills = Object.values(profile?.characterSkills || {});
    const id =
      character.id ??
      character.characterId ??
      profile?.characterId ??
      skills.find((skill) => skill?.characterId != null)?.characterId;
    return {
      id: id == null ? null : String(id),
      name: character.name || profile?.characterName || profile?.name || ""
    };
  }

  function createReader({ getController, setTimeout, clearTimeout }) {
    const cache = new Map();
    const hooks = new Map();
    const notify = (entry, result) => {
      for (const listener of entry.listeners) {
        try {
          listener(result);
        } catch (_) {
          /* Optional UI must not interrupt the game. */
        }
      }
    };
    function restore(controller, hook) {
      if (hook.pending.size) return;
      if (controller.setState === hook.intercept) {
        if (hook.own) controller.setState = hook.original;
        else delete controller.setState;
      }
      hooks.delete(controller);
    }
    function remember(profile) {
      const key = keyFor(profileIdentity(profile).name);
      if (!key) return;
      cache.delete(key);
      cache.set(key, profile);
      if (cache.size > 50) cache.delete(cache.keys().next().value);
    }
    function hookController(controller) {
      if (hooks.has(controller)) return hooks.get(controller);
      const hook = { pending: new Map(), original: controller.setState, own: Object.hasOwn(controller, "setState") };
      hook.intercept = function (update, callback) {
        // The official profile_shared handler supplies this object. All unrelated
        // and functional state updates pass through unchanged.
        const profile = update && typeof update === "object" ? update.sharableProfile : null;
        const key = keyFor(profileIdentity(profile).name);
        const entry = profile && hook.pending.get(key);
        if (!entry) return hook.original.apply(this, arguments);
        hook.pending.delete(key);
        clearTimeout(entry.timeout);
        clearTimeout(entry.cleanup);
        remember(profile);
        const rest = { ...update };
        delete rest.sharableProfile;
        delete rest.sharableGuildProfile;
        restore(controller, hook);
        if (Object.keys(rest).length) hook.original.call(this, rest, callback);
        else if (typeof callback === "function") callback.call(this);
        notify(entry, { status: "ready", profile });
      };
      controller.setState = hook.intercept;
      if (controller.setState !== hook.intercept) return null;
      hooks.set(controller, hook);
      return hook;
    }
    function request(name, listener, force = false) {
      const characterName = typeof name === "string" ? name.trim() : "";
      if (
        !characterName ||
        characterName.length > 64 ||
        /[\u0000-\u001f\u007f]/.test(characterName) ||
        typeof listener !== "function"
      )
        return false;
      const key = keyFor(characterName);
      try {
        const controller = getController();
        const pending = hooks.get(controller)?.pending.get(key);
        if (pending && !(force && pending.timedOut)) {
          pending.listeners.add(listener);
          if (pending.timedOut) listener({ status: "timeout" });
          return true;
        }
        if (!force) {
          const current = controller?.state?.sharableProfile;
          if (!cache.has(key) && keyFor(profileIdentity(current).name) === key) remember(current);
          if (cache.has(key)) {
            listener({ status: "ready", profile: cache.get(key) });
            return true;
          }
        }
        if (!controller || typeof controller.setState !== "function") return false;
        const hook = hookController(controller);
        if (!hook) return false;
        const previous = hook.pending.get(key);
        if (previous) {
          clearTimeout(previous.timeout);
          clearTimeout(previous.cleanup);
        }
        const entry = { listeners: new Set([listener]) };
        hook.pending.set(key, entry);
        entry.timeout = setTimeout(() => {
          entry.timedOut = true;
          notify(entry, { status: "timeout" });
        }, 15000);
        // A late response from our request must not flash a native modal. Keep a
        // bounded grace period, then restore the controller even if no reply arrives.
        entry.cleanup = setTimeout(() => {
          clearTimeout(entry.timeout);
          hook.pending.delete(key);
          restore(controller, hook);
        }, 60000);
        try {
          controller.handleViewProfile(characterName);
        } catch (_) {
          entry.timedOut = true;
          notify(entry, { status: "unavailable" });
        }
        return true;
      } catch (_) {
        return false;
      }
    }
    function dispose() {
      for (const [controller, hook] of hooks) {
        for (const entry of hook.pending.values()) {
          clearTimeout(entry.timeout);
          clearTimeout(entry.cleanup);
        }
        hook.pending.clear();
        restore(controller, hook);
      }
      cache.clear();
    }
    return { request, dispose };
  }
  return { createReader, profileIdentity };
});
