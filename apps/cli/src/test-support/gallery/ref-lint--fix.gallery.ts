import {
  floatingMember,
  lintFrame,
  missingDescription,
  staleLockfile,
} from "./samples/lint-findings.js";
import { galleryModule } from "./fixture.js";

/**
 * `axm lint --fix` (*Reference cases*, board `3 · Lint`, frame *lint --fix — a
 * fix is an ordinary change row; what remains is an ordinary finding*).
 *
 * What the fix repaired is an ordinary `~` change row marked `fixed`, above
 * the findings that remain. The verdict claims what was fixed and counts what
 * still needs a person, with the exit code the remaining error sets.
 */
const refLintFix = lintFrame([missingDescription, floatingMember], {
  fix: true,
  repaired: [staleLockfile],
});

export default galleryModule({
  _tag: "document",
  name: "ref-lint--fix",
  doc: refLintFix,
});
