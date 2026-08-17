---
type: Guide
title: Option
description: Modeling meaningful absence and translating nullable boundaries; use when lookups can miss without failing, null checks repeat, or schemas encode nullish fields.
tags: [effect, effect-v4, option, absence, nullable, optionality, boundaries]
status: stable
sources:
  - id: src-option
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.110/packages/effect/src/Option.ts
    title: Option module source — fromNullishOr/fromNullOr/fromUndefinedOr, getOrNull/getOrUndefined, match/map/flatMap (effect 4.0.0-rc.110)
  - id: schema-md
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.110/packages/effect/SCHEMA.md
    title: Official SCHEMA.md guide — "Optional Fields as Options" nullability and optional-key bridges (effect 4.0.0-rc.110)
  - id: src-schema
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.110/packages/effect/src/Schema.ts
    title: Schema module source — OptionFromNullOr, OptionFromNullishOr, OptionFromUndefinedOr, OptionFromOptionalKey (effect 4.0.0-rc.110)
  - id: test-option
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.110/packages/effect/test/Option.test.ts
    title: Option tests — version-matched combinator and conversion behavior (effect 4.0.0-rc.110)
  - id: applied-livestore
    resource: https://github.com/livestorejs/livestore/blob/31e8d71134c5f4d89c21f6b1e3b6b5b39eeacd4e/packages/%40livestore/common/src/leader-thread/eventlog.ts
    title: livestore@31e8d71 — Option.fromNullishOr converting a nullable SQL column at the persistence edge
  - id: applied-opencode
    resource: https://github.com/anomalyco/opencode/blob/2cba7e227d68a7e7e4a2aa9c85b808e8ecb14daf/packages/llm/src/route/client.ts
    title: opencode@2cba7e2 — Option held internally and lowered with getOrUndefined only at egress
  - id: origin-skill
    resource: https://github.com/craigsmitham/agent-extensions/blob/48dc2f0293bfec9f4ad27144e9cd8e9bcbbe203e/.axm/extensions/%40craigsmitham/skills/effect-v4-option/src/SKILL.md
    title: effect-v4-option skill 0.1.0 (retired into this bundle; lineage only)
generated:
  by: claude/fable-5
  at: 2026-08-17T14:21:09Z
verified:
  - by: claude/fable-5
    at: 2026-08-17T14:21:09Z
---

# Option

Use `Option<A>` when absence is an ordinary domain state; use a typed error when
the caller must handle a failure.

**Applies when** optional values flow through Effect pipelines, lookups can miss
without failing, null checks repeat, schemas encode nullish fields, or API and
persistence forms differ.

**Leave alone** boolean flags, values with a natural required default, and
failures that need an error channel.

Related: [Error modeling](error-modeling.md) for the failure/absence boundary,
[Schema boundaries](schema-boundaries.md) for where transformations belong,
[Collections](collections.md) for Option-aware traversal.

## Decide where absence belongs

- Use `Option` when downstream code maps, filters, flatMaps, or pattern-matches
  over an optional value and no natural default exists.
- Use nullable or optional properties at JSON, database, DOM, and third-party
  boundaries when that is the external contract.
- Use a required boolean for an on/off choice. Do not encode flags as the
  presence of unrelated data.
- Prefer a required parameter with the default resolved at one boundary over an
  optional parameter immediately unwrapped by every implementation.

## Convert once at each edge

```ts
import { Option } from "effect"

const domainValue = Option.fromNullishOr(input.value)
const encodedValue = Option.getOrNull(domainValue)
```

- Convert inward with `Option.fromNullishOr` as soon as untrusted nullish data
  enters the Effect-owned domain: `null` and `undefined` become `None`; every
  other value — including falsy ones — stays `Some`. Use `fromNullOr` or
  `fromUndefinedOr` when only one sentinel means
  absence.[^src-option] [^applied-livestore]
- Convert outward with `Option.getOrNull` or `Option.getOrUndefined` only when
  the target representation requires it.[^applied-opencode]
- Do not wrap and immediately unwrap in the same scope.
- When a schema owns the boundary, use the official bridges —
  `Schema.OptionFromNullOr`, `Schema.OptionFromNullishOr`,
  `Schema.OptionFromUndefinedOr`, and `Schema.OptionFromOptionalKey` — so
  nullish or missing encoded fields decode straight to `Option` instead of
  hand-written conversion at every call site.[^src-schema]

## Compose exhaustively

- Use `Option.match` when both branches matter, `map` for a present-value
  transform, and `flatMap` when the next computation may also be
  absent.[^src-option]
- Use `Effect<Option<A>, E>` when an operation can both fail and legitimately
  return no value. Do not convert `None` into a defect.
- Traverse collections of optional values with one single-pass Option-aware
  operation rather than a map-then-filter chain;
  [Collections](collections.md) owns the operation choice.
- In configuration, distinguish genuinely optional values from values with a
  deliberate default; do not read `Option` only to discard it immediately.

## Review checklist

- Absence, defaulting, boolean choice, and failure are not conflated.
- Nullish conversion happens only at system boundaries.
- Option branches are handled explicitly where behavior diverges.
- A `Schema.OptionFrom*` bridge or one boundary adapter owns serialized
  null/undefined semantics.
- Types within one public interface use a consistent optionality convention.

[^src-option]: `packages/effect/src/Option.ts` at `effect@4.0.0-rc.110` — `fromNullishOr` (`@since 4.0.0`; null/undefined to `None`, other values to `Some<NonNullable<A>>`), `fromNullOr`, `fromUndefinedOr`, `getOrNull`, `getOrUndefined`, `match`, `map`, `flatMap`.
[^src-schema]: `packages/effect/src/Schema.ts` at `effect@4.0.0-rc.110` — `OptionFromNullOr`, `OptionFromUndefinedOr`, `OptionFromNullishOr` (with `onNoneEncoding`), `OptionFromOptionalKey`; documented in `packages/effect/SCHEMA.md` "Optional Fields as Options".
[^applied-livestore]: Observed in livestore@31e8d71 `packages/@livestore/common/src/leader-thread/eventlog.ts` (effect 4.0.0-beta.99).
[^applied-opencode]: Observed in opencode@2cba7e2 `packages/llm/src/route/client.ts` (effect 4.0.0-beta.83).
