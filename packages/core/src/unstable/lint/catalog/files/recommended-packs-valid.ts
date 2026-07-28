/**
 * `files/recommended-packs-valid` — recommended packs are bare FQNs, never
 * version-ranged specs. See `../shared/recommended-packs-rules.ts`.
 */

import type { FilesRuleContext } from "../../context.js";
import type { AdvisoryRule } from "../../rule.js";
import { FILES_MANIFEST_FILENAME } from "../../../files/manifest-schema.js";
import { makeRecommendedPacksValidRule } from "../shared/recommended-packs-rules.js";

export const recommendedPacksValidRule: AdvisoryRule<FilesRuleContext> =
  makeRecommendedPacksValidRule<FilesRuleContext>({
    namespace: "files",
    manifestFile: FILES_MANIFEST_FILENAME,
    manifestJson: (context) => context.subject.filesJson,
  });
