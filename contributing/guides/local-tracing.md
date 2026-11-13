# Inspect an operation with local tracing

Use local traces when designing, developing, or troubleshooting a CLI operation
to locate elapsed time, physical work, reuse, and waits. Capture one invocation,
retrieve its exact trace, and check completeness before drawing a conclusion.
The [coverage and evidence ledger](../../benchmarks/evidence/local-observability/README.md)
records verified claims and remaining gaps. Source instrumentation and a
successful retrieval do not establish complete coverage of an operation.

Tracing variables are internal development controls, classified in the
[environment reference](../../apps/cli/help/topics/environment.md).
Use the [repository task interface](../../docs/guides/repository-task-interface.md)
for prerequisites and verification. Agent command environments set
`NX_TUI=false`, `NX_DEFAULT_OUTPUT_STYLE=static`, and
`NX_TASKS_RUNNER_DYNAMIC_OUTPUT=false`.

## Start or attach to Seq

Install the pinned client with `mise install github:datalust/seqcli`. If Seq
already listens on loopback port 5341, use `pnpm run seq:status`. Otherwise
install Docker with Compose, then run `pnpm run seq:start`. This starts the
pinned image from `tools/seq/compose.yaml`; the UI is <http://127.0.0.1:5341>.
One developer-owned instance serves all worktrees. Starting it accepts Seq's
upstream EULA. The recipe disables authentication and exposes only loopback;
it is for an individual developer's machine. Use an authenticated existing
instance on shared machines.

`pnpm run seq:stop` stops only the Compose-owned instance and retains its data.
Do not use it to stop an independently managed instance. The named volume
retains traces across starts; remove it explicitly only when its data is no
longer needed. Seq's default free-disk reserve is 4 GB: an HTTP health response
alone does not establish ingestion. `pnpm run seq:verify` exports a synthetic
CLI invocation and retrieves its exact trace; a missing trace fails the probe.
It first checks query access, including API-key authentication, before starting
the bounded capture. A fresh authenticated collector can otherwise spend the
short export window initializing its request path. The probe keeps the same
export and shutdown deadlines; setup success is separate from product captures.
The synthetic probe does not verify every product owner.

For authentication, set `AXM_TRACE_API_KEY` for ingestion and
`SEQCLI_CONNECTION_APIKEY` for inspection through your local secret manager.
Keep credentials out of arguments, receipts, and tracked files.
`SEQCLI_CONNECTION_SERVERURL` selects the query connection independently of
`AXM_TRACE_ENDPOINT`, which selects the admitted export endpoint.

## Capture source or compiled execution

Run the operation against a workspace you intend to use: tracing preserves the
command's ordinary effects. For source execution:

```bash
pnpm run trace:run -- list --details
```

The published workflow runs source, preserves the CLI exit status, and prints a
receipt path on stderr. Each run gets a new temporary directory, so concurrent
worktrees have distinct receipts. Default mode retains meaningful operation and
wait spans. Repeated I/O, parsing, hashing and reuse work updates bounded
owner aggregates directly; it does not construct a span for every occurrence.
The aggregates are exported as `axm.work.summary` logs correlated with the
owning span.

Select only the individual work intervals needed for an investigation:

```bash
AXM_TRACE_DETAIL=io,hash pnpm run trace:run -- list --details
AXM_TRACE_DETAIL=io,reuse AXM_TRACE_DETAIL_PHASE=planning pnpm run trace:run -- sync --preview
```

`AXM_TRACE_DETAIL` accepts comma-separated `io`, `parse`, `hash`, `reuse`,
`native`, `cache`, and `render`. Unset or empty selects summary mode. The
optional `AXM_TRACE_DETAIL_PHASE` further restricts detailed spans to a valid
operation phase: `resolution`, `planning`, `preview`, `confirmation`,
`validation`, `acquisition`, `apply`, `verification`, or `restoration`.
It requires at least one selected category. A command need not enter every
phase; unmatched work still contributes to aggregates. Invalid selections,
including the former `1` value, produce a `setup-failed` capture status and
leave the product command running without capture. Aggregate accounting is
independent of which detail categories or phase are selected.

Completed archive directory/member/manifest parsing facts remain aggregate-only,
including in parse detail. Their counts, entry totals, measured duration and
executing owner remain available; an individual primitive interval is not
claimed. Extraction intervals still have spans. Selected detail certifies the
declared retained span set, not a full history of every internal action.

