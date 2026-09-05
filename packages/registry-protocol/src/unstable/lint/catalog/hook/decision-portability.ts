import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import {
  HOOK_MANIFEST_FILENAME,
  HookManifestSchema,
} from "@agentxm/extension-model/unstable/hooks/manifest-schema";
import { isManifestJsonParseFailure } from "../shared/manifest-json.js";
import type { HookRuleContext } from "../../context.js";
import type { AdvisoryFinding, AdvisoryRule } from "../../rule.js";

const RULE_ID = "hook/decision-portability";
const decodeHookManifest = Schema.decodeUnknownResult(HookManifestSchema);

export const decisionPortabilityRule: AdvisoryRule<HookRuleContext> = {
  id: RULE_ID,
  description: "Hook decision requirements state when native support is intentionally narrowed.",
  kind: "advisory",
  severity: "warning",
  check: (context) => {
    if (
      context.subject.hookJson === undefined ||
      isManifestJsonParseFailure(context.subject.hookJson)
    ) {
      return Effect.succeed([]);
    }
    const decoded = decodeHookManifest(context.subject.hookJson, {
      onExcessProperty: "ignore",
      errors: "all",
    });
    if (Result.isFailure(decoded)) return Effect.succeed([]);

    const findings: Array<AdvisoryFinding> = [];
    for (const [index, binding] of decoded.success.bindings.entries()) {
      const decision = binding.requires?.decision.kind;
      if (decision === undefined || decision === "observe") continue;
      findings.push({
        kind: "advisory",
        ruleId: RULE_ID,
        severity: "warning",
        message: `hook.json bindings[${String(index)}].requires.decision.kind is ${decision}, which narrows native agent support and cannot use advisory fallback. Use observe when enforcement is not required, or retain ${decision} and expect unsupported configured agents to be blocked.`,
        location: { file: HOOK_MANIFEST_FILENAME },
      });
    }
    return Effect.succeed(findings);
  },
};
