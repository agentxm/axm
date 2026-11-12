# Inspect an operation with local tracing

Use local traces to see which AXM phases perform observation, resolution,
preparation, validation, publication, and rollback. Traces distinguish actual
file, parser, compiler, archive, HTTP, and subprocess work from reused results.
They are diagnostic evidence; an absent span does not prove an operation is
correct or that every internal action was instrumented.

The tracing variables are internal development controls; their values and
classification are listed in the [environment reference](../../apps/cli/help/topics/environment.md).

Start an OTLP/HTTP JSON receiver on your own loopback interface, then activate
tracing for the command you want to inspect:

```bash
AXM_TRACE=1 axm list --details
```

The default endpoint is `http://127.0.0.1:4318/v1/traces`. For a collector using
another local port:

```bash
AXM_TRACE=1 \
  AXM_TRACE_ENDPOINT=http://127.0.0.1:14318/v1/traces \
  axm sync --preview
```

Use an operation and workspace you intend to run: tracing preserves the
command's ordinary effects. The collector should receive an `axm` service trace
with an `axm.cli.invocation` root and nested operation/work spans. Spans carry
bounded attributes such as `axm.work.count`, `axm.work.reused`, `axm.changed`,
and `axm.outcome`. A work span measures the named boundary: subprocess spawn
does not measure the child's entire lifetime, and HTTP dispatch does not measure
all server-side work. Failure is recorded as an outcome without exception text.

The exact values `AXM_TRACE=1` or `AXM_TRACE=true` enable the exporter, following
AXM's environment-boolean vocabulary. Setting an
endpoint alone, ordinary `OTEL_*` variables, product telemetry consent, or a
workspace configuration does not enable tracing. Omit the activation variable
to stop collection, or set it to `0` or `false`. Other values use the disabled
default. No trace files, installation identity, or tracing preference
are persisted by AXM.

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
activation value, permitted endpoint, collector's OTLP/HTTP JSON receiver, and
collector logs. Invalid tracing configuration is ignored without changing CLI
output.

Local tracing is independent of [product telemetry](../../docs/architecture/system-wide/telemetry.md)
and [retained terminal diagnostics](../../apps/cli/help/topics/diagnostics.md).
Enabling one does not enable either of the others. Review traces before sharing
them: even safe operation names and timings can describe your workflow.
