import { planDesiredStateGraph } from "@agentxm/workspace-kernel/projection";
import {
  type DesiredStateGraph,
  type DesiredStateProblem,
  acquiredRootDisplayPath,
  desiredProblemSubject,
  desiredStateProblemText,
  lockfileDisplayPath,
  settingsDisplayPath,
} from "@agentxm/workspace-kernel/workspace-state";
import type { WorkspaceScope } from "@agentxm/extension-model/unstable/workspace-scope";

/** Recovery-conformance identity for Pack uninstall planning on an incomplete graph. */
export const PACK_UNINSTALL_GRAPH_BLOCKER_ID =
  "packs/uninstall/desired-state-graph-complete" as const;

/** Executable Pack-uninstall blocker identities covered by recovery conformance. */
export const packUninstallRecoveryIdentifiers = [PACK_UNINSTALL_GRAPH_BLOCKER_ID] as const;

export interface PackUninstallGraphBlockerFact {
  readonly problemType: DesiredStateProblem["type"];
  readonly packs: ReadonlyArray<string>;
  readonly member?: { readonly type: string; readonly name: string };
  readonly authoritativeLocations: ReadonlyArray<string>;
  readonly detail: string;
}

/** Why a selected Pack's own package could not be read. */
export type PackRetirementReason = "missing" | "invalid";

/**
 * A selected Pack whose own package manifest is confirmed absent or
 * undecodable. Its registration is removable from positive evidence about
 * the Pack itself; its content is not, because nothing about that content
 * can be verified. A manifest an I/O failure hid is neither, and blocks.
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
 * Classify the selected Packs' own problems into retirements, or report that
 * some selected Pack disagrees with the workspace in a way confirmed absence
 * cannot explain. A document an I/O failure hid, and readable-but-disagreeing
 * state, are drift, and stay blocked.
 */
const retirementsFor = (
  problems: ReadonlyArray<DesiredStateProblem>,
): ReadonlyArray<PackRetirement> | undefined => {
  const problemsByPack = new Map<string, Array<DesiredStateProblem>>();
  for (const problem of problems) {
    const subject = desiredProblemSubject(problem);
    if (subject.kind !== "pack") return undefined;
    const pack = normalizedPack(subject.pack);
    const existing = problemsByPack.get(pack);
    if (existing === undefined) problemsByPack.set(pack, [problem]);
    else existing.push(problem);
  }

  const retirements: Array<PackRetirement> = [];
  for (const [pack, packProblems] of problemsByPack) {
    let unreadable: Omit<PackRetirement, "pack"> | undefined;
    for (const problem of packProblems) {
      if (problem.type === "pack-manifest-unavailable" && problem.reason === "absent") {
        unreadable ??= { manifestPath: problem.path, reason: "missing" };
        continue;
      }
      if (problem.type === "pack-manifest-invalid") {
        unreadable ??= { manifestPath: problem.path, reason: "invalid" };
        continue;
      }
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
  if ("path" in problem && problem.path !== "") return [problem.path];
  if (desiredProblemSubject(problem).kind === "pack")
    return [settingsDisplayPath(scope), lockfileDisplayPath(scope)];
  return [settingsDisplayPath(scope), `${acquiredRootDisplayPath(scope)}/*/packs/*/pack.json`];
};

const factFor = (
  problem: DesiredStateProblem,
  selectedPacks: ReadonlyArray<string>,
  scope: WorkspaceScope,
): PackUninstallGraphBlockerFact => {
  const about = desiredProblemSubject(problem);
  const packs =
    about.kind === "pack" ? [normalizedPack(about.pack)] : selectedPacks.map(normalizedPack);
  const authoritativeLocations = locationsFor(problem, scope);
  const member = about.kind === "extension" ? { type: about.type, name: about.name } : undefined;
  const subject =
    member === undefined ? `Pack ${packs.join(", ")}` : `${member.type} member ${member.name}`;
  // The fact carries the evaluation's own sentence for the problem.
  return {
    problemType: problem.type,
    packs,
    ...(member === undefined ? {} : { member }),
    authoritativeLocations,
    detail: `${subject}: ${problem.type} (${desiredStateProblemText(problem)}); authoritative location${authoritativeLocations.length === 1 ? "" : "s"}: ${authoritativeLocations.join(", ")}`,
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
    const subject = desiredProblemSubject(problem);
    if (subject.kind === "pack" && selected.has(normalizedPack(subject.pack))) own.push(problem);
    else foreign.push(problem);
  }

  if (foreign.length === 0 && own.length > 0) {
    const retirements = retirementsFor(own);
    if (retirements !== undefined) return { readiness: "ready", graph, retirements };
  }

  const facts = decision.problems.map((problem) => factFor(problem, selectedPacks, scope));
  const foreignPacks = [
    ...new Set(
      foreign.flatMap((problem) => {
        const subject = desiredProblemSubject(problem);
        return subject.kind === "pack" ? [normalizedPack(subject.pack)] : [];
      }),
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
