/**
 * Per-type install command guidance.
 *
 * Every extension type group registers an `install` subcommand, so the segment
 * list and the command spelling both come straight from the type table.
 */

import {
  extensionTypePluralSegments,
  extensionTypeToPlural,
  type ExtensionType,
} from "@agentxm/extension-model/unstable/extensions";

/** Plural type segments whose command group exposes an `install` subcommand. */
export const perTypeInstallPluralSegments: ReadonlyArray<string> = extensionTypePluralSegments;

/** The install command that resolves for `type`, given an FQN or source. */
export const installCommandFor = (type: ExtensionType, source: string): string =>
  `axm ${extensionTypeToPlural[type]} install ${source}`;
