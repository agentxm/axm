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
import {
  PACK_MANIFEST_FILENAME,
  PackManifestSchema,
  packManifestPath,
} from "@agentxm/client-core/unstable/packs";
import { computePackPaths } from "@agentxm/client-core/unstable/packs";
import { expandGlobs, isGlobPattern } from "@agentxm/client-core/unstable/utils";
import { CliRenderer, count } from "@agentxm/client-core/unstable/cli-renderer";
import { WorkspaceMutations, configuredRowsByName } from "@agentxm/client-core/unstable/workspace";
import type { Plan, PlannedJobStep } from "@agentxm/client-core/unstable/plan";
import { previewFlag, Verbosity, yesFlag } from "@agentxm/client-core/unstable/cli-flags";
import {
  publicRecoveryValue,
  recoveryPositional,
  withArgvTracking,
} from "@agentxm/client-core/unstable/cli-runtime";
import { DEFAULT_WORKSPACE_SCOPE } from "@agentxm/client-core/unstable/workspace";
import { isWorkspaceSourceLocator } from "@agentxm/client-core/unstable/sources";
import { emitPlanResolutionResult } from "../../json-output.js";
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

export const handlePacksRemove = Effect.fn("PacksRemove.handle")(function* (
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
  if (!isWorkspaceSourceLocator(packSource)) {
    return yield* makeAppError({
      code: "conflict",
      detail: `Cannot edit non-workspace pack "${packName}"`,
      recover: "Adopt or copy the pack into workspace authorship before editing its manifest.",
    });
  }
  const packOwnerFromSource = parseRegistrySourcePatternParts(
    packSource.slice("workspace:".length),
  )?.owner;
  const packOwner =
    packOwnerFromSource !== undefined
      ? normalizeHandle(packOwnerFromSource)
      : yield* Option.match(configuredOwner, {
          onNone: () =>
            Effect.fail(
              makeAppError({
                code: "internal",
                detail: `Pack "${packName}" has a non-registry source and no workspace owner is configured`,
                suggestions: [
                  {
                    description: "Set `owner` in `.axm/settings.json` before modifying this pack.",
                    cmd: "axm setup",
                  },
                ],
              }),
            ),
          onSome: Effect.succeed,
        });
  const base = ws.baseDir;

  // Step 2: Read pack manifest and compute hash for stale-check
  const packDir = computePackPaths(path.join, base, packOwner, packName);
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
    jobs: [{ concurrency: 1 as const, steps: [step] }],
  };

  const resolution = yield* previewOrApplyLocalPlan(plan, {
    preview: args.preview,
    yes: args.yes,
    displayApplied: false,
    recovery: makeConfirmationRecovery(
      ["packs", "remove"],
      [
        recoveryPositional(publicRecoveryValue(args.pack)),
        recoveryPositional(publicRecoveryValue(args.extension)),
      ],
    ),
  });
  const suggestions = [
    { description: "Inspect installed packs", cmd: "axm packs list" },
    {
      description: "Add to pack",
      cmd: `axm packs add ${packName} <extension>`,
    },
  ];
  const summary = `-> ${packManifestPath(packOwner, packName)}   1 file`;
  const emitted = yield* emitPlanResolutionResult(
    "packs.remove",
    resolution,
    resolution._tag === "ExecutedPlan" ? { summary, suggestions } : undefined,
  );

  if (resolution._tag === "ExecutedPlan") {
    const renderer = yield* CliRenderer;
    const verbosity = yield* Verbosity;
    yield* renderer.success(
      `Removed ${count(matchedNames.length, "extension")} from pack ${packName}`,
      verbosity.level === "quiet"
        ? undefined
        : {
            summary,
            suggestions,
            withoutSuggestions: emitted,
          },
    );
  }
});

const removeConfig = {
  pack: Argument.string("pack").pipe(
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
