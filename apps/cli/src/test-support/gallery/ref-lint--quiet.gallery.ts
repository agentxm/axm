import {
  floatingMember,
  lintFrame,
  missingDescription,
  staleLockfile,
} from "./samples/lint-findings.js";
import { galleryModule } from "./fixture.js";

/**
 * `axm lint --quiet` (*Reference cases*, board `3 · Lint`, frame *Clean,
 * drifted and quiet*, third transcript).
 *
 * Quiet keeps the verdict and drops the ledger around it. The canvas draws the
 * line without a mark; it keeps the ✖ here, because a problem with no ledger
 * above it leads with its glyph.
 */
const refLintQuiet = lintFrame([staleLockfile, missingDescription, floatingMember], {
  verbosity: "quiet",
});

export default galleryModule({
  _tag: "document",
  name: "ref-lint--quiet",
  doc: refLintQuiet,
});
