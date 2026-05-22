import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { Operation } from "../../../plan/plan.js";
import type { InstructionStatusItem } from "../../../agents/instructions.js";
import type { WorkspaceRuleContext } from "../../context.js";
import type { AutofixableFinding, AutofixingRule, LintFinding } from "../../rule.js";
import { EMPTY_LINT_FINDINGS, EMPTY_OPERATIONS } from "./helpers/empty.js";
import { syncInstructionTargetOp } from "./helpers/install-ops.js";

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
      return `The ${item.agentName} instruction file is missing. Run \`axm lint --fix\` to propagate the source file.`;
    case "drift":
      return `The ${item.agentName} instruction file differs from the source file. Run \`axm lint --fix\` to propagate the source file.`;
    case "broken-link":
      return `The ${item.agentName} instruction symlink target is missing. Run \`axm lint --fix\` to recreate it.`;
    default:
      return `The ${item.agentName} instruction file is not current. Run \`axm lint --fix\` to propagate the source file.`;
  }
};

export const instructionsTargetCurrentRule: AutofixingRule<WorkspaceRuleContext> = {
  id: RULE_ID,
  description: "Configured agent instruction target files are current.",
  kind: "autofixing",
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
          kind: "autofixable",
          ruleId: RULE_ID,
          severity: item.health === "broken-link" ? "error" : "warning",
          message: messageFor(item),
          location: { file: relativeToRoot(context.subject.root, item.targetFile) },
        });
      }
      return findings;
    }),
  fix: (context, finding: AutofixableFinding) =>
    Effect.gen(function* () {
      if (context.instructions === undefined || finding.location === undefined) {
        return EMPTY_OPERATIONS;
      }
      const status = yield* context.instructions.status;
      if (Option.isNone(status)) return EMPTY_OPERATIONS;
      const item = status.value.items.find(
        (candidate) =>
          isTargetFinding(candidate) &&
          relativeToRoot(context.subject.root, candidate.targetFile) === finding.location?.file,
      );
      if (item === undefined) return EMPTY_OPERATIONS;
      return [
        syncInstructionTargetOp({
          root: item.root,
          agentId: item.agentId,
          force: item.health === "drift",
        }),
      ] satisfies ReadonlyArray<Operation<string, unknown>>;
    }),
};
