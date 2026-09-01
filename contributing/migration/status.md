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

## In flight

- Interaction-split S5 auth presenter (design-interaction-split §S5).
- B0 ref-vocabulary contract descent (working tree): the extension-management
  workspace barrel still fronts the vocabulary moved to extension-model
  (refs, WorkspaceScope, installable-types, SourceHostProvider port types,
  SourceHash) via re-exports — sanctioned this slice only; the
  kernel-extraction slice must finish pointing barrel consumers at
  @agentxm/extension-model.

## Remaining (in order)

2. Error-decoupling wave 0 enablers: toAppError dispatcher + classifyError
   branch + OperationErrorCategory (~11 files)
3. Workspace-partition S1 contract descent: release-age → registry-protocol,
   AGENTS registry → extension-model, path-types/format-issues homing (~53)
4. Workspace-partition S2 ref vocabulary → workspace-state area (V2+V5+§3.4
   predicates) (~120)
5. Workspace-partition S3 sources split (syntax → contract, lock-entry
   mapping → WS, K4 printer grammar lift) (~76)
6. Workspace-partition S4 transaction WS/WO seam + WorkspaceMutations
   capability injection + ExtensionManager → extension-workspace (~30)
7. Workspace-partition S5 AgentPresence port (~6)
8. Error-decoupling wave 1 (kernel modules, 4 sub-steps per design §5.5, ~150)
9. Workspace-partition S6 feature pulls + S7 knots K1/K2/K3/K5 (~80+)
10. Migration step 3: extract @agentxm/workspace-state, workspace-operations,
    extension-workspace packages
11. Migration step 4: extract registry-client, extension-sources,
    agent-integration (+ error wave 2)
12. Migration steps 5–6: feature packages one slice at a time, sync and lint
    first (+ error wave 3); CLI handlers thin down per slice
13. Migration step 7: delete extension-management; CLI-destined modules
    (app-error, cli-*, telemetry, install-meta/method, update-check,
    version-resolution, branding) move into axm.sh; update the architecture
    specs that hardcode package lists
    (public-system-depends-only-on-published-contracts,
    e2e-observes-only-shipped-artifacts), instructions, and docs

## Baseline and environment notes

- Full CI (workspace + e2e incl. compiled-binary install suite) verified green
  at each push; `cli:compile-host` must have produced
  packages/cli/dist/host-bin/axm-linux-x64 for the install suite.
- TS7 typecheck (`tsc --build`) reports TS6305 on stale dist state after
  source moves; run `pnpm run build` first.
- `nx affected` with NX_HEAD set ignores uncommitted work; for working-tree
  verification pass only `--base=origin/main`.
