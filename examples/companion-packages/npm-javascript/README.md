# npm JavaScript TinyFlags

This example shows how an npm package can ship companion AXM extensions for its
users. The package is a small ES module feature flag library named
`@agentxm/example-tinyflags`.

The AXM extensions are published to AgentXM.ai under `@examples`. The npm
package uses the npm ecosystem scope `@agentxm`.

The package metadata embeds AXM recommendations directly in `package.json`:

```json
{
  "axm": {
    "recommendedExtensions": ["@examples/packs/npm-javascript-tinyflags@^0.1.0"]
  }
}
```

When this package is installed in another project, `axm discover` can read that
metadata from `node_modules/@agentxm/example-tinyflags/package.json` and
surface the companion pack as a package-author recommendation.

## Package

```bash
npm install
npm run typecheck   # checks JSDoc types in src/ with tsc
npm test            # node --test
npm run test:coverage
npm run build       # emits .d.ts files to dist/
```

The library lives in `src/index.js` and exposes:

- `booleanFlag(options)`
- `variantFlag(variants, options)`
- `createFlags(definitions)`

Types are authored as JSDoc with `// @ts-check`. `npm run build` emits
declaration files to `dist/` so TypeScript consumers get full type information
without the source itself being TypeScript.

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
declares `pkg:npm/@agentxm/example-tinyflags@0.1.0` as its companion package.

## Scenario

A framework or library author can use this layout as a model:

1. Implement the normal ecosystem package.
2. Embed package-native AXM metadata recommending the companion pack.
3. Add AXM extension sources in `.axm/extensions/<owner>/`.
4. Mark the extensions as authored in `.axm/settings.json`.
5. Publish the extensions independently or as a companion pack.
