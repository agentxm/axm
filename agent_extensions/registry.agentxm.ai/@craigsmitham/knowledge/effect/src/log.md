# Directory Update Log

## 2026-10-29

* **Scope (4.1.0)**: Consolidated the topic-admission policy in the root index's
  Scope and inclusion section, with a link from the pack README. Require a
  consequential recurring Effect-specific decision, credible evidence, concise
  review form, and an uncovered owner before adding a topic. Retained all
  twenty-four topics and the separate adoption rule.
* **Baseline**: Reviewed the release delta from `4.0.6` through `4.0.7` and
  `4.1.0` at upstream commit `9a91b1926a5fbfaffd302a7a41a94d4d53a1154e`.
  Refreshed official source pins (88 distinct paths confirmed at the tag),
  inspected changed contracts and selected
  regression tests, and raised pack and knowledge companion ranges to
  `>=4.1.0 <5.0.0`. All twenty recommended companion npm releases exist at
  4.1.0 and require core `^4.1.0`. Pack and knowledge are version `4.1.0`; the unchanged
  `use-effect` rule remains `4.0.0`.
* **Filesystem**: Covered `readDirectoryEntries` for custom implementations,
  consistent directory wrappers, derived `glob`, and explicit glob root,
  dotfile, symlink, and unreadable-directory expectations.
* **SQL correction**: Storage-backed `sqlite-do` now uses
  `SqlClient.makeWithTransaction`: `afterCommit` waits for the outermost commit
  and concurrent nested siblings are serialized. Removed the stale immediate-
  callback caveat; retained dialect verification and durable-delivery limits.
  Added empty-batch handling before nonempty SQL row helpers and linked the
  relocated filesystem migration loader.
* **HTTP**: Added origin-aware cookie storage, bounded opt-in buffering when
  Fetch cannot stream uploads, raw-error-property redaction awareness, and
  upgrade-response narrowing and cleanup checks. Linked optional Problem
  Details contracts and middleware without prescribing that representation;
  this preserves the application-ownership decision recorded on 2026-08-17.
* **Time and concurrency**: Added cron overlap policy, ISO duration boundary
  constraints, and scoped semaphore acquisition without an interruption gap.
  Existing cancellation and timing checks cover the corrected pool fairness,
  SQLite acquisition, and Fibonacci schedule behavior.
* **Streams and operation**: Distinguished upstream failures from sink error
  recovery; added unobserved-finalizer logging policy and string-record config
  whitespace/empty-value tests. Linked streaming CSV as an optional format
  adapter under the existing streams topic.
* **Crypto**: Folded explicit crypto-family layer provision into services and
  linked test substitution guidance replacing `TestCrypto`. A release alone
  does not establish a distinct unmet need for a crypto checklist; algorithm
  selection and security policy are not inferred from API availability.
* **References and limits**: Re-inspected the pinned opencode HTTP recorder and
  keyed-mutex tests for client decoration, redaction, and readiness signaling;
  retained their declared Effect 4.0.1 baseline and commits. Other applied
  snapshots retain their earlier review dates. This is a release-delta source
  review and checklist design review, not a full upstream code audit. No
  upstream suites, application builds, benchmarks, or field studies were run;
  source review does not establish runtime correctness or checklist effectiveness.
* **Not adopted**: AI, MCP, RPC, cluster, event-log, persistence, CLI, and process
  changes do not justify new topics in this refresh. Their upgrade procedures
  remain in upstream migration/release resources. Schema and collection fixes
  largely satisfy existing boundary, identity, and round-trip checks.


## 2026-10-27

* **Audit corrections (4.0.1)**: Raised the knowledge and pack npm compatibility
  floor to `4.0.6`, matching the APIs and mixed-cause behavior the checklists
  prescribe. Confirmed that all recommended companion packages have 4.0.6
  releases with a core `^4.0.6` peer requirement; future releases and every
  adapter/runtime combination remain unvalidated. The pack now requires the
  corrected knowledge bundle and explicitly describes its all-TypeScript
  adoption/migration rule, with a standalone knowledge installation route.
* **Lifetime boundaries**: Distinguished `ScopedCache` eviction from scoped
  borrowing and routed in-use resource protection to keyed resource sharing.
  Bounded HTTP Worker `waitUntil` work by its shared 30-second post-response
  allowance and directed longer or delivery-critical work to durable ownership.
