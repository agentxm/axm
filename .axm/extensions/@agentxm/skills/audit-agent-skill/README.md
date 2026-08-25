# Audit Agent Skill

Audit an exact Agent Skill revision against an explicit skill-engineering
guidance baseline and intended use. The workflow covers design, routing,
activated execution, resources, portability, authority, provenance, licensing,
packaging, public suitability, change control, and lifecycle evidence.

A plain audit is read-only. An explicit “audit and remediate” request preserves
the initial findings, applies the sibling authoring workflow, and verifies the
new exact revision. That final pass is closure verification, not independent
approval. Untrusted packages remain static by default and their bundled code is
not executed merely for inspection.

For an AXM-managed target, the audit reads the AXM extension-management profile
and current CLI help, uses native lint and pack-state inspection as bounded
read-only evidence, and never treats clean structural validation as overall
conformity.

The audit distinguishes declared package relationships and supported host or
workflow cohorts from an incidental active catalog. Catalog neighbors inform
routing and coexistence checks but do not create dependencies, composition
requirements, or target defects; any collision is attributed to its smallest
responsible surface.

## Evaluation

`evals/evals.json` contains separate routing and activated-execution cases.
`evals/evaluation-contract.json` defines the required target, environment,
trial, grader, provenance, freshness, and result evidence. Case definitions do
not imply that a revision passed: release evidence must bind actual results to
the exact package identity, host, model, configuration, and active catalog.
Positive conformity and remediation cases use complete synthetic package trees;
the runner retains declared canonical-package changes so graders can inspect
artifacts rather than accept a narrated mutation.
Authoring-smoke results belong in an ignored or external run workspace, remain
same-agent evidence, and do not satisfy the contract's isolated release
threshold merely because they were retained or committed.

Use `evaluate-agent-skill` when new behavioral trials must be executed. This
audit inspects the resulting evidence and its claim limits; it does not own the
evaluation run.

## Install

```sh
axm install @agentxm/packs/agent-engineering
```

## Example

> Audit this Agent Skill against the current skill-engineering guidance,
> remediate supported findings, and verify the resulting revision. Do not
> publish or claim independent approval.

## Revision 0.7.4

- Previous version: `0.7.3`
- Contract delta: relationship authority is now explicit; declared package,
  host, and workflow relationships are separated from incidental active-catalog
  neighbors, findings must be assigned to the smallest owning surface, and a
  bounded input omission remains unverified unless the complete target proves
  the required surface absent
- Compatibility and cohort: audit inputs remain compatible; reports gain
  explicit relationship fields and an external-condition section, while three
  synthetic regression cases cover incidental, undeclared, and declared
  cross-package relationships
- Risk delta: prevents a co-installed generic skill from being converted into
  a target dependency, composition mandate, or target-owned defect
- Migration: update the `agent-engineering` pack to `0.10.5` and treat active
  catalog identity as coexistence evidence rather than relationship authority
- Rollback: restore skill and suite `0.7.3` together and accept the risk of
  cross-pack misattribution
- Evidence: same-agent `gpt-5.4` regression run
  `2026-08-22T22-36-03-148Z-42fbba20` passed 8/9 selected trials and exposed
  one case-21 target misattribution; after the evidence-ownership correction,
  focused run `2026-08-22T22-51-20-802Z-ce65edb6` passed case 21 three times.
  A later full-matrix run found no target failures but surfaced one conditional
  case-21 assertion as undecidable; that suite defect was corrected before the
  final validation. The next matrix exposed one remaining external-condition
  ownership error without a cross-pack dependency or critical-gate failure;
  condition ownership was tightened before closure. These are
  ignored-workspace, no-baseline, network-unobserved results rather than release
  evidence or independent approval

## Revision 0.7.3

- Previous version: `0.7.2`
- Contract delta: the static non-execution boundary is now an early invariant
  with explicit read-only data tools, forbidden direct and nested launch forms,
  failed/no-op attempts, and handoff-as-recommendation semantics
