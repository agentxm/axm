import { Argument, Command, Flag } from "effect/unstable/cli";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { previewFlag, yesFlag } from "@agentxm/client-core/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { HOOK_EXTENSION_DIR, HookManager } from "@agentxm/client-core/unstable/hooks";
import type { HookLockEntry } from "@agentxm/client-core/unstable/lockfile";
import {
  operationPresentation,
  previewOrApplyPlan,
  type JobStepArtifact,
  type JobStepArtifactTarget,
  type JobStepResult,
  type Plan,
} from "@agentxm/client-core/unstable/plan";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import { surfaceRestorationIncomplete } from "@agentxm/client-core/unstable/workspace";
import { scopeFlag } from "../../cli-flags.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { emitOperationResolution } from "../../operation-output.js";
import { withOperationLifecycle } from "../shared/operation-lifecycle.js";
import { makePublicPositionalPlanExecution } from "../shared/confirmation-recovery.js";
import { emitNoOpOutcome } from "../shared/no-op-output.js";
import {
  workspaceCanonicalPath,
  workspaceSettingsPath,
} from "../shared/workspace-display-paths.js";

const hookPackagePath = (
  scope: JobStepArtifact["scope"],
  entry: HookLockEntry,
  name: string,
): string =>
  entry.type === "registry"
    ? workspaceCanonicalPath(scope, `${entry.owner}/${HOOK_EXTENSION_DIR}/${entry.name}`)
    : workspaceCanonicalPath(scope, `external/${HOOK_EXTENSION_DIR}/${name}`);

const hookDisableArtifactTargets = (args: {
  readonly lockEntry: HookLockEntry;
  readonly name: string;
  readonly scope: JobStepArtifact["scope"];
}): ReadonlyArray<JobStepArtifactTarget> =>
  [
    { path: workspaceSettingsPath(args.scope), change: "updated" as const },
    {
      path: hookPackagePath(args.scope, args.lockEntry, args.name),
      change: "removed" as const,
    },
  ].sort((left, right) => left.path.localeCompare(right.path));

const hookDisableArtifact = (args: {
  readonly lockEntry: Option.Option<HookLockEntry>;
  readonly name: string;
  readonly scope: JobStepArtifact["scope"];
}): JobStepArtifact => {
  const targets = Option.isSome(args.lockEntry)
    ? hookDisableArtifactTargets({
        lockEntry: args.lockEntry.value,
        name: args.name,
        scope: args.scope,
      })
    : [];

  return {
    path: workspaceSettingsPath(args.scope),
    scope: args.scope,
    change: "updated",
    ...(targets.length === 0 ? {} : { targets }),
  };
};

export const handleDisableHook = (args: {
  readonly name: string;
  readonly yes: boolean;
  readonly preview: boolean;
}) =>
  withOperationLifecycle(
    {
      command: "hooks.disable",
      mode: args.preview ? "preview" : "apply",
      planName: "Disable hooks",
    },
    handleDisableHookBody(args),
  );

const handleDisableHookBody = Effect.fn("DisableHook.handle")(function* (args: {
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
    yield* emitNoOpOutcome("hooks.disable", {
      planName: "Disable hooks",
      message: `hooks package "${args.name}" is not configured`,
    });
    return;
  }
  if (!entry.enabled) {
    yield* emitNoOpOutcome("hooks.disable", {
      planName: "Disable hooks",
      message: `hooks package "${args.name}" is already disabled`,
    });
    return;
  }

  const plan: Plan = {
    _tag: "Plan",
    name: "Disable hooks",
    description: Option.some(`Disable hooks package ${args.name}`),
    presentation: operationPresentation(
      { imperative: "disable", past: "Disabled", gerund: "Disabling" },
      "hook",
    ),
    jobs: [
      {
        concurrency: 1,
        steps: [
          {
            readiness: "ready",
            label: args.name,
            run: Effect.gen(function* () {
              const lockEntry = yield* ws
                .getLockedHookEntry(args.name)
                .pipe(Effect.catch(() => Effect.succeed(Option.none())));
              yield* hookManager
                .runTransaction({
                  transition: Effect.gen(function* () {
                    yield* ws.updateHookEntry(args.name, (current) => ({
                      ...current,
                      enabled: false,
                    }));
                    yield* hookManager.materializeDeactivate({
                      target: { type: "hook", name: args.name },
                    });
                  }),
                  validate: () => Effect.void,
                })
                .pipe(surfaceRestorationIncomplete);
              return {
                result: "success",
                message: `Disabled ${args.name}`,
                artifact: hookDisableArtifact({ lockEntry, name: args.name, scope }),
              } satisfies JobStepResult;
            }),
          },
        ],
      },
    ],
  };
  const execution = yield* makePublicPositionalPlanExecution(
    args,
    ["hooks", "disable"],
    [args.name],
  );
  const resolution = yield* previewOrApplyPlan(plan, { execution });
  yield* emitOperationResolution("hooks.disable", resolution, {
    suggestions: [
      { description: "Inspect installed hooks packages", cmd: "axm hooks list" },
      { description: "Undo", cmd: `axm hooks enable ${args.name}` },
    ],
  });
});

const disableConfig = {
  name: Argument.string("name").pipe(Argument.withDescription("Name of the hooks package")),
  scope: scopeFlag.pipe(
    Flag.withDescription("Disable in project (default) or user-level configuration"),
  ),
  yes: yesFlag.pipe(Flag.withDescription("Disable without confirmation")),
  preview: previewFlag.pipe(Flag.withDescription("Show what would change without disabling")),
} as const;

export const disableCommand = Command.make(
  "disable",
  disableConfig,
  ({ name, scope, yes, preview }) =>
    handleDisableHook({ name, yes, preview }).pipe(
      withWorkspace(scope),
      withRuntime("hooks disable"),
    ),
).pipe(
  withArgvTracking(disableConfig),
  Command.withDescription("Disable a hooks package without removing sync-once targets"),
  Command.withExamples([
    {
      command: "axm hooks disable workspace-baseline",
      description: "Disable a hooks package",
    },
  ]),
);
