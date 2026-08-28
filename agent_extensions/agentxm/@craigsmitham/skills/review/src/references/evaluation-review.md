# Evaluation review

Keep five judgments separate for every changed or materially applicable
Requirement-satisfaction or Architecture-realization Protocol.

1. **Coverage** — Is an applicable maintained Protocol `defined`, or is the
   in-scope authority `uncovered`?
2. **Protocol adequacy** — Are the role, target, criteria authority, bounded
   claim, method, Cases or sampling, oracle, thresholds, material conditions,
   and evidence lifecycle capable of supporting the intended judgment?
3. **Executable realization** — Do Suites, Cases, seams, data, environments,
   instrumentation, and harness behavior faithfully realize the Protocol?
4. **Evidence state** — Is evidence `absent`, `stale`, `current`, `skipped`, or
   `harness-error` for the exact candidate and conditions?
5. **Bounded outcome** — Does the Result support `pass`, `fail`, or `unknown`
   no more broadly than the Execution permits?

Inspect false-confidence risks: weak or circular oracles, omitted negative or
failure cases, unrepresentative sampling, mismatched environments, stale
candidate identities, hidden skips, correlated evidence, and Conclusions that
exceed the Protocol.

Keep the three Protocol roles distinct even when they use the same test tool:

- `requirement-satisfaction` evaluates accepted obligations;
- `architecture-realization` evaluates accepted Architecture meaning; and
- `implementation-conformance` evaluates repository-local units or invariants.

A local test pass is not semantic evidence merely because it is automated.
Route missing or changed semantic claims, targets, criteria, coverage, or
judgment to `spec`; route missing technical realization to `design`; route
execution or evidence gaps to the evaluation owner, `research`, or
`investigate`.
