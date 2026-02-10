## 1. WorkspaceContextService: nonInteractive Resolution and preview Option

- [x] 1.1 Write tests for `nonInteractive` resolution: explicit `Option.some(true)` → `true`, `Option.some(false)` → `false` (even with CI=true), `Option.none()` with CI=true → `true`, `Option.none()` without CI → `false`
- [x] 1.2 Change `WorkspaceContextOptions.nonInteractive` from `boolean` to `Option<boolean>`; add `preview: boolean` to `WorkspaceContextOptions`
- [x] 1.3 Resolve `nonInteractive` to plain `boolean` on the service at construction: `Option.getOrElse(options.nonInteractive, () => process.env.CI === "true")`; store `preview` on service
- [x] 1.4 Update all callers constructing `WorkspaceContextOptions` to pass `nonInteractive` as `Option<boolean>` and add `preview: boolean`
- [x] 1.5 Run typecheck (`pnpm typecheck`), fix any errors
- [x] 1.6 Run linting (`pnpm lint`), fix any errors
- [x] 1.7 Run tests (`pnpm test`), fix any failures
- [x] 1.8 Run e2e tests (`pnpm test:e2e`), fix any failures
- [x] 1.9 Kill any vitest worker processes

## 2. resolvePlan Method on WorkspaceContextService

- [x] 2.1 Write tests for `resolvePlan` covering all branches: default (display + apply), preview interactive (display + confirm + apply/cancel), preview with `--yes` (display + auto-apply), preview with nonInteractive (display + warning, no apply)
- [x] 2.2 Add `resolvePlan<Op>(plan: Plan<Op>)` to `WorkspaceContextService` interface
- [x] 2.3 Implement `resolvePlan` in the service `make` function using the resolution algorithm from design.md
- [x] 2.4 Export `resolvePlan` types/dependencies as needed from workspace barrel
- [x] 2.5 Run typecheck (`pnpm typecheck`), fix any errors
- [x] 2.6 Run linting (`pnpm lint`), fix any errors
- [x] 2.7 Run tests (`pnpm test`), fix any failures
- [x] 2.8 Run e2e tests (`pnpm test:e2e`), fix any failures
- [x] 2.9 Kill any vitest worker processes

## 3. Install Command: Wire resolvePlan and Add --preview

- [x] 3.1 Write/update handler tests to verify install handler calls `ws.resolvePlan(plan)` instead of inline logic
- [x] 3.2 Replace inline plan-confirm-apply logic in install handler with `yield* ws.resolvePlan(plan)`
- [x] 3.3 Add `--preview` flag to install command.ts yargs builder (boolean, default: false); remove any `--dry-run` flag reference
- [x] 3.4 Update `InstallHandlerArgs` if needed (remove `dryRun` if present, ensure `preview` flows through workspace options)
- [x] 3.5 Update install command boundary to pass `preview` to workspace options at runtime
- [x] 3.6 Run typecheck (`pnpm typecheck`), fix any errors
- [x] 3.7 Run linting (`pnpm lint`), fix any errors
- [x] 3.8 Run tests (`pnpm test`), fix any failures
- [x] 3.9 Run e2e tests (`pnpm test:e2e`), fix any failures
- [x] 3.10 Kill any vitest worker processes

## 4. Uninstall Command: Wire resolvePlan and Replace --dry-run with --preview

- [x] 4.1 Write/update handler tests to verify uninstall handler calls `ws.resolvePlan(plan)` instead of inline logic
- [x] 4.2 Replace `dryRun: boolean` with `preview` flowing through workspace options in `UninstallArgs`
- [x] 4.3 Replace `--dry-run` with `--preview` in uninstall command.ts yargs builder (boolean, default: false)
- [x] 4.4 Update uninstall handler to use `ws.resolvePlan(plan)` when plan logic is implemented
- [x] 4.5 Update uninstall command boundary to pass `preview` to workspace options at runtime
- [x] 4.6 Run typecheck (`pnpm typecheck`), fix any errors
- [x] 4.7 Run linting (`pnpm lint`), fix any errors
- [x] 4.8 Run tests (`pnpm test`), fix any failures
- [x] 4.9 Run e2e tests (`pnpm test:e2e`), fix any failures
- [x] 4.10 Kill any vitest worker processes

## 5. E2E Tests: --dry-run → --preview

- [x] 5.1 Rename `install/dry-run.e2e.test.ts` to `install/preview.e2e.test.ts`; update all `--dry-run` references to `--preview` and `dryRun` to `preview` in the file
- [x] 5.2 Update `install/command.e2e.test.ts`: replace all `--dry-run` references with `--preview`
- [x] 5.3 Update `uninstall/command.e2e.test.ts`: replace all `--dry-run` references with `--preview`
- [x] 5.4 Run typecheck (`pnpm typecheck`), fix any errors
- [x] 5.5 Run linting (`pnpm lint`), fix any errors
- [x] 5.6 Run tests (`pnpm test`), fix any failures
- [x] 5.7 Run e2e tests (`pnpm test:e2e`), fix any failures
- [x] 5.8 Kill any vitest worker processes

## 6. Documentation and Spec Cleanup

- [x] 6.1 Update `CLAUDE.md`: change `--dry-run` to `--preview` in CLI Conventions table
- [x] 6.2 Delete `docs/designs/dry-run.md`
- [x] 6.3 Update root `proposal.md`: replace `--dry-run` references with `--preview`
- [x] 6.4 Update `openspec/specs/cli-skills-install/spec.md`: replace `dryRun` scenarios with `preview` scenarios
- [x] 6.5 Update comments in `extensions/skills/state/types.ts` and `extensions/skills/state/index.ts` referencing `dry-run.md`
- [x] 6.6 Run typecheck (`pnpm typecheck`), fix any errors
- [x] 6.7 Run linting (`pnpm lint`), fix any errors
- [x] 6.8 Run tests (`pnpm test`), fix any failures
- [x] 6.9 Run e2e tests (`pnpm test:e2e`), fix any failures
- [x] 6.10 Kill any vitest worker processes
