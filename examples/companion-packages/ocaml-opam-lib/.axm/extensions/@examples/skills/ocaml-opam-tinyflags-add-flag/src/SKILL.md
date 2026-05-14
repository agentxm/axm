---
name: ocaml-opam-tinyflags-add-flag
description: Add a TinyFlags flag to an OCaml project with implementation, tests, and rollout notes.
---

# Add TinyFlags Flag

Use this skill when adding a feature flag to an OCaml project that depends on
`agentxm-example-tinyflags`.

## Workflow

1. Find the OCaml module that constructs the `Tinyflags.t` flag set from a
   `(name, flag) list` (typically `lib/<pkg>/flags.ml` or similar).
2. Add the flag as either a `Boolean (Tinyflags.Bool.make_exn ...)` or a
   `VariantFlag (Tinyflags.Variant.make_exn ...)` entry.
3. Prefer `kebab-case` flag names that mirror the call-site behavior.
4. Add or update alcotest coverage in `test/` for default behavior and
   rollout behavior. Run via `dune runtest` or
   `dune exec ./test/<name>.exe`.
5. Update the package's README or `.opam` description when the flag is
   user-facing.

## Boolean Flags

Use `Tinyflags.Bool.make_exn ~default:false ()` for a disabled-by-default
feature.

Use `Tinyflags.Bool.make_exn ~default:false ~rollout:10 ()` for a percentage
rollout. Rollout bucketing is deterministic on the `Tinyflags.Context.t`
[`id`] field — thread a stable identifier (user, session, account) through
the request boundary.

## Variant Flags

Use
`Tinyflags.Variant.make_exn ~default:"classic" ["classic"; "semantic"]`
when the call site needs a named treatment instead of `true` / `false`.

Use `~rollout` to allocate traffic:

```ocaml
Tinyflags.Variant.make_exn
  ~default:"classic"
  ~rollout:[ ("semantic", 10) ]
  [ "classic"; "semantic" ]
```

## Done Criteria

- New flag has an explicit `~default` argument (boolean) or `~default`
  argument (variant) tied to a member of the variant list.
- Rollout percentage is an `int` in `0..100`.
- Variant rollout pairs reference only declared variants.
- alcotest cases cover default behavior and at least one rollout boundary.
- Dead `match` branches are not introduced.
