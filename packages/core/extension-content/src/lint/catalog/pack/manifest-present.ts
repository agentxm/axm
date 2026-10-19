/**
 * `pack/manifest-present` — packs must have a `pack.json` at the
 * pack root.
 *
 * Packs are registry-only at v1; every pack context is expected to expose a
 * manifest. Unlike `skill/manifest-present`, there is no native-vs-non-native
 * split — the rule applies to every pack context unconditionally.
 *
 * Advisory-only — scaffolding a manifest is `axm packs new` (a user-authored
 * action) per the lint design.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { ManifestRuleContext, PackContent } from "../../context.js";
import { makeManifestPresentRule } from "../shared/manifest-present.js";
import { manifestFilenameForType } from "@agentxm/extension-model/unstable/extensions/common";

const RULE_ID = "pack/manifest-present";

export const manifestPresentRule = makeManifestPresentRule<ManifestRuleContext<PackContent>>({
  ruleId: RULE_ID,
  description: "Packs include a root pack.json manifest.",
  manifestFile: manifestFilenameForType("pack"),
  missingMessage:
    "pack.json is missing. Create pack.json with the required manifest fields (`owner`, `type`, `name`, `version`).",
});
