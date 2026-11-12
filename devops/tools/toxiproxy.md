---
type: Tool
title: Toxiproxy for local registry development
description: Worktree-owned loopback network profiles for observing AXM registry latency, concurrency, and archive transfers.
status: draft
---

# Toxiproxy for local registry development

Use Toxiproxy to put controlled network delay between the source or compiled AXM
CLI and a running local HTTP registry. The pinned native distribution in
[mise.toml](../../mise.toml) avoids container-to-host routing and supports local
registries that listen only on loopback. This is development tooling, not a CLI
runtime dependency. Repository maintainers own its profiles and upgrades.

The controller and its proposed executable specification are under
[scripts/registry-network](../../scripts/registry-network/control.ts) and
[registry-network.spec.ts](../../scripts/registry-network.spec.ts). Native Linux x64 installation and fixed-profile Registry traffic have been
exercised locally. Cross-platform behavior remains a platform verification
obligation; the in-memory controller tests do not establish native portability.

## Start the control server

Install the pinned native tools with:

```bash
mise install github:Shopify/toxiproxy
pnpm run registry:network:serve
```

Keep that terminal open. The server binds its control API to `127.0.0.1:8474`.
One server can serve several worktrees. It owns no registry or Seq lifecycle;
Ctrl-C in its terminal stops the server and all its proxies. Do not stop a shared
server while another worktree needs it. The control API is unauthenticated and
must remain loopback-only.

## Shape a local registry connection

Start your local registry separately. The following assumes it serves HTTP on
port 8787; substitute its actual origin. In another terminal, from this worktree:

```bash
pnpm run registry:network -- start --upstream http://127.0.0.1:8787 --profile typical
pnpm run registry:network -- status --json
```

The returned JSON identifies the worktree-owned proxy, upstream, listener,
profile and actual toxics. The default listener is `http://127.0.0.1:18080`;
use `--port 18081` for a second worktree. Names derive from the canonical
worktree root; moving a worktree changes its identity, so stop its proxy first.
Start refuses to replace an existing proxy. A failed configuration attempts to
remove the new proxy; if the API becomes unreachable, inspect status after
recovery and stop any remaining proxy before using it.

Configure a disposable development workspace to select the returned origin as
its Registry using the existing [Registry settings](../../apps/cli/help/topics/settings.md).
The workflow does not edit settings, lock state, or credentials. Keep the proxy
origin stable across profile comparisons: credentials and accepted resolutions
are bound to registry origins. Use local registry credentials. A local registry
that advertises absolute endpoints must advertise the proxy origin consistently;
the TCP proxy does not rewrite URLs, authentication audiences or response bodies.
Downloads or dependencies addressed to other origins bypass this proxy.

The upstream and control API must be loopback HTTP origins without paths,
credentials, query strings or fragments. HTTPS and remote registries are outside
this workflow. `AXM_REGISTRY_NETWORK_API` can select another loopback control
server started separately; `registry:network:serve` always uses port 8474.

## Profiles and measurements

| Profile       | Delay on each stream | Jitter on each stream | Download limit          |
| ------------- | -------------------- | --------------------- | ----------------------- |
| `baseline`    | None                 | None                  | None                    |
| `typical`     | 50 ms                | None                  | None                    |
| `slow`        | 150 ms               | None                  | None                    |
| `variable`    | 50 ms                | ±25 ms                | None                    |
| `constrained` | 50 ms                | None                  | 512 KB/s per connection |

