# Maven Java TinyFlags

This example shows how a Maven Central package can ship companion AXM
extensions for its users. The package is a small Java feature flag library
named `ai.agentxm.examples:tinyflags-java`.

The AXM extensions are published to AgentXM.ai under `@examples`. The Maven
package uses the `ai.agentxm.examples` group id.

The package ships AXM recommendations in a packaged JAR resource at
`META-INF/axm.json`:

```json
{
  "recommendedExtensions": ["@examples/packs/java-maven-tinyflags@^0.1.0"]
}
```

When this package is installed in another project, `axm discover` can read
`META-INF/axm.json` from the JAR in `~/.m2/repository/` or the Gradle cache
and surface the companion pack as a package-author recommendation.

A working consumer is in `../java-maven-app/` (the `pawmatch` CLI).

## Layout

```text
.
├── pom.xml                                    Maven build manifest
├── src/main/java/                             Library sources
├── src/main/resources/META-INF/axm.json       Companion-extension recommendations
└── src/test/java/                             JUnit 5 tests
```

## Build & test

```bash
mvn -q test
mvn -q install   # publish to ~/.m2 so the app can resolve it
```

`mvn -q install` publishes the JAR to your local Maven repository so the
sibling `java-maven-app/` project can resolve it.

## Publishing readiness

The POM is set up for Maven Central–style publishing: it produces sources
and javadoc jars (via `maven-source-plugin` and `maven-javadoc-plugin`) and
declares the `license`, `developers`, and `scm` metadata Central requires.
It does **not** wire `central-publishing-maven-plugin` or GPG signing,
since both require real Central credentials and a signing key — a real
publisher would add those in their own fork.

## Library

The library lives in `src/main/java/ai/agentxm/examples/tinyflags/` and
exposes a builder-style API:

- `TinyFlags.builder().booleanFlag(...).variantFlag(...).build()`
- `Flag.booleanFlag(defaultValue[, rollout])` — smart constructor
- `Flag.variantFlag(variants[, defaultValue[, rollout]])` — smart constructor
- `EvaluationContext.ofUser(...)` / `ofAccount(...)` / `ofSession(...)`
- `FlagValue` — typed result sealed interface (`BoolValue` / `VariantValue`)

```java
import ai.agentxm.examples.tinyflags.EvaluationContext;
import ai.agentxm.examples.tinyflags.TinyFlags;

TinyFlags flags = TinyFlags.builder()
    .booleanFlag("checkoutRedesign", true)
    .variantFlag(
        "searchRanking",
        java.util.List.of("classic", "semantic"),
        "classic",
        java.util.Map.of("semantic", 100))
    .build();

EvaluationContext ctx = EvaluationContext.ofUser("user-1");

flags.enabled("checkoutRedesign", ctx);   // true
flags.variant("searchRanking", ctx);      // "semantic"
flags.evaluate("searchRanking", ctx);     // VariantValue("semantic")
```

## Companion Extensions

The authored extension sources live under `.axm/extensions/@examples/`.

| Type     | FQN                                                    |
| -------- | ------------------------------------------------------ |
| Skill    | `@examples/skills/java-maven-tinyflags-add-flag`       |
| Skill    | `@examples/skills/java-maven-tinyflags-rollout-review` |
| Skill    | `@examples/skills/java-maven-tinyflags-cleanup-flag`   |
| Subagent | `@examples/subagents/java-maven-tinyflags-maintainer`  |
| Pack     | `@examples/packs/java-maven-tinyflags`                 |

The pack bundles the three skills and the maintainer subagent. Each manifest
declares `pkg:maven/ai.agentxm.examples/tinyflags-java` as its companion
package.

## Scenario

A Maven package author can use this layout as a model:

1. Implement the normal Java package.
2. Pack `META-INF/axm.json` into the JAR (via `src/main/resources/`).
3. Add AXM extension sources in `.axm/extensions/<owner>/`.
4. Mark the extensions as authored in `.axm/settings.json`.
5. Publish the extensions independently or as a companion pack.
