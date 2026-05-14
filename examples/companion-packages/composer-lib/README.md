# Composer PHP TinyFlags

This example shows how a Composer (PHP) package can ship companion AXM
extensions for its users. The package is a small PSR-4 feature flag library
named `agentxm/example-tinyflags`.

The AXM extensions are published to AgentXM.ai under `@examples`. The Composer
package uses the `agentxm` vendor namespace.

The package metadata embeds AXM recommendations directly in `composer.json`
under the `extra.axm` key (Composer's conventional spot for tool-specific
configuration):

```json
{
  "extra": {
    "axm": {
      "recommendedExtensions": ["@examples/packs/composer-tinyflags@^0.1.0"]
    }
  }
}
```

When this package is installed in another project, `axm discover` can read
that metadata from `vendor/agentxm/example-tinyflags/composer.json` and
surface the companion pack as a package-author recommendation.

## Package

```bash
composer install
composer test           # phpunit
```

The library lives in `src/` under the `AgentXM\Examples\TinyFlags` namespace
and exposes:

- `BooleanFlag` — boolean flag with optional integer percentage rollout
- `VariantFlag` — named-treatment flag with optional per-variant allocations
- `Flags` — evaluator over a map of named flag definitions
- `EvaluationContext` — stable identity for deterministic bucketing

## Companion Extensions

The authored extension sources live under `.axm/extensions/@examples/`.

| Type     | FQN                                                    |
| -------- | ------------------------------------------------------ |
| Skill    | `@examples/skills/composer-tinyflags-add-flag`         |
| Skill    | `@examples/skills/composer-tinyflags-rollout-review`   |
| Skill    | `@examples/skills/composer-tinyflags-cleanup-flag`     |
| Subagent | `@examples/subagents/composer-tinyflags-maintainer`    |
| Pack     | `@examples/packs/composer-tinyflags`                   |

The pack bundles the three skills and the maintainer subagent. Each manifest
declares `pkg:composer/agentxm/example-tinyflags@^0.1.0` as its companion
package.

## Scenario

A working consumer is in `../composer-app/` (the `pawmatch` CLI).

A framework or library author can use this layout as a model:

1. Implement the normal Composer package.
2. Embed package-native AXM metadata recommending the companion pack under
   `extra.axm` in `composer.json`.
3. Add AXM extension sources in `.axm/extensions/<owner>/`.
4. Mark the extensions as authored in `.axm/settings.json`.
5. Publish the extensions independently or as a companion pack.
