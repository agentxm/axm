import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { installRefused, type OperationRefused } from "@agentxm/workspace-kernel/operations";
import type { InstallableExtensionType } from "@agentxm/extension-model/unstable/extensions/installable-types";
import { parseSourceQualifiedRegistrySourcePatternParts } from "@agentxm/extension-model/unstable/extensions";
import { parseInputPattern } from "@agentxm/extension-model/unstable/sources/parser";

import { decodeRootRegistryFqn } from "../root-registry-fqn.js";
import { perTypeInstallPluralSegments } from "./per-type-install.js";

export interface RootInstallIntent {
  readonly source: string;
  readonly type: InstallableExtensionType | "locator";
}

const locatorDiscoveryTypes = "skills, MCP servers, subagents, rules, hooks, knowledge, and packs";

const rootInstallRegistryOnlyHowToFix = (source: string): string => {
  const parsed = parseInputPattern(source);

  if (Option.isNone(parsed)) {
    return "Use `axm install @<handle>/<plural-type>/<name>[@<version>]` or a path, URL, git, or provider shorthand source locator.";
  }

  switch (parsed.value.pattern.pattern) {
    case "file-path-pattern":
    case "url-input":
    case "git-scp-address":
    case "shorthand-input":
    case "slash-pattern":
      return `Use \`axm install ${source}\` to discover and install ${locatorDiscoveryTypes} from the source.`;
    case "name-input":
    case "glob-input":
      return `Root install needs a registry FQN or source locator. For bare names, use the matching per-type command — for example \`axm skills install ${source}\`. Per-type install exists for ${perTypeInstallPluralSegments.join(", ")}.`;
    case "registry-pattern-input":
      return "Use `axm install @<handle>/<plural-type>/<name>[@<version>]`.";
    case "workspace-pattern-input":
      return "Workspace locators declare source authority in settings and cannot be installed over. Use sync or the matching enable command.";
  }
};

/**
 * Which route a root install request takes: a registry FQN names its own
 * type, while a locator is opened and whatever installable extensions it
 * contains are discovered from it.
 */
export const resolveRootInstallIntent: (
  input: string,
) => Effect.Effect<RootInstallIntent, OperationRefused> = Effect.fn(
  "InstallExtensions.resolveRootIntent",
)(function* (input: string) {
  const source = input.trim();
  const sourceQualifiedRegistry = parseSourceQualifiedRegistrySourcePatternParts(source);

  if (!source.startsWith("@") && sourceQualifiedRegistry === undefined) {
    const parsedInput = parseInputPattern(source);
    if (Option.isSome(parsedInput)) {
      switch (parsedInput.value.pattern.pattern) {
        case "file-path-pattern":
        case "url-input":
        case "git-scp-address":
        case "shorthand-input":
        case "slash-pattern":
          return {
            source,
            type: "locator",
          } satisfies RootInstallIntent;
        case "name-input":
        case "glob-input":
        case "registry-pattern-input":
          break;
      }
    }

    return yield* installRefused({
      category: "usage",
      detail: "Root install needs a registry FQN or source locator",
      suggestions: [{ description: rootInstallRegistryOnlyHowToFix(source) }],
    });
  }

  const { type } = yield* decodeRootRegistryFqn({
    verb: "install",
    grammar: "@<handle>/<plural-type>/<name>[@<version>]",
    source,
    fqn: source,
  });

  return { source, type } satisfies RootInstallIntent;
});
