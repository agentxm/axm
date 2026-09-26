/**
 * Per-type install command guidance.
 *
 * Every extension type group registers an `install` subcommand, so the segment
 * list and the command spelling both come straight from the type table.
 */

import {
  extensionTypeSentenceLabels,
  extensionTypePluralSegments,
  extensionTypeToPlural,
  type ExtensionType,
} from "@agentxm/extension-model/unstable/extensions";

/** Plural type segments whose command group exposes an `install` subcommand. */
export const perTypeInstallPluralSegments: ReadonlyArray<string> = extensionTypePluralSegments;

/** The install command that resolves for `type`, given an FQN or source. */
export const installCommandFor = (type: ExtensionType, source: string): string =>
  `axm ${extensionTypeToPlural[type]} install ${source}`;

/** Source argument guidance shared by every typed install command. */
export const installSourceArgumentDescription = (type: ExtensionType): string =>
  `${extensionTypeSentenceLabels[type]} source (Registry FQN @owner/${extensionTypeToPlural[type]}/name[@version], self-describing Git locator, or path locator)`;
