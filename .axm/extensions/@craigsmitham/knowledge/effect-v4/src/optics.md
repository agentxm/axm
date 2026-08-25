---
type: Guide
title: Optics
description: Reusable immutable reads and updates; use when nested paths repeat, updates target optional data or union variants, or focus logic should compose across modules.
tags: [effect, effect-v4, optic, lens, prism, optional, iso, traversal, immutability]
status: stable
sources:
  - id: docs-optic
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.111/packages/effect/OPTIC.md
    title: Official Optic module guide — mental model, key/optionalKey semantics, traversals, Schema.toIso, plain-objects limitation (effect 4.0.0-rc.111)
  - id: src-optic
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.111/packages/effect/src/Optic.ts
    title: Optic module source — type hierarchy, failure semantics, check/refine setters, structural sharing (effect 4.0.0-rc.111)
  - id: test-optic
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.111/packages/effect/test/Optic.test.ts
    title: Optic tests — key/optionalKey/check/refine/tag/at/forEach behavior, non-plain-object throw (effect 4.0.0-rc.111)
  - id: src-schema
    resource: https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.111/packages/effect/src/Schema.ts
    title: Schema module source — Schema.toIso returning Optic.Iso (effect 4.0.0-rc.111)
  - id: origin-skill
    resource: https://github.com/craigsmitham/agent-extensions/blob/48dc2f0293bfec9f4ad27144e9cd8e9bcbbe203e/.axm/extensions/%40craigsmitham/skills/effect-v4-optics/src/SKILL.md
    title: effect-v4-optics skill 0.1.0 (retired into this bundle; lineage only)
generated:
  by: codex/gpt-5.6
  at: 2026-08-24T16:00:57Z
verified:
  - by: claude/fable-5
    at: 2026-08-17T14:19:38Z
  - by: codex/gpt-5.6
    at: 2026-08-24T16:00:57Z
---

# Optics

Use optics to name and compose immutable focus/update logic, especially when
absence or multiple matches are part of the model. Do not introduce them merely
to shorten one property access.

**Applies when** nested property paths repeat, updates target optional data or
union variants, collections need filtered traversal, focus logic should compose
across modules, code manually clones nested plain data, or you are choosing
among Lens, Prism, Optional, Iso, and Traversal semantics.

**Leave alone** one-off shallow updates, mutation-oriented code, and direct path
updates on non-plain runtime objects.

Related: [Collections](collections.md) for ordinary finite transformation.

`effect/Optic` is v4-only; do not carry forward Effect v3 or third-party optic
conventions. The monorepo ships an official module guide at
`packages/effect/OPTIC.md` — read it alongside the installed `Optic` and
`Schema` source when a signature is in doubt.[^docs-optic]

## Choose focus semantics

Start plain data paths with `Optic.id<S>()`, then choose by meaning:

- `key` for a statically present struct or tuple field. An optional property is
  still a total focus whose value may be `undefined`; replacing with
  `undefined` preserves the property.
- `optionalKey` only when replacing with `undefined` should delete the property
  or splice the array element. It does not make a missing property a failed
  focus.[^docs-optic]
- `tag` or `refine` for a union case; narrow before calling `key`.
- `at` for a record key or array index that must already exist. Missing input
  makes both reading and replacement fail.
- `notUndefined` or `check` to keep only matching current values.
- `forEach` for zero or more collection elements; use `modifyAll` for
  element-wise updates and `Optic.getAll` for collecting the focused values.

Compose `some`, `none`, `success`, or `failure` for `Option` and `Result`
variants instead of manually inspecting their representation.

The resulting type records the guarantee: `Lens` always reads, `Prism` may fail
to read but can construct, `Optional` may fail in either direction, `Iso` is
reversible, and `Traversal` focuses zero or more values. Preserve the strongest
type the composition earns; do not widen everything to `Optional`.[^src-optic]

## Make failure intentional

Use `get` only on total focuses. Use `getResult` or `replaceResult` when callers
must distinguish absence from success. Plain `replace` and `modify` return the
original source when focus fails, which is useful for conditional updates but
can hide a business error.[^src-optic]

