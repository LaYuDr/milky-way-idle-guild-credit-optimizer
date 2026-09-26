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
    const projectView = Boolean(host.querySelector('[data-trial-mode="project"][aria-pressed="true"]'));
    if (projectView) {
      // History timelines are newest first. Limit the image only, never stored data.
      for (const timeline of copy.querySelectorAll(".mwi-trial-timeline"))
        [...timeline.children].slice(5).forEach((column) => column.remove());
    }
    // Only the selected view is captured. Remove navigation and implementation details,
    // but retain selected labels to identify the week/project and the visible columns.
    copy
      .querySelectorAll(
        ".mwi-trial-toolbar .mwi-trial-controls,.mwi-trial-guide,.mwi-trial-display-settings," +
          ".mwi-trial-scroll-buttons,.mwi-trial-player-picker,.mwi-trial-raw,.mwi-trial-import-preview," +
          "[data-role='trial-import-status'],[data-trial-image-status],[data-trial-image-help],input," +
          "[data-trial-player-back],[data-trial-profile-refresh],.mwi-trial-ranking-controls,[data-trial-ranking-order-hint],[data-trial-ranking-order-status]," +
          "[data-trial-mode][aria-pressed='false'],[data-trial-choice][aria-pressed='false']," +
          "script,style,iframe,img"
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
        const columns = element.classList.contains("mwi-trial-timeline")
          ? Math.min(5, element.children.length)
          : element.dataset.kind === "rankings"
            ? element.children.length
            : element.dataset.kind === "combat"
              ? 2
              : 4;
        Object.assign(element.style, {
          gridTemplateColumns: `repeat(${Math.max(1, columns)}, max-content)`,
          gridAutoFlow: "row",
          gridAutoColumns: "auto",
          gap: "24px"
        });
      }
      for (const element of copy.querySelectorAll("th")) element.style.position = "static";
      // Expand to include wide tables rather than clipping the rightmost column.
      const columns = [...copy.querySelectorAll(".mwi-trial-columns > .mwi-trial-column")];
      const origin = copy.getBoundingClientRect().left;
      const contentRight = Math.max(0, ...columns.map((column) => column.getBoundingClientRect().right - origin));
      const width = Math.ceil(Math.max(copy.querySelector(".mwi-trial-player-layout") ? 1200 : 480, contentRight + 24));
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

  const spriteCache = new Map();

  async function embedSprites(svg, pageWindow) {
    const parser = new pageWindow.DOMParser();
    const image = parser.parseFromString(svg, "image/svg+xml");
    const uses = [...image.querySelectorAll("use")];
    const sources = new Map();
    for (const use of uses) {
      const href = use.getAttribute("href") || use.getAttribute("xlink:href");
      if (!href || href.startsWith("#")) continue;
      const url = new URL(href, pageWindow.location.href);
      const id = decodeURIComponent(url.hash.slice(1));
      url.hash = "";
      if (!sources.has(url.href)) sources.set(url.href, []);
      sources.get(url.href).push({ use, id });
    }
    let index = 0;
    for (const [url, entries] of sources) {
      if (!spriteCache.has(url)) {
        const pending = (async () => {
          const controller = new pageWindow.AbortController();
          const timer = pageWindow.setTimeout(() => controller.abort(), 10000);
          try {
            const response = await pageWindow.fetch(url, { cache: "force-cache", signal: controller.signal });
            if (!response.ok) throw new Error("Sprite unavailable");
            const parsed = parser.parseFromString(await response.text(), "image/svg+xml");
            if (parsed.querySelector("parsererror")) throw new Error("Invalid sprite");
            return parsed;
          } finally {
            pageWindow.clearTimeout(timer);
          }
        })();
        spriteCache.set(url, pending);
        pending.catch(() => spriteCache.delete(url));
      }
      let source;
      try {
        source = await spriteCache.get(url);
      } catch (error) {
        throw Object.assign(error, { code: "trialScreenshotIconFailed" });
      }
      const prefix = `mwi-image-${index++}-`;
      const defs = image.createElementNS("http://www.w3.org/2000/svg", "defs");
      const included = new Set();
      const include = (id) => {
        if (included.has(id)) return;
        included.add(id);
        const original = source.getElementById(id);
        if (!original) throw Object.assign(new Error("Missing sprite symbol"), { code: "trialScreenshotIconFailed" });
        const copy = image.importNode(original, true);
        for (const node of [copy, ...copy.querySelectorAll("*")]) {
          if (node.id) node.id = prefix + node.id;
          for (const attribute of [...node.attributes]) {
            let value = attribute.value;
            if (attribute.localName === "href" && value.startsWith("#")) {
              include(value.slice(1));
              value = "#" + prefix + value.slice(1);
            }
            value = value.replace(/url\(["']?#([^\s)'"]+)["']?\)/g, (_match, reference) => {
              include(reference);
              return `url(#${prefix}${reference})`;
            });
            node.setAttributeNS(attribute.namespaceURI, attribute.name, value);
          }
        }
        defs.appendChild(copy);
      };
      for (const { use, id } of entries) {
        include(id);
        use.removeAttribute("xlink:href");
        use.setAttribute("href", `#${prefix}${id}`);
      }
      image.documentElement.prepend(defs);
    }
    return new pageWindow.XMLSerializer().serializeToString(image);
  }

  async function renderPng(host, { document, pageWindow }) {
    const captured = snapshot(host, document, pageWindow);
    const svg = await embedSprites(captured.svg, pageWindow);
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
      image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
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

  return { imageSize, snapshot, renderPng, embedSprites, deliverPng, exportImage };
});
