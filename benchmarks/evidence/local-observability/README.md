# Local observability coverage and evidence

This ledger tracks whether local CLI traces can support trustworthy performance
baselines before further optimization. It separates source bindings, executed
checks, independent measurements, and final integration evidence. **Coverage is
not complete.** Pending rows remain in scope; a test count, source scan, root
span, or Seq `complete` value does not close them.

The [accepted specification catalog](../../../specifications/catalog.md) and
[specification contract](../../../contributing/guides/executable-specifications.md)
own requirements and acceptance. This evidence record does not create or waive
requirements. New specification changes become accepted through integration.
The [tracing guide](../../../contributing/guides/local-tracing.md) owns contributor
and agent procedure; the [accepted architecture](../../../docs/architecture/index.md)
owns package boundaries. Maintainers should update this ledger when a route,
work owner, schema, execution binding, or evidence artifact changes.

## Scope and status

The implementation replaces per-occurrence summary spans with direct owner
aggregates exported as correlated logs. It adds receipt/inspection schema 2,
aggregate event count and payload integrity, partial-measurement coverage, and
category/phase-selected detail. **Final completion remains pending.** The current
checkpoint separates completed evidence, applicable historical reuse, and finite
remaining work. Historical evidence retains its actual source/binary provenance;
earlier failed runs remain failed. Isolated repeated elapsed/RSS qualification
is explicitly deferred, not passed.

### Current verification checkpoint

The latest captured clean product candidate is
`4d8344c40f581cce18626e77299abf090dba96ee`, Linux binary SHA-256
`2cd081d5e32eb72900992edbc26eb18c71934cc279c997771a5f84b8c054c3e9`,
retained at `/tmp/axm-observability-knowledge-final-5jaosdfd/axm-linux-x64`.
Its terminal 113-case continuation completed 112 cases and failed one comparison;
final integration remains pending. The earlier successful fifty-package capture
used `2cf3580d33c4a676697a80d222677f8ad59e3579`, binary SHA-256
`2b4de10acb5dfe1ab9a6422d583af7809ed76a24db59a574ceedf8e007b294da`.

