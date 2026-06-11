import type { CommandRuleContext } from "../../context.js";
import { makeManifestPresentRule } from "../shared/manifest-present.js";

const RULE_ID = "command/manifest-present";
const COMMAND_JSON = "command.json";

export const manifestPresentRule = makeManifestPresentRule<CommandRuleContext>({
  id: RULE_ID,
  description: "Commands include a root command.json manifest.",
  manifestFile: COMMAND_JSON,
  message:
    "command.json is missing. Create command.json with the required manifest fields (`owner`, `type`, `name`, `version`).",
  exists: (context, manifestFile) => context.files.exists(manifestFile),
});
