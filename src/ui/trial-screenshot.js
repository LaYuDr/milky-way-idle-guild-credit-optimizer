(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MwiGuildTrialScreenshot = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // Bound allocation before creating a canvas; never silently crop or shrink text.
  function imageSize(width, height) {
    width = Math.ceil(width);
    height = Math.ceil(height);
    if (!(width > 0 && height > 0) || width > 16000 || height > 16000 || width * height > 24000000)
      throw Object.assign(new Error("Screenshot exceeds canvas budget"), { code: "trialScreenshotTooLarge" });
    const scale = Math.min(2, 16000 / width, 16000 / height, Math.sqrt(24000000 / (width * height)));
    return { width, height, pixelWidth: Math.floor(width * scale), pixelHeight: Math.floor(height * scale) };
  }

  const STYLE_PROPERTIES = (
    "display box-sizing width height min-width min-height max-width max-height margin-top margin-right margin-bottom margin-left " +
    "padding-top padding-right padding-bottom padding-left border-top border-right border-bottom border-left border-radius " +
    "border-collapse border-spacing table-layout background-color color opacity font-family font-size font-weight font-style " +
    "font-variant-numeric line-height letter-spacing text-align text-decoration text-transform text-indent white-space " +
    "word-break overflow-wrap vertical-align overflow overflow-x overflow-y position top right bottom left z-index " +
    "flex-direction flex-wrap flex-grow flex-shrink flex-basis align-items align-self align-content justify-content " +
    "gap justify-items grid-template-columns grid-auto-flow grid-auto-columns grid-column grid-row " +
    "list-style-type clip-path visibility fill stroke stroke-width"
  ).split(" ");

  function snapshot(host, document, pageWindow) {
    const stage = document.createElement("div");
    stage.dataset.trialScreenshotStage = "";
    stage.inert = true;
    stage.setAttribute("aria-hidden", "true");
    stage.style.cssText = "position:fixed;left:-100000px;top:0;width:1200px;pointer-events:none;";
    const copy = host.cloneNode(true);
    // Icon-only skills/equipment carry information: retain their accessible labels.
    for (const slot of copy.querySelectorAll(".mwi-trial-equipment-slot[aria-label]")) {
      const label = document.createElement("span");
      label.className = "mwi-trial-slot-label";
      label.textContent = slot.getAttribute("aria-label");
      slot.replaceChildren(label);
      Object.assign(slot.style, { aspectRatio: "auto", minHeight: "64px", padding: "4px" });
    }
    // Only the selected view is captured. Remove navigation and implementation details,
    // but retain selected labels to identify the week/project and the visible columns.
    copy
      .querySelectorAll(
        ".mwi-trial-toolbar .mwi-trial-controls,.mwi-trial-guide,.mwi-trial-display-settings," +
          ".mwi-trial-scroll-buttons,.mwi-trial-player-picker,.mwi-trial-raw,.mwi-trial-import-preview," +
          "[data-role='trial-import-status'],[data-trial-image-status],[data-trial-image-help],input," +
          "[data-trial-player-back],[data-trial-profile-refresh]," +
          "[data-trial-mode][aria-pressed='false'],[data-trial-choice][aria-pressed='false']," +
          "script,style,iframe,svg[aria-hidden='true'],img"
      )
      .forEach((element) => element.remove());
    for (const element of [copy, ...copy.querySelectorAll("*")]) {
      element.removeAttribute("id");
      if (element.matches(".mwi-trial-member-highlight,.mwi-trial-player-selected"))
        element.classList.remove("mwi-trial-member-highlight", "mwi-trial-player-selected");
    }
    copy.style.cssText =
      "display:block;width:1200px;max-width:none;height:auto;max-height:none;padding:24px;background:#191c2e;box-sizing:border-box;";
    stage.appendChild(copy);
    host.parentElement.appendChild(stage);
    try {
      for (const element of copy.querySelectorAll("[data-trial-scroll-id],.mwi-trial-table-scroll")) {
        Object.assign(element.style, { overflow: "visible", maxWidth: "none", maxHeight: "none", height: "auto" });
      }
      for (const element of copy.querySelectorAll(".mwi-trial-columns")) {
        Object.assign(element.style, {
          gridTemplateColumns: "repeat(2, max-content)",
          gridAutoFlow: "row",
          gridAutoColumns: "auto",
          gap: "24px"
        });
      }
      for (const element of copy.querySelectorAll("th")) element.style.position = "static";
      // Expand to include wide tables rather than clipping the rightmost column.
      const width = Math.max(1200, copy.scrollWidth + 24);
      copy.style.width = `${width}px`;
      imageSize(width, Math.max(copy.scrollHeight, copy.getBoundingClientRect().height));
      // Freeze computed styles while still under the real panel's CSS selectors.
      const nodes = [copy, ...copy.querySelectorAll("*")];
      const styles = nodes.map((element) => {
        const computed = pageWindow.getComputedStyle(element);
        return STYLE_PROPERTIES.map((name) => `${name}:${computed.getPropertyValue(name)};`).join("");
      });
      nodes.forEach((element, index) => {
        element.style.cssText = styles[index];
        // Used table-cell heights include padding in some engines. Reapplying them
        // as CSS heights grows rows and overlaps subsequent sections in the SVG.
        if (element.namespaceURI !== "http://www.w3.org/2000/svg") element.style.height = "auto";
      });
      copy.style.containerType = "normal";
      const size = imageSize(width, Math.max(copy.scrollHeight, copy.getBoundingClientRect().height));
      copy.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
      const content = new pageWindow.XMLSerializer().serializeToString(copy);
      return {
        ...size,
        svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${size.width}" height="${size.height}"><foreignObject width="100%" height="100%">${content}</foreignObject></svg>`
      };
    } finally {
      stage.remove();
    }
  }

  async function renderPng(host, { document, pageWindow }) {
    const captured = snapshot(host, document, pageWindow);
    const image = new pageWindow.Image();
    await new Promise((resolve, reject) => {
      const timer = pageWindow.setTimeout(() => {
        image.src = "";
        reject(new Error("Image timeout"));
      }, 15000);
      image.onload = () => {
        pageWindow.clearTimeout(timer);
        resolve();
      };
      image.onerror = () => {
        pageWindow.clearTimeout(timer);
        reject(new Error("Image decode failed"));
      };
      // A self-contained data URL avoids external assets and SVG blob origin tainting.
      image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(captured.svg)}`;
    });
    const canvas = document.createElement("canvas");
    canvas.width = captured.pixelWidth;
    canvas.height = captured.pixelHeight;
    try {
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas unavailable");
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      return await new Promise((resolve, reject) => {
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("PNG encoding failed"))), "image/png");
      });
    } finally {
      canvas.width = canvas.height = 0;
      image.src = "";
    }
  }

  function download(blob, { document, pageWindow }) {
    const url = pageWindow.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `guild-trial-${new Date().toISOString().replace(/[:.]/g, "-")}.png`;
    document.body.appendChild(anchor);
    try {
      anchor.click();
    } finally {
      anchor.remove();
      pageWindow.setTimeout(() => pageWindow.URL.revokeObjectURL(url), 60000);
    }
  }

  async function deliverPng(png, target, environment) {
    const { pageWindow } = environment;
    if (target === "copy") {
      try {
        if (!pageWindow.navigator.clipboard?.write || !pageWindow.ClipboardItem)
          throw new Error("Clipboard unavailable");
        await pageWindow.navigator.clipboard.write([new pageWindow.ClipboardItem({ "image/png": png })]);
        return "trialScreenshotCopied";
      } catch (error) {
        download(await png, environment);
        return "trialScreenshotFallback";
      }
    }
    download(await png, environment);
    return "trialScreenshotDownloaded";
  }

  function exportImage(host, target, environment) {
    // Schedule rendering after registering the clipboard write during user activation.
    return deliverPng(
      Promise.resolve().then(() => renderPng(host, environment)),
      target,
      environment
    );
  }

  return { imageSize, snapshot, renderPng, deliverPng, exportImage };
});
