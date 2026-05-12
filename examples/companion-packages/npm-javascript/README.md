# npm JavaScript TinyFlags

This example shows how an npm package can ship companion AXM extensions for its
users. The package is a small ES module feature flag library named
`@agentxm/tinyflags`.

The AXM extensions are published to AgentXM.ai under `@examples`. The npm
package uses the npm ecosystem scope `@agentxm`.

## Package

```bash
npm test
```

The library lives in `src/index.js` and exposes:

- `booleanFlag(options)`
- `variantFlag(variants, options)`
- `createFlags(definitions)`

## Companion Extensions

The authored extension sources live under `.axm/extensions/@examples/`.

| Type     | FQN                                                        |
| -------- | ---------------------------------------------------------- |
| Skill    | `@examples/skills/npm-javascript-tinyflags-add-flag`       |
| Skill    | `@examples/skills/npm-javascript-tinyflags-rollout-review` |
| Skill    | `@examples/skills/npm-javascript-tinyflags-cleanup-flag`   |
| Subagent | `@examples/subagents/npm-javascript-tinyflags-maintainer`  |
| Pack     | `@examples/packs/npm-javascript-tinyflags`                 |

The pack bundles the three skills and the maintainer subagent. Each manifest
declares `pkg:npm/@agentxm/tinyflags@0.1.0` as its companion package.

## Scenario

A framework or library author can use this layout as a model:

1. Implement the normal ecosystem package.
2. Add AXM extension sources in `.axm/extensions/<owner>/`.
3. Mark the extensions as authored in `.axm/settings.json`.
4. Publish the extensions independently or as a companion pack.
