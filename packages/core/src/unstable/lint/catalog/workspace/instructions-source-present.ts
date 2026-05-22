import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { WorkspaceRuleContext } from "../../context.js";
import type { AdvisoryFinding, AdvisoryRule } from "../../rule.js";
import { EMPTY_ADVISORY_FINDINGS } from "./helpers/empty.js";

const RULE_ID = "workspace/instructions-source-present";

const relativeToRoot = (root: string, file: string): string => {
  if (file === root) return "";
  const prefix = `${root}/`;
  return file.startsWith(prefix) ? file.slice(prefix.length) : file;
};

export const instructionsSourcePresentRule: AdvisoryRule<WorkspaceRuleContext> = {
  id: RULE_ID,
  description: "The configured instruction source file exists.",
  kind: "advisory",
  severity: "error",
  check: (context) =>
    Effect.gen(function* () {
      if (context.instructions === undefined) return EMPTY_ADVISORY_FINDINGS;
      const status = yield* context.instructions.status;
      if (Option.isNone(status)) return EMPTY_ADVISORY_FINDINGS;

      const sourceFiles = new Set(
        status.value.items
          .filter((item) => item.health === "missing-source")
          .map((item) => item.sourceFile),
      );
      const findings: Array<AdvisoryFinding> = [];
      for (const sourceFile of sourceFiles) {
        findings.push({
          kind: "advisory",
          ruleId: RULE_ID,
          severity: "error",
          message:
            "The configured instruction source file is missing. Create it before running `axm lint --fix` or `axm sync`.",
          location: { file: relativeToRoot(context.subject.root, sourceFile) },
        });
      }
      return findings;
    }),
};
