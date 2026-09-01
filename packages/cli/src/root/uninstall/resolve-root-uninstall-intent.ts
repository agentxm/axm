import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { makeAppError } from "@agentxm/extension-management/unstable/app-error";
import {
  installableExtensionTypePluralSegments,
  isInstallableExtensionTypePlural,
  toInstallableExtensionType,
  type InstallableExtensionType,
} from "@agentxm/extension-management/unstable/workspace";
import { RegistrySourceRefSchema } from "@agentxm/extension-model/unstable/extensions";
import { parseInputPattern } from "@agentxm/extension-model/unstable/sources/parser";

const decodeRegistrySourceRef = Schema.decodeUnknownEffect(RegistrySourceRefSchema);

export const rootUninstallableTypeSegments = installableExtensionTypePluralSegments;
export type RootUninstallableType = InstallableExtensionType;

export interface RootUninstallIntent {
  readonly source: string;
  readonly type: RootUninstallableType;
  readonly name: string;
}

const rootUninstallFqnGrammar = "@<handle>/<plural-type>/<name>[@<version>]";
const supportedRootUninstallTypes = rootUninstallableTypeSegments.join(", ");

const genericPerTypeUninstallGuidance =
  "Use the matching per-type uninstall command instead: `axm skills uninstall <name>`, `axm subagents uninstall <name>`, `axm packs uninstall <name>`, or `axm mcps uninstall <name>`.";

const rootUninstallRegistryOnlyHowToFix = (source: string): string => {
  const parsed = parseInputPattern(source);

  if (Option.isNone(parsed)) {
    return `Use \`axm uninstall ${rootUninstallFqnGrammar}\`. ${genericPerTypeUninstallGuidance}`;
  }

  switch (parsed.value.pattern.pattern) {
    case "name-input":
    case "glob-input":
      return `Root uninstall only accepts registry FQNs. Use the matching per-type command instead: \`axm skills uninstall ${source}\`, \`axm subagents uninstall ${source}\`, \`axm packs uninstall ${source}\`, or \`axm mcps uninstall ${source}\`.`;
    case "file-path-pattern":
    case "url-input":
    case "git-scp-address":
    case "shorthand-input":
    case "slash-pattern":
    case "registry-pattern-input":
      return `Use \`axm uninstall ${rootUninstallFqnGrammar}\`. ${genericPerTypeUninstallGuidance}`;
    case "workspace-pattern-input":
      return "Use the matching per-type uninstall command for a workspace-authored extension.";
  }
};

export const resolveRootUninstallIntent = (input: string) =>
  Effect.gen(function* () {
    const source = input.trim();
    const segments = source.split("/");
    const pluralType = segments.length === 3 ? segments[1] : undefined;

    if (!source.startsWith("@")) {
      return yield* makeAppError({
        code: "usage",
        detail: "Root uninstall only accepts registry FQNs",
        suggestions: [{ description: rootUninstallRegistryOnlyHowToFix(source) }],
      });
    }

    if (pluralType === "libraries") {
      return yield* makeAppError({
        code: "usage",
        detail: "Libraries are curated registry collections and cannot be uninstalled",
        suggestions: [
          {
            description:
              "Uninstall individual extensions by FQN; Libraries do not create workspace state.",
          },
        ],
      });
    }

    const parsed = yield* decodeRegistrySourceRef(source).pipe(
      Effect.mapError((error) => {
        if (pluralType !== undefined && !isInstallableExtensionTypePlural(pluralType)) {
          return makeAppError({
            code: "not_found",
            detail: "Uninstall source uses an unsupported plural type",
            suggestions: [
              {
                description: `Use ${rootUninstallFqnGrammar}. Supported plural types: ${supportedRootUninstallTypes}.`,
              },
            ],
            cause: error,
          });
        }

        return makeAppError({
          code: "validation",
          detail: "Uninstall source must be a registry FQN",
          suggestions: [
            {
              description: `Use ${rootUninstallFqnGrammar} with one of: ${supportedRootUninstallTypes}.`,
            },
          ],
          cause: error,
        });
      }),
    );

    if (!isInstallableExtensionTypePlural(parsed.type)) {
      return yield* makeAppError({
        code: "usage",
        detail: "Root uninstall does not support that extension type",
        suggestions: [
          {
            description: `Use ${rootUninstallFqnGrammar}. Supported plural types: ${supportedRootUninstallTypes}.`,
          },
        ],
      });
    }

    return {
      source,
      type: toInstallableExtensionType(parsed.type),
      name: parsed.name,
    } satisfies RootUninstallIntent;
  });
