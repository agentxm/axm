import { pathToFileURL } from "node:url";
import { Argument, Command, Flag } from "effect/unstable/cli";
import * as FileSystem from "effect/FileSystem";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { forceFlag, previewFlag, yesFlag } from "@agentxm/client-core/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import {
  buildInstallOperation,
  EXTERNAL_EXTENSIONS_DIR,
  REGISTRY_EXTENSIONS_DIR,
} from "@agentxm/client-core/unstable/extensions";
import {
  HOOK_EXTENSION_DIR,
  HookManager,
  type LocalHookRef,
} from "@agentxm/client-core/unstable/hooks";
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
  entry.type === "registry" ? entry.resolvedVersion : undefined;

const hookPackagePath = (entry: HookLockEntry, name: string): string =>
  entry.type === "registry"
    ? `${REGISTRY_EXTENSIONS_DIR}/${entry.owner}/${HOOK_EXTENSION_DIR}/${entry.name}`
    : `${EXTERNAL_EXTENSIONS_DIR}/${HOOK_EXTENSION_DIR}/${name}`;

const hookEnableArtifactTargets = (args: {
  readonly entry: HookLockEntry;
  readonly name: string;
  readonly backupExists: boolean;
}): ReadonlyArray<JobStepArtifactTarget> =>
  [
    { path: ".axm/settings.json", change: "updated" as const },
    { path: ".axm/axm-lock.yaml", change: "updated" as const },
    { path: hookPackagePath(args.entry, args.name), change: "created" as const },
    ...[...(args.entry.materializedTargets ?? [])].map((target) => ({
      path: target.target,
      change: "updated" as const,
    })),
    {
      path: ".claude/settings.json.bak",
      change: args.backupExists ? ("updated" as const) : ("created" as const),
    },
  ].sort((left, right) => left.path.localeCompare(right.path));

const hookEnableArtifact = (args: {
  readonly lockEntry: HookLockEntry;
  readonly name: string;
  readonly backupExists: boolean;
  readonly scope: JobStepArtifact["scope"];
}): JobStepArtifact => {
  const targets = hookEnableArtifactTargets({
    entry: args.lockEntry,
    name: args.name,
    backupExists: args.backupExists,
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

const resolveAuthoredLocalHook = (name: string, authored: boolean) =>
  Effect.gen(function* () {
    if (!authored) return Option.none<LocalHookRef>();

    const ws = yield* WorkspaceMutations;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const lockEntry = yield* ws.getLockedHookEntry(name);
    if (Option.isNone(lockEntry) || lockEntry.value.type !== "registry") {
      return Option.none<LocalHookRef>();
    }

    const packageRoot = path.join(
      ws.baseDir,
      REGISTRY_EXTENSIONS_DIR,
      lockEntry.value.owner,
      HOOK_EXTENSION_DIR,
      lockEntry.value.name,
    );
    const exists = yield* fs.exists(packageRoot).pipe(Effect.orElseSucceed(() => false));
    if (!exists) return Option.none<LocalHookRef>();

    return Option.some({
      type: "hook",
      refType: "local",
      source: { type: "local", path: packageRoot },
      location: pathToFileURL(packageRoot).href,
      hook: { name: lockEntry.value.name },
    } satisfies LocalHookRef);
  });

export const handleEnableHook = Effect.fn("EnableHook.handle")(function* (args: {
  readonly name: string;
  readonly yes: boolean;
  readonly force: boolean;
  readonly preview: boolean;
}) {
  const ws = yield* WorkspaceMutations;
  const hookManager = yield* HookManager;
  const fs = yield* FileSystem.FileSystem;
  const scope = ws.scope;
  const backupExists = yield* fs
    .exists(".claude/settings.json.bak")
    .pipe(Effect.catch(() => Effect.succeed(false)));
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

  const authoredLocalRef = yield* resolveAuthoredLocalHook(args.name, entry.authored);
  const resolved = Option.isSome(authoredLocalRef)
    ? { ref: authoredLocalRef.value, versionRange: Option.none() }
    : yield* resolveConfiguredHook(args.name, entry.source);
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
                  backupExists,
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
