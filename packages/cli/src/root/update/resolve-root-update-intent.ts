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

export const rootUpdatableTypeSegments = installableExtensionTypePluralSegments;
export const RootUpdatableTypeSegmentSchema = InstallableExtensionTypePluralSchema;
export type RootUpdatableTypeSegment = typeof RootUpdatableTypeSegmentSchema.Type;
export type RootUpdatableType = InstallableExtensionType;

export interface RootUpdateIntent {
  readonly source: string;
  readonly type: RootUpdatableType;
}

const rootUpdateFqnGrammar = "@<handle>/<plural-type>/<name>[@<version>]";

const supportedRootUpdateTypes = rootUpdatableTypeSegments.join(", ");

const rootUpdateRegistryOnlyHowToFix = (source: string): string => {
  const parsed = parseInputPattern(source);

  if (Option.isNone(parsed)) {
    return "Use `axm update @<handle>/<plural-type>/<name>[@<version>]`. For path, URL, or git sources, use `axm skills update <source>` or `axm subagents update <source>` instead.";
  }

  switch (parsed.value.pattern.pattern) {
    case "file-path-pattern":
    case "url-input":
    case "git-scp-address":
    case "shorthand-input":
    case "slash-pattern":
      return `Root update only accepts registry FQNs. Use \`axm skills update ${source}\` or \`axm subagents update ${source}\` instead.`;
    case "name-input":
    case "glob-input":
      return `Root update only accepts registry FQNs. Use the matching per-type command instead: \`axm skills update ${source}\`, \`axm commands update ${source}\`, \`axm subagents update ${source}\`.`;
    case "registry-pattern-input":
      return "Use `axm update @<handle>/<plural-type>/<name>[@<version>]`.";
  }
};

export const resolveRootUpdateIntent = (input: string) =>
  Effect.gen(function* () {
    const source = input.trim();
    const segments = source.split("/");
    const pluralType = segments.length === 3 ? segments[1] : undefined;

    if (!source.startsWith("@")) {
      return yield* makeAppError({
        code: "UPDATE_SOURCE_NOT_FQN",
        what: "Root update only accepts registry FQNs",
        details: [`Provided: ${source}`],
        howToFix: rootUpdateRegistryOnlyHowToFix(source),
      });
    }

    const parsed = yield* decodeRegistrySourceRef(source).pipe(
      Effect.mapError((error) => {
        if (pluralType !== undefined && !isInstallableExtensionTypePlural(pluralType)) {
          return makeAppError({
            code: "UPDATE_SOURCE_UNKNOWN_TYPE",
            what: "Update source uses an unsupported plural type",
            details: [`Provided: ${source}`, `Supported types: ${supportedRootUpdateTypes}`],
            howToFix: `Use ${rootUpdateFqnGrammar}. Supported plural types: ${supportedRootUpdateTypes}.`,
            cause: error,
          });
        }

        return makeAppError({
          code: "UPDATE_SOURCE_INVALID_FQN",
          what: "Update source must be a registry FQN",
          details: [SchemaIssue.makeFormatterDefault()(error.issue)],
          howToFix: `Use ${rootUpdateFqnGrammar} with one of: ${supportedRootUpdateTypes}.`,
          cause: error,
        });
      }),
    );

    if (!isInstallableExtensionTypePlural(parsed.type)) {
      return yield* makeAppError({
        code: "UPDATE_SOURCE_UNSUPPORTED_TYPE",
        what: "Root update does not support that extension type",
        details: [`Provided: ${source}`, `Supported types: ${supportedRootUpdateTypes}`],
        howToFix: `Use ${rootUpdateFqnGrammar}. Supported plural types: ${supportedRootUpdateTypes}.`,
      });
    }

    return {
      source,
      type: toInstallableExtensionType(parsed.type),
    } satisfies RootUpdateIntent;
  });
