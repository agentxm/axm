/**
 * The manifest envelope every per-extension catalog builds from.
 *
 * Every extension type enforces the same invariants against its own
 * manifest:
 *
 * 1. `<ns>/manifest-present`             — the manifest file exists.
 * 2. `<ns>/manifest-schema-valid`        — it decodes against the canonical schema.
 * 3. `<ns>/manifest-keys-recognized`     — it carries no unknown top-level keys.
 * 4. `<ns>/standalone-declaration-valid` — `standalone: false` names its packs.
 * 5. `<ns>/recommended-packs-valid`      — recommended packs are bare FQNs.
 *
 * All seven catalogs (`skill`, `pack`, `subagent`, `mcp-server`, `hook`,
 * `rule`, `knowledge`) take their envelope rules from
 * {@link makeManifestEnvelopeRules}. Packs carry no `standalone` or
 * `recommendedPacks` fields, so the pack catalog registers only rules 1-3.
 * The named record lets a catalog interleave its own rules (the skill
 * frontmatter rules, for example) without splicing an opaque array.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";
import type * as Schema from "effect/Schema";
import type { ExtensionFileAccessor } from "../../context.js";
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

type ManifestFileAccessor = Pick<ExtensionFileAccessor, "exists">;

/**
 * Per-catalog parameters for {@link makeManifestEnvelopeRules}.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface ManifestEnvelopeOptions<C, A, I> {
  /** Rule-id namespace; matches the context kind (`skill`, `hook`, ...). */
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
  /** Accessor rooted where the manifest lives; defaults to `context.files`. */
  readonly getFiles?: (context: C) => ManifestFileAccessor;
  /**
   * Whether the context is expected to carry a manifest at all. Every
   * envelope rule produces no findings for a context it does not apply to.
   * Defaults to every context.
   */
  readonly applies?: (context: C) => boolean;
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
 * never assumes a subject field name. A context outside `options.applies` is
 * treated as carrying no manifest, which every rule after
 * `<ns>/manifest-present` already skips.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const makeManifestEnvelopeRules = <C extends { readonly files: ManifestFileAccessor }, A, I>(
  options: ManifestEnvelopeOptions<C, A, I>,
): ManifestEnvelopeRules<C> => {
  const schemaValidRuleId = `${options.namespace}/manifest-schema-valid`;
  const keysRecognizedRuleId = `${options.namespace}/manifest-keys-recognized`;
  const allowedKeys = structFieldKeys(options.schema);
  const applies = options.applies;
  const manifestJson =
    applies === undefined
      ? options.manifestJson
      : (context: C): unknown => (applies(context) ? options.manifestJson(context) : undefined);

  return {
    manifestPresent: makeManifestPresentRule<C>({
      ruleId: `${options.namespace}/manifest-present`,
      description: options.presentDescription,
      manifestFile: options.manifestFile,
      missingMessage: options.presentMissingMessage,
      ...(options.getFiles === undefined ? {} : { getFiles: options.getFiles }),
      ...(applies === undefined ? {} : { applies }),
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
          manifestJson(context),
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
            manifestJson(context),
          ),
        ),
    },
    standaloneDeclarationValid: makeStandaloneDeclarationValidRule<C>({
      namespace: options.namespace,
      manifestFile: options.manifestFile,
      manifestJson,
    }),
    recommendedPacksValid: makeRecommendedPacksValidRule<C>({
      namespace: options.namespace,
      manifestFile: options.manifestFile,
      manifestJson,
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
