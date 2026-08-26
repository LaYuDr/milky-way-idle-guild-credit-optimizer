(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MwiGuildCreditReleaseInfo = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;
  const DEFAULT_TIMEOUT_MS = 8000;

  function parseUserScriptVersion(source) {
    const match = String(source || "").match(/^\/\/ @version\s+(.+)$/m);
    return (match && match[1].trim()) || null;
  }

  function createVersionChecker(options) {
    const fetchImpl = options && options.fetchImpl;
    const configuredSources = options && Array.isArray(options.sources) ? options.sources : [];
    const sources = configuredSources.length
      ? configuredSources.filter((source) => source && source.url)
      : options && options.url
        ? [{ url: options.url, installUrl: options.url }]
        : [];
    const cacheTtlMs = Number(options && options.cacheTtlMs) || DEFAULT_CACHE_TTL_MS;
    const timeoutMs = Number(options && options.timeoutMs) || DEFAULT_TIMEOUT_MS;
    const setTimer = (options && options.setTimeout) || setTimeout;
    const clearTimer = (options && options.clearTimeout) || clearTimeout;
    const Controller =
      (options && options.AbortController) || (typeof AbortController === "function" ? AbortController : null);
    let cached = null;
    let request = null;

    async function requestSource(source) {
      const controller = Controller ? new Controller() : null;
      let timeout = null;
      try {
        const timeoutPromise = new Promise((_, reject) => {
          timeout = setTimer(() => {
            if (controller) controller.abort();
            reject(new Error("更新检查超时"));
          }, timeoutMs);
        });
        const release = await Promise.race([
          (async () => {
            const response = await fetchImpl(source.url, {
              cache: "no-store",
              signal: controller && controller.signal
            });
            if (!response || !response.ok)
              throw new Error(`更新信息请求失败 (${(response && response.status) || "未知"})`);
            const latestVersion = parseUserScriptVersion(await response.text());
            if (!latestVersion) throw new Error("未找到最新版本号");
            return { latestVersion, installUrl: source.installUrl || source.url };
          })(),
          timeoutPromise
        ]);
        return release;
      } finally {
        if (timeout !== null) clearTimer(timeout);
      }
    }

    async function requestLatestRelease() {
      if (typeof fetchImpl !== "function" || sources.length === 0) throw new Error("更新检查不可用");
      let lastError = null;
      for (const source of sources) {
        try {
          const release = await requestSource(source);
          cached = { release, checkedAt: Date.now() };
          return release;
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError || new Error("更新检查不可用");
    }

    function latestRelease() {
      if (cached && Date.now() - cached.checkedAt < cacheTtlMs) return Promise.resolve(cached.release);
      if (!request)
        request = requestLatestRelease().finally(() => {
          request = null;
        });
      return request;
    }

    function latestVersion() {
      return latestRelease().then((release) => release.latestVersion);
    }

    return { latestRelease, latestVersion };
  }

  return { DEFAULT_CACHE_TTL_MS, DEFAULT_TIMEOUT_MS, parseUserScriptVersion, createVersionChecker };
});
