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
  parseExtensionFqnParts,
  parseRegistrySourcePatternParts,
  decodeExtensionNameSync,
  type ExtensionName,
  type Handle,
} from "@agentxm/client-core/unstable/extensions";
import {
  isCatalogExtensionType,
  type CatalogExtensionType,
} from "@agentxm/client-core/unstable/extension-types";
import {
  PACK_MANIFEST_FILENAME,
  PackManifestSchema,
  packManifestPath,
} from "@agentxm/client-core/unstable/packs";
import type { AddToPackOperation } from "@agentxm/client-core/unstable/packs";
import { addToPack } from "@agentxm/client-core/unstable/packs";
import { computePackPaths } from "@agentxm/client-core/unstable/packs";
import { expandGlobs, isGlobPattern } from "@agentxm/client-core/unstable/utils";
import { CliRenderer, count } from "@agentxm/client-core/unstable/cli-renderer";
import { WorkspaceMutations, configuredRowsByName } from "@agentxm/client-core/unstable/workspace";
import { trustRecordKey } from "@agentxm/client-core/unstable/trust";
import type { Plan, PlannedJobStep } from "@agentxm/client-core/unstable/plan";
import { previewOrApplyPlan } from "@agentxm/client-core/unstable/plan";
import {
  replaceExistingFlag,
  previewFlag,
  Verbosity,
  yesFlag,
} from "@agentxm/client-core/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { DEFAULT_WORKSPACE_SCOPE } from "@agentxm/client-core/unstable/workspace";
import { isWorkspaceSourceLocator } from "@agentxm/client-core/unstable/sources";
import { emitPlanResolutionResult } from "../../json-output.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { emitNoOpOutcome } from "../shared/no-op-output.js";

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

/** Every type a pack can depend on — packs cannot nest. */
type PackAddExtensionType = CatalogExtensionType;

/** A versioned installed extension eligible to become a pack dependency. */
interface PackAddCandidate {
  readonly type: PackAddExtensionType;
  /** Workspace projection name. */
  readonly name: string;
  readonly owner: Handle;
  /** Published package name, which may differ from the workspace name. */
  readonly packageName: ExtensionName;
  readonly fqn: string;
  readonly versionRange: string;
}

