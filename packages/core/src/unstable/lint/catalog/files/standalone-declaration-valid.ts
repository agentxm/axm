/**
 * `files/standalone-declaration-valid` — a manifest that opts out of standalone
 * use names the packs it needs. See `../shared/recommended-packs-rules.ts`.
 */

import type { FilesRuleContext } from "../../context.js";
import type { AdvisoryRule } from "../../rule.js";
import { FILES_MANIFEST_FILENAME } from "../../../files/manifest-schema.js";
import { makeStandaloneDeclarationValidRule } from "../shared/recommended-packs-rules.js";

export const standaloneDeclarationValidRule: AdvisoryRule<FilesRuleContext> =
  makeStandaloneDeclarationValidRule<FilesRuleContext>({
    namespace: "files",
    manifestFile: FILES_MANIFEST_FILENAME,
    manifestJson: (context) => context.subject.filesJson,
  });
