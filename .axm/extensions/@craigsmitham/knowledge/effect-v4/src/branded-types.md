---
type: Guide
title: Branded types
description: Preventing invalid primitive substitution; use when IDs or units share representations or raw scalars cross meaningful boundaries.
tags: [effect, effect-v4, brand, branded-types, invariants, nominal-typing, scalars]
status: stable
sources:
  - id: origin-skill
    resource: https://github.com/craigsmitham/agent-extensions/blob/48dc2f0293bfec9f4ad27144e9cd8e9bcbbe203e/.axm/extensions/%40craigsmitham/skills/effect-v4-branded-types/src/SKILL.md
    title: effect-v4-branded-types skill 0.1.0 (retired into this bundle)
generated:
  by: claude/opus-5
  at: 2026-08-12T16:20:19Z
---

# Branded types

Use branded types to make invalid substitutions unrepresentable while preserving
the primitive's runtime representation. Encourage them at meaningful
boundaries, not on every primitive.

**Applies when** IDs or units share representations, validation is duplicated or
ad hoc, raw strings or numbers cross meaningful boundaries, or APIs would
benefit from distinguishing semantically different values — even without
existing Brand usage.

**Leave alone** short-lived primitives with no interchange or invariant risk,
and values that need a runtime wrapper.

Related: [Schema boundaries](schema-boundaries.md) for where branded scalars are
decoded, [Option](option.md) for construction that may legitimately produce
nothing.

Before editing, inspect the installed `Brand` and `Schema` source for current
signatures rather than relying on memory or reproducing the API reference in
project documentation.

## Make the modeling decision

Brand a value when at least one of these is true:

- Two values share a TypeScript representation but are not interchangeable,
  such as `UserId` and `OrderId`.
- A scalar must satisfy an invariant after construction, such as `Port`,
  `NonEmptyName`, or `PositiveInt`.
- A unit or format is easy to confuse, such as milliseconds versus seconds or
  encoded versus decoded text.
- A function signature becomes materially clearer by naming the scalar concept.

Do not add a brand when:

- The value is a short-lived local with only one possible meaning.
- An existing object type already distinguishes the concept adequately.
- The value needs runtime fields, behavior, encapsulation, or a different wire
  representation; use a schema transformation, class, or value object.
- The type would merely restate a property name without protecting a boundary.

Brands are compile-time evidence. They do not wrap the value, survive an unsafe
cast, validate deserialized data automatically, or provide runtime secrecy.

## Choose one source of truth

Prefer a schema-owned brand when parsing or validation already belongs to a
schema. Apply validation before branding, and derive the TypeScript type from
the schema:

```ts
import { Schema } from "effect"

export const UserId = Schema.String
  .check(Schema.isUUID(7))
  .pipe(Schema.brand("my-app/UserId"))

export type UserId = typeof UserId.Type
```

Prefer a `Brand.Constructor` when code must construct or validate the value
independently of decoding:

```ts
import { Brand, Schema } from "effect"

export type Port = Brand.Branded<number, "my-app/Port">

export const Port = Brand.check<Port>(
  Schema.isInt(),
  Schema.isBetween({ minimum: 1, maximum: 65_535 })
)
```

If both APIs need the same invariant, define the constructor once and project
it into a schema with `Schema.fromBrand`:

```ts
export const PortSchema = Schema.Number.pipe(
  Schema.fromBrand("my-app/Port", Port)
)
```

Do not duplicate the same validation separately in a constructor and a schema.
Use a nominal constructor when the distinction is semantic and every base value
is valid. Use a validating constructor when construction must prove an
invariant. Compose independently meaningful invariants instead of creating a
large, duplicated predicate.

Use stable, domain-qualified brand keys in shared code. Reusing the same string
key makes separately declared brands compatible, so `"Id"` is usually too
weak for a library or large application.

## Establish trusted boundaries

Make the branded type the internal API and keep raw primitives at the edges:

```ts
const loadUser = (id: UserId) => repository.findById(id)

const handle = (rawId: unknown) =>
  Schema.decodeUnknownEffect(UserId)(rawId).pipe(
    Effect.flatMap(loadUser)
  )
```

Decode unknown external data with the schema. For typed raw values, choose the
constructor's failure form to match the surrounding control flow. Keep expected
validation failures in `Result`, `Option`, schema, or `Effect` channels; reserve
throwing construction for trusted constants, tests, or explicitly throwing
APIs.

Construct nominal values only where provenance makes them trustworthy, such as
an ID returned by the system's own generator. Nominal construction does no
runtime validation.

## Preserve the invariant

- Accept branded values in domain functions; do not repeatedly accept the base
  primitive and reconstruct internally.
- Return branded values from generators, repositories, and decoders.
- Revalidate after an operation that can break the invariant. Arithmetic and
  string manipulation normally return the unbranded base type.
- Let branded values widen to their base type for serialization or primitive
  operations when safe. Do not add an `unbrand` cast.
- Keep `as BrandType`, `as any`, and double assertions out of application code.
  If a trusted integration forces a cast, isolate and document that boundary.

When reviewing existing code, look for raw IDs, units, constrained scalars, and
repeated boundary validation. Recommend a brand only when it removes a concrete
class of substitutions or centralizes a real invariant; avoid broad mechanical
branding.

## Verify the boundary

Add focused tests that prove:

- Valid raw input constructs or decodes to the branded type.
- Invalid input fails through the chosen `Result`, `Option`, schema, or `Effect`
  channel.
- Different brands with the same base type cannot be passed interchangeably.
- Serialization retains the expected primitive representation.

Use a compile-time assertion such as `@ts-expect-error` for the
non-interchangeability check, and run the project's typecheck plus the relevant
runtime tests.
