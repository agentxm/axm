import * as crypto from "node:crypto";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { Argument, Command, Flag } from "effect/unstable/cli";
import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import {
  normalizeHandle,
  parseRegistrySourcePatternParts,
} from "@agentxm/client-core/unstable/extensions";
import type { RemoveFromPackOperation } from "@agentxm/client-core/unstable/packs";
import { removeFromPack } from "@agentxm/client-core/unstable/packs";
import { PACK_MANIFEST_FILENAME, PackManifestSchema } from "@agentxm/client-core/unstable/packs";
import { computePackPaths } from "@agentxm/client-core/unstable/packs";
import { expandGlobs, isGlobPattern } from "@agentxm/client-core/unstable/utils";
import { CliRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import type { JobStepResult, Plan, PlannedJobStep } from "@agentxm/client-core/unstable/plan";
import { previewOrApplyPlan } from "@agentxm/client-core/unstable/plan";
import { forceFlag, previewFlag, yesFlag } from "@agentxm/client-core/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { DEFAULT_WORKSPACE_SCOPE } from "@agentxm/client-core/unstable/workspace";
import { emitPlanResolutionResult } from "../../json-output.js";
import { withRuntime, withWorkspace } from "../../runtime.js";

export interface PacksRemoveHandlerArgs {
  readonly pack: string;
  readonly extension: string;
  readonly yes: boolean;
  readonly force: boolean;
  readonly preview: boolean;
}

const hashContent = (content: string) => crypto.createHash("sha256").update(content).digest("hex");

export const handlePacksRemove = Effect.fn("PacksRemove.handle")(function* (
  args: PacksRemoveHandlerArgs,
) {
  const ws = yield* WorkspaceMutations;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const renderer = yield* CliRenderer;

  yield* renderer.info("axm packs remove");

  // Step 1: Find the pack
  const configuredPacks = yield* ws.records.getConfiguredPacks();
  const packEntry = configuredPacks[args.pack];

  if (packEntry === undefined) {
    return yield* makeAppError({
      code: "not_found",
      detail: `Pack '${args.pack}' not found`,
      suggestions: [
        {
          description: "Check available packs or create one with `axm packs new`",
          cmd: "axm packs new <name>",
        },
      ],
    });
  }

  // Resolve pack owner
  const packSource = typeof packEntry === "string" ? packEntry : packEntry.source;
  const packOwnerFromSource = packSource.startsWith("@")
    ? parseRegistrySourcePatternParts(packSource)?.owner
    : undefined;
  const packOwner =
    packOwnerFromSource !== undefined
      ? normalizeHandle(packOwnerFromSource)
      : yield* ws.getConfiguredOwner().pipe(
          Effect.flatMap(
            Option.match({
              onNone: () =>
                Effect.fail(
                  makeAppError({
                    code: "internal",
                    detail: `Pack "${args.pack}" has a non-registry source and no workspace owner is configured`,
                    suggestions: [
                      {
                        description:
                          "Set `owner` in `.axm/settings.json` (run `axm setup`) before modifying this pack.",
                      },
                    ],
                  }),
                ),
              onSome: Effect.succeed,
            }),
          ),
        );
  const base = ws.baseDir;

  // Step 2: Read pack manifest and compute hash for stale-check
  const packDir = computePackPaths(path.join, base, packOwner, args.pack);
  const manifestPath = path.join(packDir.canonicalPath, PACK_MANIFEST_FILENAME);

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
        code: "internal",
        detail: `No extensions in pack match '${args.extension}'`,
        suggestions: [{ description: "Check pack contents" }],
      });
    }

    return yield* makeAppError({
      code: "internal",
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
      packName: args.pack,
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
    label: args.pack,
    run: provideServices(removeFromPack(op)).pipe(
      Effect.map(
        (result): JobStepResult =>
          result.result === "error"
            ? { result: "error", message: result.message, error: result.error }
            : { result: "success", message: result.message },
      ),
    ),
  };

  const plan: Plan = {
    _tag: "Plan",
    name: "Remove from pack",
    description: Option.some(`Remove ${matchedNames.length} extension(s) from ${args.pack}`),
    jobs: [{ concurrency: 1 as const, steps: [step] }],
  };

  const resolution = yield* previewOrApplyPlan(plan, {
    yes: args.yes,
    force: args.force,
    preview: args.preview,
  });
  yield* emitPlanResolutionResult("packs.remove", resolution);

  yield* renderer.success("Done");
});

const removeConfig = {
  pack: Argument.string("pack").pipe(Argument.withDescription("Name of the pack")),
  extension: Argument.string("extension").pipe(
    Argument.withDescription("Extension name or glob pattern"),
  ),
  yes: yesFlag.pipe(Flag.withDescription("Remove without confirmation")),
  force: forceFlag.pipe(Flag.withDescription("Remove even if it would leave the pack empty")),
  preview: previewFlag.pipe(
    Flag.withDescription("Show what would change in the manifest without modifying it"),
  ),
} as const;

export const removeCommand = Command.make(
  "remove",
  removeConfig,
  ({ pack, extension, yes, force, preview }) =>
    handlePacksRemove({ pack, extension, yes, force, preview }).pipe(
      withWorkspace(DEFAULT_WORKSPACE_SCOPE),
      withRuntime("packs remove"),
    ),
).pipe(
  withArgvTracking(removeConfig),
  Command.withDescription("Remove an extension from a pack manifest"),
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
