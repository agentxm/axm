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
  unknown, encoded, and domain values; use when JSON is cast, validation is
  duplicated, or constructors bypass invariants.
* [Branded types](branded-types.md) - Preventing invalid primitive
  substitution; use when IDs or units share representations or raw scalars
  cross meaningful boundaries.
* [Option](option.md) - Modeling meaningful absence and translating nullable
  boundaries; use when lookups can miss without failing or null checks repeat.
* [Collections](collections.md) - Choosing among Array, Chunk, Record, and
  HashMap; use for unsafe indexing, value-based keys, or multi-pass array code.
* [Optics](optics.md) - Reusable immutable reads and updates; use when nested
  paths repeat, updates target optional data or union variants, or focus logic
  should compose across modules.

## Model failure

* [Error modeling](error-modeling.md) - Keeping expected failure, defects, and
  interruption distinct; use for throws, `catch (unknown)`, stringified
  failures, broad recovery, or indiscriminate retry.
* [Wrapping](wrapping.md) - Turning Promise, callback, and third-party APIs
  into truthful Effect boundaries with typed failure and real cancellation.

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
* [Structured concurrency](structured-concurrency.md) - Structuring parallel
  and background work around owned lifetimes; use for detached promises,
  `Promise.all`, `AbortController`, manual races, or unbounded parallelism.
* [Iteration](iteration.md) - Choosing traversal, combination, loop, and
  Schedule primitives; use when replacing async loops, polling, retries, or
  manual accumulators.
* [Async coordination](async-coordination.md) - Choosing Deferred, Queue,
  PubSub, Ref, and Semaphore; use for homegrown locks, shared mutable state,
  event emitters, polling flags, or admission control.
* [Streams](streams.md) - Modeling workflows that produce zero to many values
  over time; use for manual async iteration, callback consumption, or
  paginated and unbounded input.
* [Request batching and cache](request-batching-and-cache.md) - Designing
  batching and keyed reuse; use for N+1 access, duplicate in-flight work,
  homemade `Map` caches, and TTL decisions.

## Integrate with platforms

* [Filesystem](filesystem.md) - Portable, typed, testable file operations; use
  when production code imports `node:fs` or `node:path` or walks directories.
* [HTTP API](http-api.md) - Declarative HttpApi services on Cloudflare
  Workers; use for endpoints, schemas, middleware, typed HTTP failures,
  OpenAPI, and derived clients.
* [Cloudflare Workers](cloudflare-workers.md) - Integrating Effect with
  Workers independently of any web framework; use for bindings as Layers,
  request-scoped runtimes, `waitUntil`, and isolate reuse.

## Operate and verify

* [Observability](observability.md) - Designing coherent logs, traces, and
  metrics; use for scattered `console.log`, missing correlation, manual
  timing, or leaked secrets in telemetry.
* [Testing](testing.md) - Building deterministic tests for programs and their
  lifetimes; use for real-time sleeps, mocked internals, leaked fibers, or
  nondeterminism through time, scheduling, or randomness.
