# Registry network investigation

This investigation measures the real compiled CLI against a synthetic local
Registry through native Toxiproxy. Its purpose is to identify ownership and
scheduling improvements, while preserving the authorization, freshness, and
rollback obligations in accepted specifications. The accompanying change adds
measurement tooling and complete-request tracing; it does not implement the
proposed performance redesign.

## Measurement contract

The matrix covers ordinary `list`, remote `view`, explicit single-extension
`install`, restoring `sync`, no-op `sync`, and `update`. Ten configured remote
skills are installed at v1; update selects v2. Install selects one explicit v2
skill in a workspace with ten configured entries, rather than pretending that
`install` without a source is a supported bulk operation. Restore removes the
canonical extension directory, including the bundled AXM extension; its local
restoration work is included. All commands use the same Claude Code agent.

Each condition has three untraced samples and a separate traced diagnostic
sample. Profiles rotate between repetitions. Each sample starts a fresh process
and copies its workspace and home. Cold means the archive cache is cleared;
warm means the needed archive versions are preseeded. OS caches and VM contention
are uncontrolled. Report medians and ranges, not tail percentiles or significance
claims from three observations. Trace-export overhead is excluded from ordinary
elapsed comparisons.

Profiles are baseline (no injected delay), typical (50 ms in each direction),
and slow (150 ms in each direction). The fixture delays archive bodies by 100 ms
and flushes headers first. Archives are deliberately small. This is a repeatable
latency/scheduling experiment, not a production latency or throughput estimate.
Server intervals end before downstream proxy transit; complete-request spans
are the evidence for client body completion.