* **Reference corrections**: Labeled the opencode config/composition example
  historical beta.83 evidence and qualified the upstream layer-composition
  example's quoted SQL interpolation and missing row validation.

* **Identity and compatibility**: Renamed the knowledge bundle and pack from
  `effect-v4` to `effect`, and the rule from `use-effect-v4` to `use-effect`,
  starting all three at `4.0.0`. The major version tracks
  Effect compatibility; minor and patch versions advance independently.
  Added companion metadata for core Effect, platform and SQL adapters,
  OpenTelemetry, Vitest, and the OpenAPI generator, bounded to Effect 4.x
  and checked against the official `effect@4.0.6` package list. The reviewed
  API baseline remains `4.0.6`; checklist content is unchanged by the rename.

* **Retarget**: Reviewed the release delta from Effect `4.0.0` through
  `4.0.6` and refreshed the twenty-four checklists' official source pins.
  Confirmed that all 73 distinct current source, guide, and test paths exist
  in the `effect@4.0.6` release. Removed old line locators rather than carrying
  them onto changed files. Kept the historical rc.113 parsing reference;
  selective applied-example changes are recorded below.
* **HTTP API**: Added explicit trusted-proxy policy and spoofed-chain checks.
  Extended streaming coverage to request payloads, bounded total and element
  sizes, cancellation, and the 400/413 distinction. Reviewed middleware and
  streaming upload regression tests.
* **HTTP client**: Added `Retry-After`, manual fetch redirects when using
  `HttpClient.followRedirects`, and replacement semantics for custom query
  redaction names.
* **Filesystem**: Distinguished lexical containment via `Path.resolveWithin`
  from symlink containment. Covered `lstat`, the final-component and platform
  limits of `noFollow`, and lossless handling of bigint file metadata.
* **SQL**: Added commit-dependent side effects and nested rollback/failed
  commit checks. `SqlClient.afterCommit` does not guarantee durable delivery;
  the `sqlite-do` implementation runs callbacks immediately. Reviewed the
  contract and post-commit regression tests.
* **Cancellation and errors**: Added shared-lookup abandonment, invalidation
  during computation, and new acquisition during abandoned cleanup. Added
  mixed-cause recovery checks: defects prevent typed recovery, but an
  accompanying interruption alone does not. Reviewed cache, keyed resource,
  and mixed-cause tests.
* **Date and time**: Distinguished sub-day elapsed arithmetic from calendar
  arithmetic across DST and linked the gap/repeated-hour regression tests.
* **Observability**: Added upgrade checks for downstream telemetry consumers
  affected by signal names, attributes, metric shapes, and interruption status.
* **Version policy**: The index now includes experimental APIs, which can
  change in patch releases. Corrected the pack README's stale rc.112 baseline.
* **Conventions adopted**: Applied the reference review's recommendations:
  `Effect.fn` / `fnUntraced` for reusable generator functions, runner-neutral
  test-harness guarantees, explicit readiness/release signals in concurrency
  tests, and package/path-qualified service identifiers. Kept layer placement
  flexible and public requirements inspectable; added offline substitution and
  custom-harness verification expectations.
* **Reference selection**: Recorded role/version/commit selection policy and
  retained public Effect APIs as the baseline. Replaced the historical beta.83
  HTTP recorder citation with opencode's reviewed client decorator at
  `432d870` (Effect catalog 4.0.1). Repointed and explicitly labeled Alchemy's
  native async Worker boundary at `59fd117`. Other historical applied-example
  pins remain unchanged. The pack now distinguishes current, historical,
  demo, platform-native, and project-specific references.
* **Not adopted**: Most stream, finalizer, queue, schema, and runtime fixes
  strengthen existing checks. New AI, event-log, workflow, GraphQL, networking,
  CLI, archive, and diff APIs do not justify expanding this bundle's topics.
* **Evidence ceiling**: This is a source-reviewed candidate refresh, using
  release contracts, selected regression tests, and current reference-repository
  samples. No upstream test suite or reference application was executed, and
  no field validation is claimed. The separately recorded convention review's
  recommendations were adopted after explicit user approval; adoption does
  not establish runtime or field effectiveness.

## 2026-10-01

* **Retarget**: Reviewed the twenty-four checklists against the changes from
  Effect `4.0.0-rc.117` through `4.0.0-rc.118` to the stable `4.0.0` release
  and refreshed all official Effect source pins. Historical applied-example
  pins remain unchanged.
