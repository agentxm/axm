# PawMatch (Elixir consumer app)

`pawmatch` is a tiny Elixir CLI for a fictional community pet adoption center.
It is a reference _consumer_ of `agentxm_example_tinyflags` — exactly the
codebase the companion AXM skills and subagent in
`../hex-lib/.axm/extensions/` are designed to operate on.

`pawmatch` is not publishable — it exists to demonstrate consumption, not to
publish.

The app also ships its own companion AXM skill,
[`hex-pawmatch-find-a-pet`](./.axm/extensions/@examples/skills/hex-pawmatch-find-a-pet/src/SKILL.md),
which guides an agent through using `pawmatch` to help an end user find and
apply for an adoptable pet. See the
[parent README](../README.md#app-extension--pawmatch) for the spec.

## Run

```bash
mix deps.get
mix run --no-start -e 'AgentXM.Examples.PawMatch.CLI.run(["browse"])'
mix run --no-start -e 'AgentXM.Examples.PawMatch.CLI.run(["show", "pepper"])'
mix run --no-start -e 'AgentXM.Examples.PawMatch.CLI.run(["match", "--has-kids", "--active"])'
mix run --no-start -e 'AgentXM.Examples.PawMatch.CLI.run(["apply", "biscuit"])'
mix run --no-start -e 'AgentXM.Examples.PawMatch.CLI.run(["fees"])'
mix run --no-start -e 'AgentXM.Examples.PawMatch.CLI.run(["return-support"])'
mix run --no-start -e 'AgentXM.Examples.PawMatch.CLI.run(["donate"])'
mix run --no-start -e 'AgentXM.Examples.PawMatch.CLI.run(["donate", "brother-wolf", "--open"])'
```

Build a standalone escript binary with:

```bash
mix escript.build
./pawmatch browse
```

## Test

```bash
mix test
```

ExUnit tests under `test/agentxm_example_pawmatch_test.exs` exercise every
subcommand using `StringIO`-backed `out` and `err` devices and a stub
`open_url` function.

## Library dependency

The library `agentxm_example_tinyflags` has not yet been published to Hex, so
the app references the sibling library directly via a path dependency in
`mix.exs`:

```elixir
defp deps do
  [{:agentxm_example_tinyflags, path: "../hex-lib"}]
end
```

TODO: once the library is published, switch to `{:agentxm_example_tinyflags, "~> 0.1"}`.

## Flag seams

Flag definitions live in `lib/agentxm_example_pawmatch/flags.ex`. Each is
wired into at least one command so the companion skills have realistic
targets:

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

Rollouts are deterministic per user (the CLI derives the TinyFlags context id
from `$USER` / `$USERNAME` / `$LOGNAME`), so running the same command twice
produces the same flag values.

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
animal-welfare organizations with their official donation URLs. The CLI never
processes payments. Every output includes a disclaimer to verify ratings
independently before giving. See `lib/agentxm_example_pawmatch/charities.ex`.
