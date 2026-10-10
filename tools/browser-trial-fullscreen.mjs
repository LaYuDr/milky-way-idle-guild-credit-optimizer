// Exercise the real browser API with trusted clicks, outside the synthetic fixture.
export async function auditTrialFullscreen(page, screenshotPath) {
  const host = page.locator('[data-role="trials-view"]');
  const enter = host.locator(".mwi-trial-toolbar [data-trial-fullscreen]");
  const exit = host.locator(".mwi-trial-fullscreen-bar [data-trial-fullscreen]");
  const checks = {};
  const snapshot = () =>
    page.evaluate(() =>
      JSON.stringify(
        Object.keys(localStorage)
          .filter((key) => key.startsWith("mwi-guild-trial-history-v1:"))
          .sort()
          .map((key) => [key, localStorage.getItem(key)])
      )
    );
  await host.locator('[data-trial-mode="week"]').click();
  const before = await snapshot();
  const selection = await host.locator('[data-trial-choice][aria-pressed="true"]').getAttribute("value");
  const sidebarWidth = await host.evaluate((element) => element.clientWidth);
  await enter.click();
  await page.waitForFunction(() => globalThis.document.fullscreenElement?.matches('[data-role="trials-view"]'));
  checks.entered = (await exit.getAttribute("aria-pressed")) === "true";
  checks.selectionRetained =
    selection === (await host.locator('[data-trial-choice][aria-pressed="true"]').getAttribute("value"));
  checks.fillsViewport = await host.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return (
      Math.abs(rect.width - globalThis.innerWidth) <= 1 &&
      Math.abs(rect.height - globalThis.innerHeight) <= 1 &&
      rect.left === 0 &&
      rect.top === 0 &&
      element.scrollWidth <= element.clientWidth + 1
    );
  });
  await host.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  checks.exitStaysVisible = await exit.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return rect.top >= 0 && rect.bottom <= globalThis.innerHeight;
  });
  await host.evaluate((element) => {
    element.scrollTop = 0;
  });
  await page.screenshot({ path: screenshotPath });
  for (const mode of ["project", "player", "week"]) {
    await host.locator(`[data-trial-mode="${mode}"]`).click();
    checks[`${mode}RemainsFullscreen`] =
      (await host.evaluate((element) => globalThis.document.fullscreenElement === element)) &&
      (await exit.getAttribute("aria-pressed")) === "true";
  }
  await host.locator('[data-trial-mode="project"]').click();
  checks.projectRowsFullscreen = await host.evaluate((element) => {
    const life = element.querySelector('[data-trial-project-kind="skilling"]').getBoundingClientRect();
    const combat = element.querySelector('[data-trial-project-kind="combat"]').getBoundingClientRect();
    return combat.top >= life.bottom;
  });
  await page.screenshot({ path: screenshotPath.replace(/\.png$/, "-projects.png") });
  await host.locator('[data-trial-mode="week"]').click();
  await host.locator('[data-trial-choice="week"]').last().click();
  checks.weekSelectionWorks =
    (await host.locator('[data-trial-choice="week"]').last().getAttribute("aria-pressed")) === "true";
  const viewport = page.viewportSize();
  await page.setViewportSize({ width: 390, height: 700 });
  checks.narrowViewportContained = await host.evaluate((element) => {
    const button = element.querySelector(".mwi-trial-fullscreen-bar button").getBoundingClientRect();
    return element.scrollWidth <= element.clientWidth + 1 && button.left >= 0 && button.right <= globalThis.innerWidth;
  });
  await page.screenshot({ path: screenshotPath.replace(/\.png$/, "-narrow.png") });
  await page.setViewportSize(viewport);
  await exit.click();
  await page.waitForFunction(() => !globalThis.document.fullscreenElement);
  checks.restoredSidebar =
    (await host.evaluate((element) => element.clientWidth)) === sidebarWidth &&
    (await enter.getAttribute("aria-pressed")) === "false";
  checks.focusRestored = await enter.evaluate((element) => globalThis.document.activeElement === element);
  await enter.click();
  await page.waitForFunction(() => Boolean(globalThis.document.fullscreenElement));
  await exit.press("Escape");
  await page.waitForFunction(() => !globalThis.document.fullscreenElement);
  checks.escapeExits = (await enter.getAttribute("aria-pressed")) === "false";
  await enter.click();
  await page.waitForFunction(() => Boolean(globalThis.document.fullscreenElement));
  await page.evaluate(() => globalThis.document.exitFullscreen());
  await page.waitForFunction(
    () =>
      globalThis.document.querySelector(".mwi-trial-toolbar [data-trial-fullscreen]")?.getAttribute("aria-pressed") ===
      "false"
  );
  checks.browserExitSyncs = await enter.isVisible();
  await host.evaluate((element) => {
    element.requestFullscreen = () => Promise.reject(new Error("Denied for audit"));
  });
  await enter.click();
  await page.waitForFunction(() =>
    Boolean(globalThis.document.querySelector("[data-trial-fullscreen-status]")?.textContent)
  );
  checks.deniedRequestRecoverable = (await enter.isEnabled()) && (await enter.getAttribute("aria-pressed")) === "false";
  await host.evaluate((element) => {
    element.requestFullscreen = undefined;
  });
  await enter.click();
  checks.unsupportedRecoverable =
    (await enter.isEnabled()) && Boolean(await host.locator("[data-trial-fullscreen-status]").textContent());
  await host.evaluate((element) => {
    delete element.requestFullscreen;
  });
  checks.historyUnchanged = before === (await snapshot());
  // Panel replacement removes the fullscreen element; the browser must release it.
  await enter.click();
  await page.waitForFunction(() => Boolean(globalThis.document.fullscreenElement));
  await host.evaluate((element) => element.closest("#mwi-credit-optimizer").remove());
  await page.waitForFunction(() => !globalThis.document.fullscreenElement);
  checks.removalExits = true;
  return checks;
}
