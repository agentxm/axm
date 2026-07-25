import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Option from "effect/Option";
import * as Effect from "effect/Effect";
import { Argument, Command, Flag } from "effect/unstable/cli";
import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import { count } from "@agentxm/client-core/unstable/cli-renderer";
import {
  buildNewExtensionStep,
  computeSourceHash,
  decodeExtensionNameSync,
  REGISTRY_EXTENSIONS_DIR,
  type ExtensionName,
} from "@agentxm/client-core/unstable/extensions";
import type {
  HookEvent,
  HookRuntime,
  NewHookOperation,
  WorkspaceHookRef,
} from "@agentxm/client-core/unstable/hooks";
import { HOOK_EXTENSION_DIR, HookManager, newHook } from "@agentxm/client-core/unstable/hooks";
import { forceFlag, previewFlag, yesFlag } from "@agentxm/client-core/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import {
  DEFAULT_WORKSPACE_SCOPE,
  WorkspaceMutations,
} from "@agentxm/client-core/unstable/workspace";
import type { HookLockEntry } from "@agentxm/client-core/unstable/lockfile";
import type {
  JobStepArtifact,
  JobStepArtifactTarget,
  JobStepResult,
  Plan,
  PlanResolution,
  PlannedJobStep,
} from "@agentxm/client-core/unstable/plan";
import { emitPlanResolutionResult } from "../../json-output.js";
import { withAuthRuntime, withWorkspace } from "../../runtime.js";
import { joinDisplayPath } from "../shared/display-path.js";
import { previewOrApplyLocalPlan } from "../shared/local-plan.js";
import { resolveOwnerForNewContent } from "../shared/resolve-owner.js";
import {
  isValidScaffoldName,
  normalizeScaffoldOwner,
  scaffoldNameValidationSuggestion,
} from "../shared/scaffold-name.js";
import { emitScaffoldSuccess } from "../shared/scaffold-success.js";
import { decodeVersionSync } from "@agentxm/client-core/unstable/version-constraints";

const HOOK_RUNTIMES = ["bash", "node", "python"] as const satisfies readonly HookRuntime[];
const HOOK_EVENTS = [
  "tool.pre",
  "tool.post",
  "prompt.submit",
  "session.start",
  "turn.end",
  "subagent.stop",
  "compaction.pre",
] as const satisfies readonly HookEvent[];

const hookLockEntryVersion = (entry: HookLockEntry): string | undefined =>
  entry.type === "registry"
    ? entry.resolvedVersion
    : entry.type === "workspace"
      ? entry.version
      : undefined;

const hookNewArtifact = (args: {
  readonly lockEntry: HookLockEntry;
  readonly targets: ReadonlyArray<JobStepArtifactTarget>;
  readonly canonicalPath: string;
  readonly workspaceRoot: string;
  readonly scope: JobStepArtifact["scope"];
  readonly pathService: Path.Path;
}): JobStepArtifact => {
  const version = hookLockEntryVersion(args.lockEntry);

  return {
    path: args.pathService.relative(args.workspaceRoot, args.canonicalPath),
    scope: args.scope,
    ...(version === undefined ? {} : { version }),
    change: "created",
    ...(args.targets.length === 0 ? {} : { fileCount: args.targets.length, targets: args.targets }),
  };
};

const hookNewArtifactOutput = (
  resolution: PlanResolution,
): { readonly targetPhrase: string; readonly summary: string } | undefined => {
  if (resolution._tag !== "ExecutedPlan") return undefined;

  for (const job of resolution.jobs) {
    for (const step of job.steps) {
      if (step.result.result !== "success" || step.result.artifact === undefined) continue;

      const artifact = step.result.artifact;
      const targetPhrase =
        artifact.targets !== undefined && artifact.targets.length > 0
          ? ` with ${count(artifact.targets.length, "target")}`
          : "";
      const targetSummary =
        artifact.targets !== undefined && artifact.targets.length > 0
          ? `-> ${count(artifact.targets.length, "target")}`
          : `-> ${artifact.path}`;
      const details = [
        artifact.version,
        artifact.fileCount === undefined ? undefined : count(artifact.fileCount, "file"),
      ].filter((part): part is string => part !== undefined && part.length > 0);

      return {
        targetPhrase,
        summary: details.length === 0 ? targetSummary : `${targetSummary}   ${details.join(" | ")}`,
      };
    }
  }

  return undefined;
};

