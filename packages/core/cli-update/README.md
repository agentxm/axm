# @agentxm/cli-update

The AXM self-update capability. It answers three questions about the copy of
`axm` running on this machine: which installer owns it, which release the
request selects, and what happens when that release is installed.

Installation facts, platform support, version relationships, and upgrade
eligibility are owned by
[`@agentxm/cli-maintenance`](../../supporting/cli-maintenance/README.md)'s
`self-update/domain` entry. Its `self-update/application` entry prepares the
upgrade candidate through owned installation-inspection and release-catalog
contracts. This package supplies native probes and CLI progress in `adapters/`
and connects them in `composition/`. Its remaining installer orchestration and
technology mechanisms have not yet been separated into application ports and
adapters.

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
- **The startup check.** Suppression rules, the cached channel document, the
  notification a fresh cache justifies, and the bounded background
  revalidation.

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
| `@agentxm/cli-update`         | `AssessUpgrade`, `previewOrApply`, `StartupUpdateCheck`, the assessment contract, and native service declarations                                |
| `@agentxm/cli-update/live`    | Environment-backed Layers the application composes once                                                                                          |
| `@agentxm/cli-update/testing` | A recording subprocess, a chosen install method, an in-memory metadata record and channel cache, a fixture release origin, and `runUpgradeTrial` |