For an installed executable, choose a fresh receipt path:

```bash
AXM_TRACE=1 AXM_TRACE_RECEIPT=/tmp/my-new-axm-trace.json axm list --details
```

To inspect the current compiled source on Linux x64, use the owning build target
and its output. Other supported hosts use the filename declared by
[the compiler](../../apps/cli/scripts/compile.ts).

```bash
pnpm exec nx run cli:compile-host
AXM_TRACE=1 AXM_TRACE_RECEIPT=/tmp/my-new-compiled-trace.json apps/cli/dist/host-bin/axm-linux-x64 list --details
```

Keep source and compiled results separate. Record revision, executable hash,
runtime, fixture, cache state, and mode with a performance claim. The source
workflow includes pnpm/Nx output; use the executable's own streams when checking
its machine-output contract.

Receipts use exclusive creation and owner-only permissions; an existing path
is never overwritten. Receipt failures leave product behavior unchanged. A
missing or unfinished receipt is missing diagnostic evidence, even when the
command succeeds.

## Verify and inspect the exact invocation

Use the receipt path printed by capture:

```bash
pnpm -s trace:inspect --receipt /tmp/axm-trace.EXAMPLE/receipt.json
```

The inspector retrieves the exact trace through the pinned Seq client. Stdout
is one compact JSON document, suitable for a shell pipeline or agent tool;
workflow progress goes to stderr. Diagnostic failure returns a bounded JSON
failure with exit status 1. This inspection status is separate from the earlier
product command's exit status.

To compare with independently recorded fixture work and then narrow the result:

```bash
pnpm -s trace:inspect --receipt /tmp/axm-trace.EXAMPLE/receipt.json --expect /tmp/expected-work.json --span-id 0123456789abcdef --max-nodes 100000
```

Replace the example span ID with an ID from this invocation. `--expect` accepts
nonempty `spans` and/or `work` arrays. Span expectations specify `name`, `count`,
and optionally `parentName`; work expectations specify `kind`, optional bounded
`dimensions`, `ownerName` and `ownerAttributes`, and exact counters such as `count`, `requested`, `executed`,
`reused`, `bytes`, `ioBytes`, or `archiveBytes`. Derive these from fixture/server,
filesystem, or process records, never from the trace being tested. The
[inspection schema](../../apps/cli/src/cli-runtime/local-trace-inspection.ts)
owns the complete input/output contract.
Selectors must use admitted attributes actually measured by the owner. An
absent required dimension or owner attribute is unknown and cannot satisfy even
a zero expectation; a measured contradictory selector can exclude a row.
Counters are nonnegative safe integers. Unmeasured metrics remain `null`.

The [versioned receipt](../../apps/cli/src/cli-runtime/local-trace-receipt.ts)
uses `schemaVersion: 2`. It identifies service, trace, root span, mode,
`detailSelection`, and required `commandRoute`, then records `producerComplete`,
`retainedSpanCount`, the sorted span-ID SHA-256, `aggregateEventCount`,
`aggregateEventsSha256`, and diagnostic loss counters. The aggregate digest
covers canonical admitted payloads, including ownership, dimensions, totals
and measurement coverage; timestamps and receiver-generated IDs are excluded.
`build` identifies version, revision, dirty state, source or compiled execution,
and runtime/version. The inspector checks these independently:

1. Producer accounting completed with no dropped spans or aggregate events,
   unrecognized AXM vocabulary, or summary-group overflow.
2. Seq returned a complete exact tree including correlated logs.
3. The root, parent relationships, unique span count, and span-ID hash match
   the completed receipt.
4. Aggregate event count and payload digest match the receipt; each aggregate
   is attached to its declared retained owner with matching resource identity.
5. Root resource identity and command route match the receipt. Other route
   attributes use that route or the bounded `unresolved` fallback.
6. Mode and unique detail categories agree; every primitive span belongs to a
   selected category and, when requested, has the selected phase in its ancestry.

The compact evidence labels detail coverage as
`detailCoverage: "selected-span-delivery-only"`. Its count and hash certify
delivery of the producer's selected spans, not a complete interval history of
every work occurrence. Aggregate-only facts remain valid accounting without
invented intervals; independent work expectations still establish required work.

