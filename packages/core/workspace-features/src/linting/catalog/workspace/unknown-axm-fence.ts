/**
 * AXM fences whose name is not a region AXM manages.
 *
 * AXM reads and writes only the regions in its closed vocabulary. A fence
 * with any other name, such as one from a newer AXM or a typo, is inert: AXM
 * leaves it and its content untouched. The finding says so, so nobody expects
 * AXM to maintain it.
 */
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import type { AdvisoryFinding, AdvisoryRule } from "@agentxm/extension-content/lint";
import type { WorkspaceRuleContext } from "../../workspace-context.js";

const RULE_ID = "workspace/unknown-axm-fence";

export const unknownAxmFenceRule: AdvisoryRule<WorkspaceRuleContext> = {
  id: RULE_ID,
  description: "AXM fences in region-carrying files name a region AXM manages.",
  kind: "advisory",
  severity: "info",
  check: (context) =>
    Effect.gen(function* () {
      if (context.unknownFences === undefined) return [];
      const found = yield* context.unknownFences;
      return found.map((entry): AdvisoryFinding => {
        if (Result.isFailure(entry))
          return {
            kind: "advisory",
            ruleId: RULE_ID,
            severity: "info",
            message: `\`${entry.failure.path}\` could not be read to check its AXM fences.`,
            location: { file: entry.failure.path },
          };
        const { path, line, name, edge } = entry.success;
        return {
          kind: "advisory",
          ruleId: RULE_ID,
          severity: "info",
          message: `\`${path}:${line + 1}\` has AXM fence \`${edge === "close" ? "/" : ""}axm:${name}\`, which is not a region AXM manages; it is left untouched.`,
          location: { file: path, line: line + 1 },
        };
      });
    }),
};
