import * as Effect from "effect/Effect";
import type { UninstallRetentionPolicy } from "@agentxm/extension-workspace";
import type { AppError } from "@agentxm/extension-management/unstable/app-error";
import type { WorkspaceMutationsService } from "@agentxm/workspace-state";
import { toAppError } from "@agentxm/extension-management/unstable/app-error/conversions";

export const makeWorkspaceRetentionPolicy = (
  ws: WorkspaceMutationsService,
): UninstallRetentionPolicy<AppError> => ({
  isRequiredByInstalledPack: (args) =>
    ws.isExtensionRequiredByInstalledPack(args.target).pipe(Effect.mapError(toAppError)),
});
