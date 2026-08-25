/**
 * `workspace/agents-detected-declared` — every agent footprint detected on
 * disk appears in `settings.agents[]`.
 *
 * Per the lint design:
 *
 *   Project scope only (early-returns at user scope). For each detected
 *   agent whose id is missing from settings.agents[], emit one finding.
 *
 * Project scope only: detection relies on scanning workspace-root-adjacent
 * agent dirs (`.claude/`, `.cursor/`, …). At user scope the detection target
 * is ambiguous, so the rule early-returns `[]`.
 *
 * Advisory, warning — the user may be intentionally using an agent AXM
 * doesn't manage.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import type { WorkspaceRuleContext } from "../../context.js";
import type { AdvisoryFinding, AdvisoryRule } from "../../rule.js";
import { settingsDisplayPath } from "./display-paths.js";
import { EMPTY_ADVISORY_FINDINGS } from "./helpers/empty.js";

const RULE_ID = "workspace/agents-detected-declared";

export const agentsDetectedDeclaredRule: AdvisoryRule<WorkspaceRuleContext> = {
  id: RULE_ID,
  description: "Agents detected on disk are declared in `settings.agents[]`.",
  kind: "advisory",
  severity: "warning",
  check: (context) =>
    Effect.gen(function* () {
      // Scope-aware early-return — detection only applies at project scope.
      if (context.subject.scope === "user") {
        return EMPTY_ADVISORY_FINDINGS;
      }

      const scoped = context.workspace;
      const settingsResult = yield* Effect.result(scoped.state.settings);
      if (Result.isFailure(settingsResult)) {
        return EMPTY_ADVISORY_FINDINGS;
      }
      if (Option.isNone(settingsResult.success)) {
        return EMPTY_ADVISORY_FINDINGS;
      }

      const detected = yield* scoped.agents.detected;
      const findings: Array<AdvisoryFinding> = [];
      for (const detection of detected) {
        if (detection.status !== "unmanaged-present") {
          continue;
        }
        findings.push({
          kind: "advisory",
          ruleId: RULE_ID,
          severity: "warning",
          message: `Agent '${detection.agentId}' is present on disk but missing from \`settings.agents[]\`.`,
          location: { file: settingsDisplayPath(context.subject.scope) },
        });
      }
      return findings;
    }),
};
