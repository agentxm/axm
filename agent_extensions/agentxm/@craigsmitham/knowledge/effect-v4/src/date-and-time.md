---
type: Guide
title: Date and time
description: Choosing scoped date/time representations, boundary transforms, and where "now" comes from; use when Date leaks through an Effect domain, timestamps decode inconsistently, or tests cannot control time.
tags: [effect, effect-v4, datetime, temporal, duration, clock, testclock, timestamps, serialization, determinism]
status: stable
sources:
  - id: docs-datetime
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.111/ai-docs/src/07_datetime/index.md
    title: Official Effect docs — use the DateTime module instead of Date and Date.now (effect 4.0.0-rc.111)
  - id: docs-datetime-creating
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.111/ai-docs/src/07_datetime/10_creating-and-formatting.ts
    title: Official Effect docs — DateTime.now for Clock-powered time, DateTime.make for parsing, DateTime.add for calendar math (effect 4.0.0-rc.111)
  - id: src-datetime
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.111/packages/effect/src/DateTime.ts
    title: DateTime module source — Utc, make/makeUnsafe, now/nowUnsafe, isLessThan, distance, add, addDuration, toDateUtc (effect 4.0.0-rc.111)
  - id: src-internal-datetime
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.111/packages/effect/src/internal/dateTime.ts
    title: DateTime internals — now is Clock.currentTimeMillis mapped to a Utc value (effect 4.0.0-rc.111)
  - id: src-clock
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.111/packages/effect/src/Clock.ts
    title: Clock module source — Clock is a Context.Reference, so it is replaceable by a Layer (effect 4.0.0-rc.111)
  - id: src-schema-datetime
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.111/packages/effect/src/Schema.ts
    title: Schema module source — DateTimeUtc, DateTimeUtcFromDate/FromString/FromMillis, and the Schema.Duration JSON codec (effect 4.0.0-rc.111)
  - id: src-schema-getter
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.111/packages/effect/src/SchemaGetter.ts
    title: SchemaGetter source — dateTimeUtcFromInput decodes through the safe DateTime.make and fails with InvalidValue (effect 4.0.0-rc.111)
  - id: src-model
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.111/packages/effect/src/unstable/schema/Model.ts
    title: Model module source — three parallel DateTime variant families for string, Date, and millis storage (effect 4.0.0-rc.111)
  - id: src-duration
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.111/packages/effect/src/Duration.ts
    title: Duration module source — Duration.Input admits a bare millis number by design; toMillis and fromInputUnsafe (effect 4.0.0-rc.111)
  - id: src-cache
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.111/packages/effect/src/Cache.ts
    title: Cache module source — entry expiry is computed from the Clock reference, not wall time (effect 4.0.0-rc.111)
  - id: src-cluster-cron
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.111/packages/effect/src/unstable/cluster/ClusterCron.ts
    title: ClusterCron source — one DateTime.now read compared with isLessThan against subtractDuration (effect 4.0.0-rc.111)
  - id: src-testclock
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.111/packages/effect/src/testing/TestClock.ts
    title: TestClock source — TestClock.layer is Layer.effect over the Clock reference (effect 4.0.0-rc.111)
  - id: src-vitest-internal
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.111/packages/vitest/src/internal/internal.ts
    title: "@effect/vitest internals — every it.effect receives TestConsole and TestClock by default (4.0.0-rc.111)"
  - id: test-datetime
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.111/packages/effect/test/DateTime.test.ts
    title: DateTime tests — TestClock.setTime pins the instant; distance asserted as a Duration (effect 4.0.0-rc.111)
  - id: applied-opencode-schema
    resource: https://github.com/anomalyco/opencode/blob/65c35977bd564e23c0e9cf124b3e3e3b9308e9e8/packages/schema/src/schema.ts
    title: opencode@65c3597 — one epoch-millis transform reused across every wire and storage schema
  - id: applied-opencode-input
    resource: https://github.com/anomalyco/opencode/blob/65c35977bd564e23c0e9cf124b3e3e3b9308e9e8/packages/core/src/session/input.ts
    title: opencode@65c3597 — one DateTime.now read feeding both the published event and the returned aggregate
  - id: applied-opencode-builtins
    resource: https://github.com/anomalyco/opencode/blob/65c35977bd564e23c0e9cf124b3e3e3b9308e9e8/packages/core/src/system-context/builtins.ts
    title: opencode@65c3597 — DateTime.nowAsDate formatted at a prompt edge, pinned in tests by TestClock.setTime
  - id: applied-opencode-duration
    resource: https://github.com/anomalyco/opencode/blob/65c35977bd564e23c0e9cf124b3e3e3b9308e9e8/packages/opencode/src/account/schema.ts
    title: opencode@65c3597 — Schema.Duration carrying expiry and poll interval in a device-login contract
  - id: applied-opencode-ticket
    resource: https://github.com/anomalyco/opencode/blob/65c35977bd564e23c0e9cf124b3e3e3b9308e9e8/packages/core/src/pty/ticket.ts
    title: opencode@65c3597 — ticket expiry delegated to Cache timeToLive instead of stored deadlines
  - id: applied-alchemy-poll
    resource: https://github.com/alchemy-run/alchemy-effect/blob/1596e503b8d0cb06463ac676defe351b8e0e131a/packages/alchemy/src/Planetscale/Util.ts
    title: alchemy-effect@1596e50 — startedAt hoisted out of a poll loop while now is re-read per iteration
  - id: applied-alchemy-lock
    resource: https://github.com/alchemy-run/alchemy-effect/blob/1596e503b8d0cb06463ac676defe351b8e0e131a/packages/alchemy/src/Auth/Lock.ts
    title: alchemy-effect@1596e50 — Clock-read millis converted to Date only to satisfy the filesystem utimes edge
  - id: applied-alchemy-credentials
    resource: https://github.com/alchemy-run/alchemy-effect/blob/1596e503b8d0cb06463ac676defe351b8e0e131a/packages/alchemy/src/Cloudflare/Credentials.ts
    title: alchemy-effect@1596e50 — hand-rolled injectable now inside Effect code (counterexample)
  - id: applied-livestore
    resource: https://github.com/livestorejs/livestore/blob/31e8d71134c5f4d89c21f6b1e3b6b5b39eeacd4e/packages/%40livestore/common/src/schema/state/sqlite/db-schema/dsl/field-defs.ts
    title: livestore@31e8d71 — datetime column primitives hardcoded to decode as Date (counterexample)
  - id: applied-effect-local-rules
    resource: https://github.com/lucas-barake/effect-local/blob/faa52d91faad10817906750c8cf02c71852a5521/RULES.md
    title: effect-local@faa52d9 — repository rules mandating Duration.Input in APIs and plain unit-named numbers on the wire
  - id: spec-temporal-instant
    resource: https://tc39.es/proposal-temporal/#sec-temporal.instant.fromepochmilliseconds
    title: TC39 Temporal proposal — Temporal.Instant.fromEpochMilliseconds
  - id: api-effect-v4
    resource: https://www.effect.website/docs/v4/api
    title: Effect v4 API reference — browsable DateTime, Duration, and Clock module surfaces
    author: team:effect
    last_modified: 2026-08-17
