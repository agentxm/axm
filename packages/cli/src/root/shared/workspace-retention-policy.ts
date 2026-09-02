import * as Effect from "effect/Effect";
import type { UninstallRetentionPolicy } from "@agentxm/extension-workspace";
import type { AppError } from "../../app-error/index.js";
import type { WorkspaceMutationsService } from "@agentxm/workspace-state";
import { toAppError } from "../../app-error/conversions.js";

export const makeWorkspaceRetentionPolicy = (
  ws: WorkspaceMutationsService,
): UninstallRetentionPolicy<AppError> => ({
  isRequiredByInstalledPack: (args) =>
    ws.isExtensionRequiredByInstalledPack(args.target).pipe(Effect.mapError(toAppError)),
});
