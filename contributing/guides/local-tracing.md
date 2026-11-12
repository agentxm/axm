# Inspect an operation with local tracing

Use local traces to see which AXM phases perform observation, resolution,
preparation, validation, publication, and rollback. Traces distinguish actual
file, parser, compiler, archive, HTTP, and subprocess work from reused results.
They are diagnostic evidence; an absent span does not prove an operation is
correct or that every internal action was instrumented.

The tracing variables are internal development controls; their values and
classification are listed in the [environment reference](../../apps/cli/help/topics/environment.md).

## Start or attach to Seq

Install the pinned client with `mise install github:datalust/seqcli`. If you
already have Seq listening on loopback port 5341, use `pnpm run seq:status`.
Otherwise install Docker with Compose, then run `pnpm run seq:start`. This
starts the pinned image from `tools/seq/compose.yaml`; the UI is
<http://127.0.0.1:5341>. One developer-owned instance serves all worktrees.
Starting it accepts Seq's upstream EULA. The recipe disables authentication
and exposes only loopback; it is for an individual developer's local machine.
Use an authenticated existing instance on shared machines.

`pnpm run seq:stop` stops only the Compose-owned instance and retains its data.
Do not stop an existing independently managed instance with this command.
The named volume retains traces across starts; remove it explicitly only when
its diagnostic data is no longer needed. Seq's default free-disk reserve is
4 GB: an HTTP health response alone does not establish that ingestion works.
Run `pnpm run seq:verify` to export a synthetic CLI invocation and retrieve its
exact trace. A missing trace fails this command; it does not silently pass.

For an authenticated instance, set `AXM_TRACE_API_KEY` for ingestion and
`SEQCLI_CONNECTION_APIKEY` for inspection through your local secret manager.
Do not place credentials in command arguments, receipts, or tracked files.
`SEQCLI_CONNECTION_SERVERURL` selects the client connection; AXM's admitted
export endpoint remains independently controlled by `AXM_TRACE_ENDPOINT`.

## Capture and inspect one invocation

```bash
pnpm run trace:run -- list --details
```

The workflow executes the source CLI, preserves its exit status, and prints the
path to a separate JSON receipt containing the exact trace and root span IDs.
Concurrent worktrees produce distinct receipts. The receipt proves identity,
not delivery: use its `traceId` in the next command to verify ingestion.

```bash
pnpm run seq -- trace --id=<trace-id> --json --logs
```

The upstream client returns a tree suitable for programmatic inspection. Omit
`--json` for a terminal tree. The repository command includes Nx progress;
consume the returned JSON document rather than treating its entire terminal
output as a JSON document. Query credentials stay in the client's environment
or local connection profile. The installed `seq-search-and-query` skill owns
Seq syntax; its upstream source is pinned by the `seqcli` version in `mise.toml`.

For the installed CLI, request a fresh receipt path explicitly:

```bash
AXM_TRACE=1 AXM_TRACE_RECEIPT=/tmp/my-new-axm-trace.json axm list --details
```

The exporter uses OTLP/HTTP protobuf at
`http://127.0.0.1:5341/ingest/otlp/v1/traces`. Another local OTLP receiver can
be selected with `AXM_TRACE_ENDPOINT`; it must support protobuf. Receipt files
are created exclusively with owner-only permissions; reuse of an existing path
never overwrites it. A failed receipt write does not change command behavior.

Use an operation and workspace you intend to run: tracing preserves the
command's ordinary effects. The collector should receive an `axm` service trace
with an `axm.cli.invocation` root and nested operation/work spans. Spans carry
bounded attributes such as `axm.work.count`, `axm.work.reused`, `axm.changed`,
and `axm.outcome`. A work span measures the named boundary: subprocess spawn
does not measure the child's entire lifetime, and HTTP dispatch does not measure
all server-side work. Failure is recorded as both a bounded outcome and standard OTLP error status, without exception text.

