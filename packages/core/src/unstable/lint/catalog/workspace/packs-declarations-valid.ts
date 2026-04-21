/**
 * `workspace/packs-declarations-valid` — declared packs name a resolvable,
 * owner-qualified, unique source.
 *
 * Mirrors `workspace/skills-declarations-valid` against the packs map:
 *
 * 1. Source resolvability — pack source is not a bare name.
 * 2. Owner qualification — registry-shaped pack sources carry `@owner/`.
 * 3. Duplicate FQNs — two settings entries normalize to the same FQN.
 *
 * One finding per affected entity. Advisory.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import type { WorkspaceRuleContext } from "../../context.js";
import type { AdvisoryFinding, AdvisoryRule } from "../../rule.js";
import { SettingsSchema, type Settings } from "../../../settings/schema.js";
import { parseRegistrySource } from "./helpers/registry-source.js";
import { EMPTY_ADVISORY_FINDINGS } from "./helpers/empty.js";

const RULE_ID = "workspace/packs-declarations-valid";
const SETTINGS_REL = ".axm/settings.json";

const BARE_NAME_RE = /^[a-z0-9][a-z0-9-]*(?:@[^\s/:]+)?$/i;
const NON_REGISTRY_MARKERS = [
  /^\.\//,
  /^\.\.\//,
  /^\//,
  /^file:\/\//,
  /:\/\//,
  /^[a-z][a-z0-9+.-]*:/i,
];
const isClearlyNonRegistrySource = (source: string): boolean =>
  NON_REGISTRY_MARKERS.some((pattern) => pattern.test(source));

const decodeSettings = (input: unknown): Option.Option<Settings> => {
  const result = Schema.decodeUnknownResult(SettingsSchema)(input, {
    onExcessProperty: "ignore",
    errors: "all",
  });
  return Result.isSuccess(result) ? Option.some(result.success) : Option.none();
};

interface Categorized {
  readonly name: string;
  readonly source: string;
  readonly kind: "registry" | "bare" | "non-registry" | "registry-no-owner";
  readonly registryFqn?: string;
}

const categorizeEntry = (name: string, source: string): Categorized => {
  const parsed = parseRegistrySource(source);
  if (parsed !== undefined) {
    return {
      name,
      source,
      kind: "registry",
      registryFqn: `${parsed.owner}/${parsed.type}/${parsed.name}`,
    };
  }
  if (isClearlyNonRegistrySource(source)) {
    // Packs must use registry sources per the extensions-installed doctor
    // rule; an unqualified non-registry source surfaces as an error.
    return { name, source, kind: "non-registry" };
  }
  if (BARE_NAME_RE.test(source)) {
    return { name, source, kind: "bare" };
  }
  return { name, source, kind: "registry-no-owner" };
};

const bareNameFinding = (entry: Categorized): AdvisoryFinding => ({
  kind: "advisory",
  ruleId: RULE_ID,
  severity: "error",
  message: `Pack '${entry.name}' has a bare-name source '${entry.source}'.`,
  suggestions: [`Rewrite the source as @owner/packs/${entry.name}.`],
  location: { file: SETTINGS_REL },
});

const nonRegistryFinding = (entry: Categorized): AdvisoryFinding => ({
  kind: "advisory",
  ruleId: RULE_ID,
  severity: "error",
  message: `Pack '${entry.name}' must use a registry source; got '${entry.source}'.`,
  suggestions: [`Rewrite the source as @owner/packs/${entry.name} pointing to a known registry.`],
  location: { file: SETTINGS_REL },
});

const missingOwnerFinding = (entry: Categorized): AdvisoryFinding => ({
  kind: "advisory",
  ruleId: RULE_ID,
  severity: "error",
  message: `Pack '${entry.name}' has a registry-shaped source '${entry.source}' missing the @owner prefix.`,
  suggestions: [`Rewrite the source as @owner/packs/${entry.name}.`],
  location: { file: SETTINGS_REL },
});

const duplicateFinding = (
  entry: Categorized,
  duplicates: ReadonlyArray<string>,
): AdvisoryFinding => ({
  kind: "advisory",
  ruleId: RULE_ID,
  severity: "error",
  message: `Pack '${entry.name}' resolves to a registry FQN declared more than once: ${duplicates.join(", ")}.`,
  suggestions: [`Remove duplicate entries and keep one per FQN.`],
  location: { file: SETTINGS_REL },
});

export const packsDeclarationsValidRule: AdvisoryRule<WorkspaceRuleContext> = {
  id: RULE_ID,
  description: "Declared packs name a resolvable, owner-qualified, unique source.",
  kind: "advisory",
  severity: "error",
  check: (context) =>
    Effect.gen(function* () {
      const settingsResult = yield* Effect.result(context.workspace.settings);
      if (Result.isFailure(settingsResult)) {
        return EMPTY_ADVISORY_FINDINGS;
      }
      const decoded = decodeSettings(settingsResult.success);
      if (Option.isNone(decoded)) {
        return EMPTY_ADVISORY_FINDINGS;
      }
      const packs = decoded.value.packs ?? {};
      const entries: ReadonlyArray<Categorized> = Object.entries(packs).map(([name, entry]) =>
        categorizeEntry(name, entry.source),
      );

      const byFqn = new Map<string, Array<Categorized>>();
      for (const entry of entries) {
        if (entry.kind === "registry" && entry.registryFqn !== undefined) {
          const group = byFqn.get(entry.registryFqn) ?? [];
          group.push(entry);
          byFqn.set(entry.registryFqn, group);
        }
      }

      const findings: Array<AdvisoryFinding> = [];
      for (const entry of entries) {
        switch (entry.kind) {
          case "bare":
            findings.push(bareNameFinding(entry));
            break;
          case "non-registry":
            findings.push(nonRegistryFinding(entry));
            break;
          case "registry-no-owner":
            findings.push(missingOwnerFinding(entry));
            break;
          case "registry": {
            if (entry.registryFqn === undefined) {
              break;
            }
            const group = byFqn.get(entry.registryFqn) ?? [];
            if (group.length > 1) {
              findings.push(duplicateFinding(entry, group.map((g) => g.name).sort()));
            }
            break;
          }
        }
      }
      return findings;
    }),
};
