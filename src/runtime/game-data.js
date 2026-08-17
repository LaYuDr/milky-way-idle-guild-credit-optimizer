(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MwiGuildCreditGameData = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function createGameData(dependencies) {
    const {
      state,
      pageWindow,
      document,
      marketDataApi,
      core,
      setItemDetails,
      setGuildBuffDetails,
      setCharacterItems,
      setGuildBuffLevelsFrom,
      setGuildShrineLevelsFrom,
      setGuildShrineDetailsFrom,
      setGuildBuildingLevelsFrom,
      seedCompleteGuildBuildingLevelsFrom,
      setGuildBuildingDetailsFrom,
      persistLiveMarketData,
      scheduleMarketDataRefresh,
      scheduleInventoryDataRefresh,
      scheduleGuildDataRefresh,
      t,
      resolveItemName,
      CREDIT_TYPES
    } = dependencies;

    function decompressFromUtf16(compressed) {
      if (compressed == null) return "";
      if (compressed === "") return null;
      const dictionary = [0, 1, 2];
      let next;
      let enlargeIn = 4;
      let dictionarySize = 4;
      let numBits = 3;
      let entry = "";
      const result = [];
      let dataValue = compressed.charCodeAt(0) - 32;
      let dataPosition = 16384;
      let dataIndex = 1;

      const readBits = (count) => {
        let value = 0;
        let bit = 1;
        for (let power = 1, maxPower = 1 << count; power !== maxPower; power <<= 1) {
          const residue = dataValue & dataPosition;
          dataPosition >>= 1;
          if (dataPosition === 0) {
            dataPosition = 16384;
            dataValue = dataIndex < compressed.length ? compressed.charCodeAt(dataIndex) - 32 : 0;
            dataIndex += 1;
          }
          if (residue > 0) value |= bit;
          bit <<= 1;
        }
        return value;
      };

      const firstToken = readBits(2);
      if (firstToken === 0) entry = String.fromCharCode(readBits(8));
      else if (firstToken === 1) entry = String.fromCharCode(readBits(16));
      else return "";

      dictionary[3] = entry;
      let previous = entry;
      result.push(entry);

      while (true) {
        if (dataIndex > compressed.length) return "";
        const token = readBits(numBits);
        if (token === 0) {
          dictionary[dictionarySize] = String.fromCharCode(readBits(8));
          dictionarySize += 1;
          enlargeIn -= 1;
          next = dictionarySize - 1;
        } else if (token === 1) {
          dictionary[dictionarySize] = String.fromCharCode(readBits(16));
          dictionarySize += 1;
          enlargeIn -= 1;
          next = dictionarySize - 1;
        } else if (token === 2) {
          return result.join("");
        } else {
          next = token;
        }

        if (enlargeIn === 0) {
          enlargeIn = 1 << numBits;
          numBits += 1;
        }
        if (dictionary[next]) entry = dictionary[next];
        else if (next === dictionarySize) entry = previous + previous.charAt(0);
        else return null;

        result.push(entry);
        dictionary[dictionarySize] = previous + entry.charAt(0);
        dictionarySize += 1;
        enlargeIn -= 1;
        previous = entry;

        if (enlargeIn === 0) {
          enlargeIn = 1 << numBits;
          numBits += 1;
        }
      }
    }

    function hydrateLocalInitData() {
      if (
        state.itemDetails &&
        state.guildBuffDetails &&
        state.guildBuffLevels &&
        state.guildShrineLevels &&
        state.guildBuildingLevels &&
        state.guildBuildingLevelsComplete === true &&
        state.characterItems
      )
        return true;
      let raw;
      try {
        raw = pageWindow.localStorage && pageWindow.localStorage.getItem("initClientData");
      } catch (_) {
        return false;
      }
      if (!raw) return false;
      try {
        const decoded = decompressFromUtf16(raw);
        let data;
        try {
          data = JSON.parse(decoded || raw);
        } catch (_) {
          data = JSON.parse(raw);
        }
        // initClientData is a durable fallback and can outlive a game data update.
        // Never let it overwrite values already captured from the current session.
        const hasItems = !state.itemDetails && setItemDetails(data.itemDetailMap || data.itemDetailDict);
        const hasGuildBuffs =
          !state.guildBuffDetails && setGuildBuffDetails(data.guildBuffDetailMap || data.guildBuffDetailDict);
        const hasGuildBuffLevels =
          !state.guildBuffLevels && (setGuildBuffLevelsFrom(data) || setGuildBuffLevelsFrom(data.character));
        const hasGuildShrineLevels =
          !state.guildShrineLevels && (setGuildShrineLevelsFrom(data) || setGuildShrineLevelsFrom(data.guild));
        const hasGuildShrineDetails =
          !state.guildShrineDetails && (setGuildShrineDetailsFrom(data) || setGuildShrineDetailsFrom(data.guild));
        const hasRootGuildBuildingLevels = seedCompleteGuildBuildingLevelsFrom(data);
        const hasNestedGuildBuildingLevels = seedCompleteGuildBuildingLevelsFrom(data.guild);
        const hasGuildBuildingLevels = hasRootGuildBuildingLevels || hasNestedGuildBuildingLevels;
        const hasGuildBuildingDetails =
          !state.guildBuildingDetails && (setGuildBuildingDetailsFrom(data) || setGuildBuildingDetailsFrom(data.guild));
        const hasCharacterItems =
          !state.characterItems && setCharacterItems(data.characterItems || (data.character && data.character.items));
        return (
          hasItems ||
          hasGuildBuffs ||
          hasGuildBuffLevels ||
          hasGuildShrineLevels ||
          hasGuildShrineDetails ||
          hasGuildBuildingLevels ||
          hasGuildBuildingDetails ||
          hasCharacterItems
        );
      } catch (_) {
        return false;
      }
    }

    function extractItemDetailsFromReact() {
      if (
        state.itemDetails &&
        state.guildBuffDetails &&
        state.guildBuffLevels &&
        state.guildShrineLevels &&
        state.guildBuildingLevels &&
        state.characterItems
      )
        return true;
      const roots = [document.getElementById("root"), document.body].filter(Boolean);
      const visited = new Set();
      const stack = [];
      for (const root of roots) {
        for (const key of Object.keys(root)) {
          if (
            key.startsWith("__reactFiber$") ||
            key.startsWith("__reactContainer$") ||
            key.startsWith("__reactInternalInstance$")
          )
            stack.push(root[key]);
        }
      }
      let scanned = 0;
      let found = false;
      while (stack.length && scanned < 6000) {
        const fiber = stack.pop();
        if (!fiber || typeof fiber !== "object" || visited.has(fiber)) continue;
        visited.add(fiber);
        scanned += 1;
        const stateValue = fiber.stateNode && fiber.stateNode.state;
        const candidates = [fiber.memoizedProps, fiber.pendingProps, stateValue, fiber.memoizedState];
        for (const candidate of candidates) {
          if (!candidate || typeof candidate !== "object") continue;
          found = setItemDetails(candidate.itemDetailMap || candidate.itemDetailDict) || found;
          found = setGuildBuffDetails(candidate.guildBuffDetailMap || candidate.guildBuffDetailDict) || found;
          found = setGuildBuffLevelsFrom(candidate) || found;
          found = setGuildShrineLevelsFrom(candidate) || found;
          found = setGuildShrineDetailsFrom(candidate) || found;
          found = setGuildBuildingLevelsFrom(candidate) || found;
          found = setGuildBuildingDetailsFrom(candidate) || found;
          found = setCharacterItems(candidate.characterItems) || found;
          if (
            state.itemDetails &&
            state.guildBuffDetails &&
            state.guildBuffLevels &&
            state.guildShrineLevels &&
            state.guildBuildingLevels &&
            state.characterItems
          )
            return true;
        }
        // React 18 containers point at a FiberRoot whose active tree is .current.
        if (fiber.current) stack.push(fiber.current);
        if (fiber.stateNode && fiber.stateNode.current) stack.push(fiber.stateNode.current);
        if (fiber.child) stack.push(fiber.child);
        if (fiber.sibling) stack.push(fiber.sibling);
      }
      return found;
    }

    function scanMessage(value, depth) {
      if (!value || typeof value !== "object" || depth > 8) return;
      setItemDetails(value.itemDetailMap || value.itemDetailDict);
      setGuildBuffDetails(value.guildBuffDetailMap || value.guildBuffDetailDict);
      setGuildBuffLevelsFrom(value);
      setGuildShrineLevelsFrom(value);
      setGuildShrineDetailsFrom(value);
      setGuildBuildingLevelsFrom(value);
      setGuildBuildingDetailsFrom(value);
      setCharacterItems(value.characterItems);
      for (const child of Object.values(value)) scanMessage(child, depth + 1);
    }

    function rememberLiveMarketUpdate(update, receivedAt) {
      if (!update) return false;
      const signature = JSON.stringify(update.levels);
      const observedAt = Number(receivedAt);
      if (
        (!Number.isFinite(observedAt) || observedAt <= 0) &&
        state.marketUpdateSignatures[update.itemHrid] === signature
      )
        return false;
      state.marketUpdateSignatures[update.itemHrid] = signature;
      state.marketLiveRevision = Math.min(Number.MAX_SAFE_INTEGER, state.marketLiveRevision + 1);
      const changed = marketDataApi.applyLiveMarketUpdate(state.marketLiveData, update, {
        revision: state.marketLiveRevision,
        receivedAt: observedAt || Date.now(),
        snapshotTimestamp: state.snapshotTimestamp
      });
      if (changed) {
        persistLiveMarketData();
        scheduleMarketDataRefresh();
      }
      return changed;
    }

    function hydrateBridgeData() {
      const bridge = window.__mwiGuildCreditBridge;
      if (!bridge || typeof bridge !== "object") return false;
      let marketChanged = false;
      bridge.onMarketOrderBooksUpdated = hydrateBridgeData;
      bridge.onCharacterItemsUpdated = hydrateBridgeData;
      bridge.onGuildBuffLevelsUpdated = hydrateBridgeData;
      setItemDetails(bridge.itemDetails);
      setGuildBuffDetails(bridge.guildBuffDetails);
      setGuildBuffLevelsFrom(bridge);
      setGuildShrineLevelsFrom(bridge);
      setGuildShrineDetailsFrom(bridge);
      setGuildBuildingLevelsFrom(bridge);
      setGuildBuildingDetailsFrom(bridge);
      const characterItemsRevision = Number(bridge.characterItemsRevision);
      if (Number.isSafeInteger(characterItemsRevision)) {
        if (characterItemsRevision > state.characterItemsBridgeRevision) {
          if (setCharacterItems(bridge.characterItems)) scheduleInventoryDataRefresh();
          state.characterItemsBridgeRevision = characterItemsRevision;
        } else if (!state.characterItems) {
          setCharacterItems(bridge.characterItems);
        }
      } else {
        setCharacterItems(bridge.characterItems);
      }
      const guildBuffLevelsRevision = Number(bridge.guildBuffLevelsRevision);
      if (
        Number.isSafeInteger(guildBuffLevelsRevision) &&
        guildBuffLevelsRevision > state.guildBuffLevelsBridgeRevision
      ) {
        state.guildBuffLevelsBridgeRevision = guildBuffLevelsRevision;
        scheduleGuildDataRefresh();
      }
      const bridgeRevision = Number(bridge.marketOrderBookRevision);
      if (Number.isSafeInteger(bridgeRevision) && bridgeRevision > state.marketBridgeRevision) {
        const records = Object.values(bridge.marketOrderBooks || {})
          .filter((record) => record && Number(record.revision) > state.marketBridgeRevision)
          .sort((left, right) => Number(left.revision) - Number(right.revision));
        for (const record of records) {
          marketChanged = rememberLiveMarketUpdate(record.update, record.receivedAt) || marketChanged;
        }
        state.marketBridgeRevision = bridgeRevision;
      }
      if (Array.isArray(bridge.messages) && bridge.marketObserverActive !== true) {
        const latestMarketUpdates = new Map();
        for (const rawMessage of bridge.messages) {
          try {
            const message = JSON.parse(rawMessage);
            if (String((message && message.type) || "") !== "market_item_order_books_updated") continue;
            const update = marketDataApi.normalizeMarketOrderBooksUpdate(message);
            if (update) latestMarketUpdates.set(update.itemHrid, update);
          } catch (_) {
            // Ignore non-JSON protocol frames.
          }
        }
        for (const update of latestMarketUpdates.values()) {
          marketChanged = rememberLiveMarketUpdate(update) || marketChanged;
        }
      }
      // Current bridges already reconcile characterItems snapshots with
      // endCharacterItems deltas. Only replay raw messages for an older bridge;
      // otherwise an old initialization frame could overwrite the live array.
      if (Array.isArray(bridge.messages) && !Number.isSafeInteger(characterItemsRevision)) {
        for (let index = bridge.messages.length - 1; index >= 0; index -= 1) {
          const rawMessage = bridge.messages[index];
          try {
            const message = JSON.parse(rawMessage);
            scanMessage(message, 0);
          } catch (_) {
            // Ignore non-JSON protocol frames.
          }
        }
      }
      return marketChanged;
    }

    function clearMarketSnapshotCandidate() {
      state.marketSnapshotCandidateSignature = "";
      state.marketSnapshotCandidateTimestamp = 0;
      state.marketSnapshotCandidateConfirmations = 0;
    }

    function confirmMissingMarketSnapshot(marketData, marketTimestamp) {
      const signature = JSON.stringify(marketDataApi.createMarketStructure(marketData));
      const normalizedTimestamp = marketDataApi.normalizeMarketTimestamp(marketTimestamp);
      const matchesCandidate =
        state.marketSnapshotCandidateSignature === signature &&
        normalizedTimestamp >= state.marketSnapshotCandidateTimestamp;
      state.marketSnapshotCandidateSignature = signature;
      state.marketSnapshotCandidateTimestamp = normalizedTimestamp;
      state.marketSnapshotCandidateConfirmations = matchesCandidate
        ? Math.min(2, state.marketSnapshotCandidateConfirmations + 1)
        : 1;
      return state.marketSnapshotCandidateConfirmations >= 2;
    }

    async function loadSnapshot(force) {
      if (state.snapshot && !force) return state.snapshot;
      const liveRevisionAtRequestStart = state.marketLiveRevision;
      const response = await fetch("/game_data/marketplace.json", { cache: "no-store" });
      if (!response.ok) throw new Error(t("snapshotLoadFailed", { message: response.status }));
      const rawSnapshot = await response.json();
      const marketData = marketDataApi.sanitizeMarketData(rawSnapshot && rawSnapshot.marketData);
      if (!Object.keys(marketData).length) throw new Error("Marketplace payload is empty.");
      const snapshot = { ...rawSnapshot, marketData };
      const nextTimestamp = marketDataApi.normalizeMarketTimestamp(snapshot && snapshot.timestamp);
      if (nextTimestamp <= 0) throw new Error("Marketplace payload has no valid timestamp.");
      if (state.snapshotTimestamp > 0 && nextTimestamp > 0 && nextTimestamp < state.snapshotTimestamp) {
        return state.snapshot;
      }
      const confirmedMarketData = state.snapshot && state.snapshot.marketData;
      const missingCount = marketDataApi.countMissingMarketEntries(confirmedMarketData, marketData);
      if (missingCount > 0 && nextTimestamp === state.snapshotTimestamp) {
        clearMarketSnapshotCandidate();
        return state.snapshot;
      }
      if (missingCount > 0 && !confirmMissingMarketSnapshot(marketData, nextTimestamp)) {
        return state.snapshot;
      }
      const reconciliation = marketDataApi.reconcileLiveMarketData(state.marketLiveData, {
        previousSnapshotTimestamp: state.snapshotTimestamp,
        nextSnapshotTimestamp: nextTimestamp,
        coveredRevision: liveRevisionAtRequestStart,
        snapshotData: marketData
      });
      if (reconciliation.changed) {
        state.marketUpdateSignatures = Object.create(null);
        persistLiveMarketData();
      }
      state.snapshot = snapshot;
      state.snapshotTimestamp = nextTimestamp || state.snapshotTimestamp;
      clearMarketSnapshotCandidate();
      return state.snapshot;
    }

    function snapshotOrderBook(itemHrid, reference = state.priceReference) {
      const price = snapshotPrice(itemHrid, reference);
      return price === null ? null : { asks: [{ price, quantity: Number.MAX_SAFE_INTEGER }] };
    }

    function snapshotPrice(itemHrid, field, enhancementLevel = 0) {
      return marketDataApi.resolveMarketPrice(state.snapshot, state.marketLiveData, itemHrid, enhancementLevel, field);
    }

    function snapshotImmediateSellPrice(itemHrid, enhancementLevel = 0) {
      return snapshotPrice(itemHrid, "b", enhancementLevel);
    }

    function allConversions(creditItemHrid) {
      // Prefer data captured from this game session. The persisted init payload is
      // only a fallback, so a previous game version cannot misclassify conversions.
      hydrateBridgeData();
      extractItemDetailsFromReact();
      if (!state.itemDetails) hydrateLocalInitData();
      let conversions = state.conversionCache.get(creditItemHrid);
      if (!conversions) {
        conversions = core.conversionsFromItemDetails(state.itemDetails, creditItemHrid);
        state.conversionCache.set(creditItemHrid, conversions);
      }
      return conversions.flatMap((conversion) => {
        const itemName = resolveItemName(conversion.itemHrid, conversion.itemName);
        if (state.excludeSageItems && core.isSageItemName(itemName, conversion.itemName)) return [];
        return [{ ...conversion, itemName }];
      });
    }

    function creditConversionGroups() {
      return CREDIT_TYPES.map(([creditItemHrid, color]) => ({
        creditItemHrid,
        color,
        conversions: allConversions(creditItemHrid)
      }));
    }

    return {
      hydrateLocalInitData,
      extractItemDetailsFromReact,
      hydrateBridgeData,
      loadSnapshot,
      snapshotOrderBook,
      snapshotPrice,
      snapshotImmediateSellPrice,
      allConversions,
      creditConversionGroups
    };
  }

  return { createGameData };
});
