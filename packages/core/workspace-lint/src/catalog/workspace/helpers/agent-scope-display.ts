import { extensionTypeSentenceLabels } from "@agentxm/extension-model/unstable/extensions/common";
import type { AgentOutputObservation } from "@agentxm/workspace-projection";

/** A path under the user home as `~/<relative>`; any other path unchanged. */
export const userDisplayPath = (home: string, file: string): string => {
  const prefix = `${home}/`;
  return file.startsWith(prefix) ? `~/${file.slice(prefix.length)}` : file;
};

/** Up to three agent ids by name, otherwise their count. */
export const agentsDisplay = (agentIds: ReadonlyArray<string>): string =>
  agentIds.length <= 3 ? agentIds.join(", ") : `${agentIds.length} agents`;

export const outputTypeLabel = (type: AgentOutputObservation["extensionType"]): string =>
  extensionTypeSentenceLabels[type];
