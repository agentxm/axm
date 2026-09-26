/** The facts every per-type list row carries. */

import type { ExtensionInventoryRow } from "@agentxm/workspace-kernel/workspace-state";
import type { ConfiguredAgentOutcome } from "@agentxm/workspace-kernel/operations";

/** Facts every per-type list row carries. */
export interface TypeListRow {
  readonly name: string;
  readonly lifecycle: ExtensionInventoryRow["classification"]["lifecycle"];
  readonly enabled: boolean | null;
  readonly agents: ReadonlyArray<string>;
  readonly agentOutcomes: ReadonlyArray<ConfiguredAgentOutcome>;
}
