# Releasing

## Artifact policy

- dist/ contains the current public installation artifact and development
  outputs.
- The primary installation file is `dist/milky-way-idle-guild-assistant.user.js`.
  Every build also writes `dist/milky-way-idle-guild-credit-optimizer.user.js`
  as a byte-identical compatibility copy for existing links and sync sources.
  Both files are release inputs; repository and release checks reject divergence.
- Keep the existing script identity, Greasy Fork script ID `586873`, update and
  download URLs, and storage keys when changing artifact names. The GitHub
  repository URL and development loader filename remain unchanged.
- releases/vMAJOR.MINOR/ contains every retained historical userscript.
- The historical filename is
  银河奶牛公会信用点性价比-vMAJOR.MINOR.PATCH.user.js.
- Historical artifacts are immutable. Rebuilding the same version with
  different bytes is an error, not an overwrite.
- releases/manifest.json records the semantic-version order, byte size, and
  SHA-256 digest of every retained artifact.
- A normal npm run build never writes to releases/.

## Dry run

Before a release:

```bash
npm run release:dry-run
```

The dry run checks the branch, upstream state, repository identity, release
whitelist, and ignored local work without changing files or using the network.

## Release

After explicit approval:

```bash
npm run release
```

The release workflow increments or validates the version, updates the
changelog, runs the full check, creates the one new immutable archive, stages
only allowlisted paths, commits, pushes main, verifies the remote commit, and
waits for Greasy Fork synchronization.

The built-in full check uses compact stage summaries and retains complete
logs under `.workbench/check-*`. Do not manually run each constituent check
again after it succeeds. The release gate still runs after version/changelog
updates and inherits `MWI_ARCHIVE_RELEASE=1`; quick checks and previous local
passes never bypass it. Browser/game verification remains a separate requirement
when the change affects those boundaries.

Never use git add . in this repository.

## Rollback

Do not rewrite an existing historical artifact. If a published version is
faulty, restore the source in a new commit and publish a higher patch version.
The earlier file remains in releases/ as an accurate record of what was
released.

## Default-on statistics release dependency

The guild build now defaults installation/activity statistics on while preserving saved opt-outs. Turning off attempts one identity-free opt-out report, with no retry. The receiver and computer-sync source changes are local preparation, not proof of deployment.

Before publishing this policy:

1. Consistently back up relay and computer databases, then update the computer-sync installed runtime before the receiver. The schema-3 migrations preserve schema-2 heartbeat history; rollback requires the matching backup, not simply an old executable.
2. Deploy the receiver supporting `/v1/opt-out`, retaining strict heartbeat validation and authenticated batch/ACK. Verify a bounded test event through durable sync without treating it as real-user data.
3. Verify default-on, saved-off upgrade, off-event delivery and failure behavior in the final Tampermonkey script. Fixture checks are separate evidence.
4. Review and publish `docs/GREASY_FORK_DESCRIPTION.md` as the public introduction alongside the final script. The public introduction could not be read in this run (HTTP 403); this is a complete replacement draft based on current project sources. Do not claim the public page was updated.

Use `python3 ../插件使用量统计/source/client/sync_clients.py --project 银河奶牛公会助手 --check` to check only the authorized guild client. Other assistants retain their existing deployed policy and are not release inputs for this task.
