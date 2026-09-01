import * as crypto from "node:crypto";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { Argument, Command, Flag } from "effect/unstable/cli";
import { makeAppError } from "@agentxm/extension-management/unstable/app-error";
import type { RemoveFromPackOperation } from "@agentxm/extension-management/unstable/packs";
import { removeFromPack } from "@agentxm/extension-management/unstable/packs";
import {
  PACK_MANIFEST_FILENAME,
  PackManifestSchema,
} from "@agentxm/extension-model/unstable/packs/manifest-schema";
import { expandGlobs, isGlobPattern } from "@agentxm/extension-management/unstable/utils";
import { count } from "@agentxm/extension-management/unstable/cli-renderer";
import { WorkspaceMutations, configuredRowsByName } from "@agentxm/workspace-state";
import {
  operationPresentation,
  type Plan,
  type PlannedJobStep,
} from "@agentxm/workspace-operations";
import { previewFlag, yesFlag } from "@agentxm/extension-management/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/extension-management/unstable/cli-runtime";
import { publicRecoveryValue, recoveryPositional } from "@agentxm/workspace-operations";
import { DEFAULT_WORKSPACE_SCOPE } from "@agentxm/extension-model/unstable/workspace-scope";
import { isWorkspaceSourceLocator } from "@agentxm/extension-model/unstable/sources/workspace";
import { emitOperationResolution } from "../../operation-output.js";
import { withOperationLifecycle } from "../shared/operation-lifecycle.js";
import { workspaceAuthoredRoot, workspaceSettingsPath } from "../shared/workspace-display-paths.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { previewOrApplyLocalPlan } from "../shared/local-plan.js";
import { makeConfirmationRecovery } from "../shared/confirmation-recovery.js";
import { resolveConfiguredPackSelector } from "./configured-pack-selector.js";

export interface PacksRemoveHandlerArgs {
  readonly pack: string;
  readonly extension: string;
  readonly yes: boolean;
  readonly preview: boolean;
}

const hashContent = (content: string) => crypto.createHash("sha256").update(content).digest("hex");

export const handlePacksRemove = (args: PacksRemoveHandlerArgs) =>
  withOperationLifecycle(
    {
      command: "packs.remove",
      mode: args.preview ? "preview" : "apply",
      planName: "Remove from pack",
    },
    handlePacksRemoveBody(args),
  );

