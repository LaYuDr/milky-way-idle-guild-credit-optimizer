# Development

## Prerequisites

Use a current Node.js LTS release and install the locked development tools:

```bash
npm ci
```

Runtime output remains dependency-free. ESLint, Prettier, and their shared
globals catalog are development-only dependencies.

## Common commands

```bash
npm test
npm run format:check
npm run lint
npm run build
npm run verify:repo
npm run check
npm run serve
```

npm run check verifies formatting and lint rules, runs the Node tests, rebuilds
current artifacts, and verifies the repository layout. It does not create a
historical release archive.

### Compact and scoped verification

All checks retain their original coverage. `npm run check` now prints stage
status, duration and Node test totals. Full stdout/stderr and `summary.json`
are saved in a unique `.workbench/check-*` directory. A failed command returns
a nonzero exit code, prints the last 6 KB of its log and stops subsequent stages.
Read the full log for earlier errors; a truncated console excerpt is not the
complete diagnostic. Successful logs are also retained.

```bash
# Development iteration: explicit affected tests, plus full formatting and lint.
npm run check:quick -- test/trial-history.test.js test/runtime-storage.test.js

# Handoff: full check, git diff --check and release:dry-run, each once.
npm run check:handoff

# CI: full check and git diff --exit-code, as before.
npm run check:ci
```

Quick mode requires at least one existing `test/*.test.js` file; it does not
infer dependencies, build artifacts or run repository verification. Use all
tests when impact is uncertain. It never substitutes for the final full gate.
Do not run `check`, `check:handoff` and `check:ci` consecutively on unchanged
files: they share the same five-stage gate. CI's clean-diff check is for a
committed checkout, not a mixed working tree. Individual npm commands remain
available for detailed diagnostics.

For small documentation changes, inspect the diff and formatting during
iteration. For business rules, storage or protocol changes, choose affected
Node tests and add browser/game verification at the affected boundary. For
layout changes, run the affected feature's full browser matrix. For shared
styles, localization or shell changes, expand to every affected feature.
Once the required checks pass, repeat them only after relevant changes,
failures or newly discovered risks.

Run `npm run format` after intentional source edits. Generated artifacts,
historical releases, local references, and workbench files are excluded from
Prettier so immutable or third-party content is never mechanically rewritten.

## Module workflow

- Add reusable calculations to src/core.js or the relevant data module.
- Add game-state normalization and hydration under src/runtime/.
- Add rendering and interaction logic under src/ui/ by feature.
- Keep src/userscript.js focused on dependency composition, sidebar mounting,
  and lifecycle teardown.
- Add every runtime file explicitly to SOURCE_FILES in tools/build.js before
  src/userscript.js, then extend the module-order test.

## Local browser testing

### Automated matrix runner

The existing harness contracts can run in one command without reading every
successful page's DOM or taking a screenshot at every width:

```bash
# One-time browser setup after npm ci (or use an installed Chrome below).
npx playwright install chromium

# Full trial-history matrix: eleven Chinese widths and three English widths.
npm run test:browser -- --suite trials

# Use installed Chrome; no browser download is needed.
npm run test:browser -- --suite trials --channel chrome

# Multiple affected features; each uses its documented width/language matrix.
npm run test:browser -- --suite layout,credit,construction,settings

# Explicit smoke subset while iterating; NOT full matrix acceptance.
npm run test:browser -- --suite trials --widths 320,900 --locales zh,en
```

Suites: `layout`, `credit`, `construction`, `settings`, `trials`,
`upgrade-empty`, `market-filter`, `locale-race`, `sidebar-resize`,
`sidebar-startup`, `sidebar-integration`, `construction-snapshot`, `token-guide`. `--suite all` runs
all supported suites; it is not the default for a small feature change.

The runner rebuilds current artifacts without archival, starts a loopback
server on a free port, and opens a fresh browser context for each case. It
blocks external requests and never connects to an existing game session.
Reload-based fixtures retain their own session state within that case.
It waits for the harness JSON report, rejects missing/empty checks, reports
page errors and timeouts as failures, and exits nonzero if any case fails.
Layout and construction reports additionally enforce their documented geometry
and readability fields; they do not use the same report shape as other suites.