* **Correction**: rc.118 moved `effect/unstable/*` modules to `effect/*` and
  renamed `effect/httpapi` to `effect/http-api`. Repointed the HttpApi,
  HttpClientError, SqlClient, SqlError, and HttpServerResponse test links.
  The index now defines version sensitivity by the `@stability unstable` tag,
  not the import path. Most HTTP, HTTP API, and SQL modules keep that tag.
* **Correction**: 4.0.0 consolidated the pre-release changesets. The
  own-property parsing reference in [Schema boundaries](schema-boundaries.md)
  now points to the rc.113 entry in the package changelog.
* **HTTP API**: The parse-options check now covers the per-slot annotations
  added in rc.118. A slot annotation such as `HeadersParseOptions` outranks
  `ParseOptions` at any level and can keep strict body parsing from rejecting
  transport headers. The edge-wiring check notes that `HttpRouter.serve` builds
  its app privately (rc.118), so services shared with sibling layers must be
  provided outside it.
* **Branded types**: Since 4.0.0, `Schema.brand` is type-only. Schema
  representations and generated code omit the brand. The
  representation-change check now covers rebuilding a schema from either.
* **Resource safety**: Added a check to close only scopes the code created.
  Since rc.118, `Scope.close` and `Scope.closeUnsafe` require a
  `Scope.Closeable`.
* **Iteration**: Added a check for repetition bounded by both a count or
  schedule and a stop condition. Since rc.118, `Effect.repeat` with `times` or
  `schedule` keeps the source result type, because the bound may end
  repetition before a refinement holds.
* **Keyed resource sharing**: The acquisition-failure check now asks whether
  failure surfaces at preload or first use. Since rc.118, `LayerMap` skips
  preloading keys with a zero idle time-to-live, which is the default.
* **Testing**: Linked `TestSchema`, now `@stability unstable`. 4.0.0 renamed
  `verifyLosslessTransformation` to `verifyRoundTrip`.
* **Not adopted**: No checklist item names the new successes-first tuple order
  of `partition` and `separate` (4.0.0), but callers migrating from earlier
  pre-releases must swap the tuple. This matters most where both sides share
  one type. Fixes to `Effect.race` loser interruption, `Queue` batch takes, `Cache` and
  `MutableHashMap` retention, PostgreSQL and SQLite failed-`COMMIT` handling,
  scope finalizer interruptibility, and `ManagedRuntime` disposal ordering
  strengthen behavior the checklists already require. `Arbitrary.configureGlobal`,
  the Schema check renames, and the AI, MCP, cluster, workflow, RPC, Atom, and
  CLI changes fall outside the topics. 4.0.0 requires TypeScript 5.9 or newer,
  and `@effect/vitest` requires Vitest 5.
* **Evidence ceiling**: This refresh reviews source, changelogs, and migration
  documents; it does not claim execution of the upstream suites, re-review of
  applied example repositories, or field validation of the checklists.

## 2026-09-22

* **Retarget**: Reviewed the twenty-four checklists against the changes from
  Effect `4.0.0-rc.115` through `4.0.0-rc.117` and refreshed all official
  Effect source pins. Historical applied-example pins remain unchanged.
* **Correction**: Repointed the fast-check migration reference in
  [Testing](testing.md). rc.116 removed `ARBITRARY-MIGRATION.md` and moved its
  content into the consolidated Schema migration guide.
* **HTTP API**: Added a check for `HttpApi.ParseOptions`, new in rc.116. Parse
  options set at the API, group, or endpoint level are replaced, not merged,
  by a nearer level, and a strict excess-property policy also rejects
  undeclared headers. [Schema boundaries](schema-boundaries.md) now allows the
  excess-property decision to sit on the owning contract.
* **SQL**: Added a check that the dialect client supports the transaction
  shape relied on. In rc.116 `sqlite-do` gained nested transactions with
  independent child rollback, but it still does not support concurrent sibling
  transactions or asynchronous work inside a transaction. rc.117 releases
  savepoints after nested transactions complete, and custom clients opt in
  through `releaseSavepoint`. This supersedes the 2026-08-17 note that
  `sqlite-do` rejects nested transactions. Cloudflare Workers now links the
  Durable Object SQLite client.
