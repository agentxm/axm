import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import {
  installableExtensionTypePluralSegments,
  InstallableExtensionTypePluralSchema,
  isInstallableExtensionTypePlural,
  parseSourceQualifiedRegistrySourcePatternParts,
  RegistrySourceRefSchema,
  toInstallableExtensionType,
  type InstallableExtensionType,
} from "@agentxm/client-core/unstable/extensions";
import { parseInputPattern } from "@agentxm/client-core/unstable/sources";

import { perTypeInstallPluralSegments } from "../shared/per-type-install.js";

const decodeRegistrySourceRef = Schema.decodeUnknownEffect(RegistrySourceRefSchema);

export const rootInstallableTypeSegments = installableExtensionTypePluralSegments;
export const RootInstallableTypeSegmentSchema = InstallableExtensionTypePluralSchema;
export type RootInstallableTypeSegment = typeof RootInstallableTypeSegmentSchema.Type;
export type RootInstallableType = InstallableExtensionType;

export interface RootInstallIntent {
  readonly source: string;
  readonly type: RootInstallableType | "locator";
}

const rootInstallFqnGrammar = "@<handle>/<plural-type>/<name>[@<version>]";
const supportedRootInstallTypes = rootInstallableTypeSegments.join(", ");
const locatorDiscoveryTypes = "skills, MCP servers, subagents, rules, hooks, and knowledge";

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
      return `Use \`axm install ${source}\` to discover and install ${locatorDiscoveryTypes} from the source. MCP servers and packs require a registry FQN.`;
    case "name-input":
    case "glob-input":
      return `Root install needs a registry FQN or source locator. For bare names, use the matching per-type command — for example \`axm skills install ${source}\`. Per-type install exists for ${perTypeInstallPluralSegments.join(", ")}.`;
    case "registry-pattern-input":
      return "Use `axm install @<handle>/<plural-type>/<name>[@<version>]`.";
    case "workspace-pattern-input":
      return "Workspace locators declare source authority in settings and cannot be installed over. Use sync or the matching enable command.";
  }
};

export const resolveRootInstallIntent = (input: string) =>
  Effect.gen(function* () {
    const source = input.trim();
    const segments = source.split("/");
    const pluralType = segments.length === 3 ? segments[1] : undefined;
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

      return yield* makeAppError({
        code: "usage",
        detail: "Root install needs a registry FQN or source locator",
        suggestions: [{ description: rootInstallRegistryOnlyHowToFix(source) }],
      });
    }

    if (pluralType === "libraries") {
      return yield* makeAppError({
        code: "usage",
        detail: "Libraries are curated registry collections and cannot be installed",
        suggestions: [
          {
            description:
              "Open the Library in AgentXM, then install the individual extensions you want.",
          },
        ],
      });
    }

    const parsed = yield* decodeRegistrySourceRef(source).pipe(
      Effect.mapError((error) => {
        if (pluralType !== undefined && !isInstallableExtensionTypePlural(pluralType)) {
          return makeAppError({
            code: "not_found",
            detail: "Install source uses an unsupported plural type",
            suggestions: [
              {
                description: `Use ${rootInstallFqnGrammar}. Supported plural types: ${supportedRootInstallTypes}.`,
              },
            ],
            cause: error,
          });
        }

        return makeAppError({
          code: "validation",
          detail: "Install source must be a registry FQN",
          suggestions: [
            {
              description: `Use ${rootInstallFqnGrammar} with one of: ${supportedRootInstallTypes}.`,
            },
          ],
          cause: error,
        });
      }),
    );

    if (!isInstallableExtensionTypePlural(parsed.type)) {
      return yield* makeAppError({
        code: "usage",
        detail: "Root install does not support that extension type",
        suggestions: [
          {
            description: `Use ${rootInstallFqnGrammar}. Supported plural types: ${supportedRootInstallTypes}.`,
          },
        ],
      });
    }

    return {
      source,
      type: toInstallableExtensionType(parsed.type),
    } satisfies RootInstallIntent;
  });
