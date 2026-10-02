import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { AGENTS_BY_ID, installable } from "@agentxm/extension-model/unstable/agent-capabilities";
import {
  HookManifestSchema,
  HOOK_MANIFEST_FILENAME,
} from "@agentxm/extension-model/unstable/hooks/manifest-schema";
import { isManifestJsonParseFailure } from "../shared/manifest-json.js";
import type { HookRuleContext } from "../../context.js";
import type { AdvisoryFinding, AdvisoryRule } from "../../rule.js";

const RULE_ID = "hook/native-bindings-supported";
export const nativeBindingsSupportedRule: AdvisoryRule<HookRuleContext> = {
  id: RULE_ID,
  description: "Native Hook events preserve every required outcome and modification operation.",
  kind: "advisory",
  severity: "error",
  check: (context) => {
    if (
      context.subject.hookJson === undefined ||
      isManifestJsonParseFailure(context.subject.hookJson)
    )
      return Effect.succeed([]);
    const decoded = Schema.decodeUnknownResult(HookManifestSchema)(context.subject.hookJson, {
      onExcessProperty: "error",
    });
    if (Result.isFailure(decoded)) return Effect.succeed([]);
    const findings: Array<AdvisoryFinding> = [];
    for (const implementation of decoded.success.implementations) {
      for (const binding of implementation.bindings) {
        const verdict = installable(AGENTS_BY_ID[implementation.protocol], binding);
        if (!verdict.installable)
          findings.push({
            kind: "advisory",
            ruleId: RULE_ID,
            severity: "error",
            message: `Implementation '${implementation.id}', binding '${binding.id}': ${verdict.reason}`,
            location: { file: HOOK_MANIFEST_FILENAME },
          });
      }
    }
    return Effect.succeed(findings);
  },
};
