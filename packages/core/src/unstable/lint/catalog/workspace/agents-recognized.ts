/**
 * `workspace/agents-recognized` — every agent id in `settings.agents[]` is
 * in AXM's known-agent catalog.
 *
 * Per the lint design "Foundation" row:
 *
 *   Agent recognition invariant — unknown IDs can't be materialized into.
 *   Absorbs doctor `agents-configured.unrecognized`. Known-agent catalog
 *   lives at `packages/core/src/unstable/agents/types.ts`.
 *
 * Cascade: the rule walks `settings.agents[]` and checks each id against
 * the set returned by `workspace.scope(scope).agents.known`. Unknown ids
 * each emit one finding — the cascade is per-entity, not per-cascade-arm.
 *
 * Advisory — fixing an unrecognized id is a user-authored settings edit.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import type { WorkspaceRuleContext } from "../../context.js";
import type { AdvisoryFinding, AdvisoryRule } from "../../rule.js";
import { EMPTY_ADVISORY_FINDINGS } from "./helpers/empty.js";

const RULE_ID = "workspace/agents-recognized";
const SETTINGS_REL = ".axm/settings.json";

export const agentsRecognizedRule: AdvisoryRule<WorkspaceRuleContext> = {
  id: RULE_ID,
  description: "Every `settings.agents[]` entry names a supported agent.",
  kind: "advisory",
  severity: "error",
  check: (context) =>
    Effect.gen(function* () {
      const scoped = context.workspace;

      // `state.settings` returns the decoded `Settings` already; the
      // `SettingsReadError` family (io / parse / decode) is owned by
      // `workspace/initialized` and `workspace/settings-schema-valid`, so
      // we silently bail on any failure here.
      const settings = yield* Effect.result(scoped.state.settings);
      if (Result.isFailure(settings)) return EMPTY_ADVISORY_FINDINGS;
      if (Option.isNone(settings.success)) return EMPTY_ADVISORY_FINDINGS;

      const declared = settings.success.value.agents ?? [];
      if (declared.length === 0) return EMPTY_ADVISORY_FINDINGS;

      const knownAgents = yield* scoped.agents.known;
      const knownIds = new Set(knownAgents.map((agent) => agent.id));

      const findings: Array<AdvisoryFinding> = [];
      for (const id of declared) {
        if (knownIds.has(id)) continue;
        findings.push({
          kind: "advisory",
          ruleId: RULE_ID,
          severity: "error",
          message:
            `Agent id '${id}' in \`settings.agents[]\` is not supported. ` +
            `Edit \`.axm/settings.json\` and remove '${id}' from \`agents\`, or replace it there with the intended agent id.`,
          location: { file: SETTINGS_REL },
        });
      }
      return findings;
    }),
};