* **Date and time**: The timestamp-codec check now covers the time zone a
  driver applies on write. It cites the rc.116 `sql-pg` change: timestamps now
  decode as `Date`, and `Date` parameters bind as `timestamptz`, so inserting
  one into a `timestamp` column applies the session `TimeZone`.
* **Config**: Linked ByteSize parsing. Since rc.116, `ByteSize.Input` accepts
  only canonical integer strings, so sizes from outside input need
  `Config.ByteSize` or `ByteSize.fromString`.
* **Not adopted**: The rc.116 `SchemaGetter`, `SchemaTransformation`, `Stream`,
  and `Effect.orElseSucceed` API changes do not appear in any checklist item.
  The experimental Schema JIT and AOT compilers, AI, MCP, cluster, `NetAddress`,
  and YAML changes fall outside the topics. Fixes to `Pool.makeWithTTL` usage
  retention (rc.117) and `RcRef` zero idle time-to-live (rc.116) need no
  checklist change.
* **Evidence ceiling**: This refresh reviews source, changelogs, and migration
  documents; it does not claim execution of the upstream suites, re-review of
  applied example repositories, or field validation of the checklists.

## 2026-09-11

* **Retarget**: Reviewed the twenty-four checklists against the changes from
  Effect `4.0.0-rc.112` through `4.0.0-rc.115` and refreshed all official
  Effect source pins. Historical applied-example pins remain unchanged.
* **Config and filesystem**: Refreshed Config references and the layer,
  resource, and logging examples that use its renamed constructors. Added a
  ByteSize reference for the filesystem size and offset API changes.
* **Testing**: Added native Arbitrary and fast-check migration references.
  Made property-result handling and retention of failing inputs across
  generator upgrades explicit; reviewed current `@effect/vitest` examples.
* **Schema**: Added checks for excess-property policy and boundaries that
  require own fields, plus references for operation-wide parsing options and
  the changed inherited-field behavior. Reviewed parser regression tests.
* **SQL**: Added native PostgreSQL client and codec sources; clarified driver
  representations and prepared-statement compatibility with connection
  poolers. Reviewed the current PostgreSQL library and integration-test cases.
* **HTTP API**: Added a bodyless-response and resource-release check, grounded
  in the rc.115 Web response regression tests.
* **Evidence ceiling**: This refresh reviews source and test definitions; it
  does not claim execution of the upstream suites or field validation of the
  checklists. The existing use protocol and validation plan remain in force.

## 2026-09-08

* **Discovery**: Replaced the abbreviated root index entry summaries with each
  concept's exact frontmatter `description`, so a reader browsing the index and
  a reader arriving from search see the same selection text for every topic.
* **Correction**: Corrected the root index introduction, which claimed each
  topic contains eight checks while [Observability](observability.md) carries
  nine. The introduction now states the five-to-ten-item form already declared
  in the maintenance section.

## 2026-08-29

* **Discovery**: Replaced the taxonomy-heavy publisher description with a
  reader-job description: consult the bundle when designing, implementing,
  maintaining, or reviewing Effect v4 TypeScript.
* **Packaging**: Published the checklist replacement as `1.0.0`, then issued
  `1.0.1` with redundant end-of-file whitespace removed so the canonical
  source and immutable registry artifact remain identical.
* **Replacement**: Re-authored all twenty-four Effect topics as independent
  eight-item `Checklist` concepts for design, implementation, maintenance,
  and review. Removed the routing conditions, preconditions, phase labels,
  long-form API instruction, and retired-skill lineage that made the previous
  guide corpus expensive to consult.
* **Evidence**: Consulted Effect `4.0.0-rc.112` source, tests, and official
  `ai-docs`, then checked current revisions of opencode, LiveStore, Alchemy,
  effect-local, dfx, and effect-http-recorder for applied patterns before
  authoring the replacement checklists.
* **Lifecycle**: Made the bundle standalone and moved version policy to the root
  index: the exact authoring baseline is Effect `4.0.0-rc.112`, with the
  checklists treated as stable within major version 4 while version-sensitive
  APIs are confirmed through linked sources.
* **Checklist review**: Reviewed the corpus against the checklist-design
  interaction and lifecycle guidance. Named `reporting-review` as the primary
  mode, made evidence and failed-item behavior explicit, documented interruption
  recovery, and labeled the corpus source-reviewed but not field-validated.
  Added comparison measures, review triggers, adaptation bounds, and
  replacement or retirement conditions without adding per-topic routing.

## 2026-08-24