Each case has one console status line. Full JSON reports and failure-only PNGs
are kept under `.workbench/browser-*`, with `matrix.json` recording the exact
planned and completed cases. Custom widths/locales are labelled as a subset;
they must not be reported as a complete documented matrix. Browser installation
or startup failure is a failed run, never a skipped pass. No automatic retries
hide intermittent failures. The runner is separate from the Node-only CI gate.

Pointer/keyboard checks without a machine-readable harness report (such as
the native sidebar-tab manual audit below), visual quality review, export/reload
follow-ups and installed-game compatibility still need their documented checks.
The matrix runner does not claim to cover them.

Start the development server:

```bash
npm run serve
```

Then install:

```text
http://127.0.0.1:4173/milky-way-idle-guild-credit-dev-loader.user.js
```

### Sidebar cold-start regression audit

To verify that the credit tab mounts as soon as the game's sidebar appears,
open:

```text
http://127.0.0.1:4173/test-harness.html?sidebarStartupAudit=1&resetState=1&sidebarWidth=420
```

The fixture removes both native sidebar variants before the runtime starts,
keeps unrelated child-list mutations flowing every `10ms`, and inserts the
sidebars `160ms` later. The audit measures the delay from fixture insertion to
the credit tab becoming available and requires it to stay below `500ms`, use
the visible Chinese game locale, remain a single tab after additional DOM
mutations, and open its connected panel normally. This catches both legacy
three-second polling delays and debounced observers that can be starved by a
continuously changing game DOM.

After `document.body.dataset.sidebarStartupAuditReady` becomes `"true"`,
inspect `#layout-audit-output` or evaluate:

```js
await window.__mwiSidebarStartupAuditReady;
```

Failures set `document.body.dataset.sidebarStartupAuditFailed` to `"true"` and
return `checks.auditCompleted: false`. Require every value in `checks` to be
`true`.

### Locale race regression audit

To reproduce a transient startup-locale mismatch, open:

```text
http://127.0.0.1:4173/test-harness.html?localeRaceAudit=1&resetState=1&sidebarWidth=420
```

The fixture deliberately exposes Chinese native sidebar labels while
`i18next.language`, `i18next.resolvedLanguage`, and `<html lang>` still report
English. It opens the plugin, selects the shrine-upgrade view, opens settings,
excludes one shrine from batch fill, and focuses that shrine control. The audit
first requires the sidebar entry, panel title, all three internal tabs, settings
title, construction visibility switch, and live shrine-level status to be
Chinese with no matching English copy in those nodes. It then changes both the
visible native labels and the runtime locale signals to English, waits through
the three-second sidebar inspection interval, and requires all static and live
copy to become English without losing the active view, open settings state,
persisted exclusion, construction switch value, or focused control.

After `document.body.dataset.localeRaceAuditReady` becomes `"true"`, inspect
`#layout-audit-output` or evaluate:

```js
await window.__mwiLocaleRaceAuditReady;
```

Successful and failed runs both set the ready dataset. Failures additionally
set `document.body.dataset.localeRaceAuditFailed` to `"true"` and return a JSON
error with `checks.auditCompleted: false`. Require every value in `checks` to be
`true`. Run this audit independently at sidebar widths `320`, `420`, `610`, and
`900`.

### Native sidebar resize regression audit

To verify that the plugin does not cover the game's resize target, open:

```text
http://127.0.0.1:4173/test-harness.html?sidebarResizeAudit=1&resetState=1&sidebarWidth=420
```

This fixture adds a native-style `10px` resize gutter with `z-index: 1` and
`cursor: col-resize`; its right half overlaps the sidebar. With the plugin open,
the audit requires `elementFromPoint()` at the gutter center to resolve to the
gutter, performs a pointer drag, verifies that the wrapper width grows by at
least `60px`, checks that the gutter remains the hit target at its new position,
and requires zero plugin-root horizontal overflow.

After `document.body.dataset.sidebarResizeAuditReady` becomes `"true"`, inspect
`#layout-audit-output` or evaluate:

```js
await window.__mwiSidebarResizeAuditReady;
```

