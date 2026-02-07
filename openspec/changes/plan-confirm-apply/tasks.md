## 1. WorkspaceContextService: nonInteractive Resolution and preview Option

- [ ] 1.1 Write tests for `nonInteractive` resolution: explicit `Option.some(true)` → `true`, `Option.some(false)` → `false` (even with CI=true), `Option.none()` with CI=true → `true`, `Option.none()` without CI → `false`
- [ ] 1.2 Change `WorkspaceContextOptions.nonInteractive` from `boolean` to `Option<boolean>`; add `preview: boolean` to `WorkspaceContextOptions`
- [ ] 1.3 Resolve `nonInteractive` to plain `boolean` on the service at construction: `Option.getOrElse(options.nonInteractive, () => process.env.CI === "true")`; store `preview` on service
- [ ] 1.4 Update all callers constructing `WorkspaceContextOptions` to pass `nonInteractive` as `Option<boolean>` and add `preview: boolean`
- [ ] 1.5 Run typecheck (`pnpm typecheck`), fix any errors
- [ ] 1.6 Run linting (`pnpm lint`), fix any errors
- [ ] 1.7 Run tests (`pnpm test`), fix any failures
- [ ] 1.8 Run e2e tests (`pnpm test:e2e`), fix any failures
- [ ] 1.9 Kill any vitest worker processes

## 2. resolvePlan Method on WorkspaceContextService

- [ ] 2.1 Write tests for `resolvePlan` covering all branches: default (display + apply), preview interactive (display + confirm + apply/cancel), preview with `--yes` (display + auto-apply), preview with nonInteractive (display + warning, no apply)
- [ ] 2.2 Add `resolvePlan<Op>(plan: Plan<Op>)` to `WorkspaceContextService` interface
- [ ] 2.3 Implement `resolvePlan` in the service `make` function using the resolution algorithm from design.md
- [ ] 2.4 Export `resolvePlan` types/dependencies as needed from workspace barrel
- [ ] 2.5 Run typecheck (`pnpm typecheck`), fix any errors
- [ ] 2.6 Run linting (`pnpm lint`), fix any errors
- [ ] 2.7 Run tests (`pnpm test`), fix any failures
- [ ] 2.8 Run e2e tests (`pnpm test:e2e`), fix any failures
- [ ] 2.9 Kill any vitest worker processes

## 3. Install Command: Wire resolvePlan and Add --preview

- [ ] 3.1 Write/update handler tests to verify install handler calls `ws.resolvePlan(plan)` instead of inline logic
- [ ] 3.2 Replace inline plan-confirm-apply logic in install handler with `yield* ws.resolvePlan(plan)`
- [ ] 3.3 Add `--preview` flag to install command.ts yargs builder (boolean, default: false); remove any `--dry-run` flag reference
- [ ] 3.4 Update `InstallHandlerArgs` if needed (remove `dryRun` if present, ensure `preview` flows through workspace options)
- [ ] 3.5 Update install command boundary to pass `preview` to workspace options at runtime
- [ ] 3.6 Run typecheck (`pnpm typecheck`), fix any errors
- [ ] 3.7 Run linting (`pnpm lint`), fix any errors
- [ ] 3.8 Run tests (`pnpm test`), fix any failures
- [ ] 3.9 Run e2e tests (`pnpm test:e2e`), fix any failures
- [ ] 3.10 Kill any vitest worker processes

## 4. Uninstall Command: Wire resolvePlan and Replace --dry-run with --preview

- [ ] 4.1 Write/update handler tests to verify uninstall handler calls `ws.resolvePlan(plan)` instead of inline logic
- [ ] 4.2 Replace `dryRun: boolean` with `preview` flowing through workspace options in `UninstallArgs`
- [ ] 4.3 Replace `--dry-run` with `--preview` in uninstall command.ts yargs builder (boolean, default: false)
- [ ] 4.4 Update uninstall handler to use `ws.resolvePlan(plan)` when plan logic is implemented
- [ ] 4.5 Update uninstall command boundary to pass `preview` to workspace options at runtime
- [ ] 4.6 Run typecheck (`pnpm typecheck`), fix any errors
- [ ] 4.7 Run linting (`pnpm lint`), fix any errors
- [ ] 4.8 Run tests (`pnpm test`), fix any failures
- [ ] 4.9 Run e2e tests (`pnpm test:e2e`), fix any failures
- [ ] 4.10 Kill any vitest worker processes

## 5. E2E Tests: --dry-run → --preview

- [ ] 5.1 Rename `install/dry-run.e2e.test.ts` to `install/preview.e2e.test.ts`; update all `--dry-run` references to `--preview` and `dryRun` to `preview` in the file
- [ ] 5.2 Update `install/command.e2e.test.ts`: replace all `--dry-run` references with `--preview`
- [ ] 5.3 Update `uninstall/command.e2e.test.ts`: replace all `--dry-run` references with `--preview`
- [ ] 5.4 Run typecheck (`pnpm typecheck`), fix any errors
- [ ] 5.5 Run linting (`pnpm lint`), fix any errors
- [ ] 5.6 Run tests (`pnpm test`), fix any failures
- [ ] 5.7 Run e2e tests (`pnpm test:e2e`), fix any failures
- [ ] 5.8 Kill any vitest worker processes

## 6. Documentation and Spec Cleanup

- [ ] 6.1 Update `CLAUDE.md`: change `--dry-run` to `--preview` in CLI Conventions table
- [ ] 6.2 Delete `docs/designs/dry-run.md`
- [ ] 6.3 Update root `proposal.md`: replace `--dry-run` references with `--preview`
- [ ] 6.4 Update `openspec/specs/cli-skills-install/spec.md`: replace `dryRun` scenarios with `preview` scenarios
- [ ] 6.5 Update comments in `extensions/skills/state/types.ts` and `extensions/skills/state/index.ts` referencing `dry-run.md`
- [ ] 6.6 Run typecheck (`pnpm typecheck`), fix any errors
- [ ] 6.7 Run linting (`pnpm lint`), fix any errors
- [ ] 6.8 Run tests (`pnpm test`), fix any failures
- [ ] 6.9 Run e2e tests (`pnpm test:e2e`), fix any failures
- [ ] 6.10 Kill any vitest worker processes
