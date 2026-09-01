import * as Effect from "effect/Effect";
import type { UninstallRetentionPolicy } from "@agentxm/extension-management/unstable/extensions";
import type { WorkspaceMutationsService } from "@agentxm/extension-management/unstable/workspace";
import { toAppError } from "@agentxm/extension-management/unstable/app-error/conversions";

export const makeWorkspaceRetentionPolicy = (
  ws: WorkspaceMutationsService,
): UninstallRetentionPolicy => ({
  isRequiredByInstalledPack: (args) =>
    ws.isExtensionRequiredByInstalledPack(args.target).pipe(Effect.mapError(toAppError)),
});
