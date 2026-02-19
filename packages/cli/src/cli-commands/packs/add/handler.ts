/**
 * Packs add handler — adds extensions to a pack manifest.
 *
 * Supports glob expansion against managed, registry-sourced workspace extensions.
 * Infers extension type from lockfile. Derives version range from installed version.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "@effect/platform/FileSystem";
import * as Path from "@effect/platform/Path";
import * as Effect from "effect/Effect";
import { makeCliError } from "../../../cli-error/index.js";
import { Log } from "../../../tui/index.js";
import { Workspace } from "../../../workspace/index.js";
import { expandGlobs, isGlobPattern } from "../../../skills/index.js";
import { computePackPaths } from "../pack-paths.js";
import { PACK_MANIFEST_FILENAME, type RawPackManifest } from "../constants.js";
import { formatFqn } from "../../../extensions/index.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface PacksAddHandlerArgs {
  /** Pack name (without scope). */
  readonly pack: string;
  /** Extension name or glob pattern. */
  readonly extension: string;
  /** Skip confirmations. */
  readonly yes: boolean;
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/**
 * Derive a caret version range from a resolved version.
 * e.g., "1.2.3" -> "^1.2.3"
 */
const toVersionRange = (version: string): string => `^${version}`;

// -----------------------------------------------------------------------------
// Main Handler
// -----------------------------------------------------------------------------

export const handlePacksAdd = Effect.fn("PacksAdd.handle")(function* (args: PacksAddHandlerArgs) {
  const ws = yield* Workspace;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const log = yield* Log;

  yield* log.info("axm packs add");

  // Step 1: Find the pack
  const configuredPacks = yield* ws.getConfiguredPacks();
  const packEntry = configuredPacks[args.pack];

  if (packEntry === undefined) {
    return yield* makeCliError({
      code: "PACK_NOT_FOUND",
      what: `Pack '${args.pack}' not found`,
      howToFix: "Run `axm packs new <name>` to create a pack first",
    });
  }

  // Resolve pack scope from the entry (format: "@scope/packs/name" or { source: "@scope/packs/name" })
  const packSource = typeof packEntry === "string" ? packEntry : packEntry.source;
  const hasScope = packSource.startsWith("@") && packSource.includes("/");
  const packScope = hasScope ? packSource.split("/")[0]! : yield* ws.getConfiguredScope();
  const base = ws.baseDir;

  // Step 2: Read pack manifest as raw JSON (no schema validation for editing)
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

  // Step 3: Resolve extensions - get all managed, registry-sourced skills from lockfile
  const lockedSkills = yield* ws.getLockedSkills();
  const registrySkills = Object.entries(lockedSkills).filter(
    ([, entry]) => entry.type === "registry",
  );
  const registrySkillNames = registrySkills.map(([name]) => name);

  // Determine if this is a glob or exact match
  const isGlob = isGlobPattern(args.extension);
  const matchedNames = isGlob
    ? expandGlobs([args.extension], registrySkillNames)
    : registrySkillNames.includes(args.extension)
      ? [args.extension]
      : [];

  if (matchedNames.length === 0) {
    if (isGlob) {
      return yield* makeCliError({
        code: "NO_EXTENSIONS_MATCHED",
        what: `No managed, registry-sourced extensions match '${args.extension}'`,
        howToFix: "Check installed extensions with `axm skills list`",
      });
    }

    // Check if extension exists but is not registry-sourced
    if (args.extension in lockedSkills) {
      return yield* makeCliError({
        code: "EXTENSION_NOT_REGISTRY",
        what: `Extension '${args.extension}' is not a managed, registry-sourced extension`,
        howToFix: "Only managed, registry-sourced extensions can be added to packs",
      });
    }

    return yield* makeCliError({
      code: "EXTENSION_NOT_FOUND",
      what: `Extension '${args.extension}' not found in workspace`,
      howToFix: "Install the extension first with `axm skills install`",
    });
  }

  // Step 4: Add extensions to manifest
  let updated = false;
  const currentSkills = { ...(manifest.skills ?? {}) };

  for (const name of matchedNames) {
    const lockEntry = lockedSkills[name]!;

    // All matched extensions are registry-sourced (filtered above)
    if (lockEntry.type !== "registry") continue;

    const fqn = formatFqn({ scope: lockEntry.scope, type: "skills", name: lockEntry.name });
    const version = toVersionRange(lockEntry.resolvedVersion);

    // Check if already in pack (by FQN)
    if (fqn in currentSkills) {
      yield* log.info(`Extension '${fqn}' already in pack`);
      continue;
    }

    currentSkills[fqn] = version;
    updated = true;
    yield* log.info(`Adding ${fqn}@${version}`);
  }

  if (!updated) {
    yield* log.success("Nothing to do.");
    return;
  }

  manifest.skills = currentSkills;

  // Step 5: Write updated manifest
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
