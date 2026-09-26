"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const config = require("../src/runtime/config.js");
const settingsViewApi = require("../src/ui/settings-view.js");

const root = path.resolve(__dirname, "..");

test("运行时配置集中保留既有信用点、存储键与只读安全边界", () => {
  assert.equal(config.CREDIT_TYPES.length, 8);
  assert.equal(config.GUILD_TOKEN_CREDIT_CONVERSIONS.length, 8);
  assert.equal(config.UI_STATE_STORAGE_KEY, "mwi-guild-credit-ui-state-v1");
  assert.equal(config.MARKET_LIVE_STORAGE_KEY, "mwi-guild-credit-live-market-v1");
  assert.equal(config.MARKETPLACE_SNAPSHOT_PATH, "/game_data/marketplace.json");
  assert.equal(config.MARKETPLACE_SNAPSHOT_STORAGE_KEY, "mwi-guild-credit-market-snapshot-v1");
  assert.equal(config.MARKETPLACE_REQUEST_STATE_STORAGE_KEY, "mwi-guild-credit-market-request-v1");
  assert.deepEqual(config.MARKETPLACE_SNAPSHOT_ORIGINS, [
    "https://www.milkywayidle.com",
    "https://www.milkywayidlecn.com",
    "https://q7.nainai.eu.org"
  ]);
  assert.equal(config.MARKETPLACE_SNAPSHOT_MAX_AGE_MS, 15 * 60 * 1000);
  assert.equal(config.MARKETPLACE_SNAPSHOT_REFRESH_COOLDOWN_MS, 60 * 1000);
  assert.equal(config.MARKETPLACE_SNAPSHOT_FORBIDDEN_BACKOFF_MS, 10 * 60 * 1000);
  assert.equal(config.SELLER_TAX_RATE, 0.05);
  assert.deepEqual(config.PANEL_VIEWS, ["credit", "upgrade", "construction", "trials"]);
  assert.deepEqual(config.DEFAULT_PANEL_ORDER, ["upgrade", "credit", "construction", "trials"]);
});

test("构建入口使用显式且无重复的模块清单并最后启动 userscript", () => {
  const source = fs.readFileSync(path.join(root, "tools", "build.js"), "utf8");
  const listMatch = /const SOURCE_FILES = \[([\s\S]*?)\];/.exec(source);
  assert.ok(listMatch, "tools/build.js should declare SOURCE_FILES");
  const files = Array.from(listMatch[1].matchAll(/"([^"]+\.js)"/g), (match) => match[1]);
  assert.equal(files.length, new Set(files).size);
  assert.equal(files.at(-1), "src/userscript.js");
  const requiredModules = [
    "src/trial-history.js",
    "src/ui/trial-history-view.js",
    "src/runtime/config.js",
    "src/runtime/storage.js",
    "src/runtime/scheduler.js",
    "src/runtime/game-state.js",
    "src/runtime/game-data.js",
    "src/ui/dom.js",
    "src/ui/sortable.js",
    "src/ui/sidebar-dom.js",
    "src/ui/sidebar-interaction.js",
    "src/ui/sidebar-integration.js",
    "src/ui/styles.js",
    "src/ui/upgrade-view.js",
    "src/ui/settings-view.js",
    "src/ui/construction-view.js",
    "src/ui/shrine-guide-ui.js",
    "src/ui/exchange-advisor.js",
    "src/ui/panel-shell.js",
    "src/ui/credit-view.js"
  ];
  for (const file of requiredModules) assert.ok(files.includes(file), `missing module entry ${file}`);
  const userscriptIndex = files.indexOf("src/userscript.js");
  assert.ok(requiredModules.every((file) => files.indexOf(file) < userscriptIndex));
  assert.ok(files.indexOf("src/runtime/config.js") < files.indexOf("src/trial-history.js"));
  assert.ok(files.indexOf("src/ui/upgrade-view.js") < files.indexOf("src/ui/settings-view.js"));
  assert.ok(files.indexOf("src/ui/settings-view.js") < files.indexOf("src/ui/panel-shell.js"));
  for (const file of ["src/ui/sidebar-dom.js", "src/ui/sidebar-interaction.js"]) {
    assert.ok(files.indexOf(file) < files.indexOf("src/ui/sidebar-integration.js"));
  }
  for (const file of files) assert.equal(fs.existsSync(path.join(root, file)), true, `missing ${file}`);
});

