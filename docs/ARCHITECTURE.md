# Architecture

## Purpose and safety boundary

The project is a Tampermonkey userscript that reads data already exposed by
Milky Way Idle and presents planning calculations. It does not execute market
orders, guild exchanges, shrine upgrades, or building upgrades.

## Runtime data flow

1. src/bridge.js passively observes official game messages and exposes the
   latest read-only state to the userscript runtime.
2. src/market-data.js validates API snapshots and reconciles them with newer
   live quotes. Ask and bid metadata are maintained independently.
3. src/market-dom.js provides a narrow DOM fallback for market information
   that the player has already opened.
4. src/core.js performs conversion ranking, cost calculations, replacement
   estimates, and other pure planning logic.
5. src/runtime/config.js and src/runtime/storage.js own stable configuration,
   validated local persistence, and backward-compatible UI-state migration.
6. src/runtime/game-state.js normalizes the game's field aliases, while
   src/runtime/game-data.js hydrates cached initialization data and reconciles
   newer passive bridge updates with public market snapshots.
7. src/runtime/scheduler.js coalesces bursty refresh requests and cancels
   pending work when the page lifecycle ends.
8. src/ui/ contains the credit, shrine-upgrade, construction, native shrine
   guide, exchange-advisor, panel-shell, DOM-helper, and style modules.
9. src/userscript.js is the composition root: it creates shared state, injects
   dependencies into feature modules, integrates the sidebar, and owns teardown.
10. src/localization.js supplies all Chinese and English interface text.

The public game_data/marketplace.json snapshot is an estimate source, not
proof of full order-book depth. Guild exchange rules and character state must
come from data already present in the game page.

## Build and artifact flow

tools/build.js concatenates an explicit SOURCE_FILES list in dependency order.
Each boundary is marked in the generated runtime for debugging:

```text
core/data modules -> runtime modules -> UI modules -> userscript composition root
                  -> dist/runtime.js
                  -> dist/milky-way-idle-guild-credit-optimizer.user.js
                  -> dist/milky-way-idle-guild-credit-dev-loader.user.js
                  -> dist/test-harness.html
```

A normal build updates only dist/. During an explicit release,
MWI_ARCHIVE_RELEASE=1 additionally creates one immutable artifact under
releases/vMAJOR.MINOR/.

## Test boundaries

- Pure calculations and cache behavior are covered by Node tests.
- Runtime storage, game-state aliases, scheduling, module order, and DOM helpers
  have focused Node tests.
- The bridge is tested with official-domain fake WebSockets.
- Responsive and construction layouts use tools/test-harness.html.
- Release tests protect the whitelist and immutable archive behavior.
