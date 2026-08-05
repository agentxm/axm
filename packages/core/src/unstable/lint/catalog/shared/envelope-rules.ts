/**
 * The five-rule manifest envelope every non-pack per-extension catalog ships.
 *
 * `command`, `subagent`, `mcp-server`, `files`, `hook`, `rule`, and
 * `knowledge` each enforce the same five invariants against their own
 * manifest:
 *
 * 1. `<ns>/manifest-present`             — the manifest file exists.
 * 2. `<ns>/manifest-schema-valid`        — it decodes against the canonical schema.
 * 3. `<ns>/manifest-keys-recognized`     — it carries no unknown top-level keys.
 * 4. `<ns>/standalone-declaration-valid` — `standalone: false` names its packs.
 * 5. `<ns>/recommended-packs-valid`      — recommended packs are bare FQNs.
 *
 * Rules 1, 4, and 5 already had factories; rules 2 and 3 were hand-copied per
 * type. This module composes all five so a new extension type's envelope is
 * one call, and so the publish-safe barrel (`lint/publish.ts`) and the
 * `axm lint` catalog (`catalog/<type>.ts`) build from the same definitions.
 *
 * The factory is deliberately free of `registerLintRuleIds` — that module-load
 * side effect stays in `catalog/<type>.ts`, because it imports the workspace
 * lint config schema that `lint/publish.ts` exists to keep out of the registry
 * Worker bundle.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";
import type * as Schema from "effect/Schema";
import type { AdvisoryRule } from "../../rule.js";
import { makeManifestPresentRule } from "./manifest-present.js";
import {
  makeRecommendedPacksValidRule,
  makeStandaloneDeclarationValidRule,
} from "./recommended-packs-rules.js";
import {
  enumerateUnknownTopLevelKeys,
  schemaDecodeFindings,
  structFieldKeys,
} from "./schema-rule.js";

/**
 * A manifest schema usable by the envelope: decodable, and introspectable for
 * its declared top-level field names.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type ManifestEnvelopeSchema<A, I> = Schema.Codec<A, I> & {
  readonly fields: Readonly<Record<string, unknown>>;
};

/**
 * Per-catalog parameters for {@link makeManifestEnvelopeRules}.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface ManifestEnvelopeOptions<C, A, I> {
  /** Rule-id namespace; matches the context kind (`command`, `hook`, ...). */
  readonly namespace: string;
  /** Accessor-relative manifest filename stamped on `location.file`. */
  readonly manifestFile: string;
  /** Canonical manifest schema for this type. */
  readonly schema: ManifestEnvelopeSchema<A, I>;
  /** Reads the caller-decoded manifest JSON off the rule context. */
  readonly manifestJson: (context: C) => unknown;
  /** `description` for `<ns>/manifest-present`. */
  readonly presentDescription: string;
  /** Finding message emitted when the manifest file is absent. */
  readonly presentMissingMessage: string;
  /** `description` for `<ns>/manifest-schema-valid`. */
  readonly schemaDescription: string;
}

/**
 * The five envelope rules, named so callers can order them alongside their own
 * bespoke rules rather than splicing an opaque array.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface ManifestEnvelopeRules<C> {
  readonly manifestPresent: AdvisoryRule<C>;
  readonly manifestSchemaValid: AdvisoryRule<C>;
  readonly manifestKeysRecognized: AdvisoryRule<C>;
  readonly standaloneDeclarationValid: AdvisoryRule<C>;
  readonly recommendedPacksValid: AdvisoryRule<C>;
}

/**
 * Build one catalog's five manifest envelope rules.
 *
 * The context only has to expose a `files` accessor with `exists`; the
 * manifest value itself is read through `options.manifestJson`, so the factory
 * never assumes a subject field name.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const makeManifestEnvelopeRules = <
  C extends { readonly files: { readonly exists: (path: string) => Effect.Effect<boolean> } },
  A,
  I,
>(
  options: ManifestEnvelopeOptions<C, A, I>,
): ManifestEnvelopeRules<C> => {
  const schemaValidRuleId = `${options.namespace}/manifest-schema-valid`;
  const keysRecognizedRuleId = `${options.namespace}/manifest-keys-recognized`;
  const allowedKeys = structFieldKeys(options.schema);

  return {
    manifestPresent: makeManifestPresentRule<C>({
      ruleId: `${options.namespace}/manifest-present`,
      description: options.presentDescription,
      manifestFile: options.manifestFile,
      missingMessage: options.presentMissingMessage,
    }),
    manifestSchemaValid: {
      id: schemaValidRuleId,
      description: options.schemaDescription,
      kind: "advisory",
      severity: "error",
      check: (context) =>
        schemaDecodeFindings(
          schemaValidRuleId,
          "error",
          options.manifestFile,
          options.schema,
          options.manifestJson(context),
        ),
    },
    manifestKeysRecognized: {
      id: keysRecognizedRuleId,
      description: `${options.manifestFile} uses only supported top-level fields.`,
      kind: "advisory",
      severity: "error",
      check: (context) =>
        Effect.succeed(
          enumerateUnknownTopLevelKeys(
            keysRecognizedRuleId,
            "error",
            options.manifestFile,
            allowedKeys,
            options.manifestJson(context),
          ),
        ),
    },
    standaloneDeclarationValid: makeStandaloneDeclarationValidRule<C>({
      namespace: options.namespace,
      manifestFile: options.manifestFile,
      manifestJson: options.manifestJson,
    }),
    recommendedPacksValid: makeRecommendedPacksValidRule<C>({
      namespace: options.namespace,
      manifestFile: options.manifestFile,
      manifestJson: options.manifestJson,
    }),
  };
};

/**
 * The envelope rules in canonical catalog order.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const orderedEnvelopeRules = <C>(
  rules: ManifestEnvelopeRules<C>,
): ReadonlyArray<AdvisoryRule<C>> => [
  rules.manifestPresent,
  rules.manifestSchemaValid,
  rules.manifestKeysRecognized,
  rules.standaloneDeclarationValid,
  rules.recommendedPacksValid,
];
