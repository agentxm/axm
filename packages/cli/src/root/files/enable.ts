import { Argument, Command, Flag } from "effect/unstable/cli";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { forceFlag, previewFlag, yesFlag } from "@agentxm/client-core/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { buildInstallOperation } from "@agentxm/client-core/unstable/extensions";
import { FilesManager } from "@agentxm/client-core/unstable/files";
import type { FilesLockEntry } from "@agentxm/client-core/unstable/lockfile";
import {
  previewOrApplyPlan,
  type JobStepArtifact,
  type JobStepArtifactTarget,
  type Plan,
} from "@agentxm/client-core/unstable/plan";
import {
  resolveConfiguredFiles,
  WorkspaceMutations,
} from "@agentxm/client-core/unstable/workspace";
import { scopeFlag } from "../../cli-flags.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { emitAppliedPlanOutcome } from "../shared/applied-plan-output.js";
import { emitNoOpOutcome } from "../shared/no-op-output.js";

const filesLockEntryVersion = (entry: FilesLockEntry): string | undefined =>
  entry.type === "registry"
    ? entry.resolvedVersion
    : entry.type === "workspace"
      ? entry.version
      : undefined;

const filesEnableArtifactTargets = (_entry: FilesLockEntry): ReadonlyArray<JobStepArtifactTarget> =>
  mergeTargets([
    { path: ".axm/settings.json", change: "updated" },
    { path: ".axm/axm-lock.yaml", change: "updated" },
  ]);

const mergeTargets = (
  targets: ReadonlyArray<JobStepArtifactTarget>,
): ReadonlyArray<JobStepArtifactTarget> => {
  const order = { removed: 4, updated: 3, created: 2, unchanged: 1 } as const;
  const merged = new Map<string, JobStepArtifactTarget>();
  for (const target of targets) {
    const current = merged.get(target.path);
    if (current === undefined || order[target.change] > order[current.change]) {
      merged.set(target.path, target);
    }
  }
  return [...merged.values()].sort((left, right) => left.path.localeCompare(right.path));
};

const filesEnableArtifact = (args: {
  readonly lockEntry: FilesLockEntry;
  readonly scope: JobStepArtifact["scope"];
}): JobStepArtifact => {
  const targets = filesEnableArtifactTargets(args.lockEntry);
  const version = filesLockEntryVersion(args.lockEntry);

  return {
    path: ".axm/settings.json",
    scope: args.scope,
    ...(version === undefined ? {} : { version }),
    change: "updated",
    ...(targets.length === 0 ? {} : { targets }),
  };
};

export const handleEnableFiles = Effect.fn("EnableFiles.handle")(function* (args: {
  readonly name: string;
  readonly yes: boolean;
  readonly force: boolean;
  readonly preview: boolean;
}) {
  const ws = yield* WorkspaceMutations;
  const filesManager = yield* FilesManager;
  const scope = ws.scope;
  const configured = yield* ws.getConfiguredFilesEntries();
  const entry = configured[args.name];
  if (entry === undefined) {
    yield* emitNoOpOutcome("files.enable", {
      planName: "Enable files",
      message: `files package "${args.name}" is not configured`,
    });
    return;
  }
  if (entry.enabled) {
    yield* emitNoOpOutcome("files.enable", {
      planName: "Enable files",
      message: `files package "${args.name}" is already enabled`,
    });
    return;
  }

  const resolved = yield* resolveConfiguredFiles(args.name, entry.source);
  const { ref, versionRange } = resolved;
  const plan: Plan = {
    _tag: "Plan",
    name: "Enable files",
    description: Option.some(`Enable files package ${args.name}`),
    jobs: [
      {
        concurrency: 1,
        steps: [
          buildInstallOperation(filesManager, {
            ref,
            versionRange,
            message: `Enabled ${args.name}`,
            buildArtifact: () =>
              Effect.gen(function* () {
                const currentLockEntry = yield* ws
                  .getLockedFilesEntry(args.name)
                  .pipe(Effect.catch(() => Effect.succeed(Option.none())));
                if (Option.isNone(currentLockEntry)) {
                  return {
                    path: ".axm/settings.json",
                    scope,
                    change: "updated",
                  } satisfies JobStepArtifact;
                }
                return filesEnableArtifact({
                  lockEntry: currentLockEntry.value,
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
    command: "files.enable",
    headline: `Enabled files package ${args.name}`,
    resolution,
    suggestions: [
      { description: "Inspect installed files packages", cmd: "axm files list" },
      { description: "Undo", cmd: `axm files disable ${args.name}` },
    ],
  });
});

const enableConfig = {
  name: Argument.string("name").pipe(Argument.withDescription("Name of the files package")),
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
    handleEnableFiles({ name, yes, force, preview }).pipe(
      withWorkspace(scope),
      withRuntime("files enable"),
    ),
).pipe(
  withArgvTracking(enableConfig),
  Command.withDescription("Enable a files package"),
  Command.withExamples([
    {
      command: "axm files enable workspace-baseline",
      description: "Enable a configured files package",
    },
  ]),
);
