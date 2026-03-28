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
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { Argument, Command, Flag } from "effect/unstable/cli";
import { makeAppError } from "@axm.sh/core/unstable/app-error";
import { formatFqn } from "@axm.sh/core/unstable/extensions";
import { PACK_MANIFEST_FILENAME, RawPackManifestSchema } from "@axm.sh/core/unstable/packs";
import type { AddToPackOperation } from "@axm.sh/core/unstable/packs";
import { addToPack } from "@axm.sh/core/unstable/packs";
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

export interface PacksAddHandlerArgs {
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
  const renderer = yield* CliRenderer;

  yield* renderer.info("axm packs add");

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

  // Resolve pack profile from the entry (format: "@profile/packs/name" or { source: "@profile/packs/name" })
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
    const lockEntry = lockedSkills[name];
    if (lockEntry === undefined) {
      continue;
    }

    // All matched extensions are registry-sourced (filtered above)
    if (lockEntry.type !== "registry") continue;

    const fqn = formatFqn({ handle: lockEntry.profile, type: "skills", name: lockEntry.name });
    const version = toVersionRange(lockEntry.resolvedVersion);

    // Check if already in pack (by FQN)
    if (fqn in currentSkills) {
      yield* renderer.info(`Extension '${fqn}' already in pack`);
      continue;
    }

    additions[fqn] = version;
    yield* renderer.info(`Adding ${fqn}@${version}`);
  }

  if (Object.keys(additions).length === 0) {
    yield* renderer.success("Nothing to do.");
    return;
  }

  // Step 5: Build operation with precomputed delta and manifest hash
  const op = {
    name: "add-to-pack",
    args: {
      packName: args.pack,
      packProfile,
      additions,
      manifestHash,
    },
  } satisfies AddToPackOperation;

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
    run: provideServices(addToPack(op)).pipe(
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
    name: "Add to pack",
    description: Option.some(`Add ${Object.keys(additions).length} extension(s) to ${args.pack}`),
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

const addConfig = {
  pack: Argument.string("pack").pipe(Argument.withDescription("Name of the pack")),
  extension: Argument.string("extension").pipe(
    Argument.withDescription("Extension name or glob pattern"),
  ),
  yes: yesFlag.pipe(Flag.withDescription("Add without confirmation")),
  force: forceFlag.pipe(Flag.withDescription("Add even if the extension is already in the pack")),
  preview: previewFlag.pipe(
    Flag.withDescription("Show what would change in the manifest without modifying it"),
  ),
} as const;

export const addCommand = Command.make(
  "add",
  addConfig,
  ({ pack, extension, yes, force, preview }) =>
    withRuntime(
      withWorkspace(
        DEFAULT_WORKSPACE_SCOPE,
        handlePacksAdd({ pack, extension, yes, force, preview }),
      ),
      { command: "packs add" },
    ),
).pipe(
  withArgvTracking(addConfig),
  Command.withDescription("Add an extension to a pack manifest"),
  Command.withExamples([
    {
      command: "axm packs add frontend-tools @acme/skills/code-review",
      description: "Bundle a skill into your pack",
    },
    {
      command: 'axm packs add my-pack "effect-*"',
      description: "Add multiple extensions by pattern",
    },
    {
      command: "",
      description: "See also: packs remove, packs publish",
    },
  ]),
);
