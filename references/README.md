# External references

Files in this directory are third-party reference implementations. They are
not build inputs and must not be copied into the project without reviewing
their behavior, provenance, and license.

## Local plugin collection

The visible local-plugins/ directory contains third-party plugins retained as
local reference material. It is deliberately excluded from Git and the release
whitelist, but remains visible in Finder and other file browsers. Its nested
README records the original SHA-256 digests.

## MWI Guild Donation Value

- File: mwi-guild-donation-value-v0.7.6.user.js
- Upstream version: 0.7.6
- Source: Greasy Fork script 586854
- License declared by the userscript: MIT
- Purpose here: compare public market and guild-planning approaches.

The project already has its own market bridge and cache consistency model.
This reference must not introduce a second competing WebSocket or market-state
arbitration path.
