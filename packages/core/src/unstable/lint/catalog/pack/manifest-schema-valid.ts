/**
 * `pack/manifest-schema-valid` — `pack.json` conforms to
 * `PackManifestSchema`.
 *
 * Delegates to Effect Schema. Issues map 1:1 to findings via
 * `issuesToFindings`.
 *
 * Early-return arm (no findings):
 *
 * - `subject.packJson === undefined` — manifest is absent (covered by
 *   `pack/manifest-present`).
 *
 * Dependency-map FQN grammar and `VersionRange` decode arms are owned by
 * `PackManifestSchema` itself — the dependency sections are typed
 * `Record<FQN, VersionRange>` so unknown FQNs, malformed grammar, and
 * bad semver ranges surface as normal schema issues through the shared
 * `schemaDecodeFindings` plumbing.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { PackRuleContext } from "../../context.js";
import type { AdvisoryRule } from "../../rule.js";
import { PackManifestSchema } from "../../../packs/manifest-schema.js";
import { schemaDecodeFindings } from "../shared/schema-rule.js";

const RULE_ID = "pack/manifest-schema-valid";
const PACK_JSON = "pack.json";

export const manifestSchemaValidRule: AdvisoryRule<PackRuleContext> = {
  id: RULE_ID,
  description: "pack.json defines a valid pack manifest.",
  kind: "advisory",
  severity: "error",
  check: (context) =>
    schemaDecodeFindings(RULE_ID, "error", PACK_JSON, PackManifestSchema, context.subject.packJson),
};
