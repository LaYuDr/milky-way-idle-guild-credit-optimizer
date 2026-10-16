#!/usr/bin/env node
/* global document, innerWidth */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

// All documents and GM requests are fixtures. Never connects to a game or stats service.
const directory = fs.mkdtempSync(path.resolve(".workbench/browser-usage-"));
const bundle = fs.readFileSync("dist/milky-way-idle-guild-credit-optimizer.user.js", "utf8");
const code = bundle.split("// LAYU_USAGE_START mwi_guild\n")[1]?.split("// LAYU_USAGE_END mwi_guild")[0];
assert.ok(code, "production telemetry block required");
const cases = [
  ...[320, 360, 420, 460, 480, 520, 560, 610, 720, 900, 1200].map((width) => ({ locale: "zh-CN", width })),
  ...[320, 610, 900].map((width) => ({ locale: "en-US", width }))
];
const adapter = () => {
  if (globalThis.location.origin !== "https://www.milkywayidle.com") return;
  const listeners = new Map();
  let serial = 0;
  globalThis.usageRequests = [];
  globalThis.holdUsageRequests = localStorage.getItem("__fixture_hold") === "true";
  globalThis.GM_getValue = (key, fallback) => {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  };
  globalThis.GM_setValue = (key, value) => {
    if (globalThis.failUsageSave) throw Error("fixture storage failure");
    const old = globalThis.GM_getValue(key);
    localStorage.setItem(key, JSON.stringify(value));
    for (const [watch, callback] of listeners.values()) if (key === watch) callback(key, old, value, false);
  };
  globalThis.GM_addValueChangeListener = (key, callback) => {
    listeners.set(++serial, [key, callback]);
    return serial;
  };
  globalThis.GM_removeValueChangeListener = (id) => listeners.delete(id);
  globalThis.addEventListener("storage", (event) => {
    for (const [key, callback] of listeners.values())
      if (key === event.key) callback(key, JSON.parse(event.oldValue), JSON.parse(event.newValue), true);
  });
  globalThis.GM_xmlhttpRequest = (request) => {
    if (request.anonymous !== true || request.redirect !== "error") throw Error("unsafe request flags");
    globalThis.usageRequests.push({ url: request.url, body: JSON.parse(request.data) });
    if (globalThis.holdUsageRequests && request.url.endsWith("/heartbeat")) {
      return {
        abort() {
          globalThis.usageAborts = (globalThis.usageAborts || 0) + 1;
          request.onabort();
        }
      };
    }
    queueMicrotask(() => {
      if (globalThis.failUsageRequests) request.onerror();
      else request.onload({ status: 200, responseText: '{"ok":true}', finalUrl: request.url });
    });
    return {
      abort() {
        request.onabort();
      }
    };
  };
};
const browser = await chromium.launch({ channel: "chrome", headless: true });
const results = [];
try {
  for (const entry of cases) {
    const context = await browser.newContext({ locale: entry.locale, viewport: { width: entry.width, height: 1000 } });
    const page = await context.newPage();
    const errors = [];
    context.on("page", (p) => p.on("pageerror", (error) => errors.push(error.message)));
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("dialog", async (dialog) => {
      errors.push("unexpected dialog");
      await dialog.dismiss();
    });
    await context.route("**/*", (route) =>
      route.request().url() === "https://www.milkywayidle.com/"
        ? route.fulfill({
            contentType: "text/html",
            body: `<!doctype html><html lang="${entry.locale}"><meta charset="utf-8"><style>body{margin:0;background:#24273b;color:#edf0fa;font:14px system-ui}main{padding:12px}</style><main><div data-layu-usage-settings="mwi_guild" lang="${entry.locale}"></div></main></html>`
          })
        : route.abort()
    );
    await context.addInitScript(adapter);
    const start = async (target) => {
      await target.goto("https://www.milkywayidle.com/");
      await target.addScriptTag({ content: code });
      await target.locator('[data-action="toggle"]').waitFor();
    };
    const host = page.locator('[data-layu-usage-settings="mwi_guild"]');
    const toggle = host.locator('[data-action="toggle"]');
    const requests = () => page.evaluate(() => globalThis.usageRequests);
    await start(page);
    await page.waitForFunction(() => localStorage.getItem("layu_usage_v1_mwi_guild_day") !== null);
    assert.equal((await requests()).length, 1);
    assert.deepEqual(Object.keys((await requests())[0].body), ["plugin_id", "installation_hash", "version"]);
    assert.equal(await toggle.getAttribute("aria-pressed"), "true");
    await toggle.evaluate((node) => node.click());
    assert.equal((await requests()).length, 1, "synthetic clicks cannot change preference");
    await page.evaluate(() => {
      globalThis.failUsageSave = true;
    });
    await toggle.click();
    await host
      .locator(".status")
      .filter({ hasText: /设置未保存|Settings were not saved/ })
      .waitFor();
    assert.equal((await requests()).length, 1);
    assert.equal(await toggle.getAttribute("aria-pressed"), "true");
    await page.evaluate(() => {
      globalThis.failUsageSave = false;
      globalThis.failUsageRequests = true;
    });
    const second = await context.newPage();
    await start(second);
    await toggle.click();
    await page.waitForFunction(() => localStorage.getItem("layu_usage_v1_mwi_guild_consent") === "false");
    await second.waitForFunction(
      () =>
        document
          .querySelector("[data-layu-usage-settings]")
          .shadowRoot.querySelector('[data-action="toggle"]')
          .getAttribute("aria-pressed") === "false"
    );
    assert.equal(
      (await second.evaluate(() => globalThis.usageRequests)).length,
      0,
      "remote disable sends no extra event"
    );
    await second.close();
    assert.equal((await requests()).length, 2);
    assert.ok((await requests())[1].url.endsWith("/v1/opt-out"));
    assert.deepEqual((await requests())[1].body, {
      plugin_id: "mwi_guild",
      version: /@version\s+(\S+)/.exec(bundle)[1]
    });
    await page.evaluate(() => {
      globalThis.dispatchEvent(new Event("online"));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    assert.equal((await requests()).length, 2, "failed opt-out must not retry");
    await start(page);
    assert.equal((await requests()).length, 0, "saved off survives reload without reporting");
    await toggle.click();
    assert.equal(await host.locator(".confirm").isVisible(), true);
    assert.equal(await host.locator("details").getAttribute("open"), "");
    if (entry.width === 320)
      await page.screenshot({ path: path.join(directory, `${entry.locale}-320.png`), fullPage: true });
    const geometry = await host.evaluate((node) => {
      const nodes = [...node.shadowRoot.querySelectorAll("p,button,summary,strong")].filter(
        (item) => item.getBoundingClientRect().width
      );
      return {
        overflow: document.documentElement.scrollWidth > innerWidth,
        clipped: nodes.some((item) => item.scrollWidth > item.clientWidth + 1),
        buttonHeights: nodes
          .filter((item) => item.tagName === "BUTTON")
          .map((item) => item.getBoundingClientRect().height)
      };
    });
    assert.equal(geometry.overflow, false);
    assert.equal(geometry.clipped, false);
    assert.ok(geometry.buttonHeights.every((height) => height >= 32));
    await host.locator('[data-action="cancel"]').click();
    assert.equal((await requests()).length, 0);
    await toggle.click();
    await host.locator('[data-action="confirm"]').click();
    await page.waitForFunction(() => localStorage.getItem("layu_usage_v1_mwi_guild_consent") === "true");
    assert.equal(await toggle.getAttribute("aria-pressed"), "true");
    assert.equal((await requests()).length, 0, "same-day enable does not duplicate heartbeat");
    // A pending heartbeat is aborted on disable; the distinct opt-out request survives off-state rendering.
    await page.evaluate(() => {
      localStorage.removeItem("layu_usage_v1_mwi_guild_day");
      localStorage.setItem("__fixture_hold", "true");
    });
    await start(page);
    await page
      .waitForFunction(() => globalThis.usageRequests.length === 1, null, { timeout: 5000 })
      .catch(async () => {
        throw Error(
          "held heartbeat missing: " +
            JSON.stringify(
              await page.evaluate(() => ({
                requests: globalThis.usageRequests,
                hold: globalThis.holdUsageRequests,
                storage: { ...localStorage }
              }))
            )
        );
      });
    await toggle.click();
    await page
      .waitForFunction(() => globalThis.usageAborts === 1 && globalThis.usageRequests.length === 2, null, {
        timeout: 5000
      })
      .catch(async () => {
        throw Error(
          "disable cancellation missing: " +
            JSON.stringify(
              await page.evaluate(() => ({
                requests: globalThis.usageRequests,
                aborts: globalThis.usageAborts,
                storage: { ...localStorage }
              }))
            )
        );
      });
    assert.equal(await toggle.getAttribute("aria-pressed"), "false");
    assert.deepEqual(errors, []);
    results.push({ ...entry, passed: true, geometry });
    console.log(`PASS usage/${entry.locale}/${entry.width}`);
    await context.close();
  }
} finally {
  await browser.close();
  fs.writeFileSync(
    path.join(directory, "matrix.json"),
    JSON.stringify({ passed: results.length === cases.length, results }, null, 2) + "\n"
  );
  console.log(`Usage fixtures: ${results.length}/${cases.length}; ${directory}`);
}
