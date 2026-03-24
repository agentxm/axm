/**
 * Packs add handler — computes manifest delta at plan time,
 * builds a single-step plan, and executes via `ws.resolvePlan()`.
 *
 * Supports glob expansion against managed, registry-sourced workspace extensions.
 * Infers extension type from lockfile. Derives version range from installed version.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as crypto from "node:crypto";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { makeAppError } from "../../../app-error/index.js";
import { formatFqn } from "../../../extensions/index.js";
import { TelemetryClient } from "../../../telemetry/index.js";
import type { AddToPackOperation } from "../../../extensions/packs/operations/add-to-pack.js";
import { addToPack } from "../../../extensions/packs/operations/add-to-pack.js";
import {
  PACK_MANIFEST_FILENAME,
  RawPackManifestSchema,
} from "../../../extensions/packs/manifest-schema.js";
import { computePackPaths } from "../../../extensions/packs/paths.js";
import { expandGlobs, isGlobPattern } from "../../../skills/index.js";
import { Output } from "../../../output/index.js";
import { Workspace } from "../../../workspace/index.js";
import { buildSingleStepPlan } from "../../skills/plan-helpers.js";
import { bridgeLegacyPlan } from "../../../workspace/plan-bridge.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface PacksAddHandlerArgs {
  /** Pack name (without namespace). */
  readonly pack: string;
  /** Extension name or glob pattern. */
  readonly extension: string;
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const hashContent = (content: string) => crypto.createHash("sha256").update(content).digest("hex");

/**
 * Derive a caret version range from a resolved version.
 * e.g., "1.2.3" -> "^1.2.3"
 */
const toVersionRange = (version: string): string => `^${version}`;

// -----------------------------------------------------------------------------
// Main Handler
// -----------------------------------------------------------------------------

export const handlePacksAdd = Effect.fn("PacksAdd.handle")(function* (args: PacksAddHandlerArgs) {
  const tc = yield* TelemetryClient;
  yield* tc.trackEvent("command_invoked", { command: "packs add" });
  const ws = yield* Workspace;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const output = yield* Output;

  yield* output.info("axm packs add");

  // Step 1: Find the pack
  const configuredPacks = yield* ws.getConfiguredPacks();
  const packEntry = configuredPacks[args.pack];

  if (packEntry === undefined) {
    return yield* makeAppError({
      code: "PACK_NOT_FOUND",
      what: `Pack '${args.pack}' not found`,
      howToFix: "Run `axm packs new <name>` to create a pack first",
    });
  }

  // Resolve pack namespace from the entry (format: "@namespace/packs/name" or { source: "@namespace/packs/name" })
  const packSource = typeof packEntry === "string" ? packEntry : packEntry.source;
  const hasNamespace = packSource.startsWith("@") && packSource.includes("/");
  const packNamespace = hasNamespace
    ? packSource.split("/")[0]!
    : yield* ws.getConfiguredNamespace();
  const base = ws.baseDir;

  // Step 2: Read pack manifest and compute hash for stale-check
  const packDir = computePackPaths(path.join, base, packNamespace, args.pack);
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
      return yield* makeAppError({
        code: "NO_EXTENSIONS_MATCHED",
        what: `No managed, registry-sourced extensions match '${args.extension}'`,
        howToFix: "Check installed extensions with `axm skills list`",
      });
    }

    // Check if extension exists but is not registry-sourced
    if (args.extension in lockedSkills) {
      return yield* makeAppError({
        code: "EXTENSION_NOT_REGISTRY",
        what: `Extension '${args.extension}' is not a managed, registry-sourced extension`,
        howToFix: "Only managed, registry-sourced extensions can be added to packs",
      });
    }

    return yield* makeAppError({
      code: "EXTENSION_NOT_FOUND",
      what: `Extension '${args.extension}' not found in workspace`,
      howToFix: "Install the extension first with `axm skills install`",
    });
  }

  // Step 4: Compute manifest delta (additions)
  const currentSkills = manifest.skills ?? {};
  const additions: Record<string, string> = {};

  for (const name of matchedNames) {
    const lockEntry = lockedSkills[name]!;

    // All matched extensions are registry-sourced (filtered above)
    if (lockEntry.type !== "registry") continue;

    const fqn = formatFqn({ namespace: lockEntry.namespace, type: "skills", name: lockEntry.name });
    const version = toVersionRange(lockEntry.resolvedVersion);

    // Check if already in pack (by FQN)
    if (fqn in currentSkills) {
      yield* output.info(`Extension '${fqn}' already in pack`);
      continue;
    }

    additions[fqn] = version;
    yield* output.info(`Adding ${fqn}@${version}`);
  }

  if (Object.keys(additions).length === 0) {
    yield* output.success("Nothing to do.");
    return;
  }

  // Step 5: Build operation with precomputed delta and manifest hash
  const op = {
    name: "add-to-pack",
    args: {
      packName: args.pack,
      packNamespace,
      additions,
      manifestHash,
    },
  } satisfies AddToPackOperation;

  // Build and resolve single-step plan
  const plan = buildSingleStepPlan({
    operation: op,
    name: "Add to pack",
    description: `Add ${Object.keys(additions).length} extension(s) to ${args.pack}`,
    label: args.pack,
  });

  yield* ws.resolvePlan(bridgeLegacyPlan(plan, { "add-to-pack": addToPack }));

  yield* output.success("Done");
});
