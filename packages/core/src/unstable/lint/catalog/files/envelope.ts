/**
 * `files/*` manifest envelope — see `../shared/envelope-rules.ts`.
 */

import { FilesManifestSchema, FILES_MANIFEST_FILENAME } from "../../../files/manifest-schema.js";
import type { FilesRuleContext } from "../../context.js";
import { makeManifestEnvelopeRules } from "../shared/envelope-rules.js";

export const filesEnvelopeRules = makeManifestEnvelopeRules({
  namespace: "files",
  manifestFile: FILES_MANIFEST_FILENAME,
  schema: FilesManifestSchema,
  manifestJson: (context: FilesRuleContext) => context.subject.filesJson,
  presentDescription: "files packages include a root files.json manifest.",
  presentMissingMessage:
    "files.json is missing. Create files.json with the required manifest fields (`owner`, `type`, `name`, `version`, `contents`).",
  schemaDescription: "files.json defines a valid files manifest.",
});
