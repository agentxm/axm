## PawMatch (LuaRocks consumer app)

`pawmatch` is a tiny Lua CLI for a fictional community pet adoption center.
It is a reference _consumer_ of the `agentxm-example-tinyflags` rock — exactly
the codebase the companion AXM skills and subagent in
`../lua-luarocks-lib/.axm/extensions/` are designed to operate on.

`pawmatch` is not packable — it exists to demonstrate consumption, not to
publish to LuaRocks.

The app also ships its own companion AXM skill,
[`lua-luarocks-pawmatch-find-a-pet`](./.axm/extensions/@examples/skills/lua-luarocks-pawmatch-find-a-pet/src/SKILL.md),
which guides an agent through using `pawmatch` to help an end user find and
apply for an adoptable pet. See the
[parent README](../README.md#app-extension--pawmatch) for the spec.

## Run

Until `agentxm-example-tinyflags` is published to luarocks.org, run the CLI
directly against the sibling library source via `package.path`:

```bash
LUA_PATH='./src/?.lua;./src/?/init.lua;../lua-luarocks-lib/src/?.lua;;' \
  lua bin/pawmatch browse
LUA_PATH='./src/?.lua;./src/?/init.lua;../lua-luarocks-lib/src/?.lua;;' \
  lua bin/pawmatch show pepper
LUA_PATH='./src/?.lua;./src/?/init.lua;../lua-luarocks-lib/src/?.lua;;' \
  lua bin/pawmatch match --has-kids --active
LUA_PATH='./src/?.lua;./src/?/init.lua;../lua-luarocks-lib/src/?.lua;;' \
  lua bin/pawmatch apply biscuit
LUA_PATH='./src/?.lua;./src/?/init.lua;../lua-luarocks-lib/src/?.lua;;' \
  lua bin/pawmatch fees
LUA_PATH='./src/?.lua;./src/?/init.lua;../lua-luarocks-lib/src/?.lua;;' \
  lua bin/pawmatch return-support
LUA_PATH='./src/?.lua;./src/?/init.lua;../lua-luarocks-lib/src/?.lua;;' \
  lua bin/pawmatch donate
LUA_PATH='./src/?.lua;./src/?/init.lua;../lua-luarocks-lib/src/?.lua;;' \
  lua bin/pawmatch donate brother-wolf --open
```

Tests use [busted](https://lunarmodules.github.io/busted/). The bundled
`.busted` configuration already includes the sibling library on the search
path:

```bash
busted spec/
```

## Library dependency

The rockspec consumes `agentxm-example-tinyflags` as a runtime dependency:

```lua
dependencies = {
  "lua >= 5.3, < 5.5",
  "agentxm-example-tinyflags == 0.1.0-1",
}
```

Once `agentxm-example-tinyflags` is published to luarocks.org, an end user
can install both rocks with:

```bash
luarocks install agentxm-example-pawmatch
```

and the dependency pins `agentxm-example-tinyflags == 0.1.0-1`.

## Flag seams

Flag definitions live in `src/pawmatch/flags.lua`. Each is wired into at
least one command so the companion skills have realistic targets:

| Flag                            | Type    | Used in  |
| ------------------------------- | ------- | -------- |
| `home-check-followup`           | bool    | `apply`  |
| `fee-breakdown-detailed`        | bool    | `fees`   |
| `long-stay-highlight`           | bool    | `browse` |
| `suggest-donate-after-adoption` | bool    | `apply`  |
| `show-charity-ratings`          | bool    | `donate` |
| `recommendation-strategy`       | variant | `match`  |
| `match-quiz-depth`              | variant | `match`  |
| `pet-card-style`                | variant | `browse` |
| `donate-focus-default`          | variant | `donate` |

Rollouts are deterministic per user (the CLI uses the `USER` environment
variable as the `session_id`), so running the same command twice produces
the same flag values.

## Domain framing

The CLI is intentionally framed as a shelter / rescue adoption center — not a
retail pet store — following mainstream animal-welfare best practices:

- "Adopt, don't shop"
- Matching over transacting (counselor-style questionnaire, see `match`)
- Hold and meet-and-greet periods are present in the `apply` flow
- Transparent adoption fees (`fees`) that itemize spay/neuter, vaccines, microchip
- No-judgment return support (`return-support`)
- Long-stay animals highlighted in `browse`

## Donate command

`donate` shows a curated, static list of well-known, highly-rated
animal-welfare organizations with their official donation URLs. The CLI
never processes payments. Every output includes a disclaimer to verify
ratings independently before giving. See `src/pawmatch/charities.lua`.