* **Boundary**: Refined [Date and time](date-and-time.md) so an effective
  repository, module, or task instruction owns the date representation for its
  bounded concern. Effect `DateTime.Utc` remains the default when Effect owns
  that representation; scoped Temporal or native `Date` values can coexist
  with Effect `Clock`, `TestClock`, and effectful timing primitives.
* **Retarget**: Re-pinned official Effect sources and the bundle baseline from
  `4.0.0-rc.110` to `4.0.0-rc.111` after comparing the releases. Re-reviewed
  guides that cite changed upstream files and spot-checked unchanged pins.
* **Correction**: Recast `Result` as intentional success-or-expected-failure
  data rather than universally forbidding it at Effect and outbound boundaries.
  Effect-owned operations still default to the typed error channel; per-item,
  aggregate, pure, and explicit boundary outcomes may use `Result`, while
  defects and interruption remain outside it.
* **Correction**: Made the Cloudflare pre-close macrotask yield conditional on
  verified dispatcher scheduling. The supporting evidence comes from one
  shared implementation lineage and no longer reads as a universal platform
  invariant.
* **Addition**: Recorded rc.111's merged source-and-finalizer causes and its
  dual standalone Optic operations. Added an explicit evidence ceiling and a
  release refresh policy to the root index.

## 2026-08-18

* **Correction**: Revised [SQL](sql.md) to distinguish statement-local domain
  handling from repository, service, handler, and scheduler failure policy.
  Ordinary statements and transaction participants now explicitly preserve
  `SqlError`; repeated defect conversion belongs once at an owning boundary.
  The guide also corrects one official walkthrough from “the upstream default”
  to an example-specific policy, routes nested reasons to `catchReason` and
  `catchReasons`, distinguishes `catchTag` from `mapError`, and requires
  serialization and deadlock retry to enclose the complete transaction.

## 2026-08-17

* **Creation**: Added [SQL](sql.md) and [Date and time](date-and-time.md). SQL
  earned a concept because `SqlError` carries exactly one tag and discriminates
  one level deeper in `reason`, so the reflex `Effect.catchTag("UniqueViolation")`
  does not compile and the correct move (`Effect.catchReason`) is not guessable
  from the type; transaction ownership and query text in traces have no other
  owner in this bundle. Date and time earned a concept because the instant
  carrier, the boundary transform, and where "now" comes from are three separate
  decisions that get conflated: `DateTime.now` reads the `Clock` reference and is
  therefore testable, while `DateTime.nowUnsafe` is not, and the Schema transform
  family (`DateTimeUtc`, `DateTimeUtcFromDate`, `DateTimeUtcFromString`,
  `DateTimeUtcFromMillis`) must match the driver's storage representation.
* **Convention**: Adopted a three-tier source preference, documented in the root
  [index](index.md). Prefer an immutable permalink carrying a tag or commit;
  then a versioned publisher doc URL where the publisher versions its docs; and
  only where neither exists, a live URL. Tier-3 entries must carry `author` and
  `last_modified`, because a live URL has no other recency signal; tier-1 and
  tier-2 entries do not, because the tag or version already is that signal. The
  Effect v4 API reference is not version-pinned, so it is linked once per guide
  as a browsable route and never used as a per-claim footnote — nothing that
  verifies a claim may silently drift. Source-id prefixes were extended with
  `api-`, `otel-`, `pg-`, and `sqlite-` alongside the existing `src-`, `docs-`,
  `test-`, `schema-`, `applied-`, `origin-`, and `cf-`.
* **Correction**: The post-response telemetry flush ordering in
  [Cloudflare Workers](cloudflare-workers.md) was inverted. Scope close *is* the
  flush: `OtlpExporter.make` registers a scope finalizer that performs the final
  export, and a `Flusher.flush` issued after close is a no-op because the
  finalizer already deregistered the exporter. The guide previously implied
  flush-then-close. Recorded alongside it: `Otlp.layer`, `Otlp.layerJson`, and
  `Otlp.layerProtobuf` are annotated `Layer<never, …>`, and that annotation
  legally erases `OtlpExporter.Flusher` — so a Worker wired through `Otlp.layer`
  cannot `yield* OtlpExporter.Flusher` at all, and must wire `OtlpTracer.layer`,
  `OtlpLogger.layer`, and `OtlpMetrics.layer` individually if it intends to
  flush explicitly.
