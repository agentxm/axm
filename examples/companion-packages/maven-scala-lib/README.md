# Maven Scala TinyFlags

This example shows how a Maven Central package can ship companion AXM
extensions for its users. The package is a small Scala 3 feature flag
library named `ai.agentxm.examples:tinyflags-scala_3` (the `_3` suffix is
the standard Scala 3 binary-compatibility marker).

The AXM extensions are published to AgentXM.ai under `@examples`. The
Maven coordinate uses the `ai.agentxm.examples` group id.

> Note: production Scala projects typically use sbt (`build.sbt`). This
> example uses `pom.xml` for parity with the Java and Kotlin siblings and
> so the `axm.json` packaging story stays uniform across JVM ecosystems.
> A sister `sbt-scala-*` example could follow once AXM's package detector
> learns to read sbt build definitions.

The package ships AXM recommendations in an `axm.json` resource that is
packaged into the JAR at `META-INF/axm.json`:

```json
{
  "$schema": "https://axm.sh/schemas/axm-package-meta.schema.json",
  "recommendedExtensions": ["@examples/packs/maven-scala-tinyflags@^0.1.0"]
}
```

When this package is installed in another project, `axm discover` can read
that resource from the JAR in
`~/.m2/repository/ai/agentxm/examples/tinyflags-scala_3/0.1.0/` and surface
the companion pack as a package-author recommendation.

A working consumer is in `../maven-scala-app/` (the `pawmatch` CLI).

## Layout

```text
.
├── pom.xml                                Maven build (scala-maven-plugin, MUnit)
├── src/main/scala/ai/agentxm/examples/tinyflags/
│                                          Library sources
├── src/main/resources/META-INF/axm.json   Companion-extension recommendations
└── src/test/scala/ai/agentxm/examples/tinyflags/
                                           MUnit test suite
```

## Build & test

```bash
mvn -q test          # runs MUnit via surefire
mvn -q package       # produces target/tinyflags-scala_3-0.1.0.jar with META-INF/axm.json
```

## Library

The library lives in
`src/main/scala/ai/agentxm/examples/tinyflags/TinyFlags.scala` and exposes:

- `booleanFlag(default, rollout = None)` — smart constructor
- `variantFlag(variants, default = None, rollout = None)` — smart constructor
- `Flags.of(...)` / `createFlags(...)`
- `Context(id)` and `Context.Anonymous`
- `FlagValue` — sealed result (`Bool` / `Variant`)

```scala
import ai.agentxm.examples.tinyflags.*

val flags = createFlags(
  "checkoutRedesign" -> booleanFlag(default = true),
  "searchRanking" -> variantFlag(
    variants = List("classic", "semantic"),
    rollout = Some(Map("semantic" -> 100)),
  ),
)

val ctx = Context("user-1")

flags.enabled("checkoutRedesign", ctx)  // true
flags.variant("searchRanking", ctx)     // "semantic"
flags.evaluate("searchRanking", ctx)    // FlagValue.Variant("semantic")
```

## Companion Extensions

The authored extension sources live under `.axm/extensions/@examples/`.

| Type     | FQN                                                     |
| -------- | ------------------------------------------------------- |
| Skill    | `@examples/skills/maven-scala-tinyflags-add-flag`       |
| Skill    | `@examples/skills/maven-scala-tinyflags-rollout-review` |
| Skill    | `@examples/skills/maven-scala-tinyflags-cleanup-flag`   |
| Subagent | `@examples/subagents/maven-scala-tinyflags-maintainer`  |
| Pack     | `@examples/packs/maven-scala-tinyflags`                 |

The pack bundles the three skills and the maintainer subagent. Each
manifest declares `pkg:maven/ai.agentxm.examples/tinyflags-scala_3` as its
companion package.

## Scenario

A Maven Central package author can use this layout as a model:

1. Implement the normal Scala 3 package.
2. Pack `axm.json` into the JAR at `META-INF/axm.json` via the standard
   resources directory.
3. Add AXM extension sources in `.axm/extensions/<owner>/`.
4. Mark the extensions as authored in `.axm/settings.json`.
5. Publish the extensions independently or as a companion pack.
