import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { WorkspaceRuleContext } from "../../context.js";
import type { AdvisoryRule, LintFinding } from "../../rule.js";
import { EMPTY_LINT_FINDINGS } from "./helpers/empty.js";

const RULE_ID = "workspace/instructions-gitignore-current";

const relativeToRoot = (root: string, file: string): string => {
  if (file === root) return "";
  const prefix = `${root}/`;
  return file.startsWith(prefix) ? file.slice(prefix.length) : file;
};

export const instructionsGitignoreCurrentRule: AdvisoryRule<WorkspaceRuleContext> = {
  id: RULE_ID,
  description: "Instruction-file gitignore entries match the configured policy.",
  kind: "advisory",
  severity: "info",
  check: (context) =>
    Effect.gen(function* () {
      if (context.instructions === undefined) return EMPTY_LINT_FINDINGS;
      const status = yield* context.instructions.gitignore;
      if (Option.isNone(status) || status.value.current) return EMPTY_LINT_FINDINGS;
      return [
        {
          kind: "advisory",
          ruleId: RULE_ID,
          severity: "info",
          message: status.value.desired
            ? "Instruction-file ignore entries are missing or stale."
            : "Instruction-file ignore entries are disabled but a managed block remains.",
          location: { file: relativeToRoot(context.subject.root, status.value.file) },
        },
      ] satisfies ReadonlyArray<LintFinding>;
    }),
};
