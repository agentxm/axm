/** The facts every per-type list row carries. */

import type { ExtensionInventoryRow } from "../../desired-state/index.js";
import type { ConfiguredAgentOutcome } from "../../operations/index.js";

/** Facts every per-type list row carries. */
export interface TypeListRow {
  readonly name: string;
  readonly lifecycle: ExtensionInventoryRow["classification"]["lifecycle"];
  readonly enabled: boolean | null;
  readonly agents: ReadonlyArray<string>;
  readonly agentOutcomes: ReadonlyArray<ConfiguredAgentOutcome>;
}
