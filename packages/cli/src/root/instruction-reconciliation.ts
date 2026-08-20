import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { makeAppError, type AppError } from "@agentxm/client-core/unstable/app-error";
import {
  assertInstructionTargetsSafe,
  assertInstructionsGitignoreSafe,
  getInstructionsGitignoreStatus,
  getInstructionsStatus,
  removeManagedInstructionTargets,
  removeInstructionsGitignore,
  resolveInstructionsConfig,
  syncInstructions,
  type InstructionsStatus,
  type ResolvedInstructionsConfig,
} from "@agentxm/client-core/unstable/agents";
import type { WorkspaceMutationsService } from "@agentxm/client-core/unstable/workspace";

const ownedTargetsCurrent = (status: InstructionsStatus): boolean =>
  status.items.every(
    (item) => (item.mechanism !== "symlink" && item.mechanism !== "copy") || item.health === "ok",
  );

const configuredAgents = (ws: WorkspaceMutationsService) => ws.getConfiguredAgents();

export const activeInstructionsConfig = Effect.fn("Instructions.activeConfig")(function* (
  ws: WorkspaceMutationsService,
) {
  const value = yield* ws.getInstructionsConfig();
  if (Option.isNone(value) || value.value === false) {
    return Option.none<ResolvedInstructionsConfig>();
  }
  return Option.some(resolveInstructionsConfig(value.value));
});

export const instructionStateIsCurrent = Effect.fn("Instructions.stateIsCurrent")(function* (args: {
  readonly ws: WorkspaceMutationsService;
  readonly config: ResolvedInstructionsConfig;
}) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const agents = yield* configuredAgents(args.ws);
  const status = yield* getInstructionsStatus({
    workspaceRoot: args.ws.baseDir,
    scope: args.ws.scope,
    configuredAgents: agents,
    config: args.config,
  });
  const gitignore = yield* getInstructionsGitignoreStatus({
    workspaceRoot: args.ws.baseDir,
    scope: args.ws.scope,
    configuredAgents: agents,
    config: args.config,
  });
  const sourcesExist = yield* Effect.forEach(
    status.roots,
    (root) =>
      fs
        .exists(path.join(root, args.config.fileName))
        .pipe(Effect.catch(() => Effect.succeed(false))),
    { concurrency: "unbounded" },
  );
  return sourcesExist.every(Boolean) && ownedTargetsCurrent(status) && gitignore.current;
});

export const instructionReconciliationReadiness = Effect.fn("Instructions.reconciliationReadiness")(
  function* (args: {
    readonly ws: WorkspaceMutationsService;
    readonly config: ResolvedInstructionsConfig;
  }) {
    const agents = yield* configuredAgents(args.ws);
    return yield* Effect.result(
      Effect.all(
        [
          assertInstructionTargetsSafe({
            workspaceRoot: args.ws.baseDir,
            scope: args.ws.scope,
            configuredAgents: agents,
            config: args.config,
          }),
          assertInstructionsGitignoreSafe(args.ws.baseDir),
        ],
        { concurrency: 1, discard: true },
      ),
    ).pipe(
      Effect.map((result) =>
        result._tag === "Success" ? Option.none<AppError>() : Option.some(result.failure),
      ),
    );
  },
);

export const reconcileInstructionTransition = <A>(args: {
  readonly ws: WorkspaceMutationsService;
  readonly config: ResolvedInstructionsConfig;
  readonly preflightConfig?: ResolvedInstructionsConfig;
  readonly transition: Effect.Effect<A, AppError>;
}): Effect.Effect<A, AppError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const agents = yield* configuredAgents(args.ws);
    yield* assertInstructionTargetsSafe({
      workspaceRoot: args.ws.baseDir,
      scope: args.ws.scope,
      configuredAgents: agents,
      config: args.preflightConfig ?? args.config,
    });
    yield* assertInstructionsGitignoreSafe(args.ws.baseDir);
    const transitionResult = yield* args.transition;
    const syncResult = yield* syncInstructions({
      workspaceRoot: args.ws.baseDir,
      scope: args.ws.scope,
      configuredAgents: agents,
      config: args.config,
      force: true,
      dryRun: false,
    });
    const gitignore = yield* getInstructionsGitignoreStatus({
      workspaceRoot: args.ws.baseDir,
      scope: args.ws.scope,
      configuredAgents: agents,
      config: args.config,
    });
    if (!ownedTargetsCurrent(syncResult.status) || !gitignore.current) {
      return yield* makeAppError({
        code: "internal",
        detail: "Instruction reconciliation did not reach the desired state",
      });
    }
    return transitionResult;
  }).pipe(Effect.withSpan("Instructions.reconcileTransition"));

export const disableInstructionManagement = Effect.fn("Instructions.disableManagement")(
  function* (args: {
    readonly ws: WorkspaceMutationsService;
    readonly config: ResolvedInstructionsConfig;
  }) {
    const agents = yield* configuredAgents(args.ws);
    yield* assertInstructionsGitignoreSafe(args.ws.baseDir);
    const removed = yield* removeManagedInstructionTargets({
      workspaceRoot: args.ws.baseDir,
      scope: args.ws.scope,
      configuredAgents: agents,
      config: args.config,
      dryRun: false,
    });
    const gitignore = yield* removeInstructionsGitignore({
      workspaceRoot: args.ws.baseDir,
      dryRun: false,
    });
    yield* args.ws.setInstructionsConfig(false);
    return {
      removed,
      gitignore: Option.getOrUndefined(gitignore),
    };
  },
);