Successful and failed runs both set the ready dataset. Failures additionally
set `document.body.dataset.sidebarResizeAuditFailed` to `"true"` and return a
JSON error with `checks.auditCompleted: false`. Require every value in `checks`
to be `true`. Run this audit independently at sidebar widths `320`, `420`,
`610`, and `900`; at every width the gutter contract, hit testing, drag delta,
post-drag reachability, and root overflow checks must all pass.

### Sidebar lifecycle and third-party interaction audit

```bash
npm run test:browser -- --suite sidebar-integration,sidebar-startup,locale-race,sidebar-resize --channel chrome
```

`sidebar-integration` covers Chinese widths 320/420/610/900 and English
320/610. It exercises a foreign tab that hides the entire native panel host,
handlers that stop events at document capture or the target, selection changes
without clicks, original display restoration, keyboard Home/End/arrows and
Enter, unique tab/panel ARIA links, stale duplicate suppression, removal and
remount, content mutation isolation, and disposal. Require all `checks` true.
These are synthetic compatibility contracts, not proof of an installed plugin
version working in the live game; also verify the real Guild/Invite/Enhance/
P&L/Planning/Profit tabs in both directions before release.

The runtime checks cached node ownership/visibility every three seconds and
performs a full sidebar search at most every thirty seconds while the cache is
valid. Missing/disconnected/hidden layouts invalidate it immediately. A local
observer catches tab changes and remounts; cold start observes the document
until mounting. Scheduling is coalesced without resetting a pending deadline,
so unrelated startup mutations cannot indefinitely delay mounting.

### Native sidebar tab interaction audit

To simulate a narrow sidebar with more tabs than can fit, open:

```text
http://127.0.0.1:4173/test-harness.html?sidebarTabsAudit=1&resetState=1&sidebarWidth=320
```

The native tabs use fixed test widths in this fixture. With the pointer over
the tab row, verify that a vertical wheel gesture scrolls the row horizontally,
that the page keeps normal wheel behavior at either horizontal boundary, and
that no extra navigation or sorting controls are added.

### Shrine-plan empty-state refresh audit

To verify that an intentionally empty shrine plan remains empty after a real
page reload, open:

```text
http://127.0.0.1:4173/test-harness.html?upgradeEmptyAudit=1&resetState=1&sidebarWidth=420
```

The audit seeds one plan, clears it through the live UI, confirms the empty
array was persisted, reloads the page, and resumes automatically from
`sessionStorage`. It requires the planner to remain empty after reload, checks
that the empty-state copy names both the shrine plan and the explicit Add
shrine action, verifies that Add shrine still creates one row, and clears the
row again before completing. After
`document.body.dataset.upgradeEmptyAuditReady` becomes `"true"`, inspect
`#layout-audit-output` or evaluate:

```js
await window.__mwiUpgradeEmptyAuditReady;
```

Require every value in `checks` to be `true`. Run the audit at `320`, `420`,
`610`, and `900` pixels in Chinese, then at `320` and `610` with `locale=en`.
Each URL must be opened as a fresh navigation so the deliberate reload can
complete its two-stage contract.

### Responsive layout matrix

For responsive layout auditing, open:

```text
http://127.0.0.1:4173/test-harness.html?layoutAudit=1&resetState=1&auditPlans=4&sidebarWidth=420
```

Run the full contract at sidebar widths `320`, `360`, `420`, `460`, `480`,
`520`, `560`, `610`, `720`, `900`, and `1200`, then inspect
`#layout-audit-output` for overflow, boundary overflow, and control overlap.

For the credit comparison card layout, open:

```text
http://127.0.0.1:4173/test-harness.html?creditAudit=1&resetState=1&sidebarWidth=1200
```

Repeat `creditAudit=1` at the same eleven widths and require every value in
`checks` to be `true`. Credit rows must preserve the standard four-column table
flow, `11px` table type, `24px` item icons, and standard cell padding at every
width. Credit cards use a `360px` minimum multi-column track so the grid reduces
its column count before compressing card contents. If the whole plugin is
narrower than that minimum, the table keeps its standard `360px` content width
inside a contained horizontal scroller instead of shrinking or clipping. The
audit rejects compact-density overrides, clipped cells, clipped target cost, or
scroll content escaping its card. Repeat the `1200` case with `locale=en` to
cover longer labels.

