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
import * as Schema from "effect/Schema";
import { makeAppError } from "../../../app-error/index.js";
import type { RemoveFromPackOperation } from "../../../extensions/packs/operations/remove-from-pack.js";
import { removeFromPack } from "../../../extensions/packs/operations/remove-from-pack.js";
import { PACK_MANIFEST_FILENAME, RawPackManifestSchema } from "../../../extensions/index.js";
import { computePackPaths } from "../../../extensions/packs/paths.js";
import { expandGlobs, isGlobPattern } from "../../../skills/index.js";
import { Output } from "../../../output/index.js";
import { Workspace } from "../../../workspace/index.js";
import { buildSingleStepPlan } from "../../skills/plan-helpers.js";
import { bridgeLegacyPlan } from "../../../workspace/plan-bridge.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface PacksRemoveHandlerArgs {
  /** Pack name (without profile). */
  readonly pack: string;
  /** Extension name or glob pattern. */
  readonly extension: string;
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
  const output = yield* Output;

  yield* output.info("axm packs remove");

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
  const packProfile = hasProfile ? packSource.split("/")[0]! : yield* ws.getConfiguredProfile();
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
    try: () => JSON.parse(manifestContent) as unknown,
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

  // Build and resolve single-step plan
  const plan = buildSingleStepPlan({
    operation: op,
    name: "Remove from pack",
    description: `Remove ${matchedNames.length} extension(s) from ${args.pack}`,
    label: args.pack,
  });

  yield* ws.resolvePlan(bridgeLegacyPlan(plan, { "remove-from-pack": removeFromPack }));

  yield* output.success("Done");
});
