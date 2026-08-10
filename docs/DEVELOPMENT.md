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

For responsive layout auditing, open:

```text
http://127.0.0.1:4173/test-harness.html?layoutAudit=1&resetState=1&auditPlans=4&sidebarWidth=420
```

Run the full contract at sidebar widths `320`, `360`, `420`, `460`, `480`,
`520`, `560`, `610`, `720`, `900`, and `1200`, then inspect
`#layout-audit-output` for overflow, boundary overflow, and control overlap.
For the construction view, use:

```text
http://127.0.0.1:4173/test-harness.html?constructionAudit=1&resetState=1&sidebarWidth=420
```

Repeat the construction audit at the same eleven widths. It also verifies the
28-tile responsive catalog, square tile geometry, actual grid column count,
game sprite icons, grouped queue order, queue cutoff, search filtering, and
retained input focus.

## Local workbench

Unfinished patches, rejected hunks, screenshots, and throwaway
previews belong under .workbench/. This directory is intentionally ignored and
is not a substitute for version control: move completed work into the
appropriate source, test, documentation, or reference directory.

Locally retained third-party plugins belong under the visible
references/local-plugins/ directory. This directory is ignored by Git and the
release process, while tracked third-party references under references/ must
include provenance and license notes.