For the construction view, use:

```text
http://127.0.0.1:4173/test-harness.html?constructionAudit=1&resetState=1&sidebarWidth=420
```

Repeat the construction audit at the same eleven widths. It also verifies the
queue-first planning flow against a deterministic `3 / 28` partial-level
live frame. Missing records show current level `0` in catalog tiles, while
the level-coverage summary and internal known-level flag preserve their unread status.
Each tile also shows the cost of upgrading its current level by one (or maximum-level status).
The audit adds three known-level buildings, directly
adds one unread building as `0 -> 1` without a manual-level prompt, checks inline target editing, collapsed step
details, button and pointer reordering, Escape cancellation, clear-with-undo,
search focus, focus visibility after rerenders, and the full weekly-point edit
table: every completed week is visible at once, estimated weeks can be edited
in place, and clearing a manual value restores its estimate. It also changes
the forecast lookback and planning horizon once, verifies the rerendered controls,
then restores the current-points-only planning mode. It leaves a reusable final
sample after verifying that custom starting points update the budget summary
on input without changing the observed game balance, and clearing the input
restores the game balance. The completed-week forecast expectation is derived
from the fixture's completed week count instead of a date-sensitive constant.
The forecast-lookback control is initially hidden under Forecast settings,
while the planning horizon remains visible. The audit opens the settings,
checks that they stay open while stepping values and rerendering, then closes
them again. The final fixture contains 28 visible named
catalog entries, three collapsed building groups in
their original order, nine total upgrade steps, a `5,000` budget, `13,975`
planned spend, and a `1 / 9` budget cutoff.

After `document.body.dataset.constructionAuditReady` becomes `"true"`, inspect
the JSON in `#layout-audit-output` or evaluate:

```js
await window.__mwiConstructionAuditReady;
```

For every width, require zero panel horizontal overflow, no reported element
overflow or control overlap, 28 game sprite icons, 3 read and 25 default-zero
levels, readable catalog names and visible levels, and no visible per-level steps in the final
collapsed sample. Use the reported panel rectangle and computed
`gridTemplateColumns`; the requested sidebar width is not the plugin's actual
content width, and entering the wide two-column layout can legitimately make
the catalog column count smaller than the preceding single-column width. Also
inspect `interactions.checks`: every value must be `true`.

The `cards.readableNames`, `cards.visibleLevels`, `cards.readableNextLevelCosts`,
`cards.defaultZeroLabels`, and all `readability` fields
must be true. These check a 14px minimum for primary text and the history table,
a 12px minimum for secondary text, and the budget / queue / statistics reading
order. The catalog scrolls within a 340px maximum height; the weekly table
retains all rows with a contained horizontal scroller on narrow panels.

The compact construction workspace uses two budget columns and a queue/catalog
split at a container width of 720px. Queue controls reflow using the queue pane's
own container width, so the wide page's narrower column remains usable. Main
text stays at least 14px and secondary text at least 12px. Sort arrows have a
shaft; the adjacent disclosure control uses a chevron. Check both expanded and
collapsed steps, forecast settings, and history. Full-snapshot audits read the
catalog's numeric `data-current-level`, independently of translated level copy.

Run additional English-locale passes at `320`, `610`, and `900` to catch long-label overflow:

```text
http://127.0.0.1:4173/test-harness.html?constructionAudit=1&resetState=1&locale=en&sidebarWidth=320
```

For the persistent settings and hidden-view interaction contract, open:

```text
http://127.0.0.1:4173/test-harness.html?settingsAudit=1&resetState=1&sidebarWidth=420
```

Both beta tabs default to hidden unless their saved visibility is explicitly `true`.
Feature audits with `resetState=1` explicitly enable them before runtime startup.

`settingsAudit=1` seeds one existing Spirit Shrine (life) upgrade plan, one
Guild Hall construction plan, and the complete panel order
`construction, credit, upgrade`. It then exercises the real controls to:

- open the inline settings region and inspect its accessible name, linked
  trigger, labelled inputs, live status, focus entry, and Escape focus return;
- exclude only Spirit Shrine (life), fill life upgrades, and require the
  excluded existing plan to remain unchanged while Tempo Shrine (life) is
  filled;
