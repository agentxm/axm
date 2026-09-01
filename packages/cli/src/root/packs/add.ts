import * as crypto from "node:crypto";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { Argument, Command, Flag } from "effect/unstable/cli";
import { makeAppError } from "@agentxm/extension-management/unstable/app-error";
import {
  formatFqn,
  parseExtensionFqnParts,
  decodeExtensionNameSync,
  type ExtensionName,
  type Handle,
} from "@agentxm/extension-model/unstable/extensions";
import {
  isCatalogExtensionType,
  type CatalogExtensionType,
} from "@agentxm/extension-model/unstable/extension-types";
import {
  PACK_MANIFEST_FILENAME,
  PackManifestSchema,
} from "@agentxm/extension-model/unstable/packs/manifest-schema";
import type { AddToPackOperation } from "@agentxm/extension-management/unstable/packs";
import { addToPack } from "@agentxm/extension-management/unstable/packs";
import { expandGlobs, isGlobPattern } from "@agentxm/extension-management/unstable/utils";
import { count } from "@agentxm/extension-management/unstable/cli-renderer";
import {
  WorkspaceMutations,
  configuredRowsByName,
  resolveWorkspaceExtensionRef,
  usableAcceptedCanonical,
} from "@agentxm/workspace-state";
import type { Plan, PlannedJobStep } from "@agentxm/workspace-operations";
import { operationPresentation } from "@agentxm/workspace-operations";
import { previewOrApplyPlan } from "@agentxm/extension-management/unstable/plan";
import { previewFlag, yesFlag } from "@agentxm/extension-management/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/extension-management/unstable/cli-runtime";
import { publicRecoveryValue, recoveryPositional } from "@agentxm/workspace-operations";
import { DEFAULT_WORKSPACE_SCOPE } from "@agentxm/extension-model/unstable/workspace-scope";
import { isWorkspaceSourceLocator } from "@agentxm/extension-model/unstable/sources/workspace";
import { emitOperationResolution } from "../../operation-output.js";
import { withOperationLifecycle } from "../shared/operation-lifecycle.js";
import { workspaceAuthoredRoot, workspaceSettingsPath } from "../shared/workspace-display-paths.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { emitNoOpOutcome } from "../shared/no-op-output.js";
import { makeConfirmationRecovery, makePlanExecution } from "../shared/confirmation-recovery.js";
import { resolveConfiguredPackSelector } from "./configured-pack-selector.js";

export interface PacksAddHandlerArgs {
  readonly pack: string;
  readonly extension: string;
  readonly yes: boolean;
  readonly preview: boolean;
}

const hashContent = (content: string) => crypto.createHash("sha256").update(content).digest("hex");

/**
 * Derive a lower-bound version range from a resolved version.
 * e.g., "1.2.3" -> ">=1.2.3"
 *
 * A lower bound tracks the latest published member while recording the version
 * observed when the member was added. A caret would pin pre-1.0 members to their
 * current minor (`^0.4.2` stops before `0.5.0`), stranding every later release.
 */
const toVersionRange = (version: string): string => `>=${version}`;

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

export const handlePacksAdd = (args: PacksAddHandlerArgs) =>
  withOperationLifecycle(
    {
      command: "packs.add",
      mode: args.preview ? "preview" : "apply",
      planName: "Add to pack",
    },
    handlePacksAddBody(args),
  );