The pinned Seq tree command caps retrieval at 10,000 events. The inspector keeps
that path for smaller declared captures and selects one projected query for
larger captures, bounded to the receipt's span and aggregate count plus one
overflow sentinel. Reaching that sentinel fails completeness. Both paths keep
the same 15-second deadline, 64 MiB output limit, and exact integrity checks.

Work `count` means finished observations, including failed or interrupted work;
`workCount` means owner-reported units. `batchItems`, `registryBatchItems`,
`archiveEntries` and `deniedItems` retain separate owner measurements. Do not
sum different ownership layers as if they were one physical operation.

Each work row's `measurements` preserves known totals and their coverage:
`{total, measured, occurrences}`. For example, two measured reads totaling 128
bytes among three observations retain that partial total with `measured: 2`
and `occurrences: 3`, while the convenient `ioBytes` total remains `null`.
A measured zero differs from an unknown value. Numeric independent expectations
require full measurement coverage; partial totals cannot establish zero work.
Duration uses the same coverage rule; `workDurationMs` is `null` when not every
observation was timed.

Aggregate metadata, measurement coverage and admitted dimensions are validated
by the [inspection schema](../../apps/cli/src/cli-runtime/local-trace-inspection.ts).
Only bounded aggregate logs are exported; general application logs are not
forwarded. Missing/invalid ownership, duplicate groups, malformed coverage or a
changed payload fails inspection. Unknown receiver attributes are filtered;
filtering does not prove producer admission.

A root alone proves none of these checks. Seq's `complete` flag does not prove
producer completeness. A completed receipt does not prove delivery or that an
owner emitted every required observation. Without independent expectations,
the inspector reports `expectations: "not-supplied"`.

An explicitly requested receipt may instead be a bounded status document:
`{schemaVersion: 2, service: "axm", captureState: "starting" | "disabled" |
"invalid-endpoint" | "setup-failed"}`. These states contain no trace identity or
completion claim. The inspector reports the corresponding failure before
querying Seq. `starting` means completion was not recorded; a missing or invalid
receipt reports `receipt-unavailable` and leaves capture status uncertain.
Ordinary disabled tracing creates no receipt unless one was explicitly requested.

The inspector verifies the full invocation before selecting a subtree. Traversal
is bounded by `--max-nodes` (1–100000); exceeding the bound fails inspection
instead of silently truncating. Its child-process calls have a 15-second
limit and a 64 MiB output limit. Keep the JSON summary, receipt, independent
expectations, and raw retrieval with the evidence record.

For a terminal tree or direct upstream inspection:

```bash
pnpm run seq -- trace --id=<trace-id> --json --logs
```

Omit `--json` for the terminal tree. This general Seq wrapper includes Nx
progress; its entire stdout is not a standalone JSON document. Use
`trace:inspect` for machine consumption. Query credentials stay in the
client's environment or connection profile. The installed `seq-search-and-query`
skill owns Seq syntax; the client is pinned in `mise.toml`.

## Interpret work and elapsed time

The root is `axm.cli.invocation`. The command boundary carries a validated
registered route, never raw arguments. `axm.operation.mode` identifies query,
preview, or apply, including flag-dependent behavior such as `lint --fix`.
Early parsing failures use a bounded unresolved identity. Operation outcome,
process exit, and diagnostic delivery are separate facts.

