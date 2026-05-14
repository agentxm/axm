# Elixir / Hex TinyFlags

This example shows how a Hex package can ship companion AXM extensions for its
users. The package is a small Elixir feature flag library named
`agentxm_example_tinyflags`.

The AXM extensions are published to AgentXM.ai under `@examples`.

The package ships AXM recommendations in an `axm.json` sidecar at the package
root:

```json
{
  "recommendedExtensions": ["@examples/packs/hex-tinyflags@^0.1.0"]
}
```

`mix.exs` lists `axm.json` in `:package` `:files` so Hex includes it in the
published tarball. When this package is added as a dependency in another
project, `axm discover` reads `deps/agentxm_example_tinyflags/axm.json` and
surfaces the companion pack as a package-author recommendation.

A working consumer is in `../hex-app/` (the `pawmatch` CLI).

## Layout

```text
.
├── mix.exs                       Hex package manifest
├── axm.json                      Companion-extension recommendations (sidecar)
├── lib/agentxm_example_tinyflags.ex
│                                 Public API
└── lib/agentxm_example_tinyflags/
    ├── boolean_flag.ex           Boolean flag definition
    ├── variant_flag.ex           Variant flag definition
    └── context.ex                Deterministic bucketing
```

## Build & test

```bash
mix deps.get
mix test
```

ExUnit tests under `test/agentxm_example_tinyflags_test.exs` cover defaults,
rollout boundaries, and variant validation failures.

## Library

The library lives in `lib/agentxm_example_tinyflags.ex` and exposes:

- `AgentXM.Examples.TinyFlags.BooleanFlag.new/1` — boolean flag with optional
  default and rollout percentage.
- `AgentXM.Examples.TinyFlags.VariantFlag.new/2` — variant flag with a list of
  variants, optional default, and rollout map.
- `AgentXM.Examples.TinyFlags.new/1` — build a flag set from a map of name to
  flag definition.
- `enabled/3`, `variant/3`, `evaluate/3` — evaluate flags against a context
  map. Errors return `{:error, reason}`.
- `AgentXM.Examples.TinyFlags.Context` — deterministic bucketing helper.
  Bucket keys are read from `:id`, `"id"`, `:user_id`, or `"user_id"`.

```elixir
alias AgentXM.Examples.TinyFlags
alias AgentXM.Examples.TinyFlags.{BooleanFlag, VariantFlag}

flags =
  TinyFlags.new!(%{
    "checkout-redesign" => BooleanFlag.new!(default: true),
    "search-ranking" =>
      VariantFlag.new!(
        ["classic", "semantic"],
        default: "classic",
        rollout: %{"semantic" => 100}
      )
  })

{:ok, true} = TinyFlags.enabled(flags, "checkout-redesign", %{id: "user-1"})
{:ok, "semantic"} = TinyFlags.variant(flags, "search-ranking", %{id: "user-1"})
{:ok, {:variant, "semantic"}} = TinyFlags.evaluate(flags, "search-ranking", %{id: "user-1"})
```

## Companion Extensions

The authored extension sources live under `.axm/extensions/@examples/`.

| Type     | FQN                                            |
| -------- | ---------------------------------------------- |
| Skill    | `@examples/skills/hex-tinyflags-add-flag`      |
| Skill    | `@examples/skills/hex-tinyflags-rollout-review`|
| Skill    | `@examples/skills/hex-tinyflags-cleanup-flag`  |
| Subagent | `@examples/subagents/hex-tinyflags-maintainer` |
| Pack     | `@examples/packs/hex-tinyflags`                |

The pack bundles the three skills and the maintainer subagent. Each manifest
declares `pkg:hex/agentxm_example_tinyflags` as its companion package.

## AXM metadata resolution

The AXM Hex reader resolves metadata in two stages:

1. **`deps/<pkg>/axm.json` sidecar** (primary, what this package ships). The
   sidecar is the same `axm.json` checked into the package root; `mix.exs`
   includes it in the published tarball via `:package` `:files`.
2. **`extra.axm` in `hex_metadata.config`** (fallback). Hex generates
   `hex_metadata.config` from the `:package` `:extra` map during `mix hex.build`.
   Hosting recommendations in `extra.axm` would showcase Hex's native package
   metadata, but it adds setup complexity and is deferred to a follow-up. The
   reader still parses it as a fallback if a package uses that path.

This example picks the sidecar route for parity with the other companion
package examples (Swift/CocoaPods/PyPI all ship the same kind of `axm.json`).

## Scenario

A Hex package author can use this layout as a model:

1. Implement the Elixir library as usual.
2. Ship an `axm.json` sidecar at the package root recommending the companion
   pack, and add it to `:package` `:files` so it lands in the published
   tarball.
3. Add AXM extension sources in `.axm/extensions/<owner>/`.
4. Mark the extensions as authored in `.axm/settings.json`.
5. Publish the extensions independently or as a companion pack.
