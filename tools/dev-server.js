"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");
const port = Number(process.env.PORT || 4174);

function rebuild() {
  execFileSync(process.execPath, [path.join(root, "tools/build.js")], {
    cwd: root,
    env: { ...process.env, MWI_ARCHIVE_RELEASE: "0" },
    stdio: "pipe",
    timeout: 30000
  });
}

function createDevServer({ build = rebuild } = {}) {
  return http.createServer((request, response) => {
    const pathname = new URL(request.url, "http://127.0.0.1").pathname;
    const files = {
      "/milky-way-idle-guild-credit-optimizer.user.js": "milky-way-idle-guild-credit-optimizer.user.js",
      "/milky-way-idle-guild-credit-dev-loader.user.js": "milky-way-idle-guild-credit-dev-loader.user.js",
      "/runtime.js": "runtime.js",
      "/test-harness.html": "test-harness.html",
      "/game_data/marketplace.json": "test-marketplace.json",
      "/asset-manifest.json": "test-asset-manifest.json",
      "/assets/misc_sprite.svg": "test-misc-sprite.svg",
      "/assets/skills_sprite.svg": "test-trial-sprite.svg",
      "/assets/combat_monsters_sprite.svg": "test-trial-sprite.svg",
      "/assets/abilities_sprite.svg": "test-trial-sprite.svg",
      "/assets/items_sprite.svg": "test-trial-sprite.svg",
      "/assets/chat_icons_sprite.svg": "test-trial-sprite.svg"
    };
    const filename = files[pathname];
    if (!filename) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      return response.end("Not found");
    }
    // Only generated entry points need a fresh build, not fixture assets.
    if (["/runtime.js", "/test-harness.html"].includes(pathname) || pathname.endsWith(".user.js")) {
      try {
        build();
      } catch (error) {
        console.error("Development build failed:", error.message);
        response.writeHead(503, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
        return response.end("Build failed; see development server log");
      }
    }
    const file =
      pathname.startsWith("/assets/") || ["/game_data/marketplace.json", "/asset-manifest.json"].includes(pathname)
        ? path.join(root, "tools", filename)
        : path.join(dist, filename);
    if (!fs.existsSync(file)) {
      response.writeHead(503, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
      return response.end("Run npm run build first");
    }
    response.writeHead(200, {
      "Content-Type": filename.endsWith(".html")
        ? "text/html; charset=utf-8"
        : filename.endsWith(".json")
          ? "application/json; charset=utf-8"
          : filename.endsWith(".svg")
            ? "image/svg+xml; charset=utf-8"
            : "application/javascript; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "Access-Control-Allow-Origin": "*"
    });
    response.end(fs.readFileSync(file));
  });
}

module.exports = { createDevServer };

if (require.main === module) {
  createDevServer().listen(port, "127.0.0.1", () => {
    console.log(`Tampermonkey loader URL: http://127.0.0.1:${port}/milky-way-idle-guild-credit-dev-loader.user.js`);
  });
}