The [Toxiproxy guide](../../../devops/tools/toxiproxy.md#repeat-the-operation-matrix)
owns reproduction commands and environment options. Preserve binary hashes,
actual proxy configuration, request timelines, raw samples, and exact trace IDs.
A partial report (`complete: false`) is not a complete benchmark.

## Before/after instrumentation comparison

Measured on Linux x64 on 2026-11-12. Before is product source at `faabc7c9d`;
after is `45e752305`. Both use preserved compiled binaries and the same
synthetic Registry contents and network profiles. The initial harness used
`Effect.runPromise`; the candidate harness adds scoped runtime shutdown and
formatting. Child command timing and fixture semantics are unchanged.

Each cell is **before → instrumented**, median milliseconds of three untraced
runs. [Summary JSON](comparison-summary.json) includes ranges, request counts,
body bytes, and artifact hashes. Raw reports retain every sample and timeline:
[before](before-10.json) and [instrumented](after-10.json).

| Operation / cache   |  Baseline ms |    Typical ms |       Slow ms |
| ------------------- | -----------: | ------------: | ------------: |
| list / cold         |    436 → 473 |     355 → 408 |     341 → 433 |
| list / warm         |    363 → 412 |     340 → 349 |     329 → 366 |
| view / cold         |    224 → 201 |     297 → 317 |     512 → 520 |
| view / warm         |    270 → 198 |     310 → 326 |     526 → 555 |
| install / cold      |  1155 → 1185 |   1874 → 2004 |   3214 → 3402 |
| install / warm      |   1349 → 905 |   1794 → 1853 |   3463 → 3590 |
| sync-restore / cold |  8680 → 8100 | 10909 → 12566 | 19804 → 21633 |
| sync-restore / warm |  7304 → 7999 | 10936 → 13086 | 19735 → 21522 |
| sync-noop / cold    |  1285 → 1570 |   1229 → 1710 |   1188 → 1281 |
| sync-noop / warm    |  1373 → 1551 |   1267 → 1516 |   1199 → 1159 |
| update / cold       | 8843 → 10131 | 11215 → 14216 | 20312 → 22044 |
| update / warm       |  7789 → 9857 | 12284 → 13222 | 21048 → 22469 |

These measurements do not establish a speedup or a precise instrumentation
overhead. Runs were sequential on a shared VM, with only three observations per
condition. Local-only list and no-op sync also vary although their Registry work
is zero. Several instrumented medians are higher; overlapping ranges and control
variation prevent assigning that difference solely to instrumentation. Use
interleaved binaries on a controlled host before setting a regression threshold.
The architecture recommendations are supported by actual request sequences and
parse executions, not by treating those timing differences as eliminated work.

## Scaling and trace verification

The final harness also completed one untraced and one traced sample per condition
at one extension, before and after instrumentation: [before](before-1.json) and
[instrumented](after-1.json). Those single samples are scaling diagnostics, not
additional three-sample timing estimates. Across both sizes, all **432 command
samples** succeeded and all **144 diagnostic traces** were retrieved from Seq.

[Trace verification](trace-verification.json) records every exact trace/root ID,
Seq completeness, span counts, and body bytes. Each trace matched its receipt and
had a successful root. Every instrumented request/attempt count matched modeled
Registry wire requests, and each archive-body count and byte total matched the
server records. Body spans were nested within their attempts. The
[artifact provenance](provenance.json) maps both preserved binaries to producing
revisions and identifies the harness snapshots.

The following counts were identical before and after instrumentation:

| Warm operation | Registry calls, 1 → 10 extensions | Lockfile parses, 1 → 10 extensions |
| -------------- | --------------------------------: | ---------------------------------: |
| Ordinary list  |                             0 → 0 |                              1 → 1 |
| No-op sync     |                             0 → 0 |                            34 → 34 |
| Restoring sync |                            6 → 60 |                           62 → 170 |
| Update         |                            7 → 70 |                           42 → 375 |

These parse counts come from the exact baseline-profile traces for list/no-op
sync and slow-profile traces for restore/update, linked by ID in the verification
JSON. A parser span represents an actual TOML parse, unlike the multiple HTTP
wrapper spans described below. The counts identify investigation targets; they
do not declare every mutation-time parse redundant.

The [cold install trace](after-install-cold-baseline-trace.json),
`fdb1e0d04e1f5685c3044696282a2c89`, demonstrates complete-body timing:
HTTP headers arrived in **1.43 ms**, archive-body consumption took **101.46 ms**,
and its enclosing attempt lasted **103.49 ms**, reporting **382 bytes**. The
fixture deliberately delayed the body by 100 ms after flushing headers.

## Findings and architectural recommendations

### Batch and schedule eligibility by phase

[Registry exposure validation](../../../packages/core/workspace-kernel/src/planning/plan/registry-exposure.ts)
deduplicates exact content identities but awaits each identity serially.
[Plan resolution](../../../packages/core/workspace-kernel/src/planning/plan/resolve-plan.ts)
invokes this before acquisition and again after acquisition/confirmation. Each
[client access check](../../../packages/supporting/registry-client/src/remote-client.ts)
performs exact metadata validation followed by an archive HEAD request. A cached
archive acquisition performs the same two checks independently.

The slow-profile warm restore timeline shows two serial chains of twenty
requests, with one bounded concurrent acquisition phase between them. All ten
identities receive three metadata requests and three HEAD requests. The existing
invocation/origin budget is four, but a serial producer cannot use its capacity.
This is distinct from archive transfer: the warm run downloads no archive bodies.

Introduce a bulk exact-eligibility capability owned by PlanSources and the
Registry client. Group metadata by endpoint and credential context, use the
existing metadata protocol in batches of at most 100, then perform independent
HEAD checks under the existing operation budget. Keep per-identity results and
semantic-closure failures; one denial must not reject unrelated work. Preserve
both eligibility boundaries. The accepted
[exposure requirement](../../../packages/core/workspace-kernel/src/planning/plan/rechecks-registry-exposure.spec.ts)
requires current exact publisher, integrity, and content eligibility and a check
after confirmation. Do not remove the second check to improve timings.

With ten identities, batching metadata in the two exposure phases reduces those
phases from 40 requests to 22 while retaining all 20 HEAD checks. This is a design
estimate, not a measured optimized result. Under a four-request budget, each
phase changes from twenty serial round trips to one metadata round trip plus
three waves of HEAD requests, before server processing and local overhead.

A warm archive substitutes a metadata-plus-HEAD sequence for one archive GET.
With these tiny archives and injected latency, a warm run can therefore be slower
than a cold run despite transferring zero archive bodies. This does not establish
that caching is harmful for realistic large payloads; it identifies redundant
validation work to consolidate without weakening access policy.

The middle acquisition phase is a second opportunity: its per-item metadata
checks also bypass planning's metadata batcher. Unify the bulk acquisition input
with explicit, phase-bound exact metadata evidence. Keep current access checks
separate from immutable archive identity. Reusing an access decision beyond its
freshness boundary requires an accepted policy; it is not implied by a lockfile,
an archive hash, or metadata `validUntil`.

Update also makes ten individual index GETs in three waves of at most four
before eligibility work. That phase is already concurrent; the remaining
opportunity is using the existing batched metadata protocol for independent
selection requests. The matrix observes 70 requests for a warm ten-extension
update (ten index reads plus the sixty access-related requests). Raising the
operation budget would not address the two serial eligibility chains and would
increase resource pressure.

### Reuse by lifetime and meaning

The current code already has useful boundaries; extend them instead of adding a
process-wide filesystem or Registry cache:

| Evidence                                  | Appropriate owner and lifetime                                   | Must not substitute for                                    |
| ----------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------- |
| Accepted package identity and tree digest | Lockfile; persistent until the next accepted transition          | Current presence, integrity, or access authorization       |
| Decoded settings, lockfile, desired graph | Workspace read view; stable query/planning phase                 | Fresh pre-publication observations                         |
| Local file/directory observations         | Observation read view; invalidated by writes and phase exit      | Mutation-time conflict, route, or rollback checks          |
| Registry selection metadata               | Endpoint/credential/purpose-bound observation phase              | Current archive download eligibility                       |
| Verified archive bytes and admitted files | Scoped acquisition, exact identity and resource budgets          | Current remote authorization or mutable canonical files    |
| Exposure eligibility                      | Explicit eligibility phase, refreshed at the accepted boundaries | Durable acceptance or reusable cross-invocation permission |
| Publication preimage and receipt          | Mutation owner under the workspace transition                    | Earlier planning facts                                     |

[WorkspaceReadViews](../../../packages/core/workspace-kernel/src/workspace-state/workspace/read-view.ts)
already captures settings/lockfile/desired evaluation and reuses nested phases.
[Observation sharing](../../../packages/core/workspace-kernel/src/workspace-state/workspace/observation-read-view.ts)
closes on mutations and copies mutable buffers before returning them.
[RegistryIndexMemo](../../../packages/core/workspace-kernel/src/sources/providers/registry/index-memo.ts)
is scoped to a planning phase, batches requests that arrive together, and does
not retain failures. A resolver cannot batch later sequential calls or calls
that bypass it. Broader scope alone will not fix the eligibility loop.

The [archive cache](../../../packages/supporting/registry-client/src/archive-cache.ts)
coalesces active acquisitions only; completed bytes are not retained in its
in-flight table. Local cache integrity and current access are intentionally
separate. Prefer extending the existing acquired-content handoff and budgeted
preparation boundaries to retaining arbitrary completed client calls.

The reuse boundary is not consistently consumed. Exact baseline traces contain
34 lockfile parse spans for no-op sync, 170 for restoring sync, and 375 for update
at ten extensions. Thirty of the no-op sync parses occur under one preparation
observation phase; 244 of update's parses occur under `UpdateExtensions.prepare`.
These are parse executions, not inferred filesystem reads or summed timings.
They establish repeated parsing, but do not prove that every parse in a mutating
operation is unnecessary.

[WorkspaceInvariantFactsLive](../../../packages/core/workspace-kernel/src/projection/invariant-facts.ts)
captures SettingsReader, LockfileReader, and filesystem services at layer
construction and re-provides them when evaluating participants. That route can
bypass the readers supplied by a later observation phase.
[State cells](../../../packages/core/workspace-kernel/src/workspace-state/workspace/state-cells.ts)
create fresh scoped loaders on each narrow live read; caching inside each loader
does not share parsing across those calls. This is an ownership/composition gap,
not a reason to make live readers permanently cached.

Extend the existing read-view contract so planning participants receive the
current phase's readers at execution time, or an explicit immutable read context
as input. Keep publication services bound to live I/O. Audit reader captures in
all planning providers, then assert one decode per stable document per phase,
including nested planning, other-scope reads, and prospective documents. Retain
new reads after invalidation and fresh checks before publication. Mutation-time
parses need separate attribution before removal. This is the second priority
after eligibility scheduling, and directly addresses the original lockfile
reuse concern.

Ordinary inventory is already required to be local by its
[accepted specification](../../../packages/core/workspace-features/src/inspection/extension-list/ordinary-inventory-is-local.spec.ts).
The benchmark observes zero Registry requests for ordinary list and no-op sync.
Their remaining elapsed time must be investigated as startup/local observation
work, not attributed to Registry latency. Lockfile reuse already exists; making
the lockfile the sole source of current filesystem truth would weaken behavior.

### Classify reads before replacing them

| Read                                               | Why it exists                                          | Recommendation                                                                                                 |
| -------------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Optional content comparison in `writeFileAtomic`   | Avoid unchanged publication and its observable effects | Carry a validated preimage/decision from the publication owner where available; do not add a global read cache |
| Native document read before merge                  | Preserve unmanaged fields and regions                  | Retain; parse once in the stable phase and pass the prepared document                                          |
| Fresh preimage/route comparison before publication | Detect concurrent edits and symlink/identity changes   | Retain under the transition; an earlier cached read is insufficient                                            |
| Snapshot/protection read                           | Restore previous state on failure                      | Retain or transfer the already-owned snapshot; never replace with blind overwrite                              |
| Post-write content/route verification              | Verify actual publication and bind receipts            | Retain; publication intent is not evidence that the write persisted correctly                                  |
| Archive cache integrity read/hash                  | Detect corrupt or tampered cache bytes                 | Retain; scoped verified-byte ownership can prevent repeated hashing of the same immutable bytes                |
| `exists` followed by read                          | Distinguish absence from other failures                | Candidate for a typed read-if-present operation where error semantics match; measure before changing           |
| Stat before identity-preserving native write       | Bind publication to the existing file identity         | Retain; replacement can invalidate native insertion receipts                                                   |

[Atomic writing](../../../packages/generic/host-primitives/src/atomic-write.ts)
already performs no destination content read by default. Blind overwrite is
therefore not a missing generic capability. Its optional comparisons have only
a few production callers.
[Document round trips](../../../packages/core/workspace-kernel/src/workspace-state/desired/document-round-trip.ts)
perform preparation, live revalidation, publication, and verification for
different obligations. [Subagent publication](../../../packages/core/workspace-kernel/src/agent-adapters/subagents/sync.ts)
uses the current content for a conflict/no-op/write decision and preserves file
identity when writing. Collapsing those reads indiscriminately would lose
protection against external edits or weaken rollback/receipt correctness.

A useful long-term interface is a prepared publication carrying the rendered
bytes, validated prior content and identity, and the required write decision.
The mutation owner consumes it under its lock, performs the required fresh
comparison once, publishes, and records/verifies the result. Generalize this
only for owners with the same publication obligations; settings, managed
regions, canonical package replacement, and native identity-preserving writes
should not be forced into one overwrite policy.

## Proposed functional and technical contract

Each operation constructs a scoped execution context with distinct owners for
stable observations, exact content acquisition, current eligibility, and live
publication. The contract applies across the CLI; commands select the facts and
capabilities they need rather than recreating their own caches.

```mermaid
flowchart LR
  R[Stable read and selection phase] --> E[Batched metadata and bounded access checks]
  E --> A[Budgeted exact content acquisition]
  A --> C[Confirmation]
  C --> F[Fresh batched eligibility]
  F --> L[Workspace transition lock]
  L --> V[Fresh preimage validation]
  V --> P[Publication, verification, receipts]
```

Queries stop after their requested observation; a local inventory does not enter
the Registry path. A no-op mutation still validates current observations before
claiming convergence. Read-only phases can share decoded inputs; every write or
phase exit invalidates that view. Candidate documents are keyed by their actual
input identities, not only by destination path. Independent work is bounded by
the existing operation budgets, and all remote work finishes before acquiring
the workspace transition lock.

Implementation acceptance should establish:

- One decode of each stable document per phase, including nested providers,
  without reusing observations after a mutation, changed candidate input, or
  phase exit. Delayed prepared closures must fall back to live readers.
- Metadata batches contain at most 100 compatible items. Independent identities
  enter bounded concurrent work; duplicates within that phase share completed
  immutable metadata. Failures and credentials cannot bleed across phases or
  sources.
- Exact publisher, version, integrity, and current content access remain checked
  at the existing eligibility boundaries. Revocation during confirmation still
  refuses the affected closure. Cached archives never grant access by themselves.
- Acquisition retains exact admitted content only within resource budgets and
  transfers ownership to materialization; it does not repeatedly reparse or
  rehash the same owned immutable bytes without a new integrity obligation.
- Publication performs each required live conflict, route, snapshot, and receipt
  check at its owner. It preserves unmanaged content, no-op behavior, identity
  requirements, and closure rollback. Reusing prepared data never bypasses those
  checks.
- Before/after measurements cover every affected operation under all fixed
  profiles and both archive-cache states, with equal command semantics and
  artifact provenance. Compare elapsed distributions, actual requests, body
  bytes, parsing counts, and complete trace evidence. Count reductions must be
  explained by preserved obligations; changes in timing alone do not prove
  eliminated work.

Implement in three reviewable stages: (1) correct phase-reader consumption and
bulk eligibility interfaces with deterministic behavioral evidence; (2) route
selection and acquisition through the existing metadata batching and admitted
content owners; (3) consolidate prepared publication inputs where the read audit
shows the same obligation being repeated. Run the operation matrix at every
stage. The existing request, extraction, buffered-archive, and scratch budgets
remain independent controls; do not replace them with one universal cache or
semaphore.

## Decisions before implementing the redesign

1. **Eligibility scheduling:** recommend batch metadata plus bounded parallel
   HEAD checks at both existing boundaries. Retaining the serial loop preserves
   behavior but leaves latency proportional to extension count; removing a
   boundary conflicts with the accepted requirement.
2. **Access-decision reuse:** recommend no cross-phase reuse in the first
   implementation. A short lease could save requests, but requires a separately
   accepted authorization/freshness contract and server support if it promises
   continued eligibility. A client-selected TTL is not that contract.
3. **Prepared publication:** recommend a scoped owner contract that transfers
   already-validated inputs and preserves fresh revalidation. Prefer targeted
   typed read-if-present simplifications where no duplicated owner state exists.
   Do not adopt blind overwrite as a workspace-wide policy.
4. **Performance acceptance:** require before/after evidence for every changed
   operation, with identical fixture, runtime, binary provenance, profiles, cache
   states, request/body counts and trace receipts. Add deterministic assertions
   for request scheduling, batch sizes, invalidation, denial isolation, and
   post-confirmation revocation. Use elapsed benchmarks as diagnostic evidence,
   not noisy timing assertions in ordinary tests. Platform-specific assurance
   remains in CI; do not claim this Linux run proves other hosts.

## Trace interpretation

Effect client composition currently produces three nested `axm.http.request`
spans per wire request in these fixtures: the warm restore trace has 180 HTTP
spans for 60 server requests; update has 210 for 70. The nested spans have almost
the same interval. Do not report these as three network calls or sum them as
network wait. Use server request records for wire counts and the new Registry
request/attempt/body spans for semantic operation timing. A follow-up can move
transport span ownership to one actual exchange boundary while preserving the
header/body distinction; exporter filtering alone must not erase useful timing.

One baseline cold-restore sample also received four unattributed `GET /` requests
that returned 404; the modeled Registry routes still account for fifty calls.
The raw report retains them (54 total), rather than attributing them to duplicate
archive acquisition. No other baseline sample contained those root requests.
The fixture records all incoming traffic, so inspect routes before interpreting
request-count outliers.

## Verification and delivery boundary

- Registry request-policy and remote-client tests: **114 passed**, including body
  completion, failure, interruption, and successful archive-byte attribution.
- Local tracing tests: **13 passed**, including native OTLP export of the new
  nested spans and bounded byte attributes.
- Network-controller specification: **10 passed**, using the declared HTTP API
  substitute for configuration ordering, ownership, refusal, drift, and cleanup.
- Owning lint/typecheck tasks for `axm`, `registry-client`, and `cli`: passed;
  the root checks were repeated after final harness changes.
- Host CLI compilation, specification catalog generation, and source hygiene:
  passed. Native Linux Toxiproxy carried all measured Registry traffic.
- Reusing an existing benchmark output was refused before modifying either the
  report bytes or proxy state; this prevents stale trace receipts from being
  paired with a fresh run.

Measurements are opt-in and uncached; they are not added to commit hooks or the
main integration gate. The full integration/E2E gate was not run for this
investigation, and these changes have not been merged or pushed to main.
Native macOS/Windows proxy execution remains unverified here. Future integration
must use the existing main-only gate and applicable CI assurance.
