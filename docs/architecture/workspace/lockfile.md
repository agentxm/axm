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

Settings and workspace-authored manifests remain the only authority for desired
intent and reachability. The lockfile answers which immutable external content
AXM accepted for a desired source; it never answers whether an extension is
desired (the executable specification
`cli/lock-state-never-creates-reachability` in the
[specification catalog](../../../specifications/catalog.md) owns the
obligation).

## Responsibilities

Each external resolution row records enough immutable identity to distinguish
the accepted content from another result at the same mutable source:

- a Registry version, extension-archive integrity, and publisher binding;
- a Git commit and tree identity; or
- a local-path content identity.

The current strict version is version 7. Every acquired package row records
the exact source type, source name, endpoint or coordinates, requested intent,
and immutable resolution. It also
records `treeIntegrity`, the deterministic integrity of the complete installed
package tree under `agent_extensions/<source-name>/<source-full-name>/`. This package-level
identity covers every shipped file, including companion files outside the
extension's primary payload, rather than treating a single manifest or entry
file as the installed unit.

Most extension maps are keyed by workspace extension name. MCP resolution rows
are instead keyed by source identity: source authority plus published package
FQN for Registry packages, or the corresponding stable identity for another
source class. The local connection name is deliberately absent from that key.
Consequently, multiple local MCP connections can share one accepted resolution
and one canonical acquired package without making the lock row a declaration of
any connection.

Exact fields and the strict lockfile version remain executable contracts owned
by schemas and behavior tests. The architectural requirement is that the row
identify one accepted external result and support verification or exact
rematerialization where the source can still reproduce it.

A satisfying accepted resolution remains stable during sync. `update` owns
advancement. A desired external extension without a row may resolve once and
atomically establish one; AXM never infers a row from installed bytes, obsolete
state, or prior command history.

## Non-responsibilities

The lockfile does not:

- express direct membership, activation, constraints, or workspace capability
  configuration;
- create Pack-member reachability or retain otherwise unreachable content (the
  executable specification
  `cli/lock-state-never-creates-reachability` owns the obligation);
- establish authorship or ownership of agent-native output;
- prove that canonical content or a managed output is currently present;
- record command history, completion timestamps, or source-free realization;
- serve as an append-only audit log; or
- authorize overwrite or removal without the applicable ownership and desired-
  graph evidence.

Pack-member metadata in a lock row can verify the accepted Pack manifest but
cannot independently contribute dependency edges. Inline MCP definitions,
workspace-authored content, and bundled content have no artificial external-
resolution rows.

An MCP row remains reachable while at least one local connection or Pack route
requires its source. Removing one local connection does not remove shared
canonical content or its accepted row; removing the final route does.

## Planning and materialization

Desired state supplies the need and constraint; source resolution supplies an
eligible result; verification establishes immutable identity; and the lockfile
records the accepted result. Copying data among these surfaces does not transfer
their authority.

Sync and reinstall rematerialize only the exact locked identity. When a mutable
Git or local-path source no longer reproduces that identity and canonical
content is unavailable, the affected semantic mutation closure blocks. AXM
does not substitute current bytes. An explicit update may resolve and accept a
new identity within durable version intent.

Present byte drift in acquired external canonical content does not alter the
lock row or transfer authorship. It does make the accepted installed tree
untrustworthy as projection or publication input: affected reads, mutation
closures, and preflight checks block until explicit `reinstall`, `update`, or
`fork` establishes valid authority again. AXM does not silently overwrite the
drift during ordinary sync.

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
intent, remove the incompatible file, preview fresh resolution, and apply only
after reviewing the preview. External resolutions may change because the old
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

The whole-surface workspace specifications at the root of `specifications/cli/`
own the lockfile's boundary obligations: lock state never creates reachability,
lockfile rejections name state and recovery, and version errors expose a
structured machine problem. The sync and update specifications under
`specifications/cli/sync/` and `specifications/cli/update/` own stable resolution
and update-only advancement; the
[specification catalog](../../../specifications/catalog.md) indexes them. Exact
fields, the strict lockfile version, and source-class fixtures remain executable
contracts owned by schemas and the implementation's internal tests.
