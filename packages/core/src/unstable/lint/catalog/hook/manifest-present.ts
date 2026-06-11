import { HOOK_MANIFEST_FILENAME } from "../../../hooks/manifest-schema.js";
import type { HookRuleContext } from "../../context.js";
import { makeManifestPresentRule } from "../shared/manifest-present.js";

const RULE_ID = "hook/manifest-present";

export const manifestPresentRule = makeManifestPresentRule<HookRuleContext>({
  id: RULE_ID,
  description: "Hooks include a root hook.json manifest.",
  manifestFile: HOOK_MANIFEST_FILENAME,
  message:
    "hook.json is missing. Create hook.json with the required manifest fields (`owner`, `type`, `name`, `version`, `runtime`, `entrypoint`, `bindings`).",
  exists: (context, manifestFile) => context.files.exists(manifestFile),
});
