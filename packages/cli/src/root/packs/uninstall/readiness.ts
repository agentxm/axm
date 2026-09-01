import { planDesiredStateGraph } from "@agentxm/extension-workspace";
import type { DesiredStateGraph, DesiredStateProblem } from "@agentxm/workspace-state";
import type { WorkspaceScope } from "@agentxm/extension-model/unstable/workspace-scope";
import {
  workspaceCanonicalRoot,
  workspaceLockfilePath,
  workspaceSettingsPath,
} from "../../shared/workspace-display-paths.js";

/** Recovery-conformance identity for Pack uninstall planning on an incomplete graph. */
export const PACK_UNINSTALL_GRAPH_BLOCKER_ID =
  "packs/uninstall/desired-state-graph-complete" as const;

/** Executable Pack-uninstall blocker identities covered by recovery conformance. */
export const packUninstallRecoveryIdentifiers = [PACK_UNINSTALL_GRAPH_BLOCKER_ID] as const;

export interface PackUninstallGraphBlockerFact {
  readonly problemType: DesiredStateProblem["type"] | "unknown";
  readonly packs: ReadonlyArray<string>;
  readonly member?: { readonly type: string; readonly name: string };
  readonly authoritativeLocations: ReadonlyArray<string>;
  readonly detail: string;
}

export type PackUninstallGraphReadiness =
  | { readonly readiness: "ready"; readonly graph: DesiredStateGraph }
  | {
      readonly readiness: "blocked";
      readonly id: typeof PACK_UNINSTALL_GRAPH_BLOCKER_ID;
      readonly facts: ReadonlyArray<PackUninstallGraphBlockerFact>;
      readonly detail: string;
    };

const normalizedPack = (identity: string): string =>
  identity.startsWith("workspace:") ? identity.slice("workspace:".length) : identity;

const locationsFor = (
  problem: DesiredStateProblem,
  scope: WorkspaceScope,
): ReadonlyArray<string> => {
  if ("path" in problem && problem.path !== undefined) return [problem.path];
  if ("pack" in problem) return [workspaceSettingsPath(scope), workspaceLockfilePath(scope)];
  return [workspaceSettingsPath(scope), `${workspaceCanonicalRoot(scope)}/*/packs/*/pack.json`];
};

const factFor = (
  problem: DesiredStateProblem,
  selectedPacks: ReadonlyArray<string>,
  scope: WorkspaceScope,
): PackUninstallGraphBlockerFact => {
  const packs =
    "pack" in problem ? [normalizedPack(problem.pack)] : selectedPacks.map(normalizedPack);
  const authoritativeLocations = locationsFor(problem, scope);
  const member =
    "extensionType" in problem ? { type: problem.extensionType, name: problem.name } : undefined;
  const subject =
    member === undefined ? `Pack ${packs.join(", ")}` : `${member.type} member ${member.name}`;
  const problemDetail =
    "detail" in problem
      ? problem.detail
      : "constraints" in problem
        ? `constraints ${problem.constraints.join(", ")}`
        : "identities" in problem
          ? `identities ${problem.identities.join(", ")}`
          : problem.type;
  return {
    problemType: problem.type,
    packs,
    ...(member === undefined ? {} : { member }),
    authoritativeLocations,
    detail: `${subject}: ${problem.type} (${problemDetail}); authoritative location${authoritativeLocations.length === 1 ? "" : "s"}: ${authoritativeLocations.join(", ")}`,
  };
};

/** Build the Pack-uninstall readiness decision from the shared desired-state planner. */
export const planPackUninstallGraphReadiness = (
  graph: DesiredStateGraph,
  selectedPacks: ReadonlyArray<string>,
  scope: WorkspaceScope,
): PackUninstallGraphReadiness => {
  const decision = planDesiredStateGraph(graph);
  if (decision.readiness === "ready") return decision;
  const facts =
    decision.problems.length === 0
      ? [
          {
            problemType: "unknown" as const,
            packs: selectedPacks.map(normalizedPack),
            authoritativeLocations: [workspaceSettingsPath(scope), workspaceLockfilePath(scope)],
            detail: `Pack ${selectedPacks.map(normalizedPack).join(", ")}: desired-state graph is incomplete; authoritative locations: ${workspaceSettingsPath(scope)}, ${workspaceLockfilePath(scope)}`,
          },
        ]
      : decision.problems.map((problem) => factFor(problem, selectedPacks, scope));
  return {
    readiness: "blocked",
    id: PACK_UNINSTALL_GRAPH_BLOCKER_ID,
    facts,
    detail: `Cannot uninstall Pack graph because desired state is incomplete: ${facts.map((fact) => fact.detail).join("; ")}`,
  };
};
