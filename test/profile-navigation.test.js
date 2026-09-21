"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const readerApi = require("../src/runtime/profile-reader.js");
const source = fs.readFileSync(require.resolve("../src/bridge.js"), "utf8");
const profile = (name, id = 1) => ({ sharableCharacter: { name, id }, combatLevel: 99 });
function fixture({ isolated = false, failure = false } = {}) {
  const sent = [],
    timers = new Map(),
    updates = [];
  let timerId = 0,
    socketsCreated = 0;
  class Socket {
    constructor() {
      socketsCreated += 1;
    }
    send(frame) {
      sent.push(JSON.parse(frame));
    }
  }
  const socket = new Socket();
  const controller = {
    state: {},
    setState(update) {
      updates.push(update);
      Object.assign(this.state, update);
    },
    handleViewProfile(name) {
      socket.send(JSON.stringify({ type: "view_profile", viewProfileData: { characterName: name } }));
      if (failure) throw new Error("Already sent");
    }
  };
  const original = controller.setState;
  const root = { __reactContainer$test: { current: { child: { stateNode: controller } } } };
  const page = { WebSocket: Socket, document: { getElementById: (id) => (id === "root" ? root : null) } };
  const window = isolated ? { WebSocket: Socket } : page;
  Object.assign(window, {
    MwiGuildProfileReader: readerApi,
    setTimeout(fn, delay) {
      const id = ++timerId;
      timers.set(id, { fn, delay });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    }
  });
  vm.runInNewContext(source, { window, unsafeWindow: isolated ? new Proxy(page, {}) : page, URL });
  const reply = (name, id = 1) =>
    controller.setState({ sharableProfile: profile(name, id), sharableGuildProfile: null });
  return {
    bridge: window.__mwiGuildCreditBridge,
    sent,
    controller,
    root,
    reply,
    original,
    timers,
    updates,
    socketCount: () => socketsCreated
  };
}
for (const isolated of [false, true]) {
  test(`内嵌资料只查询一次，匹配响应不打开原生弹窗并恢复控制器（隔离 ${isolated}）`, () => {
    const f = fixture({ isolated }),
      results = [];
    assert.equal(
      f.bridge.requestProfile(" LAYU ", (result) => results.push(result)),
      true
    );
    assert.equal(f.sent.length, 1);
    assert.deepEqual(f.sent[0], { type: "view_profile", viewProfileData: { characterName: "LAYU" } });
    f.reply("LAYU");
    assert.equal(results[0].profile.sharableCharacter.name, "LAYU");
    assert.equal(f.updates.length, 0);
    assert.equal(f.controller.setState, f.original);
    assert.equal(f.timers.size, 0);
    assert.equal(f.socketCount(), 1);
    f.bridge.requestProfile("LAYU", (result) => results.push(result));
    assert.equal(f.sent.length, 1);
    f.reply("LAYU");
    assert.equal(f.updates.length, 1); // Native queries work normally after our request completes.
  });
}
test("交错玩家响应分别回调，不拦截其他玩家和普通状态更新", () => {
  const f = fixture(),
    a = [],
    b = [];
  f.bridge.requestProfile("A", (value) => a.push(value));
  f.bridge.requestProfile("B", (value) => b.push(value));
  f.reply("Other");
  f.controller.setState({ coins: 1 });
  assert.equal(f.updates.length, 2);
  f.reply("B", 2);
  f.reply("A", 1);
  assert.equal(a[0].profile.sharableCharacter.id, 1);
  assert.equal(b[0].profile.sharableCharacter.id, 2);
  assert.equal(f.sent.length, 2);
  assert.equal(f.controller.setState, f.original);
});
test("超时不重发，迟到响应仍内嵌，未收到响应最终移除拦截", () => {
  const f = fixture(),
    results = [];
  f.bridge.requestProfile("A", (value) => results.push(value));
  [...f.timers.values()].find((timer) => timer.delay === 15000).fn();
  assert.equal(results[0].status, "timeout");
  f.reply("A");
  assert.equal(results[1].status, "ready");
  assert.equal(f.updates.length, 0);
  f.bridge.requestProfile("B", () => {});
  [...f.timers.values()].find((timer) => timer.delay === 60000).fn();
  assert.equal(f.controller.setState, f.original);
  assert.equal(f.sent.length, 2);
});
test("重复点击合并未完成请求，缓存可手动刷新，原生已打开资料可复用", () => {
  const f = fixture(),
    results = [];
  f.controller.state.sharableProfile = profile("A");
  f.bridge.requestProfile("A", (value) => results.push(value));
  assert.equal(f.sent.length, 0);
  f.bridge.requestProfile("A", (value) => results.push(value), true);
  f.bridge.requestProfile("A", (value) => results.push(value), true);
  assert.equal(f.sent.length, 1);
  f.reply("A");
  assert.equal(results.length, 3);
});
test("无效名字和不可用入口不发送，异常和销毁不重试", () => {
  const f = fixture();
  for (const name of [null, "", "  ", "a".repeat(65), "a\nb"])
    assert.equal(
      f.bridge.requestProfile(name, () => {}),
      false
    );
  delete f.root.__reactContainer$test;
  assert.equal(
    f.bridge.requestProfile("LAYU", () => {}),
    false
  );
  assert.equal(f.sent.length, 0);
  const failed = fixture({ failure: true }),
    results = [];
  failed.bridge.requestProfile("LAYU", (result) => results.push(result));
  assert.equal(results[0].status, "unavailable");
  assert.equal(failed.sent.length, 1);
  failed.bridge.disposeProfileReader();
  assert.equal(failed.controller.setState, failed.original);
  assert.equal(failed.timers.size, 0);
});

test("超时后仅明确刷新重发一次，新缓存不被旧原生状态覆盖", () => {
  const f = fixture(),
    results = [];
  f.controller.state.sharableProfile = profile("A", 1);
  f.bridge.requestProfile("A", () => {}, true);
  [...f.timers.values()].find((timer) => timer.delay === 15000).fn();
  f.bridge.requestProfile("A", (value) => results.push(value), true);
  assert.equal(f.sent.length, 2);
  f.reply("A", 2);
  f.bridge.requestProfile("A", (value) => results.push(value));
  assert.equal(results.length, 2);
  assert.equal(results[1].profile.sharableCharacter.id, 2);
  assert.equal(f.sent.length, 2);
});