const handlePacksAddBody = Effect.fn("PacksAdd.handle")(function* (args: PacksAddHandlerArgs) {
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
    recovery: { command: "add", extension: args.extension },
  });
  const packName = selection.configuredName;
  const packEntry = selection.entry;

  // Resolve pack owner from the entry (format: "@owner/packs/name" or { source: "@owner/packs/name" })
  const packSource = packEntry.source;
  if (packSource === undefined) {
    return yield* makeAppError({ code: "validation", detail: `Pack "${packName}" has no source.` });
  }
  if (!isWorkspaceSourceLocator(packSource)) {
    return yield* makeAppError({
      code: "conflict",
      detail: `Cannot edit non-workspace pack "${packName}"`,
      recover: "Adopt or copy the pack into workspace authorship before editing its manifest.",
    });
  }
  const packOwner = yield* Option.match(configuredOwner, {
    onNone: () =>
      Effect.fail(
        makeAppError({
          code: "validation",
          detail: `Pack "${packName}" has a workspace source and no workspace owner is configured`,
          suggestions: [
            {
              description: `Set \`owner\` in \`${workspaceSettingsPath(ws.scope)}\` before modifying this pack.`,
              cmd: "axm setup",
            },
          ],
        }),
      ),
    onSome: Effect.succeed,
  });

  // Step 2: Read pack manifest and compute hash for stale-check
  const manifestPath = path.join(
    workspaceAuthoredRoot(path, ws, "pack", packOwner),
    packName,
    PACK_MANIFEST_FILENAME,
  );

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
  // desired intent and accepted external resolutions.
  const graph = yield* ws.getDesiredStateGraph();
  const packFqn = formatFqn({
    owner: packOwner,
    type: "pack",
    name: decodeExtensionNameSync(packName),
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
          description: "Preview workspace reconciliation",
          cmd: `axm sync ${packFqn} --preview`,
        },
      ],
    });
  }
  const installedNames = new Set(
    graph.nodes.filter((node) => node.type !== "pack").map((node) => node.name),
  );
  const candidates: Array<PackAddCandidate> = [];
  for (const node of graph.nodes) {
    if (!isCatalogExtensionType(node.type)) continue;
    if (node.source === undefined) continue;
    const ref = node.identity.startsWith("workspace:")
      ? yield* resolveWorkspaceExtensionRef({
          settingsName: node.name,
          source: node.source,
          expectedType: node.type,
          layout: ws.layout,
          scope: ws.scope,
        }).pipe(Effect.map(Option.some))
      : yield* usableAcceptedCanonical({
          workspace: ws,
          type: node.type,
          name: node.name,
        }).pipe(Effect.map(Option.map((canonical) => canonical.ref)));
    if (
      Option.isNone(ref) ||
      (ref.value.refType !== "registry" && ref.value.refType !== "workspace")
    )
      continue;
    const resolvedRef = ref.value;
    const acceptedIdentity = node.identity.startsWith("workspace:")
      ? node.identity.slice("workspace:".length)
      : node.identity;
    const parsed = parseExtensionFqnParts(acceptedIdentity);
    if (parsed === undefined || parsed.type !== node.type) continue;
    const packageName = decodeExtensionNameSync(parsed.name);
    candidates.push({
      type: node.type,
      name: node.name,
      owner: parsed.owner,
      packageName,
      fqn: formatFqn({ owner: parsed.owner, type: node.type, name: packageName }),
      versionRange: toVersionRange(resolvedRef.version),
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
          cmd: `axm packs add ${packName} ${candidate.fqn}`,
        })),
      });
    }
  }

  if (matched.length === 0) {
    if (isGlob) {
      return yield* makeAppError({
        code: "not_found",
        detail: `No managed, versioned extensions match '${args.extension}'`,
        suggestions: [{ description: "Inspect installed extensions", cmd: "axm packs list" }],
      });
    }

    if (installedNames.has(args.extension)) {
      return yield* makeAppError({
        code: "validation",
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
    const existing = currentDependencies[candidate.fqn];
    if (existing === candidate.versionRange) continue;
    additions[candidate.fqn] = candidate.versionRange;
  }

  if (Object.keys(additions).length === 0) {
    yield* emitNoOpOutcome("packs.add", {
      planName: "Add to pack",
      planDescription: `Add extensions to ${packName}`,
      message: "No extensions added to pack.",
    });
    return;
  }

  // Step 5: Build operation with precomputed delta and manifest hash
  const op = {
    name: "add-to-pack",
    args: {
      packName,
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
    label: packName,
    run: provideServices(addToPack(op)),
  };

  const plan: Plan = {
    _tag: "Plan",
    name: "Add to pack",
    description: Option.some(
      `Add ${count(Object.keys(additions).length, "extension")} to ${packName}`,
    ),
    presentation: operationPresentation(
      { imperative: "add", past: "Added", gerund: "Adding" },
      "pack",
    ),
    jobs: [{ concurrency: 1 as const, steps: [step] }],
  };

  const execution = yield* makePlanExecution(
    args,
    makeConfirmationRecovery(
      ["packs", "add"],
      [
        recoveryPositional(publicRecoveryValue(args.pack)),
        recoveryPositional(publicRecoveryValue(args.extension)),
      ],
    ),
  );
  const resolution = yield* previewOrApplyPlan(plan, { execution });
  yield* emitOperationResolution("packs.add", resolution, {
    suggestions: [
      { description: "Inspect installed packs", cmd: "axm packs list" },
      {
        description: "Remove from pack",
        cmd: `axm packs remove ${packName} ${args.extension}`,
      },
    ],
  });
});

const addConfig = {
  pack: Argument.string("name").pipe(
    Argument.withDescription("Configured pack name or unique configured pack FQN"),
  ),
  extension: Argument.string("extension").pipe(
    Argument.withDescription("Extension name or glob pattern"),
  ),
  yes: yesFlag.pipe(Flag.withDescription("Add without confirmation")),
  preview: previewFlag.pipe(
    Flag.withDescription("Show what would change in the manifest without modifying it"),
  ),
} as const;

export const addCommand = Command.make("add", addConfig, ({ pack, extension, yes, preview }) =>
  handlePacksAdd({ pack, extension, yes, preview }).pipe(
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
