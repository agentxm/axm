# OCaml / opam TinyFlags

This example shows how an opam package can ship companion AXM extensions for
its users. The package is a small OCaml feature flag library named
`agentxm-example-tinyflags`.

The AXM extensions are published to AgentXM.ai under `@examples`.

The opam manifest embeds AXM recommendations as a custom `x-axm-` field
directly in the `.opam` file — there is no sidecar. opam treats any field
starting with `x-` as extension metadata that survives publication to the
opam-repository:

```opam
x-axm-recommendedExtensions: ["@examples/packs/ocaml-opam-tinyflags@^0.1.0"]
```

When this package is installed into an opam switch, `axm discover` can read
that field from `~/.opam/<switch>/lib/agentxm-example-tinyflags/opam` and
surface the companion pack as a package-author recommendation.

A working consumer is in `../ocaml-opam-app/` (the `pawmatch` CLI).

## Layout

```text
.
├── agentxm-example-tinyflags.opam   opam manifest with x-axm-recommendedExtensions
├── dune-project                     dune project descriptor
├── lib/
│   ├── dune                         library stanza
│   └── tinyflags.ml                 public API (Bool / Variant / Context)
└── test/
    ├── dune                         test stanza (alcotest)
    └── test_tinyflags.ml            alcotest suite
```

## Build & test

```bash
opam install . --deps-only --with-test
dune build
dune runtest
```

`dune runtest` runs the alcotest suite under `test/test_tinyflags.ml` covering
defaults, rollout boundaries, and variant validation.

## Library

The library exposes:

- `Tinyflags.Bool.make ?default ?rollout ()` — boolean flag with optional
  default and rollout percentage.
- `Tinyflags.Variant.make ?default ?rollout variants` — variant flag with a
  list of variants, optional default, and rollout allocation list.
- `Tinyflags.make` — build a flag set from a list of `(name, flag)` pairs.
- `Tinyflags.enabled`, `variant`, `evaluate` — evaluate flags against a
  `Tinyflags.Context.t`. Errors are returned as `(_, error) result`.
- `Tinyflags.Context.make ~id ()` — caller identity used for deterministic
  bucketing. An empty id buckets every caller to the same `"anonymous"` slot.

```ocaml
open Tinyflags

let flags =
  make_exn
    [
      ("checkout-redesign", Boolean (Bool.make_exn ~default:true ()));
      ( "search-ranking",
        VariantFlag
          (Variant.make_exn ~default:"classic"
             ~rollout:[ ("semantic", 100) ]
             [ "classic"; "semantic" ]) );
    ]

let ctx = Context.make ~id:"user-1" ()
let on = enabled_exn flags ~name:"checkout-redesign" ~context:ctx   (* true *)
let v  = variant_exn flags ~name:"search-ranking" ~context:ctx       (* "semantic" *)
```

## Companion Extensions

The authored extension sources live under `.axm/extensions/@examples/`.

| Type     | FQN                                                    |
| -------- | ------------------------------------------------------ |
| Skill    | `@examples/skills/ocaml-opam-tinyflags-add-flag`       |
| Skill    | `@examples/skills/ocaml-opam-tinyflags-rollout-review` |
| Skill    | `@examples/skills/ocaml-opam-tinyflags-cleanup-flag`   |
| Subagent | `@examples/subagents/ocaml-opam-tinyflags-maintainer`  |
| Pack     | `@examples/packs/ocaml-opam-tinyflags`                 |

The pack bundles the three skills and the maintainer subagent. Each manifest
declares `pkg:opam/agentxm-example-tinyflags` as its companion package.

## Scenario

An opam package author can use this layout as a model:

1. Implement the OCaml library as usual.
2. Embed package-native AXM metadata in the `.opam` file under
   `x-axm-recommendedExtensions:`. opam preserves `x-*` extension fields, so
   the recommendation rides along with the package.
3. Add AXM extension sources in `.axm/extensions/<owner>/`.
4. Mark the extensions as authored in `.axm/settings.json`.
5. Publish the extensions independently or as a companion pack.