- fill combat upgrades and require Spirit Shrine (combat) to remain eligible;
- exclude every life shrine and require the disabled fill action to leave all
  existing plans unchanged while its visible live status explains why filling
  is unavailable;
- hide the currently active construction view and require a safe fallback to
  the adjacent visible view without changing the construction-plan storage or
  dropping construction from the complete persisted panel order;
- require normal tab keyboard navigation and pointer sorting to operate on the
  two visible views only while merging their new order back around the hidden
  construction slot;
- hide the active Trial history tab, require a safe fallback and saved visibility,
  then hide both beta tabs and restore them independently without changing trial storage;
- re-enable construction, require its tab and panel to be reachable in the
  merged complete order, enter it again, and require the original construction
  plan to remain intact.

After `document.body.dataset.settingsAuditReady` becomes `"true"`, inspect the
JSON in `#layout-audit-output` or evaluate:

```js
await window.__mwiSettingsAuditReady;
```

Both successful and failed runs set
`document.body.dataset.settingsAuditReady` to `"true"`. A failed setup also
sets `document.body.dataset.settingsAuditFailed` to `"true"` and writes the
error name, message, stack, and a false `auditCompleted` check into
`#layout-audit-output`, so automation must report the failure instead of
waiting for a readiness timeout.

Require every value in `checks` to be `true`. Repeat the audit at sidebar widths
`320`, `360`, `420`, `460`, `480`, `520`, `560`, `610`, `720`, `900`, and
`1200`; require zero root or element horizontal overflow, zero boundary
overflow, and zero control overlap. Also run English-locale passes at `320`,
`610`, and `900`:

```text
http://127.0.0.1:4173/test-harness.html?settingsAudit=1&resetState=1&locale=en&sidebarWidth=320
```

The browser audit verifies the values written through the live UI. Reload and
malformed-storage compatibility remain deterministic Node storage tests rather
than an in-page reload, because the settings audit intentionally reseeds its
fixture whenever `resetState=1` is present.

To verify the different semantics of a complete `initClientData` guild-building
snapshot, open:

```text
http://127.0.0.1:4173/test-harness.html?constructionSnapshotAudit=1&resetState=1&sidebarWidth=420
```

This fixture stores a complete initialization snapshot whose
`guildBuildingMap` contains only the three non-zero buildings, then removes the
partial bridge frame before loading the userscript. After
`document.body.dataset.constructionSnapshotAuditReady` becomes `"true"`, inspect
`#layout-audit-output` or evaluate:

```js
await window.__mwiConstructionSnapshotAuditReady;
```

Require every value in `checks` to be `true`. In particular, the complete
snapshot must report `28 / 28` known levels, treat all 25 omitted records as
known level `0`, and add an omitted building directly as `0 -> 1` without
rendering a manual current-level form. Do not replace the regular
`constructionAudit=1` width matrix with this audit: the former intentionally
retains the partial-frame `3 / 28` source-coverage behavior while still using
level `0` for every unread building.

For the shrine guide's guild-token exchange path, open:

```text
http://127.0.0.1:4173/test-harness.html?tokenGuideAudit=1&resetState=1&sidebarWidth=420
```

`tokenGuideAudit=1` enables the deterministic `surplusPlan` fixture. Its native
exchange modal simultaneously contains an ordinary material, Guild Token, and
Green Guild Credit. The audit selects guild-token mode for the missing green
credits and enables the shrine guide. It first requires the native Guild Token
item to carry the active guide highlight while the guide reports the
`use_guild_token` state and a requirement of `300` tokens. It then makes Guild
Token the modal's selected item and requires the guide to enter
`set_quantity`: the updated native modal exposes separate text inputs for
"You pay" and "You receive". Only the target "You receive" input may be active
or linked through `aria-describedby`; the payment input must remain unmarked.
The light-DOM description remains visually hidden next to the target input so
the ARIA reference does not cross a shadow boundary. Its visible mirror is a
separate, selectable-text strip in the positioned advisor stack, below the
recommendation card when that card is available. It reads
"完成当前规划需要「公会代币」300个，获得「绿色公会信用点」3,000个", allows
long localized names and quantities to wrap, and disables the pulsing animation
on the target input.

