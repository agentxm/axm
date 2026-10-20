/**
 * Per-type install command guidance.
 *
 * Every extension type group registers an `install` subcommand, so the segment
 * list and the command spelling both come straight from the type table.
 */

import { extensionTypePluralSegments } from "@agentxm/extension-model/unstable/extensions";

/** Plural type segments whose command group exposes an `install` subcommand. */
export const perTypeInstallPluralSegments: ReadonlyArray<string> = extensionTypePluralSegments;
