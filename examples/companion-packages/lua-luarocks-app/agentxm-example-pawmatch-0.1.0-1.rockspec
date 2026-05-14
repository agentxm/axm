-- Rockspec for the agentxm-example-pawmatch CLI 0.1.0-1.
--
-- This is a reference consumer of agentxm-example-tinyflags. It is not
-- intended for publication to LuaRocks — it exists to demonstrate
-- consumption of the library and to exercise the TinyFlags companion
-- skills against a realistic codebase.

package = "agentxm-example-pawmatch"
version = "0.1.0-1"

source = {
  url = "https://github.com/agentxm/axm-b/archive/refs/heads/main.tar.gz",
  dir = "axm-b/examples/companion-packages/lua-luarocks-app",
}

description = {
  summary = "Tiny community pet-adoption CLI demonstrating consumption of agentxm-example-tinyflags.",
  detailed = [[
    Reference Lua consumer of the agentxm-example-tinyflags rock. Not
    packable — exists to demonstrate consumption.
  ]],
  homepage = "https://github.com/agentxm/axm",
  license = "MIT",
  maintainer = "AgentXM Examples <noreply@agentxm.ai>",
}

dependencies = {
  "lua >= 5.3, < 5.5",
  "agentxm-example-tinyflags == 0.1.0-1",
}

build = {
  type = "builtin",
  modules = {
    ["pawmatch.cli"]       = "src/pawmatch/cli.lua",
    ["pawmatch.flags"]     = "src/pawmatch/flags.lua",
    ["pawmatch.pets"]      = "src/pawmatch/pets.lua",
    ["pawmatch.charities"] = "src/pawmatch/charities.lua",
  },
  install = {
    bin = { "bin/pawmatch" },
  },
}

test = {
  type = "busted",
}
