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
