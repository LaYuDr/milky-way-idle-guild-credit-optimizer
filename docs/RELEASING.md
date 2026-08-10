# Releasing

## Artifact policy

- dist/ contains the current public installation artifact and development
  outputs.
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

Never use git add . in this repository.

## Rollback

Do not rewrite an existing historical artifact. If a published version is
faulty, restore the source in a new commit and publish a higher patch version.
The earlier file remains in releases/ as an accurate record of what was
released.