- Compatibility and cohort: ordinary audit inputs and report fields are
  unchanged; case 1 now supplies a present inert installer and requires an
  evaluator that supports structured `forbid-target-execution` assertions
- Risk delta: prevents an audit from satisfying a caller's execution request by
  launching target code as a supposedly separate observation, including a
  missing or inert installer
- Migration: update the `agent-engineering` pack to `0.10.3` and evaluator to
  `0.2.2`; keep target-behavior execution in a separately authorized evaluation
  workflow
- Rollback: restore skill and suite `0.7.2` together, accepting that attempted
  target execution may escape assertion-level detection
- Evidence: the first current-catalog regression correctly rejected an earlier
  candidate after structured evidence found forbidden launches. The revised
  package then passed case 1 three times in same-agent `gpt-5.4` regression run
  `2026-08-22-remediation-0.7.3-case1-regression-r4`; all three deterministic
  command assertions passed. This is selected-case, no-baseline,
  network-unobserved evidence, not release evidence or independent approval
- Bound identities: package
  `sha256:9feffb2b51ab848aa835d0acf2ab043fd38b1cd1d42999f35f43c172b8b12aa2`
  and suite `sha256:1846a27a2d2db79747bf34d4dd12269274e57bf2679cd3436f22404bdfb742d6`

## Revision 0.7.2

- Previous version: `0.7.1`
- Contract delta: static audits now prohibit executing or reproducing target
  behavior even through sandboxed, synthetic, or in-memory imitation; the
  trusted-helper exception is limited to audit-owned read-only mechanisms
- Compatibility and cohort: ordinary static audit inputs are unchanged; case 1
  adds an explicit `Reject` or `Revise` disposition assertion and suite `0.7.2`
  requires evaluator `0.2.0` or a compatible v3 runner
- Risk delta: closes a behavioral path that reproduced hostile shell behavior
  while auditing an installer designed to test the no-execution boundary
- Migration: update the pack to `0.10.3`; route any desired target-behavior
  trial through `evaluate-agent-skill` rather than the audit workflow
- Rollback: restore skill `0.7.1` and suite `0.7.1` together, accepting the
  documented static-boundary regression
- Evidence: two consecutive `0.7.1` critical failures motivated the change;
  their routine run was not retained after its transcript captured a personal
  absolute path. Case 1 then passed three times on `0.7.2` in same-agent
  `gpt-5.4` regression run `2026-08-22-static-boundary-0.7.2`; the retained run
  is selected-case, no-baseline, network-unobserved evidence and is not release
  or independent approval
- Bound identities: package
  `sha256:e7b08c2fec01f71bcdf5da932b0dc64012b2c22e5470b204f6848a0062ab8589`
  and suite `sha256:0db9505a15310c6ae4deb2ca18db35376930ef6fb24745d922310cfa81e3252f`

## Revision 0.7.1

- Previous version: `0.7.0`
- Contract delta: evaluation contract `3.0.0` maps all five critical gates to
  exact suite assertions and requires immutable runner and adapter evidence
- Compatibility and cohort: runtime audit behavior is unchanged; suite `0.7.1`
  requires evaluator `0.2.0` or another runner with the same v3 evidence model
- Risk delta: a missing gate mapping or evaluator-mechanism identity now fails
  source validation instead of leaving a declared safety gate unenforced
- Migration: use the `agent-engineering` pack at `0.10.1` or bind a compatible
  external evaluator before producing new regression evidence
- Rollback: restore skill and suite `0.7.0` together with contract `2.0.0`; do
  not relabel v3 evidence as v2 evidence
- Evidence: workspace validator acceptance plus evaluator conformance tests for
  v3 mapping and assertion-level failure semantics; no release-tier behavioral
  run or independent approval is claimed
- Bound identities: package
  `sha256:e495c0d125c9a27e983921bfe6c0405eb6063c38ba39ed46ec5cb402f6334cac`
  and suite `sha256:e1f18687863803bf50683c0eec4984bb63fb8d913fe1bf9b298a1c571dcf44ec`
