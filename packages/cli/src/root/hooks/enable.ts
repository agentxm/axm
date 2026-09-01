import { Argument, Command, Flag } from "effect/unstable/cli";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { previewFlag, yesFlag } from "@agentxm/extension-management/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/extension-management/unstable/cli-runtime";
import { buildInstallOperation } from "@agentxm/extension-management/unstable/extensions";
import {
  acquiredExtensionDisplayPathFromLockEntry,
  WorkspaceMutations,
} from "@agentxm/workspace-state";
import {
  makeConfiguredReleaseAgeEvaluation,
  resolveConfiguredHook,
} from "@agentxm/extension-management/unstable/extension-lifecycle";
import type { HookLockEntry } from "@agentxm/workspace-state";
import {
  previewOrApplyPlan,
  operationPresentation,
  type JobStepArtifact,
  type JobStepArtifactTarget,
  type Plan,
} from "@agentxm/workspace-operations";
import { scopeFlag } from "../../cli-flags.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
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

export const handleEnableHook = (args: {
  readonly name: string;
  readonly yes: boolean;
  readonly preview: boolean;
}) =>
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
  readonly yes: boolean;
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

  const releaseAgeEvaluation = yield* makeConfiguredReleaseAgeEvaluation("enforce");
  const resolved = yield* resolveConfiguredHook(args.name, entry.source, releaseAgeEvaluation);
  const { ref, versionRange } = resolved;
  const agentOutcomes =
    hookManager.configuredAgentOutcomesForRef === undefined
      ? []
      : yield* hookManager.configuredAgentOutcomesForRef(ref, "projected");
  const installStep = buildInstallOperation(hookManager, {
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
  yes: yesFlag.pipe(Flag.withDescription("Enable without confirmation")),
  preview: previewFlag.pipe(Flag.withDescription("Show what would change without enabling")),
} as const;

export const enableCommand = Command.make("enable", enableConfig, ({ name, scope, yes, preview }) =>
  handleEnableHook({ name, yes, preview }).pipe(withWorkspace(scope), withRuntime("hooks enable")),
).pipe(
  withArgvTracking(enableConfig),
  Command.withDescription("Enable a hooks package"),
  Command.withExamples([
    {
      command: "axm hooks enable workspace-baseline",
      description: "Enable a configured hooks package",
    },
  ]),
);
