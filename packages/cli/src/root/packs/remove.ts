/**
 * Packs remove handler — computes manifest delta at plan time,
 * builds a single-step plan, and executes via `ws.resolvePlan()`.
 *
 * Supports glob expansion against pack manifest entries.
 * This is a manifest edit only — it does not uninstall extensions.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as crypto from "node:crypto";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { Argument, Command, Flag } from "effect/unstable/cli";
import { makeAppError } from "@axm.sh/core/unstable/app-error";
import type { RemoveFromPackOperation } from "@axm.sh/core/unstable/packs";
import { removeFromPack } from "@axm.sh/core/unstable/packs";
import { PACK_MANIFEST_FILENAME, RawPackManifestSchema } from "@axm.sh/core/unstable/packs";
import { computePackPaths } from "@axm.sh/core/unstable/packs";
import { expandGlobs, isGlobPattern } from "@axm.sh/core/unstable/utils";
import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { Workspace } from "@axm.sh/core/unstable/workspace";
import type { JobStepResult, Plan, PlannedJobStep } from "@axm.sh/core/unstable/workspace";
import { resolvePlan } from "@axm.sh/core/unstable/workspace";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { forceFlag, previewFlag, yesFlag } from "@axm.sh/core/unstable/cli-flags";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";
import { DEFAULT_WORKSPACE_SCOPE } from "@axm.sh/core/unstable/workspace";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface PacksRemoveHandlerArgs {
  /** Pack name (without profile). */
  readonly pack: string;
  /** Extension name or glob pattern. */
  readonly extension: string;
  /** Auto-accept confirmation prompts. */
  readonly yes: boolean;
  /** Override constraints that would cause failure. */
  readonly force: boolean;
  /** Display plan without applying. */
  readonly preview: boolean;
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const hashContent = (content: string) => crypto.createHash("sha256").update(content).digest("hex");

// -----------------------------------------------------------------------------
// Main Handler
// -----------------------------------------------------------------------------

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
      what: `Pack '${args.pack}' not found`,
      howToFix: "Check available packs or create one with `axm packs new`",
    });
  }

  // Resolve pack profile
  const packSource = typeof packEntry === "string" ? packEntry : packEntry.source;
  const hasProfile = packSource.startsWith("@") && packSource.includes("/");
  const [packProfileFromSource] = packSource.split("/");
  const packProfile =
    hasProfile && packProfileFromSource !== undefined
      ? packProfileFromSource
      : yield* ws.getConfiguredProfile();
  const base = ws.baseDir;

  // Step 2: Read pack manifest and compute hash for stale-check
  const packDir = computePackPaths(path.join, base, packProfile, args.pack);
  const manifestPath = path.join(packDir.canonicalPath, PACK_MANIFEST_FILENAME);

  const manifestContent = yield* fs.readFileString(manifestPath).pipe(
    Effect.mapError((e) =>
      makeAppError({
        code: "PACK_NOT_FOUND",
        what: `Pack manifest not found at ${manifestPath}`,
        howToFix: "Ensure the pack exists on disk",
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
        what: `Failed to parse pack manifest: ${manifestPath}`,
        cause: e,
      }),
  });

  const manifest = yield* Schema.decodeUnknownEffect(RawPackManifestSchema)(json).pipe(
    Effect.mapError((e) =>
      makeAppError({
        code: "PACK_MANIFEST_INVALID",
        what: `Invalid pack manifest: ${manifestPath}`,
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
        what: `No extensions in pack match '${args.extension}'`,
        details: allNames.length > 0 ? [`Available: ${allNames.join(", ")}`] : [],
        howToFix: "Check pack contents",
      });
    }

    return yield* makeAppError({
      code: "EXTENSION_NOT_IN_PACK",
      what: `Extension '${args.extension}' is not in the pack`,
      details: allNames.length > 0 ? [`Available: ${allNames.join(", ")}`] : [],
      howToFix: "Check the pack manifest for available extensions",
    });
  }

  // Step 5: Build operation with precomputed delta and manifest hash
  const op = {
    name: "remove-from-pack",
    args: {
      packName: args.pack,
      packProfile,
      removals: matchedNames,
      manifestHash,
    },
  } satisfies RemoveFromPackOperation;

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

  yield* resolvePlan(plan, {
    yes: args.yes,
    force: args.force,
    preview: args.preview,
  });

  yield* renderer.success("Done");
});

// -----------------------------------------------------------------------------
// Command
// -----------------------------------------------------------------------------

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
    withRuntime(
      withWorkspace(
        DEFAULT_WORKSPACE_SCOPE,
        handlePacksRemove({ pack, extension, yes, force, preview }),
      ),
      { command: "packs remove" },
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
    {
      command: "",
      description: "See also: packs add",
    },
  ]),
);
