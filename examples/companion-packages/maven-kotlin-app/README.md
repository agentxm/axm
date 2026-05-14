# PawMatch (Maven Kotlin consumer app)

`pawmatch` is a tiny Maven Kotlin CLI for a fictional community pet
adoption center. It is a reference _consumer_ of the
`ai.agentxm.examples:tinyflags-kotlin` library — exactly the codebase
the companion AXM skills and subagent in
`../maven-kotlin-lib/.axm/extensions/` are designed to operate on.

`pawmatch` is not publishable (the artifact exists to demonstrate
consumption, not to publish).

The app also ships its own companion AXM skill,
[`maven-kotlin-pawmatch-find-a-pet`](./.axm/extensions/@examples/skills/maven-kotlin-pawmatch-find-a-pet/src/SKILL.md),
which guides an agent through using `pawmatch` to help an end user find
and apply for an adoptable pet. See the
[parent README](../README.md#app-extension--pawmatch) for the spec.

## Run

After installing `tinyflags-kotlin` into the local Maven repository (from
`../maven-kotlin-lib/`):

```bash
mvn -q -f ../maven-kotlin-lib/pom.xml install
mvn -q package
java -cp "target/pawmatch-kotlin-0.1.0.jar:$(mvn -q dependency:build-classpath -Dmdep.outputFile=/dev/stdout)" \
    ai.agentxm.examples.pawmatch.MainKt browse
```

Or via the Kotlin Maven plugin's `exec`/`java` plugin equivalent your
local setup prefers. The `main` class is
`ai.agentxm.examples.pawmatch.MainKt`.

Subcommands:

```text
pawmatch browse [--species dog|cat|...]
pawmatch show <pet>
pawmatch match [--has-kids --quiet-home --active --first-time --multiple-pets --small-home]
pawmatch apply <pet>
pawmatch fees
pawmatch return-support
pawmatch donate [<charity>] [--focus all|shelters|rescue|policy] [--open]
```

## Test

```bash
mvn -q test
```

The Kotest suite under `src/test/kotlin/...` constructs a
`PawMatchCli` with captured `PrintStream`s and asserts subcommand output.

## Library dependency

The library `ai.agentxm.examples:tinyflags-kotlin` has not yet been
published to Maven Central, so the app references it as a regular Maven
dependency that must be installed locally first via
`mvn install` in `../maven-kotlin-lib/`.

Once the library is published to Maven Central, no changes are needed:
the coordinate (`ai.agentxm.examples:tinyflags-kotlin:0.1.0`) is the same.

## Flag seams

Flag definitions live in `src/main/kotlin/ai/agentxm/examples/pawmatch/Flags.kt`.
Each is wired into at least one command so the companion skills have
realistic targets:

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

Rollouts are deterministic per user (the CLI derives `Context(id)` from
the `USER`, `USERNAME`, or `LOGNAME` environment variable), so running
the same command twice produces the same flag values.

## Domain framing

The CLI is intentionally framed as a shelter / rescue adoption center —
not a retail pet store — following mainstream animal-welfare best
practices:

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
ratings independently before giving. See `Charities.kt`.
