/** Reports legacy Knowledge projection settings accepted for one read horizon. */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import type { WorkspaceRuleContext } from "../../context.js";
import type { AutofixingRule, LintFinding } from "../../rule.js";
import { EMPTY_LINT_FINDINGS, EMPTY_OPERATIONS } from "./helpers/empty.js";

const RULE_ID = "workspace/knowledge-config-current";

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasLegacyKnowledgeConfig = (raw: string): boolean => {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return false;
    const config = parsed["knowledgeConfig"];
    return isRecord(config) && ("directory" in config || "ignore" in config);
  } catch {
    return false;
  }
};

export const knowledgeConfigCurrentRule: AutofixingRule<WorkspaceRuleContext> = {
  id: RULE_ID,
  description: "Knowledge configuration uses only the current instruction discovery setting.",
  kind: "autofixing",
  severity: "warning",
  check: (context) =>
    Effect.gen(function* () {
      const raw = yield* Effect.result(context.workspace.state.raw("settings"));
      if (
        Result.isFailure(raw) ||
        Option.isNone(raw.success) ||
        !hasLegacyKnowledgeConfig(raw.success.value.bytes)
      ) {
        return EMPTY_LINT_FINDINGS;
      }
      return [
        {
          kind: "autofixable",
          ruleId: RULE_ID,
          severity: "warning",
          message:
            "knowledgeConfig.directory and knowledgeConfig.ignore are deprecated and have no effect. Run `axm lint --fix` to remove them.",
          location: { file: ".axm/settings.json" },
        },
      ] satisfies ReadonlyArray<LintFinding>;
    }),
  // The CLI performs this canonical settings normalization as one pre-plan
  // write. No extension lifecycle operation is appropriate here.
  fix: () => Effect.succeed(EMPTY_OPERATIONS),
};
