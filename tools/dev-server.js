"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");
const port = Number(process.env.PORT || 4173);

http.createServer((request, response) => {
  const pathname = new URL(request.url, "http://127.0.0.1").pathname;
  const files = {
    "/milky-way-idle-guild-credit-optimizer.user.js": "milky-way-idle-guild-credit-optimizer.user.js",
    "/milky-way-idle-guild-credit-dev-loader.user.js": "milky-way-idle-guild-credit-dev-loader.user.js",
    "/runtime.js": "runtime.js",
    "/test-harness.html": "test-harness.html"
  };
  const filename = files[pathname];
  if (!filename) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    return response.end("Not found");
  }
  const file = path.join(dist, filename);
  if (!fs.existsSync(file)) {
    response.writeHead(503, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
    return response.end("Run npm run build first");
  }
  response.writeHead(200, {
    "Content-Type": filename.endsWith(".html") ? "text/html; charset=utf-8" : "application/javascript; charset=utf-8",
    "Cache-Control": "no-store, no-cache, must-revalidate",
    "Access-Control-Allow-Origin": "*"
  });
  response.end(fs.readFileSync(file));
}).listen(port, "127.0.0.1", () => {
  console.log(`Tampermonkey loader URL: http://127.0.0.1:${port}/milky-way-idle-guild-credit-dev-loader.user.js`);
});
