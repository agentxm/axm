---
name: ocaml-opam-tinyflags-rollout-review
description: Review TinyFlags flag definitions and call sites for safe OCaml rollouts.
---

# TinyFlags Rollout Review

Use this skill before increasing rollout percentages or shipping a new
TinyFlags-backed behavior in an OCaml package.

## Review Checklist

- Every flag definition passes an explicit `~default` argument.
- Boolean rollouts use `int` values in `0..100`.
- Variant rollout totals do not exceed 100.
- Unknown variants are not referenced in rollout pairs.
- Evaluation contexts include a stable `Tinyflags.Context.t` with a
  meaningful `id` (user, session, or account identity).
- alcotest specs exercise both default and rollout-allocated paths.
- No `match` arm assumes rollout bucketing is random per request.

## OCaml Details

Check that flag construction is centralized — a single
`Tinyflags.make_exn [ ... ]` call inside the project's flags module is the
target of review. Scattered registries make rollouts hard to reason about.

```ocaml
let flags =
  Tinyflags.make_exn
    [
      ("checkout-redesign",
       Boolean (Tinyflags.Bool.make_exn ~default:false ~rollout:10 ()));
    ]
```

Build evaluation contexts at the request boundary, not at every call site:

```ocaml
let context = Tinyflags.Context.make ~id:request.user_id ()
```

Rollout changes should be small and reviewable. If a rollout moves from 0 to
100, confirm the disabled branch can be deleted or document why the flag
remains temporary.
