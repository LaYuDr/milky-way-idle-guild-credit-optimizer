const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createUsageClient } = require("../src/runtime/usage-client.js");
const { webcrypto } = require("node:crypto");

function fixture(options = {}) {
  const values = new Map();
  const requests = [];
  let time = Date.parse("2026-10-14T04:00:00Z");
  let fail = false;
  const client = createUsageClient({
    pluginId: "mwi_guild",
    version: "1.0",
    endpoint: "https://stats.example",
    ...options,
    crypto: webcrypto,
    now: () => time,
    getValue: async (k, d) => (values.has(k) ? values.get(k) : d),
    setValue: async (k, v) => values.set(k, v),
    request: async (r) => {
      requests.push(r);
      if (fail) throw Error("offline");
      return { status: 200, responseText: '{"ok":true}' };
    }
  });
  return {
    client,
    values,
    requests,
    advance: (n) => (time += n),
    fail: (v) => (fail = v)
  };
}

test("requires explicit opt-in; sends hash only and deduplicates same day", async () => {
  const f = fixture();
  assert.equal(await f.client.report(), false);
  assert.equal(f.requests.length, 0);
  await f.client.setEnabled(true);
  assert.equal(await f.client.report(), true);
  const body = JSON.parse(f.requests[0].data);
  assert.deepEqual(Object.keys(body), ["plugin_id", "installation_hash", "version"]);
  assert.match(body.installation_hash, /^[0-9a-f]{64}$/);
  assert.equal(f.requests[0].anonymous, true);
  assert.equal(f.requests[0].url, "https://stats.example/v1/heartbeat");
  f.advance(3600000);
  assert.equal(await f.client.report(), false);
  f.advance(86400000);
  assert.equal(await f.client.report(), true);
  assert.equal(JSON.parse(f.requests[1].data).installation_hash, body.installation_hash);
  await f.client.setEnabled(false);
  f.advance(86400000);
  assert.equal(await f.client.report(), false);
});

test("offline retry is bounded and failed requests never mark day successful", async () => {
  const f = fixture();
  await f.client.setEnabled(true);
  f.fail(true);
  assert.equal(await f.client.report(), false);
  await f.client.report();
  assert.equal(f.requests.length, 1);
  assert.equal(f.values.has("layu_usage_v1_mwi_guild_day"), false);
  f.advance(300000);
  f.fail(false);
  assert.equal(await f.client.report(), true);
});

test("default-on policy creates one installation and respects a saved opt-out on upgrade", async () => {
  const f = fixture({ defaultEnabled: true, reportOptOut: true });
  assert.equal(await f.client.enabled(), true);
  assert.equal(await f.client.report(), true);
  assert.equal(f.requests.length, 1);
  assert.match(f.values.get("layu_usage_v1_mwi_guild_id"), /^[0-9a-f-]{36}$/);
  assert.equal(f.values.has("layu_usage_v1_mwi_guild_consent"), false);
  await f.client.setEnabled(false);
  assert.equal(f.requests.length, 2);
  assert.equal(f.requests[1].url, "https://stats.example/v1/opt-out");
  assert.deepEqual(JSON.parse(f.requests[1].data), { plugin_id: "mwi_guild", version: "1.0" });
  assert.equal(f.requests[1].anonymous, true);
  assert.equal(f.requests[1].redirect, "error");
  f.advance(86400000);
  assert.equal(await f.client.report(), false);
  await f.client.setEnabled(false);
  assert.equal(f.requests.length, 2);
});

test("saved false never creates identity or sends default-on or opt-out reports", async () => {
  const values = new Map([["layu_usage_v1_mwi_guild_consent", false]]);
  const requests = [];
  const client = createUsageClient({
    pluginId: "mwi_guild",
    version: "2",
    endpoint: "https://stats.example",
    defaultEnabled: true,
    reportOptOut: true,
    crypto: webcrypto,
    getValue: (key, fallback) => (values.has(key) ? values.get(key) : fallback),
    setValue: (key, value) => values.set(key, value),
    request: (details) => requests.push(details)
  });
  assert.equal(await client.report(), false);
  await client.setEnabled(false);
  assert.equal(values.size, 1);
  assert.equal(requests.length, 0);
});

test("one opt-out attempt requires no identity and never retries after failure", async () => {
  const f = fixture({ defaultEnabled: true, reportOptOut: true });
  f.fail(true);
  await f.client.setEnabled(false);
  assert.equal(f.requests.length, 1);
  assert.equal(f.values.has("layu_usage_v1_mwi_guild_id"), false);
  assert.equal(await f.client.enabled(), false);
  for (let n = 0; n < 3; n++) {
    f.advance(86400000);
    await f.client.report();
  }
  assert.equal(f.requests.length, 1);
});

