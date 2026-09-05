---
type: Checklist
title: Branded types
description: Evaluate whether meaningful scalar identities and refinements prevent invalid substitution without weakening boundary validation.
tags: [effect, effect-v4, brand, schema, nominal-types, refined-types]
status: stable
sources:
  - id: effect-brand
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/effect/src/Brand.ts
    title: Effect 4.0.0-rc.112 Brand source
  - id: effect-schema-brand
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/effect/src/Schema.ts
    title: Effect 4.0.0-rc.112 Schema brand support
generated: { by: codex/gpt-5.6, at: 2026-08-29T19:19:50Z }
---

# Branded types

- [ ] Brand scalars only where accidentally substituting the same underlying
  TypeScript type would be a meaningful defect, such as mixing two IDs or units.
- [ ] Choose nominal branding for identity alone and a refined schema when the
  value must also satisfy runtime constraints.
- [ ] Define one exported constructor or schema for each brand instead of
  scattering assertions throughout the codebase.
- [ ] Decode branded values at external boundaries; do not claim that an
  unvalidated string or number already carries the brand.
- [ ] Keep service and domain signatures branded long enough to prevent the
  substitution the brand was introduced to stop.
- [ ] Make representation changes explicit so mapping, serialization, or
  arithmetic does not silently discard or invent a brand.
- [ ] Avoid brands that merely restate an existing distinct domain class or add
  ceremony without ruling out a concrete invalid state.
- [ ] Test rejection of invalid refined values and successful schema
  encode/decode for values that cross a boundary.

## Resources

- [Brand source](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/effect/src/Brand.ts)
- [Schema brand support](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/effect/src/Schema.ts)
