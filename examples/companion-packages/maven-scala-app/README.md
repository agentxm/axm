# PawMatch (Maven Scala consumer app)

`pawmatch` is a tiny Maven Scala CLI for a fictional community pet
adoption center. It is a reference _consumer_ of the
`ai.agentxm.examples:tinyflags-scala_3` library — exactly the codebase
the companion AXM skills and subagent in
`../maven-scala-lib/.axm/extensions/` are designed to operate on.

`pawmatch` is not publishable (the artifact exists to demonstrate
consumption, not to publish).

The app also ships its own companion AXM skill,
[`maven-scala-pawmatch-find-a-pet`](./.axm/extensions/@examples/skills/maven-scala-pawmatch-find-a-pet/src/SKILL.md),
which guides an agent through using `pawmatch` to help an end user find
and apply for an adoptable pet. See the
[parent README](../README.md#app-extension--pawmatch) for the spec.

## Run

After installing `tinyflags-scala_3` into the local Maven repository (from
`../maven-scala-lib/`):

```bash
mvn -q -f ../maven-scala-lib/pom.xml install
mvn -q package
java -cp "target/pawmatch-scala_3-0.1.0.jar:$(mvn -q dependency:build-classpath -Dmdep.outputFile=/dev/stdout)" \
    ai.agentxm.examples.pawmatch.Main browse
```

The `main` class is `ai.agentxm.examples.pawmatch.Main`.

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

The MUnit suite under `src/test/scala/...` constructs a `PawMatchCli`
with captured `PrintStream`s and asserts subcommand output.

## Library dependency

The library `ai.agentxm.examples:tinyflags-scala_3` has not yet been
published to Maven Central, so the app references it as a regular Maven
dependency that must be installed locally first via `mvn install` in
`../maven-scala-lib/`.

Once the library is published to Maven Central, no changes are needed:
the coordinate (`ai.agentxm.examples:tinyflags-scala_3:0.1.0`) is the same.

## Flag seams

Flag definitions live in `src/main/scala/ai/agentxm/examples/pawmatch/Flags.scala`.
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
ratings independently before giving. See `Charities.scala`.
