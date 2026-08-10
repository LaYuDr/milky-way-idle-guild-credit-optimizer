# Project agent guide

## Product boundary

This is a read-only planning helper for Milky Way Idle. Changes must not add
automatic buying, selling, exchanging, upgrading, credential access, or account
data uploads.

## Module ownership

- src/core.js: pure calculations and reusable business rules.
- src/market-data.js: market snapshot and live-cache consistency.
- src/market-dom.js: read-only parsing of the game's market UI.
- src/bridge.js: passive capture of official game messages and page APIs.
- src/runtime/config.js: stable constants, URLs, storage keys, and feature flags.
- src/runtime/storage.js: validation and persistence for local plugin state.
- src/runtime/game-state.js: normalization of game-state field aliases.
- src/runtime/game-data.js: initialization hydration and market reconciliation.
- src/runtime/scheduler.js: coalesced refresh tasks and lifecycle cancellation.
- src/ui/: feature views, panel shell, shared DOM helpers, and styles.
- src/userscript.js: composition root, sidebar integration, and lifecycle wiring.
- src/localization.js: all user-facing Chinese and English copy.
- tools/build.js: deterministic current build and opt-in release archival.
- tools/release-current-version.mjs: guarded release workflow.

Business rules should be implemented as pure functions with tests before UI
integration. Do not add a second WebSocket arbitration path when the bridge and
market-data modules already cover the event.

Keep feature-specific rendering in src/ui/ rather than growing userscript.js.
New runtime modules must be added explicitly to SOURCE_FILES in tools/build.js
before src/userscript.js.

## Repository layout

- dist/ contains only the current installable and development artifacts.
- releases/vMAJOR.MINOR/ contains immutable historical userscript releases.
- references/ contains documented third-party source references.
- references/local-plugins/ contains visible but Git-ignored local reference
  plugins; it is never a build or release input.
- .workbench/ is ignored local storage for unfinished patches, screenshots,
  and exploratory files. It must never be published.

Generated files must be changed through npm run build or the release script;
do not hand-edit dist/ or releases/.

## Required verification

Run these before handing off code changes:

```bash
npm run check
git diff --check
npm run release:dry-run
```

For layout changes, also run the documented width-matrix audit in
docs/DEVELOPMENT.md.

Do not commit, push, publish, delete user data, or broaden automation behavior
without explicit authorization. Always stage an explicit file list; never run
the command “git add .”.
