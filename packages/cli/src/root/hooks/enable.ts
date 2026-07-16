import { Argument, Command, Flag } from "effect/unstable/cli";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { forceFlag, previewFlag, yesFlag } from "@agentxm/client-core/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import {
  buildInstallOperation,
  EXTERNAL_EXTENSIONS_DIR,
  REGISTRY_EXTENSIONS_DIR,
} from "@agentxm/client-core/unstable/extensions";
import { HOOK_EXTENSION_DIR, HookManager } from "@agentxm/client-core/unstable/hooks";
import type { HookLockEntry } from "@agentxm/client-core/unstable/lockfile";
import {
  previewOrApplyPlan,
  type JobStepArtifact,
  type JobStepArtifactTarget,
  type Plan,
} from "@agentxm/client-core/unstable/plan";
import { resolveConfiguredHook, WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import { scopeFlag } from "../../cli-flags.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { emitAppliedPlanOutcome } from "../shared/applied-plan-output.js";
import { emitNoOpOutcome } from "../shared/no-op-output.js";

const hookLockEntryVersion = (entry: HookLockEntry): string | undefined =>
  entry.type === "registry"
    ? entry.resolvedVersion
    : entry.type === "workspace"
      ? entry.version
      : undefined;

const hookPackagePath = (entry: HookLockEntry, name: string): string =>
  entry.type === "registry" || entry.type === "workspace"
    ? `${REGISTRY_EXTENSIONS_DIR}/${entry.owner}/${HOOK_EXTENSION_DIR}/${entry.name}`
    : `${EXTERNAL_EXTENSIONS_DIR}/${HOOK_EXTENSION_DIR}/${name}`;

const hookEnableArtifactTargets = (args: {
  readonly entry: HookLockEntry;
  readonly name: string;
}): ReadonlyArray<JobStepArtifactTarget> =>
  [
    { path: ".axm/settings.json", change: "updated" as const },
    { path: ".axm/axm-lock.yaml", change: "updated" as const },
    { path: hookPackagePath(args.entry, args.name), change: "created" as const },
  ].sort((left, right) => left.path.localeCompare(right.path));

const hookEnableArtifact = (args: {
  readonly lockEntry: HookLockEntry;
  readonly name: string;
  readonly scope: JobStepArtifact["scope"];
}): JobStepArtifact => {
  const targets = hookEnableArtifactTargets({
    entry: args.lockEntry,
    name: args.name,
  });
  const version = hookLockEntryVersion(args.lockEntry);

  return {
    path: ".axm/settings.json",
    scope: args.scope,
    ...(version === undefined ? {} : { version }),
    change: "updated",
    ...(targets.length === 0 ? {} : { targets }),
  };
};

export const handleEnableHook = Effect.fn("EnableHook.handle")(function* (args: {
  readonly name: string;
  readonly yes: boolean;
  readonly force: boolean;
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

  const resolved = yield* resolveConfiguredHook(args.name, entry.source);
  const { ref, versionRange } = resolved;
  const plan: Plan = {
    _tag: "Plan",
    name: "Enable hooks",
    description: Option.some(`Enable hooks package ${args.name}`),
    jobs: [
      {
        concurrency: 1,
        steps: [
          buildInstallOperation(hookManager, {
            ref,
            versionRange,
            message: `Enabled ${args.name}`,
            buildArtifact: () =>
              Effect.gen(function* () {
                const currentLockEntry = yield* ws.getLockedHookEntry(args.name);
                if (Option.isNone(currentLockEntry)) {
                  return {
                    path: ".axm/settings.json",
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
          }),
        ],
      },
    ],
  };
  const resolution = yield* previewOrApplyPlan(plan, { ...args, displayApplied: false });
  yield* emitAppliedPlanOutcome({
    command: "hooks.enable",
    headline: `Enabled hooks package ${args.name}`,
    resolution,
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
  force: forceFlag.pipe(Flag.withDescription("Enable even if there are warnings")),
  preview: previewFlag.pipe(Flag.withDescription("Show what would change without enabling")),
} as const;

export const enableCommand = Command.make(
  "enable",
  enableConfig,
  ({ name, scope, yes, force, preview }) =>
    handleEnableHook({ name, yes, force, preview }).pipe(
      withWorkspace(scope),
      withRuntime("hooks enable"),
    ),
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
