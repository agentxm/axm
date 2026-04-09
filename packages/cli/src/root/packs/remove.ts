import * as crypto from "node:crypto";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { Argument, Command, Flag } from "effect/unstable/cli";
import { makeAppError } from "@axm.sh/core/unstable/app-error";
import { normalizeHandle, parseRegistrySourcePatternParts } from "@axm.sh/core/unstable/extensions";
import type { RemoveFromExtensionPackOperation } from "@axm.sh/core/unstable/packs";
import { removeFromExtensionPack } from "@axm.sh/core/unstable/packs";
import {
  EXTENSION_PACK_MANIFEST_FILENAME,
  ExtensionPackManifestSchema,
} from "@axm.sh/core/unstable/packs";
import { computeExtensionPackPaths } from "@axm.sh/core/unstable/packs";
import { expandGlobs, isGlobPattern } from "@axm.sh/core/unstable/utils";
import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { Workspace } from "@axm.sh/core/unstable/workspace";
import type { JobStepResult, Plan, PlannedJobStep } from "@axm.sh/core/unstable/workspace";
import { previewOrApplyPlan } from "@axm.sh/core/unstable/workspace";
import { forceFlag, previewFlag, yesFlag } from "@axm.sh/core/unstable/cli-flags";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";
import { DEFAULT_WORKSPACE_SCOPE } from "@axm.sh/core/unstable/workspace";
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
  const ws = yield* Workspace;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const renderer = yield* CliRenderer;

  yield* renderer.info("axm packs remove");

  // Step 1: Find the pack
  const configuredPacks = yield* ws.getConfiguredPacks();
  const packEntry = configuredPacks[args.pack];

  if (packEntry === undefined) {
    return yield* makeAppError({
      code: "PACK_NOT_FOUND",
      what: `Extension pack '${args.pack}' not found`,
      howToFix: "Check available extension packs or create one with `axm packs new`",
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
      : yield* ws.getConfiguredProfile();
  const base = ws.baseDir;

  // Step 2: Read pack manifest and compute hash for stale-check
  const packDir = computeExtensionPackPaths(path.join, base, packOwner, args.pack);
  const manifestPath = path.join(packDir.canonicalPath, EXTENSION_PACK_MANIFEST_FILENAME);

  const manifestContent = yield* fs.readFileString(manifestPath).pipe(
    Effect.mapError((e) =>
      makeAppError({
        code: "PACK_NOT_FOUND",
        what: `Extension pack manifest not found at ${manifestPath}`,
        howToFix: "Ensure the extension pack exists on disk",
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
        code: "PACK_MANIFEST_PARSE_FAILED",
        what: `Failed to parse extension pack manifest: ${manifestPath}`,
        cause: e,
      }),
  });

  const manifest = yield* Schema.decodeUnknownEffect(ExtensionPackManifestSchema)(json).pipe(
    Effect.mapError((e) =>
      makeAppError({
        code: "PACK_MANIFEST_INVALID",
        what: `Invalid extension pack manifest: ${manifestPath}`,
        cause: e,
      }),
    ),
  );

  // Step 3: Collect all extension names from the manifest (across all sections)
  const allEntries: Array<{ section: "skills" | "commands" | "mcp-servers"; name: string }> = [];
  for (const section of ["skills", "commands", "mcp-servers"] as const) {
    const entries = manifest[section] ?? {};
    for (const name of Object.keys(entries)) {
      allEntries.push({ section, name });
    }
  }
  const allNames = allEntries.map((e) => e.name);

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
        code: "NO_EXTENSIONS_MATCHED",
        what: `No extensions in extension pack match '${args.extension}'`,
        details: allNames.length > 0 ? [`Available: ${allNames.join(", ")}`] : [],
        howToFix: "Check extension pack contents",
      });
    }

    return yield* makeAppError({
      code: "EXTENSION_NOT_IN_PACK",
      what: `Extension '${args.extension}' is not in the extension pack`,
      details: allNames.length > 0 ? [`Available: ${allNames.join(", ")}`] : [],
      howToFix: "Check the extension pack manifest for available extensions",
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
  } satisfies RemoveFromExtensionPackOperation;

  // Build Plan directly with inline run closure
  const provideServices = <A, E>(
    effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path | Workspace>,
  ): Effect.Effect<A, E, never> =>
    effect.pipe(
      Effect.provideService(Workspace, ws),
      Effect.provideService(FileSystem.FileSystem, fs),
      Effect.provideService(Path.Path, path),
    );

  const step: PlannedJobStep = {
    readiness: "ready",
    label: args.pack,
    run: provideServices(removeFromExtensionPack(op)).pipe(
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
    name: "Remove from extension pack",
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
  force: forceFlag.pipe(
    Flag.withDescription("Remove even if it would leave the extension pack empty"),
  ),
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
  Command.withDescription("Remove an extension from an extension pack manifest"),
  Command.withExamples([
    {
      command: "axm packs remove frontend-tools @acme/skills/code-review",
      description: "Remove an extension from an extension pack",
    },
    {
      command: 'axm packs remove my-pack "@acme/effect-*"',
      description: "Remove by pattern",
    },
  ]),
);
