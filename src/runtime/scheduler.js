(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MwiGuildCreditScheduler = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function createDebouncedTask(options) {
    const { task, delay = 0, setTimer = setTimeout, clearTimer = clearTimeout } = options;
    let timer = null;
    let latestArgs = [];
    let disposed = false;

    function cancel() {
      if (timer === null) return;
      clearTimer(timer);
      timer = null;
    }

    function schedule(...args) {
      if (disposed) return false;
      latestArgs = args;
      cancel();
      timer = setTimer(() => {
        timer = null;
        task(...latestArgs);
      }, delay);
      return true;
    }

    function dispose() {
      disposed = true;
      latestArgs = [];
      cancel();
    }

    return {
      schedule,
      cancel,
      dispose,
      pending: () => timer !== null,
      disposed: () => disposed
    };
  }

  function createFrameTask(options) {
    const { task, requestFrame, cancelFrame, merge = (_, next) => next } = options;
    let frame = null;
    let payload;
    let disposed = false;

    function cancel() {
      if (frame === null) return;
      if (typeof cancelFrame === "function") cancelFrame(frame);
      frame = null;
      payload = undefined;
    }

    function schedule(nextPayload) {
      if (disposed) return false;
      payload = frame === null ? nextPayload : merge(payload, nextPayload);
      if (frame !== null) return true;
      frame = requestFrame(() => {
        frame = null;
        const currentPayload = payload;
        payload = undefined;
        task(currentPayload);
      });
      return true;
    }

    function dispose() {
      disposed = true;
      cancel();
    }

    return {
      schedule,
      cancel,
      dispose,
      pending: () => frame !== null,
      disposed: () => disposed
    };
  }

  return { createDebouncedTask, createFrameTask };
});
