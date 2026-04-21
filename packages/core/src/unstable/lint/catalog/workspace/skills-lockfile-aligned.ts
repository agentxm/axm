/**
 * `workspace/skills-lockfile-aligned` — skill lock entries correspond 1:1 to
 * declared skills at satisfying versions.
 *
 * Cascade per `docs/design/lint-engine.md §10.workspace.Skills` (first
 * failing arm per affected entity):
 *
 * 1. **Missing** — every declared skill has a matching lock entry.
 *    Autofix: `install-skill` with `force: false` per missing declaration.
 * 2. **Orphan** — every skill lock entry has a matching declaration **or**
 *    is `retainedByPack: true` AND a matching installed declared pack
 *    declares it. Autofix: `uninstall-skill` per orphan lock entry.
 *    Retention carve-out: `retainedByPack: true` entries whose FQN appears
 *    in the resolved-map of at least one installed declared pack are NOT
 *    orphans.
 * 3. **Version skew** — each lock entry's `resolvedVersion` satisfies the
 *    declared version constraint (for registry sources). Autofix:
 *    `install-skill` with `force: true`.
 *
 * One finding per affected entity. Autofixing — each arm emits exactly one
 * Operation per affected entity.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import type { WorkspaceRuleContext } from "../../context.js";
import type { AutofixableFinding, AutofixingRule, LintFinding } from "../../rule.js";
import { LockfileSchema, type Lockfile, type SkillLockEntry } from "../../../lockfile/schema.js";
import { SettingsSchema, type Settings } from "../../../settings/schema.js";
import { installSkillOp, uninstallSkillOp } from "./helpers/install-ops.js";
import { parseRegistrySource } from "./helpers/registry-source.js";
import { EMPTY_LINT_FINDINGS, EMPTY_OPERATIONS } from "./helpers/empty.js";

const RULE_ID = "workspace/skills-lockfile-aligned";
const LOCKFILE_REL = ".axm/axm-lock.yaml";

const SUG_MISSING_PREFIX = "Install skill ";
const SUG_ORPHAN_PREFIX = "Uninstall orphan skill ";
const SUG_VERSION_PREFIX = "Reinstall skill ";

const decodeSettings = (input: unknown): Option.Option<Settings> => {
  const result = Schema.decodeUnknownResult(SettingsSchema)(input, {
    onExcessProperty: "ignore",
    errors: "all",
  });
  return Result.isSuccess(result) ? Option.some(result.success) : Option.none();
};

const decodeLockfile = (input: unknown): Option.Option<Lockfile> => {
  const result = Schema.decodeUnknownResult(LockfileSchema)(input, {
    onExcessProperty: "ignore",
    errors: "all",
  });
  return Result.isSuccess(result) ? Option.some(result.success) : Option.none();
};

const missingFinding = (name: string, source: string): AutofixableFinding => ({
  kind: "autofixable",
  ruleId: RULE_ID,
  severity: "error",
  message: `Skill '${name}' is declared in settings but missing from the lockfile.`,
  suggestions: [`${SUG_MISSING_PREFIX}'${name}' from ${source}.`],
  location: { file: LOCKFILE_REL },
});

const orphanFinding = (name: string): AutofixableFinding => ({
  kind: "autofixable",
  ruleId: RULE_ID,
  severity: "error",
  message: `Skill '${name}' is present in the lockfile but not declared in settings.`,
  suggestions: [`${SUG_ORPHAN_PREFIX}'${name}' to remove it from the workspace.`],
  location: { file: LOCKFILE_REL },
});

const versionFinding = (name: string, details: string): AutofixableFinding => ({
  kind: "autofixable",
  ruleId: RULE_ID,
  severity: "error",
  message: `Skill '${name}' lock version does not satisfy the declared constraint: ${details}.`,
  suggestions: [`${SUG_VERSION_PREFIX}'${name}' at the declared version.`],
  location: { file: LOCKFILE_REL },
});

// -----------------------------------------------------------------------------
// Retention helpers
// -----------------------------------------------------------------------------

const isRegistryEntry = (
  entry: SkillLockEntry,
): entry is Extract<SkillLockEntry, { readonly type: "registry" }> => entry.type === "registry";

const lockEntryFqn = (entry: SkillLockEntry, name: string): string => {
  if (isRegistryEntry(entry)) {
    return `${entry.owner}/skills/${entry.name}`;
  }
  return `skills/${name}`;
};

/**
 * Build the set of FQNs retained by at least one installed declared pack.
 * An entry is retained only when:
 *
 * - its lockfile entry has `retainedByPack: true`, AND
 * - at least one pack lock entry's `resolvedSkills` map has a key matching
 *   the entry's FQN, AND
 * - that pack name appears in `settings.packs`.
 */
const buildRetainedSkillFqns = (settings: Settings, lockfile: Lockfile): ReadonlySet<string> => {
  const declaredPackNames = new Set(Object.keys(settings.packs ?? {}));
  const retained = new Set<string>();
  const packLock = lockfile.packs ?? {};
  for (const [packName, packEntry] of Object.entries(packLock)) {
    if (!declaredPackNames.has(packName)) {
      continue;
    }
    for (const fqn of Object.keys(packEntry.resolvedSkills)) {
      retained.add(fqn);
    }
  }
  return retained;
};

