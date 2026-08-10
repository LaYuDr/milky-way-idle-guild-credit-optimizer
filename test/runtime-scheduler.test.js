"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const schedulerApi = require("../src/runtime/scheduler.js");

function fakeQueue() {
  const callbacks = new Map();
  let nextId = 1;
  return {
    set(callback) {
      const id = nextId++;
      callbacks.set(id, callback);
      return id;
    },
    clear(id) {
      callbacks.delete(id);
    },
    flush() {
      const queued = Array.from(callbacks.values());
      callbacks.clear();
      for (const callback of queued) callback();
    },
    size: () => callbacks.size
  };
}

test("防抖任务合并高频事件并使用最后一次参数", () => {
  const queue = fakeQueue();
  const calls = [];
  const task = schedulerApi.createDebouncedTask({
    task: (...args) => calls.push(args),
    delay: 120,
    setTimer: queue.set,
    clearTimer: queue.clear
  });

  task.schedule("first");
  task.schedule("second", 2);
  task.schedule("last", 3);
  assert.equal(queue.size(), 1);
  assert.equal(task.pending(), true);
  queue.flush();
  assert.deepEqual(calls, [["last", 3]]);
  assert.equal(task.pending(), false);
});

test("调度器销毁会取消待执行工作且拒绝后续调度", () => {
  const queue = fakeQueue();
  let calls = 0;
  const task = schedulerApi.createDebouncedTask({
    task: () => {
      calls += 1;
    },
    setTimer: queue.set,
    clearTimer: queue.clear
  });

  task.schedule();
  task.dispose();
  queue.flush();
  assert.equal(calls, 0);
  assert.equal(task.disposed(), true);
  assert.equal(task.schedule(), false);
  assert.equal(queue.size(), 0);
});

test("帧任务只占用一帧并可合并强制刷新标志", () => {
  const queue = fakeQueue();
  const calls = [];
  const task = schedulerApi.createFrameTask({
    task: (force) => calls.push(force),
    requestFrame: queue.set,
    cancelFrame: queue.clear,
    merge: (current, next) => Boolean(current || next)
  });

  task.schedule(false);
  task.schedule(true);
  task.schedule(false);
  assert.equal(queue.size(), 1);
  queue.flush();
  assert.deepEqual(calls, [true]);
});
