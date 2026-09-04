---
type: Architecture
status: stable
description: Stable-channel selection, installer coordination, mutation, verification, and recovery for AXM self-upgrade.
depends-on:
  - overview.md
  - output.md
---

# Upgrade

`axm upgrade` updates the AXM executable without making GitHub's release list,
an npm dist-tag, or a package-manager formula the authority for which release is
stable. The public stable-channel document is that authority. Distribution
systems remain independent delivery mechanisms whose readiness is checked
before mutation.

## Selection

`axm upgrade` reads the fixed public stable-channel document once and validates
its complete release coordinate, artifact URLs, checksums, revision, and
timestamps. A malformed, missing, rate-limited, or unavailable channel produces
an explicit result and no installation change. Startup update notification uses
the same channel and a bounded local cache, but cache state never authorizes an
explicit upgrade.

`axm upgrade <version>` selects one normalized stable semantic version without
network discovery. It derives the immutable `cli-v<version>` GitHub Release
coordinate and refuses leading `v`, prerelease, and non-normalized input. Exact
selection does not change the promoted channel.

Downgrades are refused in both modes. `--reinstall` permits replacement only
when the selected and installed versions are equal.

`axm upgrade --dry-run` resolves ownership and the target and reports the
delegated action it would perform, without performing it. A preview changes no
durable state — not the installation, not install metadata, not the
update-notification cache — and it does not establish installer availability,
because it is the run that would mutate which must find the selected version
published.

## Installer ownership and availability

AXM determines installation ownership before selecting a release. Ownership
decides the supported mutation path:

- npm, pnpm, and Yarn use their own global package operation;
- Homebrew uses the AgentXM tap formula;
- the install script replaces its managed executable transactionally; and
- unresolved ownership produces recovery guidance rather than guessing.

For package-manager-owned installations, AXM checks that the selected version
is actually available from that manager before mutation. A lagging, leading,
unavailable, or indeterminate manager blocks the change and reports the
observed state. The stable channel therefore does not pretend that independent
distribution has converged.

## Mutation and verification

The script installation path downloads only URLs accepted from the channel or
derived from an exact immutable coordinate. It verifies the checksum manifest,
prepares and executes the candidate to confirm its exact version, preserves a
recoverable backup, replaces the executable, and verifies the installed entry
point. A failure after replacement attempts rollback and reports whether
recovery remains necessary.

Delegated package-manager operations preserve command evidence and verify the
manager-owned entry point after completion. AXM never reports a successful
upgrade solely because the manager process exited successfully.

## Disclosure

The upgrade delegates its real work to another tool, so the resolved facts that
decide what happens are disclosed by the step that establishes them rather than
only by the terminal result. Detection settles by naming the installer it found,
release selection by naming the version it chose, and the mutation step carries
both for as long as it runs. Each command handed to the installer is a nested
unit of that step, and a poll that blocks on an external publication is
published as a wait naming what it waits on.

Default output carries the resolved facts a reader cannot obtain any other way
and that change what happened: the install method, each delegated command, and
the verified executable with the version it reported. Verbose output carries the
full command-by-command evidence. A terminal failure shows the tail of the
failing command's output at default verbosity, because recovering from it should
not require rerunning a mutating command.

## Machine result

Machine mode emits one `axm.upgrade-assessment/v1` result. It records the
requested intent, platform, detected ownership, canonical selection,
installer-availability state, target, mutation, verification, recovery,
commands, and supporting details. Its disposition distinguishes successful,
no-op, blocked, failed, and indeterminate states without requiring a consumer
to parse human text.

The result is a snapshot of the attempted upgrade. It is not a durable
workspace document and does not alter extension intent or workspace state.