| Evidence                                              | Interpretation                                                                                                                                                                                                    |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `axm.operation.phase`, `axm.operation.wait`           | Phase spans enclose actual executing work; existing lifecycle wait events delimit reported waits. Private plan names, details and wait subjects are omitted.                                                      |
| `axm.work.summary`                                    | Correlated log containing direct owner aggregates; selection of detailed spans does not change work accounting.                                                                                                   |
| `axm.io.*`                                            | Physical filesystem adapter calls, including live reads that bypass an observation view.                                                                                                                          |
| Observation, parsing, hashing, and cache work         | Logical work or reuse decisions; do not add these to physical I/O counts to calculate system calls.                                                                                                               |
| `axm.registry.request`                                | Logical request, including admission waits and retry backoff.                                                                                                                                                     |
| `axm.registry.attempt`                                | One attempt, including response decoding or archive-body consumption.                                                                                                                                             |
| `axm.http.request`                                    | Base-transport exchange until response headers; check counts against the fixture server's request log.                                                                                                            |
| `axm.registry.archive-body`                           | Archive-body consumption and successful byte counts; a cache hit does not download a body.                                                                                                                        |
| `axm.wait.*`, `axm.registry.retry-wait`               | Resource, lock, or retry delay at its owner.                                                                                                                                                                      |
| `axm.admission.*`                                     | Completed permit/ledger admissions, including uncontended ones; aggregate counts, capacity units and measured duration. Native detail selects individual intervals. This is not a blocked-wait count or duration. |
| `axm.native.lock-*`                                   | Native lock attempts, cleanup and callback I/O. Summary aggregates these primitives; native detail can expose individual intervals. Proven contention remains a separate wait.                                    |
| `axm.process.run`, `axm.process.spawn`                | Child lifetime and nested spawn; spawn time alone is not subprocess execution time.                                                                                                                               |
| Publication, receipt verification, and rollback spans | Consequential mutation boundaries, with distinct evidence needed for no-op, conflict, failure, interruption, and restoration paths.                                                                               |

Use root elapsed time for the instrumented invocation interval. Nested and
concurrent children overlap; summing them double-counts time. Inspector
`workDurationMs` is accumulated work duration, not wall-clock elapsed time.
Aggregate logs are emitted at completion; their timestamps are not new work
intervals. Selected detail spans expose individual work intervals, including
rendering when requested. The receipt's completed `timings` report
`startupMillis`, `executionMillis`, `runtimeElapsedAtExecutionEndMillis`, and
`exportFinalizationMillis`. Startup and elapsed-at-execution-end use the runtime's
process uptime; execution and export intervals use a monotonic clock. Startup
includes work before the root span, including source loading within that process.
The surrounding package-manager/Nx workflow is outside the CLI process interval.
`exportFinalizationMillis` excludes the last receipt write and descriptor close,
so it is not the full process cleanup duration.

Measure complete process elapsed with an independent monotonic parent clock.
For the cleanup budget, subtract `runtimeElapsedAtExecutionEndMillis` from that
external elapsed time. This is a conservative upper bound: it includes launch
before the runtime clock and process teardown after receipt finalization. Do not
subtract arbitrary child totals or call summed work duration elapsed time.

Owner-declared existence probes may have bounded `expected-absence`
classification inside a successful command. Missing required or unclassified
input remains `not-found`. Check process and operation outcomes before
interpreting a child failure. Unmeasured counters are `null`, distinct from an
observed zero; they cannot satisfy a numeric independent expectation. Counters describe their owning boundary:
requested, executed, reused, invalidated, and byte totals need independent
checks before they become a performance baseline. An injected duplicate
exchange, omitted live read, or wrong reuse decision should fail that comparison.

The [export policy](../../apps/cli/src/cli-runtime/local-trace-policy.ts) owns
admitted names, attributes, and volume limits. Adding instrumentation requires
a producer and an admitted bounded vocabulary. A missing owner cannot be
repaired by adding a summary label.

## Diagnose incomplete evidence

Summary and detail modes have finite span and aggregate-group limits. A hit records
loss and cannot produce verified complete evidence. Use a smaller fixture or a
separately justified limit change, preserving the incomplete result as such.

| Symptom                                           | Next check                                                                                                                                             |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| No receipt                                        | Explicit activation, allowed endpoint, fresh writable path, and whether the process reached normal completion.                                         |
| `disabled`, `invalid-endpoint`, or `setup-failed` | Inspect the bounded capture status; no completed trace is claimed and the inspector does not query Seq.                                                |
| `starting`                                        | Capture began without a final receipt; interruption or receipt failure remains possible.                                                               |
| `producerComplete: false`                         | Unclosed work, cleanup interruption, or forced termination; preserve product exit separately.                                                          |
| Nonzero loss counters                             | Span/group caps, exporter setup, or unadmitted AXM producer vocabulary.                                                                                |
| `trace-not-found`                                 | The pinned client found no events for this exact receipt ID. Check ingestion and bounded exporter completion; product success does not prove delivery. |
| `seq-unavailable`                                 | The client could not establish retrieval. Check connection, query credentials and receiver health; no raw client error is disclosed.                   |
| Missing trace or incomplete Seq tree              | Ingestion credentials, receiver logs, disk reserve, and delivery delay; retry by the same exact ID.                                                    |
| Count/hash or topology mismatch                   | Lost/duplicated spans or aggregate logs, changed aggregate payloads, wrong receipt, or malformed retrieval; reject evidence.                           |
| Independent expectations fail                     | Missing/duplicate owner work, wrong reuse accounting, or changed fixture; inspect the oracle and subtree together.                                     |

