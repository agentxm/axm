import type { UninstallRetentionPolicy } from "@agentxm/client-core/unstable/extensions";
import type { WorkspaceMutationsService } from "@agentxm/client-core/unstable/workspace";

export const makeWorkspaceRetentionPolicy = (
  ws: WorkspaceMutationsService,
): UninstallRetentionPolicy => ({
  isRequiredByInstalledPack: (args) => ws.isExtensionRequiredByInstalledPack(args.target),
});
