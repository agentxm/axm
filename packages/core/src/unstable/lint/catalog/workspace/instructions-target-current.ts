import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { InstructionStatusItem } from "../../../agents/instructions.js";
import type { WorkspaceRuleContext } from "../../context.js";
import type { AdvisoryRule, LintFinding } from "../../rule.js";
import { EMPTY_LINT_FINDINGS } from "./helpers/empty.js";

const RULE_ID = "workspace/instructions-target-current";

const relativeToRoot = (root: string, file: string): string => {
  if (file === root) return "";
  const prefix = `${root}/`;
  return file.startsWith(prefix) ? file.slice(prefix.length) : file;
};

const targetHealth = new Set(["missing-target", "drift", "broken-link"]);

const isTargetFinding = (item: InstructionStatusItem): boolean =>
  (item.mechanism === "symlink" || item.mechanism === "copy") && targetHealth.has(item.health);

const messageFor = (item: InstructionStatusItem): string => {
  switch (item.health) {
    case "missing-target":
      return `The ${item.agentName} instruction file is missing.`;
    case "drift":
      return `The ${item.agentName} instruction file differs from the source file.`;
    case "broken-link":
      return `The ${item.agentName} instruction symlink target is missing.`;
    default:
      return `The ${item.agentName} instruction file is not current.`;
  }
};

export const instructionsTargetCurrentRule: AdvisoryRule<WorkspaceRuleContext> = {
  id: RULE_ID,
  description: "Configured agent instruction target files are current.",
  kind: "advisory",
  severity: "warning",
  check: (context) =>
    Effect.gen(function* () {
      if (context.instructions === undefined) return EMPTY_LINT_FINDINGS;
      const status = yield* context.instructions.status;
      if (Option.isNone(status)) return EMPTY_LINT_FINDINGS;

      const findings: Array<LintFinding> = [];
      for (const item of status.value.items) {
        if (!isTargetFinding(item)) continue;
        findings.push({
          kind: "advisory",
          ruleId: RULE_ID,
          severity: item.health === "broken-link" ? "error" : "warning",
          message: messageFor(item),
          location: { file: relativeToRoot(context.subject.root, item.targetFile) },
        });
      }
      return findings;
    }),
};
