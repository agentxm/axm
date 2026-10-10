---
type: Architecture
status: stable
description: Authority, reproducibility, and failure boundaries of the AXM lockfile.
depends-on:
  - ./overview.md
  - ./sources.md
  - ./execution.md
---

# Lockfile

Project-root `axm-lock.yaml` is AXM's generated, committed authority for
accepted external resolutions and their provenance. User scope keeps the same
authority in `~/.axm/workspace/axm-lock.yaml`. It is a reproducible-resolution snapshot
used by planning, materialization, update, reinstall, and cleanup.

Settings establish desired roots and activation. Workspace-authored manifests
supply authored Pack dependencies; matching accepted Pack rows supply acquired
Pack dependencies. A lock row alone never creates a desired root (the executable specification
`cli/lock-state-never-creates-reachability` in the
[specification catalog](../../../specifications/catalog.md) owns the
obligation).

## Responsibilities

Each external resolution row records enough immutable identity to distinguish
the accepted content from another result at the same mutable source:

- a Registry version, extension-archive integrity, and publisher binding;
- a Git commit and tree identity; or
- a path content identity.

The current strict version is version 11. Its `packages` map records each
retained package once: the self-describing source locator, immutable resolved
snapshot, and integrity of the complete retained tree. Per-kind maps bind
selected extension identities and component paths to that package. Package keys
identify stable source boundaries; revisions and artifact digests identify the
accepted snapshot separately.

