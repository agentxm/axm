# PawMatch (Zig consumer app)

`pawmatch` is a tiny Zig CLI for a fictional community pet adoption center.
It is a reference _consumer_ of the `agentxm_example_tinyflags` package —
exactly the codebase the companion AXM skills and subagent in
`../zig-zon-lib/.axm/extensions/` are designed to operate on.

`pawmatch` is not publishable — it exists to demonstrate consumption, not to
publish.

The app also ships its own companion AXM skill,
[`zig-zon-pawmatch-find-a-pet`](./.axm/extensions/@examples/skills/zig-zon-pawmatch-find-a-pet/src/SKILL.md),
which guides an agent through using `pawmatch` to help an end user find and
apply for an adoptable pet. See the
[parent README](../README.md#app-extension--pawmatch) for the spec.

## Run

```bash
zig build run -- browse
zig build run -- show pepper
zig build run -- match --has-kids --active
zig build run -- apply biscuit
zig build run -- fees
zig build run -- return-support
zig build run -- donate
zig build run -- donate brother-wolf --open
```

Build the executable to `./zig-out/bin/agentxm-example-pawmatch`:

```bash
zig build
./zig-out/bin/agentxm-example-pawmatch browse
```

## Test

```bash
zig build test
```

The suite under `src/root.zig` exercises every subcommand using in-memory
`std.ArrayList(u8)` buffers and the default URL opener (substituted via
`Cli.setOpener` in tests that need it).

## Library dependency

The library `agentxm_example_tinyflags` has not yet been published to a
public Zig registry, so the app references the sibling library directly via
a `.path` dependency in `build.zig.zon`:

```zig
.dependencies = .{
    .agentxm_example_tinyflags = .{
        .path = "../zig-zon-lib",
    },
},
```

The Zig detector parses the dependency name from this block and produces a
versionless purl `pkg:generic/zig/agentxm_example_tinyflags`. Once the
library is published with `.url` + `.hash`, swap the `.path` for those keys.

## Flag seams

Flag definitions live in `src/flags.zig`. Each is wired into at least one
command so the companion skills have realistic targets:

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

Rollouts are deterministic per user (the CLI derives `Context.init(...)`
from `$USER` / `$USERNAME` / `$LOGNAME`), so running the same command twice
produces the same flag values.

## Domain framing

The CLI is intentionally framed as a shelter / rescue adoption center — not
a retail pet store — following mainstream animal-welfare best practices:

- "Adopt, don't shop"
- Matching over transacting (counselor-style questionnaire, see `match`)
- Hold and meet-and-greet periods are present in the `apply` flow
- Transparent adoption fees (`fees`) that itemize spay/neuter, vaccines,
  microchip
- No-judgment return support (`return-support`)
- Long-stay animals highlighted in `browse`

## Donate command

`donate` shows a curated, static list of well-known, highly-rated
animal-welfare organizations with their official donation URLs. The CLI
never processes payments. Every output includes a disclaimer to verify
ratings independently before giving. See `src/charities.zig`.
