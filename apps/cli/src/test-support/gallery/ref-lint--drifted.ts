import { lintFrame } from "./lint-findings.js";

/**
 * A drift banner with nothing else to report (*Reference cases*, board `3 ·
 * Lint`, frame *Clean, drifted and quiet*, second transcript).
 *
 * The banner is a callout, and the verdict beneath it says there is nothing
 * else. The canvas draws drift from `axm.json`; the banner lint carries is the
 * publish-gate drift of locally weakened registry rules, so that is what the
 * callout names.
 */
export const refLintDrifted = lintFrame([], {
  driftBanner: ["skill/description-present", "pack/member-pinned"],
});