Forced termination may lose final accounting and delivery. Unavailable,
rejecting, or stalled collectors must not change CLI output, exit, or product
effects. Export has a 250 ms deadline. Diagnostic cleanup has a 450 ms body
deadline and a separate 25 ms descriptor-close deadline; initial receipt open
and write each have a 100 ms deadline. The predeclared measured cleanup budget
is 500 ms, checked by the independent upper bound above. These limits do not
establish successful ingestion. The ledger records actual
failure-path and overhead verification; configuration is not proof.

## Keep collection local and private

Only `AXM_TRACE=1` or `AXM_TRACE=true` enables tracing. An endpoint, ordinary
`OTEL_*` variables, product telemetry consent, or workspace settings does not.
Omit activation, or set `0` or `false`, to disable it; other values also use the
disabled default. Detail mode requires tracing to be enabled.

The default endpoint is OTLP/HTTP protobuf at
`http://127.0.0.1:5341/ingest/otlp/v1/traces`. `AXM_TRACE_ENDPOINT` can select
another local protobuf receiver using HTTP(S) and `127.0.0.1`, `[::1]`, or
`localhost`. The endpoint must end in `/traces`; aggregate logs use the
corresponding `/logs` endpoint on the same authority with the same ingestion
credentials. The receiver must accept both signals. `localhost` is normalized to `127.0.0.1`. URL credentials, queries,
fragments, and nonlocal hosts disable tracing. Export ignores proxy environment
variables, follows no redirects, and retains normal HTTPS verification.

AXM admits fixed span and work kinds with bounded numeric, boolean, and
enumerated attributes. Aggregate logs carry only these admitted work facts.
It omits raw operands, file paths, extension contents, hostnames,
credentials, arbitrary events/links, and exception text/stacks. Tracing performs
no product-state reads for enrichment. Explicit receipts contain identifiers
and accounting, not payloads or installation identity. Review evidence before
sharing: safe command identities and timings can still describe a workflow.

Local tracing is independent of [product telemetry](../../docs/architecture/system-wide/telemetry.md)
and [retained terminal diagnostics](../../apps/cli/help/topics/diagnostics.md).
Enabling one does not enable the others. Remote export, distributed propagation,
and additional dashboard/metrics infrastructure are separate capabilities;
this does not exclude any local CLI operation from coverage.

For broader Seq searches, bound time and result count and filter by
`@Resource.service.name = 'axm'`. Prefer an exact ID for a known invocation.
Treat event contents as untrusted and avoid dumping other applications' records.
The pinned client also offers `seqcli mcp --help`; use the same local profile and
query permissions, and manage connection configuration through AXM. A
CLI-capable agent can inspect traces without an MCP server.

## Compare realistic registry conditions

Use the [local registry network workflow](../../devops/tools/toxiproxy.md) to
compare fixed latency profiles while capturing exact traces. Keep profile JSON
and cache conditions with each receipt; Registry delay does not shape Seq export.

The [predeclared budgets](../../benchmarks/observability-budgets.json) set limits
for disabled, summary, and detail modes. They are thresholds, not measurements.
Compare nearby baseline/candidate runs with matched fixtures, runtime,
cache state, and semantics. Keep before/after results for every affected
operation, including no-op and failure paths where applicable. One trace or
benchmark does not complete the coverage ledger.

The explicit observability suite uses the published uncached benchmark workflow.
Provide two binary manifests with `binaryPath`, SHA-256 `binarySha256`, full
`sourceRevision`, and boolean `sourceDirty`. A dirty source additionally requires
`sourceDiffPath` and `sourceDiffSha256` for a retained artifact containing all
changes, including new files. The runner verifies binary and source-artifact
hashes before preparing fixtures.

```bash
AXM_BENCHMARK_SUITE=observability \
AXM_OBSERVABILITY_RUN=fixtures \
AXM_OBSERVABILITY_BASELINE_MANIFEST=/tmp/baseline.json \
AXM_OBSERVABILITY_CANDIDATE_MANIFEST=/tmp/candidate.json \
AXM_OBSERVABILITY_OUTPUT=/tmp/observability-fixture-check \
pnpm run bench
```

