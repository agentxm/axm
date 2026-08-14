---
status: stable
description: Desired-state reconciliation, closure-local progress, and recovery semantics for AXM sync.
depends-on:
  - ./overview.md
  - ../workspace/overview.md
  - ../workspace/settings.md
  - ../workspace/lockfile.md
  - ../workspace/invariants.md
  - ../workspace/execution.md
---

# Sync

`axm sync` makes AXM-managed installed state and owned outputs agree with
desired workspace state. It is reconciliation, not updating, workspace
configuration editing, native-content adoption, or generic repair.

## Responsibilities

Sync consumes the same intrinsic invariant facts as lint and adds operational
evidence needed for source acquisition and application. It reconciles desired
state with:

- authoritative accepted-resolution state in the lockfile;
- present canonical extension content and bundled content;
- authoritative inline configuration;
- configured agents and workspace capabilities; and
- adapter-owned native output observations.

It resolves a desired external extension only when no accepted resolution
exists, reacquires missing canonical content only from the exact locked
identity, materializes bundled content, reconciles required owned outputs, and
removes unreachable AXM-managed state only when desired-graph and ownership
evidence are complete.

`axm sync --preview` presents the same closure decisions application will
attempt. Preview performs no workspace writes.

## Non-responsibilities

Sync does not change authored configuration, advance a satisfying accepted
resolution, publish content, claim unowned native content, or remove
workspace-authored inventory merely because it is not desired. It does not
choose between conflicting explicit choices.

Present byte drift in installed external canonical content is preserved during
ordinary sync and remains valid projection input. Explicit update or reinstall
owns replacement and discloses it.

Sync realizes configured agents, instruction-file behavior, and inline MCP
definitions without inventing extension archives, canonical copies, or lock
rows. It does not add detected agents, enable instruction management, choose a
different canonical instruction file, or activate a disabled contributor.

## Accepted resolution and source availability

A desired external extension without a lock row may resolve and verify once.
Its lock row, canonical content, and affected owned outputs commit atomically.
A satisfying locked resolution remains stable; update owns advancement.

Sync and reinstall rematerialize only the immutable locked identity. If a Git
or local-path source no longer reproduces that identity and canonical content
is missing, the affected closure blocks. AXM never substitutes current source
bytes. Missing, malformed, or incompatible lock authority is consequential and
is never reconstructed from legacy `trust.json`, installed content, or Pack
member metadata.

A Registry Pack contributes dependencies only from its accepted locked manifest
or a local manifest that semantically matches that identity. Lock-only member
maps cannot create dependency routes.

Source availability and acquisition failure may block sync without becoming
lint findings. Capabilities without external sources do not participate in
resolution.

## Output reconciliation

Every projection adapter and workspace-surface writer applies the same family
of decisions at its smallest independently mutable ownership unit:

| Observed native unit                                | Sync behavior                                         |
| --------------------------------------------------- | ----------------------------------------------------- |
| Required and missing                                | Create it with durable unit-local ownership evidence. |
| Required, AXM-owned, and stale                      | Restore it.                                           |
| No longer required and AXM-owned                    | Remove it.                                            |
| Unowned and independently coexisting                | Preserve it and plan no change.                       |
| Required unit occupied by unowned content           | Block the affected closure and preserve it.           |
| Ownership evidence missing, malformed, or ambiguous | Block the affected closure and preserve the content.  |

Path, name, matching bytes, or ownership of a surrounding file never prove
ownership of the unit. AXM does not adopt equivalent native content. Manual
preservation, relocation, or removal owns recovery from an unowned collision.

## Semantic mutation closures

A semantic mutation closure connects work through desired reachability,
combined desired/lock/canonical postconditions, a shared native ownership unit,
or invariants requiring joint validation. Physical co-location in a settings,
lock, or native file does not by itself merge closures.

Global sync automatically applies every ready closure. A blocker causes no
writes in its closure. A handled failure rolls back only its closure, and later
independent closures continue. Human and machine results classify each closure
as applied, no-op, blocked, failed, or rolled back.

The overall command exits nonzero whenever the complete request does not
converge, including when independent closures committed successfully. Partial
progress is therefore truthful state, not global success.

Cleanup that requires a complete graph is a separate maintenance closure and
runs only when graph construction is complete.

## Failure and interruption

Before writing, application acquires the workspace OS lock and revalidates all
material authoritative inputs and target preimages. A stale plan writes
nothing, and `--force` cannot bypass the check.

Settings, authoritative lock state, canonical content, and owned outputs in one
closure commit together. A handled application failure restores the closure's
pre-application state while preserving independent committed closures.

Abrupt termination must not tear an authoritative file, expose an incomplete
canonical directory, or lose authored or unowned content. The next mutation
converges affected state from surviving authority before evaluating its own
request; it does not resume or roll back the interrupted command.

## Testing strategy

The recovery-conformance registry owns exhaustive blocker restoration. Sync
tests cover shared intrinsic facts, operational blockers, preview/apply
identity, stable locks, exact source-class rematerialization, adapter ownership
parity, graph-complete cleanup, closure isolation, rollback, stale plans,
concurrency, interruption, and nonzero results with committed independent
closures.

Cross-type tests exercise missing, stale, obsolete, collision, ambiguous
ownership, safe removal, and manual unowned-collision recovery. Second-run
assertions prove convergence and idempotence.
