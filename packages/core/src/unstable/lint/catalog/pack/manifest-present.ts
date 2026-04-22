/**
 * `pack/manifest-present` — packs must have an `extension-pack.json` at the
 * pack root.
 *
 * Packs are registry-only at v1; every pack context is expected to expose a
 * manifest. Unlike `skill/manifest-present`, there is no native-vs-non-native
 * split — the rule applies to every pack context unconditionally.
 *
 * Advisory-only — scaffolding a manifest is `axm packs new` (a user-authored
 * action) per `docs/design/lint-engine.md §10.pack (Notes)`.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";
import type { PackRuleContext } from "../../context.js";
import type { AdvisoryFinding, AdvisoryRule } from "../../rule.js";

const RULE_ID = "pack/manifest-present";
const EXTENSION_PACK_JSON = "extension-pack.json";

export const manifestPresentRule: AdvisoryRule<PackRuleContext> = {
  id: RULE_ID,
  description: "Packs include a root extension-pack.json manifest.",
  kind: "advisory",
  severity: "error",
  check: (context) =>
    Effect.map(
      context.files.exists(EXTENSION_PACK_JSON),
      (present): ReadonlyArray<AdvisoryFinding> => {
        if (present) {
          return [];
        }
        return [
          {
            kind: "advisory",
            ruleId: RULE_ID,
            severity: "error",
            message:
              "extension-pack.json is missing. Create extension-pack.json with the required manifest fields (`owner`, `type`, `name`, `version`).",
            location: { file: EXTENSION_PACK_JSON },
          },
        ];
      },
    ),
};
