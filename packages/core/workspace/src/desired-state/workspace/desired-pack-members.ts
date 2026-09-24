/**
 * Pack-member bindings: which desired extensions a Pack supplies, and whether
 * each is active, as the desired-state graph decided.
 *
 * The graph is the only reachability authority. A reader that shapes
 * Pack-member rows — the workspace records, lint's workspace view — asks it
 * here and hands the answer to the read model, which shapes rows without
 * deciding membership or activation of its own.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { decodeExtensionNameSync } from "@agentxm/extension-model/unstable/extensions/common";
import type { InstallableExtensionType } from "@agentxm/extension-model/unstable/extensions/installable-types";
import type { DesiredExtensionNode, DesiredStateGraph } from "./desired-state-graph.js";
import type { PackMemberBinding } from "./read-model/extensions/projection.js";
import type { InstalledPackRef, Scope } from "./read-model/types.js";

const normalizedPackIdentity = (identity: string): string =>
  identity.startsWith("workspace:") ? identity.slice("workspace:".length) : identity;

const supplyingPack = (
  graph: DesiredStateGraph,
  node: DesiredExtensionNode,
  scope: Scope,
): InstalledPackRef | undefined => {
  const origin = node.origins.find((candidate) => candidate.type === "pack");
  if (origin === undefined || origin.type !== "pack") return undefined;
  const pack = graph.nodes.find(
    (candidate) =>
      candidate.type === "pack" &&
      normalizedPackIdentity(candidate.identity) === normalizedPackIdentity(origin.pack),
  );
  return pack === undefined
    ? undefined
    : { key: { scope, type: "pack", name: decodeExtensionNameSync(pack.name) } };
};

/**
 * The members of `type` some configured Pack supplies, each with the Pack
 * that supplies it and the activation the graph settled for it.
 */
export const packMemberBindings = (
  graph: DesiredStateGraph,
  scope: Scope,
  type: InstallableExtensionType,
): ReadonlyArray<PackMemberBinding> =>
  type === "pack"
    ? []
    : graph.nodes.flatMap((node) => {
        if (node.type !== type) return [];
        const pack = supplyingPack(graph, node, scope);
        return pack === undefined
          ? []
          : [{ name: decodeExtensionNameSync(node.name), pack, enabled: node.enabled }];
      });
