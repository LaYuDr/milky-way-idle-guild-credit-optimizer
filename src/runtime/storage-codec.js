(function (root, factory) {
  const api = factory(
    typeof module !== "undefined" && module.exports ? require("../vendor/lz-string.js") : root.MwiGuildStorageLZ
  );
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MwiGuildStorageCodec = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (lz) {
  "use strict";

  const MARKER = "MWIGC:";
  const PREFIX = `${MARKER}1:`;
  const MIN_LENGTH = 4096;
  const MAX_LENGTH = 16 * 1024 * 1024;
  const CACHE_CHARACTERS = 2 * 1024 * 1024;
  const LARGE_CACHE_KEYS = new Set([
    "mwi-guild-credit-live-market-v1",
    "mwi-guild-credit-market-snapshot-v1",
    "mwi-official-item-name-catalog-v1"
  ]);

  function eligible(key) {
    return LARGE_CACHE_KEYS.has(key) || key.startsWith("mwi-guild-trial-history-v1:mwi-guild-building-planner-v1:");
  }

  // Integrity check for accidental corruption, not an authentication mechanism.
  function checksum(text) {
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }

  function decode(value) {
    if (value === null || !value.startsWith(MARKER)) return value;
    if (!value.startsWith(PREFIX)) throw new Error("Unsupported compressed storage version");
    const lengthEnd = value.indexOf(":", PREFIX.length);
    const checksumEnd = value.indexOf(":", lengthEnd + 1);
    const lengthText = value.slice(PREFIX.length, lengthEnd);
    const length = Number(lengthText);
    const expectedChecksum = value.slice(lengthEnd + 1, checksumEnd);
    const data = value.slice(checksumEnd + 1);
    if (
      lengthEnd < 0 ||
      checksumEnd < 0 ||
      !/^[1-9][0-9]*$/.test(lengthText) ||
      !Number.isSafeInteger(length) ||
      length > MAX_LENGTH ||
      !/^[a-f0-9]{8}$/.test(expectedChecksum) ||
      data.length > MAX_LENGTH ||
      !data.length
    )
      throw new Error("Invalid compressed storage header");
    const text = lz.decompressFromUTF16(data, length);
    if (typeof text !== "string" || text.length !== length || checksum(text) !== expectedChecksum)
      throw new Error("Compressed storage integrity check failed");
    return text;
  }

  function encode(text) {
    if (text.length < MIN_LENGTH || text.length > MAX_LENGTH) return text;
    try {
      // Never migrate malformed JSON or non-JSON values merely by reading them.
      JSON.parse(text);
      const encoded = `${PREFIX}${text.length}:${checksum(text)}:${lz.compressToUTF16(text)}`;
      if (encoded.length > text.length * 0.9) return text;
      // Verify the entire original string, including unknown fields and precision,
      // before replacing an existing value with the smaller representation.
      return decode(encoded) === text ? encoded : text;
    } catch (_) {
      return text;
    }
  }

  function createStorage(storage) {
    if (!storage) return storage;
    const cache = new Map();
    let cachedCharacters = 0;
    function remember(key, raw, text) {
      const previous = cache.get(key);
      if (previous) cachedCharacters -= previous.raw.length + previous.text.length;
      cache.delete(key);
      if (
        (raw !== text || (eligible(key) && text.length >= MIN_LENGTH)) &&
        raw.length + text.length <= CACHE_CHARACTERS
      ) {
        cache.set(key, { raw, text });
        cachedCharacters += raw.length + text.length;
      }
      while (cache.size > 64 || cachedCharacters > CACHE_CHARACTERS) {
        const oldest = cache.keys().next().value;
        const value = cache.get(oldest);
        cachedCharacters -= value.raw.length + value.text.length;
        cache.delete(oldest);
      }
    }
    return {
      get length() {
        return storage.length;
      },
      key(index) {
        return storage.key(index);
      },
      getItem(key) {
        const raw = storage.getItem(key);
        if (raw === null || !eligible(key)) return raw;
        const cached = cache.get(key);
        if (cached && cached.raw === raw) {
          cache.delete(key);
          cache.set(key, cached);
          return cached.text;
        }
        const text = decode(raw);
        let saved = raw;
        if (raw === text) {
          const encoded = encode(text);
          if (encoded !== raw) {
            try {
              // LocalStorage replaces one key atomically; no shared references,
              // deletion, extra backup quota or cross-character scan is needed.
              if (storage.getItem(key) === raw) {
                storage.setItem(key, encoded);
                saved = encoded;
              }
            } catch (_) {
              // Readable legacy data stays usable even when migration is blocked.
            }
          }
        }
        remember(key, saved, text);
        return text;
      },
      setItem(key, value) {
        const text = String(value);
        const encoded = eligible(key) ? encode(text) : text;
        // Propagate quota/access failures to the existing save/rollback handling.
        storage.setItem(key, encoded);
        remember(key, encoded, text);
      },
      removeItem(key) {
        storage.removeItem(key);
        remember(key, "", "");
      }
    };
  }

  return { createStorage, encode, decode, eligible, MIN_LENGTH, MAX_LENGTH };
});