test("组合入口保持精简并在页面退出时统一清理运行时资源", () => {
  const source = fs.readFileSync(path.join(root, "src", "userscript.js"), "utf8");
  assert.ok(source.split(/\r?\n/).length <= 1050, "src/userscript.js should remain a composition root");
  assert.match(source, /function disposeRuntime\(\)/);
  assert.match(source, /\.dispose\(\)/);
  assert.match(source, /window\.addEventListener\("pagehide", disposeRuntime/);
});

test("设置视图按官方增益标识呈现正向选择并同步本地设置状态", () => {
  const state = {
    settingsOpen: true,
    guildBuffDetails: {},
    guildShrineAutofillExcludedBuffHrids: new Set(["/guild_buffs/combat"]),
    showConstructionView: false,
    showTrialHistoryView: false
  };
  const entries = [
    { hrid: "/guild_buffs/life", detail: { isCombat: false, label: "Life Shrine" } },
    { hrid: "/guild_buffs/combat", detail: { isCombat: true, label: "Combat Shrine" } }
  ];
  const focused = { id: "mwi-settings-show-trials", isConnected: true };
  let restoredFocus = false;
  const replacement = {
    focus: () => {
      restoredFocus = true;
    }
  };
  const content = {
    ownerDocument: { activeElement: focused, getElementById: (id) => (id === focused.id ? replacement : null) },
    contains: (element) => element === focused || element === replacement
  };
  const shrineInputs = entries.map((entry) => ({ dataset: { guildBuffHrid: entry.hrid }, checked: null }));
  const constructionInput = { checked: null };
  const trialsInput = { checked: null };
  const settingsPanel = {
    hidden: true,
    querySelector(selector) {
      if (selector === '[data-role="settings-content"]') return content;
      if (selector === '[data-role="settings-show-construction"]') return constructionInput;
      if (selector === '[data-role="settings-show-trials"]') return trialsInput;
      return null;
    },
    querySelectorAll(selector) {
      return selector === '[data-role="settings-shrine-autofill"]' ? shrineInputs : [];
    }
  };
  const api = settingsViewApi.createSettingsView({
    core: require("../src/core.js"),
    guildBuildingSpriteBaseHref: () => "/misc_sprite.svg",
    guildBuildingIconMarkup: () => '<svg aria-hidden="true"></svg>',
    state,
    t: (key) => key,
    ui: () => ({ locale: "en" }),
    escapeHtml: (value) => String(value),
    guildBuffEntries: () => entries,
    guildBuffLabel: (detail) => detail.label,
    updateRenderedMarkup(element, markup) {
      element.innerHTML = markup;
      focused.isConnected = false;
    }
  });

  const markup = api.renderSettingsMarkup();
  assert.match(markup, /id="mwi-settings-panel"/);
  assert.match(markup, /data-role="settings-shrine-autofill"/);
  assert.match(markup, /data-role="settings-show-construction"[^>]*role="switch"/);
  assert.match(markup, /data-role="settings-status"[^>]*role="status"/);

  const refreshed = api.refreshSettings({ querySelector: () => settingsPanel });
  assert.equal(refreshed, settingsPanel);
  assert.equal(settingsPanel.hidden, false);
  assert.equal(shrineInputs[0].checked, true);
  assert.equal(shrineInputs[1].checked, false);
  assert.equal(constructionInput.checked, false);
  assert.equal(trialsInput.checked, false);
  assert.equal(restoredFocus, true, "图片加载重绘后恢复显示开关的焦点");
  assert.match(markup, /id="mwi-settings-show-trials"[^>]*data-role="settings-show-trials"/);
  assert.match(content.innerHTML, /data-domain="life"/);
  assert.match(content.innerHTML, /data-domain="combat"/);
});

test("设置视图区分神龛规则读取中与已读取空结果", () => {
  const state = { settingsOpen: true, guildBuffDetails: null };
  const api = settingsViewApi.createSettingsView({
    core: require("../src/core.js"),
    guildBuildingSpriteBaseHref: () => "/misc_sprite.svg",
    guildBuildingIconMarkup: () => '<svg aria-hidden="true"></svg>',
    state,
    t: (key) => key,
    ui: () => ({ locale: "en" }),
    escapeHtml: (value) => String(value),
    guildBuffEntries: () => [],
    guildBuffLabel: () => "",
    updateRenderedMarkup: () => false
  });

  assert.match(api.renderSettingsMarkup(), /data-role="settings-shrines-loading"[^>]*role="status"/);
  state.guildBuffDetails = {};
  assert.match(api.renderSettingsMarkup(), /data-role="settings-shrines-empty"[^>]*role="status"/);
});

test("神龛设置显示游戏图标、独立每级效果与中英文说明", () => {
  const localization = require("../src/localization.js");
  for (const locale of ["zh-CN", "en"]) {
    const localizer = localization.createLocalizer(locale);
    const entries = [
      {
        hrid: "/guild_buffs/tempo_combat",
        detail: {
          shrineHrid: "/guild_shrines/tempo",
          isCombat: true,
          buffs: [
            { typeHrid: "/buff_types/attack_speed", ratioBoost: 0.004, ratioBoostLevelBonus: 0.004 },
            { typeHrid: "/buff_types/cast_speed", flatBoost: 0.004, flatBoostLevelBonus: 0.004 },
            { typeHrid: "/buff_types/max_hitpoints", ratioBoost: 0.02, ratioBoostLevelBonus: 0.01 }
          ]
        }
      }
    ];
    const api = settingsViewApi.createSettingsView({
      core: require("../src/core.js"),
      state: { settingsOpen: true },
      t: localizer.t,
      ui: () => ({ locale }),
      escapeHtml: String,
      guildBuffEntries: () => entries,
      guildBuffLabel: () => "Tempo",
      guildBuildingSpriteBaseHref: () => "/misc_sprite.svg",
      guildBuildingIconMarkup: (definition, sprite) => {
        assert.equal(definition.hrid, "/guild_shrines/tempo");
        assert.equal(sprite, "/misc_sprite.svg");
        return '<svg aria-hidden="true"><use href="/misc_sprite.svg#guild_shrine_tempo"></use></svg>';
      },
      updateRenderedMarkup: () => false
    });
    const markup = api.renderSettingsMarkup();
    assert.match(markup, /#guild_shrine_tempo/);
    assert.match(markup, /aria-describedby="mwi-settings-autofill--guild_buffs-tempo_combat-effects"/);
    assert.match(
      markup,
      locale === "zh-CN"
        ? /每级：攻击速度 \+0.4%<br>每级：施法速度 \+0.4%/
        : /Per level: Attack speed \+0.4%<br>Per level: Cast speed \+0.4%/
    );
    assert.match(markup, locale === "zh-CN" ? /首级 \+2%；后续每级 \+1%/ : /level 1 \+2%; each later level \+1%/);
    entries[0].detail.buffs = undefined;
    assert.match(
      api.renderSettingsMarkup(),
      locale === "zh-CN" ? /每级效果暂未读取/ : /Per-level effects not yet available/
    );
  }
});
