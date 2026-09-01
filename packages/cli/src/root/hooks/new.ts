import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Option from "effect/Option";
import * as Effect from "effect/Effect";
import { Argument, Command, Flag } from "effect/unstable/cli";
import { makeAppError } from "@agentxm/extension-management/unstable/app-error";
import {
  failureToStepFailure,
  toAppError,
} from "@agentxm/extension-management/unstable/app-error/conversions";
import { buildNewExtensionStep } from "@agentxm/extension-workspace";
import { computeSourceHash, WorkspaceMutations } from "@agentxm/workspace-state";
import { type WorkspaceHookRef } from "@agentxm/extension-model/unstable/extensions/refs/hook";
import { DEFAULT_WORKSPACE_SCOPE } from "@agentxm/extension-model/unstable/workspace-scope";
import {
  decodeExtensionNameSync,
  type ExtensionName,
} from "@agentxm/extension-model/unstable/extensions";
import type {
  HookEvent,
  HookRuntime,
} from "@agentxm/extension-model/unstable/hooks/manifest-schema";
import { newHook, preflightCreateOnly, type NewHookOperation } from "@agentxm/extension-authoring";
import { provideAuthoringFailureAdapter } from "../../feature-errors.js";
import { HOOK_MANIFEST_FILENAME } from "@agentxm/extension-model/unstable/hooks/manifest-schema";
import { previewFlag, yesFlag } from "@agentxm/extension-management/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/extension-management/unstable/cli-runtime";
import type { HookLockEntry } from "@agentxm/workspace-state";
import type {
  JobStepArtifact,
  JobStepArtifactTarget,
  JobStepResult,
  Plan,
  PlannedJobStep,
} from "@agentxm/workspace-operations";
import { operationPresentation } from "@agentxm/workspace-operations";
import { emitOperationResolution } from "../../operation-output.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { joinDisplayPath } from "../shared/display-path.js";
import { previewOrApplyLocalPlan } from "../shared/local-plan.js";
import { withOperationLifecycle } from "../shared/operation-lifecycle.js";
import { resolveOwnerForNewContent } from "../shared/resolve-owner.js";
import { requireAuthoredOwner } from "../shared/authored-owner.js";
import {
  isValidScaffoldName,
  normalizeScaffoldOwner,
  scaffoldNameValidationSuggestion,
} from "../shared/scaffold-name.js";
import { decodeVersionSync } from "@agentxm/extension-model/unstable/version-constraints";
import { workspaceAuthoredRoot, workspaceSettingsPath } from "../shared/workspace-display-paths.js";
import { HookManager } from "@agentxm/extension-workspace";

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
  entry.type === "registry" ? entry.resolvedVersion : undefined;

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
  readonly preview: boolean;
}

const toJobStepResult = (result: {
  readonly result: string;
  readonly message: string;
  readonly error?: import("@agentxm/workspace-operations").StepFailure;
}): JobStepResult =>
  result.result === "error" && result.error != null
    ? { result: "error", message: result.message, error: result.error }
    : { result: "success", message: result.message };

export const handleHooksNew = (args: HooksNewHandlerArgs) =>
  withOperationLifecycle(
    {
      command: "hooks.new",
      mode: args.preview ? "preview" : "apply",
      planName: "New hook",
    },
    handleHooksNewBody(args),
  );