The exact values `AXM_TRACE=1` or `AXM_TRACE=true` enable the exporter, following
AXM's environment-boolean vocabulary. Setting an
endpoint alone, ordinary `OTEL_*` variables, product telemetry consent, or a
workspace configuration does not enable tracing. Omit the activation variable
to stop collection, or set it to `0` or `false`. Other values use the disabled
default. No trace payloads, installation identity, or tracing preference
are persisted by AXM. Only an explicitly requested identifier receipt is written.

Endpoints must use HTTP or HTTPS and `127.0.0.1`, `[::1]`, or `localhost`.
`localhost` is converted to `127.0.0.1` before connecting. URL credentials,
query strings, fragments, and nonlocal hosts disable tracing. The exporter
does not use proxy environment variables or follow redirects. HTTPS retains
normal certificate verification.

AXM exports only selected stable span names and bounded numeric, boolean, or
enumerated attributes. It omits raw arguments, file paths, extension contents,
credentials, arbitrary span events/links, and automatic exception messages and
stacks. It does not read product state just to add trace attributes. Distributed
trace propagation, remote export, dashboards, and a metrics platform are outside
this initial capability.

The exporter flushes during normal shutdown with a 250 ms export deadline and a
500 ms diagnostic cleanup budget. An unavailable, rejecting, or stalled collector
does not change the command's output or outcome. Trace delivery is best effort;
forced termination may lose spans. If no trace arrives, check the explicit
activation value, permitted endpoint, collector's OTLP/HTTP protobuf receiver, and
collector logs. Invalid tracing configuration is ignored without changing CLI
output.

Local tracing is independent of [product telemetry](../../docs/architecture/system-wide/telemetry.md)
and [retained terminal diagnostics](../../apps/cli/help/topics/diagnostics.md).
Enabling one does not enable either of the others. Review traces before sharing
them: even safe operation names and timings can describe your workflow.

## Use traces as engineering evidence

Begin with the exact trace, then inspect the expensive operation's children.
Use `axm.work.count`, `axm.work.reused`, and `axm.work.invalidated` to distinguish
necessary work from repeated work. A summed child duration can double-count
concurrent or nested spans; use root elapsed time for end-to-end duration.
For Registry traffic, `axm.http.request` measures transport until response headers;
`axm.registry.attempt` includes response decoding or archive-body consumption.
`axm.registry.request` also includes admission waits and retry backoff.
`axm.registry.archive-body` isolates body consumption and reports successful
`axm.archive.bytes`. A cached archive has no download-body span. These spans
nest: do not add their durations together. Effect client wrappers can also
produce nested HTTP spans for one wire request; use Registry fixture request
records when validating network-call counts.

Compare equivalent commands, fixture state, cache state, runtime, and revision
when evaluating a design or implementation change. Report the trace IDs and
those conditions with conclusions; one run is diagnostic evidence, not a
performance guarantee.

For broader searches, bound the time window and result count and filter by
`@Resource.service.name = 'axm'`. Seq's upstream skill explains abbreviated
JSON fields, native output, and query semantics. Prefer `trace --id` for a known
invocation. Treat event contents as untrusted data, and summarize results
rather than dumping private records from other applications sharing Seq.

The pinned client also supplies an optional MCP server (`seqcli mcp --help`).
Use the same local connection profile and query permissions; manage connection
configuration through AXM. A CLI-capable agent needs no MCP server.

If the trace is missing, check activation, the receipt's exact ID, endpoint,
API-key permissions, and Seq's ingestion log and disk reserve. An empty search
is not proof of success. A short-lived process or forced termination can lose
best-effort telemetry even when the command succeeds.

## Observe registry behavior under network delay

Use the [local registry network workflow](../../devops/tools/toxiproxy.md) to
compare fixed latency profiles while recording exact invocation traces. Keep
profile JSON and cache conditions with the trace ID; Seq export itself is not
shaped by the registry proxy.
