/**
 * `pack/manifest-schema-valid` — `extension-pack.json` conforms to
 * `ExtensionPackManifestSchema`.
 *
 * Delegates to Effect Schema per `docs/design/lint-engine.md §4`
 * ("Schema-valid rules delegate to Effect Schema"). Issues map 1:1 to
 * findings via `issuesToFindings`.
 *
 * Early-return arm (no findings):
 *
 * - `subject.packJson === undefined` — manifest is absent (covered by
 *   `pack/manifest-present`).
 *
 * Dependency-map FQN grammar and `VersionConstraint` decode arms are owned by
 * `ExtensionPackManifestSchema` itself — the dependency sections are typed
 * `Record<FQN, VersionConstraint>` so unknown FQNs, malformed grammar, and
 * bad semver ranges surface as normal schema issues through the shared
 * `schemaDecodeFindings` plumbing.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { PackRuleContext } from "../../context.js";
import type { AdvisoryRule } from "../../rule.js";
import { ExtensionPackManifestSchema } from "../../../packs/manifest-schema.js";
import { schemaDecodeFindings } from "../shared/schema-rule.js";

const RULE_ID = "pack/manifest-schema-valid";
const EXTENSION_PACK_JSON = "extension-pack.json";

export const manifestSchemaValidRule: AdvisoryRule<PackRuleContext> = {
  id: RULE_ID,
  description: "extension-pack.json defines a valid pack manifest.",
  kind: "advisory",
  severity: "error",
  check: (context) =>
    schemaDecodeFindings(
      RULE_ID,
      "error",
      EXTENSION_PACK_JSON,
      ExtensionPackManifestSchema,
      context.subject.packJson,
    ),
};
