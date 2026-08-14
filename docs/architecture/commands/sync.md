---
status: stable
description: Desired-state reconciliation, projection recovery, and failure semantics for AXM sync.
depends-on:
  - ./overview.md
  - ../workspace/overview.md
  - ../workspace/settings.md
  - ../workspace/lockfile.md
  - ../workspace/trust.md
  - ../workspace/invariants.md
---

# Sync

`axm sync` makes AXM-managed installed state and managed outputs agree with
desired workspace state. It is reconciliation, not updating, workspace
configuration editing, or generic repair.

## Responsibilities

Sync derives desired state from workspace configuration and trusted extension
metadata. It consumes the same workspace invariant facts as lint, then combines
them with the operational evidence needed to plan reconciliation. It compares
desired state with configured agents, source policy, accepted trust and
resolution, canonical extension content, inline configuration, bundled
content, instruction surfaces, and other managed outputs. It produces a plan
that:

- resolves and establishes trust for a desired sourced extension that lacks an
  accepted resolution;
- reacquires missing external canonical extension content from its accepted
  resolution where the source supports it;
- materializes required bundled content;
- creates or restores required AXM-owned agent and workspace outputs; and
- removes unreachable AXM-managed trust, canonical content, and projections
  when the desired graph and ownership evidence are complete.

Receipt maintenance follows successful application. It is not an input to this
plan.

`axm sync --preview` shows the same plan that application would attempt.

## Non-responsibilities

Sync does not change workspace configuration, advance a satisfying accepted
resolution, publish content, overwrite unowned units, or remove
workspace-authored content merely because it is not desired. It does not choose
between conflicting explicit choices.

An operational blocker used by sync does not become a lint violation merely
because it prevents reconciliation.

Present external canonical byte drift is left alone by ordinary sync. Use an
explicit update or reinstall when the user intends AXM to replace that content.

Sync realizes configured agents, instruction-file behavior, and inline MCP
definitions without inventing extension archives, canonical extension content,
or resolved extension versions for them. Successful source-free realization
may still produce receipt history. Sync does not add detected agents, enable
instruction management, select a different canonical instruction file, or
activate a disabled contributor.

## Resolution and trust

A desired sourced extension without accepted resolution evidence may resolve
once and establish trust. An accepted resolution satisfying desired constraints
remains stable. If its external canonical extension content is missing, sync
may reacquire the same version or revision where the source supports it; a
newer available result is update's responsibility.

Missing, malformed, stale, or absent receipt history does not change this plan
or become a sync blocker. Receipt history cannot reconstruct trust. AXM does not
fetch or mutate business state solely to enrich it.

Registry pack dependencies participate in resolution only from a trusted
registry manifest or a local manifest that matches it. A divergent local copy
cannot silently redefine the registry dependency graph.

Configured capabilities without external sources do not participate in
resolution. Their settings and observed output ownership are the relevant
authorities.

## Output reconciliation

Every agent adapter and workspace-surface writer applies the same decisions:

| Observed native unit                                   | Sync behavior                   |
| ------------------------------------------------------ | ------------------------------- |
| Required and missing                                   | Create it.                      |
| Required, AXM-owned, and stale                         | Restore it.                     |
| No longer required and AXM-owned                       | Remove it.                      |
| Unowned and independently coexisting                   | Preserve it; plan no change.    |
| Required unit occupied by unowned or ambiguous content | Block and preserve the content. |

These decisions apply to skills and every other projected extension type.
Each type defines its ownership unit and whether independent coexistence is
possible. Sync does not infer that decision from a different extension type.

## Blockers and partial progress

Sync groups extensions that must change together because of Pack membership or
shared outputs. A blocker leaves that entire group untouched. A separate group
that does not depend on the same changes may still apply, and the result reports
both completed and blocked work honestly.

Cleanup that requires a complete desired graph does not run when any missing or
invalid input prevents that graph from being known. This avoids deleting
content whose reachability cannot yet be determined.

## Failure and interruption

Before writing, sync checks that authoritative inputs and target state still
match the plan. A stale plan writes nothing, and `--force` cannot bypass that
check. Two changes to the same workspace scope must not interleave.

Handled application failure rolls back the extensions that were changing
together. Independent groups already completed remain truthful completed work.
Receipt persistence follows successful application; its failure does not undo
completed business work and is reported separately.

Abrupt termination must not leave a partly written authoritative file or lose
authored or unowned content. A later run finishes safely from authoritative
state without a general repair command.

## Testing strategy

Sync tests own the reconciliation scenarios. The shared
[workspace invariant design](../workspace/invariants.md) owns exhaustive
blocker recovery coverage. Cross-type tests exercise independent unowned
content, collisions, ambiguous authority, stale owned outputs, and safe
removal. Other cross-cutting tests cover preview/application identity,
independent-group isolation, adapter ownership parity, rollback, stale plans,
concurrency, interruption, and truthful partial progress.

Receipt-independence tests vary, remove, corrupt, and add stale history while
holding desired, trust, observed, and source state fixed and require the same
sync plan. Other tests prove post-success receipt maintenance, no fetch solely
for history, and truthful receipt-write failure without business rollback.
