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
live frame. Missing records remain unknown in this audit by design. The audit
adds three known-level buildings, rejects and then accepts an unknown
building's manual current level, checks inline target editing, collapsed step
details, button and pointer reordering, Escape cancellation, clear-with-undo,
search focus, and focus visibility after rerenders. It leaves a reusable final
sample with 28 visible square catalog tiles, three collapsed building groups in
their original order, nine total upgrade steps, a `5,000` budget, `13,975`
planned spend, and a `1 / 9` budget cutoff.

After `document.body.dataset.constructionAuditReady` becomes `"true"`, inspect
the JSON in `#layout-audit-output` or evaluate:

```js
await window.__mwiConstructionAuditReady;
```

For every width, require zero panel horizontal overflow, no reported element
overflow or control overlap, 28 game sprite icons, 3 known and 25 unknown
levels, square tile geometry, and no visible per-level steps in the final
collapsed sample. Use the reported panel rectangle and computed
`gridTemplateColumns`; the requested sidebar width is not the plugin's actual
content width, and entering the wide two-column layout can legitimately make
the catalog column count smaller than the preceding single-column width. Also
inspect `interactions.checks`: every value must be `true`. Run additional
English-locale passes at `320`, `610`, and `900` to catch long-label overflow:

```text
http://127.0.0.1:4173/test-harness.html?constructionAudit=1&resetState=1&locale=en&sidebarWidth=320
```

For the persistent settings and hidden-view interaction contract, open:

```text
http://127.0.0.1:4173/test-harness.html?settingsAudit=1&resetState=1&sidebarWidth=420
```

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
rendering the manual current-level form. Do not replace the regular
`constructionAudit=1` width matrix with this audit: the former intentionally
retains the partial-frame `3 / 28` behavior.

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
