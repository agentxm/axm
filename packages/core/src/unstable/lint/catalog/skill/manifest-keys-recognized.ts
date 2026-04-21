/**
 * `skill/manifest-keys-recognized` — `skill.json` contains only keys
 * declared by `SkillManifestSchema`.
 *
 * The paired `-schema-valid` rule ignores excess properties by construction
 * (`onExcessProperty: "ignore"`); this rule surfaces them at warning severity
 * so newer-schema manifests can roll out ahead of registry deploys.
 *
 * Allowed-keys set is derived from `SkillManifestSchema.fields` — no
 * copy-paste of field names. A schema gain (or rename) automatically updates
 * the allowlist.
 *
 * Early-return arms (no findings):
 *
 * - `subject.isNative === false` — non-native skills have no manifest to
 *   check.
 * - `subject.skillJson === undefined` / non-object — nothing to enumerate;
 *   `skill/manifest-present` owns the absence case.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";
import type { SkillRuleContext } from "../../context.js";
import type { AdvisoryRule } from "../../rule.js";
import { SkillManifestSchema } from "../../../skills/manifest-schema.js";
import { enumerateUnknownTopLevelKeys, structFieldKeys } from "../shared/schema-rule.js";

const RULE_ID = "skill/manifest-keys-recognized";
const SKILL_JSON = "skill.json";

const allowedKeys = structFieldKeys(SkillManifestSchema);

export const manifestKeysRecognizedRule: AdvisoryRule<SkillRuleContext> = {
  id: RULE_ID,
  description: "skill.json contains only keys recognized by SkillManifestSchema.",
  kind: "advisory",
  severity: "warning",
  check: (context) => {
    if (!context.subject.isNative) {
      return Effect.succeed([]);
    }
    return Effect.succeed(
      enumerateUnknownTopLevelKeys(
        RULE_ID,
        "warning",
        SKILL_JSON,
        allowedKeys,
        context.subject.skillJson,
      ),
    );
  },
};