test("failed opt-out persistence leaves reporting state unchanged and sends no event", async () => {
  let calls = 0;
  const client = createUsageClient({
    pluginId: "mwi_guild",
    version: "2",
    endpoint: "https://stats.example",
    defaultEnabled: true,
    reportOptOut: true,
    getValue: (_key, fallback) => fallback,
    setValue: () => {
      throw Error("storage full");
    },
    request: () => {
      calls++;
    }
  });
  await assert.rejects(client.setEnabled(false), /storage full/);
  assert.equal(await client.enabled(), true);
  assert.equal(calls, 0);
});

test("concurrent reports within one client send once", async () => {
  const f = fixture();
  await f.client.setEnabled(true);
  await Promise.all(Array.from({ length: 20 }, () => f.client.report()));
  assert.equal(f.requests.length, 1);
});

test("rejects non-HTTPS configuration", () => {
  assert.throws(() =>
    createUsageClient({
      pluginId: "mwi_guild",
      version: "1",
      endpoint: "http://stats.example"
    })
  );
});

test("persisted consent and identity survive recreation; plugins remain isolated", async () => {
  const f = fixture();
  await f.client.setEnabled(true);
  await f.client.report();
  const payload = JSON.parse(f.requests[0].data);
  const make = (pluginId) =>
    createUsageClient({
      pluginId,
      version: "2",
      endpoint: "https://stats.example",
      crypto: webcrypto,
      now: () => Date.parse("2026-10-15T04:00:00Z"),
      getValue: async (k, d) => (f.values.has(k) ? f.values.get(k) : d),
      setValue: async (k, v) => f.values.set(k, v),
      request: async (r) => {
        f.requests.push(r);
        return { status: 200, responseText: '{"ok":true}' };
      }
    });
  await make("mwi_guild").report();
  assert.equal(JSON.parse(f.requests[1].data).installation_hash, payload.installation_hash);
  const other = make("mwi_invite");
  assert.equal(await other.report(), false);
  await other.setEnabled(true);
  await other.report();
  assert.notEqual(JSON.parse(f.requests[2].data).installation_hash, payload.installation_hash);
});

test("Shanghai midnight permits next-day report and disable during hashing prevents send", async () => {
  const f = fixture();
  await f.client.setEnabled(true);
  await f.client.report();
  f.advance(12 * 3600000);
  assert.equal(await f.client.report(), true);
  let release;
  let entered;
  const enteredPromise = new Promise((r) => {
    entered = r;
  });
  const digestPromise = new Promise((r) => {
    release = r;
  });
  let sent = 0;
  const values = new Map();
  const c = createUsageClient({
    pluginId: "mwi_guild",
    version: "1",
    endpoint: "https://stats.example",
    getValue: async (k, d) => (values.has(k) ? values.get(k) : d),
    setValue: async (k, v) => values.set(k, v),
    crypto: {
      randomUUID: () => webcrypto.randomUUID(),
      subtle: {
        digest: () => {
          entered();
          return digestPromise;
        }
      }
    },
    request: async () => {
      sent++;
      return { status: 200, responseText: '{"ok":true}' };
    }
  });
  await c.setEnabled(true);
  const pending = c.report();
  await enteredPromise;
  await c.setEnabled(false);
  release(new Uint8Array(32).buffer);
  await pending;
  assert.equal(sent, 0);
});

test("malformed responses, redirects and lost storage never mark success", async () => {
  for (const response of [
    { status: 200, responseText: "bad" },
    { status: 503, responseText: '{"ok":true}' },
    {
      status: 200,
      responseText: '{"ok":true}',
      finalUrl: "https://other.example/"
    }
  ]) {
    const values = new Map();
    const c = createUsageClient({
      pluginId: "mwi_guild",
      version: "1",
      endpoint: "https://stats.example",
      crypto: webcrypto,
      getValue: async (k, d) => (values.has(k) ? values.get(k) : d),
      setValue: async (k, v) => values.set(k, v),
      request: async () => response
    });
    await c.setEnabled(true);
    assert.equal(await c.report(), false);
    assert.equal(values.has("layu_usage_v1_mwi_guild_day"), false);
  }
  const c = createUsageClient({
    pluginId: "mwi_guild",
    version: "1",
    endpoint: "https://stats.example",
    crypto: webcrypto,
    getValue: () => {
      throw Error("unavailable");
    },
    setValue: () => {
      throw Error("full");
    },
    request: () => {
      throw Error("must not send");
    }
  });
  assert.equal(await c.report(), false);
  await assert.rejects(c.setEnabled(true));
});

