# Changelog

All notable changes to this project are documented in this file.

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
