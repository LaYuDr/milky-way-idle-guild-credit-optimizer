# Changelog

All notable changes to this project are documented in this file.

## [1.1.42] - 2026-08-10

### Changed

- Rebuilt Guild Construction as a compact administrator workspace with a budget command deck, dense searchable building catalog, planned-building emphasis, and a responsive catalog/queue split view.
- Budget and search input now update their relevant preview in place, preserving input focus instead of rebuilding the whole construction view.
- Refined shrine exchange quantity guidance into an inline row that distinguishes the remaining plan total from the amount to enter in the current exchange and avoids covering unrelated controls.

### Verified

- Added construction source contracts and browser audits for Chinese and English layouts at 320px, 420px, 666px, and 900px, covering overflow, overlap, search focus, queue steps, and the budget cutoff.
- Added shrine guidance coverage for selected-item mismatches, inline placement, topmost-input checks, and the revised quantity labels.

## [1.1.41] - 2026-08-10

### Changed

- Redesigned the shrine guide quantity prompt as a compact input popover that emphasizes the suggested batch count, removes duplicate normal-state totals, and only shows total versus per-exchange limits when necessary.

## [1.1.40] - 2026-08-10

### Added

- Added a live quantity ticket beside the native guild exchange input while shrine guidance is active, showing the exact batch count to enter without modifying the game input.
- When the remaining requirement exceeds the native per-exchange maximum, the ticket shows both the suggested amount for this exchange and the total batches still required.

### Changed

- Quantity guidance now follows the native input while scrolling or resizing and is removed immediately when the exchange modal closes or guidance moves to another step.

### Verified

- Added state coverage for native exchange limits and source integration checks for tooltip anchoring, cleanup, accessibility, and modal removal.

## [1.1.39] - 2026-08-10

### Changed

- Remembered the last open Guild Assistant view across page refreshes and browser restarts, covering Shrine Upgrade, Credit Value, and Guild Construction.
- Restored the saved tab selection, matching content visibility, and view-specific data refresh while safely falling back to Credit Value for missing or invalid legacy state.

### Verified

- Added source integration coverage for saving, validating, restoring, and refreshing all three internal views.

## [1.1.38] - 2026-08-10

### Added

- Added an optional read-only shrine planning guide that highlights every outstanding guild credit, the recommended exchange item, the required exchange batch input, and the matching life or combat shrine.
- Added a deterministic guide state module with explicit loading, unavailable, blocked, completion, market-item, and guild-token routes.

### Changed

- Shrine guidance now advances from live inventory and personal shrine-level revisions while ignoring duplicate level snapshots.
- Native-game highlighting uses item and shrine HRIDs as stable identifiers, limits observation to relevant guild and modal surfaces, and respects reduced-motion preferences.

### Verified

- Added focused state-transition, bridge-revision, bundle-integration, persistence, and accessibility wiring tests.

## [1.1.37] - 2026-08-10

### Added

- Added a read-only Guild Construction workspace for presidents and administrators, covering all 23 ordinary guild buildings and 5 shrines through level 20.
- Added per-character saved targets, manual guild-point budgets, reorderable step-by-step construction queues, a visible over-budget cutoff, clipboard copy, and CSV export.
- Added a deterministic guild-building rule module and a responsive construction audit fixture with live building-level samples.
- Ordinary development builds now preserve an existing versioned historical bundle; the release workflow explicitly opts in when creating the new release archive.

### Safety

- Construction planning never performs upgrades or guesses the guild's available points; administrators provide the budget manually when no reliable live balance is exposed.

## [1.1.33] - 2026-08-01

### Changed

- Made Shrine Upgrades the default view when the guild assistant is first opened.
- Redesigned Credit Value with the shrine planner's compact visual system: a unified control toolbar, denser guild-token overview, color-coded exchange cards, at-a-glance best costs, and a narrow-layout metric grid.
- Preserved unchanged credit-result markup during refreshes to avoid unnecessary visual rebuilding.

### Verified

- Browser-tested the default view and the complete Credit Value control cycle in Chinese and English at 320px, 420px, 610px, and 900px without text overflow, boundary escapes, or control overlap.

## [1.1.32] - 2026-08-01

### Fixed

- Prevented periodic live-data refreshes from rebuilding unchanged shrine selectors and result cards, eliminating the recurring planner flicker.
- Removed decorative plan-number circles, route accents, green row highlights, and row-entry animation from the shrine planner.

### Verified

- Added a planner-stability audit that simulates three live inventory revisions and checks that unchanged plan DOM nodes are preserved without mutations or horizontal overflow.

## [1.1.31] - 2026-08-01

### Fixed

- Removed the forced monospace fallback from shrine-plan amounts, percentages, number inputs, and route markers so Chinese labels and numbers use the same system font as the rest of the plugin while retaining tabular numeral alignment.

## [1.1.30] - 2026-08-01

### Changed

