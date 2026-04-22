/**
 * `workspace/agents-recognized` — every agent id in `settings.agents[]` is
 * in AXM's known-agent catalog.
 *
 * Per `docs/design/lint-engine.md §10.workspace` "Foundation" row:
 *
 *   Agent recognition invariant — unknown IDs can't be materialized into.
 *   Absorbs doctor `agents-configured.unrecognized`. Known-agent catalog
 *   lives at `packages/core/src/unstable/agents/types.ts`.
 *
 * Cascade: the rule walks `settings.agents[]` and checks each id against
 * the set returned by `workspace.knownAgents`. Unknown ids each emit one
 * finding — the cascade is per-entity, not per-cascade-arm.
 *
 * Advisory — fixing an unrecognized id is a user-authored settings edit.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import type { WorkspaceRuleContext } from "../../context.js";
import type { AdvisoryFinding, AdvisoryRule } from "../../rule.js";
import { SettingsSchema, type Settings } from "../../../settings/schema.js";
import { EMPTY_ADVISORY_FINDINGS } from "./helpers/empty.js";

const RULE_ID = "workspace/agents-recognized";
const SETTINGS_REL = ".axm/settings.json";

const decodeSettings = (input: unknown): Option.Option<Settings> => {
  const result = Schema.decodeUnknownResult(SettingsSchema)(input, {
    onExcessProperty: "ignore",
    errors: "all",
  });
  return Result.isSuccess(result) ? Option.some(result.success) : Option.none();
};

export const agentsRecognizedRule: AdvisoryRule<WorkspaceRuleContext> = {
  id: RULE_ID,
  description: "Every agent id in settings.agents[] is in the known-agent catalog.",
  kind: "advisory",
  severity: "error",
  check: (context) =>
    Effect.gen(function* () {
      const settingsResult = yield* Effect.result(context.workspace.settings);
      if (Result.isFailure(settingsResult)) {
        return EMPTY_ADVISORY_FINDINGS;
      }
      const decoded = decodeSettings(settingsResult.success);
      if (Option.isNone(decoded)) {
        // workspace/settings-schema-valid owns the decode arm.
        return EMPTY_ADVISORY_FINDINGS;
      }
      const declared = decoded.value.agents ?? [];
      if (declared.length === 0) {
        return EMPTY_ADVISORY_FINDINGS;
      }
      const known = yield* context.workspace.knownAgents;
      const knownIds = new Set(known.map((a) => a.id));

      const findings: Array<AdvisoryFinding> = [];
      for (const id of declared) {
        if (knownIds.has(id)) {
          continue;
        }
        findings.push({
          kind: "advisory",
          ruleId: RULE_ID,
          severity: "error",
          message: `AXM does not recognize agent '${id}'. Remove it from settings.agents[] or correct it to the intended agent id.`,
          location: { file: SETTINGS_REL },
        });
      }
      return findings;
    }),
};
