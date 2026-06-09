import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import {
  installableExtensionTypePluralSegments,
  InstallableExtensionTypePluralSchema,
  isInstallableExtensionTypePlural,
  RegistrySourceRefSchema,
  toInstallableExtensionType,
  type InstallableExtensionType,
} from "@agentxm/client-core/unstable/extensions";
import { parseLibraryRef } from "@agentxm/client-core/unstable/libraries";
import { parseInputPattern } from "@agentxm/client-core/unstable/sources";

const decodeRegistrySourceRef = Schema.decodeUnknownEffect(RegistrySourceRefSchema);

export const rootInstallableTypeSegments = installableExtensionTypePluralSegments;
export const RootInstallableTypeSegmentSchema = InstallableExtensionTypePluralSchema;
export type RootInstallableTypeSegment = typeof RootInstallableTypeSegmentSchema.Type;
export type RootInstallableType = InstallableExtensionType | "library";

export interface RootInstallIntent {
  readonly source: string;
  readonly type: RootInstallableType | "locator";
}

const rootInstallFqnGrammar = "@<handle>/<plural-type>/<name>[@<version>]";
const rootLibraryInstallFqnGrammar = "@<handle>/libraries/<name>";

const supportedRootInstallTypes = [...rootInstallableTypeSegments, "libraries"].join(", ");

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
      return `Use \`axm install ${source}\` to install every extension AXM can discover from the source.`;
    case "name-input":
    case "glob-input":
      return `Root install needs a registry FQN or source locator. For bare names, use the matching per-type command: \`axm skills install ${source}\`, \`axm commands install ${source}\`, \`axm subagents install ${source}\`, \`axm packs install ${source}\`, or \`axm mcps install ${source}\`.`;
    case "registry-pattern-input":
      return "Use `axm install @<handle>/<plural-type>/<name>[@<version>]`.";
  }
};

export const resolveRootInstallIntent = (input: string) =>
  Effect.gen(function* () {
    const source = input.trim();
    const segments = source.split("/");
    const pluralType = segments.length === 3 ? segments[1] : undefined;

    if (!source.startsWith("@")) {
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
      const libraryRef = parseLibraryRef(source);
      if (libraryRef === undefined) {
        return yield* makeAppError({
          code: "validation",
          detail: "Library install source must be a bare Library ref",
          suggestions: [
            {
              description: `Use ${rootLibraryInstallFqnGrammar}. Libraries do not accept version suffixes.`,
            },
          ],
        });
      }

      return {
        source,
        type: "library",
      } satisfies RootInstallIntent;
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
