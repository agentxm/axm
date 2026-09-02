# Package-architecture migration status

Working ledger for implementing
[docs/architecture/package-architecture.md](../../docs/architecture/package-architecture.md).
Updated as each slice lands; delete this directory when migration step 7
completes. The design documents beside this file drive the remaining work:

- [design-interaction-split.md](design-interaction-split.md) — kernel modules
  stop importing CLI modules (slices S1–S5)
- [design-error-decoupling.md](design-error-decoupling.md) — typed failures
  replace AppError below the application (waves 0–3, scheduled per extraction)
- [design-workspace-partition.md](design-workspace-partition.md) — the
  workspace module partition, vocabulary moves V1–V5, knots K1–K5

Every slice lands only when build, typecheck, affected lint, and affected
tests are green; e2e runs before each push batch. `specifications/` is
read-only for this work.

## Landed on main

| Commit    | Content                                                                                                                                                                                                              |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 08034aa61 | Migration step 1: enforcement foundations (tags, layer matrix, banTransitiveDependencies, @nx/dependency-checks, inferred lint/test targets, targetDefaults, release-by-tag, stable specification-harness export)    |
| d5c28049c | Migration step 2: successor requirements accepted (package-dependencies-point-inward, live-composition-stays-in-application), exact-adjacency spec retired, literal-only bound-evidence channel added to the catalog |
| a146a4e35 | RegistryUrl moves to the registry module (kills registry→auth); transaction-aware fs helpers move utils→workspace (utils is a leaf again)                                                                            |

## Committed locally (push after the current batch)

Interaction-split batch (S1-S5 + straggler fix + migration docs) pushed to main
at 06a6b8e08.

| Commit    | Content                                                                                                                                                                                                   |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0ed62c73f | Interaction-split S1: PlanExecution/ConfirmationRecovery vocabulary moves into plan/plan-execution.ts                                                                                                     |
| 50d1e1c39 | Interaction-split S3: isCI → utils/environment, count() inlined, MCP install takes explicit nonInteractive                                                                                                |
| b67707066 | Interaction-split S2: resolve-plan behind the CLI-free ResolvePlanInteraction port; displayPlan → cli-renderer; InterruptionSignalSource                                                                  |
| 03144a7ee | Interaction-split S5: auth flows behind the AuthLoginPresenter port; renderer-backed Live in cli-runtime with machine-mode emission before side effects                                                   |
| 9daa7d366 | Interaction-split S4: workspace initialization decoupling — WorkspaceInitializationCancelled, presenter methods on the interaction service, WorkspaceMutationsOptions.nonInteractive, Live in cli-runtime |

## Completion

Migration steps 1-7 are implemented. The workspace holds two contracts,
three shared kernels (workspace-state, workspace-operations,
extension-workspace), three integrations (registry-client,
agent-integration, extension-sources), ten vertical features
(workspace-sync, workspace-lint, extension-lifecycle, extension-authoring,
extension-publish, extension-discovery, workspace-configuration,
workspace-inspection, registry-auth, knowledge-query), and the axm.sh
application shell; @agentxm/extension-management is deleted with no
compatibility surface. Full CI (workspace + complete e2e including the
compiled-binary and install suites) is green on the final state.

The subsequent CLI output migration is active: human presentation is moving to
a typed document model and one application-owned terminal screen while machine
contracts remain unchanged. The legacy imperative renderer is removed when all
feature views have migrated.

Recorded follow-up candidates (application wiring that could still descend
into features; each was deferred under the migration's scope-control rule
with rationale in the corresponding commit):

- publish selection/decoding, preview orchestration, and machine-output
  shaping in the CLI publish command
- the workspace-install/update plan collectors and per-type command-action
  policy (error-channel genericization across the seven action modules)
- fork/import/adopt/demote and per-type new-* command orchestration
- bundled-skill materialization (sequences the lifecycle feature)

## Baseline and environment notes

- Full CI (workspace + e2e incl. compiled-binary install suite) verified green
  at each push; `cli:compile-host` must have produced
  packages/cli/dist/host-bin/axm-linux-x64 for the install suite.
- TS7 typecheck (`tsc --build`) reports TS6305 on stale dist state after
  source moves; run `pnpm run build` first.
- `nx affected` with NX_HEAD set ignores uncommitted work; for working-tree
  verification pass only `--base=origin/main`.