const handleHooksNewBody = Effect.fn("HooksNew.handle")(function* (args: HooksNewHandlerArgs) {
  // 1. Resolve owner
  const owner = Option.isSome(args.owner)
    ? normalizeScaffoldOwner(args.owner.value)
    : yield* resolveOwnerForNewContent("hook creation");
  yield* requireAuthoredOwner(owner);

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

  const configuredHooks = yield* ws.getConfiguredHookEntries().pipe(Effect.mapError(toAppError));

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
    },
  } satisfies NewHookOperation;

  // 6. Build plan with inline run closure
  const fqn = `${owner}/hooks/${args.name}`;
  const targetDir = path.join(workspaceAuthoredRoot(path, ws, "hook", owner), args.name);
  const authoredPath = path.relative(ws.baseDir, targetDir);
  yield* preflightCreateOnly({
    subject: "Hook",
    name: args.name,
    configured: Object.hasOwn(configuredHooks, args.name),
    destinations: [targetDir],
  });
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
  const entrypoint = entrypointFilename(args.runtime);
  const plannedArtifact: JobStepArtifact = {
    path: path.relative(ws.baseDir, targetDir),
    scope: ws.scope,
    version: ref.version,
    change: "created",
    fileCount: 2,
    targets: [
      {
        path: path.relative(ws.baseDir, path.join(targetDir, HOOK_MANIFEST_FILENAME)),
        change: "created",
      },
      {
        path: path.relative(ws.baseDir, path.join(targetDir, "src", entrypoint)),
        change: "created",
      },
      { path: workspaceSettingsPath(ws.scope), change: "created" },
    ],
  };

  const step: PlannedJobStep = buildNewExtensionStep(manager, {
    toStepFailure: failureToStepFailure,
    ref,
    target: { type: "hook", name: args.name },
    versionRange: Option.none(),
    label: fqn,
    message: `Created hook ${fqn}`,
    plannedArtifact,
    preflight: Effect.gen(function* () {
      const current = yield* ws.getConfiguredHookEntries().pipe(Effect.mapError(toAppError));
      yield* preflightCreateOnly({
        subject: "Hook",
        name: args.name,
        configured: Object.hasOwn(current, args.name),
        destinations: [targetDir],
      }).pipe(Effect.provideService(FileSystem.FileSystem, fs));
    }),
    buildArtifact: () =>
      Effect.gen(function* () {
        const currentLockEntry = yield* ws
          .getLockedHookEntry(args.name)
          .pipe(Effect.mapError(toAppError))
          .pipe(Effect.catch(() => Effect.succeed(Option.none())));
        const materialization =
          manager.getLastMaterialization === undefined
            ? { agents: [], targets: [] }
            : yield* manager.getLastMaterialization({
                target: { type: "hook", name: args.name },
              });
        if (Option.isNone(currentLockEntry)) {
          const targets = materialization.targets.map((target) => ({
            ...target,
            change: "created" as const,
          }));
          return {
            path: path.relative(ws.baseDir, targetDir),
            scope: ws.scope,
            version: ref.version,
            change: "created",
            ...(targets.length === 0 ? {} : { fileCount: targets.length, targets }),
          } satisfies JobStepArtifact;
        }

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
    markAuthored: ws
      .setHookEntry(args.name, {
        source: "workspace",
        enabled: true,
      })
      .pipe(Effect.mapError(toAppError)),
    scaffold: newHook(op).pipe(
      provideAuthoringFailureAdapter,
      Effect.map(toJobStepResult),
      Effect.mapError(toAppError),
      Effect.provideService(FileSystem.FileSystem, fs),
      Effect.provideService(Path.Path, path),
      Effect.provideService(WorkspaceMutations, ws),
    ),
  });

  const plan: Plan = {
    _tag: "Plan",
    name: "New hook",
    description: Option.some(`Create ${fqn}`),
    presentation: operationPresentation(
      { imperative: "create", past: "Created", gerund: "Creating" },
      "hook",
    ),
    jobs: [{ concurrency: 1 as const, steps: [step] }],
  };

  const resolution = yield* previewOrApplyLocalPlan(plan, {
    preview: args.preview,
    yes: args.yes,
  });

  const suggestions = [
    {
      description: `Edit \`${joinDisplayPath(path, authoredPath, "src", entrypoint)}\` to implement the hook`,
    },
  ];
  yield* emitOperationResolution("hooks.new", resolution, { suggestions });
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
  preview: previewFlag.pipe(
    Flag.withDescription("Show what files would be created without creating them"),
  ),
} as const;

export const newCommand = Command.make(
  "new",
  newConfig,
  ({ name, owner, runtime, event, matcher, yes, preview }) =>
    handleHooksNew({
      name: decodeExtensionNameSync(name),
      owner,
      runtime,
      event,
      matcher,
      yes,
      preview,
    }).pipe(withWorkspace(DEFAULT_WORKSPACE_SCOPE), withRuntime("hooks new")),
).pipe(
  withArgvTracking(newConfig),
  Command.withDescription("Create a new hook in the project-workspace authoring root"),
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
