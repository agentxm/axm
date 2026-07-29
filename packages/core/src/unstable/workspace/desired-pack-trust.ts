import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { trustRecordKey, type WorkspaceTrustState } from "../trust/index.js";
import { observeCanonicalExtension } from "./canonical-observation.js";
import type { DesiredStateGraph, DesiredStateProblem } from "./desired-state-graph.js";

interface ValidateDesiredPackTrustArgs {
  readonly baseDir: string;
  readonly graph: DesiredStateGraph;
  readonly trust: WorkspaceTrustState;
}

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
    for (const node of graph.nodes) {
      if (node.type !== "pack") continue;
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
      }
    }

    return {
      ...graph,
      complete: graph.complete && problems.length === 0,
      problems: [...graph.problems, ...problems],
    };
  });
