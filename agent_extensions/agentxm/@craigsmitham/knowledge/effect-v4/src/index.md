---
okf_version: "0.2"
---

# Effect v4 checklists

Concise evaluation checklists for designing, implementing, maintaining, and
reviewing Effect v4 TypeScript. Each topic contains five to ten independently
judgeable checks plus links to the primary sources used to author it.

This bundle was last authored against **Effect 4.0.0-rc.112**. Within Effect
major version 4, use the checklists as the stable design baseline and consult
the linked current sources when an API has changed or remains under an
`effect/unstable/*` import. Effect v3 APIs and conventions are out of scope.

The primary mode is `reporting-review`: use a topic to expose omissions and
make a design or implementation inspectable. During implementation it can also
serve as a `read-do` prompt. For a selected topic, completion means every
applicable item has inspectable code, tests, configuration, or design evidence,
or a documented bounded exception. An unsupported item remains open; checking
a box is only a place marker, not evidence that the work or checklist is good.

The items are non-procedural. They run from foundational choices and boundaries
toward operation and verification, but may be reviewed independently and
resumed at the first open box after interruption.

## Model data

- [Schema boundaries](schema-boundaries.md) — Evaluate whether external
  representations cross one explicit, validated boundary into trusted domain
  values.
- [Branded types](branded-types.md) — Evaluate whether meaningful scalar
  identities and refinements prevent invalid substitution without weakening
  boundary validation.
- [Option](option.md) — Evaluate whether meaningful absence is modeled
  explicitly and translated cleanly at nullable boundaries.
- [Collections](collections.md) — Evaluate whether collection representation
  and operations preserve identity, cardinality, ordering, and safety.
- [Date and time](date-and-time.md) — Evaluate whether instants, calendar
  values, durations, time zones, and current time have explicit owners.
- [Optics](optics.md) — Evaluate whether reusable immutable focus operations
  are lawful, appropriately strong, and clearer than direct updates.

## Model failure

- [Error modeling](error-modeling.md) — Evaluate whether expected failures,
  defects, interruption, recovery, and retry remain distinct and truthful.
- [Wrapping foreign APIs](wrapping.md) — Evaluate whether synchronous, Promise,
  and callback APIs become truthful, cancellable, resource-safe Effect
  boundaries.

## Structure the application

- [Services and layers](services-and-layers.md) — Evaluate whether
  capabilities, implementations, dependency graphs, lifetimes, and runtime
  boundaries remain explicit and replaceable.
- [Config](config.md) — Evaluate whether configuration is typed, validated,
  secret-safe, centralized, and replaceable in tests.

## Own lifetimes and concurrency

- [Resource safety](resource-safety.md) — Evaluate whether every acquired
  resource has one explicit owner and reliable cleanup under success, failure,
  and interruption.
- [Structured concurrency](structured-concurrency.md) — Evaluate whether every
  child fiber has an owner, bounded policy, observable failure, and
  deterministic shutdown.
- [Iteration](iteration.md) — Evaluate whether traversal, repetition, polling,
  retry, result shape, and concurrency match the operation's semantics.
- [Async coordination](async-coordination.md) — Evaluate whether the
  coordination primitive matches the state, signaling, backpressure,
  exclusivity, and atomicity required.
- [Streams](streams.md) — Evaluate whether a zero-to-many workflow has truthful
  production, backpressure, concurrency, lifetime, and consumption semantics.
- [Request batching and cache](request-batching-and-cache.md) — Evaluate
  whether request coalescing and value reuse have complete identity, bounded
  lifetime, failure, and invalidation policies.
- [Keyed resource sharing](keyed-resource-sharing.md) — Evaluate whether live
  resources shared by key have complete identity, scoped borrowing, bounded
  retention, and safe release.

## Integrate with platforms

- [Filesystem](filesystem.md) — Evaluate whether file and path operations are
  portable, typed, containment-safe, resource-safe, and replaceable in tests.
- [HTTP API](http-api.md) — Evaluate whether one schema-first HTTP contract
  governs endpoints, validation, errors, middleware, documentation, and
  clients.
- [HTTP client](http-client.md) — Evaluate whether outbound HTTP has an
  injectable client, complete policy, typed failure distinctions, schema
  decoding, and safe retry.
- [Cloudflare Workers](cloudflare-workers.md) — Evaluate whether Effect
  services, scopes, background work, bindings, and state align with the Workers
  request and isolate model.
- [SQL](sql.md) — Evaluate whether database access has explicit client, schema,
  statement, transaction, retry, telemetry, and testing boundaries.

## Operate and verify

- [Observability](observability.md) — Evaluate whether logs, traces, and
  metrics answer operational questions with coherent context, bounded
  cardinality, and safe lifecycle.
- [Testing](testing.md) — Evaluate whether Effect programs are tested
  deterministically through public services, controlled runtime inputs, and
  complete lifetime behavior.

## Maintaining this bundle

Before changing a checklist, compare it with the current Effect v4 source and
tests and inspect representative current v4 applications or libraries that use
the topic. Keep each checklist between five and ten independently judgeable
items. Put API detail, examples, and further explanation in linked resources
rather than expanding the checklist into a guide. Record baseline changes and
material corrections in the [update log](log.md).

These checklists are **source-reviewed candidates, not field-validated
controls**. The package owner named in `knowledge.json` owns revisions. The
topic boundary, five-to-ten-item form, source traceability, and separation from
long-form guidance are invariant; local teams may adapt evidence capture and
companion links without weakening an item.

Validation should compare representative Effect authors and reviewers using
the checklists with current review practice, measuring missed defects,
reviewer agreement, time, misselection, and unsupported completion. Re-review a
topic when Effect v4 behavior changes, an unstable API moves, applied practice
diverges, or users misinterpret or routinely bypass an item. Split, replace, or
retire a checklist when automation prevents the omission more reliably or the
topic requires substantial branching, explanation, or a procedure.
