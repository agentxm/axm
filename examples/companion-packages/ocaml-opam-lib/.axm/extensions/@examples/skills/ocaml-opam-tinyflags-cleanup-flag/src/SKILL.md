---
name: ocaml-opam-tinyflags-cleanup-flag
description: Remove a stale TinyFlags flag and simplify OCaml call sites.
---

# Cleanup TinyFlags Flag

Use this skill when a TinyFlags flag has reached its final treatment and
should be removed from an OCaml package.

## Workflow

1. Identify the final behavior: enabled, disabled, or a specific variant.
2. Replace `Tinyflags.enabled`, `Tinyflags.variant`, and `Tinyflags.evaluate`
   call sites with the final behavior, simplifying the surrounding `match`
   or `if` expression.
3. Delete the flag entry from the `Tinyflags.make_exn [ ... ]` definition
   list.
4. Remove alcotest cases that only exercise obsolete rollout branching.
5. Add or update tests for the final simplified behavior.
6. Search for the flag name (string literal and any module-level binding
   such as `let checkout_redesign = "checkout-redesign"`) across `lib/`,
   `test/`, `README.md`, and the `.opam` synopsis.

## Guardrails

- Do not leave a deleted flag referenced in a string literal anywhere.
- Do not keep rollout-specific tests after the rollout branch is gone.
- Preserve the public module signature unless the package's release notes
  explicitly call out a breaking change. Add or update the `.mli` file
  accordingly.
- Keep OCaml style consistent with the host project: same indentation,
  same alcotest assertion style (`Alcotest.(check bool)`).
