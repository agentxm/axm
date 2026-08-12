---
name: effect-v4-option
description: Models meaningful absence with Effect v4 Option and translates nullable boundaries safely. Use when optional values flow through Effect pipelines, lookups can miss without failing, null checks repeat, schemas encode nullish fields, or API and persistence forms differ. Skip boolean flags, values with a natural required default, and failures that need an error channel.
compatibility: Effect 4.0.0-beta.107
---

# Effect v4 Option

Target exactly `effect@4.0.0-beta.107`. Use `Option<A>` when absence is an
ordinary domain state; use a typed error when the caller must handle a failure.

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
  enters the Effect-owned domain.
- Convert outward with `Option.getOrNull` or `Option.getOrUndefined` only when
  the target representation requires it.
- Do not wrap and immediately unwrap in the same scope.
- Let Schema own repeated encoded/domain transformations instead of hand-writing
  them at every call site.

## Compose exhaustively

- Use `Option.match` when both branches matter, `map` for a present-value
  transform, and `flatMap` when the next computation may also be absent.
- Use `Effect<Option<A>, E>` when an operation can both fail and legitimately
  return no value. Do not convert `None` into a defect.
- For collections, prefer `Array.filterMap`, `Array.getSomes`, or another
  single-pass Option-aware operation.
- In configuration, distinguish genuinely optional values from values with a
  deliberate default; do not read `Option` only to discard it immediately.

## Review checklist

- Absence, defaulting, boolean choice, and failure are not conflated.
- Nullish conversion happens only at system boundaries.
- Option branches are handled explicitly where behavior diverges.
- Schema or one boundary adapter owns serialized null/undefined semantics.
- Types within one public interface use a consistent optionality convention.
