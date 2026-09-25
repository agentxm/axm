import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";

import { parseExtensionFqnParts } from "@agentxm/extension-model/unstable/extensions";
import type { AdvisoryFinding, AdvisoryRule } from "@agentxm/extension-content/lint";
import type { WorkspaceRuleContext } from "../../workspace-context.js";

const RULE_ID = "workspace/packs-shared-members-distributable";

/** A distributable authored pack cannot advertise an authored member opted out of distribution. */
export const packsSharedMembersDistributableRule: AdvisoryRule<WorkspaceRuleContext> = {
  id: RULE_ID,
  description: "Shared authored packs contain only distributable authored extensions.",
  kind: "advisory",
  severity: "error",
  check: (context) =>
    Effect.gen(function* () {
      if (context.health === undefined) return [];
      const [graph, skills, mcps, subagents, rules, hooks, knowledge, packs] = yield* Effect.all(
        [
          Effect.result(context.health.desiredState),
          Effect.result(context.workspace.skills.declared),
          Effect.result(context.workspace.mcpServers.declared),
          Effect.result(context.workspace.subagents.declared),
          Effect.result(context.workspace.rules.declared),
          Effect.result(context.workspace.hooks.declared),
          Effect.result(context.workspace.knowledge.declared),
          Effect.result(context.workspace.packs.declared),
        ],
        { concurrency: "unbounded" },
      );
      if (
        Result.isFailure(graph) ||
        Result.isFailure(skills) ||
        Result.isFailure(mcps) ||
        Result.isFailure(subagents) ||
        Result.isFailure(rules) ||
        Result.isFailure(hooks) ||
        Result.isFailure(knowledge) ||
        Result.isFailure(packs)
      ) {
        return [];
      }

      const optedOut = new Set<string>();
      const collect = (
        type: string,
        declared: Option.Option<ReadonlyArray<{ readonly name: string; readonly entry: unknown }>>,
      ) => {
        for (const item of Option.getOrElse(declared, () => [])) {
          const entry = item.entry;
          if (
            typeof entry === "object" &&
            entry !== null &&
            "source" in entry &&
            entry.source === "workspace" &&
            "distribute" in entry &&
            entry.distribute === false
          ) {
            optedOut.add(`${type}:${item.name}`);
          }
        }
      };
      collect("skill", skills.success);
      collect("mcp-server", mcps.success);
      collect("subagent", subagents.success);
      collect("rule", rules.success);
      collect("hook", hooks.success);
      collect("knowledge", knowledge.success);

      const sharedPacks = new Set(
        Option.getOrElse(packs.success, () => []).flatMap(({ name, entry }) =>
          entry.source === "workspace" && entry.distribute !== false ? [name] : [],
        ),
      );
      const findings: Array<AdvisoryFinding> = [];
      for (const node of graph.success.nodes) {
        if (!optedOut.has(`${node.type}:${node.name}`)) continue;
        for (const origin of node.origins) {
          if (origin.type !== "pack") continue;
          const packName = parseExtensionFqnParts(origin.pack.fqn)?.name;
          if (packName === undefined || !sharedPacks.has(packName)) continue;
          findings.push({
            kind: "advisory",
            ruleId: RULE_ID,
            severity: "error",
            message: `Shared pack '${origin.pack.fqn}' names opted-out ${node.type} '${node.name}'.`,
            location: { file: origin.manifestPath },
          });
        }
      }
      return findings;
    }),
};
