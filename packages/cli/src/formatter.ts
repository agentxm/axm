/**
 * Custom CLI output formatter that suppresses global flags on subcommand help
 * and appends a "learn more" footer from command annotations.
 */

import * as ServiceMap from "effect/ServiceMap";
import type { HelpDoc } from "effect/unstable/cli/HelpDoc";
import { CliOutput } from "effect/unstable/cli";

/**
 * Annotation key for "learn more" footer text.
 * Attach to commands via `Command.annotate(LearnMore, "...")`.
 */
export const LearnMore: ServiceMap.Reference<string> = ServiceMap.Reference("axm/learn-more", {
  defaultValue: () => "",
});

/**
 * Determines whether a HelpDoc represents a subcommand (as opposed to the
 * root command) by counting the command tokens in the usage string that
 * precede any bracketed placeholder like `[flags]` or `<subcommand>`.
 *
 * Root usage: `"axm <subcommand> [flags]"` => 1 token ("axm")
 * Subcommand: `"axm skills install [flags]"` => 3 tokens
 */
const isSubcommandDoc = (doc: HelpDoc): boolean => {
  const beforeBrackets = doc.usage.replace(/\s*[[<].*$/, "").trim();
  const tokens = beforeBrackets.split(/\s+/).filter((t) => t.length > 0);
  return tokens.length > 1;
};

const getVisibleGlobalFlags = (doc: HelpDoc): HelpDoc["globalFlags"] => {
  if (!isSubcommandDoc(doc)) {
    return doc.globalFlags;
  }

  // Subcommand help stays focused, but `--json` is worth keeping visible
  // because it materially changes output shape and is expected on leaf commands.
  const globalFlags = doc.globalFlags?.filter((flag) => flag.name === "json");
  return globalFlags !== undefined && globalFlags.length > 0 ? globalFlags : undefined;
};

/**
 * Creates a custom CLI output formatter that wraps the Effect default
 * formatter with two enhancements:
 *
 * 1. Global flag suppression on subcommand help output
 * 2. "Learn more" footer appended from the `LearnMore` command annotation
 */
export const makeAxmFormatter = (): CliOutput.Formatter => {
  const base = CliOutput.defaultFormatter();

  return {
    ...base,

    formatHelpDoc: (doc: HelpDoc): string => {
      const visibleGlobalFlags = getVisibleGlobalFlags(doc);
      const adjusted: HelpDoc = {
        ...doc,
        ...(visibleGlobalFlags !== undefined && { globalFlags: visibleGlobalFlags }),
      };

      let output = base.formatHelpDoc(adjusted);

      const learnMore = ServiceMap.getReferenceUnsafe(doc.annotations, LearnMore);
      if (learnMore !== "") {
        output += "\n\n" + learnMore;
      }

      return output;
    },
  };
};
