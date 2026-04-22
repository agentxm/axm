/**
 * `workspace/skills-declarations-valid` — declared skills name a resolvable,
 * owner-qualified, unique source.
 *
 * Cascade per `docs/design/lint-engine.md §10.workspace.Skills` (reports the
 * first failing arm per affected entity):
 *
 * 1. Source resolvability — the source string is shaped like a ref we can
 *    route (owner-qualified FQN like `@owner/skills/name`, a known source
 *    host, `file://` URL, local path). Bare names (`just-a-name`) fail.
 * 2. Owner qualification — registry-shaped sources carry an `@owner`
 *    prefix; entries whose source looks registry-ish but omits the owner
 *    fail.
 * 3. Duplicate FQNs — when two settings entries normalize to the same
 *    owner/type/name FQN, both entries emit a finding.
 *
 * One finding per affected entity (per-entity cascade). Advisory — fixing
 * requires a settings edit.
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

const RULE_ID = "workspace/skills-declarations-valid";
const SETTINGS_REL = ".axm/settings.json";

const decodeSettings = (input: unknown): Option.Option<Settings> => {
  const result = Schema.decodeUnknownResult(SettingsSchema)(input, {
    onExcessProperty: "ignore",
    errors: "all",
  });
  return Result.isSuccess(result) ? Option.some(result.success) : Option.none();
};

// Pattern definitions — follow the existing doctor check's logic (see
// `workspace/doctor/checks/extensions-installed.ts`).
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

interface Categorized {
  readonly name: string;
  readonly source: string;
  readonly kind: "registry" | "bare" | "non-registry" | "registry-no-owner";
  /** Computed registry FQN, if `kind === "registry"`. */
  readonly registryFqn?: string;
}

const categorizeEntry = (name: string, source: string): Categorized => {
  // Delegate to the canonical parser — it handles `@owner/type/name@version`.
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
    return { name, source, kind: "non-registry" };
  }
  if (BARE_NAME_RE.test(source)) {
    return { name, source, kind: "bare" };
  }
  return { name, source, kind: "registry-no-owner" };
};

const findingForBareName = (entry: Categorized): AdvisoryFinding => ({
  kind: "advisory",
  ruleId: RULE_ID,
  severity: "error",
  message:
    `Skill '${entry.name}' uses bare source '${entry.source}', so axm cannot tell which registry skill you mean. ` +
    `Edit \`.axm/settings.json\` and change the '${entry.name}' entry under \`settings.skills\` to an owner-qualified source such as \`@owner/skills/${entry.name}\`. ` +
    "If you use a named source host, add or update the matching entry under `settings.sources[]`.",
  location: { file: SETTINGS_REL },
});

const findingForMissingOwner = (entry: Categorized): AdvisoryFinding => ({
  kind: "advisory",
  ruleId: RULE_ID,
  severity: "error",
  message:
    `Skill '${entry.name}' source '${entry.source}' looks like a registry skill reference but is missing the \`@owner\` prefix. ` +
    `Edit \`.axm/settings.json\` and change the '${entry.name}' entry under \`settings.skills\` to an owner-qualified source such as \`@owner/skills/${entry.name}\`.`,
  location: { file: SETTINGS_REL },
});

const findingForDuplicate = (
  entry: Categorized,
  duplicates: ReadonlyArray<string>,
): AdvisoryFinding => ({
  kind: "advisory",
  ruleId: RULE_ID,
  severity: "error",
  message:
    `Skill '${entry.name}' points to the same registry skill as these entries: ${duplicates.join(", ")}. ` +
    "Edit `.axm/settings.json` and keep only one declaration under `settings.skills` for that registry skill.",
  location: { file: SETTINGS_REL },
});

export const skillsDeclarationsValidRule: AdvisoryRule<WorkspaceRuleContext> = {
  id: RULE_ID,
  description: "Declared skills use unique, resolvable sources.",
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
      const skills = decoded.value.skills ?? {};
      const entries: ReadonlyArray<Categorized> = Object.entries(skills).map(([name, entry]) =>
        categorizeEntry(name, entry.source),
      );

      // Group by registry FQN for duplicate detection.
      const byFqn = new Map<string, Array<Categorized>>();
      for (const entry of entries) {
        if (entry.kind !== "registry" || entry.registryFqn === undefined) {
          continue;
        }
        const group = byFqn.get(entry.registryFqn) ?? [];
        group.push(entry);
        byFqn.set(entry.registryFqn, group);
      }

      const findings: Array<AdvisoryFinding> = [];
      for (const entry of entries) {
        if (entry.kind === "bare") {
          findings.push(findingForBareName(entry));
          continue;
        }
        if (entry.kind === "registry-no-owner") {
          findings.push(findingForMissingOwner(entry));
          continue;
        }
        if (entry.kind === "non-registry") {
          // Non-registry sources are allowed for skills (local, git-hosted)
          // and don't fire this rule. Move on.
          continue;
        }
        if (entry.kind === "registry" && entry.registryFqn !== undefined) {
          const group = byFqn.get(entry.registryFqn) ?? [];
          if (group.length > 1) {
            findings.push(findingForDuplicate(entry, group.map((g) => g.name).sort()));
          }
        }
      }
      return findings;
    }),
};
