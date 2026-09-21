import { operationDoc } from "../../operation-view.js";
import { releaseAgeDoc } from "../../operation-output.js";
import { partialUpdate, partialUpdateReleaseAge } from "./samples/operation-stress.js";

/**
 * A project-wide update that applied five of thirteen units and failed seven.
 *
 * This is the frame the shared ledger was losing: every failed unit has a
 * reason its producer stated, each one longer than any cell the width can
 * spare, and the reader has to choose what to do next without re-running a
 * command that already changed the workspace. The exemption callout beneath
 * the verdict describes a unit on the same ledger, so the two have to agree.
 */
export const refUpdatePartial = [
  ...operationDoc(partialUpdate, {
    verbosity: "normal",
    suggestions: [{ description: "Inspect installed extensions", cmd: "axm list" }],
  }),
  ...releaseAgeDoc("update", partialUpdateReleaseAge),
];