The fixture owns only `125` of the `300` required Guild Tokens. Selecting the
token must fire one input update, prefill "You receive" with `1,250` Green Guild
Credits (`125` complete batches at `1 -> 10`), while the strip keeps the full
plan requirement of `300` tokens and `3,000` credits. The hidden accessible
detail reports `125` batches and `125` tokens for the current exchange. The
market recommendation card and quantity strip must remain visible together for
Guild Tokens in the same positioned advisor stack. After
`document.body.dataset.tokenGuideAuditReady` becomes `"true"`, inspect
`#layout-audit-output` or evaluate:

```js
await window.__mwiTokenGuideAuditReady;
```

Every value in `checks` must be `true`.

To verify highest-bid price-band validation and the persisted unit-price limit,
open:

```text
http://127.0.0.1:4173/test-harness.html?marketFilterAudit=1&resetState=1&sidebarWidth=420
```

The fixture supplies Green Credit conversions at 50M, 55M, 60M, and 70M, plus
an ordinary item whose highest bid is below the official `priceBandMins[0]`.
The audit selects the highest-bid reference and requires the below-range item
to remain absent. It then enters a 55M unit-price limit, requiring the 60M and
70M items to disappear while the item priced exactly at 55M remains. An
invalid negative value must preserve the active filter and expose an inline
accessible error; clearing the field must restore all valid items. The coin
value and cleared `null` state must round-trip through plugin UI storage. The
compact number input's enclosing control must match the target-credit stepper,
price-reference group, and refresh button height. Both numeric fields use the
shared enlarged custom stepper with accessible increase and decrease buttons.
The target-credit buttons change `100` to `200` and back to `100`, while the
price-limit buttons use a `10M` step, changing `100` to `110` and back to
`100`. A short pointer press must apply exactly one step. Holding either button
must begin repeating after the initial delay, keep its pressed state visible,
stop immediately on pointer release or cancellation, and commit the final value
only once. The underlying number inputs retain matching `step` attributes for
keyboard arrow controls. After
`document.body.dataset.marketFilterAuditReady` becomes `"true"`, inspect
`#layout-audit-output` or evaluate:

```js
await window.__mwiMarketFilterAuditReady;
```

Require every value in `checks` to be `true`, including zero horizontal
overflow for the panel and control row. Repeat at `320`, `420`, `610`, and
`900` pixels in Chinese, then at `320` and `610` with `locale=en`.

## Local workbench

Unfinished patches, rejected hunks, screenshots, and throwaway
previews belong under .workbench/. This directory is intentionally ignored and
is not a substitute for version control: move completed work into the
appropriate source, test, documentation, or reference directory.

Locally retained third-party plugins belong under the visible
references/local-plugins/ directory. This directory is ignored by Git and the
release process, while tracked third-party references under references/ must
include provenance and license notes.

## Trial history audit

Open `http://127.0.0.1:4173/test-harness.html?trialHistoryAudit=1&resetState=1&sidebarWidth=420`.
Await `window.__mwiTrialHistoryAuditReady` and require every `checks` value
to be true. Run the eleven-width matrix above and English passes at 320,
610, and 900. The fixture sends the official bridge event with a guild snapshot,
member names and a full `guild_trial_stats_updated` response, then checks the
fourth tab, empty state, six parallel projects (four skilling above two combat),
exact values, duplicate and empty responses, escaped member names, missing
project slots, week switching, project switching, newest-to-oldest columns,
scroll buttons, focus, unchanged stored records and contained horizontal scrolling.
The audit also checks embedded player profiles without a native dialog, all
native skill/equipment sprite references with unchanged levels and enhancement values, complete member tables for projects attended by the selected player, life/combat rails, newest-to-oldest horizontal columns, persistent player highlight, profile-cache reuse, explicit refresh,
unavailable lookup, out-of-order replies, return navigation, and the bidirectional
week/project heading links. The local fixture models the native profile state
update; real-game compatibility still needs verification after installation.
Also export JSON and reload without `trialHistoryAudit` or `resetState` to
verify that all eight fixture records survive. Fixture storage is confined to localhost.

