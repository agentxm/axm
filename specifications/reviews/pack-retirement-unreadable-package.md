# Batch review: pack retirement when the package cannot be read

Set review for the batch that decides and specifies what uninstall does with a
desired pack whose own package manifest is missing or undecodable. This record
is evidence for the decision; the specification itself is the authority, and
merging this change is the acceptance.

## Boundary

- Scope: one new specification, one new support module
  (`support/pack-retirement-fixture.ts`), one specification-harness export
  (`handleUninstallPack`), and the conforming implementation across the
  pack-uninstall readiness gate, the pack-uninstall plan, and the shared
  uninstall operation.
- Baseline revision: `5266c4b4b`.
- Source set:
  - the desired-state graph's pack pass, which emits
    `pack-manifest-unavailable` when a configured pack's manifest cannot be
    read and `pack-manifest-invalid` when it cannot be decoded, and skips the
    member loop in both cases, so a pack's members are unknown either way;
  - the lock pass, which for a registry pack emits
    `pack-manifest-content-mismatch` (`missing` or `changed`) or
    `pack-resolution-unavailable` alongside the primary problem, as a
    consequence of the same unreadable manifest;
  - the pack-uninstall readiness gate at the baseline, which returned the
    graph planner's verdict unchanged and so blocked on any incompleteness,
    including incompleteness caused by the removal target itself;
  - the recorded operator sequence that recovery required at the baseline:
    restoring a manifest purely to satisfy the gate, then deleting the
    scaffolding it restored;
  - the accepted specifications `cli/uninstall/is-idempotent` (a target the
    workspace does not desire) and
    `cli/uninstall/removes-direct-route-and-recomputes-reachability` (a desired
    target with intact state), neither of which governs a target the workspace
    still desires whose source is absent.
- Exclusions: general filesystem drift (a readable manifest that disagrees with
  its accepted resolution is drift, not absence, and stays blocked); the
  uninstall semantics of an extension still required by an installed pack,
  which is a separate decision; and backward compatibility, which the
  repository's pre-launch policy places out of scope.

## What this batch adds

