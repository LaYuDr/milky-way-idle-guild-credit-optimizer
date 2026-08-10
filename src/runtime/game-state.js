(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MwiGuildCreditGameState = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function objectCollection(candidate) {
    return Boolean(candidate && (Array.isArray(candidate) || typeof candidate === "object"));
  }

  function guildShrineLevelRecordKey(record, fallbackKey) {
    if (record && typeof record === "object") {
      const explicitKey = record.guildShrineHrid || record.shrineHrid || record.guildBuildingHrid || record.hrid;
      if (typeof explicitKey === "string" && explicitKey) return explicitKey;
    }
    return String(fallbackKey || "");
  }

  function mergeGuildShrineLevels(previous, incoming) {
    if (!incoming || typeof incoming !== "object") return previous;
    const merged = Object.create(null);
    const append = (source) => {
      const entries = Array.isArray(source)
        ? source.map((record, index) => [guildShrineLevelRecordKey(record, index), record])
        : Object.entries(source || {});
      for (const [fallbackKey, record] of entries) {
        const key = guildShrineLevelRecordKey(record, fallbackKey);
        if (key) merged[key] = record;
      }
    };
    append(previous);
    append(incoming);
    return merged;
  }

  const GUILD_BUILDING_LEVEL_FIELDS = [
    "guildBuildingMap",
    "guildBuildingDict",
    "guildBuildings",
    "guildBuildingLevelMap",
    "guildBuildingLevelDict",
    "guildBuildingLevels"
  ];

  function createGameStateAdapter(state) {
    function setItemDetails(candidate) {
      if (!objectCollection(candidate)) return false;
      if (state.itemDetails !== candidate) state.conversionCache.clear();
      state.itemDetails = candidate;
      return true;
    }

    function setGuildBuffDetails(candidate) {
      if (!objectCollection(candidate)) return false;
      state.guildBuffDetails = candidate;
      return true;
    }

    function setGuildBuffLevels(candidate) {
      if (!objectCollection(candidate)) return false;
      state.guildBuffLevels = candidate;
      return true;
    }

    function setMergedStateField(field, candidate) {
      if (!objectCollection(candidate)) return false;
      state[field] = mergeGuildShrineLevels(state[field], candidate);
      return true;
    }

    function setGuildShrineLevels(candidate) {
      return setMergedStateField("guildShrineLevels", candidate);
    }

    function setGuildShrineDetails(candidate) {
      return setMergedStateField("guildShrineDetails", candidate);
    }

    function setGuildBuildingLevels(candidate) {
      return setMergedStateField("guildBuildingLevels", candidate);
    }

    function setGuildBuildingDetails(candidate) {
      return setMergedStateField("guildBuildingDetails", candidate);
    }

    function setCharacterItems(candidate) {
      if (!Array.isArray(candidate)) return false;
      state.characterItems = candidate;
      return true;
    }

    function setGuildBuffLevelsFrom(source) {
      if (!source || typeof source !== "object") return false;
      return setGuildBuffLevels(
        source.characterGuildBuffMap ||
          source.characterGuildBuffDict ||
          source.characterGuildBuffs ||
          source.characterGuildBuffLevelMap ||
          source.characterGuildBuffLevelDict ||
          source.guildBuffLevelMap ||
          source.guildBuffLevelDict ||
          source.guildBuffLevels ||
          source.guildBuffMap ||
          source.guildBuffDict
      );
    }

    function applyCandidates(source, fields, setter) {
      if (!source || typeof source !== "object") return false;
      let updated = false;
      for (const field of fields) updated = setter(source[field]) || updated;
      return updated;
    }

    function setGuildShrineLevelsFrom(source) {
      return applyCandidates(
        source,
        [
          "guildShrineMap",
          "guildShrineDict",
          "guildShrines",
          "guildShrineLevelMap",
          "guildShrineLevelDict",
          "guildShrineLevels",
          "guildBuildingMap",
          "guildBuildingDict",
          "guildBuildings",
          "guildBuildingLevelMap",
          "guildBuildingLevelDict",
          "guildBuildingLevels"
        ],
        setGuildShrineLevels
      );
    }

    function setGuildShrineDetailsFrom(source) {
      return applyCandidates(
        source,
        [
          "guildShrineDetailMap",
          "guildShrineDetailDict",
          "guildShrineDetails",
          "guildBuildingDetailMap",
          "guildBuildingDetailDict",
          "guildBuildingDetails"
        ],
        setGuildShrineDetails
      );
    }

    function setGuildBuildingLevelsFrom(source) {
      return applyCandidates(source, GUILD_BUILDING_LEVEL_FIELDS, setGuildBuildingLevels);
    }

    function seedCompleteGuildBuildingLevelsFrom(source) {
      if (!source || typeof source !== "object") return false;
      let snapshot = null;
      let found = false;
      for (const field of GUILD_BUILDING_LEVEL_FIELDS) {
        if (!Object.prototype.hasOwnProperty.call(source, field) || !objectCollection(source[field])) continue;
        snapshot = mergeGuildShrineLevels(snapshot, source[field]);
        found = true;
      }
      if (!found) return false;
      // Initialization data is the complete baseline; current-session frames
      // already merged into state take precedence when the snapshot is older.
      state.guildBuildingLevels = mergeGuildShrineLevels(snapshot, state.guildBuildingLevels);
      state.guildBuildingLevelsComplete = true;
      return true;
    }

    function setGuildBuildingDetailsFrom(source) {
      return applyCandidates(
        source,
        ["guildBuildingDetailMap", "guildBuildingDetailDict", "guildBuildingDetails"],
        setGuildBuildingDetails
      );
    }

    return {
      setItemDetails,
      setGuildBuffDetails,
      setGuildBuffLevels,
      setGuildShrineLevels,
      setGuildShrineDetails,
      setGuildBuildingLevels,
      setGuildBuildingDetails,
      setCharacterItems,
      setGuildBuffLevelsFrom,
      setGuildShrineLevelsFrom,
      setGuildShrineDetailsFrom,
      setGuildBuildingLevelsFrom,
      seedCompleteGuildBuildingLevelsFrom,
      setGuildBuildingDetailsFrom
    };
  }

  return { guildShrineLevelRecordKey, mergeGuildShrineLevels, createGameStateAdapter };
});
