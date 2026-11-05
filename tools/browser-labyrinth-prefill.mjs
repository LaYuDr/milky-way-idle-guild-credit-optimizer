#!/usr/bin/env node
/* global window, document, HTMLInputElement, MwiGuildLabyrinthPrefill */
import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../src/ui/labyrinth-prefill.js", import.meta.url), "utf8");
const localization = fs.readFileSync(new URL("../src/localization.js", import.meta.url), "utf8");
const directory = fs.mkdtempSync(new URL("../.workbench/labyrinth-prefill-", import.meta.url));
const results = [];
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  for (const width of [320, 900])
    for (const locale of ["zh", "en"]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.route("**/*", (route) => route.abort());
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.setContent(
        `<style>body{background:#111218;color:#ddd;font-family:system-ui;margin:8px}table{width:100%;font-size:12px}td{padding:4px}input[type=number]{width:45px}button{background:#4557a9;color:white;border:0;padding:6px}</style><h3>Automation</h3><table class="LabyrinthPanel_automationTable__fixture"><tbody></tbody></table>`
      );
      await page.addScriptTag({ content: localization });
      await page.addScriptTag({ content: source });
      await page.evaluate(
        ({ locale }) => {
          window.saved = [];
          window.drafts = [];
          window.mount = (text = "+63", token = "ready:62:100:65", key = "milking") => {
            const row = document.createElement("tr");
            row.innerHTML = `<td>${key}</td><td><select><option>All actions</option></select></td><td><div class="LabyrinthPanel_skipThreshold__fixture"><button>${locale === "zh" ? "编辑" : "Edit"}</button></div></td><td class="mwi-lab-auto-recommend-cell"></td>`;
            const recommend = row.lastElementChild;
            recommend.textContent = text;
            recommend.setAttribute("data-mwi-auto-recommend-token", token);
            recommend.setAttribute("data-mwi-auto-room-key", key);
            const threshold = row.querySelector("div");
            threshold.querySelector("button").onclick = () => {
              threshold.innerHTML = `<div class="LabyrinthPanel_thresholdInputContainer__fixture"><input type="number" value="70"></div><button>${locale === "zh" ? "保存" : "Save"}</button>`;
              const input = threshold.querySelector("input");
              let tracked = "70",
                draft = "70";
              const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
              // Model the React controlled-input tracker: direct input.value writes
              // update the tracker and suppress onChange; native setter must bypass it.
              Object.defineProperty(input, "value", {
                get: () => descriptor.get.call(input),
                set: (value) => {
                  tracked = String(value);
                  descriptor.set.call(input, value);
                }
              });
              input.addEventListener("input", () => {
                if (tracked !== input.value) {
                  tracked = draft = input.value;
                  window.drafts.push(draft);
                }
              });
              threshold.querySelector("button").onclick = () => window.saved.push(draft);
            };
            document.querySelector("tbody").append(row);
            return row;
          };
          window.enabled = true;
          window.options = {
            document,
            pageWindow: window,
            t: window.MwiGuildCreditLocalization.createLocalizer(locale === "zh" ? "zh-CN" : "en").t,
            getEnabled: () => window.enabled,
            setEnabled: (value) => {
              window.enabled = value;
              return true;
            }
          };
          window.helper = MwiGuildLabyrinthPrefill.create(window.options);
          window.helper.start();
          window.helper.start();
          window.mount();
          window.mount("+56", "ready:55:100:65", "foraging");
        },
        { locale }
      );
      const rows = page.locator("tr");
      const toggle = page.getByRole("checkbox");
      assert.equal(await toggle.count(), 1);
      assert.equal(await toggle.isChecked(), true);
      await toggle.focus();
      await page.keyboard.press("Space");
      assert.equal(await toggle.isChecked(), false);
      await page.evaluate(() => {
        window.mount("+90");
      });
      await rows.last().getByRole("button").click();
      assert.equal(await rows.last().locator("input").inputValue(), "70");
      await page.evaluate(() => {
        window.helper.dispose();
        window.helper = MwiGuildLabyrinthPrefill.create(window.options);
        window.helper.start();
      });
      assert.equal(await toggle.isChecked(), false);
      await toggle.check();
      const bounds = await page.locator(".mwi-labyrinth-prefill-toggle").boundingBox();
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width);
      await page.screenshot({ path: `${directory}/${locale}-${width}.png`, fullPage: true });

      await rows.nth(0).getByRole("button").click();
      await page.waitForFunction(() => window.drafts.length === 1);
      assert.equal(await rows.nth(0).locator("input").inputValue(), "63");
      assert.equal(await rows.nth(1).locator("input").count(), 0);
      assert.deepEqual(await page.evaluate(() => window.saved), []);
      await rows.nth(0).locator("input").fill("61");
      await page.evaluate(() => {
        document.querySelector(".mwi-lab-auto-recommend-cell").textContent = "+64";
      });
      assert.equal(await rows.nth(0).locator("input").inputValue(), "61");
      await rows.nth(0).getByRole("button").click();
      assert.deepEqual(await page.evaluate(() => window.saved), ["61"]);
      await rows.nth(1).getByRole("button").click();
      await page.waitForFunction(() => window.drafts.includes("56"));
      assert.deepEqual(await page.evaluate(() => window.saved), ["61"]);
      // Invalid/pending, zero, negative, unrelated controls and disposal.
      for (const [text, token, expected] of [
        ["--", "none", "70"],
        ["+9", "status:pending", "70"],
        ["0", "ready:0", "0"],
        ["-12", "ready:-13", "-12"],
        ["1000", "ready:999", "70"]
      ]) {
        await page.evaluate(({ text, token }) => window.mount(text, token), { text, token });
        const row = rows.last();
        await row.getByRole("button").click();
        assert.equal(await row.locator("input").inputValue(), expected);
      }
      // Delay the native editor to exercise the bounded observer and cancellation.
      for (const action of ["wait", "manual", "changed", "removed", "timeout", "off", "dispose"]) {
        await page.evaluate((action) => {
          const row = window.mount("+88");
          const button = row.querySelector("button");
          const edit = button.onclick;
          button.onclick = () => {
            window.finishEdit = edit;
          };
          button.click();
          if (action === "manual") {
            row.dispatchEvent(new Event("input", { bubbles: true }));
          } else if (action === "changed") {
            row.lastElementChild.textContent = "+89";
          } else if (action === "removed") {
            row.remove();
          } else if (action === "off") {
            document.querySelector(".mwi-labyrinth-prefill-toggle input").click();
          } else if (action === "dispose") {
            window.helper.dispose();
          }
        }, action);
        if (action === "timeout") await page.waitForTimeout(1100);
        await page.evaluate(() => window.finishEdit());
        if (action === "removed") {
          assert.equal(await rows.last().locator("input").inputValue(), "70");
        } else {
          assert.equal(await rows.last().locator("input").inputValue(), action === "wait" ? "88" : "70");
        }
        if (action === "off") await toggle.check();
        if (action === "dispose") await page.evaluate(() => window.helper.start());
      }
      await page.evaluate(() => {
        window.helper.dispose();
        window.mount("+99");
      });
      await rows.last().getByRole("button").click();
      assert.equal(await rows.last().locator("input").inputValue(), "70");
      assert.deepEqual(errors, []);
      results.push({ width, locale, passed: true });
      await page.close();
      console.log(`PASS labyrinth-prefill ${locale} ${width}`);
    }
} finally {
  await browser.close();
  fs.writeFileSync(`${directory}/matrix.json`, JSON.stringify(results, null, 2) + "\n");
}
console.log(`Report: ${directory}/matrix.json`);
