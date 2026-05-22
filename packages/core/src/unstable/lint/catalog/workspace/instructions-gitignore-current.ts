import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { Operation } from "../../../plan/plan.js";
import type { WorkspaceRuleContext } from "../../context.js";
import type { AutofixableFinding, AutofixingRule, LintFinding } from "../../rule.js";
import { EMPTY_LINT_FINDINGS, EMPTY_OPERATIONS } from "./helpers/empty.js";
import { syncInstructionsGitignoreOp } from "./helpers/install-ops.js";

const RULE_ID = "workspace/instructions-gitignore-current";

const relativeToRoot = (root: string, file: string): string => {
  if (file === root) return "";
  const prefix = `${root}/`;
  return file.startsWith(prefix) ? file.slice(prefix.length) : file;
};

export const instructionsGitignoreCurrentRule: AutofixingRule<WorkspaceRuleContext> = {
  id: RULE_ID,
  description: "Instruction-file gitignore entries match the configured policy.",
  kind: "autofixing",
  severity: "info",
  check: (context) =>
    Effect.gen(function* () {
      if (context.instructions === undefined) return EMPTY_LINT_FINDINGS;
      const status = yield* context.instructions.gitignore;
      if (Option.isNone(status) || status.value.current) return EMPTY_LINT_FINDINGS;
      return [
        {
          kind: "autofixable",
          ruleId: RULE_ID,
          severity: "info",
          message: status.value.desired
            ? "Instruction-file ignore entries are missing or stale. Run `axm lint --fix` to refresh the managed block."
            : "Instruction-file ignore entries are disabled but a managed block remains. Run `axm lint --fix` to remove it.",
          location: { file: relativeToRoot(context.subject.root, status.value.file) },
        },
      ] satisfies ReadonlyArray<LintFinding>;
    }),
  fix: (context, _finding: AutofixableFinding) =>
    Effect.gen(function* () {
      if (context.instructions === undefined) return EMPTY_OPERATIONS;
      const status = yield* context.instructions.gitignore;
      if (Option.isNone(status)) return EMPTY_OPERATIONS;
      return [
        syncInstructionsGitignoreOp({ desired: status.value.desired }),
      ] satisfies ReadonlyArray<Operation<string, unknown>>;
    }),
};
