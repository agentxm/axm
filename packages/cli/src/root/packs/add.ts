import * as crypto from "node:crypto";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { Argument, Command, Flag } from "effect/unstable/cli";
import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import {
  formatFqn,
  normalizeHandle,
  parseRegistrySourcePatternParts,
  decodeExtensionNameSync,
} from "@agentxm/client-core/unstable/extensions";
import { PACK_MANIFEST_FILENAME, PackManifestSchema } from "@agentxm/client-core/unstable/packs";
import type { AddToPackOperation } from "@agentxm/client-core/unstable/packs";
import { addToPack } from "@agentxm/client-core/unstable/packs";
import { computePackPaths } from "@agentxm/client-core/unstable/packs";
import { expandGlobs, isGlobPattern } from "@agentxm/client-core/unstable/utils";
import { CliRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import type { JobStepResult, Plan, PlannedJobStep } from "@agentxm/client-core/unstable/plan";
import { previewOrApplyPlan } from "@agentxm/client-core/unstable/plan";
import { forceFlag, previewFlag, yesFlag } from "@agentxm/client-core/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { DEFAULT_WORKSPACE_SCOPE } from "@agentxm/client-core/unstable/workspace";
import { emitNoOpResult, emitPlanResolutionResult } from "../../json-output.js";
import { withRuntime, withWorkspace } from "../../runtime.js";

export interface PacksAddHandlerArgs {
  readonly pack: string;
  readonly extension: string;
  readonly yes: boolean;
  readonly force: boolean;
  readonly preview: boolean;
}

const hashContent = (content: string) => crypto.createHash("sha256").update(content).digest("hex");

/**
 * Derive a caret version range from a resolved version.
 * e.g., "1.2.3" -> "^1.2.3"
 */
const toVersionRange = (version: string): string => `^${version}`;

export const handlePacksAdd = Effect.fn("PacksAdd.handle")(function* (args: PacksAddHandlerArgs) {
  const ws = yield* WorkspaceMutations;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const renderer = yield* CliRenderer;

  yield* renderer.info("axm packs add");

  // Step 1: Find the pack
  const configuredPacks = yield* ws.records.getConfiguredPacks();
  const packEntry = configuredPacks[args.pack];

  if (packEntry === undefined) {
    return yield* makeAppError({
      code: "not_found",
      message: `Pack '${args.pack}' not found`,
      breadcrumbs: [
        {
          task: "Recover",
          description: "Run `axm packs new <name>` to create a pack first",
        },
      ],
    });
  }

  // Resolve pack owner from the entry (format: "@owner/packs/name" or { source: "@owner/packs/name" })
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
                    message: `Pack "${args.pack}" has a non-registry source and no workspace owner is configured`,
                    breadcrumbs: [
                      {
                        task: "Recover",
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
        message: `Pack manifest not found at ${manifestPath}`,
        breadcrumbs: [{ task: "Recover", description: "Ensure the pack exists on disk" }],
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
        message: `Failed to parse pack manifest: ${manifestPath}`,
        cause: e,
      }),
  });

  const manifest = yield* Schema.decodeUnknownEffect(PackManifestSchema)(json).pipe(
    Effect.mapError((e) =>
      makeAppError({
        code: "validation",
        message: `Invalid pack manifest: ${manifestPath}`,
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
        code: "internal",
        message: `No managed, registry-sourced extensions match '${args.extension}'`,
        breadcrumbs: [
          { task: "Recover", description: "Check installed extensions with `axm skills list`" },
        ],
      });
    }

    // Check if extension exists but is not registry-sourced
    if (args.extension in lockedSkills) {
      return yield* makeAppError({
        code: "internal",
        message: `Extension '${args.extension}' is not a managed, registry-sourced extension`,
        breadcrumbs: [
          {
            task: "Recover",
            description: "Only managed, registry-sourced extensions can be added to packs",
          },
        ],
      });
    }

    return yield* makeAppError({
      code: "not_found",
      message: `Extension '${args.extension}' not found in workspace`,
      breadcrumbs: [
        { task: "Recover", description: "Install the extension first with `axm skills install`" },
      ],
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

    const fqn = formatFqn({
      owner: lockEntry.owner,
      type: "skill",
      name: decodeExtensionNameSync(lockEntry.name),
    });
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
    if (
      yield* emitNoOpResult("packs.add", {
        planName: "Add to pack",
        planDescription: `Add extension(s) to ${args.pack}`,
        message: "Nothing to do.",
      })
    ) {
      return;
    }

    yield* renderer.success("Nothing to do.");
    return;
  }

  // Step 5: Build operation with precomputed delta and manifest hash
  const op = {
    name: "add-to-pack",
    args: {
      packName: args.pack,
      packOwner,
      additions,
      manifestHash,
    },
  } satisfies AddToPackOperation;

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

  const resolution = yield* previewOrApplyPlan(plan, {
    yes: args.yes,
    force: args.force,
    preview: args.preview,
  });
  yield* emitPlanResolutionResult("packs.add", resolution);

  yield* renderer.success("Done");
});

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
    handlePacksAdd({ pack, extension, yes, force, preview }).pipe(
      withWorkspace(DEFAULT_WORKSPACE_SCOPE),
      withRuntime("packs add"),
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
  ]),
);
