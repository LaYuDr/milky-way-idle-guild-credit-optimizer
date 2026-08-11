"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const source = (file) => fs.readFileSync(path.join(root, file), "utf8");
const outputDirectory = path.join(root, "dist");
fs.mkdirSync(outputDirectory, { recursive: true });

function releaseRecords() {
  const releasesDirectory = path.join(root, "releases");
  const records = [];
  if (!fs.existsSync(releasesDirectory)) return records;
  for (const seriesEntry of fs.readdirSync(releasesDirectory, { withFileTypes: true })) {
    if (!seriesEntry.isDirectory() || !/^v\d+\.\d+$/.test(seriesEntry.name)) continue;
    const seriesDirectory = path.join(releasesDirectory, seriesEntry.name);
    for (const fileEntry of fs.readdirSync(seriesDirectory, { withFileTypes: true })) {
      const match = /^银河奶牛公会信用点性价比-v(\d+\.\d+\.\d+)\.user\.js$/.exec(fileEntry.name);
      if (!fileEntry.isFile() || !match) continue;
      const file = path.join(seriesDirectory, fileEntry.name);
      const contents = fs.readFileSync(file);
      records.push({
        version: match[1],
        path: path.posix.join("releases", seriesEntry.name, fileEntry.name),
        sizeBytes: contents.length,
        sha256: crypto.createHash("sha256").update(contents).digest("hex")
      });
    }
  }
  records.sort((left, right) => {
    const a = left.version.split(".").map(Number);
    const b = right.version.split(".").map(Number);
    for (let index = 0; index < 3; index += 1) {
      if (a[index] !== b[index]) return a[index] - b[index];
    }
    return 0;
  });
  return records;
}

