/**
 * `workspace/skills-artifacts-clean` — skill artifacts on disk are live,
 * declared, and canonically named.
 *
 * Cascade per `docs/design/lint-engine.md §10.workspace.Skills` (first
 * failing arm per affected entity):
 *
 * - **Dangling** (autofixing) — an artifact exists in a declared agent's
 *   skills dir but the canonical source under `.axm/extensions/.../src/`
 *   is missing. Autofix: `install-skill` with `force: true`.
 * - **Stale** (advisory) — an artifact exists in a declared agent's skills
 *   dir whose name doesn't correspond to any declared enabled skill. No
 *   pre-sync Operation applies (the artifact isn't axm-owned after the
 *   skill is no longer declared); emit an advisory CLI suggestion.
 * - **Name-mismatch** (advisory) — an artifact exists with a name that
 *   doesn't match the sanitized declared skill name (legacy casing,
 *   pre-sanitization). Emit an advisory CLI suggestion.
 *
 * Listing per-agent skill targets uses `context.workspace.list(...)`.
 *
 * The rule emits at most one finding per artifact — cascade resolves per
 * filesystem entry.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import type { WorkspaceRuleContext } from "../../context.js";
import type {
  AdvisoryFinding,
  AutofixableFinding,
  AutofixingRule,
  LintFinding,
} from "../../rule.js";
import type { AgentDescriptor } from "../../../agents/types.js";
import type { Operation } from "../../../plan/plan.js";
import { LockfileSchema, type Lockfile } from "../../../lockfile/schema.js";
import { SettingsSchema, type Settings } from "../../../settings/schema.js";
import { installSkillOp } from "./helpers/install-ops.js";
import { parseRegistrySource } from "./helpers/registry-source.js";
import { EMPTY_LINT_FINDINGS, EMPTY_OPERATIONS } from "./helpers/empty.js";
import { isUniversalSkillsRelativeDir } from "../../../extensions/universal-skills-dir.js";

const RULE_ID = "workspace/skills-artifacts-clean";

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

/**
 * Names of skills retained by at least one installed declared pack. These
 * skill artifacts are valid even though the skill isn't in `settings.skills`.
 */
const buildRetainedSkillNames = (settings: Settings, lockfile: Lockfile): ReadonlySet<string> => {
  const declaredPackNames = new Set(Object.keys(settings.packs ?? {}));
  const names = new Set<string>();
  const packLock = lockfile.packs ?? {};
  for (const [packName, packEntry] of Object.entries(packLock)) {
    if (!declaredPackNames.has(packName)) {
      continue;
    }
    for (const fqn of Object.keys(packEntry.resolvedSkills)) {
      // FQN is `@owner/skills/<name>`; last segment is the skill name.
      const parts = fqn.split("/");
      const last = parts[parts.length - 1];
      if (last !== undefined) {
        names.add(last);
      }
    }
  }
  // Also add lockfile-level skills with retainedByPack=true so accessor
  // round-trips work even when the pack resolved map misnames them.
  for (const [name, entry] of Object.entries(lockfile.skills)) {
    if (entry.retainedByPack === true) {
      names.add(name);
    }
  }
  return names;
};

// Very narrow sanitization: lowercase, replace underscores with hyphens.
// The authoritative sanitizer lives at axm extensions/utils.ts#sanitizeName;
// v1 lint checks for exact match and surfaces any divergence as a
// name-mismatch advisory arm.
const isCanonicallyNamed = (artifact: string, declared: string): boolean => artifact === declared;

const danglingFinding = (name: string, agentId: string): AutofixableFinding => ({
  kind: "autofixable",
  ruleId: RULE_ID,
  severity: "error",
  message:
    `Skill '${name}' is present in agent '${agentId}'s skills directory, but its installed source directory is missing. ` +
    "Run `axm lint --fix` to reinstall it and restore the missing source files.",
  location: { file: `${agentId}/skills/${name}` },
});

const staleFinding = (name: string, agentId: string): AdvisoryFinding => ({
  kind: "advisory",
  ruleId: RULE_ID,
  severity: "error",
  message:
    `Skill '${name}' is present in agent '${agentId}'s skills directory, but it is not listed in settings.skills. ` +
    `To keep it, add '${name}' under \`settings.skills\` in \`.axm/settings.json\` with the intended source. ` +
    "Each `settings.skills` entry can be a source string or an object with `source` and optional `enabled`. " +
    "To remove it, delete it from that directory.",
  location: { file: `${agentId}/skills/${name}` },
});