export const handlePacksAdd = Effect.fn("PacksAdd.handle")(function* (args: PacksAddHandlerArgs) {
  const ws = yield* WorkspaceMutations;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  // Step 1: Find the pack
  const configuredPacks = yield* ws.records.rows("pack").pipe(Effect.map(configuredRowsByName));
  const packEntry = configuredPacks[args.pack];

  if (packEntry === undefined) {
    return yield* makeAppError({
      code: "not_found",
      detail: `Pack '${args.pack}' not found`,
      suggestions: [
        {
          description: "Create a pack first",
          cmd: "axm packs new <name>",
        },
      ],
    });
  }

  // Resolve pack owner from the entry (format: "@owner/packs/name" or { source: "@owner/packs/name" })
  const packSource = typeof packEntry === "string" ? packEntry : packEntry.source;
  if (!isWorkspaceSourceLocator(packSource)) {
    return yield* makeAppError({
      code: "conflict",
      detail: `Cannot edit non-workspace pack "${args.pack}"`,
      recover: "Adopt or copy the pack into workspace authorship before editing its manifest.",
    });
  }
  const packOwnerFromSource = parseRegistrySourcePatternParts(
    packSource.slice("workspace:".length),
  )?.owner;
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
                          "Set `owner` in `.axm/settings.json` before modifying this pack.",
                        cmd: "axm setup",
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

  // Step 3: Resolve versioned managed extensions of every non-pack type from
  // desired intent and authoritative trust. Receipt history is not consulted.
  const graph = yield* ws.getDesiredStateGraph();
  const packFqn = formatFqn({
    owner: packOwner,
    type: "pack",
    name: decodeExtensionNameSync(args.pack),
  });
  const targetPackProblems = graph.problems.filter(
    (problem) =>
      "pack" in problem && (problem.pack === packFqn || problem.pack === `workspace:${packFqn}`),
  );
  if (targetPackProblems.length > 0) {
    return yield* makeAppError({
      code: "conflict",
      detail: `Cannot add dependencies while pack ${packFqn} is invalid.`,
      recover: "Inspect the pack drift, then explicitly accept or restore the current content.",
      suggestions: [
        {
          description: "Preview pack repair",
          cmd: `axm packs repair ${packFqn} --preview`,
        },
      ],
    });
  }
  const installedNames = new Set(
    graph.nodes.filter((node) => node.type !== "pack").map((node) => node.name),
  );
  const trust = yield* ws.getTrustState();
  const candidates: Array<PackAddCandidate> = [];
  for (const node of graph.nodes) {
    if (!isCatalogExtensionType(node.type)) continue;
    const record = trust.records[trustRecordKey(node.type, node.name)];
    if (
      record === undefined ||
      (record.authority !== "registry" && record.authority !== "workspace") ||
      record.resolvedVersion === undefined
    ) {
      continue;
    }
    const trustedIdentity = record.sourceIdentity.startsWith("workspace:")
      ? record.sourceIdentity.slice("workspace:".length)
      : record.sourceIdentity;
    const parsed = parseExtensionFqnParts(trustedIdentity);
    if (parsed === undefined || parsed.type !== node.type) continue;
    const desiredIdentity = node.identity.startsWith("workspace:")
      ? node.identity.slice("workspace:".length)
      : node.identity;
    if (desiredIdentity !== trustedIdentity) continue;
    const packageName = decodeExtensionNameSync(parsed.name);
    candidates.push({
      type: node.type,
      name: node.name,
      owner: parsed.owner,
      packageName,
      fqn: formatFqn({ owner: parsed.owner, type: node.type, name: packageName }),
      versionRange: toVersionRange(record.resolvedVersion),
    });
  }

  const requestedFqn = parseExtensionFqnParts(args.extension);
  const isGlob = isGlobPattern(args.extension);
  const globMatches = isGlob
    ? expandGlobs([args.extension], [...new Set(candidates.map((candidate) => candidate.name))])
    : [];
  const matched = isGlob
    ? candidates.filter((candidate) => globMatches.includes(candidate.name))
    : requestedFqn !== undefined
      ? candidates.filter(
          (candidate) =>
            candidate.type === requestedFqn.type &&
            candidate.owner === requestedFqn.owner &&
            candidate.packageName === requestedFqn.name,
        )
      : candidates.filter((candidate) => candidate.name === args.extension);

  // A bare name that exists under more than one type is ambiguous: adding the
  // wrong one would silently pin an extension the user did not mean.
  if (!isGlob && requestedFqn === undefined) {
    const matchedTypes = [...new Set(matched.map((candidate) => candidate.type))];
    if (matchedTypes.length > 1) {
      return yield* makeAppError({
        code: "validation",
        detail: `Extension '${args.extension}' is installed as ${matchedTypes.join(", ")}`,
        recover: "Pass the fully qualified name to choose one.",
        suggestions: matched.map((candidate) => ({
          description: `Add the ${candidate.type}`,
          cmd: `axm packs add ${args.pack} ${candidate.fqn}`,
        })),
      });
    }
  }

  if (matched.length === 0) {
    if (isGlob) {
      return yield* makeAppError({
        code: "internal",
        detail: `No managed, versioned extensions match '${args.extension}'`,
        suggestions: [{ description: "Inspect installed extensions", cmd: "axm packs list" }],
      });
    }

    if (installedNames.has(args.extension)) {
      return yield* makeAppError({
        code: "internal",
        detail: `Extension '${args.extension}' is not a managed, versioned extension`,
        suggestions: [
          {
            description: "Only managed registry or workspace extensions can be added to packs",
          },
        ],
      });
    }

    return yield* makeAppError({
      code: "not_found",
      detail: `Extension '${args.extension}' not found in workspace`,
      suggestions: [
        {
          description: "Install the extension first",
          cmd: "axm install <source>",
        },
      ],
    });
  }

  // Step 4: Compute manifest delta (additions)
  const currentDependencies = manifest.dependencies;
  const additions: Record<string, string> = {};

  for (const candidate of matched) {
    // Already in the pack — adding again would be a no-op rewrite.
    if (candidate.fqn in currentDependencies) {
      continue;
    }
    additions[candidate.fqn] = candidate.versionRange;
  }

  if (Object.keys(additions).length === 0) {
    yield* emitNoOpOutcome("packs.add", {
      planName: "Add to pack",
      planDescription: `Add extensions to ${args.pack}`,
      message: "No extensions added to pack.",
    });
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
    run: provideServices(addToPack(op)),
  };

  const plan: Plan = {
    _tag: "Plan",
    name: "Add to pack",
    description: Option.some(
      `Add ${count(Object.keys(additions).length, "extension")} to ${args.pack}`,
    ),
    jobs: [{ concurrency: 1 as const, steps: [step] }],
  };

  const resolution = yield* previewOrApplyPlan(plan, {
    yes: args.yes,
    preview: args.preview,
    displayApplied: false,
  });
  const suggestions = [
    { description: "Inspect installed packs", cmd: "axm packs list" },
    {
      description: "Remove from pack",
      cmd: `axm packs remove ${args.pack} ${args.extension}`,
    },
  ];
  const summary = `-> ${packManifestPath(packOwner, args.pack)}   1 file`;
  const emitted = yield* emitPlanResolutionResult(
    "packs.add",
    resolution,
    resolution._tag === "ExecutedPlan" ? { summary, suggestions } : undefined,
  );

  if (resolution._tag === "ExecutedPlan") {
    const renderer = yield* CliRenderer;
    const verbosity = yield* Verbosity;
    yield* renderer.success(
      `Added ${count(Object.keys(additions).length, "extension")} to pack ${args.pack}`,
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

const addConfig = {
  pack: Argument.string("pack").pipe(Argument.withDescription("Name of the pack")),
  extension: Argument.string("extension").pipe(
    Argument.withDescription("Extension name or glob pattern"),
  ),
  yes: yesFlag.pipe(Flag.withDescription("Add without confirmation")),
  force: replaceExistingFlag,
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
  Command.withDescription("Add an extension to a project-workspace pack manifest"),
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
