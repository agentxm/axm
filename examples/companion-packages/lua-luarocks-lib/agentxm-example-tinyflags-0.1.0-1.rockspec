-- Rockspec for agentxm-example-tinyflags 0.1.0-1.
--
-- AXM metadata sidecar:
--   The AXM LuaRocks reader scans for `axm.json` at:
--     <rocks-tree>/lib/luarocks/rocks-<luaver>/<pkg>/<ver>/axm.json
--   which is the rock manifest directory written by `luarocks install`.
--
--   LuaRocks does not provide a first-class "drop a file at the rock root"
--   directive, so we use `build.copy_directories = { "axm" }` to ship the
--   AXM metadata in an `axm/` subdirectory under the rock root. The reader
--   currently expects `axm.json` at the rock root itself; an upstream LuaRocks
--   reader enhancement to also probe `<rock-root>/axm/axm.json` is tracked
--   as future work. Authors who need the file at the exact rock-root path can
--   add a post-install hook to copy `axm/axm.json` up one directory, or use a
--   custom `"command"` build type. We use the idiomatic `copy_directories`
--   mechanism here so the scaffolding is portable.

package = "agentxm-example-tinyflags"
version = "0.1.0-1"

source = {
  url = "https://github.com/agentxm/axm-b/archive/refs/heads/main.tar.gz",
  dir = "axm-b/examples/companion-packages/lua-luarocks-lib",
}

description = {
  summary = "Tiny feature flags library used by AXM companion package examples.",
  detailed = [[
    A minimal feature-flags library demonstrating boolean and variant flags
    with deterministic rollout bucketing. Pure-Lua, no external dependencies.
  ]],
  homepage = "https://github.com/agentxm/axm",
  license = "MIT",
  maintainer = "AgentXM Examples <noreply@agentxm.ai>",
}

dependencies = {
  "lua >= 5.3, < 5.5",
}

build = {
  type = "builtin",
  modules = {
    tinyflags = "src/tinyflags.lua",
  },
  -- Ship the `axm` directory (containing axm.json) verbatim to the install
  -- tree at <rocks-tree>/lib/luarocks/rocks-<luaver>/<pkg>/<ver>/axm/.
  copy_directories = { "axm" },
}

test = {
  type = "busted",
}
