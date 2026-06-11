import type { FilesRuleContext } from "../../context.js";
import { makeManifestPresentRule } from "../shared/manifest-present.js";
import { FILES_JSON } from "./helpers.js";

const RULE_ID = "files/manifest-present";

export const manifestPresentRule = makeManifestPresentRule<FilesRuleContext>({
  ruleId: RULE_ID,
  description: "files packages include a root files.json manifest.",
  manifestFile: FILES_JSON,
  missingMessage:
    "files.json is missing. Create files.json with the required manifest fields (`owner`, `type`, `name`, `version`, `contents`).",
});
