# Maven Kotlin TinyFlags

This example shows how a Maven Central package can ship companion AXM
extensions for its users. The package is a small Kotlin feature flag
library named `ai.agentxm.examples:tinyflags-kotlin`.

The AXM extensions are published to AgentXM.ai under `@examples`. The
Maven coordinate uses the `ai.agentxm.examples` group id.

> Note: production Kotlin projects typically use the Gradle Kotlin DSL
> (`build.gradle.kts`). This example uses `pom.xml` for parity with the
> Java sibling and so the `axm.json` packaging story stays uniform across
> JVM ecosystems.

The package ships AXM recommendations in an `axm.json` resource that is
packaged into the JAR at `META-INF/axm.json`:

```json
{
  "$schema": "https://axm.sh/schemas/axm-package-meta.schema.json",
  "recommendedExtensions": ["@examples/packs/kotlin-maven-tinyflags@^0.1.0"]
}
```

When this package is installed in another project, `axm discover` can read
that resource from the JAR in `~/.m2/repository/ai/agentxm/examples/tinyflags-kotlin/0.1.0/`
and surface the companion pack as a package-author recommendation.

A working consumer is in `../kotlin-maven-app/` (the `pawmatch` CLI).

## Layout

```text
.
├── pom.xml                                Maven build (Kotlin Maven plugin, Kotest)
├── src/main/kotlin/ai/agentxm/examples/tinyflags/
│                                          Library sources
├── src/main/resources/META-INF/axm.json   Companion-extension recommendations
└── src/test/kotlin/ai/agentxm/examples/tinyflags/
                                           Kotest StringSpec tests
```

## Build & test

```bash
mvn -q test          # runs Kotest via JUnit Platform
mvn -q package       # produces target/tinyflags-kotlin-0.1.0.jar with META-INF/axm.json
```

The test suite uses Kotest (`StringSpec`) and runs through the JUnit
Platform surefire integration.

## Publishing readiness

The `pom.xml` is set up for Maven Central-style publishing: it declares
`<licenses>`, `<developers>`, and `<scm>` metadata, and wires
`maven-source-plugin` (sources jar) and `dokka-maven-plugin` (Javadoc-style
jar via Dokka, the Kotlin-native doc generator — `maven-javadoc-plugin`
would silently produce empty docs for `.kt` sources). Running
`mvn verify` attaches both jars.

This example does NOT wire `central-publishing-maven-plugin` or GPG
signing because those require real Central Portal credentials and a
signing key. To publish for real, add the plugin and signing
configuration alongside the existing setup.

## Library

The library lives in
`src/main/kotlin/ai/agentxm/examples/tinyflags/TinyFlags.kt` and exposes:

- `booleanFlag(default, rollout?)` — smart constructor
- `variantFlag(variants, default?, rollout?)` — smart constructor
- `Flags.of(...)` / `createFlags(...)`
- `Context(id)` and `Context.ANONYMOUS`
- `FlagValue` — sealed result (`Bool` / `Variant`)

```kotlin
import ai.agentxm.examples.tinyflags.Context
import ai.agentxm.examples.tinyflags.booleanFlag
import ai.agentxm.examples.tinyflags.createFlags
import ai.agentxm.examples.tinyflags.variantFlag

val flags = createFlags(
    "checkoutRedesign" to booleanFlag(default = true),
    "searchRanking" to variantFlag(
        variants = listOf("classic", "semantic"),
        rollout = mapOf("semantic" to 100),
    ),
)

val ctx = Context("user-1")

flags.enabled("checkoutRedesign", ctx)     // true
flags.variant("searchRanking", ctx)        // "semantic"
flags.evaluate("searchRanking", ctx)       // FlagValue.Variant("semantic")
```

## Companion Extensions

The authored extension sources live under `.axm/extensions/@examples/`.

| Type     | FQN                                                      |
| -------- | -------------------------------------------------------- |
| Skill    | `@examples/skills/kotlin-maven-tinyflags-add-flag`       |
| Skill    | `@examples/skills/kotlin-maven-tinyflags-rollout-review` |
| Skill    | `@examples/skills/kotlin-maven-tinyflags-cleanup-flag`   |
| Subagent | `@examples/subagents/kotlin-maven-tinyflags-maintainer`  |
| Pack     | `@examples/packs/kotlin-maven-tinyflags`                 |

The pack bundles the three skills and the maintainer subagent. Each
manifest declares `pkg:maven/ai.agentxm.examples/tinyflags-kotlin` as its
companion package.

## Scenario

A Maven Central package author can use this layout as a model:

1. Implement the normal JVM package.
2. Pack `axm.json` into the JAR at `META-INF/axm.json` via the standard
   resources directory.
3. Add AXM extension sources in `.axm/extensions/<owner>/`.
4. Mark the extensions as authored in `.axm/settings.json`.
5. Publish the extensions independently or as a companion pack.