const handlePacksRemoveBody = Effect.fn("PacksRemove.handle")(function* (
  args: PacksRemoveHandlerArgs,
) {
  const ws = yield* WorkspaceMutations;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  // Step 1: Find the pack
  const configuredPacks = yield* ws.records
    .rows("pack")
    .pipe(Effect.map((rows) => Object.values(configuredRowsByName(rows))));
  const configuredOwner = yield* ws.getConfiguredOwner();
  const selection = yield* resolveConfiguredPackSelector({
    configured: configuredPacks,
    ...(Option.isNone(configuredOwner) ? {} : { configuredOwner: configuredOwner.value }),
    selector: args.pack,
    recovery: { command: "remove", extension: args.extension },
  });
  const packName = selection.configuredName;
  const packEntry = selection.entry;

  // Resolve pack owner
  const packSource = packEntry.source;
  if (packSource === undefined) {
    return yield* makeAppError({ code: "validation", detail: `Pack "${packName}" has no source.` });
  }
  if (!isWorkspaceSourceLocator(packSource)) {
    return yield* makeAppError({
      code: "conflict",
      detail: `Cannot edit non-workspace pack "${packName}"`,
      recover: "Adopt or copy the pack into workspace authorship before editing its manifest.",
    });
  }
  const packOwner = yield* Option.match(configuredOwner, {
    onNone: () =>
      Effect.fail(
        makeAppError({
          code: "validation",
          detail: `Pack "${packName}" has a workspace source and no workspace owner is configured`,
          suggestions: [
            {
              description: `Set \`owner\` in \`${workspaceSettingsPath(ws.scope)}\` before modifying this pack.`,
              cmd: "axm setup",
            },
          ],
        }),
      ),
    onSome: Effect.succeed,
  });

  // Step 2: Read pack manifest and compute hash for stale-check
  const manifestPath = path.join(
    workspaceAuthoredRoot(path, ws, "pack", packOwner),
    packName,
    PACK_MANIFEST_FILENAME,
  );

  const manifestContent = yield* fs.readFileString(manifestPath).pipe(
    Effect.mapError((e) =>
      makeAppError({
        code: "not_found",
        detail: `Pack manifest not found at ${manifestPath}`,
        suggestions: [{ description: "Ensure the pack exists on disk" }],
        cause: e,
      }),
    ),
  );

  const manifestHash = hashContent(manifestContent);

  const json = yield* Effect.try({
    try: () => {
      const parsed: unknown = JSON.parse(manifestContent);
      return parsed;
    },
    catch: (e) =>
      makeAppError({
        code: "validation",
        detail: `Failed to parse pack manifest: ${manifestPath}`,
        cause: e,
      }),
  });

  const manifest = yield* Schema.decodeUnknownEffect(PackManifestSchema)(json).pipe(
    Effect.mapError((e) =>
      makeAppError({
        code: "validation",
        detail: `Invalid pack manifest: ${manifestPath}`,
        cause: e,
      }),
    ),
  );

  // Step 3: Collect all extension FQNs from the manifest.
  const allNames = Object.keys(manifest.dependencies);

  // Step 4: Match extensions by name or glob
  const isGlob = isGlobPattern(args.extension);
  const matchedNames = isGlob
    ? expandGlobs([args.extension], allNames)
    : allNames.includes(args.extension)
      ? [args.extension]
      : [];

  if (matchedNames.length === 0) {
    if (isGlob) {
      return yield* makeAppError({
        code: "not_found",
        detail: `No extensions in pack match '${args.extension}'`,
        suggestions: [{ description: "Check pack contents" }],
      });
    }

    return yield* makeAppError({
      code: "not_found",
      detail: `Extension '${args.extension}' is not in the pack`,
      suggestions: [
        {
          description: "Check the pack manifest for available extensions",
        },
      ],
    });
  }

  // Step 5: Build operation with precomputed delta and manifest hash
  const op = {
    name: "remove-from-pack",
    args: {
      packName,
      packOwner,
      removals: matchedNames,
      manifestHash,
    },
  } satisfies RemoveFromPackOperation;

  // Build Plan directly with inline run closure
  const provideServices = <A, E>(
    effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path | WorkspaceMutations>,
  ): Effect.Effect<A, E, never> =>
    effect.pipe(
      Effect.provideService(WorkspaceMutations, ws),
      Effect.provideService(FileSystem.FileSystem, fs),
      Effect.provideService(Path.Path, path),
    );

  const step: PlannedJobStep = {
    readiness: "ready",
    label: packName,
    run: provideServices(removeFromPack(op)),
  };

  const plan: Plan = {
    _tag: "Plan",
    name: "Remove from pack",
    description: Option.some(`Remove ${count(matchedNames.length, "extension")} from ${packName}`),
    presentation: operationPresentation(
      { imperative: "remove", past: "Removed", gerund: "Removing" },
      "pack",
    ),
    jobs: [{ concurrency: 1 as const, steps: [step] }],
  };

  const resolution = yield* previewOrApplyLocalPlan(plan, {
    preview: args.preview,
    yes: args.yes,
    recovery: makeConfirmationRecovery(
      ["packs", "remove"],
      [
        recoveryPositional(publicRecoveryValue(args.pack)),
        recoveryPositional(publicRecoveryValue(args.extension)),
      ],
    ),
  });
  yield* emitOperationResolution("packs.remove", resolution, {
    suggestions: [
      { description: "Inspect installed packs", cmd: "axm packs list" },
      {
        description: "Add to pack",
        cmd: `axm packs add ${packName} <extension>`,
      },
    ],
  });
});

const removeConfig = {
  pack: Argument.string("name").pipe(
    Argument.withDescription("Configured pack name or unique configured pack FQN"),
  ),
  extension: Argument.string("extension").pipe(
    Argument.withDescription("Extension name or glob pattern"),
  ),
  yes: yesFlag.pipe(Flag.withDescription("Remove without confirmation")),
  preview: previewFlag.pipe(
    Flag.withDescription("Show what would change in the manifest without modifying it"),
  ),
} as const;

export const removeCommand = Command.make(
  "remove",
  removeConfig,
  ({ pack, extension, yes, preview }) =>
    handlePacksRemove({ pack, extension, yes, preview }).pipe(
      withWorkspace(DEFAULT_WORKSPACE_SCOPE),
      withRuntime("packs remove"),
    ),
).pipe(
  withArgvTracking(removeConfig),
  Command.withDescription("Remove an extension from a project-workspace pack manifest"),
  Command.withExamples([
    {
      command: "axm packs remove frontend-tools @acme/skills/code-review",
      description: "Remove an extension from a pack",
    },
    {
      command: 'axm packs remove my-pack "@acme/effect-*"',
      description: "Remove by pattern",
    },
  ]),
);
