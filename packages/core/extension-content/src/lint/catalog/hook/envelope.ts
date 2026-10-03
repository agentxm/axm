/**
 * `hook/*` manifest envelope — see `../shared/envelope-rules.ts`.
 */

import {
  HookManifestSchema,
  HOOK_MANIFEST_FILENAME,
} from "@agentxm/extension-model/unstable/hooks/manifest-schema";
import type { HookRuleContext } from "../../context.js";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { issuesToFindings } from "../../issues-to-findings.js";
import { isManifestJsonParseFailure } from "../shared/manifest-json.js";
import { makeManifestEnvelopeRules } from "../shared/envelope-rules.js";

const envelope = makeManifestEnvelopeRules({
  namespace: "hook",
  manifestFile: HOOK_MANIFEST_FILENAME,
  schema: HookManifestSchema,
  manifestJson: (context: HookRuleContext) => context.subject.hookJson,
  presentDescription: "Hooks include a root hook.json manifest.",
  presentMissingMessage:
    "hook.json is missing. Create hook.json with the required manifest fields (`owner`, `type`, `name`, `version`, `implementations`).",
  schemaDescription: "hook.json defines a valid hook manifest.",
});

export const hookEnvelopeRules = {
  ...envelope,
  manifestSchemaValid: {
    ...envelope.manifestSchemaValid,
    check: (context: HookRuleContext) => {
      const input = context.subject.hookJson;
      if (input === undefined || isManifestJsonParseFailure(input))
        return envelope.manifestSchemaValid.check(context);
      const decoded = Schema.decodeUnknownResult(HookManifestSchema)(input, {
        onExcessProperty: "error",
        errors: "all",
      });
      return Effect.succeed(
        Result.isSuccess(decoded)
          ? []
          : issuesToFindings(
              "hook/manifest-schema-valid",
              "error",
              HOOK_MANIFEST_FILENAME,
              decoded.failure.issue,
            ),
      );
    },
  },
};
