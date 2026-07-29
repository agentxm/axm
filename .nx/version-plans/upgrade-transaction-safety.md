---
__default__: minor
---

Make `axm upgrade` transactional and installation-method aware. Release selection now follows pagination, chooses the highest stable CLI semver, and requires platform binaries plus `SHA256SUMS`; script installs verify integrity and exact versions before replacement and roll back failed replacements; npm, pnpm, Yarn Classic, and Homebrew upgrades delegate only through the owning manager. The `axm upgrade --json` result is intentionally breaking: `resultStatus`, nullable version fields, structured verification and mutation state, `executedCommands`, and `recommendedCommand` are authoritative, while `delegatedCommand` remains for one deprecation window.
