import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { InstructionStatusItem } from "../../../agents/instructions.js";
import type { WorkspaceRuleContext } from "../../workspace-context.js";
import type { AdvisoryRule, LintFinding } from "@agentxm/registry-protocol/unstable/lint/rule";
import { EMPTY_LINT_FINDINGS } from "./helpers/empty.js";

const RULE_ID = "workspace/instructions-target-unowned";

const occupantFor = (item: InstructionStatusItem): string => {
  switch (item.observedForm) {
    case "directory":
      return "directory";
    case "symlink":
      return "symlink";
    case "broken-link":
      return "dangling symlink";
    default:
      return "file";
  }
};

const relativeToRoot = (root: string, file: string): string => {
  if (file === root) return "";
  const prefix = `${root}/`;
  return file.startsWith(prefix) ? file.slice(prefix.length) : file;
};

/**
 * An unowned file at a planned instruction target is a collision, not drift:
 * AXM cannot prove it produced the content, so no reconciliation may replace
 * it and `axm sync` refuses until a person decides. The finding names the
 * path and the decision; it carries no repair.
 */
export const instructionsTargetUnownedRule: AdvisoryRule<WorkspaceRuleContext> = {
  id: RULE_ID,
  description: "Planned instruction targets are free of files AXM does not own.",
  kind: "advisory",
  severity: "warning",
  check: (context) =>
    Effect.gen(function* () {
      if (context.instructions === undefined) return EMPTY_LINT_FINDINGS;
      const snapshot = yield* context.instructions.snapshot;
      if (Option.isNone(snapshot)) return EMPTY_LINT_FINDINGS;

      const findings: Array<LintFinding> = [];
      for (const item of snapshot.value.status.items) {
        if (item.mechanism !== "symlink" && item.mechanism !== "copy") continue;
        if (item.ownership !== "unowned") continue;
        findings.push({
          kind: "advisory",
          ruleId: RULE_ID,
          severity: "warning",
          message:
            `An unowned ${occupantFor(item)} occupies the ${item.agentName} instruction target; ` +
            "AXM will not modify it. Remove or rename it, or make it the canonical source with " +
            "`axm instructions enable --file`.",
          location: { file: relativeToRoot(context.subject.root, item.targetFile) },
        });
      }
      return findings;
    }),
};
