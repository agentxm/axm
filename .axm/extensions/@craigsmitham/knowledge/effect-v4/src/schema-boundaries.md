---
type: Guide
title: Schema boundaries
description: Designing the line between unknown, encoded, and domain values; use when JSON is cast, validation is duplicated, or constructors bypass invariants.
tags: [effect, effect-v4, schema, decoding, encoding, validation, boundaries, unknown]
status: stable
sources:
  - id: origin-skill
    resource: https://github.com/craigsmitham/agent-extensions/blob/48dc2f0293bfec9f4ad27144e9cd8e9bcbbe203e/.axm/extensions/%40craigsmitham/skills/effect-v4-schema-boundaries/src/SKILL.md
    title: effect-v4-schema-boundaries skill 0.1.0 (retired into this bundle)
generated:
  by: claude/opus-5
  at: 2026-08-12T16:20:19Z
---

# Schema boundaries

Decode once at ingress, use trusted domain values internally, and encode at egress.

**Applies when** JSON or external input is cast, validation is duplicated or ad
hoc, wire and domain representations differ, constructors bypass invariants, or
output is encoded manually — even without current Schema usage.

**Leave alone** data already trusted and kept inside a validated boundary.

Related: [Branded types](branded-types.md) for the scalar invariants a schema
reuses, [Option](option.md) for nullish encoded fields, [Error
modeling](error-modeling.md) for translating parse failures at the protocol
boundary.

## Establish the boundary

- Treat network, storage, environment, form, and parsed JSON values as `unknown`.
- Use an unknown decoder at the first trusted boundary; never cast external data into the domain type.
- Use a schema's `make` or `makeEffect` for already-typed construction when type-side validation is still required, not as a substitute for decoding unknown input.
- Use Effectful decoding when transformations or validation require services or asynchronous work.

## Own representation changes

- Let a schema transformation define the relationship between encoded and domain representations.
- Keep wire compatibility decisions at adapters; do not leak encoded shapes through the domain.
- Encode through the same schema used to define the boundary.
- Choose strictness deliberately for extra fields, coercion, defaults, and optionality.

## Keep one source of truth

- Reuse schema-derived types and constructors instead of parallel interfaces, predicates, and validators.
- Preserve structured schema issues long enough to produce useful path-aware diagnostics.
- Map parse failures to domain or protocol errors only where that vocabulary belongs.
- Test round trips and representative invalid inputs, especially at transformations.

Do not validate repeatedly after a value has crossed a trustworthy boundary.

## Keep names and types aligned

```ts
import { Schema } from "effect"

export const UserSchema = Schema.Struct({
  id: UserIdSchema,
  displayName: Schema.String,
})

export type User = typeof UserSchema.Type
```

- Name a reusable schema `<TypeName>Schema` and derive `<TypeName>` from its
  `.Type`. Export them together when consumers need both runtime and static
  contracts.
- Use `.Encoded` when code truly works with the wire representation; do not
  substitute it for the trusted domain type.
- Define branded scalar invariants once and reuse their schema at every ingress.
- Avoid parallel TypeScript interfaces whose fields can drift from the schema.

## Decode, construct, and encode intentionally

- Decode `unknown` input with a Schema decoder and retain structured issues long
  enough to report the failing path.
- Use `Schema.make`/`makeEffect` only for already-typed construction that still
  needs schema-side validation or transformation.
- Put defaults, optionality, nullish conversion, and representation transforms
  in the schema that owns that boundary.
- Test valid decode, representative invalid paths, domain construction, encode,
  and round-trip laws where the transform claims reversibility.

## Review checklist

- Every external input enters as `unknown` and is decoded once.
- Schema and derived type share one exported naming pair.
- Encoded and domain representations are not mixed inside feature logic.
- Transformations and defaults have explicit direction and compatibility rules.
- Error translation preserves useful schema paths at the protocol boundary.