generated:
  by: codex/gpt-5.6
  at: 2026-08-24T18:10:47Z
verified:
  - by: claude/opus-5
    at: 2026-08-17T21:36:42Z
  - by: codex/gpt-5.6
    at: 2026-08-24T16:00:57Z
---

# Date and time

Choose one date/time representation per bounded concern, transform it at each
edge, and read "now" through the Clock inside Effect computations.

**Applies when** `Date` values flow through domain code, timestamp columns decode
differently per table or driver, durations are bare numbers with the unit in the
identifier, or a test cannot control time without waiting — even without current
`DateTime` usage.

**Representation authority:** This guide recommends Effect `DateTime.Utc` when
Effect owns the instant representation. An effective repository, module, or
task instruction may instead select JavaScript Temporal or native `Date` for a
bounded concern. Preserve that scoped choice. It changes the value carrier and
its boundary transforms; it does not automatically replace Effect `Clock`,
`TestClock`, `Duration`, `Schedule`, timeouts, or caches. Importing Effect does
not decide every date representation in a file.

**Leave alone** a single `Date` handed to and consumed by one vendor call, and
formatting-only code that never reasons about the instant.

This is four related decisions: **representation authority** (which carrier a
bounded concern uses), the **driver edge** (what a timestamp column becomes),
the **wire edge** (what a payload carries), and the **now edge** (where the
current instant comes from — a testability decision, not a serialization one).

