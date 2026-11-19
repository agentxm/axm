import * as Schema from "effect/Schema";

import { KnowledgeLintQueryResultSchema } from "@agentxm/workspace-features/knowledge-query";

import { galleryModule } from "../../test-support/gallery/fixture.js";
import { knowledgeLintDoc } from "./lint-view.js";

const findings = Schema.decodeUnknownSync(KnowledgeLintQueryResultSchema)({
  valid: false,
  diagnostics: [
    {
      bundle: "platform",
      code: "frontmatter-parse",
      ruleSet: "okf-conformance",
      severity: "error",
      relativePath: "auth.md",
      line: 5,
      column: 1,
      message: "Invalid YAML frontmatter: Missing closing quote.",
    },
    {
      bundle: "platform",
      code: "description-length",
      ruleSet: "agentxm-profile",
      severity: "warning",
      relativePath: "index.md",
      message: "Description is longer than 200 characters",
    },
  ],
});

/**
 * Knowledge validation reads as `axm lint` does: a findings ledger with the
 * rule set beneath each finding, and the counts with the exit code last.
 */
export default galleryModule(
  {
    _tag: "document",
    name: "ref-knowledge-lint--findings",
    doc: knowledgeLintDoc(findings, { bundleCount: 3, errorCount: 1 }),
  },
  {
    _tag: "document",
    name: "ref-knowledge-lint--clean",
    doc: knowledgeLintDoc({ valid: true, diagnostics: [] }, { bundleCount: 3, errorCount: 0 }),
  },
);
