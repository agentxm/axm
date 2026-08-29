import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as semver from "semver";
import { parseExtensionFqnParts } from "../extensions/index.js";
import type { Lockfile } from "../lockfile/schema.js";
import {
  computePackManifestContentIdentity,
  PACK_MANIFEST_FILENAME,
  PackManifestSchema,
} from "../packs/index.js";
import { computePackPathsForLayout } from "../packs/paths.js";
import {
  isInlineDesiredExtension,
  type DesiredStateGraph,
  type DesiredStateProblem,
} from "./desired-state-graph.js";
import { isDesiredExtensionActive } from "./desired-state-enabled.js";
import type { WorkspaceLayout } from "./layout.js";

interface ValidateDesiredPackLockArgs {
  readonly graph: DesiredStateGraph;
  readonly lockfile: Lockfile;
  readonly layout: WorkspaceLayout;
}

const normalizedPackIdentity = (identity: string): string =>
  identity.startsWith("workspace:") ? identity.slice("workspace:".length) : identity;

const isPackProblem = (
  problem: DesiredStateProblem,
): problem is Extract<DesiredStateProblem, { readonly pack: string }> =>
  problem.type.startsWith("pack-");

const withoutInvalidPackOrigins = (
  graph: DesiredStateGraph,
  invalidPacks: ReadonlySet<string>,
): DesiredStateGraph["nodes"] =>
  graph.nodes.flatMap((node): ReadonlyArray<DesiredStateGraph["nodes"][number]> => {
    if (isInlineDesiredExtension(node)) return [node];
    if (node.type === "pack") return [node];
    const origins = node.origins.filter(
      (origin) => origin.type !== "pack" || !invalidPacks.has(normalizedPackIdentity(origin.pack)),
    );
    if (origins.length === 0) return [];
    const settingsOrigin = origins.find((origin) => origin.type === "settings");
    const packOrigin = origins.find((origin) => origin.type === "pack");
    const constraints = origins.flatMap((origin) =>
      origin.type === "settings" && origin.authority === "inline"
        ? []
        : origin.constraint === undefined
          ? []
          : [origin.constraint],
    );
    if (settingsOrigin?.type === "settings" && settingsOrigin.authority === "inline") {
      return [{ ...node, enabled: isDesiredExtensionActive(origins), constraints, origins }];
    }
    return [
      {
        ...node,
        source:
          (settingsOrigin !== undefined && "source" in settingsOrigin
            ? settingsOrigin.source
            : undefined) ??
          (packOrigin === undefined
            ? node.source
            : `${packOrigin.source}@${packOrigin.constraint}`),
        enabled: isDesiredExtensionActive(origins),
        constraints,
        origins,
      },
    ];
  });

const decodeManifest = Schema.decodeUnknownSync(PackManifestSchema, {
  onExcessProperty: "error",
});

/**
 * Authorize enabled external Pack manifests against their accepted lock row.
 * Workspace-authored Pack manifests are desired authority and need no lock row.
 */
export const validateDesiredPackLock = ({
  graph,
  lockfile,
  layout,
}: ValidateDesiredPackLockArgs): Effect.Effect<
  DesiredStateGraph,
  never,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const problems: DesiredStateProblem[] = [];
    const invalidPacks = new Set(
      graph.problems.flatMap((problem) =>
        isPackProblem(problem) ? [normalizedPackIdentity(problem.pack)] : [],
      ),
    );

    for (const node of graph.nodes) {
      if (node.type !== "pack" || !node.enabled || node.identity.startsWith("workspace:")) {
        continue;
      }

      const identity = parseExtensionFqnParts(node.identity);
      const entry = lockfile.packs?.[node.name];
      const configuredSourceName = node.source.startsWith("@")
        ? "agentxm"
        : node.source.slice(0, node.source.indexOf(":"));
      if (
        identity === undefined ||
        identity.type !== "pack" ||
        entry === undefined ||
        entry.sourceName !== configuredSourceName ||
        entry.owner !== identity.owner ||
        entry.name !== identity.name ||
        !node.constraints.every((constraint) => semver.satisfies(entry.resolvedVersion, constraint))
      ) {
        problems.push({
          type: "pack-resolution-unavailable",
          pack: node.identity,
          detail: "The configured external Pack has no matching accepted resolution.",
        });
        invalidPacks.add(normalizedPackIdentity(node.identity));
        continue;
      }

      const manifestPath = path.join(
        computePackPathsForLayout(
          path.join,
          layout,
          entry.sourceName,
          identity.owner,
          identity.name,
        ).canonicalPath,
        PACK_MANIFEST_FILENAME,
      );
      const readResult = yield* Effect.result(fs.readFileString(manifestPath));
      if (Result.isFailure(readResult)) {
        problems.push({
          type: "pack-manifest-content-mismatch",
          pack: node.identity,
          path: manifestPath,
          status: "missing",
          acceptedVersion: entry.resolvedVersion,
          acceptedContentIdentity: entry.manifestContentIdentity,
        });
        invalidPacks.add(normalizedPackIdentity(node.identity));
        continue;
      }

      const decoded = Result.try({
        try: () => decodeManifest(JSON.parse(readResult.success)),
        catch: () => undefined,
      });
      const observedManifest =
        Result.isSuccess(decoded) && decoded.success !== undefined ? decoded.success : undefined;
      const observedContentIdentity =
        observedManifest === undefined
          ? undefined
          : computePackManifestContentIdentity(observedManifest);
      if (
        observedManifest === undefined ||
        observedContentIdentity !== entry.manifestContentIdentity
      ) {
        problems.push({
          type: "pack-manifest-content-mismatch",
          pack: node.identity,
          path: manifestPath,
          status: "changed",
          acceptedVersion: entry.resolvedVersion,
          acceptedContentIdentity: entry.manifestContentIdentity,
          ...(observedManifest === undefined || observedContentIdentity === undefined
            ? {}
            : {
                observedVersion: observedManifest.version,
                observedContentIdentity,
              }),
        });
        invalidPacks.add(normalizedPackIdentity(node.identity));
      }
    }

    return {
      ...graph,
      complete: graph.complete && problems.length === 0,
      nodes: withoutInvalidPackOrigins(graph, invalidPacks),
      problems: [...graph.problems, ...problems],
    };
  });