Related: [Schema boundaries](schema-boundaries.md) for designing the schemas
these transforms live in, [Testing](testing.md) for `TestClock` mechanics and
virtual-time scheduling, [Iteration](iteration.md) for `Schedule` timing, and the
[Effect v4 API reference](https://www.effect.website/docs/v4/api) for browsing the
`DateTime`, `Duration`, and `Clock` surfaces. This guide does not cover schema
design, test harness setup, or retry policy.

## When Effect owns the carrier, use `DateTime.Utc`

- Use `DateTime.Utc` as the in-memory instant: an immutable value over
  `epochMilliseconds` with no zone attached. Upstream states the rule plainly —
  within Effect's date/time model, use `DateTime` instead of `Date` and
  `Date.now`.[^docs-datetime] [^src-datetime]
- The payoff is failure visibility, not style. `new Date(x)` never fails; it
  yields `Invalid Date` and propagates it silently. `DateTime.make` returns an
  `Option`, so a bad input stops at the parse.[^src-datetime]
- `Date` legitimately crosses real edges — `fs` mtimes, `Intl` formatting, vendor
  SDK arguments. Convert at the call with `DateTime.toDateUtc` (or read
  `DateTime.nowAsDate`) and let the `Date` die at that
  edge.[^applied-alchemy-lock] [^applied-opencode-builtins]
- Be aware this discipline is thinly practiced. One of seven surveyed repositories
  applies it end to end, and at a beta version; the only on-version repository is
  a counterexample, and livestore hardcodes `Date` into its SQLite column
  primitives so every consumer inherits it.[^applied-opencode-schema]
  [^applied-livestore] The upstream design intent is unambiguous; the community
  norm is not.

## Pick the boundary transform by what the edge hands you

```ts
import { DateTime, Effect, Schema } from "effect"

// Driver edge: the transform must match what the driver actually produces.
const FromPgTimestamp = Schema.DateTimeUtcFromDate    // pg/mysql hand back Date
const FromSqliteInteger = Schema.DateTimeUtcFromMillis // integer epoch column
const FromIsoText = Schema.DateTimeUtcFromString       // text column or public wire

// Both ends already hold DateTime values: the identity schema.
const Passthrough = Schema.DateTimeUtc

// Now edge: one read, threaded through everything the decision produces.
const admit = Effect.gen(function*() {
  const at = yield* DateTime.now
  yield* publishAdmitted({ occurredAt: at })
  return { admittedAt: at }
})
```

- The four names are `DateTimeUtc`, `DateTimeUtcFromDate`,
  `DateTimeUtcFromString`, and `DateTimeUtcFromMillis`. There is no `FromSelf` and
  no `FromNumber` at rc.111.[^src-schema-datetime]
- `Model` ships three parallel variant families — `DateTimeInsert` (string),
  `DateTimeInsertFromDate`, `DateTimeInsertFromNumber` — which is upstream saying
  the storage encoding is a per-column decision, not a global
  one.[^src-model]
- Decoding is safe by construction: all three transforms run through
  `SchemaGetter.dateTimeUtcFromInput`, which calls the `Option`-returning
  `DateTime.make` and fails with `SchemaIssue.InvalidValue`.[^src-schema-getter]
- `DateTime.makeUnsafe` and `fromDateUnsafe` **throw**. They are not the same
  conversion as `DateTimeUtcFromDate` and must not be substituted for it. Reserve
  them for inputs whose totality you already established — reading back a column
  your own writer produced with `toEpochMillis`.[^src-datetime]
  [^applied-opencode-input]
- Define the transform once and import it everywhere rather than restating it per
  table; that is what makes the wire and driver edges agree by
  construction.[^applied-opencode-schema]

## Model named spans as `Duration`

- A span that is configurable, named, or crosses an API signature is a
  `Duration.Input`, never a bare number with the unit in the identifier. The type
  states the unit; `timeoutMs: number` states it in a name that can
  drift.[^applied-effect-local-rules] [^src-duration]
- This is not a ban on milliseconds. `Duration.Input` admits a bare `number`
  meaning millis by design, and converting once with `Duration.toMillis` at
  construction and closing over the result is normal, widely applied
  practice.[^src-duration] [^applied-effect-local-rules]
- For serialization, decide by who reads it. `Schema.Duration` has a defined JSON
  codec at rc.111 — a tagged union over `Millis`, `Nanos`, and the infinities —
  which is a good fit when both ends are Effect.[^src-schema-datetime]
  [^applied-opencode-duration] On a public wire prefer a plain number with the
  unit in the field name, which is exactly what effect-local mandates and
  why.[^applied-effect-local-rules]

## Compare instants without hand arithmetic

- Compare with `DateTime.isLessThan`/`isLessThanOrEqualTo` and measure with
  `DateTime.distance`, which returns a `Duration` — not `.getTime()` subtraction.
  Upstream's cron staleness check is exactly this shape.[^src-cluster-cron]
  [^test-datetime]
- Choose by intent: `DateTime.add({ days: 1 })` takes calendar parts and accounts
  for the zone on days, weeks, months, and years; `addDuration`/`subtractDuration`
  add exact elapsed time. Calendar intent takes the parts API; deadline and
  elapsed-time intent take the `Duration` form.[^src-datetime]
  [^docs-datetime-creating]
- Best of all, do no arithmetic. Expiry a structure can own belongs to `Cache`
  `timeToLive` or a `Schedule`; both read the same `Clock`, so both stay
  controllable in tests and no deadline is stored.[^src-cache]
  [^applied-opencode-ticket]
- Treat this as the clearer spelling, not a review gate. `addDuration` and
  `subtractDuration` have zero applied uses across the surveyed repositories, and
  raw millisecond arithmetic remains the dominant applied pattern including at
  rc.111.[^applied-effect-local-rules]

## Read now once per decision through Effect Clock

- When Effect owns the carrier, `DateTime.now` is the read. When a scoped
  concern carries `Temporal.Instant`, use `Clock.currentTimeMillis` and map it
  at that carrier boundary. In either case, take the clock read once and thread
  the value through everything the decision produces, so a persisted event and
  the aggregate it returns cannot disagree about when it happened.
  [^applied-opencode-input] [^src-cluster-cron]
- The unit is the *decision*, not the program. A poll loop correctly hoists
  `startedAt` once and re-reads `now` on every iteration — those are two
  decisions.[^applied-alchemy-poll]
- `DateTime.nowUnsafe` reads `Date.now` directly and bypasses the `Clock`. It is
  the documented escape hatch for synchronous code where testability through
  `Clock` is not needed; inside an Effect program it silently costs you virtual
  time.[^src-datetime] [^src-internal-datetime]
- v4 suffixes the unsafe marker: `nowUnsafe`, `makeUnsafe`, `fromDateUnsafe`,
  `Duration.fromInputUnsafe`. There is no `DateTime.unsafeNow`.[^src-datetime]

## Keep the clock seam inside Effect

- The chain is mechanism, not convention: `DateTime.now` is
  `Clock.currentTimeMillis` mapped to a `Utc` value;[^src-internal-datetime]
  `Clock` is a `Context.Reference`;[^src-clock] `TestClock.layer` is
  `Layer.effect(Clock.Clock)`;[^src-testclock] and `@effect/vitest` merges
  `TestClock.layer()` into every `it.effect` with no opt-in.[^src-vitest-internal]
  Reading time through `DateTime.now` is therefore already injectable.
- When scoped instructions select `Temporal.Instant` as the domain carrier,
  map `Clock.currentTimeMillis` through
  `Temporal.Instant.fromEpochMilliseconds` at the carrier boundary. The same
  `TestClock` remains in control; only the value representation changes.
  [^src-clock] [^src-testclock] [^spec-temporal-instant]
- Do not add an injectable `now` parameter to Effect code. It is a second seam the
  harness does not know about, so the default virtual clock stops applying and
  every caller has to remember to pass it.[^applied-alchemy-credentials]
- The claim holds *inside* an Effect program. In a plain Promise module with no
  fiber context there is no `Clock` to replace, and an explicit injectable seam is
  the honest answer.
- Everything Clock-derived inherits the property — `Cache` TTL, `Schedule`,
  timeouts — so preferring those structures over stored deadlines buys
  determinism for free.[^src-cache] [^test-datetime] [Testing](testing.md) owns
  how to drive the clock from a test.

## Review checklist

- The effective scoped instruction selects the representation; Effect
  `DateTime.Utc` is the default only where Effect owns that concern.
- When Effect owns the representation, domain and service signatures carry
  `DateTime.Utc`; `Date` appears only at the call that requires it and does not
  survive past it.
- Each boundary schema uses the transform matching what that driver or wire
  actually produces, and the transform is defined once.
- `makeUnsafe`/`fromDateUnsafe` appear only where the input's validity is already
  established; unknown input decodes through a schema.
- Named and API-crossing spans are `Duration`; serialized spans either use
  `Schema.Duration` between Effect peers or name their unit in the field.
- Instant comparison uses `isLessThan`/`distance`; expiry is delegated to `Cache`
  or `Schedule` where a structure can own it.
- Current time is read once per decision through Effect `Clock`—with
  `DateTime.now` for an Effect-owned carrier, or with
  `Clock.currentTimeMillis` mapped at a Temporal-selected carrier boundary. No
  injectable `now` parameter shadows the `Clock` inside an Effect program.

[^docs-datetime]: `ai-docs/src/07_datetime/index.md` at `effect@4.0.0-rc.111` — "When working with dates and time, use the `DateTime` module instead of `Date` and `Date.now`", motivated by testable current time, safe parsing, and stable ISO formatting.
[^docs-datetime-creating]: `ai-docs/src/07_datetime/10_creating-and-formatting.ts` at `effect@4.0.0-rc.111` — `DateTime.now` for Clock-powered time ("ensures tests can use the `TestClock` module"), `DateTime.make` returning an `Option`, and `DateTime.add({ hours: 2 })` for calendar math.
[^src-datetime]: `packages/effect/src/DateTime.ts` at `effect@4.0.0-rc.111` — `Utc` (:50) over `epochMilliseconds`; `make` returns `Option` (:793) while `makeUnsafe` (:653) and `fromDateUnsafe` (:617) throw; `now` (:838), `nowAsDate` (:856), `nowUnsafe` (:882, "synchronous version of `now` that directly uses `Date.now()`"); `distance` (:1230), `isLessThan` (:1345), `toDateUtc` (:1520), `toEpochMillis` (:1617), `addDuration` (:2259), `subtractDuration` (:2281), `add` (:2308, "the time zone is taken into account when adding days, weeks, months, and years").
[^src-internal-datetime]: `packages/effect/src/internal/dateTime.ts` at `effect@4.0.0-rc.111` — `now = effect.map(Clock.currentTimeMillis, makeUtc)` (:313); `nowUnsafe = () => makeUtc(Date.now())`.
[^src-clock]: `packages/effect/src/Clock.ts` at `effect@4.0.0-rc.111` — `export const Clock: Context.Reference<Clock>` (:189).
[^spec-temporal-instant]: TC39 Temporal proposal §8.2.3 — `Temporal.Instant.fromEpochMilliseconds` converts a numeric Unix-epoch millisecond value into a `Temporal.Instant`.
[^src-schema-datetime]: `packages/effect/src/Schema.ts` at `effect@4.0.0-rc.111` — `DateTimeUtc` (:13695), `DateTimeUtcFromDate` (:13776), `DateTimeUtcFromString` (:13814), `DateTimeUtcFromMillis` (:13851); no `FromSelf` or `FromNumber` member exists. `Schema.Duration` (:12296) declares a `toCodecJson` link to a tagged union of `Infinity`, `NegativeInfinity`, `Nanos`, and `Millis`.
[^src-schema-getter]: `packages/effect/src/SchemaGetter.ts` at `effect@4.0.0-rc.111` — `dateTimeUtcFromInput` (:1631) matches on `DateTime.make` and fails with `SchemaIssue.InvalidValue`, then `DateTime.toUtc`.
[^src-model]: `packages/effect/src/unstable/schema/Model.ts` at `effect@4.0.0-rc.111` — `DateTimeInsert` (select `DateTimeUtcFromString`), `DateTimeInsertFromDate` (select `DateTimeUtcFromDate`), `DateTimeInsertFromNumber` (select `DateTimeUtcFromMillis`), each with a `json` variant.
[^src-duration]: `packages/effect/src/Duration.ts` at `effect@4.0.0-rc.111` — `Input` (:172) includes `number // millis`, `bigint // nanos`, `` `${number} ${Unit}` ``, and `DurationObject`; `fromInputUnsafe` (:242) and `toMillis` (:788) are first-class exports.
[^src-cache]: `packages/effect/src/Cache.ts` at `effect@4.0.0-rc.111` — `Cache.make` takes `timeToLive?: Duration.Input` (:298) and expiry is computed and tested against `ClockRef.currentTimeMillisUnsafe()` (:445, :488); the module's own examples advance `TestClock`.
[^src-cluster-cron]: `packages/effect/src/unstable/cluster/ClusterCron.ts` at `effect@4.0.0-rc.111` — one `const now = yield* DateTime.now` followed by `DateTime.isLessThan(dateTime, DateTime.subtractDuration(now, skipIfOlderThan))` (:105-107).
[^src-testclock]: `packages/effect/src/testing/TestClock.ts` at `effect@4.0.0-rc.111` — `layer = flow(make, Layer.effect(Clock.Clock))` (:436); `adjust` takes `Duration.Input` and `setTime` takes epoch millis.
[^src-vitest-internal]: `packages/vitest/src/internal/internal.ts` at `effect@4.0.0-rc.111` — `const TestEnv = Layer.mergeAll(TestConsole.layer, TestClock.layer())` (:44), provided to every `it.effect`.
[^test-datetime]: `packages/effect/test/DateTime.test.ts` at `effect@4.0.0-rc.111` — `TestClock.setTime(new Date("2023-12-31T11:00:00.000Z").getTime())` pins the instant; `DateTime.distance(now, tomorrow)` is asserted equal to `Duration.fromInputUnsafe("1 day")`.
[^applied-opencode-schema]: Observed in opencode@65c3597 `packages/schema/src/schema.ts` (effect 4.0.0-beta.83) — one shared `Finite → Schema.DateTimeUtc` transform reused by `session.ts`, `session-input.ts`, `session-event.ts`, and `session-message.ts` so wire and storage cannot disagree.
[^applied-opencode-input]: Observed in opencode@65c3597 `packages/core/src/session/input.ts` (effect 4.0.0-beta.83) — one `yield* DateTime.now` supplies both the published `PromptAdmitted` payload and the returned aggregate's `timeCreated`; the write path uses `DateTime.toEpochMillis` and the read path `DateTime.makeUnsafe` on the column its own writer produced.
[^applied-opencode-builtins]: Observed in opencode@65c3597 `packages/core/src/system-context/builtins.ts` (effect 4.0.0-beta.83) — `DateTime.nowAsDate` formatted straight into prompt text, pinned in `packages/core/test/system-context/builtins.test.ts` by `TestClock.setTime` plus a 24-hour advance.
[^applied-opencode-duration]: Observed in opencode@65c3597 `packages/opencode/src/account/schema.ts` (effect 4.0.0-beta.83) — `expiry: Schema.Duration` and `interval: Schema.Duration` inside a device-login response class.
[^applied-opencode-ticket]: Observed in opencode@65c3597 `packages/core/src/pty/ticket.ts` (effect 4.0.0-beta.83) — `Cache.make({ capacity, lookup, timeToLive })` owns ticket expiry; no deadline is stored or compared.
[^applied-alchemy-poll]: Observed in alchemy-effect@1596e50 `packages/alchemy/src/Planetscale/Util.ts` (effect 4.0.0-rc.110) — `startedAt` read once before `pollUntil` (:80) while `now` is re-read inside each iteration to report elapsed seconds (:85).
[^applied-alchemy-lock]: Observed in alchemy-effect@1596e50 `packages/alchemy/src/Auth/Lock.ts` (effect 4.0.0-rc.110) — `Clock.currentTimeMillis` mapped to `new Date(now)` solely to call `fs.utimes` (:119-122), with an in-source note that `utimes` reads a bare number as seconds.
[^applied-alchemy-credentials]: Observed in alchemy-effect@1596e50 `packages/alchemy/src/Cloudflare/Credentials.ts` (effect 4.0.0-rc.110) — `cacheUntilExpiry(resolve, now: () => number = () => Date.now())` (:69), a hand-rolled clock parameter inside Effect code that the accompanying tests must supply manually. Cited as a counterexample.
[^applied-livestore]: Observed in livestore@31e8d71 `packages/@livestore/common/src/schema/state/sqlite/db-schema/dsl/field-defs.ts` (effect 4.0.0-beta.99) — the `datetime` and `datetimeInteger` column primitives are fixed to `Schema.DateFromString` and `Schema.DateFromMillis`, so every table built on the DSL decodes to `Date`. Cited as a counterexample.
[^applied-effect-local-rules]: Observed in effect-local@faa52d9 `RULES.md` (effect 4.0.0-beta.103) — "Express a configurable duration as `Duration.Input`, never as a bare number named with a unit suffix" (:83); "Convert a configured duration once, with `Duration.toMillis`, at the point the Layer or service is constructed … Do not thread `Duration.Input` into arithmetic" (:84); "A duration that crosses a wire protocol or is persisted stays a plain number with its unit in the name" (:85).
