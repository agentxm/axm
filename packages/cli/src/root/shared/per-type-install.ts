/**
 * Per-type install command guidance.
 *
 * Every extension type group except `rules` registers an `install` subcommand.
 * The `rules` group only toggles instruction-file management
 * (`axm rules enable|disable`), so rule extensions install through the root
 * `axm install` command instead.
 */

import {
  extensionTypePluralSegments,
  extensionTypeToPlural,
  type ExtensionType,
} from "@agentxm/client-core/unstable/extensions";

/** Plural type segments whose command group exposes an `install` subcommand. */
export const perTypeInstallPluralSegments: ReadonlyArray<string> =
  extensionTypePluralSegments.filter((segment) => segment !== "rules");

/** The install command that resolves for `type`, given an FQN or source. */
export const installCommandFor = (type: ExtensionType, source: string): string =>
  type === "rule"
    ? `axm install ${source}`
    : `axm ${extensionTypeToPlural[type]} install ${source}`;