- Redesigned the shrine upgrade workspace as a compact connected route, with a calmer preset toolbar, clearer numeric hierarchy, visible keyboard focus, and reduced-motion support.
- Kept four shrine plans on single lines at a 420px sidebar while reserving the two-line layout for narrower panels; widened material totals so five-digit values remain inside their cards.

### Verified

- Extended the responsive harness to report text overflow, child boundary escapes, and interactive-control overlap in addition to whole-panel horizontal overflow.
- Browser-tested dense Chinese and English states from 320px through 900px, including empty/add/remove plan transitions and synchronized token-budget input.

## [1.1.29] - 2026-08-01

### Removed

- Removed the current arbitrary-item exchange lookup UI, dedicated comparison logic, localization strings, and test-harness audit pending a future redesign.

## [1.1.28] - 2026-08-01

### Changed

- Refined the arbitrary-item exchange lookup with a clearer centered layout, stronger focus and hover feedback, animated result cards, and denser responsive metrics.

## [1.1.27] - 2026-08-01

### Added

- Added an arbitrary-item exchange lookup that searches localized names, English names, or item HRIDs and reports the official guild-credit ratio, current market reference, cost per credit, target cost, same-credit ranking, and relative gap from the best item.
- Items that exist in game data but cannot be exchanged, ambiguous searches, missing items, and missing market quotes now have distinct, explicit states.

### Changed

- Reordered the internal tabs so Shrine Upgrade appears before Credit Value while preserving Credit Value as the default open view.
- Added compact responsive query cards that remain free of horizontal overflow from 288px to 868px of tested panel width.

## [1.1.26] - 2026-08-01

### Fixed

- The ordinary remove button can now delete the final shrine-upgrade plan without the planner immediately recreating a default row.

## [1.1.25] - 2026-08-01

### Added

- Added a live percentage indicator and visible 20%, 40%, 50%, 60%, 80%, and 100% reference marks to the automatic guild-token budget slider.

### Changed

- Pointer dragging now magnetically settles near each reference percentage while number and keyboard input remain exact; the responsive budget row also preserves a usable slider width on narrow sidebars.

## [1.1.24] - 2026-08-01

### Added

- Added a repeatable responsive-layout audit mode to the local test harness, covering 11 sidebar widths from 320px to 1200px and reporting actual overflow, row heights, layout bands, and grid states.

### Changed

- Moved the single-line shrine planner down to the 460px sidebar range and the fully inline material rows down to the 610px range.
- Tightened narrow-screen shrine controls, token-budget controls, summaries, and material recommendation rows while preserving zero structural horizontal overflow across the audit matrix.

## [1.1.21] - 2026-08-01

### Added

- Automatically allocates available guild tokens to missing shrine credits from highest to lowest current market exchange value, while keeping the best-item recommendation for any partially covered remainder.
- Added synchronized slider and number inputs for limiting the automatic guild-token budget; the chosen limit is saved between page loads.

### Changed

- Automatic allocations reserve shrine token costs and manually selected credit exchanges first, and skip credit types without a verified market price.

## [1.1.20] - 2026-08-01

### Fixed

- Kept the plugin entry visible when the game switches between wide and narrow character-management layouts by migrating the tab and panel to the currently visible tab container on resize.

## [1.1.19] - 2026-08-01

### Changed

- Hid the all-credit guild-token shortcut so shrine plans are controlled only by each credit card's persistent exchange-mode button.

## [1.1.18] - 2026-08-01

### Added

- Added a persistent exchange-mode button to every shrine-plan credit card, allowing each guild credit to independently use either its best market item or the fixed guild-token exchange.
- The existing all-credit toggle now acts as a select-all shortcut and shows a mixed state when only some credit types use guild tokens.

### Changed

- Mixed shrine plans now combine market-priced items for unselected credits with guild-token requirements for selected credits in one cost summary.

## [1.1.17] - 2026-08-01

### Fixed

- Shrine-plan inventory now follows the game's `endCharacterItems` WebSocket deltas in real time, merging stacks by the native item hash and removing zero-count stacks.
- Visible shrine plans and guild-exchange advice now recalculate after an inventory revision instead of continuing to display the initialization snapshot.

## [1.1.16] - 2026-08-01

### Added

- Added a shrine-planning toggle that converts every missing guild credit through the fixed guild-token exchange rates, merges those tokens into the total requirement and inventory gap, and replaces market-item recommendations with per-credit token exchange details.

## [1.1.15] - 2026-07-31

### Fixed

- Added an isolated-world-safe native market DOM observer as a fallback data channel. Whenever the player opens or refreshes an item market page, it records that item's HRID, enhancement level, full visible ask/bid depth, source, and timestamp even if page-world WebSocket wrapping is unavailable.

## [1.1.14] - 2026-07-31

### Fixed

- The production userscript now explicitly requests Tampermonkey's raw page sandbox before installing its passive WebSocket observer, avoiding isolated-world `unsafeWindow` proxy assignments that do not replace the game's real constructor.
- Added machine-readable bridge diagnostics so live verification can prove which injection path ran and which market item, ask, bid, and timestamp were most recently observed.

