# Batch review: an unreadable Knowledge bundle is left out and reported

Set review for the batch that makes the generated instructions file omit a
Knowledge bundle whose package AXM cannot read, report that omission wherever
the file is written or inspected, and stop failing unrelated extension
operations because of it. This record is evidence for the maintainer's
acceptance decision; it is not authority.

## Boundary

- Scope: one new candidate specification, one evidence revision of an accepted
  specification, one new lint rule identity, and the shared projection
  planning contract that carries exclusions.
- Baseline revision: `5266c4b4b` (the commit before the implementation).
- Source set:
  - AXM-1640's knowledge-half occurrence: two retired bundles, each the
    other's unreadable sibling, where uninstalling either exited `9` with
    failure code `validation` and disposition `restored` while its preview
    reported ready;
  - the shared contributor selector `selectKnowledgeBundles` and the three
    call paths that reach it through `applyManagerProjectionPlans` — install,
    enable/disable, and uninstall — plus the trailing aggregate step of pack
    and workspace installs and `reconcileAggregateProjections`;
  - the two decision records on AXM-1708 dated 2026-09-03: the choice of
    exclusion over a readiness pre-check, and the replacement of the
    preview-parity clause with a report-wherever-rendered obligation, the
    tolerance boundary, and the messaging rule;
  - the withdrawn alternatives, both declined rather than deferred:
    preview-time enumeration of exclusions (needs a projected desired-state
    graph that `workspace-state` does not offer) and change-only warning
    suppression (needs the region to read back its prior entries);
  - the accepted specifications `cli/uninstall/is-idempotent`,
    `cli/uninstall/removes-direct-route-and-recomputes-reachability`,
    `cli/projection-currency-follows-state-authority`,
    `cli/mutations-are-closure-atomic`, and `cli/lint/catalog-is-complete`.
- Exclusions: the pack-graph completeness gate and the broader "retire without
  intact source" requirement, which is AXM-1723's subject; the rules and hooks
  selectors, whose contributor sets are decided from desired state alone and
  which therefore exclude nothing; and the implementation packages, whose
  internal tests are witnesses.

## What this batch adds

| Requirement                                         | Role       | Statement in brief                                                                                                                                                                                                                             |
| --------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cli/unreadable-knowledge-is-left-out-and-reported` | experience | A bundle whose package cannot be read is omitted from the generated instructions file, the omission is reported with its reason and remedy wherever that file is written or inspected, and no other extension's operation fails because of it. |

The specification was authored as `status: "candidate"` with `supersedes: []`
and is accepted by this review (see Acceptance below). No accepted identity is
retired: neither accepted uninstall specification stated a sibling-independence
obligation, which is why the reopening review called for the fixture to land
with the specification that makes it normative.

## What this batch revises

- `cli/lint/catalog-is-complete`: the accepted rule inventory gains
  `workspace/projection-contributors-rendered` at severity `warning` in the
  workspace view. The statement is unchanged; this is a revision of
  specification evidence for an interface change to the published catalog. The
  rule is the durable reminder the decision requires — it reports the omission
  on state, not on change, until the bundle is fixed or removed.
- `packages/extension-workspace/src/projection/exclusions.ts` is added and
  owns the messaging rule's text. It is implementation, not authority; the
  specification asserts the operator-facing sentences directly.

## Evidence observed

The candidate was authored from the decided obligation, not from the
implementation, and was first executed against the implementation in the same
working tree. A clean run against the baseline alone was therefore not
observed; the expected baseline failures, established by the reopening review's
code-state audit of `packages/extension-lifecycle/src/knowledge/manager.ts`,
are that `Effect.forEach` over enabled bundles had no per-node error handling,
so a single sibling's `KnowledgeDefinitionInvalid` failed the whole selection,
failed the projection plan, failed `applyProjections()` inside the transaction,
and rolled the operation back — no message could have been reported because no
operation reached a result.

Runs during the batch, with `pnpm test:spec --requirement <id>` and the
package test targets:

1. First run: three of five examples failed for authoring reasons only — the
   canonical package path for a local source has no `knowledge` segment, the
   applied-plan outcome is `applied` rather than `success`, and the report
   names the bundle by its settings name rather than its fully qualified name.
   Each was corrected in the specification, not in the implementation; the
   third is the product's own wording and the decision's example uses the same
   shape.
2. Second run: the lint example failed because it drove the handler from the
   process working directory and because `EffectCliExit` is raised as a defect
   that `Effect.result` does not catch. The example now passes the workspace
   root, as the lint harness does, and catches the cause.
3. Third run: all five examples pass. `pnpm run verify:workspace` and
   `pnpm run test:e2e` are green on the pushed revision `885b47459`, and
   `specifications:generate` reports 81 specifications with the conformance
   check clean.

## Set review findings

- Orphans: none. The new specification references the registered goals
  `workspace-intent-fidelity` and `safe-repetition`, and no goal lost its last
  referencing specification.
- Duplicates and overlaps: the new obligation touches the same commands as
  `cli/uninstall/removes-direct-route-and-recomputes-reachability` and
  `cli/mutations-are-closure-atomic`. It states something neither does: which
  contributors a shared generated file must carry when one of them cannot be
  read, and that the resulting omission is reported. The overlap is a shared
  scenario shape, not one obligation stated twice.
- Contradictions: none. Atomicity is unweakened — the tolerated case is a
  rendering decision made before any write, and every render or write failure
  still fails the closure. `cli/projection-currency-follows-state-authority`
  is unaffected: an excluded bundle is not a current contributor.
- Gaps observed outside the batch, recorded for a following review:
  - No accepted specification states what a pack install carrying a Knowledge
    member must report about that member's shared file. This batch's fixture
    covers the shared contract that path uses, not the path end to end; the
    delivery note on AXM-1708 records the same limit.
  - The `sync` restore path repairs a missing package from its lock entry
    before discovery renders, so the missing bucket is reachable from `sync`
    only when restoration itself fails. Whether `sync` should state that
    distinction is unresolved.
- Unverifiable claims: none. The specification declares `example` only, and
  every example executes.
- Stale witnesses: none removed. The pre-existing valid-sibling rollback test
  in `knowledge/uninstall/command-actions.internal.test.ts` still asserts
  fail-closed behavior for a genuine region write failure and is unchanged.

## Acceptance

- Candidate: accepted by the maintainer on 2026-09-03.
  `cli/unreadable-knowledge-is-left-out-and-reported` now carries
  `status: "accepted"` and is the authority for its subject; no predecessor is
  retired because none is superseded.
- Evidence revision of `cli/lint/catalog-is-complete`: accepted by the
  maintainer on 2026-09-03 as an interface change to the published rule
  catalog.
- Residual risk carried forward from the reopening review and accepted: an
  unrelated install, enable, or uninstall now drops a broken bundle's discovery
  row rather than failing. The controls are the report at every render and
  observation site and `sync` convergence; the accepted obligation is what
  keeps the omission from becoming quiet.
- Out-of-batch gaps: the two findings above are tracked as follow-up work
  items outside this batch.
