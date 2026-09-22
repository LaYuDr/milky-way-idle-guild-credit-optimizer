"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { imageSize } = require("../src/ui/trial-screenshot.js");

test("长图完整保留逻辑尺寸，普通图片使用两倍像素", () => {
  assert.deepEqual(imageSize(1200, 2000.2), { width: 1200, height: 2001, pixelWidth: 2400, pixelHeight: 4002 });
});

test("长图在画布预算内降低像素倍率，但不低于原文字尺寸", () => {
  for (const [width, height] of [
    [1200, 14000],
    [8000, 2000],
    [15000, 1000]
  ]) {
    const size = imageSize(width, height);
    assert.ok(size.pixelWidth >= width && size.pixelHeight >= height);
    assert.ok(size.pixelWidth <= 16000 && size.pixelHeight <= 16000);
    assert.ok(size.pixelWidth * size.pixelHeight <= 24000000);
  }
});

test("超限或无效尺寸明确失败，不裁掉表格末尾", () => {
  for (const size of [
    [1200, 16001],
    [16001, 100],
    [10000, 10000],
    [0, 1],
    [NaN, 1],
    [1, Infinity]
  ])
    assert.throws(() => imageSize(...size), { code: "trialScreenshotTooLarge" });
});

const { deliverPng } = require("../src/ui/trial-screenshot.js");
function deliveryEnvironment(write) {
  const calls = [];
  const anchor = {
    click() {
      calls.push(["download", this.download]);
    },
    remove() {
      calls.push(["remove"]);
    }
  };
  return {
    calls,
    document: { createElement: () => anchor, body: { appendChild() {} } },
    pageWindow: {
      navigator: { clipboard: write ? { write } : undefined },
      ClipboardItem: class {
        constructor(data) {
          this.data = data;
        }
      },
      URL: {
        createObjectURL(blob) {
          calls.push(["blob", blob]);
          return "blob:test";
        },
        revokeObjectURL() {}
      },
      setTimeout() {}
    }
  };
}

test("复制在图片 Promise 完成前注册，成功时不下载", async () => {
  let registered = false;
  const png = Promise.resolve(new Blob(["PNG"], { type: "image/png" }));
  const environment = deliveryEnvironment(async ([item]) => {
    registered = true;
    assert.equal(item.data["image/png"], png);
    await png;
  });
  const result = deliverPng(png, "copy", environment);
  assert.equal(registered, true);
  assert.equal(await result, "trialScreenshotCopied");
  assert.deepEqual(environment.calls, []);
});

test("剪贴板不可用或被拒绝时下载同一 PNG", async () => {
  for (const write of [
    undefined,
    async () => {
      throw new Error("NotAllowedError");
    }
  ]) {
    const environment = deliveryEnvironment(write);
    const blob = new Blob(["PNG"], { type: "image/png" });
    assert.equal(await deliverPng(Promise.resolve(blob), "copy", environment), "trialScreenshotFallback");
    assert.equal(environment.calls[0][1], blob);
    assert.match(environment.calls[1][1], /^guild-trial-.*\.png$/);
    assert.equal(environment.calls.filter(([type]) => type === "download").length, 1);
  }
});

test("直接下载不碰剪贴板，生成失败不下载空图片", async () => {
  const environment = deliveryEnvironment(() => {
    throw new Error("Unexpected clipboard access");
  });
  assert.equal(
    await deliverPng(Promise.resolve(new Blob(["PNG"])), "download", environment),
    "trialScreenshotDownloaded"
  );
  const failed = deliveryEnvironment();
  await assert.rejects(deliverPng(Promise.reject(new Error("render failed")), "copy", failed), /render failed/);
  assert.deepEqual(failed.calls, []);
});
