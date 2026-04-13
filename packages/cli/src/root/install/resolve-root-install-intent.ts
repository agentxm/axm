import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as SchemaIssue from "effect/SchemaIssue";

import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import {
  installableExtensionTypePluralSegments,
  InstallableExtensionTypePluralSchema,
  isInstallableExtensionTypePlural,
  RegistrySourceRefSchema,
  toInstallableExtensionType,
  type InstallableExtensionType,
} from "@agentxm/client-core/unstable/extensions";
import { parseInputPattern } from "@agentxm/client-core/unstable/sources";

const decodeRegistrySourceRef = Schema.decodeUnknownEffect(RegistrySourceRefSchema);

export const rootInstallableTypeSegments = installableExtensionTypePluralSegments;
export const RootInstallableTypeSegmentSchema = InstallableExtensionTypePluralSchema;
export type RootInstallableTypeSegment = typeof RootInstallableTypeSegmentSchema.Type;
export type RootInstallableType = InstallableExtensionType;

export interface RootInstallIntent {
  readonly source: string;
  readonly type: RootInstallableType;
}

const rootInstallFqnGrammar = "@<handle>/<plural-type>/<name>[@<version>]";

const supportedRootInstallTypes = rootInstallableTypeSegments.join(", ");

const rootInstallRegistryOnlyHowToFix = (source: string): string => {
  const parsed = parseInputPattern(source);

  if (Option.isNone(parsed)) {
    return "Use `axm install @<handle>/<plural-type>/<name>[@<version>]`. For path, URL, or git sources, use `axm skills install <source>` or `axm subagents install <source>` instead.";
  }

  switch (parsed.value.pattern.pattern) {
    case "file-path-pattern":
    case "url-input":
    case "git-scp-address":
    case "shorthand-input":
    case "slash-pattern":
      return `Root install only accepts registry FQNs. Use \`axm skills install ${source}\` or \`axm subagents install ${source}\` instead.`;
    case "name-input":
    case "glob-input":
      return `Root install only accepts registry FQNs. Use the matching per-type command instead: \`axm skills install ${source}\`, \`axm commands install ${source}\`, \`axm subagents install ${source}\`, \`axm packs install ${source}\`, or \`axm mcp-servers install ${source}\`.`;
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
      return yield* makeAppError({
        code: "INSTALL_SOURCE_NOT_FQN",
        what: "Root install only accepts registry FQNs",
        details: [`Provided: ${source}`],
        howToFix: rootInstallRegistryOnlyHowToFix(source),
      });
    }

    const parsed = yield* decodeRegistrySourceRef(source).pipe(
      Effect.mapError((error) => {
        if (pluralType !== undefined && !isInstallableExtensionTypePlural(pluralType)) {
          return makeAppError({
            code: "INSTALL_SOURCE_UNKNOWN_TYPE",
            what: "Install source uses an unsupported plural type",
            details: [`Provided: ${source}`, `Supported types: ${supportedRootInstallTypes}`],
            howToFix: `Use ${rootInstallFqnGrammar}. Supported plural types: ${supportedRootInstallTypes}.`,
            cause: error,
          });
        }

        return makeAppError({
          code: "INSTALL_SOURCE_INVALID_FQN",
          what: "Install source must be a registry FQN",
          details: [SchemaIssue.makeFormatterDefault()(error.issue)],
          howToFix: `Use ${rootInstallFqnGrammar} with one of: ${supportedRootInstallTypes}.`,
          cause: error,
        });
      }),
    );

    if (!isInstallableExtensionTypePlural(parsed.type)) {
      return yield* makeAppError({
        code: "INSTALL_SOURCE_UNSUPPORTED_TYPE",
        what: "Root install does not support that extension type",
        details: [`Provided: ${source}`, `Supported types: ${supportedRootInstallTypes}`],
        howToFix: `Use ${rootInstallFqnGrammar}. Supported plural types: ${supportedRootInstallTypes}.`,
      });
    }

    return {
      source,
      type: toInstallableExtensionType(parsed.type),
    } satisfies RootInstallIntent;
  });