const { boot } = require("../src/runtime/usage-client.js");
function bootFixture(shared) {
  const values = shared || new Map(),
    requests = [],
    menus = new Map(),
    listeners = new Map(),
    timers = new Map(),
    events = new Map(),
    docEvents = new Map();
  let serial = 0,
    consent = true,
    alerts = 0,
    aborted = 0;
  const env = {
    crypto: webcrypto,
    navigator: { language: "zh-CN" },
    location: { origin: "https://www.milkywayidle.com" },
    document: {
      visibilityState: "visible",
      addEventListener: (k, v) => docEvents.set(k, v),
      removeEventListener: (k) => docEvents.delete(k)
    },
    addEventListener: (k, v) => events.set(k, v),
    removeEventListener: (k) => events.delete(k),
    setTimeout: (f, ms) => {
      const id = ++serial;
      timers.set(id, { f, ms, type: "timeout" });
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
    setInterval: (f, ms) => {
      const id = ++serial;
      timers.set(id, { f, ms, type: "interval" });
      return id;
    },
    clearInterval: (id) => timers.delete(id),
    confirm: () => consent,
    alert: () => alerts++
  };
  env.top = env.self = env;
  const gm = {
    getValue: (k, d) => (values.has(k) ? values.get(k) : d),
    setValue: (k, v) => {
      const old = values.get(k);
      values.set(k, v);
      for (const [key, f] of listeners.values()) if (k === key) f(k, old, v, false);
    },
    menu: (label, fn) => {
      const id = ++serial;
      menus.set(id, { label, fn });
      return id;
    },
    unmenu: (id) => menus.delete(id),
    listen: (key, f) => {
      const id = ++serial;
      listeners.set(id, [key, f]);
      return id;
    },
    unlisten: (id) => listeners.delete(id),
    request: (r) => {
      requests.push(r);
      return {
        abort: () => {
          aborted++;
          r.onabort();
        }
      };
    }
  };
  const config = {
    pluginId: "mwi_guild",
    version: "1",
    name: "公会助手",
    endpoint: "https://stats.example"
  };
  return {
    values,
    requests,
    menus,
    listeners,
    timers,
    events,
    docEvents,
    env,
    gm,
    config,
    consent: (v) => (consent = v),
    alerts: () => alerts,
    aborted: () => aborted
  };
}
const flush = () =>
  new Promise((r) => {
    setTimeout(r, 10);
  });
test("default off, cross-tab disable, timeout and disposal are fail closed without popups", async () => {
  const f = bootFixture();
  const app = boot(f.config, f.gm, f.env);
  await flush();
  assert.equal(f.requests.length, 0);
  assert.equal(f.timers.size, 0);
  assert.equal(f.values.size, 0);
  assert.equal(f.menus.size, 0);
  await app.client.setEnabled(true);
  await flush();
  assert.equal(f.requests.length, 1);
  assert.equal(f.requests[0].anonymous, true);
  assert.equal(f.requests[0].redirect, "error");
  const timeout = [...f.timers.values()].find((t) => t.type === "timeout");
  timeout.f();
  await flush();
  assert.equal(f.aborted(), 1);
  assert.equal(f.values.has("layu_usage_v1_mwi_guild_day"), false);
  f.gm.setValue("layu_usage_v1_mwi_guild_consent", false);
  await flush();
  assert.equal(f.timers.size, 0);
  assert.equal(f.alerts(), 0);
  app.dispose();
  assert.equal(f.listeners.size, 0);
  assert.equal(f.events.size, 0);
  assert.equal(f.docEvents.size, 0);
});
test("missing GM, iframe, development and non-game origin never start statistics", () => {
  const f = bootFixture();
  assert.equal(boot(f.config, {}, f.env), null);
  assert.equal(boot({ ...f.config, development: true }, f.gm, f.env), null);
  f.env.location.origin = "https://test.milkywayidle.com";
  assert.equal(boot(f.config, f.gm, f.env), null);
  f.env.location.origin = "https://www.milkywayidle.com";
  f.env.top = {};
  assert.equal(boot(f.config, f.gm, f.env), null);
  assert.equal(f.menus.size, 0);
  assert.equal(f.requests.length, 0);
});
test("duplicate bootstrap is inert and BFCache resume restarts polling", async () => {
  const f = bootFixture();
  const app = boot(f.config, f.gm, f.env);
  assert.equal(boot(f.config, f.gm, f.env), null);
  await app.client.setEnabled(true);
  await flush();
  f.requests[0].onload({ status: 200, responseText: '{"ok":true}' });
  await flush();
  f.events.get("pagehide")({ persisted: true });
  assert.equal(f.timers.size, 0);
  f.events.get("pageshow")({ persisted: true });
  await flush();
  assert.equal([...f.timers.values()].filter((x) => x.type === "interval").length, 1);
  assert.equal(f.requests.length, 1);
  assert.equal(f.menus.size, 0);
  app.dispose();
});