const nameMismatchFinding = (
  agentId: string,
  artifact: string,
  expected: string,
): AdvisoryFinding => ({
  kind: "advisory",
  ruleId: RULE_ID,
  severity: "error",
  message:
    `Skill '${artifact}' is present in agent '${agentId}'s skills directory, but settings.skills declares it as '${expected}'. ` +
    `To keep it, rename that directory to '${expected}' so it matches \`settings.skills\` in \`.axm/settings.json\`. ` +
    `To remove it, delete '${artifact}' from that directory.`,
  location: { file: `${agentId}/skills/${artifact}` },
});

interface ArtifactCleanViolation {
  readonly finding: LintFinding;
  readonly operation?: Operation<string, unknown>;
}

/**
 * Build candidate canonical `SKILL.md` probe paths for `name`, trying the
 * settings-declared registry owner first (if any) and the external layout
 * as a fallback. Non-registry sources fall through to the external probe.
 */
const canonicalSrcProbesForName = (name: string, settings: Settings): ReadonlyArray<string> => {
  const entry = settings.skills?.[name];
  const parsed = entry === undefined ? undefined : parseRegistrySource(entry.source);
  const probes: Array<string> = [];
  if (parsed !== undefined) {
    probes.push(`.axm/extensions/${parsed.owner}/skills/${name}/src/SKILL.md`);
  }
  probes.push(`.axm/extensions/external/skills/${name}/SKILL.md`);
  return probes;
};

const isSameFinding = (left: AutofixableFinding, right: AutofixableFinding): boolean =>
  left.ruleId === right.ruleId &&
  left.message === right.message &&
  left.location?.file === right.location?.file;

