---
okf_version: "0.2"
---

# Effect v4 knowledge

Opinionated guides for building with Effect v4 in TypeScript: how to model data
and failure, structure services, own lifetimes, integrate with platforms, and
verify the result. Each guide opens with the conditions it applies to and what
it deliberately leaves alone, so you can route from a symptom rather than a
topic.

Guidance targets **Effect 4.0.0-rc.110**. Guides that make version-specific API
claims mark them inline; the rest describe design decisions that outlast a
prerelease. Effect v3 conventions do not carry forward and are not documented
here.

Every concept here is `type: Guide` — normative decision guidance consulted
while making a judgment. `Playbook` is reserved for step-wise procedures, which
this bundle does not yet contain.

The `craft-effect-v4` skill routes work through these guides.

## Model data

* [Schema boundaries](schema-boundaries.md) - Designing the line between
  unknown, encoded, and domain values and choosing the domain carrier; use
  when JSON is cast, validation is duplicated, or constructors bypass
  invariants.
* [Branded types](branded-types.md) - Preventing invalid primitive
  substitution; use when IDs or units share representations or raw scalars
  cross meaningful boundaries.
* [Option](option.md) - Modeling meaningful absence and translating nullable
  boundaries; use when lookups can miss without failing, null checks repeat,
  or schemas encode nullish fields.
* [Collections](collections.md) - Choosing among Array, Chunk, Record, and
  HashMap; use for unsafe indexing, value-based keys, or multi-pass array code.
* [Optics](optics.md) - Reusable immutable reads and updates; use when nested
  paths repeat, updates target optional data or union variants, or focus logic
  should compose across modules.

## Model failure

* [Error modeling](error-modeling.md) - Keeping expected failure, defects, and
  interruption distinct; use for throws, `catch (unknown)`, stringified
  failures, broad recovery, or indiscriminate retry.
* [Wrapping](wrapping.md) - Turning Promise, callback, and synchronous
  foreign APIs into truthful Effect boundaries; use for raw promises, thrown
  `unknown` failures, cancellation that must propagate, and vendor SDKs
  becoming injectable capabilities.

## Structure the application

* [Services and layers](services-and-layers.md) - Designing service boundaries
  and Layer graphs; use when dependencies are threaded through parameters,
  hidden in globals, or hard to replace in tests.
* [Config](config.md) - Centralizing typed, validated configuration; use when
  code reads `process.env`, repeats defaults, starts before validation, or
  mishandles secrets.

## Own lifetimes and concurrency

* [Resource safety](resource-safety.md) - Making acquisition and cleanup safe
  under success, failure, and interruption; use for open/close pairs,
  `try/finally`, clients, locks, and background work.
* [Structured concurrency](structured-concurrency.md) - Giving every child
  fiber an owner, failure policy, and shutdown path — including dynamic
  FiberSet, FiberMap, and FiberHandle collections; use for detached promises,
  `AbortController`, manual races, or orphanable background tasks.
* [Iteration](iteration.md) - Choosing traversal, combination, loop, and
  Schedule primitives and the concurrency bound each traversal deserves; use
  when replacing async loops, polling, retries, or manual accumulators.
* [Async coordination](async-coordination.md) - Choosing among Deferred,
  Latch, Queue, PubSub, Ref, SynchronizedRef, SubscriptionRef, Semaphore, and
  the Tx* transactional family; use for homegrown locks, shared mutable
  state, event emitters, polling flags, or admission control.
* [Streams](streams.md) - Modeling workflows that produce zero to many values
  over time; use for manual async iteration, callback consumption, or
  paginated and unbounded input.
* [Request batching and cache](request-batching-and-cache.md) - Deciding
  between request batching and keyed value reuse, then setting identity, TTL,
  and failure policy; use for N+1 access, duplicate in-flight work, and
  homemade `Map` caches.
* [Keyed resource sharing](keyed-resource-sharing.md) - Sharing one live
  resource per key across concurrent consumers with RcMap, LayerMap, or Pool;
  use for per-tenant clients, keyed registries, per-key locks, and
  release-when-last-user-leaves lifetimes.

## Integrate with platforms

* [Filesystem](filesystem.md) - Portable, typed, testable file operations
  through the core FileSystem and Path services; use when production code
  imports `node:fs` or `node:path`, walks directories, or must choose a
  platform layer.
* [HTTP API](http-api.md) - One declarative HttpApi contract driving routing,
  validation, OpenAPI, and typed clients; use for endpoints, schemas,
  middleware, security, typed HTTP failures, and derived clients on any
  platform.
* [HTTP client](http-client.md) - Calling HTTP services you do not define
  with the `effect/unstable/http` HttpClient; use for choosing and providing
  a client, request policy and construction, transient retry, schema-decoded
  responses, and swapping the client in tests.
* [Cloudflare Workers](cloudflare-workers.md) - Integrating Effect with
  Workers independently of any web framework; use for bindings as Layers,
  request-scoped runtimes, `waitUntil`, isolate reuse, and Hyperdrive or SQL
  bindings.

## Operate and verify

* [Observability](observability.md) - Designing coherent logs, traces, and
  metrics and wiring exporters at the edge; use for scattered `console.log`,
  missing correlation, manual timing, or leaked secrets in telemetry.
* [Testing](testing.md) - Building deterministic tests for programs and their
  lifetimes; use for real-time sleeps, mocked internals, leaked fibers, or
  nondeterminism through time, scheduling, or randomness.
