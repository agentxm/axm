# JSR TypeScript TinyFlags

This example shows how a JSR (Deno) package can ship companion AXM extensions
for its users. The package is a small TypeScript feature-flag library named
`@agentxm/example-tinyflags`, published to JSR.

The AXM extensions are published to AgentXM.ai under `@examples`. The JSR
package uses the JSR scope `@agentxm`.

The package metadata embeds AXM recommendations directly in `deno.json` as a
top-level `axm` field:

```json
{
  "axm": {
    "recommendedExtensions": ["@examples/packs/typescript-jsr-tinyflags@^0.1.0"]
  }
}
```

When this package is installed in another Deno project, `axm discover` can
read that metadata from Deno's JSR module cache
(`$DENO_DIR/registries/jsr.io/@agentxm/example-tinyflags/<version>/deno.json`)
and surface the companion pack as a package-author recommendation.

## Package

Targets Deno 2.0+. Tests use Deno's built-in test runner and `jsr:@std/assert`.

```bash
deno task test
deno task test:coverage
deno task check
```

The library lives in `src/index.ts` and exposes:

- `booleanFlag(options)`
- `variantFlag(variants, options)`
- `tinyFlags(definitions)` — `.enabled(name, ctx)`, `.variant(name, ctx)`, `.evaluate(name, ctx)`

Types are first-class TypeScript. Bucketing is deterministic by `userId`,
`accountId`, or `sessionId` from the evaluation context.

## Companion Extensions

The authored extension sources live under `.axm/extensions/@examples/`.

| Type     | FQN                                                        |
| -------- | ---------------------------------------------------------- |
| Skill    | `@examples/skills/typescript-jsr-tinyflags-add-flag`       |
| Skill    | `@examples/skills/typescript-jsr-tinyflags-rollout-review` |
| Skill    | `@examples/skills/typescript-jsr-tinyflags-cleanup-flag`   |
| Subagent | `@examples/subagents/typescript-jsr-tinyflags-maintainer`  |
| Pack     | `@examples/packs/typescript-jsr-tinyflags`                 |

The pack bundles the three skills and the maintainer subagent. Each manifest
declares `pkg:generic/jsr/@agentxm/example-tinyflags` as its companion package.

## Scenario

A working consumer is in `../typescript-jsr-app/` (the `pawmatch` CLI).

A JSR package author can use this layout as a model:

1. Implement the normal Deno/TypeScript package.
2. Embed package-native AXM metadata as a top-level `axm` field in
   `deno.json` (sibling of `name`, `version`, `exports`, etc.).
3. Add AXM extension sources in `.axm/extensions/<owner>/`.
4. Mark the extensions as authored in `.axm/settings.json`.
5. Publish the extensions independently or as a companion pack.