export const skillsArtifactsCleanRule: AutofixingRule<WorkspaceRuleContext> = {
  id: RULE_ID,
  description: "Skill artifacts on disk are live, declared, and canonically named.",
  kind: "autofixing",
  severity: "error",
  check: (context) =>
    Effect.gen(function* () {
      const settingsResult = yield* Effect.result(context.workspace.settings);
      if (Result.isFailure(settingsResult)) {
        return EMPTY_LINT_FINDINGS;
      }
      const settings = decodeSettings(settingsResult.success);
      if (Option.isNone(settings)) {
        return EMPTY_LINT_FINDINGS;
      }
      const declaredAgentIds = new Set(settings.value.agents ?? []);
      if (declaredAgentIds.size === 0) {
        return EMPTY_LINT_FINDINGS;
      }
      const knownAgents = yield* context.workspace.knownAgents;
      const declaredAgents: ReadonlyArray<AgentDescriptor> = knownAgents.filter((a) =>
        declaredAgentIds.has(a.id),
      );

      const declaredSkills = settings.value.skills ?? {};
      const declaredEnabledNames = new Set(
        Object.entries(declaredSkills)
          .filter(([, v]) => v.enabled)
          .map(([k]) => k),
      );

      // Pull in pack-retained skill names from the lockfile so retained
      // artifacts aren't mis-classified as stale.
      const lockfileResult = yield* Effect.result(context.workspace.lockfile);
      const retainedNames: ReadonlySet<string> = Result.isSuccess(lockfileResult)
        ? Option.match(lockfileResult.success, {
            onNone: () => new Set<string>(),
            onSome: (raw) =>
              Option.match(decodeLockfile(raw), {
                onNone: () => new Set<string>(),
                onSome: (lock) => buildRetainedSkillNames(settings.value, lock),
              }),
          })
        : new Set<string>();

      const violations: Array<ArtifactCleanViolation> = [];

      for (const agent of declaredAgents) {
        const listResult = yield* Effect.result(context.workspace.list(agent.skills.dir));
        if (Result.isFailure(listResult)) {
          // Directory doesn't exist or isn't readable. Not an artifact-clean
          // issue — the corresponding enabled arm surfaces missing dirs.
          continue;
        }
        const artifacts = listResult.success;

        for (const artifact of artifacts) {
          // Retention carve-out: pack-retained skill artifacts are valid
          // even when not in settings.skills.
          if (retainedNames.has(artifact)) {
            continue;
          }
          // Cascade first-failure per artifact.
          // Arm 1: dangling — artifact links back to a declared skill name
          // but canonical src is missing.
          if (declaredEnabledNames.has(artifact)) {
            const probes = canonicalSrcProbesForName(artifact, settings.value);
            const probeResults = yield* Effect.all(
              probes.map((probe) => context.workspace.exists(probe)),
              { concurrency: "unbounded" },
            );
            if (probeResults.every((exists) => !exists)) {
              const entry = settings.value.skills?.[artifact];
              if (entry === undefined) {
                violations.push({ finding: danglingFinding(artifact, agent.id) });
              } else {
                violations.push({
                  finding: danglingFinding(artifact, agent.id),
                  operation: installSkillOp({ name: artifact, source: entry.source, force: true }),
                });
              }
              continue;
            }
            continue;
          }

          // Arm 2/3: not a declared enabled name — name-mismatch or stale.
          // Name-mismatch: artifact normalizes to a declared enabled name
          // but differs in casing or similar. v1 check is case-insensitive.
          const caseMatch = Array.from(declaredEnabledNames).find(
            (d) => d.toLowerCase() === artifact.toLowerCase() && !isCanonicallyNamed(artifact, d),
          );
          if (caseMatch !== undefined) {
            violations.push({ finding: nameMismatchFinding(agent.id, artifact, caseMatch) });
            continue;
          }
          // Skip stale-artifact check for universal dir — artifacts are shared
          if (isUniversalSkillsRelativeDir(agent.skills.dir)) {
            continue;
          }
          violations.push({ finding: staleFinding(artifact, agent.id) });
        }
      }
      return violations.map((violation) => violation.finding);
    }),
  fix: (context, finding) =>
    Effect.gen(function* () {
      const settingsResult = yield* Effect.result(context.workspace.settings);
      if (Result.isFailure(settingsResult)) {
        return EMPTY_OPERATIONS;
      }
      const settings = decodeSettings(settingsResult.success);
      if (Option.isNone(settings)) {
        return EMPTY_OPERATIONS;
      }
      const declaredAgentIds = new Set(settings.value.agents ?? []);
      if (declaredAgentIds.size === 0) {
        return EMPTY_OPERATIONS;
      }
      const knownAgents = yield* context.workspace.knownAgents;
      const declaredAgents: ReadonlyArray<AgentDescriptor> = knownAgents.filter((a) =>
        declaredAgentIds.has(a.id),
      );

      const declaredSkills = settings.value.skills ?? {};
      const declaredEnabledNames = new Set(
        Object.entries(declaredSkills)
          .filter(([, v]) => v.enabled)
          .map(([k]) => k),
      );
      const lockfileResult = yield* Effect.result(context.workspace.lockfile);
      const retainedNames: ReadonlySet<string> = Result.isSuccess(lockfileResult)
        ? Option.match(lockfileResult.success, {
            onNone: () => new Set<string>(),
            onSome: (raw) =>
              Option.match(decodeLockfile(raw), {
                onNone: () => new Set<string>(),
                onSome: (lock) => buildRetainedSkillNames(settings.value, lock),
              }),
          })
        : new Set<string>();

      const violations: Array<ArtifactCleanViolation> = [];
      for (const agent of declaredAgents) {
        const listResult = yield* Effect.result(context.workspace.list(agent.skills.dir));
        if (Result.isFailure(listResult)) {
          continue;
        }
        for (const artifact of listResult.success) {
          if (retainedNames.has(artifact)) {
            continue;
          }
          if (declaredEnabledNames.has(artifact)) {
            const probes = canonicalSrcProbesForName(artifact, settings.value);
            const probeResults = yield* Effect.all(
              probes.map((probe) => context.workspace.exists(probe)),
              { concurrency: "unbounded" },
            );
            if (probeResults.every((exists) => !exists)) {
              const entry = settings.value.skills?.[artifact];
              if (entry === undefined) {
                violations.push({ finding: danglingFinding(artifact, agent.id) });
              } else {
                violations.push({
                  finding: danglingFinding(artifact, agent.id),
                  operation: installSkillOp({ name: artifact, source: entry.source, force: true }),
                });
              }
            }
            continue;
          }
          const caseMatch = Array.from(declaredEnabledNames).find(
            (d) => d.toLowerCase() === artifact.toLowerCase() && !isCanonicallyNamed(artifact, d),
          );
          if (caseMatch !== undefined) {
            violations.push({ finding: nameMismatchFinding(agent.id, artifact, caseMatch) });
            continue;
          }
          if (isUniversalSkillsRelativeDir(agent.skills.dir)) {
            continue;
          }
          violations.push({ finding: staleFinding(artifact, agent.id) });
        }
      }
      const violation = violations.find(
        (
          candidate,
        ): candidate is {
          readonly finding: AutofixableFinding;
          readonly operation?: Operation<string, unknown>;
        } => candidate.finding.kind === "autofixable" && isSameFinding(candidate.finding, finding),
      );
      if (violation?.operation === undefined) {
        return EMPTY_OPERATIONS;
      }
      return [violation.operation];
    }),
};