const entrypointFilename = (runtime: HookRuntime): string => {
  switch (runtime) {
    case "bash":
      return "hook.sh";
    case "node":
      return "hook.js";
    case "python":
      return "hook.py";
  }
};

export interface HooksNewHandlerArgs {
  readonly name: ExtensionName;
  readonly owner: Option.Option<string>;
  readonly runtime: HookRuntime;
  readonly event: HookEvent;
  readonly matcher: Option.Option<string>;
  readonly yes: boolean;
  readonly force: boolean;
  readonly preview: boolean;
}

const toJobStepResult = (result: {
  readonly result: string;
  readonly message: string;
  readonly error?: import("@agentxm/client-core/unstable/app-error").AppError;
}): JobStepResult =>
  result.result === "error" && result.error != null
    ? { result: "error", message: result.message, error: result.error }
    : { result: "success", message: result.message };

export const handleHooksNew = Effect.fn("HooksNew.handle")(function* (args: HooksNewHandlerArgs) {
  // 1. Resolve owner
  const owner = Option.isSome(args.owner)
    ? normalizeScaffoldOwner(args.owner.value)
    : yield* resolveOwnerForNewContent("hook creation");

  // 2. Validate name
  if (!isValidScaffoldName(args.name)) {
    return yield* makeAppError({
      code: "validation",
      detail: `Invalid hook name: "${args.name}"`,
      suggestions: [{ description: scaffoldNameValidationSuggestion }],
    });
  }

  // 3. Check the hook isn't already configured
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const ws = yield* WorkspaceMutations;
  const manager = yield* HookManager;

  const configuredHooks = yield* ws.getConfiguredHookEntries();
  if (!args.force && args.name in configuredHooks) {
    return yield* makeAppError({
      code: "conflict",
      detail: `Hook '${args.name}' already exists in settings`,
      suggestions: [{ description: "Choose a different name or remove the existing hook first" }],
    });
  }

  // 4. Apply matcher default for tool-scoped events
  const matcher = Option.isSome(args.matcher)
    ? args.matcher.value
    : args.event === "tool.pre" || args.event === "tool.post"
      ? "Write|Edit"
      : undefined;

  // 5. Build operation
  const op = {
    name: "new-hook",
    args: {
      name: args.name,
      owner,
      runtime: args.runtime,
      event: args.event,
      matcher,
      force: args.force,
    },
  } satisfies NewHookOperation;

  // 6. Build plan with inline run closure
  const fqn = `${owner}/hooks/${args.name}`;
  const targetDir = path.join(
    ws.baseDir,
    REGISTRY_EXTENSIONS_DIR,
    owner,
    HOOK_EXTENSION_DIR,
    args.name,
  );
  const ref: WorkspaceHookRef = {
    type: "hook",
    refType: "workspace",
    source: { type: "workspace", owner, extensionType: "hook", name: args.name },
    scope: ws.scope,
    owner,
    name: args.name,
    version: decodeVersionSync("0.1.0"),
    sourceHash: computeSourceHash("scaffold"),
    location: targetDir,
    hook: { name: args.name },
  };

  const step: PlannedJobStep = buildNewExtensionStep(manager, {
    ref,
    versionRange: Option.none(),
    label: fqn,
    message: `Created hook ${fqn}`,
    buildArtifact: () =>
      Effect.gen(function* () {
        const currentLockEntry = yield* ws.getLockedHookEntry(args.name);
        if (Option.isNone(currentLockEntry)) {
          return yield* makeAppError({
            code: "internal",
            detail: `Created hooks package ${fqn} but could not read its lockfile entry`,
            suggestions: [{ description: "Inspect .axm/axm-lock.yaml." }],
          });
        }
        const materialization =
          manager.getLastMaterialization === undefined
            ? { agents: [], targets: [] }
            : yield* manager.getLastMaterialization({
                target: { type: "hook", name: args.name },
              });

        return hookNewArtifact({
          lockEntry: currentLockEntry.value,
          targets: materialization.targets.map((target) => ({
            ...target,
            change: "created",
          })),
          canonicalPath: targetDir,
          workspaceRoot: ws.baseDir,
          scope: ws.scope,
          pathService: path,
        });
      }),
    markAuthored: ws.setHookEntry(args.name, {
      source: `workspace:${fqn}`,
      enabled: true,
    }),
    scaffold: newHook(op).pipe(
      Effect.map(toJobStepResult),
      Effect.provideService(FileSystem.FileSystem, fs),
      Effect.provideService(Path.Path, path),
      Effect.provideService(WorkspaceMutations, ws),
    ),
  });

  const plan: Plan = {
    _tag: "Plan",
    name: "New hook",
    description: Option.some(`Create ${fqn}`),
    jobs: [{ concurrency: 1 as const, steps: [step] }],
  };

  const resolution = yield* previewOrApplyLocalPlan(plan, {
    preview: args.preview,
    displayApplied: false,
  });

  const entrypoint = entrypointFilename(args.runtime);
  const suggestions = [
    {
      description: `Edit \`${joinDisplayPath(path, ".axm", "extensions", owner, "hooks", args.name, "src", entrypoint)}\` to implement the hook`,
    },
  ];
  const artifactOutput = hookNewArtifactOutput(resolution);

  const emitted = yield* emitPlanResolutionResult(
    "hooks.new",
    resolution,
    resolution._tag === "ExecutedPlan"
      ? {
          summary: `Created hooks package ${fqn}${artifactOutput?.targetPhrase ?? ""}`,
          suggestions,
        }
      : undefined,
  );

  if (resolution._tag === "ExecutedPlan") {
    yield* emitScaffoldSuccess({
      message: `Created hooks package ${fqn}${artifactOutput?.targetPhrase ?? ""}`,
      ...(artifactOutput === undefined ? {} : { summary: artifactOutput.summary }),
      suggestions,
      withoutSuggestions: emitted,
    });
  }
});