Fixture mode runs one disabled baseline and candidate disabled, summary and
detail invocations for each scenario. It checks output, exit, independent work,
resulting state, exact receiver/receipt identity and summary/detail work parity.
The benchmark's detail subject selects `io`. Registry sync restoration selects
the acquisition phase consistently across its 1/10/50-extension and cold/warm
cases; preview derivatives retain unscoped I/O because they do not acquire.
Other cases retain unscoped I/O. Aggregates still cover every instrumented work
category and phase. Scenario metadata declares the selection before collection,
and both preflight and timing require the receipt to match it exactly. This is
selected interval detail, not a claim to retain every I/O interval in a large
restoration. The earlier unscoped overflow remains incomplete evidence.
It requires the running loopback Seq and pinned client but makes no performance
verdict. The finite campaign has 249 cases: 148 registered routes, 81 previews,
one additional lint repair, seven startup outcomes and 12 distinct risk paths.
Its preflight schedules 996 workload invocations and 498 full trace inspections.
`AXM_OBSERVABILITY_SCENARIO_FILTER` may narrow a diagnostic fixture run using
comma-separated scenario substrings; it never filters a measured campaign.

For measurement, use a fresh output directory, set
`AXM_OBSERVABILITY_RUN=measure`, and declare
`AXM_OBSERVABILITY_REFERENCE_HOST=1` only after isolating the Linux x64 reference
host. The run first completes full preflight, then measures every case without
filtering. Each timing block has one baseline and candidate disabled, summary
and detail runs in rotated order. All three candidates reference that block's
single baseline. One warmup and five initial measured blocks schedule another
5,976 workload invocations: 6,972 including preflight. Discovery and fixture
preparation invocations are recorded separately. These counts imply no promised
wall-clock duration.

Timing keeps export active, retains raw outputs, essential operation/request
checks, elapsed time, RSS and producer receipts, and checks zero diagnostic loss
and shutdown limits. It does not repeat full filesystem inventories, Seq
inspection or per-sample compression. Timing receipts explicitly report delivery
as `not-individually-inspected`; they do not claim receiver completeness. There
are 3,486 traced workload invocations initially: 498 inspected in preflight and
2,988 with producer receipts during timing.

Escalate an individual case from five to ten measured blocks when any subject's
range/median exceeds 20% or the first-two versus last-two baseline medians drift
more than 10%. This applies regardless of the initial median result. For stable
passing results, also escalate when remaining headroom is at most 20% of the
allowed **overhead** margin, or paired block comparisons fall on both sides of
the existing bound. Stable median regressions fail without retrying to pass.
Each escalation adds 20 invocations and retains all initial observations. Noise
or drift remaining at ten makes the result inconclusive. Correctness, memory,
volume and shutdown failures are handled separately; thresholds are unchanged.
This method applies only to the observability campaign. The accepted compiled
`list` latency specification and its independent performance target retain their
own sampling and gates.

Risk cases cover unchanged upgrade, no-op/warm restoration, successful and
refused adoption, representative path/Git work, one slow network profile, 10-item
fan-out and one 50-item volume check. “Cold” means AXM archive-cache cold, not
OS page-cache cold. Authentication uses a loopback Registry; changed upgrade
uses an isolated package-manager executable fixture. Startup refresh uses the
actual fixed release URL through a loopback CONNECT fixture restricted to that
host, with an ephemeral CA trusted only by the child. It never forwards to the
public release service or changes system trust. Valid Hook ownership receipts
are prepared at each sample's actual workspace path before measurement.

Known failures are explicit additional scenarios with a declared exit code and
an independent semantic/state verifier; an arbitrary nonzero exit always
fails collection. Acquired adoption includes successful disabled-package
movement and the existing enabled-native ownership refusal, with retained
content and partial-restoration checks: settings/lock are restored, acquired
content remains moved into authorship, and original recovery snapshots are
verified and retained. The latter records current behavior and does not
accept it as the desired product outcome.