function writeReleaseManifest() {
  const manifest = {
    schemaVersion: 1,
    artifactType: "tampermonkey-userscript",
    policy: "append-only",
    releases: releaseRecords()
  };
  fs.writeFileSync(path.join(root, "releases", "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
}

const version = process.env.MWI_VERSION || require(path.join(root, "package.json")).version;
const versionMatch = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
if (!versionMatch) throw new Error(`Invalid package version: ${version}`);
const header = `// ==UserScript==
// @name         银河奶牛公会信用点性价比
// @namespace    https://www.milkywayidle.com/
// @version      ${version}
// @author       柆雨
// @license      MIT
// @homepageURL  https://github.com/LaYuDr/milky-way-idle-guild-credit-optimizer
// @description  公会信用点兑换与神龛升级的只读计算辅助；不会自动交易、兑换或升级，也不会上传账号数据。
// @match        https://www.milkywayidle.com/*
// @match        https://www.milkywayidlecn.com/*
// @grant        GM_addElement
// @grant        unsafeWindow
// @sandbox      raw
// @run-at       document-start
// ==/UserScript==

`;

const SOURCE_FILES = [
  "src/market-data.js",
  "src/market-dom.js",
  "src/bridge.js",
  "src/item-name-catalog.js",
  "src/release-info.js",
  "src/guild-building-data.js",
  "src/localization.js",
  "src/core.js",
  "src/shrine-guide.js",
  "src/runtime/config.js",
  "src/runtime/storage.js",
  "src/runtime/scheduler.js",
  "src/runtime/game-state.js",
  "src/runtime/game-data.js",
  "src/ui/dom.js",
  "src/ui/sidebar-integration.js",
  "src/ui/sortable.js",
  "src/ui/styles.js",
  "src/ui/construction-view.js",
  "src/ui/upgrade-view.js",
  "src/ui/settings-view.js",
  "src/ui/shrine-guide-ui.js",
  "src/ui/exchange-advisor.js",
  "src/ui/panel-shell.js",
  "src/ui/credit-view.js",
  "src/userscript.js"
];
const runtimeSource = SOURCE_FILES.map((file) => `// SOURCE: ${file}\n${source(file)}`).join("\n\n");
const runtime = `// MWI_GUILD_CREDIT_RUNTIME\nwindow.MwiGuildCreditVersion = ${JSON.stringify(version)};\n\n${runtimeSource}`;
const bundle = `${header}${runtime}`;
const output = path.join(outputDirectory, "milky-way-idle-guild-credit-optimizer.user.js");
fs.writeFileSync(output, bundle);

if (process.env.MWI_ARCHIVE_RELEASE === "1") {
  const releaseDirectory = path.join(root, "releases", `v${versionMatch[1]}.${versionMatch[2]}`);
  const versionedOutput = path.join(releaseDirectory, `银河奶牛公会信用点性价比-v${version}.user.js`);
  fs.mkdirSync(releaseDirectory, { recursive: true });
  if (fs.existsSync(versionedOutput)) {
    if (fs.readFileSync(versionedOutput, "utf8") !== bundle) {
      throw new Error(`Historical release archive is immutable and differs from the current build: ${versionedOutput}`);
    }
  } else {
    fs.writeFileSync(versionedOutput, bundle);
  }
  writeReleaseManifest();
}

const loader = `// ==UserScript==
// @name         银河奶牛公会信用点性价比 开发加载器
// @namespace    https://www.milkywayidle.com/
// @version      ${version}
// @author       柆雨
// @description  从本机开发服务加载银河奶牛信用点插件；仅用于开发和自动测试。
// @match        https://www.milkywayidle.com/*
// @match        https://www.milkywayidlecn.com/*
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      127.0.0.1
// @run-at       document-start
// ==/UserScript==

(function () {
  "use strict";
  const page = typeof unsafeWindow === "undefined" ? window : unsafeWindow;
  const bridge = page.__mwiGuildCreditBridge || (page.__mwiGuildCreditBridge = {
    messages: [],
    sockets: [],
    itemDetails: null
  });

  function rememberItemDetails(message) {
    if (!message || typeof message !== "object") return;
    const itemDetails = message.itemDetailMap || message.itemDetailDict;
    if (itemDetails && typeof itemDetails === "object") bridge.itemDetails = itemDetails;
  }

  // This loader runs before the game scripts. Preserve received data so the
  // separately loaded development runtime can inspect the game's read-only
  // initialization payload after it has finished loading.
  const NativeWebSocket = page.WebSocket;
  if (NativeWebSocket && !NativeWebSocket.__mwiGuildCreditBridge) {
    function ObservedWebSocket(...args) {
      const socket = new NativeWebSocket(...args);
      bridge.sockets.push(socket);
      socket.addEventListener("message", (event) => {
        if (typeof event.data !== "string") return;
        bridge.messages.push(event.data);
        if (bridge.messages.length > 40) bridge.messages.shift();
        try {
          rememberItemDetails(JSON.parse(event.data));
        } catch (_) {
          // The game WebSocket can carry unrelated text frames.
        }
      });
      socket.addEventListener("close", () => {
        const index = bridge.sockets.indexOf(socket);
        if (index >= 0) bridge.sockets.splice(index, 1);
      });
      return socket;
    }
    ObservedWebSocket.prototype = NativeWebSocket.prototype;
    Object.setPrototypeOf(ObservedWebSocket, NativeWebSocket);
    ObservedWebSocket.__mwiGuildCreditBridge = true;
    page.WebSocket = ObservedWebSocket;
  }
  const runtimeUrl = "http://127.0.0.1:4173/runtime.js?cacheBust=" + Date.now();
  GM_xmlhttpRequest({
    method: "GET",
    url: runtimeUrl,
    onload(response) {
      if (response.status !== 200 || !response.responseText.startsWith("// MWI_GUILD_CREDIT_RUNTIME")) {
        console.error("[MWI Credit] 开发运行时响应无效", response.status);
        return;
      }
      try {
        Function(response.responseText + "\\n//# sourceURL=mwi-credit-runtime.js")();
      } catch (error) {
        console.error("[MWI Credit] 开发运行时加载失败", error);
      }
    },
    onerror(error) {
      console.error("[MWI Credit] 无法连接本机开发服务", error);
    }
  });
})();
`;
fs.writeFileSync(path.join(outputDirectory, "milky-way-idle-guild-credit-dev-loader.user.js"), loader);
fs.writeFileSync(path.join(outputDirectory, "runtime.js"), runtime);
fs.copyFileSync(path.join(root, "tools", "test-harness.html"), path.join(outputDirectory, "test-harness.html"));
console.log(output);
