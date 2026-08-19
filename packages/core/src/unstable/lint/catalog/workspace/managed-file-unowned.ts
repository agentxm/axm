import * as Effect from "effect/Effect";
import type { WorkspaceRuleContext } from "../../context.js";
import type { AdvisoryRule, LintFinding } from "../../rule.js";
import { EMPTY_LINT_FINDINGS } from "./helpers/empty.js";

const RULE_ID = "workspace/managed-file-unowned";

const relativeToRoot = (root: string, file: string): string => {
  const prefix = `${root}/`;
  return file.startsWith(prefix) ? file.slice(prefix.length) : file;
};

export const managedFileUnownedRule: AdvisoryRule<WorkspaceRuleContext> = {
  id: RULE_ID,
  description: "Agent-directory artifacts have a resolvable AXM ownership proof.",
  kind: "advisory",
  severity: "warning",
  check: (context) =>
    context.ownership === undefined
      ? Effect.succeed(EMPTY_LINT_FINDINGS)
      : context.ownership.pipe(
          Effect.map((issues) =>
            issues
              .filter((issue) => issue.kind === "managed-file-unowned")
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
