---
type: Checklist
title: Schema boundaries
description: Evaluate whether external representations cross one explicit, validated boundary into trusted domain values.
tags: [effect, effect-v4, schema, decoding, encoding, validation, boundaries]
status: stable
sources:
  - id: effect-schema
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0/ai-docs/src/01_effect/02_schema/10_schema-basics.ts
    title: Effect 4.0.0 schema basics
  - id: effect-schema-source
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0/packages/effect/src/Schema.ts
    title: Effect 4.0.0 Schema source
  - id: effect-parser-policy
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0/packages/effect/src/SchemaAST.ts
    title: Effect 4.0.0 Schema parse options
  - id: effect-parser-changes
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0/packages/effect/CHANGELOG.md#L1285
    title: Effect 4.0.0 changelog, rc.113 Schema parsing changes
generated: { by: claude/opus-5.5, at: 2026-10-01T19:24:06Z }
---

# Schema boundaries

- [ ] Treat network, storage, environment, form, and parsed JSON values as
  `unknown`; decode them at the first trusted boundary instead of casting.
- [ ] Keep one schema as the source of truth for the decoded type, encoded
  representation, validation, defaults, and transformations it owns.
- [ ] Choose whether to discard or reject unknown properties at the parsing
  operation or the contract that owns it; model retained extra fields in the
  schema.[^effect-parser-policy]
- [ ] Check declared fields are own properties before decoding when the boundary
  forbids inherited values.[^effect-parser-changes]
- [ ] Distinguish encoded values from domain values so wire or storage shapes
  do not leak into application logic.
- [ ] Construct invariant-bearing values through the schema's validated
  constructors; do not bypass them with assertions or object literals.
- [ ] Use the matching Effect-returning decoder when decoding belongs inside an
  Effect program, so `SchemaError` remains visible in the error channel.
- [ ] Preserve structured issue paths until the owning boundary translates a
  schema failure into domain or protocol vocabulary.
- [ ] Encode outbound values through the same schema relationship used at
  ingress rather than rebuilding payloads ad hoc.
- [ ] Test representative valid values, every important invalid invariant, and
  an encode/decode round trip when both directions are supported.

## Resources

- [Schema basics](https://github.com/Effect-TS/effect/blob/effect%404.0.0/ai-docs/src/01_effect/02_schema/10_schema-basics.ts)
- [Schema source](https://github.com/Effect-TS/effect/blob/effect%404.0.0/packages/effect/src/Schema.ts)
- [Schema parse options](https://github.com/Effect-TS/effect/blob/effect%404.0.0/packages/effect/src/SchemaAST.ts)
- [Schema parsing changes (rc.113 changelog)](https://github.com/Effect-TS/effect/blob/effect%404.0.0/packages/effect/CHANGELOG.md#L1285)

[^effect-parser-policy]: Effect Schema parse options.
[^effect-parser-changes]: Effect Schema parsing migration.
