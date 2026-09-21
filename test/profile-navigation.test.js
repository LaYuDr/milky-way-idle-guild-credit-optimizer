"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync(require.resolve("../src/bridge.js"), "utf8");

function fixture({ isolated = false, failure = false } = {}) {
  const sent = [];
  let socketsCreated = 0;
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
    handleViewProfile(name) {
      socket.send(JSON.stringify({ type: "view_profile", viewProfileData: { characterName: name } }));
      if (failure) throw new Error("Already sent");
    }
  };
  const root = { __reactContainer$test: { current: { child: { stateNode: controller } } } };
  const page = { WebSocket: Socket, document: { getElementById: (id) => (id === "root" ? root : null) } };
  const window = isolated ? { WebSocket: Socket } : page;
  vm.runInNewContext(source, { window, unsafeWindow: isolated ? new Proxy(page, {}) : page, URL });
  return { bridge: window.__mwiGuildCreditBridge, sent, controller, root, socketCount: () => socketsCreated };
}

for (const isolated of [false, true]) {
  test(`资料查询复用原生入口和现有连接，仅发一次（隔离环境 ${isolated}）`, () => {
    const f = fixture({ isolated });
    assert.equal(f.sent.length, 0);
    assert.equal(f.bridge.requestProfile(" LAYU "), true);
    assert.deepEqual(f.sent, [{ type: "view_profile", viewProfileData: { characterName: "LAYU" } }]);
    assert.equal(f.socketCount(), 1);
    delete f.root.__reactContainer$test;
    assert.equal(f.bridge.requestProfile("LAYU"), false);
    assert.equal(f.sent.length, 1);
  });
}

test("无效名字与不可用原生入口不发送，异常后不重试", () => {
  const f = fixture();
  for (const name of [null, "", "  ", "a".repeat(65), "a\nb"]) assert.equal(f.bridge.requestProfile(name), false);
  assert.equal(f.sent.length, 0);
  delete f.controller.handleViewProfile;
  assert.equal(f.bridge.requestProfile("LAYU"), false);
  assert.equal(f.sent.length, 0);
  const failed = fixture({ failure: true });
  assert.equal(failed.bridge.requestProfile("LAYU"), false);
  assert.equal(failed.sent.length, 1);
  assert.equal(failed.socketCount(), 1);
});