| Requirement                                                        | Role       | Statement in brief                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cli/uninstall/retires-a-desired-pack-whose-package-is-unreadable` | experience | Uninstall of a desired pack whose manifest is missing or undecodable removes that pack's configuration and accepted resolution, deletes no content it could not verify, reports the removal as registration-only naming the unreadable manifest, and decides identically in preview and apply; incompleteness on any other desired pack still blocks and changes nothing. |

The specification is written as final with `supersedes: []`, so no existing
identity is retired.

## The decision this batch records

The graph gate exists to stop a pack transition computed from state AXM cannot
read. A selected pack whose own manifest is confirmed missing or undecodable at
a known path is positive evidence about the removal target, not the absent
evidence the gate guards against. The gate therefore partitions the graph's
problems rather than returning its verdict:

- Uninstall proceeds when every problem belongs to a selected pack and each
  such pack has at least one unreadable-source problem, with only the lock
  problems that unreadable manifest causes alongside it.
- A problem on any other pack, or any problem that belongs to no pack, keeps
  the existing `packs/uninstall/desired-state-graph-complete` blocker. Its
  detail now names the remedy for each foreign pack.
- `pack-manifest-invalid` receives the same treatment as
  `pack-manifest-unavailable`: the graph builder skips the member loop in both
  cases, so registration-only removal is the only computable outcome either
  way.
- Content whose manifest cannot be read is never deleted, and the result says
  so: the plan unit carries a warning naming the pack, the reason, the
  unreadable manifest path, what was left in place, and the operator's remedy,
  and the pack's canonical path is reported `unchanged` rather than `removed`.

Rejected: retaining fail-closed, which would make the restore-then-retire
sequence the accepted contract with no safety gained, because the restored
manifest carries no information the gate needs; and retiring from registration
alone, which would also proceed when a pack other than the target is broken —
exactly the condition the gate exists to catch.

## Evidence observed

Authored from the intended obligation, then executed against the baseline gate
and against the conforming implementation, with
`pnpm test:spec --requirement cli/uninstall/retires-a-desired-pack-whose-package-is-unreadable`:

1. Against the baseline gate (the partition disabled, everything else in
   place): 9 failed, 3 passed of 12. The nine failures are exactly the decided
   behavior — registration removal and content preservation for a workspace
   pack with a deleted manifest, a registry pack with a deleted manifest, and a
   registry pack with an undecodable manifest; the registration-only reporting
   of each; preview/apply agreement; the root-uninstall route; and the repeated
   retirement as a no-op. The three passes are the fail-closed cases the
   decision preserves: an intact target beside a broken sibling, an unreadable
   target beside a broken sibling, and a target whose readable manifest
   declares another identity.
2. Against the implementation: 12 passed. The discrimination establishes that
   the specification states an obligation the baseline did not meet, rather
   than describing what the code already did.

Supporting evidence, all passing:

- `cli:test src/root/packs/uninstall` — 44 tests. The two handler examples and
  the one readiness example that encoded the baseline's fail-closed treatment
  of the target's own missing manifest are inverted into applied
  registration-only assertions; foreign-pack, companion-problem,
  identity-mismatch, content-mismatch-on-readable-manifest, and
  manifest-restored-before-apply cases are added.
- `extension-workspace:test src/extensions/operations.internal.test.ts` — 36
  tests, including the new settlement variant: the retirement path removes the
  settings entry and the lock entry, never calls `materializeUninstall`, and
  reports the preserved package with its reason.
- `cli-e2e:e2e-main src/root-uninstall.e2e.test.ts` — the new process-boundary
  case retires a registry pack whose manifest was deleted through both
  `axm uninstall <fqn>` and `axm packs uninstall`, and compares the two machine
  documents for equality. The first run of that comparison failed because the
  warning named an absolute manifest path; results name workspace-relative
  paths, and the implementation was corrected before the case passed.

## Set review findings

- Orphans: none. The new specification references the registered goals
  `workspace-intent-fidelity` and `actionable-diagnostics`, and no goal lost
  its last referencing specification.
- Duplicates and overlaps: the member outcome of a retirement is governed by
  `cli/uninstall/removes-direct-route-and-recomputes-reachability`, not
  restated here; members are recomputed from the remaining desired state
  because the absent manifest is never read for them. The repeated-retirement
  no-op is governed by `cli/uninstall/is-idempotent`; this specification
  exercises it as a postcondition rather than claiming it.
- Contradictions: none. The blocker identity `packs/uninstall/desired-state-graph-complete`
  is unchanged, so the recovery-conformance inventory and the
  readiness-agrees-with-apply contract continue to hold.
- Unverifiable claims: none. The specification declares only executable
  methods (`example`, `decision-table`).
- Assumption recorded on the specification: a pack's member list is not
  persisted outside its package manifest. Neither `axm.json` nor
  `axm-lock.yaml` carries one, so an unreadable manifest leaves members
  computable only from the remaining desired state. Were a member list later
  persisted, the retirement outcome would need reassessment.
- Stale witnesses: none left behind. The three baseline examples that asserted
  fail-closed treatment of the target's own missing manifest are revised in
  this change, not deleted, and their fail-closed intent is preserved by the
  foreign-pack and identity-mismatch cases that replace them.
- Machine contract: unchanged in shape. The plan unit already carries
  `warnings`, and `outcome`, `counts`, and `riskConditions` are untouched; the
  change is content.

## Decision

- The obligation above is decided and written as final; merging this change is
  its acceptance. No predecessor is retired, because none is superseded.
- The decision record
  `docs/architecture/decisions/pack-retirement-when-the-package-cannot-be-read.md`
  stands as explanation of the choice; it owns no obligation.
- Residual risk accepted: uninstall now mutates workspace state on input it
  could not fully read. The controls are the partition itself — a problem on
  any pack the command did not select still blocks — and the deletion scope,
  which preserves every byte whose manifest could not be verified and reports
  what it preserved.
