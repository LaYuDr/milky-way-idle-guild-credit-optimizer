(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MwiGuildUpgradePlanning = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const requestEvent = "mwi:guild-upgrade-planning:request:v1";
  const responseEvent = "mwi:guild-upgrade-planning:response:v1";
  const allowed = /^\/guild_buffs\/(tempo|scholar)_(skilling|life)$/;
  const clone = (value) => JSON.parse(JSON.stringify(value));
  function create({ core, capture, owner, hostname, now = Date.now, version = "" }) {
    let sequence = 0;
    const snapshots = new Map();
    const checkOwner = (id) => Number.isSafeInteger(id) && id > 0 && owner() === id;
    async function take(characterId) {
      const source = await capture();
      if (!checkOwner(characterId)) throw Error("character_mismatch");
      if (!source || !Array.isArray(source.shrines)) throw Error("rules_unavailable");
      const id = `guild-plan-${now()}-${++sequence}`;
      const snapshot = clone({
        ...source,
        id,
        characterId,
        host: hostname,
        schemaVersion: 1,
        providerVersion: version,
        capturedAt: now()
      });
      snapshots.set(id, snapshot);
      if (snapshots.size > 4) snapshots.delete(snapshots.keys().next().value);
      return clone(snapshot);
    }
    function quote({ snapshotId, characterId, plans, inventory = {} }) {
      const snapshot = snapshots.get(snapshotId);
      if (!snapshot || !checkOwner(characterId) || snapshot.characterId !== characterId)
        throw Error("snapshot_unavailable");
      if (
        !Array.isArray(plans) ||
        plans.length < 1 ||
        plans.length > 2 ||
        new Set(plans.map((p) => p.hrid)).size !== plans.length
      )
        throw Error("invalid_plans");
      const inputs = plans.map((p) => {
        const shrine = snapshot.shrines.find((s) => s.hrid === p.hrid);
        if (
          !allowed.test(p.hrid) ||
          !shrine ||
          !Number.isInteger(p.start) ||
          !Number.isInteger(p.target) ||
          p.start < shrine.level ||
          p.target > shrine.maxLevel ||
          p.target <= p.start
        )
          throw Error("invalid_levels");
        return {
          guildBuffHrid: p.hrid,
          startLevel: p.start,
          targetLevel: p.target,
          levelCosts: shrine.detail.levelCosts
        };
      });
      if (
        !inventory ||
        typeof inventory !== "object" ||
        Array.isArray(inventory) ||
        Object.keys(inventory).length > 512 ||
        Object.entries(inventory).some(
          ([k, v]) => !/^\/items\/[a-z0-9_]+$/.test(k) || typeof v !== "number" || !Number.isFinite(v) || v < 0
        )
      )
        throw Error("invalid_inventory");
      const aggregate = core.aggregateGuildBuffPlans(inputs);
      if (aggregate.status !== "ok") return { status: aggregate.status };
      // A full-resource quote and an inventory-aware cash quote share the same
      // core and selected conversion policy. Never derive total cost from a shortage.
      const options = {
        guildTokenCreditHrids: snapshot.policy.tokenCreditHrids,
        guildTokenCreditConversions: snapshot.exchangeRules,
        autoAllocateSurplusGuildTokens: false
      };
      const total = core.estimateGuildUpgradeCosts(aggregate.totals, snapshot.unitCosts, {}, options);
      const cash = core.estimateGuildUpgradeCosts(aggregate.totals, snapshot.unitCosts, inventory, options);
      return clone({
        status: total.status,
        total,
        cash,
        demands: aggregate.totals,
        effects: inputs.map((p) =>
          core.guildBuffUpgradePreview(
            snapshot.shrines.find((s) => s.hrid === p.guildBuffHrid).detail,
            p.startLevel,
            p.targetLevel
          )
        )
      });
    }
    return Object.freeze({ take, quote });
  }
  function install(target, provider) {
    const reply = (id, result, error = null) =>
      target.dispatchEvent(new target.CustomEvent(responseEvent, { detail: JSON.stringify({ id, result, error }) }));
    const listener = (event) => {
      let r;
      try {
        if (typeof event.detail !== "string" || event.detail.length > 100000) return;
        r = JSON.parse(event.detail);
      } catch (_) {
        return;
      }
      if (!r || typeof r.id !== "string" || !/^[a-z0-9-]{1,100}$/.test(r.id)) return;
      if (r.action === "capture")
        provider.take(r.characterId).then(
          (result) => reply(r.id, result),
          (e) => reply(r.id, null, e.message)
        );
      else if (r.action === "quote") {
        try {
          reply(r.id, provider.quote(r));
        } catch (e) {
          reply(r.id, null, e.message);
        }
      }
    };
    target.addEventListener(requestEvent, listener);
    return () => target.removeEventListener(requestEvent, listener);
  }
  return { create, install, requestEvent, responseEvent };
});
