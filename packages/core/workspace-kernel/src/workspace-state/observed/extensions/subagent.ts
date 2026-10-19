/**
 * Subagent subject: the canonical subject over `settings.subagents`,
 * `axm.lock` `subagents`, the canonical-extensions scanner, and the agent-dir
 * scanner over subagent-rendering agents.
 *
 * Single-file subagent surfaces (e.g., `roo`'s `.roomodes`) emit one
 * occurrence per file path; the file itself is the materialization.
 */

import * as Effect from "effect/Effect";
import type { MaterializationTargetId } from "@agentxm/extension-model/unstable/agents/types";
import type { AgentDirOccurrence } from "../scanners/types.js";
import { filterMapOccurrences } from "./actual-helpers.js";
import {
  canonicalActuals,
  makeCanonicalSubjectApi,
  type ActualExtension,
  type CanonicalOrigin,
  type CanonicalSubjectApi,
  type CanonicalSubjectDeps,
  type InstalledExtension,
} from "./canonical-subject.js";

export type ActualSubagent = ActualExtension<
  "subagent",
  | CanonicalOrigin<"subagent">
  | { readonly _tag: "agent-subagent-dir"; readonly agentId: MaterializationTargetId }
>;
export type InstalledSubagent = InstalledExtension<"subagent", ActualSubagent>;
export type SubagentExtensionsApi = CanonicalSubjectApi<"subagent", ActualSubagent>;

export interface SubagentExtensionsApiDeps extends CanonicalSubjectDeps {
  readonly scanners: CanonicalSubjectDeps["scanners"] & {
    readonly agentDir: Effect.Effect<ReadonlyArray<AgentDirOccurrence>>;
  };
}

export const makeSubagentExtensionsApi = ({
  scope,
  loaders,
  scanners,
}: SubagentExtensionsApiDeps): Effect.Effect<SubagentExtensionsApi> =>
  makeCanonicalSubjectApi("subagent", {
    scope,
    loaders,
    actual: Effect.zipWith(
      canonicalActuals("subagent", scope, scanners.canonical),
      scanners.agentDir,
      (canonical, agentDir): ReadonlyArray<ActualSubagent> => [
        ...canonical,
        // A native file carries no provenance: it belongs to the package of its name.
        ...filterMapOccurrences(agentDir, "subagent", (occurrence): ActualSubagent => ({
          key: { scope, type: "subagent", name: occurrence.name },
          origin: { _tag: "agent-subagent-dir", agentId: occurrence.agentId },
          contentRoot: occurrence.contentLocation,
          packageRoot: null,
        })),
      ],
    ),
  });
