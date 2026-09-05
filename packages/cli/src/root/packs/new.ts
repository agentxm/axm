import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Argument, Command, Flag } from "effect/unstable/cli";
import { buildNewExtensionStep } from "@agentxm/extension-workspace";
import {
  computeSourceHash,
  computePackPathsForLayout,
  WorkspaceMutations,
} from "@agentxm/workspace-state";
import { type WorkspacePackRef } from "@agentxm/extension-model/unstable/extensions/refs/pack";
import { DEFAULT_WORKSPACE_SCOPE } from "@agentxm/extension-model/unstable/workspace-scope";
import {
  decodeExtensionNameSync,
  formatFqn,
  normalizeHandle,
  type ExtensionName,
  type Handle,
} from "@agentxm/extension-model/unstable/extensions";
import { PACK_MANIFEST_FILENAME } from "@agentxm/extension-model/unstable/packs/manifest-schema";
import { newPack, preflightCreateOnly, type NewPackOperation } from "@agentxm/extension-authoring";
import { provideAuthoringFailureAdapter } from "../../feature-errors.js";
import { operationPresentation, type Plan } from "@agentxm/workspace-operations";
import { withArgvTracking } from "../../cli-runtime/index.js";
import { emitOperationResolution } from "../../operation-output.js";
import { withOperationLifecycle } from "../shared/operation-lifecycle.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import {
  previewCapabilityFlag,
  previewableCapabilities,
  withCommandCapabilities,
} from "../shared/command-capabilities.js";
import { joinDisplayPath } from "../shared/display-path.js";
import { previewOrApplyLocalPlan } from "../shared/local-plan.js";
import { resolveOwnerForNewContent } from "../shared/resolve-owner.js";
import { requireAuthoredOwner } from "../shared/authored-owner.js";
import { decodeVersionSync } from "@agentxm/extension-model/unstable/version-constraints";
import { workspaceSettingsPath } from "../shared/workspace-display-paths.js";
import { failureToStepFailure, toAppError } from "../../app-error/conversions.js";
import { PackManager } from "@agentxm/extension-workspace";

export interface PacksNewHandlerArgs {
  readonly name: ExtensionName;
  readonly owner: Option.Option<Handle>;
  readonly preview: boolean;
}

export const handlePacksNew = (args: PacksNewHandlerArgs) =>
  withOperationLifecycle(
    {
      command: "packs.new",
      mode: args.preview ? "preview" : "apply",
      planName: "New pack",
    },
    handlePacksNewBody(args),
  );

const handlePacksNewBody = Effect.fn("PacksNew.handle")(function* (args: PacksNewHandlerArgs) {
  const ws = yield* WorkspaceMutations;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const manager = yield* PackManager;

  // Resolve owner
  const owner = Option.isSome(args.owner)
    ? args.owner.value
    : yield* resolveOwnerForNewContent("pack creation");
  yield* requireAuthoredOwner(owner);

  const fqn = formatFqn({ owner, type: "pack", name: args.name });
  const base = ws.baseDir;

  // Check if pack already exists
  const packDir = computePackPathsForLayout(path.join, ws.layout, "workspace", owner, args.name);
  const authoredPath = path.relative(base, packDir.canonicalPath);
  const configuredPacks = yield* ws.getConfiguredPackEntries().pipe(Effect.mapError(toAppError));
  yield* preflightCreateOnly({
    subject: "Pack",
    name: args.name,
    configured: Object.hasOwn(configuredPacks, args.name),
    destinations: [packDir.canonicalPath],
  });

  // Build operation
  const op = {
    name: "new-pack",
    args: { name: args.name, owner },
  } satisfies NewPackOperation;
  const version = decodeVersionSync("0.0.1");
  const ref: WorkspacePackRef = {
    type: "pack",
    refType: "workspace",
    source: { type: "workspace", owner, extensionType: "pack", name: args.name },
    scope: ws.scope,
    owner,
    name: args.name,
    version,
    sourceHash: computeSourceHash("scaffold"),
    location: packDir.canonicalPath,
    pack: { name: args.name, dependencies: {} },
  };
  const artifact = {
    path: authoredPath,
    scope: ws.scope,
    change: "created" as const,
    version: "0.0.1",
    fileCount: 1,
    targets: [
      {
        path: path.join(authoredPath, PACK_MANIFEST_FILENAME),
        change: "created" as const,
      },
      { path: workspaceSettingsPath(ws.scope), change: "created" as const },
    ],
  };

  const step = buildNewExtensionStep(manager, {
    toStepFailure: failureToStepFailure,
    ref,
    target: { type: "pack", owner, name: args.name },
    versionRange: Option.none(),
    label: fqn,
    message: `Created pack ${fqn}`,
    preflight: Effect.gen(function* () {
      const current = yield* ws.getConfiguredPackEntries().pipe(Effect.mapError(toAppError));
      yield* preflightCreateOnly({
        subject: "Pack",
        name: args.name,
        configured: Object.hasOwn(current, args.name),
        destinations: [packDir.canonicalPath],
      }).pipe(Effect.provideService(FileSystem.FileSystem, fs));
    }),
    markAuthored: ws
      .setPackEntry(args.name, { source: "workspace", enabled: true })
      .pipe(Effect.mapError(toAppError)),
    plannedArtifact: artifact,
    buildArtifact: () => Effect.succeed(artifact),
    scaffold: newPack(op).pipe(
      provideAuthoringFailureAdapter,
      Effect.mapError(toAppError),
      Effect.provideService(WorkspaceMutations, ws),
      Effect.provideService(FileSystem.FileSystem, fs),
      Effect.provideService(Path.Path, path),
    ),
  });

  const plan: Plan = {
    _tag: "Plan",
    name: "New pack",
    description: Option.some(`Create ${fqn}`),
    presentation: operationPresentation(
      { imperative: "create", past: "Created", gerund: "Creating" },
      "pack",
    ),
    jobs: [{ concurrency: 1 as const, steps: [step] }],
  };

  const resolution = yield* previewOrApplyLocalPlan(plan, { preview: args.preview });

  yield* emitOperationResolution("packs.new", resolution, {
    suggestions: [
      {
        description: `Edit \`${joinDisplayPath(path, authoredPath, PACK_MANIFEST_FILENAME)}\` to fill in pack contents`,
      },
    ],
  });
});

const newConfig = {
  name: Argument.string("name").pipe(Argument.withDescription("Name of the pack (without owner)")),
  owner: Flag.string("owner").pipe(
    Flag.withDescription("Override the workspace owner (e.g., @acme)"),
    Flag.optional,
  ),
  preview: previewCapabilityFlag("Show what files would be created without creating them"),
} as const;

export const newCommand = Command.make("new", newConfig, ({ name, owner, preview }) =>
  handlePacksNew({
    name: decodeExtensionNameSync(name),
    owner: Option.map(owner, (s) => normalizeHandle(s.startsWith("@") ? s : `@${s}`)),
    preview,
  }).pipe(withWorkspace(DEFAULT_WORKSPACE_SCOPE), withRuntime("packs new")),
).pipe(
  withArgvTracking(newConfig),
  withCommandCapabilities(previewableCapabilities("authored-source")),
  Command.withDescription("Create a new empty pack in the project-workspace authoring root"),
  Command.withExamples([
    {
      command: "axm packs new frontend-tools",
      description: "Create an empty pack to bundle extensions",
    },
    {
      command: "axm packs new frontend-tools --owner @co",
      description: "Create under a specific owner",
    },
  ]),
);
