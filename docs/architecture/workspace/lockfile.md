---
status: stable
description: Purpose, authority, and failure boundaries of AXM receipt history.
depends-on:
  - ./overview.md
  - ./trust.md
---

# Lockfile

`.axm/axm-lock.yaml` is AXM's generated, committed receipt history for
successful resolution and materialization work. The conventional lockfile name
does not make it a reproducible-resolution snapshot or an input to workspace
planning.

Settings and authored manifests own durable workspace configuration. Trust and
provenance own the accepted source and resolution baseline. The filesystem owns
what is currently present. The lockfile records what AXM completed after those
authorities have already determined and realized an operation.

## Responsibilities

Receipt history records known results of completed work. Depending on the
operation, a receipt may include source, version or revision, content identity,
and timing information that AXM actually observed. Exact fields and retention
behavior are executable contracts owned by the schema, code, and tests.

Lifecycle and reconciliation operations maintain receipts only after their
corresponding business work succeeds. AXM may later normalize or reconstruct a
receipt only from facts already established by authoritative state or newly
completed work. It does not fetch, alter business state, or invent historical
facts solely to enrich receipt history.

A source-free capability may have a receipt of successful realization. For
example, an inline MCP definition can have receipt history without acquiring an
extension archive, canonical extension content, or a resolved extension
version.

## Non-responsibilities

The lockfile does not:

- express workspace configuration or desired state;
- create reachability or retain an extension;
- establish trust, provenance, authorship, or ownership;
- prove that extension content or a managed output is currently present;
- pin a version, select a source, or participate in a business plan;
- authorize acquisition, cleanup, overwrite, or an authority transition; or
- provide an append-only audit log or a reproducible installation snapshot.

A receipt row may describe previously completed work without describing current
desired or observed state. Copying or editing a row transfers none of the
authority recorded elsewhere.

## Planning boundary

Desired state, trust and provenance, source evidence, canonical content, inline
configuration, and managed outputs determine lifecycle and reconciliation
plans. Varying receipt history while holding those inputs fixed produces the
same business plan.

An accepted resolution recorded in trust remains stable while it satisfies
desired constraints. Sync or reinstall may use that trusted resolution to
reacquire missing external content where the source supports it; update owns
advancement. Receipt history neither supplies nor overrides that resolution.

A receipt cannot establish or reconstruct trust. Missing or invalid trust is
recovered only from authoritative configuration and verified source evidence.

## Missing, invalid, and stale history

Missing, malformed, stale, or absent receipt rows do not make the workspace
invalid, block business work, create or remove reachability, or authorize
cleanup. AXM may preserve, replace, or remove receipt metadata after planning
when it can do so truthfully from already known facts.

Receipt recovery never invents an earlier timestamp, version, source identity,
or completed operation. If the available facts cannot support a field, AXM
omits the field or leaves history incomplete according to the executable schema
contract.

## Persistence and failure

Receipt writes are serialized and atomic as receipt-history updates. They occur
after the corresponding business work succeeds and preserve unrelated history.

A receipt-write failure does not roll back successful settings, trust,
canonical-content, inline-configuration, or managed-output changes. AXM reports
the completed work and the distinct history-persistence failure truthfully. A
later operation may restore only the history it can establish without changing
the business plan.

Users commit the lockfile so collaborators can share useful operation history,
but they do not maintain it by hand.

## Testing strategy

Behavior tests prove post-success persistence, serialized updates, truthful
partial progress, missing and malformed history independence, stale-row
independence, source-free receipts, no fetch or business mutation solely for
history, no trust reconstruction from receipts, and receipt-write failure
without rollback of completed business work.

Metamorphic tests vary, remove, corrupt, and add receipt rows while holding
desired, trust, observed, and source state fixed and require the same business
plan.
