/**
 * Shared factories for the `standalone` / `recommendedPacks` coherence rules.
 *
 * Both fields come from `NonPackManifestFields` in
 * `extensions/common.ts`, so every non-pack catalog (`skill`, `command`,
 * `subagent`, `mcp-server`, `files`, `hook`) enforces the same two invariants
 * against its own manifest. Rather than copy twelve near-identical rule
 * bodies, each catalog registers a rule produced here and parameterized by
 * namespace and manifest accessor — the same shape `shared/schema-rule.ts`
 * establishes for the `-schema-valid` rules.
 *
 * Both rules ship at `warning`. They would otherwise retroactively reject
 * manifests published before the rules existed, which the rule-authoring
 * guide's "new rules start soft" clause forbids.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";
import type { AdvisoryFinding, AdvisoryRule } from "../../rule.js";
import { isManifestJsonParseFailure } from "./manifest-json.js";

/**
 * Per-catalog parameters for the shared non-pack manifest rules.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface RecommendedPacksRuleOptions<C> {
  /** Rule-id namespace; matches the context kind (`skill`, `command`, ...). */
  readonly namespace: string;
  /** Accessor-relative manifest filename stamped on `location.file`. */
  readonly manifestFile: string;
  /** Reads the caller-decoded manifest JSON off the rule context. */
  readonly manifestJson: (context: C) => unknown;
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Narrow a caller-decoded manifest value to a plain record, or `undefined`
 * when there is nothing for these rules to read. Absent manifests are the
 * `-present` rule's problem; unparseable ones are the `-schema-valid` rule's.
 */
const manifestRecord = (input: unknown): Readonly<Record<string, unknown>> | undefined => {
  if (input === undefined || isManifestJsonParseFailure(input) || !isRecord(input)) {
    return undefined;
  }
  return input;
};

const stringEntries = (value: unknown): ReadonlyArray<string> =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];

/**
 * Split a `recommendedPacks` entry into its FQN and optional version range.
 *
 * Mirrors the separator search in `PackSpecSchema`: the range delimiter is the
 * first `@` after the last `/`, since the owner segment also starts with `@`.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const splitPackSpec = (
  spec: string,
): { readonly fqn: string; readonly range: string | undefined } => {
  const lastSlash = spec.lastIndexOf("/");
  const rangeAt = lastSlash > 0 ? spec.indexOf("@", lastSlash + 1) : -1;
  if (rangeAt <= 0) {
    return { fqn: spec, range: undefined };
  }
  return { fqn: spec.slice(0, rangeAt), range: spec.slice(rangeAt + 1) };
};

// -----------------------------------------------------------------------------
// <namespace>/standalone-declaration-valid
// -----------------------------------------------------------------------------

/**
 * Build the `<namespace>/standalone-declaration-valid` rule for one catalog.
 *
 * A manifest with `standalone: false` declares that it is meaningless without
 * one of its recommended packs. With `recommendedPacks` absent or empty that
 * declaration is self-contradictory and nothing downstream — registry, Library
 * UI, or `workspace/recommended-packs-retained` — can act on it.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const makeStandaloneDeclarationValidRule = <C>(
  options: RecommendedPacksRuleOptions<C>,
): AdvisoryRule<C> => {
  const ruleId = `${options.namespace}/standalone-declaration-valid`;
  return {
    id: ruleId,
    description: "Extensions that are not standalone recommend at least one pack.",
    kind: "advisory",
    severity: "warning",
    check: (context) => {
      const manifest = manifestRecord(options.manifestJson(context));
      if (manifest === undefined || manifest["standalone"] !== false) {
        return Effect.succeed([]);
      }
      if (stringEntries(manifest["recommendedPacks"]).length > 0) {
        return Effect.succeed([]);
      }
      return Effect.succeed([
        {
          kind: "advisory",
          ruleId,
          severity: "warning",
          message:
            "`standalone` is set to false, which says this extension only works alongside one of its recommended packs, but no `recommendedPacks` are declared. " +
            `To keep the restriction, add each pack's fully qualified name (\`@owner/packs/<name>\`) under \`recommendedPacks\` in \`${options.manifestFile}\`. ` +
            `If the extension does work on its own, remove the \`standalone\` key from \`${options.manifestFile}\`.`,
          location: { file: options.manifestFile },
        } satisfies AdvisoryFinding,
      ]);
    },
  };
};

// -----------------------------------------------------------------------------
// <namespace>/recommended-packs-valid
// -----------------------------------------------------------------------------

/**
 * Build the `<namespace>/recommended-packs-valid` rule for one catalog.
 *
 * `recommendedPacks` is typed `PackSpecSchema`, which permits a trailing
 * version range, but nothing consumes one — recommendations are matched by
 * name — and `axm help packs` tells authors to use the bare reference. One
 * finding per offending entry.
 *
 * When published manifests have drained, the field can move to
 * `PackFqnSchema` and this rule retires: decoding takes over.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const makeRecommendedPacksValidRule = <C>(
  options: RecommendedPacksRuleOptions<C>,
): AdvisoryRule<C> => {
  const ruleId = `${options.namespace}/recommended-packs-valid`;
  return {
    id: ruleId,
    description: "Recommended packs are referenced by name without a version range.",
    kind: "advisory",
    severity: "warning",
    check: (context) => {
      const manifest = manifestRecord(options.manifestJson(context));
      if (manifest === undefined) {
        return Effect.succeed([]);
      }
      const findings: Array<AdvisoryFinding> = [];
      for (const entry of stringEntries(manifest["recommendedPacks"])) {
        const { fqn, range } = splitPackSpec(entry);
        if (range === undefined) {
          continue;
        }
        findings.push({
          kind: "advisory",
          ruleId,
          severity: "warning",
          message:
            `\`recommendedPacks\` entry '${entry}' pins a version range, but recommended packs are matched by name only, so the range is ignored. ` +
            `Replace it with the bare pack reference '${fqn}' under \`recommendedPacks\` in \`${options.manifestFile}\`.`,
          location: { file: options.manifestFile },
        });
      }
      return Effect.succeed(findings);
    },
  };
};
