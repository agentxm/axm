# Pub Dart TinyFlags

This example shows how a Pub (Dart) package can ship companion AXM extensions
for its users. The package is a small Dart feature-flag library named
`agentxm_example_tinyflags`.

The AXM extensions are published to AgentXM.ai under `@examples`. The Dart
package uses the Pub distribution name `agentxm_example_tinyflags` (Pub names
must match `[a-z0-9_]+`, so underscores replace the hyphens used in other
ecosystems).

The package metadata embeds AXM recommendations directly in `pubspec.yaml` as
a top-level `axm:` field:

```yaml
axm:
  recommendedExtensions:
    - "@examples/packs/pub-tinyflags@^0.1.0"
```

When this package is installed in another project, `axm discover` can read
that metadata from the resolved hosted-package directory (via
`.dart_tool/package_config.json`) and surface the companion pack as a
package-author recommendation.

A working consumer is in `../pub-app/` (the `pawmatch` CLI).

## Package

Targets Dart 3.0+ (pure Dart, no Flutter). Tests use `package:test`.

```bash
dart pub get
dart test
```

The library lives in `lib/agentxm_example_tinyflags.dart` and exposes:

- `BooleanFlag(default: ..., rollout: ...)`
- `VariantFlag(variants: ..., default: ..., rollout: ...)`
- `TinyFlags(definitions)` — `enabled(name, context)`, `variant(name, context)`,
  `evaluate(name, context)`

Flag classes are immutable (`final class`) and validate inputs in their
constructors. Bucketing is deterministic by `userId`, `accountId`, or
`sessionId` from the evaluation context.

## Companion Extensions

The authored extension sources live under `.axm/extensions/@examples/`.

| Type     | FQN                                            |
| -------- | ---------------------------------------------- |
| Skill    | `@examples/skills/pub-tinyflags-add-flag`       |
| Skill    | `@examples/skills/pub-tinyflags-rollout-review` |
| Skill    | `@examples/skills/pub-tinyflags-cleanup-flag`   |
| Subagent | `@examples/subagents/pub-tinyflags-maintainer`  |
| Pack     | `@examples/packs/pub-tinyflags`                 |

The pack bundles the three skills and the maintainer subagent. Each manifest
declares `pkg:pub/agentxm_example_tinyflags@0.1.0` as its companion package.

## Scenario

A Pub package author can use this layout as a model:

1. Implement the normal Dart package.
2. Embed package-native AXM metadata as a top-level `axm:` field in
   `pubspec.yaml` (sibling of `name`, `version`, `dependencies`, etc.).
3. Add AXM extension sources in `.axm/extensions/<owner>/`.
4. Mark the extensions as authored in `.axm/settings.json`.
5. Publish the extensions independently or as a companion pack.
