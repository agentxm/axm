# @agentxm/cli-update

Native adapters for the CLI maintenance self-update capability: installation
inspection, package-manager protocols, executable replacement, and local
metadata and cache storage.

Installation facts, platform support, version relationships, and upgrade
eligibility are owned by
[`@agentxm/cli-maintenance`](../../supporting/cli-maintenance/README.md)'s
`self-update/domain` entry. Its `self-update/application` entry prepares the
upgrade candidate and owns separate `assessUpgrade` and `applyUpgrade` APIs.
Assessment requires only read contracts and installer instructions; application
owns availability, mutation, verification, recovery, and recording decisions.
This package supplies native implementations and CLI progress in `adapters/`
and connects them in `composition/`. Native ownership inspection returns
immutable command evidence through the same runner as installer operations.
Native adapters use the application-owned observer contract. The CLI adapter
owns operation labels, unique command units, byte-progress throttling, and
rendered command text; the delivery composition explicitly selects it. The
concrete CLI observer and its lifecycle test binding still need their final
package placement before consolidation.

- **Install ownership.** Detection across the script installer, Homebrew, npm,
  pnpm, and Yarn, from executable paths, the module URL, the package-manager
  user agent, and the recorded install metadata — including the ambiguous case
  a global-root probe settles, and the conflicting case it refuses.
- **Release selection.** The promoted stable channel is the only authority for
  "latest"; an exact stable version resolves to its immutable release
  coordinates without any discovery request.
- **The upgrade.** Publication availability is established through the owning
  installer before anything is mutated. Homebrew and the package managers are
  delegated to and then verified against both the manager-owned executable and
  the one the PATH selects. The script installer downloads, verifies the
  checksum and the staged executable's own version report, and replaces the
  target under its own process lock, restoring the original when anything
  after the replacement fails.
- **Update-cache storage.** Decode and atomically replace the validated channel
  snapshot through CLI maintenance's `UpdateCheckCache` contract. Suppression,
  freshness, notification eligibility, and refresh belong to that capability;
  notification wording belongs to the CLI.

Every termination resolves to one `axm.upgrade-assessment/v1` result carrying
ownership, the canonical release, availability, mutation and verification
state, the commands that ran, and the recovery the situation admits.

This capability keeps its own upgrade lock and atomic replacement: it acts on
an executable outside any workspace, so it is deliberately not a
`@agentxm/workspace-transactions` closure.

Unstable and unsupported — use the [axm.sh](https://axm.sh) CLI.

## Entry points

| Export                        | Contents                                                                                                                                         |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@agentxm/cli-update`         | Native service declarations and Homebrew identifiers                                                                                             |
| `@agentxm/cli-update/live`    | Environment-backed Layers the application composes once                                                                                          |
| `@agentxm/cli-update/testing` | A recording subprocess, a chosen install method, an in-memory metadata record and channel cache, a fixture release origin, and `runUpgradeTrial` |
