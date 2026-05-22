import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { WorkspaceRuleContext } from "../../context.js";
import type { AdvisoryFinding, AdvisoryRule } from "../../rule.js";
import { EMPTY_ADVISORY_FINDINGS } from "./helpers/empty.js";

const RULE_ID = "workspace/instructions-agent-supported";

const relativeToRoot = (root: string, file: string): string => {
  if (file === root) return "";
  const prefix = `${root}/`;
  return file.startsWith(prefix) ? file.slice(prefix.length) : file;
};

export const instructionsAgentSupportedRule: AdvisoryRule<WorkspaceRuleContext> = {
  id: RULE_ID,
  description: "Configured agents support automatic instruction propagation.",
  kind: "advisory",
  severity: "warning",
  check: (context) =>
    Effect.gen(function* () {
      if (context.instructions === undefined) return EMPTY_ADVISORY_FINDINGS;
      const status = yield* context.instructions.status;
      if (Option.isNone(status)) return EMPTY_ADVISORY_FINDINGS;

      const findings: Array<AdvisoryFinding> = [];
      for (const item of status.value.items) {
        if (item.health !== "unsupported" && item.mechanism !== "adapter") continue;
        findings.push({
          kind: "advisory",
          ruleId: RULE_ID,
          severity: "warning",
          message:
            `${item.agentName} does not support automatic instruction-file propagation. ` +
            "Manage that agent's instruction file manually.",
          location: { file: relativeToRoot(context.subject.root, item.targetFile) },
        });
      }
      return findings;
    }),
};
