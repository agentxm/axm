/**
 * `skill/manifest-schema-valid` — `skill.json` conforms to
 * `SkillManifestSchema`.
 *
 * Delegates to Effect Schema. Issues map 1:1 to findings via
 * `issuesToFindings`.
 *
 * Early-return arms (no findings):
 *
 * - `subject.isNative === false` — non-native skills have no manifest to
 *   check (complement of `skill/manifest-present`).
 * - `subject.skillJson === undefined` — manifest is absent (covered by
 *   `skill/manifest-present`).
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { SkillRuleContext } from "../../context.js";
import type { AdvisoryRule } from "../../rule.js";
import { SkillManifestSchema } from "../../../skills/manifest-schema.js";
import { schemaDecodeFindings } from "../shared/schema-rule.js";

const RULE_ID = "skill/manifest-schema-valid";
const SKILL_JSON = "skill.json";

export const manifestSchemaValidRule: AdvisoryRule<SkillRuleContext> = {
  id: RULE_ID,
  description: "skill.json defines a valid skill manifest.",
  kind: "advisory",
  severity: "error",
  check: (context) => {
    if (!context.subject.isNative) {
      // Non-native skills have no skill.json to schema-validate. The
      // presence rule (manifest-present) does not fire for non-native either.
      return schemaDecodeFindings(RULE_ID, "error", SKILL_JSON, SkillManifestSchema, undefined);
    }
    return schemaDecodeFindings(
      RULE_ID,
      "error",
      SKILL_JSON,
      SkillManifestSchema,
      context.subject.skillJson,
    );
  },
};
