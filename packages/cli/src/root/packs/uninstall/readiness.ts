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

/** Why a selected Pack's own package could not be read. */
export type PackRetirementReason = "missing" | "invalid";

/**
 * A selected Pack whose own package manifest is unreadable. Its registration is
 * removable from positive evidence about the Pack itself; its content is not,
 * because nothing about that content can be verified.
 */
export interface PackRetirement {
  readonly pack: string;
  readonly manifestPath: string;
  readonly reason: PackRetirementReason;
}

export type PackUninstallGraphReadiness =
  | {
      readonly readiness: "ready";
      readonly graph: DesiredStateGraph;
      readonly retirements: ReadonlyArray<PackRetirement>;
    }
  | {
      readonly readiness: "blocked";
      readonly id: typeof PACK_UNINSTALL_GRAPH_BLOCKER_ID;
      readonly facts: ReadonlyArray<PackUninstallGraphBlockerFact>;
      readonly detail: string;
    };

const normalizedPack = (identity: string): string =>
  identity.startsWith("workspace:") ? identity.slice("workspace:".length) : identity;

/**
 * Problems the lock pass emits for a Pack as a consequence of its unreadable
 * manifest. They add no information the gate does not already have from the
 * primary problem, so they never block on their own account.
 */
const isCompanionProblem = (problem: DesiredStateProblem): boolean =>
  problem.type === "pack-manifest-content-mismatch" ||
  problem.type === "pack-resolution-unavailable";

/**
 * Classify the selected Packs' own problems into retirements, or report that
 * some selected Pack disagrees with the workspace in a way absence cannot
 * explain. Readable-but-disagreeing state is drift, and stays blocked.
 */
const retirementsFor = (
  problems: ReadonlyArray<DesiredStateProblem>,
): ReadonlyArray<PackRetirement> | undefined => {
  const problemsByPack = new Map<string, Array<DesiredStateProblem>>();
  for (const problem of problems) {
    if (!("pack" in problem)) return undefined;
    const pack = normalizedPack(problem.pack);
    const existing = problemsByPack.get(pack);
    if (existing === undefined) problemsByPack.set(pack, [problem]);
    else existing.push(problem);
  }

  const retirements: Array<PackRetirement> = [];
  for (const [pack, packProblems] of problemsByPack) {
    let unreadable: Omit<PackRetirement, "pack"> | undefined;
    for (const problem of packProblems) {
      if (problem.type === "pack-manifest-unavailable") {
        unreadable ??= { manifestPath: problem.path, reason: "missing" };
        continue;
      }
      if (problem.type === "pack-manifest-invalid") {
        unreadable ??= { manifestPath: problem.path, reason: "invalid" };
        continue;
      }
      if (isCompanionProblem(problem)) continue;
      return undefined;
    }
    if (unreadable === undefined) return undefined;
    retirements.push({ pack, ...unreadable });
  }
  return retirements;
};

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

/**
 * Build the Pack-uninstall readiness decision from the shared desired-state
 * planner.
 *
 * The graph gate exists to stop a Pack transition computed from state AXM
 * cannot read. A selected Pack whose own manifest is confirmed missing or
 * undecodable is positive evidence about the removal target, not the absent
 * evidence the gate guards against, so uninstall proceeds and removes only that
 * Pack's registration. Incompleteness the target did not cause still blocks.
 */
export const planPackUninstallGraphReadiness = (
  graph: DesiredStateGraph,
  selectedPacks: ReadonlyArray<string>,
  scope: WorkspaceScope,
): PackUninstallGraphReadiness => {
  const decision = planDesiredStateGraph(graph);
  if (decision.readiness === "ready") return { ...decision, retirements: [] };

  const selected = new Set(selectedPacks.map(normalizedPack));
  const foreign: Array<DesiredStateProblem> = [];
  const own: Array<DesiredStateProblem> = [];
  for (const problem of decision.problems) {
    if ("pack" in problem && selected.has(normalizedPack(problem.pack))) own.push(problem);
    else foreign.push(problem);
  }

  if (foreign.length === 0 && own.length > 0) {
    const retirements = retirementsFor(own);
    if (retirements !== undefined) return { readiness: "ready", graph, retirements };
  }

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
  const foreignPacks = [
    ...new Set(
      foreign.flatMap((problem) => ("pack" in problem ? [normalizedPack(problem.pack)] : [])),
    ),
  ];
  const remedy =
    foreignPacks.length === 0 ? "" : `; restore or uninstall ${foreignPacks.join(", ")} first`;
  return {
    readiness: "blocked",
    id: PACK_UNINSTALL_GRAPH_BLOCKER_ID,
    facts,
    detail: `Cannot uninstall Pack graph because desired state is incomplete: ${facts.map((fact) => fact.detail).join("; ")}${remedy}`,
  };
};
