import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

// Optional workspace integration check: each project still builds independently.
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const projects = path.resolve(process.argv[2] || path.join(project, ".."));
const output = path.join(project, ".workbench/assistants-sidebar");
await fs.mkdir(output, { recursive: true });
const files = [
  ["公会助手", "src/ui/sidebar-dom.js"],
  ["公会助手", "src/ui/sidebar-interaction.js"],
  ["公会助手", "src/ui/sidebar-integration.js"],
  ["邀请助手", "src/ui/sidebar-integration.js"],
  ["强化助手", "src/ui/sidebar-integration.js"],
  ["资产助手", "source/ui/sidebar-integration.js"]
];
const sources = await Promise.all(
  files.map(([name, file]) =>
    fs.readFile(path.join(name === "公会助手" ? project : path.join(projects, name), file), "utf8")
  )
);
const results = [];
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  for (const width of [440, 680, 900, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    await context.route("**/*", (route) => route.abort());
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    try {
      await page.setContent(
        '<style>[hidden]{display:none!important}body{margin:0}#bar{display:flex;overflow:auto}button{flex:none}section{min-height:150px}</style><aside id="shell"><div id="bar" role="tablist"><button role="tab">库存</button><button role="tab">装备</button><button role="tab">技能</button><button role="tab">房屋</button><button role="tab">配装</button></div><div id="host" class="Fixture_tabPanelsContainer"><section id="native">Native</section></div></aside>'
      );
      await page.evaluate(() => {
        const NativeObserver = globalThis.MutationObserver;
        globalThis.MutationObserver = class extends NativeObserver {
          constructor(callback) {
            super((records, observer) => {
              if (!globalThis.pauseSidebarObservers) callback(records, observer);
            });
          }
        };
      });
      for (const content of sources) await page.addScriptTag({ content });
      await page.evaluate(() => {
        const win = globalThis;
        const document = win.document;
        const bar = document.getElementById("bar");
        const entries = [];
        const panel = (id) => {
          const element = document.createElement("section");
          element.id = id;
          element.hidden = true;
          const input = document.createElement("input");
          input.value = id;
          element.append(input);
          document.body.append(element);
          return element;
        };
        for (const button of bar.children)
          button.onclick = () => {
            for (const tab of bar.children) {
              tab.setAttribute("aria-selected", String(tab === button));
              tab.classList.toggle("Mui-selected", tab === button);
            }
          };
        const state = {};
        const guild = win.MwiGuildCreditSidebarIntegration.createController({
          window: win,
          state,
          getLocale: () => "zh-CN",
          getLabel: () => "公会助手",
          createPanel: () => panel("mwi-credit-optimizer"),
          recreatePanel: (old) => old
        });
        guild.start();
        entries.push({
          name: "guild",
          controller: guild,
          get element() {
            return state.panel;
          },
          get tab() {
            return state.creditTab;
          }
        });
        for (const [name, app, id, marker, owner] of [
          ["invite", win.MWIGuildInviteTracker, "", "mwiGitTab", "invite-fixture"],
          ["enhance", win.MWILayuEnhancement, "mwi-layu-favorites", "mwiLayuTab", "mwi-layu-favorites"],
          ["assets", win.MWILayuAssetsPlugin, "mwi-assets-panel", "mwiAssetsTab", "mwi-assets"]
        ]) {
          const element = panel(id);
          if (!id) element.className = "mwi-git-panel";
          let nativeHost = null;
          const adapter = {
            element,
            hideNative() {
              element.hidden = true;
            },
            openNative() {
              element.hidden = false;
            },
            mountNative(host) {
              nativeHost = host;
              host.append(element);
              element.hidden = true;
            },
            isNativeMounted: () => element.isConnected && element.parentElement === nativeHost,
            restoreOverlay() {
              nativeHost = null;
              element.hidden = true;
              document.body.append(element);
            },
            disableFallback() {},
            enableFallback() {},
            open() {}
          };
          const controller = app.sidebarIntegration.createController({
            panel: adapter,
            i18n: { language: "zh", t: () => name },
            owner,
            tabMarker: marker,
            isOwnedTab: (node) =>
              node.dataset[marker] === "true" &&
              !node.id &&
              !node.hasAttribute("data-mwitools-character-tab") &&
              !node.hasAttribute("data-mwi-credit-tab"),
            isOwnedPanel: (node) => (id ? node.id === id : node.classList.contains("mwi-git-panel") && !node.id)
          });
          controller.start();
          entries.push({
            name,
            controller,
            element,
            get tab() {
              return [...document.getElementById("bar").children].find((tab) => tab.dataset[marker] === "true");
            }
          });
        }
        win.fixture = { entries, checks: {} };
      });
      // Every ordered pair crosses both document activation and native click paths.
      for (let from = 0; from < 4; from++)
        for (let to = 0; to < 4; to++) {
          if (from === to) continue;
          await page.evaluate(
            ({ from, to }) => {
              const fixture = globalThis.fixture;
              fixture.entries[from].tab.click();
              fixture.entries[to].tab.click();
            },
            { from, to }
          );
          await page.waitForTimeout(120);
          assert.equal(
            await page.evaluate((to) => {
              const { entries } = globalThis.fixture;
              return entries.every((entry, i) => entry.element.checkVisibility() === (i === to));
            }, to),
            true,
            `pair ${from}->${to} has exactly one visible panel`
          );
        }
      for (let index = 0; index < 4; index++) {
        await page.evaluate((index) => globalThis.fixture.entries[index].tab.click(), index);
        for (const target of ["panel", "host"]) {
          await page.evaluate(
            ({ index, target }) => {
              const node =
                target === "panel"
                  ? globalThis.fixture.entries[index].element
                  : globalThis.document.getElementById("host");
              node.hidden = true;
              node.style.setProperty("display", "none", "important");
            },
            { index, target }
          );
          await page.waitForFunction((index) => globalThis.fixture.entries[index].element.checkVisibility(), index);
        }
        // Combined failure: hidden content, then React replaces its host.
        await page.evaluate((index) => {
          const entry = globalThis.fixture.entries[index];
          entry.element.hidden = true;
          const host = globalThis.document.getElementById("host");
          const next = host.cloneNode(false);
          host.replaceWith(next);
          for (const child of [...host.children]) if (child !== entry.element) next.append(child);
        }, index);
        await page.waitForFunction((index) => {
          const entry = globalThis.fixture.entries[index];
          return (
            entry.element.parentElement === globalThis.document.getElementById("host") &&
            entry.element.checkVisibility()
          );
        }, index);
        // Drop observer deliveries to verify the independent three-second fallback.
        await page.evaluate((index) => {
          globalThis.pauseSidebarObservers = true;
          globalThis.fixture.entries[index].element.hidden = true;
        }, index);
        await page.waitForFunction((index) => globalThis.fixture.entries[index].element.checkVisibility(), index);
        await page.evaluate(() => {
          globalThis.pauseSidebarObservers = false;
        });
        // Browser resume events also schedule recovery immediately.

        await page.evaluate((index) => {
          globalThis.fixture.entries[index].element.hidden = true;
          globalThis.document.dispatchEvent(new Event("visibilitychange"));
          globalThis.dispatchEvent(new Event("pageshow"));
        }, index);
        await page.waitForFunction((index) => globalThis.fixture.entries[index].element.checkVisibility(), index);
        // A foreign plugin changes selection without a click and hides the native host.
        await page.evaluate((index) => {
          const { entries } = globalThis.fixture;
          const native = globalThis.document.getElementById("bar").firstElementChild;
          native.classList.add("Mui-selected");
          native.setAttribute("aria-selected", "true");
          globalThis.document.getElementById("host").hidden = true;
          entries[index].element.hidden = true;
        }, index);
        await page.waitForFunction(
          (index) => globalThis.fixture.entries[index].tab.getAttribute("aria-selected") !== "true",
          index
        );
        await page.waitForTimeout(3200);
        assert.equal(
          await page.evaluate(() => globalThis.document.getElementById("host").hidden),
          true,
          "idle recovery must not undo foreign selection"
        );
        await page.evaluate((index) => {
          globalThis.document.getElementById("host").hidden = false;
          globalThis.fixture.entries[index].tab.click();
          const entry = globalThis.fixture.entries[index];
          entry.controller.destroy();
          entry.tab?.click();
        }, index);
        assert.equal(await page.evaluate((index) => globalThis.fixture.entries[index].element.hidden, index), true);
      }
      assert.deepEqual(errors, []);
      results.push({ width, pairs: 12, assistants: 4, passed: true });
      console.log(`PASS assistants-sidebar/${width}: 12 ordered pairs, 4 recovery/disposal contracts`);
    } catch (error) {
      results.push({ width, passed: false, error: error.stack, errors });
      console.error(`FAIL assistants-sidebar/${width}: ${error.message}`);
      await page.screenshot({ path: path.join(output, `${width}-failure.png`) });
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
  await fs.writeFile(path.join(output, "report.json"), JSON.stringify(results, null, 2) + "\n");
}
if (results.some((result) => !result.passed)) process.exitCode = 1;
