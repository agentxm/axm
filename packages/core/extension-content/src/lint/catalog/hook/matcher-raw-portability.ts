import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import {
  HookManifestSchema,
  HOOK_MANIFEST_FILENAME,
} from "@agentxm/extension-model/unstable/hooks/manifest-schema";
import { isManifestJsonParseFailure } from "../shared/manifest-json.js";
import type { HookRuleContext } from "../../context.js";
import type { AdvisoryFinding, AdvisoryRule } from "../../rule.js";

const RULE_ID = "hook/matcher-raw-portability";

const decodeHookManifest = Schema.decodeUnknownResult(HookManifestSchema);

export const matcherRawPortabilityRule: AdvisoryRule<HookRuleContext> = {
  id: RULE_ID,
  description: "Hook matchers use portable canonical tool matches where possible.",
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
    if (Result.isFailure(decoded)) {
      return Effect.succeed([]);
    }

    const findings: Array<AdvisoryFinding> = [];
    for (const binding of decoded.success.bindings) {
      if (binding.matcherRaw !== undefined) {
        findings.push({
          kind: "advisory",
          ruleId: RULE_ID,
          severity: "warning",
          message:
            "hook.json uses matcherRaw, which is native-agent-specific and not portable. Prefer `match.tools` with canonical tool IDs.",
          location: { file: HOOK_MANIFEST_FILENAME },
        });
      }
      for (const target of Object.values(binding.targets ?? {})) {
        if (target.matcherRaw !== undefined) {
          findings.push({
            kind: "advisory",
            ruleId: RULE_ID,
            severity: "warning",
            message:
              "hook.json uses a target matcherRaw override, which is native-agent-specific and not portable.",
            location: { file: HOOK_MANIFEST_FILENAME },
          });
        }
      }
    }

    return Effect.succeed(findings);
  },
};
