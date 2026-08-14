---
type: Guide
title: Optics
description: Reusable immutable reads and updates; use when nested paths repeat, updates target optional data or union variants, or focus logic should compose across modules.
tags: [effect, effect-v4, optic, lens, prism, optional, iso, traversal, immutability]
status: stable
sources:
  - id: origin-skill
    resource: https://github.com/craigsmitham/agent-extensions/blob/48dc2f0293bfec9f4ad27144e9cd8e9bcbbe203e/.axm/extensions/%40craigsmitham/skills/effect-v4-optics/src/SKILL.md
    title: effect-v4-optics skill 0.1.0 (retired into this bundle)
generated:
  by: claude/opus-5
  at: 2026-08-12T16:20:19Z
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

Related: [Schema boundaries](schema-boundaries.md) for `Schema.toIso`,
[Collections](collections.md) for ordinary finite transformation.

`effect/Optic` is v4-only. Inspect the installed `Optic` and `Schema` source for
current signatures; do not carry forward Effect v3 or third-party optic
conventions.

## Choose focus semantics

Start plain data paths with `Optic.id<S>()`, then choose by meaning:

- `key` for a statically present struct or tuple field. An optional property is
  still a total focus whose value may be `undefined`; replacing with
  `undefined` preserves the property.
- `optionalKey` only when replacing with `undefined` should delete the property
  or splice the array element. It does not make a missing property a failed
  focus.
- `tag` or `refine` for a union case; narrow before calling `key`.
- `at` for a record key or array index that must already exist. Missing input
  makes both reading and replacement fail.
- `notUndefined` or `check` to keep only matching current values.
- `forEach` for zero or more collection elements; use `modifyAll` for
  element-wise updates and `Optic.getAll` for collection.

Compose `some`, `none`, `success`, or `failure` for `Option` and `Result`
variants instead of manually inspecting their representation.

The resulting type records the guarantee: `Lens` always reads, `Prism` may fail
to read but can construct, `Optional` may fail in either direction, `Iso` is
reversible, and `Traversal` focuses zero or more values. Preserve the strongest
type the composition earns; do not widen everything to `Optional`.

## Make failure intentional

Use `get` only on total focuses. Use `getResult` or `replaceResult` when callers
must distinguish absence from success. Plain `replace` and `modify` return the
original source when focus fails, which is useful for conditional updates but
can hide a business error.

`check` and `refine` decide whether the **current** value is in focus. Their
setter accepts any replacement, so they are filters, not write validation.
Validate or construct the replacement separately when an invariant must hold.

```ts
import { Optic } from "effect"

type Todo =
  | { readonly _tag: "Open"; readonly title: string }
  | { readonly _tag: "Done"; readonly title: string }

type State = {
  readonly todos?: ReadonlyArray<Todo>
}

const openTitles = Optic.id<State>()
  .key("todos")
  .notUndefined()
  .forEach((todo) => todo.tag("Open").key("title"))

const normalizeOpenTitles = openTitles.modifyAll((title) => title.trim())
```

Path replacement shallow-copies only objects and arrays along the focus and
reuses unrelated branches. Path helpers are for plain JavaScript data; do not
call `Optic.id<MyClass>().key(...)` on class instances. When a schema supplies
an isomorphic representation, prefer `Schema.toIso(schema)` so updates rebuild
the domain value correctly.

## Add custom optics sparingly

Prefer the built-in path, narrowing, collection, and schema-derived optics.
Reach for `makeLens`, `makePrism`, `makeOptional`, or `makeIso` only when the
domain has a reusable focus those combinators cannot express. Keep constructors
pure and test their expected lens or round-trip laws; a dishonest custom optic
can silently lose data or make composition invalid.

Define reusable domain optics near the data model and compose them at use
sites. Keep effects outside the updater: an optic transforms a value
synchronously; `Effect` can load the value and persist the result around it.

## Verify behavior

Test a matching update and every meaningful non-match. Assert whether absence
is a no-op or an explicit `Result` failure, cover `undefined` deletion semantics
when using `optionalKey`, and verify unrelated references remain shared when
structural sharing matters. For custom optics, add focused law tests and run the
project typecheck plus relevant runtime tests.
