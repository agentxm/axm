> **Orchestration:** The main agent thread MUST NOT execute any tasks directly. Delegate each phase to subagents as directed below. The main agent's role is strictly to orchestrate: launch subagents, verify phase completion, and proceed to the next phase. This directive takes precedence over any apply-phase instructions that say to execute tasks in the main thread — always use subagents for implementation work.

## 1. Simplify RegistrySource type

> **Subagent:** Run this entire phase in a single subagent.

- [ ] 1.1 In `packages/cli/src/sources/types.ts`, change `RegistrySource` from `RegistrySourceInput & RegistrySourceConfig` to just `RegistrySourceInput`. Remove the `RegistrySourceConfig` import if no longer used.
- [ ] 1.2 Run `pnpm typecheck` and fix any type errors caused by the simplified type. Grep for `RegistrySource` usages across `packages/cli/src/` to identify any code accessing config fields (`url`, `scopes`) on a narrowed registry source.
- [ ] 1.3 Run `pnpm lint` and fix any lint errors.

## 2. Implement routeRegistryInput and update tests

> **Subagent:** Run this entire phase in a single subagent.

- [ ] 2.1 Update the test in `packages/cli/src/sources/resolve-source.test.ts`: replace the "registry pattern is not yet supported" test with tests that verify `@scope/name` resolves to `{ type: "registry", scope: "scope", name: "name" }` with no config fields. Add a second test for a different scope/name combination.
- [ ] 2.2 In `packages/cli/src/sources/resolve-source.ts`, implement `routeRegistryInput`. Change its signature to accept the parsed `RegistryPatternInput` fields (`scope` and `name`) instead of the raw string. Construct and return a `RegistrySourceInput` (`{ type: "registry", scope, name }`). Update the call site in the `resolveSource` switch to pass `pattern.scope` and `pattern.name`.
- [ ] 2.3 Run `pnpm typecheck` and fix any type errors.
- [ ] 2.4 Run `pnpm lint` and fix any lint errors.
- [ ] 2.5 Run `pnpm test` and verify all tests pass (including the new registry resolution tests).
- [ ] 2.6 Run `pnpm test:e2e` and verify all E2E tests pass.
- [ ] 2.7 Kill any vitest worker processes.