const newConfig = {
  name: Argument.string("name").pipe(Argument.withDescription("Name of the hook (without owner)")),
  owner: Flag.string("owner").pipe(
    Flag.withDescription("Override the workspace owner (e.g., @acme)"),
    Flag.optional,
  ),
  runtime: Flag.choice("runtime", HOOK_RUNTIMES).pipe(
    Flag.withDescription("Interpreter family for the entrypoint"),
    Flag.withDefault("bash" as const),
  ),
  event: Flag.choice("event", HOOK_EVENTS).pipe(
    Flag.withDescription("Canonical hook event to bind to"),
    Flag.withDefault("tool.pre" as const),
  ),
  matcher: Flag.string("matcher").pipe(
    Flag.withDescription("Raw native matcher for tool.pre/tool.post (e.g., Write|Edit)"),
    Flag.optional,
  ),
  yes: yesFlag.pipe(Flag.withDescription("Create the hook without confirmation")),
  force: forceFlag.pipe(Flag.withDescription("Overwrite if a hook with this name already exists")),
  preview: previewFlag.pipe(
    Flag.withDescription("Show what files would be created without creating them"),
  ),
} as const;

export const newCommand = Command.make(
  "new",
  newConfig,
  ({ name, owner, runtime, event, matcher, yes, force, preview }) =>
    handleHooksNew({
      name: decodeExtensionNameSync(name),
      owner,
      runtime,
      event,
      matcher,
      yes,
      force,
      preview,
    }).pipe(withWorkspace(DEFAULT_WORKSPACE_SCOPE), withAuthRuntime("hooks new")),
).pipe(
  withArgvTracking(newConfig),
  Command.withDescription("Create a new hook"),
  Command.withExamples([
    { command: "axm hooks new tool-audit", description: "Scaffold a new hook" },
    {
      command: "axm hooks new tool-audit --event tool.post --matcher Bash",
      description: "Bind to a specific event and tool matcher",
    },
    {
      command: "axm hooks new tool-audit --owner @acme --runtime python",
      description: "Create under a specific owner with a Python entrypoint",
    },
  ]),
);
