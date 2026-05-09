/**
 * `pack/manifest-keys-recognized` — `pack.json` contains only keys
 * declared by `PackManifestSchema`.
 *
 * The paired `-schema-valid` rule ignores excess properties by construction
 * (`onExcessProperty: "ignore"`); this rule surfaces them at warning severity
 * so newer-schema manifests can roll out ahead of registry deploys.
 *
 * A forbidden `packs:` dependency section (ONTOLOGY D015 "Cross-Domain
 * Pack Semantics") decodes as an unrecognized top-level key here
 * and surfaces at warning severity in v1; there is no dedicated error-severity
 * rule for the `packs:` case — see `docs/design/lint-engine.md §10.pack
 * (Notes)`. A stricter error-severity enforcement can ship in v1.5+ if real
 * publish traffic motivates it.
 *
 * Allowed-keys set is derived from `PackManifestSchema.fields` — no
 * copy-paste of field names. A schema gain (or rename) automatically updates
 * the allowlist.
 *
 * Early-return arm (no findings):
 *
 * - `subject.packJson === undefined` / non-object — nothing to enumerate;
 *   `pack/manifest-present` owns the absence case.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";
import type { PackRuleContext } from "../../context.js";
import type { AdvisoryRule } from "../../rule.js";
import { PackManifestSchema } from "../../../packs/manifest-schema.js";
import { enumerateUnknownTopLevelKeys, structFieldKeys } from "../shared/schema-rule.js";

const RULE_ID = "pack/manifest-keys-recognized";
const PACK_JSON = "pack.json";

const allowedKeys = structFieldKeys(PackManifestSchema);

export const manifestKeysRecognizedRule: AdvisoryRule<PackRuleContext> = {
  id: RULE_ID,
  description: "pack.json uses only supported top-level fields.",
  kind: "advisory",
  severity: "warning",
  check: (context) =>
    Effect.succeed(
      enumerateUnknownTopLevelKeys(
        RULE_ID,
        "warning",
        PACK_JSON,
        allowedKeys,
        context.subject.packJson,
      ),
    ),
};
