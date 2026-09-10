import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { WorkspaceRuleContext } from "../../workspace-context.js";
import type { AdvisoryRule, LintFinding } from "@agentxm/registry-protocol/unstable/lint/rule";
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
      const snapshot = yield* context.instructions.snapshot;
      if (Option.isNone(snapshot)) return EMPTY_LINT_FINDINGS;
      const status = snapshot.value.gitignore;
      if (status.trackedAliases.length > 0) {
        return [
          {
            kind: "advisory",
            ruleId: RULE_ID,
            severity: "info",
            message: `Managed ignore entries cover paths already present in the Git index (${status.trackedAliases.join(", ")}); set gitignoreAliases: false to reconcile tracked instruction aliases.`,
            location: { file: relativeToRoot(context.subject.root, status.file) },
          },
        ] satisfies ReadonlyArray<LintFinding>;
      }
      if (status.current) return EMPTY_LINT_FINDINGS;
      return [
        {
          kind: "advisory",
          ruleId: RULE_ID,
          severity: "info",
          message: status.desired
            ? "Instruction-file ignore entries are missing or stale."
            : "Instruction-file ignore entries are disabled but a managed block remains.",
          location: { file: relativeToRoot(context.subject.root, status.file) },
        },
      ] satisfies ReadonlyArray<LintFinding>;
    }),
};
