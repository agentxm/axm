/**
 * How the command line presents each installable extension type: its report
 * nouns, route, selector flag, example name, and inspection command.
 * `EXTENSION_TYPE_COMMANDS` decides which commands a type has; this module
 * decides the words their routes share.
 *
 * The extension model's type table owns every name a type carries: the route
 * is its plural, the nouns are its sentence labels, and the selector flag is
 * its id. Only the article and the example name belong to the command line.
 */

import {
  extensionTypePluralSentenceLabels,
  extensionTypeSentenceLabels,
  extensionTypeToPlural,
  type ExtensionTypePlural,
} from "@agentxm/extension-model/unstable/extensions";
import type { InstallableExtensionType } from "@agentxm/extension-model/unstable/extensions/installable-types";
import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";

interface ExtensionTypePresentation {
  /** What a report calls one of, and several of, this type's extensions. */
  readonly noun: {
    readonly singular: string;
    readonly plural: string;
    readonly article: "a" | "an";
  };
  /** The plural command group. */
  readonly route: ExtensionTypePlural;
  /** The root install selection flag without its leading dashes. */
  readonly selectorFlag: InstallableExtensionType;
  /** A representative extension name for command examples. */
  readonly exampleName: string;
  /** The command that inspects what is installed of this type. */
  readonly inspect: SuggestedAction;
}

/**
 * The words only the command line chooses. The `satisfies` is load-bearing: a
 * new installable type without a row is a compile error.
 */
const COMMAND_LINE_WORDS = {
  skill: { article: "a", exampleName: "code-review" },
  "mcp-server": { article: "an", exampleName: "context" },
  subagent: { article: "a", exampleName: "researcher" },
  rule: { article: "a", exampleName: "commit-style" },
  hook: { article: "a", exampleName: "workspace-baseline" },
  knowledge: { article: "a", exampleName: "platform" },
  pack: { article: "a", exampleName: "frontend-tools" },
} as const satisfies Record<
  InstallableExtensionType,
  { readonly article: "a" | "an"; readonly exampleName: string }
>;

export const extensionTypePresentation = (
  type: InstallableExtensionType,
): ExtensionTypePresentation => {
  const route = extensionTypeToPlural[type];
  const plural = extensionTypePluralSentenceLabels[route];
  const { article, exampleName } = COMMAND_LINE_WORDS[type];
  return {
    noun: { singular: extensionTypeSentenceLabels[type], plural, article },
    route,
    selectorFlag: type,
    exampleName,
    inspect: { description: `Inspect installed ${plural}`, cmd: `axm ${route} list` },
  };
};
