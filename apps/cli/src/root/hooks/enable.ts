import { Argument, Command, Flag } from "effect/unstable/cli";
import { failureToStepFailure } from "../../app-error/conversions.js";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { ignoreReleaseAgeFlag } from "../../cli-flags/index.js";
import { withArgvTracking } from "../../cli-runtime/index.js";
import {
  previewCapabilityFlag,
  previewableCapabilities,
  withCommandCapabilities,
} from "../shared/command-capabilities.js";
import { buildInstallOperation } from "@agentxm/extension-workspace";
import {
  acquiredExtensionDisplayPathFromLockEntry,
  WorkspaceMutations,
} from "@agentxm/workspace-state";
import {
  makeConfiguredReleaseAgeEvaluation,
  resolveConfiguredHook,
} from "@agentxm/extension-lifecycle";
import type { HookLockEntry } from "@agentxm/workspace-state";
import {
  previewOrApplyPlan,
  operationPresentation,
  type JobStepArtifact,
  type JobStepArtifactTarget,
  type Plan,
} from "@agentxm/workspace-operations";
import { scopeFlag } from "../../cli-flags/scope-flag.js";
import { withReleaseAgePosture, withRuntime, withWorkspace } from "../../runtime.js";
import { emitOperationResolution } from "../../operation-output.js";
import { withOperationLifecycle } from "../shared/operation-lifecycle.js";
import { makePublicPositionalPlanExecution } from "../shared/confirmation-recovery.js";
import { emitNoOpOutcome } from "../shared/no-op-output.js";
import {
  workspaceCanonicalRoot,
  workspaceLockfilePath,
  workspaceSettingsPath,
} from "../shared/workspace-display-paths.js";
import { HookManager } from "@agentxm/extension-workspace";
import { lifecycleFailureToAppError } from "../../feature-errors.js";

const hookLockEntryVersion = (entry: HookLockEntry): string | undefined =>
  entry.type === "registry" ? entry.resolvedVersion : undefined;

const hookPackagePath = (
  scope: JobStepArtifact["scope"],
  entry: HookLockEntry,
  name: string,
): string =>
  acquiredExtensionDisplayPathFromLockEntry(workspaceCanonicalRoot(scope), entry, "hooks", name);

const hookEnableArtifactTargets = (args: {
  readonly entry: HookLockEntry;
  readonly name: string;
  readonly scope: JobStepArtifact["scope"];
}): ReadonlyArray<JobStepArtifactTarget> =>
  [
    { path: workspaceSettingsPath(args.scope), change: "updated" as const },
    { path: workspaceLockfilePath(args.scope), change: "updated" as const },
    { path: hookPackagePath(args.scope, args.entry, args.name), change: "created" as const },
  ].sort((left, right) => left.path.localeCompare(right.path));

const hookEnableArtifact = (args: {
  readonly lockEntry: HookLockEntry;
  readonly name: string;
  readonly scope: JobStepArtifact["scope"];
}): JobStepArtifact => {
  const targets = hookEnableArtifactTargets({
    entry: args.lockEntry,
    name: args.name,
    scope: args.scope,
  });
  const version = hookLockEntryVersion(args.lockEntry);

  return {
    path: workspaceSettingsPath(args.scope),
    scope: args.scope,
    ...(version === undefined ? {} : { version }),
    change: "updated",
    ...(targets.length === 0 ? {} : { targets }),
  };
};

export const handleEnableHook = (args: { readonly name: string; readonly preview: boolean }) =>
  withOperationLifecycle(
    {
      command: "hooks.enable",
      mode: args.preview ? "preview" : "apply",
      planName: "Enable hooks",
    },
    handleEnableHookBody(args),
  );

const handleEnableHookBody = Effect.fn("EnableHook.handle")(function* (args: {
  readonly name: string;
  readonly preview: boolean;
}) {
  const ws = yield* WorkspaceMutations;
  const hookManager = yield* HookManager;
  const scope = ws.scope;
  const configured = yield* ws.getConfiguredHookEntries();
  const entry = configured[args.name];
  if (entry === undefined) {
    yield* emitNoOpOutcome("hooks.enable", {
      planName: "Enable hooks",
      message: `hooks package "${args.name}" is not configured`,
    });
    return;
  }
  if (entry.enabled) {
    yield* emitNoOpOutcome("hooks.enable", {
      planName: "Enable hooks",
      message: `hooks package "${args.name}" is already enabled`,
    });
    return;
  }

  const releaseAgeEvaluation = yield* makeConfiguredReleaseAgeEvaluation().pipe(
    Effect.mapError(lifecycleFailureToAppError),
  );
  const resolved = yield* resolveConfiguredHook(args.name, entry.source, releaseAgeEvaluation).pipe(
    Effect.mapError(lifecycleFailureToAppError),
  );
  const { ref, versionRange } = resolved;
  const agentOutcomes =
    hookManager.configuredAgentOutcomesForRef === undefined
      ? []
      : yield* hookManager.configuredAgentOutcomesForRef(ref, "projected");
  const installStep = buildInstallOperation(hookManager, {
    toStepFailure: failureToStepFailure,
    ref,
    versionRange,
    message: `Enabled ${args.name}`,
    buildArtifact: () =>
      Effect.gen(function* () {
        const currentLockEntry = yield* ws
          .getLockedHookEntry(args.name)
          .pipe(Effect.catch(() => Effect.succeed(Option.none())));
        if (Option.isNone(currentLockEntry)) {
          return {
            path: workspaceSettingsPath(scope),
            scope,
            change: "updated",
          } satisfies JobStepArtifact;
        }
        return hookEnableArtifact({
          lockEntry: currentLockEntry.value,
          name: args.name,
          scope,
        });
      }),
  });
  const plan: Plan = {
    _tag: "Plan",
    name: "Enable hooks",
    description: Option.some(`Enable hooks package ${args.name}`),
    presentation: operationPresentation(
      { imperative: "enable", past: "Enabled", gerund: "Enabling" },
      "hook",
    ),
    jobs: [
      {
        concurrency: 1,
        steps: [{ ...installStep, agentOutcomes }],
      },
    ],
  };
  const execution = yield* makePublicPositionalPlanExecution(
    args,
    ["hooks", "enable"],
    [args.name],
  );
  const resolution = yield* previewOrApplyPlan(plan, { execution });
  yield* emitOperationResolution("hooks.enable", resolution, {
    suggestions: [
      { description: "Inspect installed hooks packages", cmd: "axm hooks list" },
      { description: "Undo", cmd: `axm hooks disable ${args.name}` },
    ],
  });
});

const enableConfig = {
  name: Argument.string("name").pipe(Argument.withDescription("Name of the hooks package")),
  scope: scopeFlag.pipe(
    Flag.withDescription("Enable in project (default) or user-level configuration"),
  ),
  preview: previewCapabilityFlag("Show what would change without enabling"),
  ignoreReleaseAge: ignoreReleaseAgeFlag,
} as const;

export const enableCommand = Command.make(
  "enable",
  enableConfig,
  ({ name, scope, preview, ignoreReleaseAge }) =>
    handleEnableHook({ name, preview }).pipe(
      withReleaseAgePosture(ignoreReleaseAge),
      withWorkspace(scope),
      withRuntime("hooks enable"),
    ),
).pipe(
  withArgvTracking(enableConfig),
  withCommandCapabilities(previewableCapabilities("workspace")),
  Command.withDescription("Enable a hooks package"),
  Command.withExamples([
    {
      command: "axm hooks enable workspace-baseline",
      description: "Enable a configured hooks package",
    },
  ]),
);
