"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createDevServer } = require("../tools/dev-server.js");

function request(server, url) {
  const response = {
    status: null,
    headers: {},
    body: null,
    writeHead(status, headers) {
      this.status = status;
      this.headers = headers;
      return this;
    },
    end(body) {
      this.body = String(body);
      return this;
    }
  };
  server.emit("request", { url }, response);
  return response;
}

test("primary and legacy userscript URLs serve identical builds and fail closed", () => {
  const server = createDevServer();
  const urls = ["/milky-way-idle-guild-assistant.user.js", "/milky-way-idle-guild-credit-optimizer.user.js"];
  const responses = urls.map((url) => request(server, url));
  for (const response of responses) {
    assert.equal(response.status, 200);
    assert.match(response.headers["Content-Type"], /application\/javascript/);
    assert.match(response.headers["Cache-Control"], /no-store/);
    assert.match(response.body, /^\/\/ ==UserScript==/);
  }
  assert.equal(responses[0].body, responses[1].body);

  const brokenServer = createDevServer({
    build() {
      throw new Error("fixture build failure");
    }
  });
  for (const url of urls) {
    const response = request(brokenServer, url);
    assert.equal(response.status, 503);
    assert.doesNotMatch(response.body, /==UserScript==/);
  }
});

test("runtime requests rebuild every time; failed builds never serve stale dist and can recover", () => {
  let builds = 0;
  let broken = false;
  const server = createDevServer({
    build() {
      builds++;
      if (broken) throw new Error("fixture build failure");
    }
  });
  const first = request(server, "/runtime.js?cacheBust=1");
  assert.equal(first.status, 200);
  assert.match(first.body, /^\/\/ MWI_GUILD_CREDIT_RUNTIME/);
  assert.match(first.headers["Cache-Control"], /no-store/);
  assert.equal(request(server, "/runtime.js?cacheBust=2").status, 200);
  assert.equal(builds, 2);
  broken = true;
  const failed = request(server, "/runtime.js?cacheBust=3");
  assert.equal(failed.status, 503);
  assert.match(failed.headers["Cache-Control"], /no-store/);
  assert.equal(failed.body.includes("MWI_GUILD_CREDIT_RUNTIME"), false);
  broken = false;
  assert.equal(request(server, "/runtime.js?cacheBust=4").status, 200);
  assert.equal(request(server, "/unknown").status, 404);
  assert.equal(builds, 4, "unknown routes must not trigger builds");
});
