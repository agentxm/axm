import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Argument, Command, Flag } from "effect/unstable/cli";
import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import {
  buildNewExtensionStep,
  decodeExtensionNameSync,
  formatFqn,
  normalizeHandle,
  type ExtensionName,
  type Handle,
} from "@agentxm/client-core/unstable/extensions";
import {
  PACK_MANIFEST_FILENAME,
  packManifestArtifact,
  packManifestPath,
} from "@agentxm/client-core/unstable/packs";
import type { NewPackOperation, RegistryPackRef } from "@agentxm/client-core/unstable/packs";
import { newPack, PackManager } from "@agentxm/client-core/unstable/packs";
import { computePackPaths } from "@agentxm/client-core/unstable/packs";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import type { Plan } from "@agentxm/client-core/unstable/plan";
import { forceFlag, previewFlag, yesFlag } from "@agentxm/client-core/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { DEFAULT_WORKSPACE_SCOPE } from "@agentxm/client-core/unstable/workspace";
import { emitPlanResolutionResult } from "../../json-output.js";
import { withAuthRuntime, withWorkspace } from "../../runtime.js";
import { joinDisplayPath } from "../shared/display-path.js";
import { previewOrApplyLocalPlan } from "../shared/local-plan.js";
import { resolveOwnerForNewContent } from "../shared/resolve-owner.js";
import { emitScaffoldSuccess } from "../shared/scaffold-success.js";
import { decodeVersionSync } from "@agentxm/client-core/unstable/version-constraints";

export interface PacksNewHandlerArgs {
  readonly name: ExtensionName;
  readonly owner: Option.Option<Handle>;
  readonly yes: boolean;
  readonly force: boolean;
  readonly preview: boolean;
}

export const handlePacksNew = Effect.fn("PacksNew.handle")(function* (args: PacksNewHandlerArgs) {
  const ws = yield* WorkspaceMutations;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const manager = yield* PackManager;

  // Resolve owner
  const owner = Option.isSome(args.owner)
    ? args.owner.value
    : yield* resolveOwnerForNewContent("pack creation");

  const fqn = formatFqn({ owner, type: "pack", name: args.name });
  const manifestDisplayPath = packManifestPath(owner, args.name);
  const base = ws.baseDir;

  // Check if pack already exists
  const packDir = computePackPaths(path.join, base, owner, args.name);
  const manifestPath = path.join(packDir.canonicalPath, PACK_MANIFEST_FILENAME);

  const exists = yield* fs.exists(manifestPath).pipe(
    Effect.mapError((e) =>
      makeAppError({
        code: "internal",
        detail: `Failed to check if pack exists: ${manifestPath}`,
        cause: e,
      }),
    ),
  );

  if (exists) {
    return yield* makeAppError({
      code: "conflict",
      detail: `Pack '${fqn}' already exists at ${packDir.canonicalPath}`,
      suggestions: [
        {
          description: "Choose a different name or remove the existing pack first",
        },
      ],
    });
  }

  // Build operation
  const op = {
    name: "new-pack",
    args: { name: args.name, owner },
  } satisfies NewPackOperation;
  const version = decodeVersionSync("0.0.1");
  const ref: RegistryPackRef = {
    type: "pack",
    refType: "registry",
    source: { type: "registry", location: new URL("file:///"), owner: Option.some(owner) },
    owner,
    name: args.name,
    version,
    integrity: Option.none(),
    packages: [],
    pack: { name: args.name, dependencies: {} },
  };

  const step = buildNewExtensionStep(manager, {
    ref,
    versionRange: Option.none(),
    label: fqn,
    message: `Created pack ${fqn}`,
    markAuthored: ws.setPackEntry(args.name, { source: fqn, authored: true }),
    buildArtifact: () =>
      Effect.succeed(
        packManifestArtifact({
          owner,
          name: args.name,
          scope: ws.scope,
          change: "created",
          version: "0.0.1",
          fileCount: 1,
        }),
      ),
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
    jobs: [{ concurrency: 1 as const, steps: [step] }],
  };

  const resolution = yield* previewOrApplyLocalPlan(plan, {
    preview: args.preview,
    displayApplied: false,
  });

  const suggestions = [
    {
      description: `Edit \`${joinDisplayPath(path, ".axm", "extensions", owner, "packs", args.name, PACK_MANIFEST_FILENAME)}\` to fill in pack contents`,
    },
  ];

  const emitted = yield* emitPlanResolutionResult(
    "packs.new",
    resolution,
    resolution._tag === "ExecutedPlan"
      ? { summary: `-> ${manifestDisplayPath}   0.0.1 | 1 file`, suggestions }
      : undefined,
  );

  if (resolution._tag === "ExecutedPlan") {
    yield* emitScaffoldSuccess({
      message: `Created pack ${fqn}`,
      summary: `-> ${manifestDisplayPath}   0.0.1 | 1 file`,
      suggestions,
      withoutSuggestions: emitted,
    });
  }
});

const newConfig = {
  name: Argument.string("name").pipe(Argument.withDescription("Name of the pack (without owner)")),
  owner: Flag.string("owner").pipe(
    Flag.withDescription("Override the workspace owner (e.g., @acme)"),
    Flag.optional,
  ),
  yes: yesFlag.pipe(Flag.withDescription("Create the pack without confirmation")),
  force: forceFlag.pipe(Flag.withDescription("Overwrite if a pack with this name already exists")),
  preview: previewFlag.pipe(
    Flag.withDescription("Show what files would be created without creating them"),
  ),
} as const;

export const newCommand = Command.make("new", newConfig, ({ name, owner, yes, force, preview }) =>
  handlePacksNew({
    name: decodeExtensionNameSync(name),
    owner: Option.map(owner, (s) => normalizeHandle(s.startsWith("@") ? s : `@${s}`)),
    yes,
    force,
    preview,
  }).pipe(withWorkspace(DEFAULT_WORKSPACE_SCOPE), withAuthRuntime("packs new")),
).pipe(
  withArgvTracking(newConfig),
  Command.withDescription("Create a new empty pack"),
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
