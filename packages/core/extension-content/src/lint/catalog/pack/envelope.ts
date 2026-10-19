/**
 * `pack/*` manifest envelope — see `../shared/envelope-rules.ts`.
 *
 * Packs are registry-only, so every pack context is expected to carry
 * `pack.json`. A forbidden `packs:` dependency section (packs cannot depend
 * on packs) surfaces as an unrecognized top-level key.
 */

import { PackManifestSchema } from "@agentxm/extension-model/unstable/packs/manifest-schema";
import type { ManifestRuleContext, PackContent } from "../../context.js";
import { makeManifestEnvelopeRules } from "../shared/envelope-rules.js";
import { manifestFilenameForType } from "@agentxm/extension-model/unstable/extensions/common";

export const packEnvelopeRules = makeManifestEnvelopeRules({
  namespace: "pack",
  manifestFile: manifestFilenameForType("pack"),
  schema: PackManifestSchema,
  manifestJson: (context: ManifestRuleContext<PackContent>) => context.subject.packJson,
  presentDescription: "Packs include a root pack.json manifest.",
  presentMissingMessage:
    "pack.json is missing. Create pack.json with the required manifest fields (`owner`, `type`, `name`, `version`).",
  schemaDescription: "pack.json defines a valid pack manifest.",
});
