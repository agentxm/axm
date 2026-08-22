---
type: Guide
title: Schema boundaries
description: Designing the line between unknown, encoded, and domain values and choosing the domain carrier; use when JSON is cast, validation is duplicated, or constructors bypass invariants.
tags: [effect, effect-v4, schema, decoding, encoding, validation, boundaries, unknown]
status: stable
sources:
  - id: docs-schema-basics
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.110/ai-docs/src/01_effect/02_schema/10_schema-basics.ts
    title: Official Effect docs — decode unknown at edges, encode back through one schema, Schema.Class as domain carrier (effect 4.0.0-rc.110)
  - id: schema-md
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.110/packages/effect/SCHEMA.md
    title: Official SCHEMA.md guide — constructors, transformations, classes and opaque structs, filters (effect 4.0.0-rc.110)
  - id: src-schema
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.110/packages/effect/src/Schema.ts
    title: Schema module source — decodeUnknownEffect, encodeEffect, instance .make/.makeOption/.makeEffect, SchemaError (effect 4.0.0-rc.110)
  - id: src-schema-ast
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.110/packages/effect/src/SchemaAST.ts
    title: SchemaAST module source — ParseOptions strictness including onExcessProperty (effect 4.0.0-rc.110)
  - id: applied-effect-local
    resource: https://github.com/lucas-barake/effect-local/blob/faa52d91faad10817906750c8cf02c71852a5521/packages/local-browser/src/internal/wireCodec.ts
    title: effect-local@faa52d9 — wire-boundary codec translating SchemaError to a domain error
  - id: applied-opencode
    resource: https://github.com/anomalyco/opencode/blob/2cba7e227d68a7e7e4a2aa9c85b808e8ecb14daf/packages/core/src/ripgrep.ts
    title: opencode@2cba7e2 — external process JSON decoded at first contact
  - id: origin-skill
    resource: https://github.com/craigsmitham/agent-extensions/blob/48dc2f0293bfec9f4ad27144e9cd8e9bcbbe203e/.axm/extensions/%40craigsmitham/skills/effect-v4-schema-boundaries/src/SKILL.md
    title: effect-v4-schema-boundaries skill 0.1.0 (retired into this bundle; lineage only)
generated:
  by: claude/fable-5
  at: 2026-08-17T14:21:09Z
verified:
  - by: claude/fable-5
    at: 2026-08-17T14:21:09Z
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

- Treat network, storage, environment, form, and parsed JSON values as
  `unknown`. Decode them with an unknown decoder such as
  `Schema.decodeUnknownEffect` at the first trusted boundary; never cast
  external data into the domain type.[^docs-schema-basics] [^applied-opencode]
- Use a schema instance's `.make`/`.makeEffect` (or `.makeOption`) for
  already-typed construction that still needs type-side validation, not as a
  substitute for decoding unknown input. Module-level `Schema.make(ast)` is a
  different function: it builds a schema from an AST, not a
  value.[^src-schema]
- Use Effectful decoding when transformations or validation require services
  or asynchronous work; the decode result carries the schema's
  `DecodingServices`.[^src-schema]
- Decode failures stay structured: `SchemaError` wraps a path-aware issue.
  Preserve it long enough to report the failing path, and map it to domain or
  protocol errors only where that vocabulary
  belongs.[^applied-effect-local]

## Own representation changes

- Let a schema transformation define the relationship between encoded and
  domain representations, and encode at egress through the same schema that
  decoded ingress.[^docs-schema-basics]
- Keep wire compatibility decisions at adapters; do not leak encoded shapes
  through the domain.
- Put defaults, optionality, nullish conversion, and representation transforms
  in the schema that owns that boundary. The `Option`-to-nullable bridge is
  owned by [Option](option.md).
- Choose strictness deliberately: excess-property handling is a `ParseOptions`
  decision (`onExcessProperty: "ignore" | "error" | "preserve"`), not an
  accident.[^src-schema-ast]

## Choose the domain carrier

```ts
import { Schema } from "effect";

// Structural data: a Struct plus its derived type.
export const UserSchema = Schema.Struct({
  id: UserIdSchema,
  displayName: Schema.String,
});
export type User = typeof UserSchema.Type;

// Domain model constructed only from valid data: a class carrier.
export class Account extends Schema.Class<Account>("app/Account")({
  id: AccountIdSchema,
  displayName: Schema.String,
}) {}
```

- Default to `Schema.Struct`: name the schema `<TypeName>Schema`, derive
  `<TypeName>` from its `.Type`, and export them together when consumers need
  both runtime and static contracts.
- Choose `Schema.Class` when a domain model should only be constructed from
  valid data or benefits from methods and `instanceof`: the class itself is
  the validated type, and both `new` and the static `.make` construct through
  the schema.[^docs-schema-basics] [^schema-md]
- `Schema.Opaque` sits between: a distinct TypeScript type over a plain
  struct, without prototype-backed instances or methods.[^schema-md]
- Use `.Encoded` when code truly works with the wire representation; do not
  substitute it for the trusted domain type.

## Keep one source of truth

- Reuse schema-derived types and constructors instead of parallel interfaces,
  predicates, and validators whose fields can drift from the schema.
- Do not validate repeatedly after a value has crossed a trustworthy boundary.
- Test valid decode, representative invalid paths, typed construction, encode,
  and round-trip laws where a transformation claims reversibility.

## Review checklist

- Every external input enters as `unknown` and is decoded once.
- Already-typed construction uses the schema instance's `.make`/`.makeEffect`;
  nothing is merely cast.
- Schema and derived type — or the class carrier — share one exported naming
  decision.
- Encoded and domain representations are not mixed inside feature logic.
- Transformations, defaults, and excess-property strictness have explicit
  direction and compatibility rules.
- Error translation preserves useful schema paths at the protocol boundary.

[^docs-schema-basics]: `ai-docs/src/01_effect/02_schema/10_schema-basics.ts` at `effect@4.0.0-rc.110` — decode unknown at edges, encode back through the same schema, `Schema.Class` "for domain models that should only be constructed from valid data".

[^src-schema]: `packages/effect/src/Schema.ts` at `effect@4.0.0-rc.110` — instance `.make`/`.makeOption`/`.makeEffect`; module-level `Schema.make(ast)`; `decodeUnknownEffect` carries `DecodingServices` and fails with `SchemaError` wrapping a structured issue.

[^src-schema-ast]: `packages/effect/src/SchemaAST.ts` at `effect@4.0.0-rc.110` — `ParseOptions.onExcessProperty`.

[^schema-md]: `packages/effect/SCHEMA.md` at `effect@4.0.0-rc.110` — "Classes and Opaque Types", "Class API", "Constructors in Composed Schemas".

[^applied-effect-local]: Observed in effect-local@faa52d9 `packages/local-browser/src/internal/wireCodec.ts` (effect 4.0.0-beta.103).

[^applied-opencode]: Observed in opencode@2cba7e2 `packages/core/src/ripgrep.ts` and `packages/core/src/config.ts` (effect 4.0.0-beta.83).