The protocol was checked against the official CN frontend on 2026-09-18
(`main.bdda2571.chunk.js`): opening Stats calls `get_guild_trial_stats`; the
response supplies `guildId` and the complete `guildTrialStatList`. Archive
only parties whose `guild.currentTrialsData[kind].parties[trialHrid].done` is
true, using `guild.currentWeekStartAt` as the week identity. The bridge observes
responses and never sends that request. Keep complete stat rows, party state,
member snapshots and trial definitions; do not round the stored values.

### Trial history JSON import

The importer accepts exported envelopes with `schemaVersion: 1` or `2` and
a non-empty `records` array (up to 1,000 records, 1,000 members per record,
and a 10 MB file). Game captures retain record schema version 1. Import
validates every record before writing, previews new/duplicate/conflicting
keys, and rechecks storage on confirmation. For otherwise identical manual
records, unknown dates can be filled in after preview and confirmation.
Known dates and statistics conflicts are never replaced; an older undated
copy is treated as a duplicate. Write failures restore this attempt's exact
previous values, unless another page has since changed them. If rollback
itself fails, the UI reports remaining additions and date updates.

Manual transcripts use record schema version 2 and `source: "manual"`.
They have a stable `recordId` and `key = JSON.stringify(["manual", recordId])`,
separate from automatic capture keys. Missing `guildId`, `weekStartAt`,
`capturedAt` and member `characterId` are explicitly `null`. A known trial
calendar date is stored as `trialDate: "YYYY-MM-DD"`; otherwise use `null`.
Non-padded full dates such as `2026-9-3` are normalized. A known date derives
`weekStartAt` using UTC calendar arithmetic and `GUILD_TRIAL_FIRST_START_AT`
(2026-07-10): September 3 is week 8 (August 28), September 10 is week 9
(September 4). Explicit conflicting week starts and dates before week 1 are
rejected. No year is inferred from a yearless timestamp. Existing dated
records with null week starts are normalized on read without changing keys.
`guildName` may be a name or `null`. Each row has a unique `memberKey` mapped
to `members[memberKey].name`, a matching `trialHrid`, and numeric non-negative
`workDone` (skilling) or `damageDealt`, `healingDone`, and
`premitigatedDamageTaken` (combat). Keep `kind`, `party.done: true`, `points`
and `party.highestTier` (the latter two may be null). Preserve source text or
uncertain copied tokens in additional fields; do not invent game IDs or infer
missing values as zero. Exports now use envelope schema version 2 and can
contain both automatic and manual records.

Browser QA for import: test from an empty history and from existing records;
choose a file, inspect the preview, cancel once, then confirm. Verify numeric
member names, missing IDs, duplicate/conflict skipping, invalid JSON, invalid
statistics, export/re-import and reload. Repeat preview and result states at
320, 360, 420, 460, 480, 520, 560, 610, 720, 900 and 1200 pixels, plus English
at 320, 610 and 900. Keep user-provided transcripts outside the repository and
use synthetic data for committed fixtures.

### Trial record display

`src/ui/trial-history-view.js` renders saved records and original member statistics
in two display modes: weekly projects and a horizontally scrollable project history.
Week and project selectors are horizontal rows of directly clickable buttons.
All options render at once, with overflow contained in the selector; the active
choice is highlighted and revealed on selection. Arrow keys and Home/End select
adjacent or endpoint options. Background refresh preserves selector scroll position.
The player view also offers recorded-participation and average-multiple rankings;
week and project views retain their existing detail tables.
`historyWeeks` groups by trial week number (Friday-based) newest first, puts unknown
weeks last and retains all records. `historyProjects` groups by kind and project
HRID without combining member rows. Multiple records retain their guild/source
labels; the UI never resolves conflicts by silently selecting a winner.
Weekly layout uses four parallel skilling columns above two parallel combat columns;
missing records use unnamed placeholders because the saved data cannot identify
uncaptured projects. Project history places newer weeks on the left. Native horizontal
scrolling, focusable regions and left/right buttons keep both modes accessible.
Original member order and numeric precision are preserved. Member tables expand
to their full row count with no fixed height or internal vertical scrolling;
wide tables still scroll horizontally. Expanded raw records
and scroll positions survive background refreshes; changing the week/project resets
horizontal scrolling. Unknown weeks remain selectable and appear last in project mode.
`src/trial-history.js` owns record validation and metric display semantics: official
schema v1 omitted zero fields display as zero; explicit null and manual missing
fields remain unknown. The history audit also checks that analysis controls are absent.

