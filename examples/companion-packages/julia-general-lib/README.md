# Julia TinyFlags

This example shows how a Julia package can ship companion AXM extensions for
its users. The package is a small feature-flag library named
`AgentXMExampleTinyFlags`.

The AXM extensions are published to AgentXM.ai under `@examples`. The Julia
package itself uses the name `AgentXMExampleTinyFlags`.

The `Project.toml` carries an `[axm]` section — this is the format the AXM
Julia-detector reader parses:

```toml
[axm]
recommendedExtensions = ["@examples/packs/julia-general-tinyflags@^0.1.0"]
```

When this package is installed in another project, `axm discover` reads that
metadata from the resolved `Project.toml` under `~/.julia/packages/` and
surfaces the companion pack as a package-author recommendation. Julia
identifies packages by UUID, so the detector emits a versionless purl like
`pkg:julia/AgentXMExampleTinyFlags`.

A working consumer is in `../julia-general-app/` (the `pawmatch` CLI).

## Package

Targets Julia 1.10+. Tests use the standard library `Test` package.

```bash
julia --project -e 'using Pkg; Pkg.test()'
```

Or interactively from the package directory:

```julia
] activate .
] test
```

Building and publishing:

```bash
# Develop locally:
julia --project -e 'using Pkg; Pkg.develop(path=".")'

# TODO: register AgentXMExampleTinyFlags in the General registry, then tag and
# release via the JuliaRegistrator workflow.
```

The library lives in `src/AgentXMExampleTinyFlags.jl` and exposes:

- `BooleanFlag(; default, rollout)`
- `VariantFlag(; variants, default, rollout)`
- `Registry(definitions)` with `tf_bool`, `tf_variant`, and `tf_evaluate`
- `Context(; user_id, account_id, session_id)`

Flag instances are immutable `struct`s validated on construction. Bucketing is
deterministic by `user_id`, `account_id`, or `session_id` from the evaluation
`Context`.

## Companion Extensions

The authored extension sources live under `.axm/extensions/@examples/`.

| Type     | FQN                                                         |
| -------- | ----------------------------------------------------------- |
| Skill    | `@examples/skills/julia-general-tinyflags-add-flag`         |
| Skill    | `@examples/skills/julia-general-tinyflags-rollout-review`   |
| Skill    | `@examples/skills/julia-general-tinyflags-cleanup-flag`     |
| Subagent | `@examples/subagents/julia-general-tinyflags-maintainer`    |
| Pack     | `@examples/packs/julia-general-tinyflags`                   |

The pack bundles the three skills and the maintainer subagent. Each manifest
declares `pkg:julia/AgentXMExampleTinyFlags` (versionless — Julia purls do
not carry versions because packages are identified by UUID).

## Scenario

A Julia package author can use this layout as a model:

1. Implement the normal Julia package with a `Project.toml` and `src/`.
2. Add an `[axm]` section to `Project.toml` with a `recommendedExtensions`
   array.
3. Add AXM extension sources in `.axm/extensions/<owner>/`.
4. Mark the extensions as authored in `.axm/settings.json`.
5. Publish the extensions independently or as a companion pack, and register
   the package in the General registry as usual.
