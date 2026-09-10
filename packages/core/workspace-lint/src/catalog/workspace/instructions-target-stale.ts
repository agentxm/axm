import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { WorkspaceRuleContext } from "../../workspace-context.js";
import type { AdvisoryRule, LintFinding } from "@agentxm/registry-protocol/unstable/lint/rule";
import { EMPTY_LINT_FINDINGS } from "./helpers/empty.js";

const RULE_ID = "workspace/instructions-target-stale";

const relativeToRoot = (root: string, file: string): string => {
  if (file === root) return "";
  const prefix = `${root}/`;
  return file.startsWith(prefix) ? file.slice(prefix.length) : file;
};

/**
 * An AXM-owned alias the current plan no longer desires — left behind by a
 * removed source root, a removed agent, or a changed source filename. Its
 * ownership is proven by inspection, so removal is fully determined.
 */
export const instructionsTargetStaleRule: AdvisoryRule<WorkspaceRuleContext> = {
  id: RULE_ID,
  description: "No AXM-owned instruction alias outlives the plan that created it.",
  kind: "advisory",
  severity: "warning",
  check: (context) =>
    Effect.gen(function* () {
      if (context.instructions === undefined) return EMPTY_LINT_FINDINGS;
      const snapshot = yield* context.instructions.snapshot;
      if (Option.isNone(snapshot)) return EMPTY_LINT_FINDINGS;

      const findings: Array<LintFinding> = [];
      for (const item of snapshot.value.status.staleTargets) {
        findings.push({
          kind: "advisory",
          ruleId: RULE_ID,
          severity: "warning",
          message:
            `The AXM-owned ${item.agentName} instruction ${item.observedForm === "copy" ? "copy" : "symlink"} ` +
            "is no longer desired by the current instruction configuration.",
          location: { file: relativeToRoot(context.subject.root, item.targetFile) },
        });
      }
      return findings;
    }),
};
