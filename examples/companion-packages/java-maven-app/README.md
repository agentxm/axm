# PawMatch (Maven Java consumer app)

`pawmatch` is a tiny Maven Java CLI for a fictional community pet adoption
center. It is a reference _consumer_ of the `ai.agentxm.examples:tinyflags-java`
library — exactly the codebase the companion AXM skills and subagent in
`../java-maven-lib/.axm/extensions/` are designed to operate on.

`pawmatch` is not publishable — it exists to demonstrate consumption, not to
publish.

The app also ships its own companion AXM skill,
[`java-maven-pawmatch-find-a-pet`](./.axm/extensions/@examples/skills/java-maven-pawmatch-find-a-pet/src/SKILL.md),
which guides an agent through using `pawmatch` to help an end user find and
apply for an adoptable pet. See the
[parent README](../README.md#app-extension--pawmatch) for the spec.

## Run

Run the lib's `mvn install` first so this app can resolve it from your local
Maven repository:

```bash
cd ../java-maven-lib && mvn -q install
cd ../java-maven-app

mvn -q exec:java -Dexec.args="browse"
mvn -q exec:java -Dexec.args="show pepper"
mvn -q exec:java -Dexec.args="match --has-kids --active"
mvn -q exec:java -Dexec.args="apply biscuit"
mvn -q exec:java -Dexec.args="fees"
mvn -q exec:java -Dexec.args="return-support"
mvn -q exec:java -Dexec.args="donate"
mvn -q exec:java -Dexec.args="donate brother-wolf --open"
```

`mvn package` builds the JAR with `Main-Class` set so it can also be run via
`java -jar target/pawmatch-java-0.1.0.jar fees` (TinyFlags is on the
classpath automatically when launched via `exec:java`).

## Test

```bash
mvn -q test
```

The smoke test under `src/test/java/ai/agentxm/examples/pawmatch/PawMatchCliTest.java`
exercises `fees` against a `StringWriter` and asserts that the exit code is 0.

## Library dependency

The library `ai.agentxm.examples:tinyflags-java` has not yet been published to
Maven Central, so the app declares a normal Maven `<dependency>` and expects
the sibling library to have been installed to your local repository via
`mvn install`:

```xml
<dependency>
  <groupId>ai.agentxm.examples</groupId>
  <artifactId>tinyflags-java</artifactId>
  <version>0.1.0</version>
</dependency>
```

TODO: once the library is published to Maven Central, the dependency will
resolve transparently without the local `install` step.

## Flag seams

Flag definitions live in `src/main/java/ai/agentxm/examples/pawmatch/Flags.java`.
Each is wired into at least one command so the companion skills have realistic
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

Rollouts are deterministic per user (the CLI derives `sessionId` from
`USER` / `USERNAME` / `LOGNAME` environment variables), so running the same
command twice produces the same flag values.

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
independently before giving. See `Charities.java`.
