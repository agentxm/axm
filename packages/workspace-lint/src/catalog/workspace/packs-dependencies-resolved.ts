import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import type { WorkspaceRuleContext } from "../../workspace-context.js";
import type { AdvisoryFinding, AdvisoryRule } from "@agentxm/registry-protocol/unstable/lint/rule";
import { lockfileDisplayPath } from "./display-paths.js";

const RULE_ID = "workspace/packs-dependencies-resolved";

/** Pack membership comes from the desired graph; lock rows only prove external resolution. */
export const packsDependenciesResolvedRule: AdvisoryRule<WorkspaceRuleContext> = {
  id: RULE_ID,
  description: "Pack-declared external dependencies have accepted resolutions.",
  kind: "advisory",
  severity: "error",
  check: (context) =>
    Effect.gen(function* () {
      if (context.health === undefined) return [];
      const graphResult = yield* Effect.result(context.health.desiredState);
      const lockResult = yield* Effect.result(context.workspace.state.lockfile);
      if (Result.isFailure(graphResult) || Result.isFailure(lockResult)) return [];
      const lockfile = Option.getOrUndefined(lockResult.success);
      if (lockfile === undefined) return [];

      const lockedNames = {
        skill: new Set(Object.keys(lockfile.skills)),
        subagent: new Set(Object.keys(lockfile.subagents ?? {})),
        "mcp-server": new Set(Object.keys(lockfile.mcpServers ?? {})),
        rule: new Set(Object.keys(lockfile.rules ?? {})),
        hook: new Set(Object.keys(lockfile.hooks ?? {})),
        knowledge: new Set(Object.keys(lockfile.knowledge ?? {})),
      };
      const findings: AdvisoryFinding[] = [];
      for (const node of graphResult.success.nodes) {
        const hasAcceptedResolution =
          node.type === "mcp-server"
            ? lockedNames["mcp-server"].has(node.identity)
            : node.type === "pack"
              ? false
              : lockedNames[node.type].has(node.name);
        if (
          node.type === "pack" ||
          node.identity.startsWith("workspace:") ||
          !node.origins.some((origin) => origin.type === "pack") ||
          hasAcceptedResolution
        ) {
          continue;
        }
        findings.push({
          kind: "advisory",
          ruleId: RULE_ID,
          severity: "error",
          message: `Pack-declared ${node.type} '${node.identity}' has no accepted external resolution.`,
          location: { file: lockfileDisplayPath(context.subject.scope) },
        });
      }
      return findings;
    }),
};