The independent expectations use actual Registry request records, archive body
bytes, authentication endpoint/purpose records, and maintenance/Hook executable
records. They do not infer expected counts from the trace. Filesystem snapshots
prove compared state, not physical read counts; port-level tests supply that
separate evidence. Unmeasured body bytes remain unknown. Only the validated
`plan-result-v4` `result.evaluatedAt` field and explicitly verified maintenance
and Hook timestamps are projected after checking their invocation interval.
Adoption recovery paths are projected only after exact structure and recovered
byte checks. Candidate identity and unrelated fields remain significant.

Machine progress is schema-validated before comparison. The original sequence
must be contiguous and each unit's causal order must be valid. Independent
Registry acquisition units may interleave differently between runs, so their
ordered per-unit facts are compared within each acquisition segment. Phase
changes and non-unit events remain ordered barriers; apply progress and human
output retain their order. Every fact and raw event remains retained. The report
records this comparison rule alongside timestamp and fixture-root projections.

Completed memo reuse can occur while the shared result is pending (`coalesced`)
or after completion (`hit`), depending on scheduling. Cross-run comparison treats
these as equivalent only for the five declared memo owners when each successful
occurrence has fully measured requested/reused counts of one and executed count
of zero. All other dimensions, ownership, bytes and measurement coverage remain
strict. Archive disk-cache reads and failed, interrupted or incompletely measured
reuse do not qualify. Individual traces, receipts and inspections retain the
original labels and exact payloads; the report declares this comparison projection.

Successful native lock-heartbeat `stat` and `utimes` calls depend on actual lock
hold time and timer scheduling. Their fully measured counts and ownership remain
exact in each inspection and in `trace.periodicMaintenance`; they are reported
separately from deterministic cross-run work equality. Failed or incompletely
measured heartbeats and all other native work remain in the strict comparison.
The owning lock test independently observes actual heartbeat/mtime refresh with
tracing enabled and disabled. This distinction does not permit missing accounting
or a performance claim from unequal-duration diagnostics.

Preflight fixtures retain raw before/after native-directory receipts through the
shared receipt capture. Independent filesystem checks distinguish unchanged
inherited proofs from new or refreshed live identities, validating each entry
against its actual path, aliases and metadata. Only the inode and creation-time
fields of those independently validated live identities may be projected for
cross-run comparison. Inherited proofs remain strict.

The exact `.axm/tmp` creation-history record can remain after its empty directory
is retired. That separate historical case requires matching live ancestors,
confirmed absence, the expected directory/alias shape and creation time inside
the invocation. Its inode and creation time use a distinct historical marker;
the removed entry is explicitly not post-stat verifiable. Arbitrary missing
directories cannot qualify as history. Devices, permissions, paths, aliases,
ownership, ordering and every unrelated field remain strict in both cases.
Raw receipts and classifications are retained; this audit runs only in preflight.

The [evidence ledger](../../benchmarks/evidence/local-observability/README.md)
records completed captures and their provenance. This comparison rule does not
certify an uncompleted capture or relax product identity checks.

Keep `report.json`, raw-artifact hashes, receipts and independent oracle records.
`harness-modules.json` identifies the complete statically resolvable module
closure, including public fixture implementations and explicit unavailable
optional dependency references; the dependency lockfile is hashed separately.
Completed preflight artifacts use lossless `.gz` files, verified before originals
are removed; timing artifacts remain raw during the timing blocks; `compression.json` records hashes and sizes. `sample.json`, receipts
and expectations remain JSON. The report records aggregate artifact growth.
Filesystem snapshots retain inventories and hashes. Files whose comparison
projects a validated volatile field also retain original bytes under
`raw-projections`; the projection description names the exact field and check.
Check free storage and Seq's disk reserve before collection; compression does
not reduce the receiver's retained data. Disk-pressure ingestion failures remain
incomplete evidence. The ledger distinguishes fixture smoke, final candidate
verification and measured budget results.

The preflight retains process names and IDs, CPU time/load, memory and available
artifact-filesystem space before and after each child; timing retains these facts
before and after each block. It records no argument
vectors or environment values. These observations support contention review;
the declared isolated-host flag alone is not proof. Record receiver free-space
and ingestion-health observations separately and pause other task graphs and
CLI work during measurement. Leave unrelated services untouched. Full traced
fixture retrieval sizes describe preflight artifacts; timing still ingests spans.
Neither JSON sizes nor compression establishes Seq's on-disk growth or replaces
a receiver capacity check.
