# Effect Option Guide

Guidance for choosing between `Option<T>`, `T | null`, `T | undefined`, and
optional properties in this repo. The goal is simple: use `Option` where
absence is part of Effect composition, and keep nullable values at system
boundaries.

> [Effect](../../AGENTS.md#effect) - critical guidance
>
> [Effect](../../CLAUDE.md#effect) - duplicate agent copy

## Key Resources

- [Effect Option docs](https://effect.website/docs/data-types/option/) -
  Official API reference
- [Effect Guide](./effect.md) - Main Effect conventions
- [TypeScript Style Guide](./typescript-style.md) - Null handling and narrowing

---

## When to Use Option

Use `Option<T>` when presence or absence should compose through Effect code.

Good fits:

- values that move through `Effect.gen`, `map`, or `flatMap`
- partial lookups like `find`, `resolve`, or optional settings reads
- service or layer parameters where absence changes behavior
- cases where the caller, not the callee, should decide the fallback

Avoid `Option<boolean>`. If the value is a flag, make it a `boolean`.

---

## When to Use null or undefined

Use nullable values at interop boundaries where `Option` would just add
conversion noise.

- Use `T | null` when serialized output should preserve an intentional null
- Use `T | undefined` for plain TypeScript optional parameters and third-party
  APIs that already speak `undefined`
- Use optional object properties when omission, not explicit absence, is the
  external contract

Inside Effect-heavy code, convert nullable input early and convert back late.

---

## Boundary Conversions

Preferred pattern:

```typescript
import { Option } from "effect";

const incoming = Option.fromNullishOr(maybeValue);
const outgoing = Option.getOrUndefined(incoming);
const outgoingNull = Option.getOrNull(incoming);
```

- Convert to `Option` at the edge of Effect-managed code
- Keep values as `Option` while composing
- Convert back to `null` or `undefined` only at the external boundary

---

## Layer and Service Parameters

Layer factories and service interfaces are where these choices matter most.

- Prefer `Option<T>` for semantically optional values passed through multiple
  Effect layers
- Prefer required parameters plus explicit `Option.none()` over hidden optional
  properties
- Resolve defaults inside the factory with `Option.getOrElse`
- Keep booleans as required `boolean`

---

## See Also

- [Effect Guide](./effect.md) - Broader Effect patterns
- [Effect v4 Quick Reference](./effect-v4-quick-ref.md) - Related API changes
