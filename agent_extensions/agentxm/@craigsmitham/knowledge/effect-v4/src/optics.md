---
type: Checklist
title: Optics
description: Evaluate whether reusable immutable focus operations are lawful, appropriately strong, and clearer than direct updates.
tags: [effect, effect-v4, optic, immutable-update, optional, union]
status: stable
sources:
  - id: effect-optic
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/effect/src/Optic.ts
    title: Effect 4.0.0-rc.112 Optic source
generated: { by: codex/gpt-5.6, at: 2026-08-29T19:19:50Z }
---

# Optics

- [ ] Introduce an optic only when a nested, optional, indexed, or union focus
  is reused enough to be clearer than a direct immutable update.
- [ ] Choose the weakest truthful optic: total lens, optional focus, prism,
  traversal, or isomorphism.
- [ ] Keep absence or a non-matching union case explicit in the operation result;
  do not silently invent a default focus.
- [ ] Preserve the surrounding structure and unrelated fields when reading,
  setting, or modifying a focus.
- [ ] Define shared optics near the model they describe and name them for domain
  meaning rather than incidental property paths.
- [ ] Use a schema/class isomorphism when focusing through a class representation
  requires a lawful conversion rather than an unsafe cast.
- [ ] Avoid a long optic pipeline when an ordinary named transformation better
  communicates branching or validation.
- [ ] Test get/set and set/get laws where applicable, plus missing, non-matching,
  and multi-focus traversal cases.

## Resources

- [Optic source](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/effect/src/Optic.ts)