The retained directory follows the actual source address, as described in
[canonical extension content](overview.md#canonical-extension-content).
Neither a local alias nor the selected extension kind changes that directory.
Several Skills, MCP connections, or co-located native extension kinds can share
one package without duplicating its payload or accepted snapshot. A selection
never activates its unselected siblings.

Registry locators record the Registry URL; their resolution records version,
archive integrity, and publisher binding. Git locators record clone URL and
selected package boundary; their resolution records commit and tree. Local
locators distinguish project-relative and absolute filesystem coordinates.
HTTP locators preserve the logical URL, source kind, selected index entry, and
accepted artifact manifest needed for exact replay. Configured Registry names
and version constraints remain desired-state input rather than package identity.

Most extension maps are keyed by workspace extension name. MCP bindings use
source identity independently of local connection aliases. These bindings refer
to the same package record when their components share its retained boundary.

Exact fields and the strict lockfile version remain executable contracts owned
by schemas and behavior tests. The architectural requirement is that the row
identify one accepted external result and support verification or exact
rematerialization where the source can still reproduce it.

A satisfying accepted resolution remains stable during install and sync. `update` owns
advancement. A desired external extension without a row may resolve once and
atomically establish one; AXM never infers a row from installed bytes, obsolete
state, or prior command history.

## Non-responsibilities

The lockfile does not:

- express direct membership, activation, direct constraints, or workspace capability
  configuration;
- create roots or retain otherwise unreachable content (the
  executable specification
  `cli/lock-state-never-creates-reachability` owns the obligation);
- establish authorship or ownership of agent-native output;
- prove that canonical content or a managed output is currently present;
- record command history, completion timestamps, or source-free realization;
- serve as an append-only audit log; or
- authorize overwrite or removal without the applicable declaration or scoped
  ownership authority.

An acquired Pack row records its complete dependency declarations, including
version ranges and explicit Registry authorities, alongside its manifest version
and semantic content identity. A configured Pack that matches that row derives
its dependency edges from this declaration even when installed files are absent
or changed. Git and path rows retain the source root used by inherited members.
Selected member bindings remain in their own per-kind maps. Updating a package
advances every selected binding to that package together, including disabled
selections and members reached through multiple Packs. An owning Pack at a
different package boundary retains its accepted resolution. Inline MCP definitions,
workspace-authored content, and bundled content have no artificial external-
resolution rows.

A package remains retained while any selected binding or desired direct or Pack
route requires it. Explicit uninstall withdraws only the selected native units
and unused binding. Reachability changes alone retain native MCP and Hook
registrations. Package deletion refuses while retained native registrations
reference its code; the caller must explicitly clean those references before
releasing the last package consumer.

## Planning and materialization

Desired state supplies the need and constraint; source resolution supplies an
eligible result; verification establishes immutable identity; and the lockfile
records the accepted result. Copying data among these surfaces does not transfer
their authority. Acquired Pack manifests are verified against the proposed
declaration before publication. The declaration's semantic hash also detects
inconsistent lock metadata; it is not a signature or an authenticity guarantee.

Sync and reinstall rematerialize only the exact locked identity. When a mutable
Git or path source no longer reproduces that identity and canonical
content is unavailable, the affected semantic mutation closure blocks. AXM
does not substitute current bytes. An explicit update may resolve and accept a
new identity within durable version intent. It reacquires a shared package once
and validates every retained selection before publishing the replacement; a
missing component blocks the whole package transition.

Present byte drift in acquired external canonical content does not alter the
lock row or transfer authorship. It does make the accepted installed tree
untrustworthy as projection or publication input: affected reads, mutation
closures, and preflight checks block until explicit install, `update`, or
`fork` establishes valid authority again. AXM does not silently overwrite the
drift during ordinary sync or activation. Repeating install at the same accepted
constraint authorizes exact restoration without resolving a newer version.

Queries and stable planning phases share captured configuration, accepted rows,
desired evaluation, and observations. Graph knowledge and observed content health
remain separate: inventory still discovers local and unmanaged content, and
physical checks still govern projection and deletion. A new query, apply-time
validation, or an observation after a write or rollback acquires a fresh view.
Persistence writers always read current authoritative state.

## Invalid and incompatible state

Missing, malformed, or incompatible authoritative lock state is consequential.
Read-only commands may report it, but no command reconstructs accepted
resolution from other metadata, installed content, or Pack-member maps.

AXM accepts only the current strict lockfile version. There are no dual readers,
automatic migration or cleanup, aliases, or downgrade mode.

Every ordinary workspace-loading command validates a present lockfile during
workspace construction, before command-specific reads, planning, Registry
access, or mutation. `--force` does not bypass this authority gate. IO, YAML
parse, schema decode, and unsupported-version failures remain distinct so the
diagnosis names the path and a recovery appropriate to the observed state.

An unsupported positive-integer `lockfileVersion` reports the observed and
supported versions and whether the lockfile is older or newer than the running
AXM. Machine output carries those same facts in a structured problem. If the
lockfile is newer, the only safe route is to upgrade AXM; the CLI does not
suggest setup, restoration, removal, or downgrade. This diagnosis also wins
when a known current-scope lockfile is newer but current settings are absent.

An older lockfile requires explicit re-acceptance rather than migration:
preserve the incompatible bytes outside the authoritative path, review desired
intent, and preserve unproven acquired content outside prospective destination
paths before previewing fresh resolution. Apply only after reviewing the preview. External resolutions may change because the old
accepted format is not read. A workspace containing only workspace-authored
content may correctly finish with no lockfile.

## Persistence and failure

An external materialization and its lock-row change belong to the same semantic
mutation closure. Settings, lock state, canonical content, and owned outputs
needed for that closure commit together or a handled failure rolls the closure
back. There is no post-success receipt-maintenance phase or receipt-write
failure mode.

Under the workspace mutation lock, AXM revalidates the lock preimage and every
other material authoritative input. A stale plan performs no writes. The
lockfile publishes through atomic replacement, preserving unrelated rows.

## Specifications

The whole-surface workspace specifications own the lockfile's boundary
obligations: `cli/lock-state-never-creates-reachability`,
`cli/workspace-lockfile-rejections-name-state-and-recovery`, and
`cli/lockfile-version-errors-expose-structured-problem`.
`cli/sync/preserves-configuration-and-resolutions` and
`cli/update/advances-resolution-within-intent` own stable resolution and
update-only advancement; the
[specification catalog](../../../specifications/catalog.md) resolves each
identity to its owning project and file. Exact
fields, the strict lockfile version, and source-class fixtures remain executable
contracts owned by schemas and the implementation's internal tests.