Removed feature details and source recovery steps are preserved in
[Trial analytics restore guide](TRIAL_ANALYTICS_RESTORE.md).

### Historical trial member levels

The native signup modal reads `guildTrialSignupLevelMap[characterId]` from
`guild_characters_updated` / initial character data: `skillingTrialLevel` for
skilling and `combatLevel` for combat. `guild_trial_signup_updated` carries
`trialSignupLevels` for one member. Source verified against the official
`main.bdda2571.chunk.js` on 2026-09-21; use passive bridge messages only.

Keep the signup map separate from names and match `guildId`, `currentWeekStartAt`,
`signupWeekStartAt`, character ID and the signed-up project before capturing a
level. Reset signup context on guild/week changes. Store optional
`memberLevels` on each record, keyed by character ID (automatic records) or
`memberKey` (manual imports). Values are finite non-negative numbers or `null`;
missing/null displays as an em dash. Preserve combat decimals and raw stat rows.
Late roster messages may fill missing levels in matching automatic records;
never replace a known stored level or backfill other weeks or manual records.
Both schema versions remain compatible; exports include `memberLevels` when
available. The trial-history harness checks delayed capture, column order,
missing levels, and preservation after refresh/recapture.

The trial-history fixture checks a single row of three view modes with choices below, deduplicated player options, explicit player selection and keyboard switching without background queries. It also checks sortable member and numeric headers in weekly,
project, and player history views: ascending/descending toggles, independent table
state, unknown levels last, retained keyboard focus, cross-week highlighting,
complete rows, and no extra profile requests or stored-record changes.

### Trial display settings and summaries

The trial history audit exercises all sixteen combinations of level, work, share and average-multiple
columns in week, project and player views, including percentage sorting, adaptive
column widths, full row retention, local preference persistence and no extra
profile requests. Four summary-toggle combinations are checked in all three views. Overviews
remain above the member table and use known values only; unit tests cover missing values, explicit zero, odd/even medians, empty
records, zero denominators and overflowing totals. Display preferences use their
own per-region/character key and are not part of trial exports.

Player search markup is temporarily commented out. The picker still supports keyboard
navigation, selection collapse, escaped names and a 60-player wrapping grid.
Player ranking checks cover participation counts, ties, skilling/combat/combined
averages, valid-project counts, four simultaneously visible parallel columns, left/right
scroll controls, focus and scroll restoration, and contained tables,
click-through to player details and return to the ranking without background queries
or storage changes. Rankings use only game-captured schema v1 records and exclude
manual transcripts (schema v2 or explicit manual source), including manual records
with character IDs. Exported/restored game captures remain eligible; stored manual
records remain available to the existing history views. Each captured project counts
once, including zero contributions.
Skilling uses work / project mean work. Combat averages the valid damage, healing and
premitigated-damage-taken multiples within each project. Project multiples then have
equal weight, including in the combined category. Missing values and zero denominators
are excluded; no valid projects displays an em dash. Participation counts combine all
captured skilling and combat projects; samples count only valid projects in that
ranking category, so two skilling projects plus one combat project means three
participations and two skilling samples. Only captured rows are used;
missing projects are not inferred. Stable character IDs group players; ID-less named
records form a separate name-based group and are never merged into an ID group.

Compact trial tables use intrinsic content widths. The width audit compares each
column with its widest header/cell content across all display-field combinations,
and checks that expanding raw JSON does not widen the project column. Headings,
summaries and metadata wrap within the width determined by member data.

Profile skills use five-column tiles matching equipment dimensions. The profile
audit checks native icon order, the 5/5/4/3 row grouping, accessible names, preserved
levels and unknown placeholders, and measures equal skill/equipment tile sizes
across the width matrix.
The profile facts show only total and combat levels. Skills and equipment use
independent native disclosures, initially open, with their state retained during
view refreshes. Equipment includes its following ability slots. The fixture checks
collapse/reopen visibility, unchanged stored records and no extra profile requests.
