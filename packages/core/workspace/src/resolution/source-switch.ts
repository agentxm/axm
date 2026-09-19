/**
 * A source acceptance proposed by a lifecycle plan step.
 *
 * The full ref stays inside the in-memory candidate. Public operation output
 * receives only the sanitized source-switch evidence derived from it.
 */

import type { ExtensionType } from "@agentxm/extension-model/unstable/extensions/common";
import type { ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";

export interface SourceBindingProposal {
  readonly extensionType: ExtensionType;
  readonly target: string;
  readonly ref: ExtensionRef;
  /** Target Pack graph, when the proposal represents one atomic Pack switch. */
  readonly members?: ReadonlyArray<ExtensionRef>;
  /** Accepted Pack members from the exact graph the transition replaces. */
  readonly previousMembers?: ReadonlyArray<{
    readonly ref: ExtensionRef;
    readonly retained: boolean;
  }>;
}
