/**
 * Whether desired state reaches an accepted lock row: the one predicate the
 * install-root inventory, retirement, and the lockfile-alignment lint apply,
 * so a row is retained, retired, and reported by one rule.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Option from "effect/Option";
import type { ExtensionType } from "@agentxm/extension-model/unstable/extensions/common";

import type { DesiredExtensionNode, DesiredStateGraph } from "./desired-state-graph.js";

/** An accepted lock row named by the type map it sits in and its key there. */
export interface AcceptedRowRef {
  readonly type: ExtensionType;
  /** The workspace name, or an MCP source's resolution key. */
  readonly key: string;
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
      return node.type === "mcp-server"
        ? Option.fromUndefinedOr(node.identity.resolutionKey)
        : Option.some(node.name);
    case "git":
    case "path":
      return node.type === "mcp-server"
        ? Option.fromUndefinedOr(node.identity.resolutionKey)
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
