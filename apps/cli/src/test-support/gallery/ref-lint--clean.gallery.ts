import { lintFrame } from "./samples/lint-findings.js";
import { galleryModule } from "./fixture.js";

/**
 * No findings (*Reference cases*, board `3 · Lint`, frame *Clean, drifted and
 * quiet*, first transcript).
 *
 * There are no rows, so there is no title and no ledger: the verdict stands
 * alone with its own mark. The canvas's aside counts extensions, rules, and
 * elapsed time; lint reports none of those, so it states where it ran.
 */
const refLintClean = lintFrame([]);

export default galleryModule({
  _tag: "document",
  name: "ref-lint--clean",
  doc: refLintClean,
});