export const skillsLockfileAlignedRule: AutofixingRule<WorkspaceRuleContext> = {
  id: RULE_ID,
  description: "Skill lock entries correspond 1:1 to declared skills at satisfying versions.",
  kind: "autofixing",
  severity: "error",
  check: (context) =>
    Effect.gen(function* () {
      const settingsResult = yield* Effect.result(context.workspace.settings);
      const lockfileResult = yield* Effect.result(context.workspace.lockfile);
      if (Result.isFailure(settingsResult) || Result.isFailure(lockfileResult)) {
        return EMPTY_LINT_FINDINGS;
      }
      const settings = decodeSettings(settingsResult.success);
      if (Option.isNone(settings)) {
        return EMPTY_LINT_FINDINGS;
      }
      const lockOption = lockfileResult.success;
      if (Option.isNone(lockOption)) {
        // workspace/lockfile-valid owns the missing arm.
        return EMPTY_LINT_FINDINGS;
      }
      const lockfile = decodeLockfile(lockOption.value);
      if (Option.isNone(lockfile)) {
        // workspace/lockfile-valid owns the schema arm.
        return EMPTY_LINT_FINDINGS;
      }

      const declaredSkills = settings.value.skills ?? {};
      const lockSkills = lockfile.value.skills;
      const retainedFqns = buildRetainedSkillFqns(settings.value, lockfile.value);

      const findings: Array<LintFinding> = [];
      const affected = new Set<string>();

      // Arm 1: missing — declared but no lock entry.
      for (const [name, entry] of Object.entries(declaredSkills)) {
        if (!(name in lockSkills)) {
          findings.push(missingFinding(name, entry.source));
          affected.add(`declared:${name}`);
        }
      }

      // Arm 2: orphan — lock entry but no declaration, and not retained by
      // an installed declared pack.
      for (const [name, entry] of Object.entries(lockSkills)) {
        if (name in declaredSkills) {
          continue;
        }
        if (entry.retainedByPack === true && retainedFqns.has(lockEntryFqn(entry, name))) {
          continue;
        }
        findings.push(orphanFinding(name));
        affected.add(`lock:${name}`);
      }

      // Arm 3: version skew — declared AND in lock, but registry-shaped
      // source constraint not satisfied by resolvedVersion.
      for (const [name, entry] of Object.entries(declaredSkills)) {
        if (affected.has(`declared:${name}`)) {
          continue;
        }
        const lockEntry = lockSkills[name];
        if (lockEntry === undefined || !isRegistryEntry(lockEntry)) {
          continue;
        }
        const parsed = parseRegistrySource(entry.source);
        if (parsed === undefined) {
          continue;
        }
        const constraint = parsed.versionConstraint;
        if (constraint === undefined) {
          continue;
        }
        // Simple exact-match semver check: the only non-heuristic arm we
        // can enforce without pulling in the semver lib here. Range checks
        // defer to the CLI adapter (Phase 5).
        if (constraint !== lockEntry.resolvedVersion) {
          findings.push(
            versionFinding(name, `declared ${constraint}, locked ${lockEntry.resolvedVersion}`),
          );
        }
      }

      return findings;
    }),
  fix: (context, finding) =>
    Effect.gen(function* () {
      const s0 = finding.suggestions[0];
      if (s0.startsWith(SUG_MISSING_PREFIX)) {
        const name = extractSkillName(s0);
        if (name === undefined) {
          return EMPTY_OPERATIONS;
        }
        const settingsResult = yield* Effect.result(context.workspace.settings);
        if (Result.isFailure(settingsResult)) {
          return EMPTY_OPERATIONS;
        }
        const settings = decodeSettings(settingsResult.success);
        if (Option.isNone(settings)) {
          return EMPTY_OPERATIONS;
        }
        const entry = settings.value.skills?.[name];
        if (entry === undefined) {
          return EMPTY_OPERATIONS;
        }
        return [installSkillOp({ name, source: entry.source, force: false })];
      }
      if (s0.startsWith(SUG_ORPHAN_PREFIX)) {
        const name = extractSkillName(s0);
        if (name === undefined) {
          return EMPTY_OPERATIONS;
        }
        return [uninstallSkillOp({ name })];
      }
      if (s0.startsWith(SUG_VERSION_PREFIX)) {
        const name = extractSkillName(s0);
        if (name === undefined) {
          return EMPTY_OPERATIONS;
        }
        const settingsResult = yield* Effect.result(context.workspace.settings);
        if (Result.isFailure(settingsResult)) {
          return EMPTY_OPERATIONS;
        }
        const settings = decodeSettings(settingsResult.success);
        if (Option.isNone(settings)) {
          return EMPTY_OPERATIONS;
        }
        const entry = settings.value.skills?.[name];
        if (entry === undefined) {
          return EMPTY_OPERATIONS;
        }
        return [installSkillOp({ name, source: entry.source, force: true })];
      }
      return EMPTY_OPERATIONS;
    }),
};

const NAME_FROM_SUGGESTION_RE = /'([^']+)'/;

const extractSkillName = (suggestion: string): string | undefined => {
  const match = NAME_FROM_SUGGESTION_RE.exec(suggestion);
  return match?.[1];
};
