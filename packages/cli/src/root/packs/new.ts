import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Argument, Command, Flag } from "effect/unstable/cli";
import {
  buildNewExtensionStep,
  computeSourceHash,
  decodeExtensionNameSync,
  formatFqn,
  normalizeHandle,
  preflightCreateOnly,
  type ExtensionName,
  type Handle,
} from "@agentxm/client-core/unstable/extensions";
import { PACK_MANIFEST_FILENAME } from "@agentxm/client-core/unstable/packs";
import type { NewPackOperation, WorkspacePackRef } from "@agentxm/client-core/unstable/packs";
import { newPack, PackManager } from "@agentxm/client-core/unstable/packs";
import { computePackPathsForLayout } from "@agentxm/client-core/unstable/packs";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import { operationPresentation, type Plan } from "@agentxm/client-core/unstable/plan";
import { previewFlag, yesFlag } from "@agentxm/client-core/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { DEFAULT_WORKSPACE_SCOPE } from "@agentxm/client-core/unstable/workspace";
import { emitOperationResolution } from "../../operation-output.js";
import { withOperationLifecycle } from "../shared/operation-lifecycle.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { joinDisplayPath } from "../shared/display-path.js";
import { previewOrApplyLocalPlan } from "../shared/local-plan.js";
import { resolveOwnerForNewContent } from "../shared/resolve-owner.js";
import { requireAuthoredOwner } from "../shared/authored-owner.js";
import { decodeVersionSync } from "@agentxm/client-core/unstable/version-constraints";
import { workspaceSettingsPath } from "../shared/workspace-display-paths.js";

export interface PacksNewHandlerArgs {
  readonly name: ExtensionName;
  readonly owner: Option.Option<Handle>;
  readonly yes: boolean;
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
  const configuredPacks = yield* ws.getConfiguredPackEntries();
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
    ref,
    target: { type: "pack", owner, name: args.name },
    versionRange: Option.none(),
    label: fqn,
    message: `Created pack ${fqn}`,
    preflight: Effect.gen(function* () {
      const current = yield* ws.getConfiguredPackEntries();
      yield* preflightCreateOnly({
        subject: "Pack",
        name: args.name,
        configured: Object.hasOwn(current, args.name),
        destinations: [packDir.canonicalPath],
      }).pipe(Effect.provideService(FileSystem.FileSystem, fs));
    }),
    markAuthored: ws.setPackEntry(args.name, { source: "workspace", enabled: true }),
    plannedArtifact: artifact,
    buildArtifact: () => Effect.succeed(artifact),
    scaffold: newPack(op).pipe(
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

  const resolution = yield* previewOrApplyLocalPlan(plan, {
    preview: args.preview,
    yes: args.yes,
  });

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
  yes: yesFlag.pipe(Flag.withDescription("Create the pack without confirmation")),
  preview: previewFlag.pipe(
    Flag.withDescription("Show what files would be created without creating them"),
  ),
} as const;

export const newCommand = Command.make("new", newConfig, ({ name, owner, yes, preview }) =>
  handlePacksNew({
    name: decodeExtensionNameSync(name),
    owner: Option.map(owner, (s) => normalizeHandle(s.startsWith("@") ? s : `@${s}`)),
    yes,
    preview,
  }).pipe(withWorkspace(DEFAULT_WORKSPACE_SCOPE), withRuntime("packs new")),
).pipe(
  withArgvTracking(newConfig),
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
