# Project agent guide

## Product and data boundaries

This is a read-only planning helper for Milky Way Idle. Do not add automatic
buying, selling, exchanging, upgrading, credential access, or account-data uploads.
Reuse the existing bridge and market-data event path instead of adding a second
WebSocket arbitration path.

## Where to work

- `src/core.js`: pure calculations and business rules; test changed behavior.
- `src/market-data.js`, `src/market-dom.js`, `src/bridge.js`: market consistency,
  read-only DOM parsing and passive official-message capture.
- `src/runtime/`: configuration, validated persistence, game-state normalization,
  hydration and refresh scheduling.
- `src/ui/`: feature rendering; `src/localization.js`: Chinese and English copy.
- `src/userscript.js`: composition, sidebar integration and lifecycle only.
- `tools/build.js`: deterministic build. Add new runtime modules to `SOURCE_FILES`
  before `src/userscript.js` and update the module-order test.
- `dist/`: generated current artifacts. `releases/vMAJOR.MINOR/`: immutable history.
  Generate through the build/release scripts; do not edit outputs by hand.
- `references/`: documented third-party sources. `references/local-plugins/` and
  `.workbench/` are local-only, never build or release inputs.

Read the relevant section of [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for the
affected module, browser matrix or integration contract, not every audit recipe.

## Verification and completion

| Change                           | Required evidence                                                                              |
| -------------------------------- | ---------------------------------------------------------------------------------------------- |
| Documentation only               | Diff, referenced paths/commands and formatting; no runtime rebuild solely for prose            |
| Display copy only                | Diff, changed-file formatting/lint, placeholders and Chinese/English consistency; no full gate |
| Code behavior/build/test tooling | `npm run check:handoff` once before handoff                                                    |
| CI configuration                 | YAML and affected workflow contracts; preserve existing CI stages                              |
| Layout/UI behavior               | Code gate plus the affected documented browser matrices                                        |
| Bridge/game integration          | Code gate plus affected browser and real-game boundary checks                                  |

Classify by the actual diff, not by file extension or a change to `localization.js`.
Display-copy-only changes modify visible wording without changing translation
keys, interpolation expressions, markup, selectors, control flow, data semantics
or action meaning. They do not require `check`, `check:quick`, `check:handoff`,
the full Node suite, browser matrices or release dry runs for ordinary handoff.
Run an existing focused test only if its text contract is affected. If longer
copy may wrap or clip, inspect the affected control at a representative narrow
width; expand checks only on evidence of a layout issue. Build only when an
updated installable artifact is needed. Do not add tests that merely repeat copy.
Mixed behavioral changes still require their higher-risk checks; narrow the
diff before deciding that a change is copy-only.

During behavioral code iteration, use `npm run check:quick -- test/<affected>.test.js` with
explicit tests; run the full suite when impact is unclear. Quick mode is not the
handoff gate. `check:handoff` includes `check`, `git diff --check` and
`release:dry-run`; do not run those again on unchanged inputs.

For browser checks use `npm run test:browser -- --suite <affected-suite>`;
shared styles, localization logic or shell changes require every affected suite.
Plain translated wording follows the display-copy row above.
Width/locale subsets are smoke checks, and fixtures are not live-game evidence.
Read summaries first and full logs on failure. Finish authorized implementation
and required verification; report blocked checks accurately.

## Git and release

Commit, push, publish, user-data deletion and broader automation require explicit
authorization. Existing authorization for the same action and scope need not be
requested again. Stage explicit files, never `git add .`.

For an authorized release, use `tools/release-current-version.mjs` and a fresh
`npm run release:dry-run` after all included work is settled. A concurrent task's
unfinished changes are not release inputs merely because they share this checkout.
Formal releases and CI retain their built-in full checks, including copy-only
releases; do not add a separate local full gate merely to hand off wording.
