import type { UninstallRetentionPolicy } from "@agentxm/extension-management/unstable/extensions";
import type { WorkspaceMutationsService } from "@agentxm/extension-management/unstable/workspace";

export const makeWorkspaceRetentionPolicy = (
  ws: WorkspaceMutationsService,
): UninstallRetentionPolicy => ({
  isRequiredByInstalledPack: (args) => ws.isExtensionRequiredByInstalledPack(args.target),
});
