/**
 * Whether desired state reaches an accepted lock row: the one query the
 * install-root inventory, retirement, and the lockfile-alignment lint apply,
 * so a row is retained, retired, and reported by one rule.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Option from "effect/Option";
import type { ExtensionType } from "@agentxm/extension-model/unstable/extensions/common";

import type {
  DesiredExtensionNode,
  DesiredPackMembership,
  DesiredStateGraph,
} from "./desired-state-graph.js";
import { unresolvedPackRoutes, type DesiredReachability } from "./desired-state-queries.js";
import { desiredMcpSourceKey } from "./desired-identity.js";

/** An accepted lock row named by the type map it sits in and its key there. */
export interface AcceptedRowRef {
  readonly type: ExtensionType;
  /** The workspace name, or an MCP source's resolution key. */
  readonly key: string;
  /** The row itself, when the caller holds it: it names the package an MCP key does not. */
  readonly entry?: { readonly identity: { readonly name: string } };
}

/**
 * The lock key a desired node's accepted resolution is recorded under: an MCP
 * server's source-resolution key, or every other type's workspace name. A
 * node whose package the workspace authors, or that AXM bundles, records no
 * accepted resolution, and an MCP source whose endpoint is unknown has no key
 * to be recorded under.
 */
export const acceptedRowKey = (
  node: Pick<DesiredExtensionNode, "type" | "name" | "identity">,
): Option.Option<string> => {
  switch (node.identity.authority) {
    case "workspace":
    case "bundled":
    case "inline":
      return Option.none();
    case "registry":
    case "http":
    case "git":
    case "path":
      return node.type === "mcp-server"
        ? desiredMcpSourceKey(node.identity)
        : Option.some(node.name);
  }
};

/** Whether one desired node's accepted resolution is the given row. */
export const desiredNodeReachesRow = (
  node: Pick<DesiredExtensionNode, "type" | "name" | "identity">,
  row: AcceptedRowRef,
): boolean =>
  node.type === row.type && Option.exists(acceptedRowKey(node), (key) => key === row.key);

/**
 * Whether any desired node reaches the accepted row. Only desired state
 * creates reachability: a row nothing desires, or that a workspace-authored
 * declaration shadows, is unreached and is retirement's to remove. Every
 * contender in an identity collision counts as desired, so the row of a
 * contender the graph did not represent is never read as unreached.
 */
export const desiredReachesAcceptedRow = (
  graph: Pick<DesiredStateGraph, "nodes" | "problems">,
  row: AcceptedRowRef,
): boolean =>
  graph.nodes.some((node) => desiredNodeReachesRow(node, row)) ||
  graph.problems.some(
    (problem) =>
      problem.type === "projection-collision" &&
      problem.extensionType === row.type &&
      problem.identities.some((identity) =>
        desiredNodeReachesRow({ type: row.type, name: problem.name, identity }, row),
      ),
  );

/** The desired node that reaches the row, or that represents a collision contender reaching it. */
const reachingNode = (
  graph: Pick<DesiredStateGraph, "nodes" | "problems">,
  row: AcceptedRowRef,
): DesiredExtensionNode | undefined =>
  graph.nodes.find((node) => desiredNodeReachesRow(node, row)) ??
  graph.problems.flatMap((problem) =>
    problem.type === "projection-collision" &&
    problem.extensionType === row.type &&
    problem.identities.some((identity) =>
      desiredNodeReachesRow({ type: row.type, name: problem.name, identity }, row),
    )
      ? graph.nodes.filter((node) => node.type === row.type && node.name === problem.name)
      : [],
  )[0];

/**
 * Whether an unresolved Pack could route the row: a Pack never routes a Pack;
 * a Pack whose membership is unknown could route any other row; one whose
 * members are known could route only a row naming one of them.
 */
const couldRoute = (membership: DesiredPackMembership, row: AcceptedRowRef): boolean => {
  if (row.type === "pack") return false;
  if (membership.declared.status === "unknown") return true;
  return membership.declared.members.some(
    (member) =>
      member.type === row.type &&
      (member.name === row.key ||
        (row.type === "mcp-server" &&
          (row.entry === undefined || member.name === row.entry.identity.name))),
  );
};

/**
 * Whether desired state reaches one accepted row, with the evidence the
 * answer rests on. A reaching node proves the positive answer; the negative
 * answer needs every unresolved Pack that could route the row ruled out, so
 * an unresolved Pack blocks only the rows it could reach and every other row
 * is decided normally.
 */
export const acceptedRowReachability = (
  graph: Pick<DesiredStateGraph, "nodes" | "problems" | "packMembership">,
  row: AcceptedRowRef,
): DesiredReachability => {
  const node = reachingNode(graph, row);
  if (node !== undefined) return { decision: "reached", node };
  const blockers = unresolvedPackRoutes(graph).filter((membership) => couldRoute(membership, row));
  return blockers.length === 0 ? { decision: "not-reached" } : { decision: "unknown", blockers };
};
