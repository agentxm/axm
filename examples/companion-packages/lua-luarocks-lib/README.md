# Lua TinyFlags (LuaRocks)

This example shows how a LuaRocks-published rock can ship companion AXM
extensions for its users. The rock is a small Lua feature-flag library named
`agentxm-example-tinyflags`.

The AXM extensions are published to AgentXM.ai under `@examples`. The rock
itself is published to LuaRocks under `agentxm-example-tinyflags`.

The AXM recommendation is delivered as an `axm.json` sidecar shipped via the
rockspec `build.copy_directories` mechanism — see the rockspec for the gotcha
around LuaRocks not exposing a first-class "drop file at rock root" directive.

## Package

Targets Lua 5.3+ (works on Lua 5.4 and LuaJIT 2.1 with bitop support). Tests
use [busted](https://lunarmodules.github.io/busted/).

```bash
# install dependencies (busted) into a project-local rocks tree
luarocks install --tree lua_modules busted

# run the unit tests
lua_modules/bin/busted spec/
```

Or with a system-wide busted:

```bash
busted spec/
```

Building and publishing:

```bash
# Build the rock locally:
luarocks make agentxm-example-tinyflags-0.1.0-1.rockspec

# TODO: configure LuaRocks publishing for agentxm-example-tinyflags,
# then run:
# luarocks upload agentxm-example-tinyflags-0.1.0-1.rockspec
```

The library lives in `src/tinyflags.lua` and exposes:

- `tinyflags.BooleanFlag({ default = bool, rollout = int? })`
- `tinyflags.VariantFlag({ variants = {...}, default = str, rollout = { name = int, ... }? })`
- `tinyflags.Registry(definitions)` — `:is_enabled(name, ctx)`,
  `:variant(name, ctx)`, `:evaluate(name, ctx)`, `:names()`, `:has(name)`

Flag instances validate inputs on construction. Bucketing is deterministic by
`user_id`, `account_id`, or `session_id` from the evaluation context table.
Hashing uses a pure-Lua FNV-1a 32-bit implementation so the rock has no
external dependencies.

## Companion Extensions

The authored extension sources live under `.axm/extensions/@examples/`.

| Type     | FQN                                                      |
| -------- | -------------------------------------------------------- |
| Skill    | `@examples/skills/lua-luarocks-tinyflags-add-flag`       |
| Skill    | `@examples/skills/lua-luarocks-tinyflags-rollout-review` |
| Skill    | `@examples/skills/lua-luarocks-tinyflags-cleanup-flag`   |
| Subagent | `@examples/subagents/lua-luarocks-tinyflags-maintainer`  |
| Pack     | `@examples/packs/lua-luarocks-tinyflags`                 |

The pack bundles the three skills and the maintainer subagent. Each manifest
declares `pkg:luarocks/agentxm-example-tinyflags@^0.1.0` as its companion
package.

## AXM Metadata Sidecar — LuaRocks Gotcha

The AXM LuaRocks reader expects `axm.json` at:

```
<rocks-tree>/lib/luarocks/rocks-<luaver>/<pkg>/<ver>/axm.json
```

LuaRocks does not provide a built-in directive to land a single file at the
rock root. The rockspec uses `build.copy_directories = { "axm" }` to ship the
sidecar in an `axm/` subdirectory under the rock root. An upstream LuaRocks
reader enhancement that also probes `<rock-root>/axm/axm.json` is tracked as
future work. For now, this scaffolding ships both `axm.json` (at the source
root, used by detection during development) and `axm/axm.json` (which lands
in the rocks tree via `copy_directories`).

## Scenario

A LuaRocks rock author can use this layout as a model:

1. Implement the normal Lua module.
2. Embed AXM recommendation metadata in an `axm.json` sidecar.
3. Configure the rockspec `build.copy_directories` to ship the sidecar.
4. Add AXM extension sources in `.axm/extensions/<owner>/`.
5. Mark the extensions as authored in `.axm/settings.json`.
6. Publish the extensions independently or as a companion pack.
