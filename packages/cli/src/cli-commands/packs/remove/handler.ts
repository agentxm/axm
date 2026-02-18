/**
 * Packs remove handler — removes extensions from a pack manifest.
 *
 * Supports glob expansion against pack manifest entries.
 * This is a manifest edit only — it does not uninstall extensions.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "@effect/platform/FileSystem";
import * as Path from "@effect/platform/Path";
import * as Effect from "effect/Effect";
import { makeCliError } from "../../../cli-error/index.js";
import { Log } from "../../../tui/index.js";
import { Workspace } from "../../../workspace/index.js";
import { expandGlobs } from "../../../skills/index.js";
import { computePackPaths } from "../pack-paths.js";
import { PACK_MANIFEST_FILENAME, type RawPackManifest } from "../constants.js";
import { hasScopePrefix, parseScopedNameOrThrow } from "../../skills/naming.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface PacksRemoveHandlerArgs {
  /** Pack name (without scope). */
  readonly pack: string;
  /** Extension name or glob pattern. */
  readonly extension: string;
  /** Skip confirmations. */
  readonly yes: boolean;
}

// -----------------------------------------------------------------------------
// Main Handler
// -----------------------------------------------------------------------------

export const handlePacksRemove = Effect.fn("PacksRemove.handle")(function* (
  args: PacksRemoveHandlerArgs,
) {
    const ws = yield* Workspace;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const log = yield* Log;

    yield* log.info("axm packs remove");

    // Step 1: Find the pack
    const configuredPacks = yield* ws.getConfiguredPacks();
    const packEntry = configuredPacks[args.pack];

    if (packEntry === undefined) {
      return yield* makeCliError({
        code: "PACK_NOT_FOUND",
        what: `Pack '${args.pack}' not found`,
        howToFix: "Check available packs or create one with `axm packs new`",
      });
    }

    // Resolve pack scope
    const packSource = typeof packEntry === "string" ? packEntry : packEntry.source;
    const packScope = hasScopePrefix(packSource)
      ? parseScopedNameOrThrow(packSource).scope
      : yield* ws.getConfiguredScope();
    const base = path.dirname(ws.path);

    // Step 2: Read pack manifest
    const packDir = computePackPaths(path.join, base, packScope, args.pack);
    const manifestPath = path.join(packDir.canonicalPath, PACK_MANIFEST_FILENAME);

    const manifestContent = yield* fs.readFileString(manifestPath).pipe(
      Effect.mapError((e) =>
        makeCliError({
          code: "PACK_NOT_FOUND",
          what: `Pack manifest not found at ${manifestPath}`,
          howToFix: "Ensure the pack exists on disk",
          cause: e,
        }),
      ),
    );

    const manifest = yield* Effect.try({
      try: () => JSON.parse(manifestContent) as RawPackManifest,
      catch: (e) =>
        makeCliError({
          code: "PACK_MANIFEST_PARSE_FAILED",
          what: `Failed to parse pack manifest: ${manifestPath}`,
          cause: e,
        }),
    });

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
    const isGlob = args.extension.includes("*");
    const matchedNames = isGlob
      ? expandGlobs([args.extension], allNames)
      : allNames.includes(args.extension)
        ? [args.extension]
        : [];

    if (matchedNames.length === 0) {
      if (isGlob) {
        return yield* makeCliError({
          code: "NO_EXTENSIONS_MATCHED",
          what: `No extensions in pack match '${args.extension}'`,
          details: allNames.length > 0 ? [`Available: ${allNames.join(", ")}`] : [],
          howToFix: "Check pack contents",
        });
      }

      return yield* makeCliError({
        code: "EXTENSION_NOT_IN_PACK",
        what: `Extension '${args.extension}' is not in the pack`,
        details: allNames.length > 0 ? [`Available: ${allNames.join(", ")}`] : [],
        howToFix: "Check the pack manifest for available extensions",
      });
    }

    // Step 5: Remove matched extensions from the relevant sections
    const matchedSet = new Set(matchedNames);
    for (const section of ["skills", "commands", "mcp-servers"] as const) {
      const entries = manifest[section];
      if (entries === undefined) continue;
      for (const name of Object.keys(entries)) {
        if (matchedSet.has(name)) {
          delete entries[name];
          yield* log.info(`Removed ${name} from ${section}`);
        }
      }
    }

    // Step 6: Write updated manifest
    yield* fs.writeFileString(manifestPath, JSON.stringify(manifest, null, 2) + "\n").pipe(
      Effect.mapError((e) =>
        makeCliError({
          code: "PACK_WRITE_FAILED",
          what: `Failed to write pack manifest: ${manifestPath}`,
          cause: e,
        }),
      ),
    );

    yield* log.success("Done");
  });
