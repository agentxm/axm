/**
 * `hook/*` manifest envelope — see `../shared/envelope-rules.ts`.
 */

import { HookManifestSchema, HOOK_MANIFEST_FILENAME } from "../../../hooks/manifest-schema.js";
import type { HookRuleContext } from "../../context.js";
import { makeManifestEnvelopeRules } from "../shared/envelope-rules.js";

export const hookEnvelopeRules = makeManifestEnvelopeRules({
  namespace: "hook",
  manifestFile: HOOK_MANIFEST_FILENAME,
  schema: HookManifestSchema,
  manifestJson: (context: HookRuleContext) => context.subject.hookJson,
  presentDescription: "Hooks include a root hook.json manifest.",
  presentMissingMessage:
    "hook.json is missing. Create hook.json with the required manifest fields (`owner`, `type`, `name`, `version`, `runtime`, `entrypoint`, `bindings`).",
  schemaDescription: "hook.json defines a valid hook manifest.",
});
