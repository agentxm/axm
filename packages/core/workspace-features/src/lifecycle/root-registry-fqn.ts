/**
 * The Registry FQN a root `install`, `uninstall`, or `update` request names.
 *
 * Each verb decides for itself which other spellings it accepts and what a
 * person should type instead; once a request is known to be a Registry FQN,
 * the three verbs read it the same way and refuse it with the same categories.
 */

import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { installRefused, type OperationRefused } from "@agentxm/workspace-kernel/operations";
import {
  installableExtensionTypePluralSegments,
  isInstallableExtensionTypePlural,
  toInstallableExtensionType,
  type InstallableExtensionType,
} from "@agentxm/extension-model/unstable/extensions/installable-types";
import {
  RegistrySourceRefSchema,
  type RegistrySourceRefParts,
} from "@agentxm/extension-model/unstable/extensions";

const decodeRegistrySourceRef = Schema.decodeUnknownEffect(RegistrySourceRefSchema);

const supportedTypes = installableExtensionTypePluralSegments.join(", ");

const capitalized = (verb: string): string => `${verb.charAt(0).toUpperCase()}${verb.slice(1)}`;

/** A Registry FQN whose plural type segment names an installable type. */
export interface RootRegistryFqn {
  readonly ref: RegistrySourceRefParts;
  readonly type: InstallableExtensionType;
}

/**
 * Read `fqn` as a Registry FQN with an installable type. `source` is the
 * request as typed, whose type segment decides between an unsupported-type
 * and a malformed-FQN refusal; `fqn` is the part to decode, which a verb may
 * have stripped of a constraint it reads on its own.
 */
export const decodeRootRegistryFqn: (options: {
  readonly verb: "install" | "uninstall" | "update";
  readonly grammar: string;
  readonly source: string;
  readonly fqn: string;
}) => Effect.Effect<RootRegistryFqn, OperationRefused> = Effect.fn("RootRegistryFqn.decode")(
  function* ({ verb, grammar, source, fqn }) {
    const segments = source.split("/");
    const pluralType = segments.length === 3 ? segments[1] : undefined;
    const unsupportedType = `Use ${grammar}. Supported plural types: ${supportedTypes}.`;

    const ref = yield* decodeRegistrySourceRef(fqn).pipe(
      Effect.mapError((error) =>
        pluralType !== undefined && !isInstallableExtensionTypePlural(pluralType)
          ? installRefused({
              category: "not_found",
              detail: `${capitalized(verb)} source uses an unsupported plural type`,
              suggestions: [{ description: unsupportedType }],
              cause: error,
            })
          : installRefused({
              category: "validation",
              detail: `${capitalized(verb)} source must be a registry FQN`,
              suggestions: [{ description: `Use ${grammar} with one of: ${supportedTypes}.` }],
              cause: error,
            }),
      ),
    );

    if (!isInstallableExtensionTypePlural(ref.type)) {
      return yield* installRefused({
        category: "usage",
        detail: `Root ${verb} does not support that extension type`,
        suggestions: [{ description: unsupportedType }],
      });
    }

    return { ref, type: toInstallableExtensionType(ref.type) };
  },
);