## [1.1.13] - 2026-07-31

### Fixed

- The production userscript now requests Tampermonkey's `unsafeWindow` bridge so its passive WebSocket observer is installed in the game page context and can receive native live market order-book updates.

## [1.1.12] - 2026-07-31

### Changed

- Rebuilt the official userscript entry points from the completed live-market reconciliation implementation so distributed builds consistently report version 1.1.12.

## [1.1.11] - 2026-07-26

### Changed

- Reworked live market quote handling around the proven reference-script model: ask and bid updates are tracked independently, official game WebSocket messages remain passive, and current-session quotes continue to override older public snapshots.
- Conflicting public snapshots now defer live-quote eviction once to avoid races with a WebSocket response that arrived during the request.
- Public marketplace snapshots that unexpectedly omit previously confirmed entries must be observed consistently before they can replace complete data.
- Existing v1 live-quote caches are migrated to the new per-field metadata format instead of being discarded.

## [1.1.10] - 2026-07-26

### Fixed

- Live market quotes received from native item market pages are now persisted across page reloads and browser restarts instead of existing only in the current page's memory.
- Persisted quotes retain their public-snapshot baseline, are replaced by the next native order-book update for the same item and level, and are removed only after a genuinely newer public marketplace snapshot supersedes them.
- Invalid or incompatible cached market data is ignored safely without affecting the game.

## [1.1.9] - 2026-07-26

### Changed

- Credit rankings, guild-token values, shrine plans, and every estimated-material card now share the same compact `300px` responsive track width, so every section switches column count at the same available panel width.
- Removed the material-only one-column breakpoints while preserving the compact internal material-card layout for genuinely narrow panels.

## [1.1.8] - 2026-07-26

### Changed

- Market estimates now use the live best ask and bid passively received when the player opens an item's native market page, overriding the older public snapshot for that item.
- Live overrides remain available until the same item's next order-book update or a genuinely newer public marketplace snapshot supersedes them; unchanged or older API responses no longer discard fresher data.

## [1.1.7] - 2026-07-24

### Changed

- The assistant page now uses a transparent outer background, allowing the game's native starfield background to show through while retaining readable inner cards.

## [1.1.6] - 2026-07-22

### Added

- Added a Tampermonkey fallback installer link in the plugin footer and installation documentation for players who cannot open the Greasy Fork script page. Automatic update checks remain on the official release source.

## [1.1.5] - 2026-07-22

### Fixed

- Native market navigation now always passes enhancement level `0` for plugin recommendation materials, matching the game's own inventory flow and preventing an undefined order-book key from crashing the market view.

## [1.1.4] - 2026-07-22

### Changed

- Item icons now use the game's own `Go to Marketplace` controller, so the native market item selection and navigation state are preserved. The previous search-field navigation remains only as a compatibility fallback if the game no longer exposes its controller.

## [1.1.3] - 2026-07-22

### Fixed

- Material recommendation cards now switch to one column in narrow plugin panels, with an additional compact layout for their item, inventory, and best-exchange details.

## [1.1.2] - 2026-07-22

### Changed

- The guild-target shortcut now explicitly reports “current maximum level reached” when the selected life or combat shrines already match their corresponding guild building levels.
- The shrine batch-planning card now uses container-based responsive layout: its description moves above the target buttons in narrow plugin panels, and the buttons stack only when needed.

## [1.1.1] - 2026-07-20

### Fixed

- The exchange advisor now distinguishes a missing public buy price from a one-batch sale budget that is too small to buy any alternative exchange item.

## [1.1.0] - 2026-07-20

### Added

- Full runtime English UI for non-Chinese game locales, including the sidebar tab, credit rankings, shrine planner, market links, update status, material estimates, and exchange-advisor overlay.
- A locale-aware local test harness (`?locale=en`) and tests for English copy, plural quantities, locale formatting, and the absence of hard-coded Chinese UI copy.

### Changed

- Centralized all player-facing text in `src/localization.js`; Chinese remains the default for Chinese game locales and English is used for every other locale.
- Sidebar discovery now recognizes both Chinese and English native tab labels, so the plugin can mount in either official client language.

## [1.0.0] - 2026-07-20

### Added

- MIT License and a stable release-documentation baseline.
- Cached, timeout-protected update checks.
- Explicit release archive policy: versioned `dist` builds are retained in the repository.

### Changed

- Removed the official item-name catalog diagnostic line from the player UI; the catalog remains the sole source for Chinese item names.
- Reworked the exchange-advisor observer: the document only watches modal mount/removal, while live changes are watched only inside the active native exchange modal.
- Updated the README to reflect official i18n name resolution, saved UI state, marketplace links, bulk shrine presets, clear-all planning, and estimation limits.

### Fixed

- Update checking now times out instead of remaining indefinitely in a loading state, and repeated checks within five minutes reuse the same result.

## [0.4.59] - 2026-07-20

- Added the clear-all shrine upgrade plans action.
