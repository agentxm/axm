/**
 * The grammar a root `update` request is written in.
 *
 * Root update names one extension by its Registry identity and nothing else.
 * A path, URL, or Git source names a package whose identity the workspace
 * cannot compare against what it already accepted, and a Library is a curated
 * collection rather than an installed package, so both are refused here with
 * the per-type route that does accept them. The refusal carries its own
 * how-to-fix sentence: what a person should type instead depends on what they
 * typed, and only this grammar knows that.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { ExtensionLifecycleFailed } from "../errors.js";
import {
  installableExtensionTypePluralSegments,
  InstallableExtensionTypePluralSchema,
  isInstallableExtensionTypePlural,
  toInstallableExtensionType,
  type InstallableExtensionType,
} from "@agentxm/extension-model/unstable/extensions/installable-types";
import {
  RegistrySourceRefSchema,
  type ExtensionName,
  type Handle,
} from "@agentxm/extension-model/unstable/extensions";
import { parseInputPattern } from "@agentxm/extension-model/unstable/sources/parser";
import type { VersionRange } from "@agentxm/extension-model/unstable/version-constraints";

const decodeRegistrySourceRef = Schema.decodeUnknownEffect(RegistrySourceRefSchema);

export const rootUpdatableTypeSegments = installableExtensionTypePluralSegments;
export const RootUpdatableTypeSegmentSchema = InstallableExtensionTypePluralSchema;
export type RootUpdatableTypeSegment = typeof RootUpdatableTypeSegmentSchema.Type;
export type RootUpdatableType = InstallableExtensionType;

/** One Registry identity a root update names, with the range it requested. */
export interface RootUpdateIntent {
  readonly source: string;
  readonly type: RootUpdatableType;
  readonly owner: Handle;
  readonly name: ExtensionName;
  readonly versionRange: Option.Option<VersionRange>;
  readonly target: string;
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
      return `Root update only accepts registry FQNs. Use the matching per-type command instead: \`axm skills update ${source}\` or \`axm subagents update ${source}\`.`;
    case "registry-pattern-input":
      return "Use `axm update @<handle>/<plural-type>/<name>[@<version>]`.";
    case "workspace-pattern-input":
      return "Workspace-sourced extensions are locally authoritative and are not update targets.";
  }
};

/**
 * Read one root-update request. Fails with the refusal a person can act on;
 * succeeds with the Registry identity every later step is decided against.
 */
export const resolveRootUpdateIntent: (
  input: string,
) => Effect.Effect<RootUpdateIntent, ExtensionLifecycleFailed> = Effect.fn(
  "UpdateExtensions.readRootRequest",
)(function* (input: string) {
  const source = input.trim();
  const segments = source.split("/");
  const pluralType = segments.length === 3 ? segments[1] : undefined;

  if (!source.startsWith("@")) {
    return yield* new ExtensionLifecycleFailed({
      category: "usage",
      detail: "Root update only accepts registry FQNs",
      suggestions: [{ description: rootUpdateRegistryOnlyHowToFix(source) }],
    });
  }

  if (pluralType === "libraries") {
    return yield* new ExtensionLifecycleFailed({
      category: "usage",
      detail: "Libraries are curated registry collections and cannot be updated",
      suggestions: [
        {
          description:
            "Update installed extensions individually; Library membership is viewed in AgentXM.",
        },
      ],
    });
  }

  const parsed = yield* decodeRegistrySourceRef(source).pipe(
    Effect.mapError((error) => {
      if (pluralType !== undefined && !isInstallableExtensionTypePlural(pluralType)) {
        return new ExtensionLifecycleFailed({
          category: "not_found",
          detail: "Update source uses an unsupported plural type",
          suggestions: [
            {
              description: `Use ${rootUpdateFqnGrammar}. Supported plural types: ${supportedRootUpdateTypes}.`,
            },
          ],
          cause: error,
        });
      }

      return new ExtensionLifecycleFailed({
        category: "validation",
        detail: "Update source must be a registry FQN",
        suggestions: [
          {
            description: `Use ${rootUpdateFqnGrammar} with one of: ${supportedRootUpdateTypes}.`,
          },
        ],
        cause: error,
      });
    }),
  );

  if (!isInstallableExtensionTypePlural(parsed.type)) {
    return yield* new ExtensionLifecycleFailed({
      category: "usage",
      detail: "Root update does not support that extension type",
      suggestions: [
        {
          description: `Use ${rootUpdateFqnGrammar}. Supported plural types: ${supportedRootUpdateTypes}.`,
        },
      ],
    });
  }

  return {
    source,
    type: toInstallableExtensionType(parsed.type),
    owner: parsed.owner,
    name: parsed.name,
    versionRange: Option.fromUndefinedOr(parsed.versionRange),
    target: `${parsed.owner}/${parsed.type}/${parsed.name}`,
  } satisfies RootUpdateIntent;
});