rc.111 exposes these operations both as optic methods and as dual standalone
functions: `Optic.get`, `getResult`, `set`, `replace`, `replaceResult`,
`modify`, `getAll`, and `modifyAll`. Prefer the form that fits the local
pipeline; the focus and failure semantics are the same.[^src-optic]

`check` and `refine` decide whether the **current** value is in focus. Their
setter accepts any replacement, so they are filters, not write validation.
Validate or construct the replacement separately when an invariant must
hold.[^src-optic]

```ts
import { Optic } from "effect";

type Todo =
  | { readonly _tag: "Open"; readonly title: string }
  | { readonly _tag: "Done"; readonly title: string };

type State = {
  readonly todos?: ReadonlyArray<Todo>;
};

const openTitles = Optic.id<State>()
  .key("todos")
  .notUndefined()
  .forEach((todo) => todo.tag("Open").key("title"));

const normalizeOpenTitles = openTitles.modifyAll((title) => title.trim());
```

Path replacement shallow-copies only objects and arrays along the focus and
reuses unrelated branches. Path helpers are for plain JavaScript data; do not
call `Optic.id<MyClass>().key(...)` on class instances — replacement throws on
non-plain objects.[^test-optic]

When a schema supplies an isomorphic representation, prefer
`Schema.toIso(schema)`: it returns an `Iso` from the schema's type to its Iso
shape, so composed updates rebuild the domain value correctly. This also covers
custom types whose schema carries `toCodecIso`/`toCodec` annotations —
`Schema.Class` provides them out of the box, giving optics a safe path onto
class-based models the raw path helpers cannot touch.[^src-schema]
[^docs-optic]

## Add custom optics sparingly

Prefer the built-in path, narrowing, collection, and schema-derived optics.
Reach for `makeLens`, `makePrism`, `makeOptional`, or `makeIso` only when the
domain has a reusable focus those combinators cannot express. Keep constructors
pure and test their expected lens or round-trip laws; a dishonest custom optic
can silently lose data or make composition invalid.

Define reusable domain optics near the data model and compose them at use
sites. Keep effects outside the updater: an optic transforms a value
synchronously; `Effect` can load the value and persist the result around it.

## Review checklist

- Optics are introduced for repeated, optional, or union-focused paths, not to
  shorten one property access.
- Each composition keeps the strongest type it earns; nothing is widened to
  `Optional` without cause.
- Absence handling is deliberate: `getResult`/`replaceResult` where callers
  must distinguish it; silent no-op `replace`/`modify` only where intended.
- Tests cover a matching update, every meaningful non-match, and `optionalKey`
  deletion semantics where used.
- Path helpers touch only plain data; class-shaped models go through
  `Schema.toIso`.
- Custom optics have law tests, and unrelated references remain shared where
  structural sharing matters.

[^docs-optic]: `packages/effect/OPTIC.md` at `effect@4.0.0-rc.111` — glossary, `key` vs `optionalKey` undefined semantics, traversals, `Schema.toIso` including `Schema.Class`, plain-objects-only limitation.

[^src-optic]: `packages/effect/src/Optic.ts` at `effect@4.0.0-rc.111` — `get` accepts only a `Lens`; `Optional` exposes `getResult`/`replaceResult`; the module exports dual standalone `get`, `getResult`, `set`, `replace`, `replaceResult`, `modify`, `getAll`, and `modifyAll`; `replace`/`modify` return the original source when the optic cannot focus; `CheckNode.set` is identity, so `check`/`refine` never validate writes; compose overloads keep Iso/Lens/Prism where earned; `PathNode.set` shallow-copies only the focus spine.

[^test-optic]: `packages/effect/test/Optic.test.ts` at `effect@4.0.0-rc.111` — behavior tests including the runtime throw when replacing inside a non-plain object.

[^src-schema]: `packages/effect/src/Schema.ts` at `effect@4.0.0-rc.111` — `toIso` returns `Optic.Iso<S["Type"], S["Iso"]>`, with `toIsoSource`/`toIsoFocus` variants.
