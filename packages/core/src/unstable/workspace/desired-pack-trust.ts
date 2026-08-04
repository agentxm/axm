import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { trustRecordKey, type WorkspaceTrustState } from "../trust/index.js";
import { observeCanonicalExtension } from "./canonical-observation.js";
import type { DesiredStateGraph, DesiredStateProblem } from "./desired-state-graph.js";
import { isDesiredExtensionActive } from "./desired-state-enabled.js";

interface ValidateDesiredPackTrustArgs {
  readonly baseDir: string;
  readonly graph: DesiredStateGraph;
  readonly trust: WorkspaceTrustState;
}

const normalizedPackIdentity = (identity: string): string =>
  identity.startsWith("workspace:") ? identity.slice("workspace:".length) : identity;

const isPackProblem = (
  problem: DesiredStateProblem,
): problem is Extract<DesiredStateProblem, { readonly pack: string }> =>
  problem.type.startsWith("pack-");

const withoutUntrustedPackOrigins = (
  graph: DesiredStateGraph,
  invalidPacks: ReadonlySet<string>,
): DesiredStateGraph["nodes"] =>
  graph.nodes.flatMap((node) => {
    if (node.type === "pack") return [node];
    const origins = node.origins.filter(
      (origin) => origin.type !== "pack" || !invalidPacks.has(normalizedPackIdentity(origin.pack)),
    );
    if (origins.length === 0) return [];
    const settingsOrigin = origins.find((origin) => origin.type === "settings");
    const packOrigin = origins.find((origin) => origin.type === "pack");
    const constraints = origins.flatMap((origin) =>
      origin.constraint === undefined ? [] : [origin.constraint],
    );
    return [
      {
        ...node,
        source:
          settingsOrigin?.source ??
          (packOrigin === undefined
            ? node.source
            : `${packOrigin.source}@${packOrigin.constraint}`),
        enabled: isDesiredExtensionActive(origins),
        constraints,
        origins,
      },
    ];
  });

/**
 * Prevent configured pack manifests from contributing desired leaf nodes until
 * their source identity and canonical content match an authoritative trust
 * baseline. The graph remains useful for diagnostics, but `complete: false`
 * makes destructive callers fail closed.
 */
export const validateDesiredPackTrust = ({
  baseDir,
  graph,
  trust,
}: ValidateDesiredPackTrustArgs): Effect.Effect<
  DesiredStateGraph,
  never,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const problems: DesiredStateProblem[] = [];
    const invalidPacks = new Set(
      graph.problems.flatMap((problem) =>
        isPackProblem(problem) ? [normalizedPackIdentity(problem.pack)] : [],
      ),
    );
    for (const node of graph.nodes) {
      if (node.type !== "pack" || !node.enabled) continue;
      const record = trust.records[trustRecordKey("pack", node.name)];
      if (
        record === undefined ||
        record.sourceIdentity !== node.identity ||
        record.contentIdentity === undefined
      ) {
        problems.push({
          type: "pack-trust-unavailable",
          pack: node.identity,
          detail: "The configured pack has no matching source and content-identity trust baseline.",
        });
        invalidPacks.add(normalizedPackIdentity(node.identity));
        continue;
      }

      const observation = yield* observeCanonicalExtension({
        baseDir,
        desired: node,
        trust: record,
      });
      if (observation.status !== "usable") {
        problems.push({
          type: "pack-canonical-unusable",
          pack: node.identity,
          ...(observation.path === undefined ? {} : { path: observation.path }),
          status: observation.status,
        });
        invalidPacks.add(normalizedPackIdentity(node.identity));
      }
    }

    return {
      ...graph,
      complete: graph.complete && problems.length === 0,
      nodes: withoutUntrustedPackOrigins(graph, invalidPacks),
      problems: [...graph.problems, ...problems],
    };
  });
