/**
 * `pack/manifest-keys-recognized` — `pack.json` contains only keys
 * declared by `PackManifestSchema`.
 *
 * The paired `-schema-valid` rule ignores excess properties by construction
 * (`onExcessProperty: "ignore"`); this rule rejects them so publish never
 * silently drops unrecognized manifest data.
 *
 * A forbidden `packs:` dependency section (ONTOLOGY D015 "Cross-Domain
 * Pack Semantics") decodes as an unrecognized top-level key here
 * and surfaces at error severity here.
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
import { PackManifestSchema } from "@agentxm/extension-model/unstable/packs/manifest-schema";
import { enumerateUnknownTopLevelKeys, structFieldKeys } from "../shared/schema-rule.js";

const RULE_ID = "pack/manifest-keys-recognized";
const PACK_JSON = "pack.json";

const allowedKeys = structFieldKeys(PackManifestSchema);

export const manifestKeysRecognizedRule: AdvisoryRule<PackRuleContext> = {
  id: RULE_ID,
  description: "pack.json uses only supported top-level fields.",
  kind: "advisory",
  severity: "error",
  check: (context) =>
    Effect.succeed(
      enumerateUnknownTopLevelKeys(
        RULE_ID,
        "error",
        PACK_JSON,
        allowedKeys,
        context.subject.packJson,
      ),
    ),
};
