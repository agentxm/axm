---
type: Architecture
status: stable
description: Authority, reproducibility, projection currency, and failure boundaries of the AXM lockfile.
depends-on:
  - ./overview.md
  - ./sources.md
  - ./execution.md
---

# Lockfile

Project-root `axm.lock` is AXM's generated, committed authority for
accepted external resolutions and their provenance, and the record of
projection generation currency and last-written digests. User scope keeps the same
authority in `~/.axm/workspace/axm.lock`. It is a reproducible-resolution snapshot
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

The current strict version is version 1 of `axm.lock`, a TOML document. Each
`[[package]]` record describes one retained package once: its `id`, the
self-describing `source` locator, the immutable resolved snapshot, and the
integrity of the complete retained tree. The `id` is the retained directory's
source address, computed by the same function that places the directory, so a
record and its directory cannot disagree; reading recomputes it from `source`
and refuses a mismatch. Per-kind binding tables bind a selected extension's
declared `name`, its Git revision `spec` when there is one, and its component
paths to that record. Record ids identify stable source boundaries; revisions
and artifact digests identify the accepted snapshot separately. The
[TOML lockfile decision](../decisions/toml-lockfile-with-labeled-records.md)
records why the file has this shape.

AXM writes the whole file in one canonical layout: a `#:schema` header,
`version`, the records sorted by `id`, the `[skills]` table, the MCP rows, the
remaining binding tables, the projection tables, and any `[tool.<name>]`
tables, with keys and rows in code-point order. Identical accepted state yields
identical bytes on every machine, and hand edits or comments do not survive the
next write. `[tool.<name>]` tables belong to other tools; AXM never reads them
and rewrites them from their parsed values on every write, so any TOML value a
tool stores there survives while its formatting and comments do not.

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

Binding tables are keyed by workspace extension name. MCP selections are
`[[mcp]]` rows identified by package and declared name, independently of local
connection names, which settings own. These bindings refer to the same package
record when their components share its retained boundary.

Exact fields and the strict lockfile version remain executable contracts owned
by schemas and behavior tests. The architectural requirement is that the row
identify one accepted external result and support verification or exact
rematerialization where the source can still reproduce it.

### Projection currency

The optional projection tables record, per projection kind (`rules`,
`knowledge`, `instructions`, `subagents`), a `contract` version in
`[projections.<kind>]` and one row per unit in `[projections.<kind>.units]`,
keyed by its scope-relative path: `gen`, the input-only generation digest, and
`output`, the digest of the bytes AXM last wrote. Keys are sorted by code point;
absolute or escaping paths are rejected on read. A changed `contract` strips `gen` from
that kind's rows and keeps `output`, so the units are stale but their deletion
evidence survives. Rows are written by every command that writes the
projection and withdrawn with the unit, inside the same closure, and a failed
transition restores them exactly. The
[managed-file ownership](managed-file-ownership.md#projection-currency) record
owns how currency and the deletion guard use them.

Deleting the lockfile drops the rows; the next sync records identical whole
files, blocks differing ones until an explicit replace, and rewrites each region
once.

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
- establish authorship or ownership of agent-native output, including through
  projection rows, which are currency and deletion evidence only;
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
Selected member bindings remain in their own per-kind tables. Updating a package
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
access, or mutation. `--force` does not bypass this authority gate. IO, TOML
parse, schema decode, and unsupported-version failures remain distinct so the
diagnosis names the path and a recovery appropriate to the observed state.

An unsupported positive-integer `version` reports the observed and
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

The superseded YAML lockfile, `axm-lock.yaml`, is such an older lockfile. Its
presence in either scope is refused before `axm.lock` is read, whether or not
`axm.lock` exists, with the version it declares (or 0) as the observed version
and the older-lockfile recovery. AXM reads nothing else from it and migrates
nothing.

## Persistence and failure

An external materialization and its lock-row change belong to the same semantic
mutation closure. Settings, lock state, canonical content, and owned outputs
needed for that closure commit together or a handled failure rolls the closure
back. There is no post-success receipt-maintenance phase or receipt-write
failure mode.

Under the workspace mutation lock, AXM revalidates the lock preimage and every
other material authoritative input. A stale plan performs no writes. The
lockfile publishes the whole canonical document through atomic replacement,
carrying forward unrelated rows and `[tool.<name>]` tables.

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
