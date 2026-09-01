# Standing brief for implementation agents (axm package-architecture migration)

Worktree: /home/exedev/Code/agentxm/wt/axm-pkg-arch (branch pkg-arch). Work ONLY here.
Read the axm repo instructions first: CLAUDE.md at the worktree root (command policy,
Effect v4 rules, no type assertions, test taxonomy). Effect v4; ServiceMap is imported
as `import * as ServiceMap from "effect/Context"`.

Env for every command:
export NX_TUI=false NX_DEFAULT_OUTPUT_STYLE=static NX_TASKS_RUNNER_DYNAMIC_OUTPUT=false

Verification ladder after your edits (run from the worktree root):

1. pnpm run build # MUST run before typecheck: the TS7 typecheck (tsc --build) # errors TS6305 on stale dist state; a build clears it.
2. pnpm run typecheck
3. pnpm exec nx affected -t lint --batch --nxBail --base=origin/main
4. pnpm exec nx affected -t test --nxBail --maxWorkers=2 --base=origin/main
   All four must pass. Never use --skip-nx-cache unless diagnosing staleness.
   Do NOT run pnpm run ci / e2e (the orchestrator does that in batches).
   Do NOT commit or push — leave the working tree dirty; report done.

Gotchas already hit:

- `yield*` may only be inserted where the enclosing function is a generator
  (Effect.gen(function* ...) / Effect.fn(...)(function* ...)); a site inside an arrow
  closure needs a hoisted `const x = yield* ...;` in the enclosing gen body instead.
- When adding an import to a CLI file, check whether the module already imports from
  that specifier and merge instead of duplicating.
- eslint no-restricted-syntax forbids new Date/Date.now, Effect.orDie without comment,
  Effect.run* outside entry adapters, module-global Map; consistent-type-assertions:
  never (`as const` allowed); no `any`; unused imports/vars are errors.
- prettier runs at commit; keep lines under ~100 chars to reduce churn.
- Intra-package cross-module imports use relative paths ("../plan/plan-execution.js");
  external consumers use "@agentxm/extension-management/unstable/<module>".
- Service IDs are path-namespaced strings
  ("@agentxm/extension-management/unstable/<module>/<file>/<Name>") — keep them in
  sync when a service definition file moves.
- The specification suite treats specifications/ as READ-ONLY for implementation
  tasks. If a spec fails, your change broke behavior — fix the implementation, never
  the spec. Run a focused spec via: pnpm run test:spec --requirement <id>.
- Behavioral parity is the bar: user-visible strings, exit codes, machine JSON output,
  suggestion sets must be byte-identical unless the slice design says otherwise.

Report back (keep it short): slice done/blocked, files changed count, verification
results (each of the 4 gates), any deviations from the design with one-line rationale.
