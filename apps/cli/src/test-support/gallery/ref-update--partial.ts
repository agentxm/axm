import { operationDoc } from "../../operation-view.js";
import { releaseAgeDoc } from "../../operation-output.js";
import { partialUpdate, partialUpdateReleaseAge } from "./samples/operation-stress.js";

/**
 * A project-wide update that applied five of thirteen units and failed seven.
 *
 * This is the frame the shared ledger was losing: every failed unit has a
 * reason its producer stated, each one longer than any cell the width can
 * spare, and the reader has to choose what to do next without re-running a
 * command that already changed the workspace. The exemption callout stands
 * with the ledger it describes, where a reader can hold the two against each
 * other, and `Next` offers the route that covers the units still waiting.
 */
const unsettled = new Set(
  partialUpdate.units
    .filter((unit) => unit.state !== "committed" && unit.state !== "unchanged")
    .map((unit) => unit.label.split("/").at(-1) ?? unit.label),
);

export const refUpdatePartial = operationDoc(partialUpdate, {
  verbosity: "normal",
  suggestions: [
    {
      description: "Try the extensions that did not update again",
      cmd: "axm update",
    },
  ],
  callouts: releaseAgeDoc({ command: ["update"], arguments: [] }, partialUpdateReleaseAge, {
    unsettled,
  }),
});
