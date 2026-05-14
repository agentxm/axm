# PawMatch (C++ / Conan consumer app)

`pawmatch` is a tiny C++17 CLI for a fictional community pet adoption center.
It is a reference _consumer_ of the `agentxm-example-tinyflags` Conan
package — exactly the codebase the companion AXM skills and subagent in
`../cpp-conan-lib/.axm/extensions/` are designed to operate on.

`pawmatch` is intended as an example consumer. It is not packaged for
publishing to Conan Center; its `conanfile.txt` only declares consumption.

The app also ships its own companion AXM skill,
[`cpp-conan-pawmatch-find-a-pet`](./.axm/extensions/@examples/skills/cpp-conan-pawmatch-find-a-pet/src/SKILL.md),
which guides an agent through using `pawmatch` to help an end user find and
apply for an adoptable pet. See the
[parent README](../README.md) for the spec.

## Build & run

With a working Conan 2.x + CMake toolchain:

```bash
conan install . --output-folder=build --build=missing
cmake --preset conan-release
cmake --build --preset conan-release
./build/Release/pawmatch browse
```

## Test

```bash
ctest --test-dir build/Release --output-on-failure
```

The Catch2 suite under `test/cli_test.cpp` exercises every subcommand using
in-memory `std::ostringstream` writers and a stub URL opener.

## Library dependency

The app depends on `agentxm-example-tinyflags/0.1.0` from Conan. During
development, `conan editable add ../cpp-conan-lib` makes the sibling library
available without a published version.

```ini
[requires]
agentxm-example-tinyflags/0.1.0
catch2/3.5.2
```

## Flag seams

Flag definitions live in `src/flags.cpp`. Each is wired into at least one
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

Rollouts are deterministic per user (the CLI derives `Context` from
`$USER` / `$USERNAME` / `$LOGNAME`), so running the same command twice
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
independently before giving. See `src/charities.cpp`.