The preceding captured product candidate was
`99856a289d1f416d4f59a7e6b26d18d76250b4f5`, Linux binary SHA-256
`6b5a1898ad4dff8cb0f25cc26bbada9f9c7ec9387cab3f974807b81a535d877d`,
retained at `/tmp/axm-observability-final-host-vw6nykx9/axm-linux-x64`.
[Full CI](https://github.com/agentxm/axm/actions/runs/43364797814) passed at
that revision, including source partitions, main E2E shards, binary/install
distribution, and actual native-host checks. Linux x64's mounted ext4 casefold
case passed with cache disabled; ARM64 casefold and both macOS canonical-path,
case-sensitive APFS, and physical-boundary steps passed. Evidence:
`/tmp/axm-linux-x64-ci-43364797814-job131687353495.log` and
`/tmp/axm-native-platform-ci-43364797814-steps.json`. Windows results and
its two platform-inapplicable skips are recorded below.

The subsequent published `pnpm run test:affected --exclude=axm` production
graph passed 18 project targets and 17 prerequisites, reusing 24 of 35
input-valid results, in 15 minutes 40 seconds. It began at `189c689e1`
against main base `187ebf03a`; production inputs stayed frozen during the
excluded harness edits. Kernel tests passed 2,914 cases with four platform
skips, workspace-feature tests passed 3,558 with one skip, and CLI tests passed
4,217. The kernel run includes the distinct-existing-case check that is
inapplicable on the folding Windows volume. Evidence:
`/tmp/observability-final-production-tests.log` and
`/tmp/axm-observability-final-host-vw6nykx9/production-verification`.
These input-scoped results do not constitute the final main integration gate.

Preflight currently has **244 of 249 scenarios with applicable completed
evidence**, accounting for 976 selected workload invocations and 488 exact
receiver inspections. These combine 132 applicable prior cases with 112 cases
completed on `4d8344c40`. Each retains its actual binary and harness provenance;
source-impact reuse does not relabel earlier captures as current-binary runs.
The conservative installed Knowledge lint replay and the seven prepared-Hook
cases plus five previews all passed in this continuation.

Four captured cases remain reserved: `typed/subagents/install`,
`typed/knowledge/install`, `typed/packs/install`, and `typed/knowledge/new`.
Their operation counts, semantic results, measurement coverage and inspected
delivery match, but exact byte totals differ. Raw receipts demonstrate native
inode serialization-width differences; the independent real receipt-byte oracle
passes. Attribution of every mixed-owner byte difference remains unproven.
Their failed strict comparisons stay failed pending an explicit acceptance
decision; they are not rerun to obtain equal inode widths by chance.

The fifth remaining case, `installed/adopt-enabled-native-refusal`, failed stdout
and postcondition comparison in the latest continuation. Both subjects reached
the same refusal and retained identical recovery snapshots. Generated diagnostic
UUIDs and filenames differ; original diagnostic contents were not captured, so
those artifacts cannot justify a projection. A bounded raw-record verifier and
fresh affected replay are required. The terminal run remains failed at
`/tmp/axm-observability-knowledge-final-5jaosdfd/remaining-113/report.json`
(`/tmp/observability-final-113-preflight.log`); its 112 completed cases remain
usable. No repeated timing ran.

At `4d8344c40`, redundant Knowledge adapter/selection helper spans were removed
at construction. Actual handler/tracer checks preserve meaningful operation and
feature spans. Shared Hook preparation now carries only exact independently
verified identities into operation comparison. Eight receipt controls, the
real byte-accounting oracle, Knowledge handler checks, and affected type/lint
checks pass. Logs: `/tmp/observability-prepared-receipt-tests.log`,
`/tmp/observability-knowledge-and-byte-owner.log`,
`/tmp/observability-knowledge-handler2.log`, and
`/tmp/observability-knowledge-typecheck2.log`. Earlier failed checks remain
recorded; the last correction was a test-only union-inference fix.

The shared receipt-capture correction at `a1496bf0a` passed six focused
controls and repository type/lint checks
(`/tmp/observability-receipt-capture-tests.log`,
`/tmp/observability-receipt-capture-checks.log`).
The focused handoff capture then failed strict comparison, retaining exactly
158 scalar differences: 98 creation times and 60 inodes, with no other field
differences. Each subject's 13 new live identities independently matched its
filesystem paths/aliases; both before states were absent, and the exact temporary
history was classified separately. The bounded comparison refinement for those
independently validated new/refreshed live identities passed six focused tests,
including forged live identity/parent/alias rejection and preservation of real
mode/path/owner differences (`/tmp/observability-live-receipt-tests.log`).
The assembled handoff replay passed in
`/tmp/axm-observability-final-host-vw6nykx9/handoff-and-scaling/report.json`.
The failed capture remains diagnostic evidence:
`/tmp/observability-handoff-receipts.log`.

That same handoff-and-scaling run subsequently failed the fifty-package cold
restoration's strict work comparison: one additional acquisition `stat` remained
unattributed. The run remains **failed**. A new cache-prune semantic span records
each existing automatic or explicit maintenance interval, its direct aggregate
ownership, scanned inventory, removed entries and freed bytes. It changes no
pruning algorithm, concurrency policy, per-entry span production, caps or
timeouts. The fresh capture below establishes per-scan attribution; the earlier
run lacks those owning spans and remains failed rather than being relabelled.

This introduces an explicit methodology change: only fully measured successful
`stat` rows directly owned by an automatic non-evicting scan may vary across
runs, and their exact count must equal that scan's recorded inventory. The rows
remain in `trace.automaticCacheMaintenance` and the scan remains in inspection
`cacheMaintenance`; timing records `null` and does not claim inspection.
Generic acquisition I/O, explicit scans, deletions, failures, partial measurements
and all other work remain strict. Per-invocation accounting, delivery and all
numeric limits are unchanged. The [tracing guide](../../../contributing/guides/local-tracing.md)
owns the exact comparison rule. Seventeen cache-owner checks, eleven serialized
tracing checks and twenty-eight benchmark-method checks pass, followed by
type/lint checks for the three affected projects. Logs are
`/tmp/observability-cache-prune-owner3.log`,
`/tmp/observability-cache-prune-bridge.log`,
`/tmp/observability-cache-prune-method.log` and
`/tmp/observability-cache-prune-checks.log`. The partial-eviction fixture initially
included setup removals; its injection now starts at the actual prune boundary,
and the failed attempt remains in `owner2.log`. These controls do not certify the
earlier failed run.

The fresh fifty-package cold-restoration capture passed all three candidate
modes and both exact receiver inspections at clean `2cf3580d3`. Each traced
invocation recorded twelve automatic scans. Their inventory counts reconciled
exactly with 314 summary and 315 detail scan-owned `stat` occurrences; all other
compared work remained equal. Summary retained 1,838 spans and detail 3,377,
with 354 aggregate groups each. Observed diagnostic-shutdown upper bounds were
95.621 ms and 89.027 ms; actual retrieval sizes were 1,379,946 and 2,247,598 bytes.
These pass the unchanged volume and shutdown limits and establish this scaling
case's behavior/accounting evidence, not isolated repeated elapsed/RSS overhead.
Raw report: `/tmp/axm-observability-prune-final-xu_g0ysh/scaling-50/report.json`.

The prune-only source-impact audit retains the 52 previously completed scenarios. Complete
summary/detail accounting shows zero cache writes in 49 cases and exactly one
in each of `registry/1/install/cold/baseline`,
`registry/1/sync-restore/cold/baseline`, and `installed/skills-update`.
Independent archive request observations agree in all three candidate modes.
The invocation-owned counter begins at zero and automatic pruning first runs
after four writes; fixture preparation uses separate processes. None of these
cases explicitly invokes `cache prune`; `group/cache` only runs the command
group. Source bindings, all 104 inspected receipts and original binary identities
are indexed in `/tmp/axm-cache-prune-evidence-applicability.json`. No completed
case requires replay for this isolated change; this is source-impact reuse,
not current-binary execution, timing evidence or an Nx cache-validity claim.

The next `remaining-196` run passed `authoring/skills-new` in all three modes
with both inspections, then failed `typed/skills/import` in disabled-mode stdout
comparison. The only differing output field was `result.candidateId`; import
had not passed at that checkpoint. The failed report and raw outputs remain at
`/tmp/axm-observability-prune-final-xu_g0ysh/remaining-196`.

Source analysis established that native skill/subagent import includes its
random external `axm-import-*/package` staging path in the candidate hash; the
baseline uses the same algorithm. Accepted contracts require stable identity
for the same prepared candidate, not identical IDs for separately staged imports.
The fixture now validates the expected plan, unit, mode, outcome and SHA-256
shape before projecting only this field for native skill/subagent import,
including preview. Raw IDs and all other output, input, state and work evidence
remain strict. This is an explicit bounded comparison-method change; product
identity generation is unchanged. Its controls and subsequent assembled apply/preview import captures pass;
the original failed run remains failed.

The runner now accumulates comparison failures across independent scenarios,
retains their failed verdicts, and fails before entering timing. Other execution
or trace errors still stop the run. This scheduling change avoids repeating
unaffected completed cases; it does not turn a failed comparison into a pass.
The revised fixture, preview coverage and scheduling checkpoint passed 32
benchmark-method tests and repository type/lint checks. Logs:
`/tmp/observability-staged-import-method2.log` and
`/tmp/observability-staged-import-checks.log`. Four parameterized controls
initially failed because the Effect Vitest callback receives the parameter
tuple as one value; only callback destructuring changed, and the failed log is
retained. Later completed captures establish assembled import behavior with
their original binary/harness provenance.

The remaining delivery work is that finite preflight selection, applicable final
evidence reconciliation, and the clean main-only integration gate. Existing
owner, real-Seq and supported-host evidence is reused only with its source/input
applicability recorded. No isolated timing campaign has run.

### Historical direct-accounting development checkpoints

These are provisional executions on a dirty source tree, not a frozen candidate,
performance result or integration verdict. Existing independent work oracles were
retained. Each log records its command and task/cache execution.

| Check                                      | Result and evidence boundary                                                                                                                                                                                                                                                                    | Local raw log                                                                                                                        |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Shared recorder                            | Eight checks passed, including disabled clocks/spans, concurrent ownership and balanced native completion.                                                                                                                                                                                      | `/tmp/observability-direct-helper-balanced-tests.log`                                                                                |
| Kernel owners and real phase placement     | The 27-file selection reached 291 passes and one subprocess-fixture failure. After correcting the fixture's missing binding, its complete Git file passed 34 checks; the other successful files were unchanged. The separate memo concurrency run passed three independent lookup-count checks. | `/tmp/observability-direct-kernel-tests.log`, `/tmp/observability-direct-git-tests.log`, `/tmp/observability-direct-memo-tests2.log` |
| Supporting owners and sync                 | Registry/cache/authentication/maintenance selection passed 33 checks; sync inventory selection passed three.                                                                                                                                                                                    | `/tmp/observability-direct-supporting-tests.log`, `/tmp/observability-direct-sync-tests.log`                                         |
| Runtime and inspection                     | 95 checks passed across 11 files, including real loopback OTLP span/log delivery, partial measurements, selection, unfinished native work, privacy and collector failure isolation. This is not actual Seq proof for the final candidate.                                                       | `/tmp/observability-direct-cli-tests.log`                                                                                            |
| Published inspector and benchmark protocol | Five inspector workflow checks and 18 protocol/capture checks passed. No workload campaign ran.                                                                                                                                                                                                 | `/tmp/observability-direct-tooling-tests.log`                                                                                        |
| Package and consumer checks                | Type/lint checkpoints passed for six production packages and for CLI, E2E and repository tooling.                                                                                                                                                                                               | `/tmp/observability-direct-package-checkpoint2.log`, `/tmp/observability-direct-consumer-checkpoint.log`                             |
| Architecture                               | 42 checks passed; the graph of 1,094 source modules had no file or slice cycles. The narrow observation entry preserves application/domain/adapter restrictions.                                                                                                                                | `/tmp/observability-direct-architecture-checks.log`                                                                                  |
| Aggregate wire identity                    | Eight focused receipt checks passed after fixing serialization of an already-admitted command route. Raw decoded aggregate attributes reproduce the receipt digest; unregistered routes remain excluded.                                                                                        | `/tmp/observability-direct-route-wire-tests.log`                                                                                     |
| Actual Seq workflow                        | Four selected identity/body/polling/batch-loss cases passed. Forced termination and rejecting/stalled collector cases passed in the prior focused runs. This is six covered cases across runs, not one successful unfiltered suite.                                                             | `/tmp/observability-direct-real-seq.log`, `/tmp/observability-direct-real-seq2.log`, `/tmp/observability-direct-real-seq3.log`       |

The earlier Seq runs remain failed where applicable. The route-serialization
diagnosis retained all 31 spans and 57 aggregates for trace
`12974902fcdaf739696529b707a42461`; restoring only its admitted command route
reproduced the producer digest exactly. Evidence is under
`/tmp/axm-aggregate-identity-diagnosis-lbaw6czb`. Successful replay artifacts are
`worktree-isolation-Vsm3WU`, `identity-sZPQuO`, `body-hold-sRc7hO`, and
`dropped-batch-WN00ke` under `test-results/cli-e2e-tracing/evidence/`.

The focused fixture preflight preserved binary SHA-256
`15c37f38fe44808b02fecddc94d5cbeef15ae25e4a7e3e607c9427c6dba8a1c9` and its
dirty-source artifact in `/tmp/axm-observability-direct-smoke-el5gld07`.
Ten-extension list passed disabled/summary/detail comparison and two exact
inspections (8 summary spans, 670 selected-detail spans, 67 aggregates each).
The run then failed restoration's stderr comparison: both 61-event streams
had identical per-unit facts and valid sequences but different independent
acquisition interleaving. The comparator was corrected against the
accepted progress contract; the failed run is not relabelled as passed.
No repeated timing ran. Raw log: `/tmp/observability-direct-fixture-smoke.log`.

After correcting progress comparison, ten-extension restoration passed disabled
and summary preflight, including exact inspection of 800 spans and 318 aggregate
groups. Unscoped I/O detail then hit its unchanged cap: 16,385 retained spans
including the root and 29,521 drops. The complete summary independently counted
45,105 physical I/O observations: apply 36,856; validation 2,348; planning 415;
acquisition 256; and 5,230 without an operation phase. The failed run is retained
at `fixtures2` in the same artifact root and
`/tmp/observability-direct-fixture-smoke2.log`.

The architecture audit identified three remaining archive parse/member primitive
producers, now migrated through a portable archive fact observer to the existing
recorder; it did not reclassify genuine
publication or network intervals merely to reduce volume. The benchmark now
declares acquisition-phase I/O detail for all Registry restoration sizes and
cache states, with unchanged whole-invocation aggregates and caps. This explicit
method adjustment requires a new scoped capture; it does not certify the failed
unscoped capture or establish fifty-extension capacity by extrapolation.

A separate focused run verified lint fix in disabled/summary/detail modes, then
stopped on preview installation's three unadmitted helper spans. This preserves
the producer-vocabulary failure instead of treating dropped observations as
complete. Evidence is `fixtures3` and `/tmp/observability-direct-fixture-smoke3.log`.

A fresh authenticated collector replay also remains failed. Source summary
passed exact inspection, while the concurrent compiled trace was absent from
retrieval. Its 272.195 ms export finalization is consistent with reaching the
unchanged 250 ms export bound, but the failed run did not retain relay delivery
statuses, so the cause is not fully established. Evidence is
`identity-WNdBCR` and `/tmp/observability-direct-real-seq-authenticated.log`;
the stopped collector's data is retained in
`/tmp/axm-seq-auth-replay-wrCSfd7f/data`. Bootstrap secrets were removed.
The first readiness-only retry also failed with `trace-not-found` against a fresh
authenticated collector (`/tmp/axm-seq-auth-ready-V107ZQrI/readiness.log`). No E2E
capture ran after that failed prerequisite. Both failed attempts remain failures.
The subsequent API-key query-access check, readiness capture, and focused
source/compiled summary/detail E2E passed, with no deadline change. Evidence is
`/tmp/axm-seq-auth-primed-UDJLY3z8`,
`/tmp/observability-direct-real-seq-authenticated3.log`, and `identity-7X3Ej3`.
The temporary collector was stopped/removed and bootstrap secrets scrubbed;
its data remains retained. This supports a cold-request initialization
explanation, without proving which exporter request exceeded its deadline.
The published readiness workflow now checks query access before its capture.
Failed E2E runs retain bounded relay delivery metadata, and the inspector
distinguishes exact absent-trace responses without disclosing client stderr.

The subsequent focused archive checkpoint passed 97 leaf checks, 225 install and
publication checks, 34 Registry provider checks, 14 runtime bridge/receipt checks,
and 27 benchmark/inspector checks. The architecture graph passed with 1,095
modules and no file or slice cycles. The bridge checks exercise a real ZIP parse
through the portable observer and verify its exact aggregate, phase owner and
absence of primitive spans in summary and parse detail. A first bridge attempt
failed on an invalid empty ZIP fixture; only the corrected replay passed.
Logs are `/tmp/observability-direct-archive-leaf-tests.log`,
`/tmp/observability-direct-preview-owner-tests.log`,
`/tmp/observability-direct-registry-dispatch-tests.log`,
`/tmp/observability-direct-archive-bridge-tests2.log`,
`/tmp/observability-direct-method-tests2.log`, and
`/tmp/observability-direct-architecture-checks2.log`. Type/lint passed across
seven affected projects and their prerequisites in
`/tmp/observability-direct-archive-leaf-owner-checks2.log`.
The assembled scoped restoration and preview captures remain pending.

The next clean checkpoint is `d2a0b59214949382b64b73868a43344774f75c13`,
binary SHA-256 `84b1e4388fe0fb5024c74d288b4af0b512ba6f81bb87a96bc252a62c4714f062`,
retained under `/tmp/axm-observability-checkpoint-blt_tq5w`. Its one-extension
restoration passed output/state and both exact inspections, then failed strict
summary/detail comparison: two successful canonical-path reuse labels changed
from completed hits to coalesced pending results. All physical/native work,
other counters, ownership and measurement coverage matched. The comparison now
projects only fully measured successful delivered reuse for five finite memo
owners; raw facts remain unchanged. The failed run remains at
`fixtures-scoped-retry`, log `/tmp/observability-direct-frozen-fixtures.log`.

A separate fifty-extension run passed baseline/disabled behavior, then rejected
summary receipt `118495e37ec93d597de419d2547f5aaa` before receiver retrieval:
2,049 retained spans including the root, 1,601 drops, and 318 aggregate groups.
This is an actual volume failure; detail and the selected preview/startup cases
were not reached. Evidence is `fixtures-volume-preview` and
`/tmp/observability-direct-frozen-volume-preview.log`. Repeated permit/ledger
admissions and native lock attempts/cleanup now record direct facts, preserving
their synchronization and cancellation boundaries. Admission
duration includes uncontended acquisition, so it is not labelled blocked time.
Proven contention and consequential network/publication spans remain. Caps are
unchanged; affected owner and assembled checks must establish the correction.
No repeated timing has run. This VM was selected for the final campaign, but
unrelated active work still prevents establishing isolated timing conditions.

The maintainer explicitly authorized deferring only the isolated repeated elapsed
and RSS campaign to a separate follow-up. The numeric limits and per-operation
coverage remain required there. This change permits integration after all other
criteria pass; it is not an overhead or memory acceptance claim. Exhaustive
behavior/trace preflight, exact accounting, inspected volume limits, bounded
shutdown, and required source/E2E/platform assurance remain in this delivery.

At clean checkpoint `b95373deb7742c3da164c9a4c3b6057e6757306f`, full affected
verification passed 89 tasks across 20 projects plus prerequisites. The clean
source integration workflow passed, reusing 83 input-valid results out of 89 in
its affected phase. Logs: `/tmp/observability-cache-facts-affected.log` and
`/tmp/observability-coordination-source-gate4.log`. This is the source stage,
not the full main-push gate.

The next assembled preflight passed one-extension cold/warm restoration. Both
ten-extension captures passed exact receiver inspection: summary retained 386
spans/316 groups and acquisition I/O detail retained 642 spans/318 groups. Their
strict work comparison failed because detail performed two additional real
heartbeat `stat`/`utimes` pairs. Every other work group, input, output and resulting
state matched. Successful, fully measured periodic maintenance is now reported
separately from deterministic cross-run equality; raw counts remain exact and
failed/partial observations remain strict. The original run stays failed at
`/tmp/axm-observability-candidate-b95373d-2tmuri0a/fixtures-coordination`.

The fresh authenticated pinned-Seq workflow passed at the same clean product
checkpoint: published `pnpm run seq:verify`, then the authenticated source/compiled
summary/detail identity case. Five unrelated cases were deliberately unselected.
Artifacts: `/tmp/axm-seq-auth-final-readiness-oNT2m9o8` and
`test-results/cli-e2e-tracing/evidence/identity-kU7byI`. This closes the specific
query-readiness/authenticated capture replay, not the full operation matrix.

At clean checkpoint `08befbe1662033dc2faab44bc2ace3c900a23578`, the entire real-Seq
suite passed all six cases. The rejection/stall cleanup upper bounds were
290.053388 ms and 289.222285 ms, below the unchanged 500 ms bound. These are
observed conservative cleanup bounds on the contended VM, not isolated repeated
elapsed/RSS qualification. Logs: `/tmp/observability-final-seq-suite.log`;
evaluation: `/tmp/axm-observability-final-mdkja07w/shutdown-evaluation.json`.

The full preflight at that checkpoint passed 20 scenarios in all candidate modes
with 40 exact receiver inspections, then failed the fork state comparison. Its
original artifacts remain failed at
`/tmp/axm-observability-final-mdkja07w/full-preflight`. A focused replay retaining
raw native receipts established exactly five allocation-specific differences in
the new historical `.axm/tmp` record; all other state matched. The independently
validated live ancestors and the removed historical entry remain distinguished.
The narrow comparison rule is documented in the tracing guide. Earlier failed
captures are not relabelled, and applicable scenarios still require replay.

Required Windows verification exposed a pre-existing publication failure. The
native owner regression confirmed creation-time tunneling on rename: inode was
unchanged, while the file inherited the deleted destination's creation time.
Publication now obtains that timestamp from a retained staged handle on Windows,
preserving all other staged identity/content checks. Linux filesystem calls are
unchanged, with a shared lexical publication scope; the applicability audit
below limits reuse of earlier assembled evidence. Fourteen atomic-write and three real
interference owner cases passed locally. Windows fixture paths were canonicalized
and same-bytes foreign replacement uses move-aside followed by rename, retaining
strict rejection and recovery checks. Windows qualification passed at
`99856a289d1f416d4f59a7e6b26d18d76250b4f5`: 98 owner checks, 11 CLI E2E checks,
and published-package launcher isolation. Two owner cases are inapplicable on
that folding Windows volume (Linux casefold lookup and distinct existing case
entries); they are not Windows passes. The actual job is
[Windows workspace lifecycle](https://github.com/agentxm/axm/actions/runs/43364797814/job/131687353524).
Earlier failed and superseded CI runs remain failed/cancelled.

The source-impact audit retains only 13 unaffected query/group scenarios from
the original Linux preflight, with their original `08befbe16` binary/receipts.
The audit selected seven earlier publication scenarios for replay because the
common lexical scope changed. Together with 229 previously unreached cases,
that original replay selection scheduled 944 workload invocations and 472 exact
inspections. That checkpoint reached 38 completed cases plus the successful
handoff replay, leaving 197 cases before the two later passes recorded above.
The 13 reused cases contribute 52 invocations
and 26 inspections. This is behavioral
impact analysis, not current-binary execution or an Nx cache-validity claim.
Selection and source bindings are retained in
`/tmp/axm-observability-final-mdkja07w/final-preflight-selection.json`.

Four focused native-fixture controls now pass for the fork comparison, including
raw retention, invalid identity/history rejection, strict unrelated fields and
timing exclusion. Their initial synthetic process window was too narrow for
filesystem timestamp quantization; only the unit fixture window changed, and
production capture bounds remain unchanged. Logs:
`/tmp/observability-fork-projection-tests2.log` and
`/tmp/observability-fork-projection-checks2.log`. Actual fork replay subsequently
passed on the current frozen binary and is included in the 38 completed cases.
The shared receipt comparison controls and later assembled handoff replay also
pass, with the separate failed captures preserved above.

The coordination correction passed focused owner checks: 13 request/recorder,
15 archive admission/acquisition, 25 ledger/native-lock, 50 runtime/inspector, and
25 benchmark-method tests. Type/lint passed across five affected projects and
their prerequisites, followed by the two changed consumers. The wire bridge
caught admission capacity being omitted from aggregate dimensions; the recorder
and inspector now preserve that numeric descriptor without adding capacities
as work counts. One inspector test also needed to stop assuming aggregate order.
Logs: `/tmp/observability-coordination-owner-checks.log`,
`/tmp/observability-coordination-owner-tests.log` (contains the initial wire
failure alongside successful owner selections),
`/tmp/observability-coordination-wire-checks.log`,
`/tmp/observability-coordination-wire-tests2.log`, and
`/tmp/observability-coordination-method-tests.log`.
The finite remaining assembled selection and final integration evidence remain
pending. Isolated repeated elapsed/RSS qualification is deferred.

The retained tiny Seq probe confirmed typed aggregate-log correlation and the
fixed projected-query response (four rows, exit zero, about 0.9 seconds). Its
artifacts are `/tmp/axm-seq-aggregate-wire-val95fgu/projection-query*`.
That tiny probe alone does not certify large live retrieval or production CLI
wiring. The later schema-2 Seq/authenticated executions and current platform CI
above supply their separately stated evidence. Remaining operation coverage and
the final integration gate are pending; repeated elapsed/RSS measurement is deferred.

The registered command tree contains **148 routes in 43 top-level families**,
including group nodes and the root. All routes declare capabilities. Universal
command identity is derived from the production tree; the independent
[route allocation](../../../apps/cli/src/test-support/command-routes.ts) and
[behavior allocation](../../../apps/cli/src/test-support/command-behavior-allocation.json)
are comparison inventories, not a second tracing route registry.

The family table below enumerates all paths. Its source owners route to the
consequential boundaries in the architecture table. A help-dispatch check proves
route identity and admission, not the work performed by the route's handler.
Real-operation development evidence exists for the selected workflows recorded
below; the complete family matrix remains pending. No family is excluded
because it bypasses the common operation wrapper. Query-only routes do not need
mutation evidence unless a declared option changes their effect. Each claimed
inapplicability must cite the route's capabilities and relevant specification.

Status terms:

- **Bound:** an implementation/specification/test source is identified; no pass
  or end-to-end coverage is implied.
- **Provisional execution:** a check ran on a changing worktree; its result does
  not identify the final immutable candidate.
- **Verified:** an exact candidate, command, host, raw artifact, and applicable
  independent oracle establish the stated result.
- **Pending:** required evidence is absent, stale, narrower than the claim, or
  awaiting final candidate execution.

## Architecture and executable bindings

All source bindings below are present. The current checkpoint records passed CI
and production checks with their actual input scope. This table describes proof
obligations; the completion table records what is established and what remains
for the final integrated revision.

| Boundary                                       | Consequential owner                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Specification and executable binding                                                                                                                                                                                                                                                                                                                                                                                                                                 | Evidence obligation                                                                                                                                                                           |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Invocation identity and outcomes               | [app dispatch](../../../apps/cli/src/app.ts), [capability identity](../../../apps/cli/src/command-tracing.ts), [runtime](../../../apps/cli/src/cli-runtime/run-cli-main.ts)                                                                                                                                                                                                                                                                                                              | [command identity specification](../../../apps/cli/src/cli-runtime/local-tracing-identifies-commands.spec.ts), [invocation specification](../../../apps/cli/src/cli-runtime/local-tracing-identifies-invocations.spec.ts), [compiled E2E](../../../apps/cli-e2e/src/binary-local-tracing.e2e.test.ts)                                                                                                                                                                | Real source and compiled work for every family; early failure, concurrent processes, build identity, startup/render/finalization separation.                                                  |
| Lifecycle phases and user waits                | [operation lifecycle](../../../apps/cli/src/operation-lifecycle.ts), [event observer](../../../apps/cli/src/cli-runtime/lifecycle-tracing.ts)                                                                                                                                                                                                                                                                                                                                            | [phase/wait tests](../../../apps/cli/src/cli-runtime/lifecycle-tracing.test.ts)                                                                                                                                                                                                                                                                                                                                                                                      | Real user delay and all settlement outcomes, including failure/interruption/finalizer lifetimes.                                                                                              |
| Physical filesystem and process work           | [filesystem adapter](../../../apps/cli/src/cli-runtime/observed-filesystem.ts), [process adapter](../../../apps/cli/src/cli-runtime/observed-process.ts), [runtime wiring](../../../apps/cli/src/runtime.ts)                                                                                                                                                                                                                                                                             | [filesystem port oracle](../../../apps/cli/src/cli-runtime/observed-filesystem.test.ts), [operation-work specification](../../../apps/cli/src/cli-runtime/local-tracing-describes-operation-work.spec.ts)                                                                                                                                                                                                                                                            | Operation-level live/bypass/post-phase reads, stream and byte accounting, actual subprocess lifetime and failures, no enrichment I/O.                                                         |
| Observation, candidate reuse, parsing, hashing | [observation view](../../../packages/core/workspace-kernel/src/workspace-state/workspace/observation-read-view.ts), [read view](../../../packages/core/workspace-kernel/src/workspace-state/workspace/read-view.ts), [package hash](../../../packages/core/workspace-kernel/src/workspace-state/workspace/package-hash.ts), [Registry index memo](../../../packages/core/workspace-kernel/src/sources/providers/registry/index-memo.ts)                                                  | Colocated view/hash tests and [memo observation tests](../../../packages/core/workspace-kernel/src/sources/providers/registry/index-memo-observability.test.ts)                                                                                                                                                                                                                                                                                                      | Independent requested/executed/reused/invalidated oracles for miss, hit, coalescing, changed candidate, mutation, phase exit, and delayed live reads.                                         |
| Registry semantics and one exchange owner      | [request policy](../../../packages/supporting/registry-client/src/request-policy.ts), [remote client](../../../packages/supporting/registry-client/src/remote-client.ts), [base transport](../../../apps/cli/src/cli-runtime/observed-transport.ts), [eligibility](../../../packages/core/workspace-kernel/src/planning/plan/registry-exposure.ts)                                                                                                                                       | Colocated request/client tests, [eligibility specification](../../../packages/core/workspace-kernel/src/planning/plan/rechecks-registry-exposure.spec.ts), operation-work specification                                                                                                                                                                                                                                                                              | Fixture-server requests, purpose/attempt/batch counters, headers/body timing, retry/backoff, before-acquisition and after-confirmation checks with unchanged authorization.                   |
| Acquisition and resource waits                 | [archive cache](../../../packages/supporting/registry-client/src/archive-cache.ts), [request budget](../../../packages/generic/host-primitives/src/request-budget.ts), [scratch budget](../../../packages/core/workspace-kernel/src/acquisition/scratch-budget.ts), extraction and buffered-archive owners                                                                                                                                                                               | [resource-wait tests](../../../packages/supporting/registry-client/src/resource-admission-observation.test.ts), [scratch-budget tests](../../../packages/core/workspace-kernel/src/acquisition/scratch-budget.test.ts), colocated cache tests                                                                                                                                                                                                                        | Independent bytes/counts and deterministic saturated admission, reuse, failure, cancellation, and interruption.                                                                               |
| Publication, locks, receipts, rollback         | [settlement transaction](../../../packages/core/workspace-kernel/src/settlement/transaction.ts), [context](../../../packages/core/workspace-kernel/src/settlement/context.ts), [transition lock](../../../packages/core/workspace-kernel/src/settlement/transition-lock.ts), [file locks](../../../packages/core/workspace-kernel/src/settlement/file-write-locks.ts), [document round trip](../../../packages/core/workspace-kernel/src/workspace-state/desired/document-round-trip.ts) | Colocated transaction/lock tests, [settings interference tests](../../../packages/core/workspace-kernel/src/workspace-state/desired/settings/publication-interference.test.ts), [native interference tests](../../../packages/core/workspace-kernel/src/projection/native-publication-interference.test.ts)                                                                                                                                                          | Actual no-op/change/preservation/snapshot/fresh conflict/route/write/verification/receipt/failure/interruption/restoration flows against filesystem state.                                    |
| Admission, summaries, receipts, retrieval      | [export policy](../../../apps/cli/src/cli-runtime/local-trace-policy.ts), [session](../../../apps/cli/src/cli-runtime/local-trace-session.ts), [receipt](../../../apps/cli/src/cli-runtime/local-trace-receipt.ts), [inspection](../../../apps/cli/src/cli-runtime/local-trace-inspection.ts)                                                                                                                                                                                            | [producer completion specification](../../../apps/cli/src/cli-runtime/local-tracing-records-producer-completion.spec.ts), [inspection specification](../../../apps/cli/src/cli-runtime/local-tracing-inspects-complete-evidence.spec.ts), [privacy specification](../../../apps/cli/src/cli-runtime/local-tracing-stays-local-and-private.spec.ts), [outcome preservation specification](../../../apps/cli/src/cli-runtime/local-tracing-preserves-outcomes.spec.ts) | Current real Seq span/log delivery; missing, duplicate or changed aggregate payloads; span/batch loss, cap/overflow/forced-stop controls; unchanged output/effects and schema/privacy review. |

### Registered family bindings

`(group)` is the family node itself; `(root)` is the empty registered route.
Every listed suffix is prefixed by its family. Bindings name production
adapters, which then use the common runtime and applicable owners above.
The inventory is a snapshot of the production tree checked by the command
identity specification against the independent allocation; refresh it when the
tree changes. Its inventory status is **bound**. The development executions below
cover selected real operations; they do not establish all-handler coverage.

| Family         | Registered suffixes                                                                                                                                                                                                       | Routes | Production adapter and work binding                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -----: | ------------------------------------------------------------------------------------------------------------------------------------ |
| `(root)`       | `(root)`                                                                                                                                                                                                                  |      1 | [Adapter](../../../apps/cli/src/app.ts): Dispatch/help, bounded early failure, process outcome.                                      |
| `adopt`        | `(group)`                                                                                                                                                                                                                 |      1 | [Adapter](../../../apps/cli/src/root/adopt/command.ts): Authoring preparation → plan → publication.                                  |
| `agents`       | `(group)`, `add`, `capabilities`, `list`, `remove`                                                                                                                                                                        |      5 | [Adapter](../../../apps/cli/src/root/agents/_agents.ts): Membership read/change; direct capabilities handler.                        |
| `archive`      | `(group)`                                                                                                                                                                                                                 |      1 | [Adapter](../../../apps/cli/src/root/lifecycle/command.ts): Published lifecycle → Registry.                                          |
| `cache`        | `(group)`, `prune`, `status`, `verify`                                                                                                                                                                                    |      4 | [Adapter](../../../apps/cli/src/root/cache/command.ts): Archive-cache status, verification and pruning.                              |
| `demote`       | `(group)`                                                                                                                                                                                                                 |      1 | [Adapter](../../../apps/cli/src/root/demote/command.ts): Authoring transition → workspace publication.                               |
| `deprecate`    | `(group)`                                                                                                                                                                                                                 |      1 | [Adapter](../../../apps/cli/src/root/lifecycle/command.ts): Published lifecycle → Registry.                                          |
| `diagnostics`  | `(group)`, `export`, `show`                                                                                                                                                                                               |      3 | [Adapter](../../../apps/cli/src/root/diagnostics/command.ts): Direct retained-diagnostic read/export.                                |
| `disable`      | `(group)`                                                                                                                                                                                                                 |      1 | [Adapter](../../../apps/cli/src/root/activation-handler.ts): Activation plan → workspace publication.                                |
| `discover`     | `(group)`                                                                                                                                                                                                                 |      1 | [Adapter](../../../apps/cli/src/root/discover/command.ts): Discovery query → Registry and local observation.                         |
| `enable`       | `(group)`                                                                                                                                                                                                                 |      1 | [Adapter](../../../apps/cli/src/root/activation-handler.ts): Activation plan → workspace publication.                                |
| `fork`         | `(group)`                                                                                                                                                                                                                 |      1 | [Adapter](../../../apps/cli/src/root/fork/command.ts): Authoring preparation → acquisition → publication.                            |
| `help`         | `(group)`                                                                                                                                                                                                                 |      1 | [Adapter](../../../apps/cli/src/root/help/command.ts): Help lookup and presentation.                                                 |
| `hooks`        | `(group)`, `configure`, `disable`, `enable`, `export`, `import`, `install`, `list`, `new`, `publish`, `show`, `test`, `uninstall`, `update`                                                                               |     14 | [Adapter](../../../apps/cli/src/root/hooks/_hooks.ts): Typed lifecycle/inspection; configuration/import/export; delegated hook test. |
| `install`      | `(group)`                                                                                                                                                                                                                 |      1 | [Adapter](../../../apps/cli/src/root/install/command.ts): Selection → eligibility → acquisition → publication.                       |
| `instructions` | `(group)`, `adopt`, `disable`, `enable`, `status`                                                                                                                                                                         |      5 | [Adapter](../../../apps/cli/src/root/instructions.ts): Status observation; adoption and activation publication.                      |
| `knowledge`    | `(group)`, `concepts`, `concepts capabilities`, `concepts get`, `concepts query`, `concepts related`, `concepts resolve`, `disable`, `enable`, `install`, `lint`, `list`, `new`, `publish`, `show`, `uninstall`, `update` |     17 | [Adapter](../../../apps/cli/src/root/knowledge/_knowledge.ts): Typed lifecycle/inspection; concept queries and lint.                 |
| `lint`         | `(group)`                                                                                                                                                                                                                 |      1 | [Adapter](../../../apps/cli/src/root/lint/command.ts): Direct query or --fix mutation; observation/repair publication.               |
| `list`         | `(group)`                                                                                                                                                                                                                 |      1 | [Adapter](../../../apps/cli/src/root/list/command.ts): Inventory/read views; optional Registry assessment.                           |
| `lock`         | `(group)`, `export`                                                                                                                                                                                                       |      2 | [Adapter](../../../apps/cli/src/root/lock/command.ts): Accepted-resolution export query.                                             |
| `login`        | `(group)`                                                                                                                                                                                                                 |      1 | [Adapter](../../../apps/cli/src/root/auth/login.ts): Authentication/browser/network and credential writes.                           |
| `logout`       | `(group)`                                                                                                                                                                                                                 |      1 | [Adapter](../../../apps/cli/src/root/auth/logout.ts): Credential removal.                                                            |
| `mcps`         | `(group)`, `add`, `adopt`, `disable`, `enable`, `import`, `install`, `list`, `new`, `publish`, `show`, `uninstall`, `update`                                                                                              |     13 | [Adapter](../../../apps/cli/src/root/mcps/_mcps.ts): Typed lifecycle/inspection; native add/adopt/import configuration.              |
| `migrate`      | `(group)`                                                                                                                                                                                                                 |      1 | [Adapter](../../../apps/cli/src/root/migrate/command.ts): Source transition → preparation → publication.                             |
| `packs`        | `(group)`, `add`, `disable`, `enable`, `install`, `list`, `new`, `publish`, `remove`, `show`, `uninstall`, `unpack`, `update`                                                                                             |     13 | [Adapter](../../../apps/cli/src/root/packs/_packs.ts): Typed lifecycle/inspection; authored membership and unpack.                   |
| `publish`      | `(group)`                                                                                                                                                                                                                 |      1 | [Adapter](../../../apps/cli/src/root/publish/command.ts): Source validation → archive → Registry upload.                             |
| `rules`        | `(group)`, `disable`, `enable`, `install`, `list`, `new`, `publish`, `show`, `uninstall`, `update`                                                                                                                        |     10 | [Adapter](../../../apps/cli/src/root/rules/_rules.ts): Typed lifecycle/inspection and authoring.                                     |
| `setup`        | `(group)`                                                                                                                                                                                                                 |      1 | [Adapter](../../../apps/cli/src/root/setup.ts): Direct orchestration; membership, source and workspace mutation.                     |
| `share`        | `(group)`                                                                                                                                                                                                                 |      1 | [Adapter](../../../apps/cli/src/root/share/command.ts): Workspace sharing query and observation.                                     |
| `skills`       | `(group)`, `disable`, `enable`, `handoff`, `import`, `install`, `list`, `new`, `publish`, `show`, `uninstall`, `update`                                                                                                   |     12 | [Adapter](../../../apps/cli/src/root/skills/_skills.ts): Typed lifecycle/inspection; import and handoff.                             |
| `subagents`    | `(group)`, `disable`, `enable`, `import`, `install`, `list`, `new`, `publish`, `show`, `uninstall`, `update`                                                                                                              |     11 | [Adapter](../../../apps/cli/src/root/subagents/_subagents.ts): Typed lifecycle/inspection; native import and compile.                |
| `sync`         | `(group)`                                                                                                                                                                                                                 |      1 | [Adapter](../../../apps/cli/src/root/sync/command.ts): Reconciliation → eligibility → acquisition → publication.                     |
| `token`        | `(group)`, `create`, `list`, `revoke`, `show`                                                                                                                                                                             |      5 | [Adapter](../../../apps/cli/src/root/auth/token.ts): Direct token show; credential/Registry create/list/revoke.                      |
| `unarchive`    | `(group)`                                                                                                                                                                                                                 |      1 | [Adapter](../../../apps/cli/src/root/lifecycle/command.ts): Published lifecycle → Registry.                                          |
| `undeprecate`  | `(group)`                                                                                                                                                                                                                 |      1 | [Adapter](../../../apps/cli/src/root/lifecycle/command.ts): Published lifecycle → Registry.                                          |
| `uninstall`    | `(group)`                                                                                                                                                                                                                 |      1 | [Adapter](../../../apps/cli/src/root/uninstall/command.ts): Selection → removal plan → publication.                                  |
| `unyank`       | `(group)`                                                                                                                                                                                                                 |      1 | [Adapter](../../../apps/cli/src/root/lifecycle/command.ts): Published lifecycle → Registry.                                          |
| `update`       | `(group)`                                                                                                                                                                                                                 |      1 | [Adapter](../../../apps/cli/src/root/update/command.ts): Resolution → eligibility → acquisition → publication.                       |
| `upgrade`      | `(group)`                                                                                                                                                                                                                 |      1 | [Adapter](../../../apps/cli/src/root/upgrade/upgrade.ts): Installation metadata/download and subprocess lifetime.                    |
| `version`      | `(group)`                                                                                                                                                                                                                 |      1 | [Adapter](../../../apps/cli/src/root/version/command.ts): Authored version changes → publication.                                    |
| `view`         | `(group)`                                                                                                                                                                                                                 |      1 | [Adapter](../../../apps/cli/src/root/view/command.ts): Local/remote extension read.                                                  |
| `visibility`   | `(group)`, `reconcile`, `set`, `status`                                                                                                                                                                                   |      4 | [Adapter](../../../apps/cli/src/root/visibility/command.ts): Published visibility status/set/reconcile → Registry.                   |
| `whoami`       | `(group)`                                                                                                                                                                                                                 |      1 | [Adapter](../../../apps/cli/src/root/auth/whoami.ts): Identity query and credential/Registry access.                                 |
| `yank`         | `(group)`                                                                                                                                                                                                                 |      1 | [Adapter](../../../apps/cli/src/root/lifecycle/command.ts): Published lifecycle → Registry.                                          |

The shared typed lifecycle routes use
[install](../../../apps/cli/src/root/shared/install-command.ts),
[uninstall](../../../apps/cli/src/root/shared/uninstall-command.ts),
[creation](../../../apps/cli/src/root/shared/create-extension-command.ts),
[list](../../../apps/cli/src/root/shared/list-command.ts), and
[show](../../../apps/cli/src/root/shared/extension-show.ts) adapters as applicable.
The type registration lives in
[extension-type-commands.ts](../../../apps/cli/src/root/extension-type-commands.ts).
`version` changes authored versions; the global `--version` action is a distinct
query path through dispatch. Options such as `--preview` and `lint --fix` change
mode without creating a new registered route.

## Completion evidence by outcome

These rows retain the full investigation and implementation verification scope.
They are not an alternative requirements authority. A row is complete only when
its applicable specifications, architecture, implementation, independent oracles,
and final execution evidence agree. The absence of a fixture is pending work,
not a reason to exclude a command or outcome.

| Outcome                                   | Required proof                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Current status and next evidence source                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Complete surface inventory             | Every registered family, consequential work owner, specification, implementation, and executable binding; reasoned route-specific inapplicability.                                                                                                                                                                                                                                                                                                                                                         | **Partial exhaustive preflight.** The inventory covers 148 routes; 244 of 249 scenarios have applicable completed evidence. Four byte-only comparison cases await an acceptance decision; the adoption diagnostic case requires a bounded replay.                                                                                                                                              |
| 2. Coherent architecture                  | Existing Effect services/layers own instrumentation; declared package entries and dependency direction hold; superseded paths are removed; schema, privacy, mode and lifetime contracts align between producer/exporter/inspector.                                                                                                                                                                                                                                                                         | **Prior CI and new prune checks passed; final audit pending.** Full CI at `99856a289` and the later production graph retain their input scope. Prune owner controls and fifty-package capture passed at the stated checkpoints; import controls and assembled captures pass. Knowledge construction and prepared-receipt checks also pass; final applicability and integration remain pending. |
| 3. Invocation and elapsed-time truth      | Actual source and compiled commands identify route/mode/version/build and correctly nested work; early errors and concurrent invocations remain distinct. Startup/process, execution, user wait, terminal rendering, and finalization/export are distinguished. No double counting of overlapping work.                                                                                                                                                                                                    | **Schema-2 Seq execution and partial preflight.** The six-case `08befbe16` suite and separate authenticated checkpoint establish their stated identity/ownership outcomes. Preserve those revisions; reconcile applicability and complete the remaining operation/mode cases.                                                                                                                  |
| 4. Actual work and reuse truth            | Independent server/FS/process counters agree with requested/executed/reused counts, batches, bytes, outcomes and invalidation. Cover miss/hit/coalescing, changed candidate, mutation/phase invalidation, live/bypass/post-phase reads, parsing, hashing, archive work and writes.                                                                                                                                                                                                                         | **Independent owner evidence and partial preflight.** Completed cases retain exact work/coverage evidence; automatic-prune inventory reconciles per scan in the fresh fifty-package capture. Resolve the four byte-only cases and adoption diagnostic replay, then finalize the owner-to-case mapping.                                                                                         |
| 5. Request, delay and wait truth          | One transport exchange owner; semantic purpose, attempts, batches, eligibility phases, headers, body, retry/backoff and admission are distinct. Controlled delay, saturated request/extraction/archive/scratch budgets, locks, resources, user wait and full subprocess lifetime are observed. Authorization remains unchanged.                                                                                                                                                                            | **Shared temporal evidence executed.** Held-body, admission, lock and subprocess owner controls and the six-case Seq suite are recorded above. Reconcile their input applicability and remaining assembled bindings; do not reopen completed shared controls without an uncovered failure.                                                                                                     |
| 6. Mutation and recovery truth            | Real no-op and changed operations preserve unmanaged data and required identities. Snapshot/preservation reads, fresh conflicts, publication route selection, write/verify/receipt boundaries, and rollback/restoration are visible on success, failure and interruption.                                                                                                                                                                                                                                  | **Publication controls passed; assembled coverage incomplete.** Linux and Windows interference controls and current fork/handoff replays passed. Their earlier failed captures remain preserved; remaining mutation/preview cases still require evidence.                                                                                                                                      |
| 7. Diagnostic completeness                | Distinguish disabled tracing, setup failure, failed/missing receipt, producer completion, delivery, missing root/child/batch, truncation/caps, forced termination and receiver completeness. Deliberately drop a span and a batch; verification must fail. Keep diagnostic status independent of product outcome.                                                                                                                                                                                          | **Schema-2 receiver controls executed.** The six-case Seq suite passed at `08befbe16`; focused owner/inspection controls and eight receipt-capture checks have recorded results. Final evidence maps their precise loss/tampering/termination claims and source applicability.                                                                                                                 |
| 8. Privacy and non-interference           | Default off, loopback-only endpoint validation, redirects/proxies/credentials constrained, bounded names/attributes, and no unsafe errors/events/links/logs/secrets. Off/reject/stall preserves stdout/stderr, exit, effects and bounded shutdown, with no enrichment reads.                                                                                                                                                                                                                               | **Shared privacy/isolation and shutdown evidence executed.** Source/compiled/authenticated and collector-failure checkpoints retain their actual scope; observed cleanup upper bounds remain below 500 ms. Complete the per-claim applicability audit; isolated elapsed/RSS qualification remains deferred.                                                                                    |
| 9. Contributor and agent workflow         | Source and compiled capture, exact trace lookup, bounded subtree, stable compact pure JSON, fresh receipts/concurrent worktrees, authenticated Seq, and real receiver inspection. Injected duplicate work and waits are visible.                                                                                                                                                                                                                                                                           | **Schema-2 contributor/agent workflow executed.** The six-case real-Seq suite and authenticated source/compiled checkpoint supersede the older reader register for their stated claims. Preserve exact revisions and artifacts in the final applicability map.                                                                                                                                 |
| 10. Bounded cost and performance evidence | Predeclared numeric disabled/default/detail elapsed, memory, volume and shutdown budgets. Before/after every affected operation across disabled, summary and detail capture with matched fixtures/runtimes, shared nearby baselines, repetitions and artifact identities. Apply size, latency and cache variations to the declared risk set. Preflight reconciles summary/detail work and receiver completeness; timing retains receipts without repeated receiver inspection or full fixture inventories. | **Elapsed/RSS qualification explicitly deferred by the maintainer.** Preserve the unchanged limits and balanced protocol in the follow-up. Full behavior/trace preflight, volume and shutdown evidence remain required here; earlier diagnostics are not performance acceptance.                                                                                                               |
| 11. Consequential executable evidence     | Current source, compiled process and real Seq cover success/no-op/reuse/invalidation/retry/contention/error/interruption/rollback. Missing owner, duplicate exchange, omitted live I/O, wrong reuse and incomplete collection negative controls fail meaningfully.                                                                                                                                                                                                                                         | **Owner suites and partial assembled coverage passed.** The production graph and real-Seq controls establish their bound outcomes; five operation/mode cases and the final per-outcome evidence reconciliation remain. Aggregate test totals do not replace that mapping.                                                                                                                      |
| 12. Main integration and platforms        | Source verification precedes published affected host-compatible E2E; E2E failure blocks a real push; final HEAD/cleanliness checks still run; non-main pushes stay fast. Required platform-specific CI runs on its actual host.                                                                                                                                                                                                                                                                            | **Current supported-platform CI passed; main integration pending.** Full CI at `99856a289` covers applicable Linux, Windows and macOS checks. The final clean source → affected host E2E → HEAD/cleanliness gate remains required; preserve existing blocked-push evidence with its applicability.                                                                                             |
| 13. Reproducible final proof              | Every requirement/architecture/family/outcome maps to exact source/spec/test command, revision, host, raw artifact, trace ID and independent oracle. Cached results and provenance limits are explicit; no silent deferral or waived scope.                                                                                                                                                                                                                                                                | **Final audit pending.** Frozen source/binary identities and current platform results are recorded above. Resolve the five remaining cases and record the final integrated revision, retained raw reports and row-by-row provenance/applicability; timing remains explicitly deferred.                                                                                                         |

The intended result is a trustworthy baseline for subsequent performance design,
not a performance optimization in this change. Reduced retained span count in
summary mode does not mean reduced product work or improved command latency.

## Predeclared measurement budgets

[observability-budgets.json](../../observability-budgets.json) is the machine
source for these thresholds, declared before the final candidate measurements.
It requires one warmup and five initial measured blocks, with predefined
escalation to ten, on an isolated Linux x64 reference host. Each rotated block
shares one nearby baseline across the three candidate capture modes. For each mode, candidate
median elapsed may exceed its matched uninstrumented baseline by at most
`baseline × relative + absoluteMillis`.

| Mode     | Relative elapsed allowance | Additional milliseconds | Maximum additional RSS |                 Retained span limit |
| -------- | -------------------------: | ----------------------: | ---------------------: | ----------------------------------: |
| Disabled |                        10% |                   25 ms |                 16 MiB | Not applicable: no trace collection |
| Summary  |                        20% |                   50 ms |                 32 MiB |                                2048 |
| Detail   |                        75% |                  150 ms |                 64 MiB |                               16384 |

The summary-group limit is 512; diagnostic shutdown is bounded by 500 ms.
Retained-span limits exclude the root; aggregate groups have their separate limit. A cap hit makes
evidence incomplete. These are acceptance limits, **not measured results**.
A passing run must also preserve independently verified work and outcomes.

For each operation in the family inventory, record applicable query/preview/apply
and no-op/change/error/interruption scenarios; explain impossible combinations
from capabilities and specifications. Include Registry-free operations and
those using local filesystem, credentials, process or installation work.
The finite risk set uses baseline and slow profiles, cold/warm AXM archive
cache states, representative one/ten-item paths, and one fifty-item volume case.
It does not cross every dimension with every operation. OS cache coldness is
not claimed. A single
uncontrolled shared-host run cannot substitute for the reference-host comparison.

Each retained report needs baseline/candidate source identity, source-diff
identity if uncommitted, executable hashes, runtime/tool versions, host/container
description, fixture identity, applicable latency/cache setup, sample phase and
order, elapsed/RSS, product outcomes, receipt identities and budget comparisons.
Preflight additionally retains full input/output inventories, raw receiver output
and independent work reconciliation. Timing blocks retain raw product output and
receipts; their delivery is explicitly uninspected, and full inventories are not
repeated per sample. Record tracer-disabled overhead separately from summary and
detail. Summary/detail work totals must agree in preflight under matching fixture
state even when retained detail volume differs. Final acceptance requires the
immutable candidate and applicable volume/shutdown evidence.

The earlier [Registry-network evidence](../registry-network/README.md) remains a
historical diagnostic record of different revisions, harnesses and sampling.
Its 432 command samples and 144 retrieved traces do not constitute the current
candidate's overhead, command coverage, producer-completion, or missing-batch
proof. Do not relabel them as new evidence.

## Inspection and reader evidence

The procedure is canonical in the [tracing guide](../../../contributing/guides/local-tracing.md).
The published interface is:

```bash
pnpm -s trace:inspect --receipt FILE [--expect FILE] [--span-id HEX16] [--max-nodes 1..100000]
```

The redesigned inspector retrieves the complete exact tree including correlated
logs, checks producer completion/loss and span topology, then reconciles both
the retained span set and aggregate payloads. Schema-2 receipts retain the
span-ID hash plus `aggregateEventCount` and `aggregateEventsSha256`. The latter
protects admitted aggregate values, dimensions, coverage and ownership, rather
than receiver-generated IDs or timestamps. Independent expectations separately
establish whether required work occurred. Work totals come from aggregates;
selected detail spans are not added again. Schema-2 owner and real-Seq execution
is recorded in the checkpoints above; exhaustive operation coverage is incomplete.

Completed receipts require `commandRoute` and `detailSelection`. Route admission
uses the actual registered vocabulary, and the benchmark matches the receipt
against its independently selected fixture command. Aggregate logs carry bounded
kind/owner/count metadata, work units and measurement coverage. Default summary
capture constructs no repetitive low-level spans; `AXM_TRACE_DETAIL` selects
`io`, `parse`, `hash`, `reuse`, `native`, `cache`, or `render`, optionally restricted
by `AXM_TRACE_DETAIL_PHASE`. The benchmark selects `io` for its detail subject.
The tracing guide owns configuration and the versioned schema owns field shapes.

The table below preserves historical reader evidence from the prior span-derived
pipeline. The six-case schema-2 suite at `08befbe16` and separate authenticated
checkpoint above provide the later workflow evidence. Their actual revisions
and input applicability belong in the final audit; these historical rows do not
require an automatic repeat of every reader workflow.

| Reader task                                                                | Historical evidence                                                                                                                                                                                                                                                                                                                               |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Follow guide from source capture through pure-JSON inspection              | **Provisional workflow execution.** Real source captures were retrieved and parsed by the published inspector; exact trees and JSON results are retained in `identity-AYN3fa` and `identity-ehZlED`. This is executable workflow evidence, not an independent human reader study.                                                                 |
| Build and capture current compiled CLI, preserving machine stdout          | **Provisional compiled execution.** The identity cases compare untraced/traced output, exit, credential files and actual wire requests across summary/detail. The dirty build and executable identities are recorded below.                                                                                                                       |
| Select a bounded subtree after full-invocation verification                | **Provisional real-receiver execution.** The compiled-summary identity case selects the verified HTTP owner subtree; `--max-nodes 1` fails with `traversal-limit`.                                                                                                                                                                                |
| Use authenticated Seq without credentials in argv/artifacts                | **Provisional authenticated execution.** `identity-ehZlED` repeats source/compiled summary/detail capture against authenticated Seq; checks reject connection credentials and private product values in retained output.                                                                                                                          |
| Run concurrent worktrees with fresh receipts                               | **Provisional process execution.** `worktree-isolation-qPqNhu` uses actual linked Git worktrees and distinct source/compiled receipts with checked provenance and state.                                                                                                                                                                          |
| Detect dropped span/batch, wrong receipt, overflow, and forced termination | **Partial real-receiver controls passed.** Identity cases reject truncation, invalid owners and traversal limits; `forced-kill-AYiQVx` cannot certify the killed invocation. The independently retained `dropped-batch-VGbrH6` control rejects acknowledged delivery loss. Remaining applicable controls and final-candidate replay stay pending. |
| Find deliberately injected duplicate work and waits                        | **Provisional oracle controls passed.** Identity evidence rejects injected duplicate work with `expectation-mismatch`; the retained device-poll fixture rejects duplicate wait counts. This does not prove every owner or wait class.                                                                                                             |

The inspector's success JSON includes `schemaVersion`, identities, mode,
`evidence`, `scope`, invocation elapsed/attributes, phases, waits and work.
`evidence.expectations` is `not-supplied` without an external expectation file.
A failure exits with status 1 and emits
`{schemaVersion: 2, evidence: "failed", code, message}`. The product command's
status remains separate. Pure JSON is a published interface promise; the reader
task requires actual stdout parsing to verify the redesigned workflow.

## Execution register

The following runs are provisional development evidence from Linux x64 on
2026-11-12, before the direct-aggregate redesign. The worktree was changing, so
none establishes the final immutable candidate or current schema-2 behavior. Temporary logs and receipts are not durable checked-in artifacts.
A later source edit invalidates affected evidence until it is repeated.

| Run                                          | Command/binding                                                                                                                             | Observation                                                                                                                                                                                                                                                                                                                           | Provenance and limitations                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Command identity and lifecycle               | `pnpm exec nx run cli:test -- local-tracing-identifies-commands lifecycle-tracing`                                                          | 14 tests in 2 files passed; one case dispatches help through all 148 production routes. Lifecycle tests cover privacy, nested phase/wait intervals, interruption and disabled subscription.                                                                                                                                           | Local log `/tmp/axm-cli-identity-tests-final.log`; run at 20:09:48 UTC. Earlier dirty-source identity/event evidence; the later source/compiled runs below exercise the prior pipeline's invocation identities. This is not all-handler work coverage.                                                                                                                                                                                                                |
| Published source route inventory             | Sequential `pnpm -s axm <route> --help --json --non-interactive` traversal through the harness inventory reader                             | Discovered 148 routes; no missing or stale entries against the benchmark inventory.                                                                                                                                                                                                                                                   | `/tmp/axm-observability-route-inventory.log`, `/tmp/axm-source-route-inventory-ZRFBlN/inventory.json`; source identity/coverage evidence only, not handler or performance proof.                                                                                                                                                                                                                                                                                      |
| Explicitly disabled source capture           | Source CLI and published inspector; exact invocation to be retained with final evidence                                                     | Product exited 0; receipt recorded `disabled`; inspector exited 1 with bounded JSON `export-disabled`.                                                                                                                                                                                                                                | `/tmp/axm-observability-status.w2xITxvi/{receipt.json,inspection.json,stdout,stderr}`; provisional source workflow evidence, not completed trace delivery.                                                                                                                                                                                                                                                                                                            |
| Assembled baseline route fixtures            | Direct preserved-binary diagnostic using the source fixture factory; not an owning-task verification substitute                             | Prepared 262 scenario descriptors and executed 150 successful invocations covering all 148 routes. An additional enabled-native adoption failure initially had a mismatched expected exit; its actual exit is 10.                                                                                                                     | `/tmp/axm-observability-all-route-fixtures-4.log`; prerequisite feasibility and baseline outcomes only. Latest recovery verifier and paired comparisons still require execution through the published workflow.                                                                                                                                                                                                                                                       |
| Independent authentication/process oracles   | Direct baseline fixture diagnostic                                                                                                          | Eleven successful auth, Hook and upgrade scenarios recorded exact external operations: login three auth requests; identity and token CRUD one each; token show zero; Hook test two processes; unchanged upgrade zero and changed upgrade four.                                                                                        | `/tmp/axm-observability-oracle-fixtures.log`; trace reconciliation and latest timestamp/owner checks pending. Existing adoption partial restoration failed an overly strong original-path-preservation assertion, which was corrected from independently retained state.                                                                                                                                                                                              |
| Real Seq source/compiled workflows           | Published `cli-e2e:e2e-tracing` target with focused selection; [execution binding](../../../apps/cli-e2e/src/local-tracing-seq.e2e.test.ts) | Default Seq: five selected cases passed, one filtered. Authenticated Seq: the selected source/compiled identity case passed, five filtered. Covers actual worktrees, authenticated product identity, body hold, collector rejection/stall and forced termination. Summary/detail parity includes every inspected additive work field. | `/tmp/observability-real-seq-default2.log`, `/tmp/observability-real-seq-authenticated1.log`; exact dirty-development identities and artifact directories below. These selections are not a full six-case suite pass or final candidate certification.                                                                                                                                                                                                                |
| Latest runtime and independent native bridge | Root focused CLI target, including the real filesystem/hash/reuse → OTLP → inspector bridge                                                 | 120 tests in 15 files passed, including all five native bridge cases and omitted-live-I/O, missing-owner and wrong-reuse controls. An initial bridge failure was its test receiver omitting the OTLP boolean/numeric oneof representation; the correction did not weaken production policy or oracles.                                | `/tmp/trace-bridge-runtime-final-tests.log`; provisional dirty source, not actual Seq delivery evidence.                                                                                                                                                                                                                                                                                                                                                              |
| Pre-redesign owner and harness checks        | Focused published runtime, kernel, sync, Registry, inspector and benchmark-contract targets                                                 | Runtime 52, kernel 33, sync 6, Registry 93, inspector 4, capability-owner 4 and benchmark-contract 17 checks passed. Owner type/lint checkpoint passed 48 tasks; revised harness type/lint passed 28 tasks, 24 cached; E2E type/lint passed 44 tasks.                                                                                 | `/tmp/observability-streamlined-{runtime,kernel,sync,registry,inspector}-tests.log`, `/tmp/observability-streamlined-owner-checkpoint.log`, `/tmp/observability-streamlined-harness-tests.log`, `/tmp/observability-streamlined-harness-check2.log`, `/tmp/observability-streamlined-capability-tests.log`, `/tmp/observability-e2e-narrow-checkpoint.log`. Dirty development evidence; revised mode/startup fixtures and the performance campaign remain unexecuted. |

The pre-redesign real-Seq selections used CLI revision
`5f8dcd052d435c278d971d2771b331d0ba61f7c9` with **dirty source**, product-source
SHA-256 `ffb345ad3940e1e25dc570d749c2a99e40a75710de8d1b9a0ad2fca17cb585aa`, and
host-binary SHA-256 `5c03b8579e3783ec96d2a8d7fec651a84098c67619c033917b0033419d907327`.
The local manifests under `/tmp/axm-seq-e2e-preflight-ce0kacvi` retain artifact
identities and before/after disk and collector health. Evidence directories under
`test-results/cli-e2e-tracing/evidence/` are `worktree-isolation-qPqNhu`,
`identity-AYN3fa`, `identity-ehZlED`, `body-hold-HEjsuT`,
`collector-failure-INy781`, and `forced-kill-AYiQVx`.

The body fixture independently held 330 bytes for 1008.188 ms: the semantic
request lasted 1014.663 ms while the header exchange lasted 4.830 ms, with one
actual request. Collector rejection/stall preserved product output, requests
and credential state; observed cleanup upper bounds were 287.577 and 314.814 ms.
These shared-host development samples are not isolated-host certification of
the 500 ms shutdown budget. Unmeasured auth/text-body byte totals remain unknown.

The batch-loss control is reused narrowly from `dropped-batch-VGbrH6` and
`failed-default1-manifest.json`, not counted as a successful full suite. The relay
acknowledged and dropped the first 2058-byte OTLP batch, then forwarded two batches.
The producer recorded 92 retained IDs and zero loss, but exact receiver inspection
failed with `identity-mismatch`. Its duplicate-wait control also failed as expected
with `expectation-mismatch` before an unrelated final-state assertion failed.
That result establishes the prior span-set control only. Schema 2 additionally
requires aggregate-log loss and payload-tampering controls; the old batch-loss
run cannot certify those new boundaries. The later schema-2 suite and focused
controls are recorded above; their final source/input applicability still needs
explicit reconciliation.

### Benchmark execution status

The executable suite is selected through `AXM_BENCHMARK_SUITE=observability pnpm
run bench`; the [tracing guide](../../../contributing/guides/local-tracing.md)
owns invocation and manifest instructions. Its coverage inventory includes all
registered routes and fails a measured campaign on missing successful fixtures.
Fixture-only runs remain incomplete evidence and cannot satisfy a budget.

The preserved baseline is clean revision
`45e752305a796c808de434e45b3e0f5e1a685123`, binary SHA-256
`da82b0ce5a735f9ccf470b6d28870869f504a9f618433a21c5357faf124d6ea6`.
Comparison against rebased revision
`5f8dcd052d435c278d971d2771b331d0ba61f7c9` found only two agent-research
Markdown changes under the product scope, with no product code or dependency
lockfile change. The baseline executable remains preserved; it is not rebuilt
from the current working tree.
The clean candidate identity is recorded above. Full assembled fixture validation
and final trace-oracle reconciliation remain pending; repeated elapsed/RSS pairs
are the explicit maintainer-authorized follow-up. Provisional baseline smoke
exercised seven successful authentication/token operations and changed/no-op
upgrade with independent state assertions. Typed-fixture smoke passed 78 cases,
including eight actual publication writes. A later smoke passed visibility
status/set/reconcile and all six published lifecycle mutations, plus rechecked
both upgrade cases after output-projection correction. Local logs are
`/tmp/axm-auth-maint-smoke.log`, `/tmp/axm-typed-smoke3.log`, and
`/tmp/axm-lifecycle-maint-smoke.log`. These development checks establish fixture
feasibility, not candidate correctness or performance.

The enabled-native adoption baseline failure is an explicit additional outcome,
not accepted product behavior: settings and lock are restored while acquired
bytes remain moved to the authoring directory. Three retained recovery snapshots
contain the original inputs. The fixture checks the failure category, exact
recovery structure and bytes and retains original artifacts; it does not call
this a complete rollback. Successful disabled-package adoption remains a
separate route fixture.

The revised finite closure is:

| Obligation                  |   Cases | Selection                                                                                                                                                                                                    |
| --------------------------- | ------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Every registered route      |     148 | One successful actual default handler; group help only for group routes                                                                                                                                      |
| Every supported preview     |      81 | Existing public help discovers preview flags; lint uses `--fix --preview`; protected state is checked                                                                                                        |
| Flag-selected applying mode |       1 | Determined missing instruction alias repaired by `lint --fix`                                                                                                                                                |
| Startup outcomes            |       7 | Fresh current/newer; missing/stale refresh success; stale invalid body/HTTP failure; scoped cancellation                                                                                                     |
| Distinct risk paths         |      12 | Built-in version; unchanged upgrade; enabled-native adoption refusal; Registry no-op/warm restoration; ten-item list/restoration; fifty-item restoration; slow install; path cold sync; Git cold sync/update |
| **Total**                   | **249** | No Registry/cache/network Cartesian product                                                                                                                                                                  |

Full preflight schedules 996 workload invocations and 498 exact trace
inspections. Initial timing schedules 5,976 workload invocations: one warmup
and five measured four-subject blocks per case, totaling 6,972 with preflight.
Discovery and fixture-preparation invocations are counted separately. Candidate
traced workload invocations total 3,486: 498 preflight inspections and 2,988
timing receipts whose delivery is explicitly not individually inspected.
Escalation adds 20 invocations per case; it does not automatically repeat Seq
queries. All initial observations remain retained. The tracing guide owns exact
noise, drift and headroom rules; existing numeric performance limits are unchanged.
The independent compiled-list latency specification's sampling and CI target
are unchanged. Count reductions do not establish wall-clock savings.

The revised scheduling and contract had passing development type/lint and
17-test evidence before the observation migration. The redesigned trace
reconciliation and selected-`io` detail subject require current checks. All preview/startup fixtures have current applicable preflight evidence; the
five remaining cases are identified in the current checkpoint above. Repeated elapsed/RSS measurement is deferred.
Earlier 262-descriptor baseline smoke is retained as fixture feasibility evidence,
not a completed campaign under this revised method. The restricted TLS fixture
has a separate five-control development probe at
`/tmp/axm-startup-tls-probe-Ibw9Eu/proof.json`: pinned Bun and the preserved compiled
baseline honor child-only CA trust, reject the untrusted CA, and the proxy rejects
other CONNECT hosts. Its baseline main command intentionally hit a local Registry
503 response; this proves transport/startup compatibility, not successful new
scenario completion. Private keys were removed by scoped cleanup.

Five completed diagnostic roots were losslessly archived under
`/tmp/axm-observability-diagnostic-archives-21tcg3tz`; `index.json` and per-root
manifests record archive SHA-256 and every original entry's bytes/hash, mode,
mtime, owner and symlink target. Each archive was read back and the source tree
rechecked before only that source directory was removed. The 40 MiB archive
set replaced about 392 MiB of allocated directories; observed free space rose
from 6.4 to 6.8 GiB. Baseline and unrelated data were unchanged. Older evidence
paths in this ledger are recoverable from those exact archive roots.

External process elapsed and RSS are independent of producer spans. Completed
receipt timing includes startup, execution, runtime elapsed at execution end,
and export finalization. Finalization excludes the final receipt write/close;
the cleanup budget uses external elapsed minus runtime elapsed at execution end
as a conservative upper bound. Summed work duration is never substituted for
elapsed time.

The redesigned inspector counts finished observations in `count`, independently
of retained spans. Its additive fields remain `workCount`, `requested`,
`executed`, `reused`, `bytes`, `ioBytes`, `archiveBytes`, `archiveEntries`,
`batchItems`, `registryBatchItems`, and `deniedItems`, with owner-reported units.
`measurements` retains known partial totals with `measured` and `occurrences`;
a convenient total remains `null` unless every occurrence measured that field.
An exact independent expectation, including zero, requires full coverage.
Attempt ordinals, status codes, capacities and requested admission sizes remain
attributes, not additive totals. The prior 52-test/Seq evidence supports the old
owner-unit distinction. The later direct-accounting owner and schema-2 Seq
checkpoints establish their recorded scope; exhaustive operation coverage and
final evidence reconciliation remain incomplete.
Explicit receipt status documents distinguish starting, disabled, rejected
endpoints and setup failures without claiming completion. Missing or invalid
receipts remain uncertain and are rejected before receiver lookup.

Raw outputs, filesystem inventories and hashes, protocol records, exact Seq
retrievals and projection descriptions are retained with SHA-256 identities.
Projected product files additionally retain their original bytes. Only declared,
schema-validated volatile fields are projected for comparison; raw values stay
available. Preflight raw artifacts are gzip-compressed and roundtrip-verified
before originals are removed; timing blocks retain raw files without per-sample
compression or repeated whole-state inventories. Storage capacity and receiver reserve must be
checked before collection; neither a missing trace nor exhausted storage can
be converted into a pass.

### Finalization still required

Before marking any complete-scope claim verified, retain the final source and
binary identities, raw evidence and independent oracles, replace provisional
entries with exact reproducible command/host/artifact records, and resolve every
pending applicable outcome. Run the existing main-only integration gate on the
clean final candidate and record platform-specific CI separately. Any remaining
gap must remain visible here and in the delivery report. The sole authorized
deferral is isolated repeated elapsed/RSS qualification; every other applicable
criterion must pass. A deferred measurement is never reported as a pass.