* **Boundary**: Declined six candidate entries as application-specific rather
  than portable Effect knowledge. RFC 9457 problem-details — an HTTP
  representation choice, not an Effect failure-modeling decision. Log-level
  selection — an operational policy that varies per deployment. Optimistic-
  concurrency version columns — a data-model pattern independent of the SQL
  client. "Do not test config plumbing" — a testing-taste claim with no
  version-specific Effect content. Server/client layer-module placement — a
  repository layout convention, not a Layer semantics rule. "Raw millisecond
  arithmetic is prohibited" — overstated as a prohibition: `Duration.Input`
  admits a bare millis number by design, so the honest guidance is to choose the
  carrier deliberately, which [Date and time](date-and-time.md) now does.
* **Provenance**: [SQL](sql.md) deliberately follows the spine observed in the
  applied corpus — client wiring, statement construction, `SqlError` reason
  handling, `SqlSchema` at the boundary, transaction ownership — rather than
  upstream's documented `Model.Class` -> `Migrator` -> `SqlModel` spine. The
  applied references reach for `SqlSchema` and raw statements far more than for
  `Model.Class`, dialect clients differ materially in what they support (D1 ships
  no migrator; sqlite-do rejects nested transactions), and the upstream spine
  front-loads a modeling commitment most readers arrive after having already
  made. Upstream's spine is reachable from the guide; it is not the entry route.
* **Retarget**: Re-pinned the corpus target to `Effect 4.0.0-rc.110` in the
  root index (previously `4.0.0-beta.107`) after verifying from npm dist-tags
  and the `effect@4.0.0-rc.110` tag that the rc line directly continues the
  beta line. Every materially version-specific claim was re-verified against
  the rc.110 sources rather than mechanically renamed.
* **Provenance**: Replaced each guide's sole retired-skill source with
  official Effect sources (ai-docs documents, module source, and tests,
  tag-pinned to `effect@4.0.0-rc.110`) plus revision-pinned applied
  references where a pattern was actually observed; retired-skill sources
  remain as lineage only. Added machine `verified` events recording when each
  guide was checked.
* **Correction**: Removed Effect v3 carryovers and stale beta-era notes:
  `Effect.iterate`/`Effect.loop` (gone in v4) replaced with `Effect.whileLoop`,
  `Effect.gen` loops, `Stream.iterate`, and `Effect.repeat` in
  [Iteration](iteration.md); `Record.partitionMap` and Option-based
  `Array.filterMap` corrected in [Collections](collections.md); the `it.scoped`
  trap documented in [Testing](testing.md); the wrong `beta.107` rename note
  removed from [Error modeling](error-modeling.md).
* **Boundary**: Re-scoped [HTTP API](http-api.md) as platform-neutral (its
  claims verify on any platform) and made
  [Cloudflare Workers](cloudflare-workers.md) the sole owner of Workers
  runtime semantics; Cloudflare-platform assertions now cite Cloudflare
  documentation explicitly. Duplicated rules across neighboring guides were
  consolidated to single owners with cross-references.
* **Creation**: Added [HTTP client](http-client.md) (outbound HTTP with typed
  failure, retry, and substitution) and
  [Keyed resource sharing](keyed-resource-sharing.md) (RcMap, LayerMap, Pool)
  after an evidence review of current official rc.110 API support and applied
  references; six other candidate guides were declined as folds into existing
  guides.

## 2026-08-12

* **Creation**: Established the Effect v4 knowledge bundle with twenty guides
  grouped by data modeling, failure, application structure, lifetimes and
  concurrency, platform integration, and verification.
* **Conversion**: Migrated the bodies of twenty retired predecessor skill
  packages into this bundle. Each guide's `sources` entry records the exact
  retired package it came from as a permalink, for attribution only; nothing in
  this bundle reads or requires those packages, and they are no longer
  published. Each guide opens with the routing conditions that were previously
  carried by the predecessor's skill description.
* **Convention**: Adopted `type: Guide` for normative decision guidance
  consulted while making a judgment, reserving `Playbook` for step-wise
  procedures that produce ordered actions. This bundle currently contains no
  `Playbook` concepts.
* **Convention**: Pinned the target version (`Effect 4.0.0-beta.107`) once in
  the root index instead of repeating it in every concept. Version-specific API
  claims were marked inline in the guides that made them, at the time
  [Error modeling](error-modeling.md) and [HTTP API](http-api.md).
