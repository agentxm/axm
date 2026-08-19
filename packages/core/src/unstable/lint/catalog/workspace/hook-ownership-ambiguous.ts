import * as Effect from "effect/Effect";
import type { WorkspaceRuleContext } from "../../context.js";
import type { AdvisoryRule, LintFinding } from "../../rule.js";
import { EMPTY_LINT_FINDINGS } from "./helpers/empty.js";

const RULE_ID = "workspace/hook-ownership-ambiguous";

const relativeToRoot = (root: string, file: string): string => {
  const prefix = `${root}/`;
  return file.startsWith(prefix) ? file.slice(prefix.length) : file;
};

export const hookOwnershipAmbiguousRule: AdvisoryRule<WorkspaceRuleContext> = {
  id: RULE_ID,
  description: "Hook entries that resemble AXM output carry explicit ownership metadata.",
  kind: "advisory",
  severity: "warning",
  check: (context) =>
    context.ownership === undefined
      ? Effect.succeed(EMPTY_LINT_FINDINGS)
      : context.ownership.pipe(
          Effect.map((issues) =>
            issues
              .filter((issue) => issue.kind === "hook-ownership-ambiguous")
              .map(
                (issue) =>
                  ({
                    kind: "advisory",
                    ruleId: RULE_ID,
                    severity: "warning",
                    message: issue.detail,
                    location: { file: relativeToRoot(context.subject.root, issue.path) },
                  }) satisfies LintFinding,
              ),
          ),
        ),
};
