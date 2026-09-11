/**
 * Whether a removal may delete the package it withdraws.
 *
 * An extension declared directly and also required by an installed pack keeps
 * its package when the direct declaration goes: the pack still depends on it.
 * The membership fact is workspace state's; deciding that it means "retain"
 * is this feature's.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";

import type { UninstallRetentionPolicy } from "@agentxm/extension-materialization";
import type { WorkspaceMutationsService } from "@agentxm/workspace-state";

import type { ExtensionLifecycleFailed } from "../errors.js";
import { installRefused } from "../install/vocabulary.js";

/** Retain a package an installed pack still requires. */
export const makeWorkspaceRetentionPolicy = (
  ws: WorkspaceMutationsService,
): UninstallRetentionPolicy<ExtensionLifecycleFailed> => ({
  isRequiredByInstalledPack: (args) =>
    ws.isExtensionRequiredByInstalledPack(args.target).pipe(
      Effect.mapError((cause) =>
        installRefused({
          category: "internal",
          detail: `Pack membership for ${args.target.type} "${args.target.name}" could not be read`,
          cause,
        }),
      ),
    ),
});

/**
 * A pack's own exclusive members carry no separate retention question: the
 * pack that required them is being removed in the same transition.
 */
export const exclusiveMemberRetentionPolicy: UninstallRetentionPolicy<ExtensionLifecycleFailed> = {
  isRequiredByInstalledPack: () => Effect.succeed(false),
};