These are illustrative conditions, not measured production distributions.
Latency is applied upstream and downstream. The resulting operation duration
also depends on request sequencing, buffering, connection reuse and local work;
this is not a promise of precisely 100 ms per HTTP request. Bandwidth is limited
per connection, not across all concurrent downloads. Jitter is nondeterministic.
[Toxiproxy's documentation](https://github.com/Shopify/toxiproxy#toxics) owns the
underlying behavior and API.

Use fixed profiles for before/after comparisons. Record revision, profile JSON,
fixture size, cold or warm cache state, request counts, concurrency, bytes, and
repeated elapsed-time samples. Compare against the same proxy with `baseline`
so proxy overhead is present in both measurements. Use `variable` for exploratory
UX work, not regression thresholds. Model server processing delays, 429/503
responses and Retry-After in the registry fixture separately.

Capture the operation using [local tracing](../../contributing/guides/local-tracing.md)
and inspect the exact invocation in Seq. Only registry traffic addressed to the
proxy is shaped: OTLP export and the control API remain outside it. Retain the
profile JSON alongside the trace ID. HTTP dispatch spans end before body
consumption; use the complete Registry request, attempt, and archive-body spans
described in the tracing guide for transfer timing.

Nx prints launcher progress around results. For a standalone JSON document in
an agent harness, invoke the implementation from the repository root:

```bash
bun scripts/registry-network.ts status --json > /tmp/registry-network-status.json
```

This is the documented diagnostic path for machine output; Nx remains the owning
workflow. A healthy control API or successful profile setup proves configuration,
not upstream availability or registry behavior. Exercise an intended registry
operation through the listener to establish those properties.

## Repeat the operation matrix

With the control server and Seq running, use the owning workflow:

```bash
pnpm run bench:registry-network
```

It builds the host CLI and runs a synthetic loopback Registry through a separate,
temporary proxy. It measures `list`, remote `view`, explicit single-extension
`install`, no-op `sync`, restoring `sync`, and `update` in a workspace configured
with ten skills. It rotates baseline/typical/slow profiles, makes three untraced
samples per condition, and captures one additional trace per condition. Cold and
warm refer to the archive cache; OS page caches are uncontrolled. Every sample
uses a fresh process and copied disposable workspace.

The output defaults to `test-results/benchmarks/registry-network.json`, with exact
trace receipts in the sibling `.receipts` directory. Existing output or receipts
are refused; choose an unused `AXM_NETWORK_OUTPUT` for each run so old trace IDs
cannot be mistaken for new evidence. The report contains the
binary hash, source revision and dirty state, host, actual proxy settings, elapsed
times, request counts, body bytes, and server request intervals. `complete: false`
means the run is partial and must not be treated as a complete matrix. Server
intervals exclude the proxy's downstream delay; use spans for client timing.

Environment options are `AXM_NETWORK_BINARY` (a preserved comparison binary),
`AXM_NETWORK_OUTPUT`, `AXM_NETWORK_REPETITIONS` (1–10), `AXM_NETWORK_SIZES`
(comma-separated selections from 1,10,50), and `AXM_NETWORK_PORT` (default 18089).
`AXM_REGISTRY_NETWORK_API` selects the existing control server. A binary override
still runs the target's build prerequisite; preserve the baseline binary outside
the build output. The source revision describes the launching checkout; with a
binary override, retain its producing revision alongside the recorded binary
hash. Do not run builds or other benchmarks concurrently with timing.
The synthetic Registry models 100 ms archive body processing and illustrative
network profiles; it does not reproduce production TLS, DNS, payload sizes,
authentication, database load, or internet behavior.

## Change profiles and clean up

```bash
pnpm run registry:network -- stop
pnpm run registry:network -- start --upstream http://127.0.0.1:8787 --profile slow
# When finished:
pnpm run registry:network -- stop
```

Stop deletes only this worktree's proxy, is idempotent when it is already absent,
and leaves other worktrees and the control server alone. It does not restore a
workspace's Registry selection. In disposable workspaces, preserve any evidence
before discarding them; in retained workspaces, explicitly restore the intended
Registry settings. Stop the foreground server only when its other users are done.

For a bind failure, choose an unused listener port; do not terminate the process
already using it. For an unexpected profile, status reports
`custom-or-incomplete` and includes the actual toxics. Before upgrading the pin,
review upstream protocol and release assets, then exercise setup, real registry
traffic, partial-setup cleanup and isolation on the supported host platforms.
