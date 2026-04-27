/**
 * `buildSkillRuleContexts` — build `SkillRuleContext[]` from a structural
 * `installedSkills` input. The full lint workspace view
 * (`LintWorkspaceView`) satisfies this by construction.
 *
 * The minimal shape is **exactly** the set of fields the function reads per
 * installed skill:
 *
 * - `isNative` — whether the skill is expected to expose `skill.json`
 *   (registry-installed natives: `true`; managed external: `false`).
 * - `skillJson` — pre-decoded `skill.json` when present (caller decodes
 *   once per skill, so rules don't re-read + re-parse).
 * - `displayRoot` — posix-relative root used by the renderer; the caller
 *   picks per provenance (see the table below).
 * - `files` — the pre-bound content-root `SkillFileAccessor` (rooted at the
 *   directory containing `SKILL.md`). The caller chooses VFT or
 *   platform-backed.
 * - `packageFiles` — the pre-bound package-root `SkillFileAccessor` (rooted
 *   at the directory containing `skill.json` for native skills). For
 *   non-native skills, callers MAY alias `files`.
 *
 * Provenance → `displayRoot` table:
 *
 * | Surface                                   | `displayRoot`                                 |
 * | ----------------------------------------- | --------------------------------------------- |
 * | Publish                                   | `""`                                          |
 * | Registry-installed native skill           | `.axm/extensions/<@owner>/skills/<name>/src`  |
 * | External skill                            | `.axm/extensions/external/skills/<name>`      |
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { SkillFileAccessor, SkillRuleContext } from "../../context.js";

// -----------------------------------------------------------------------------
// Installed-skill projection
// -----------------------------------------------------------------------------

/**
 * Minimal structural shape `buildSkillRuleContexts` needs per installed
 * skill. The full lint workspace view exposes
 * `installedSkills: ReadonlyArray<InstalledSkillInfo>`.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface InstalledSkillInfo {
  readonly isNative: boolean;
  readonly skillJson: unknown;
  readonly displayRoot: string;
  readonly files: SkillFileAccessor;
  readonly packageFiles: SkillFileAccessor;
}

// -----------------------------------------------------------------------------
// buildSkillRuleContexts
// -----------------------------------------------------------------------------

/**
 * Project an input's `installedSkills` into `SkillRuleContext`s with their
 * `displayRoot` and `subject` fields pre-populated.
 *
 * Publish callers bypass this helper and construct a single context directly
 * — they have exactly one skill in play and no workspace.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const buildSkillRuleContexts = (input: {
  readonly installedSkills: ReadonlyArray<InstalledSkillInfo>;
}): ReadonlyArray<SkillRuleContext> =>
  input.installedSkills.map(
    (info): SkillRuleContext => ({
      subject: {
        isNative: info.isNative,
        skillJson: info.skillJson,
      },
      files: info.files,
      packageFiles: info.packageFiles,
      displayRoot: info.displayRoot,
    }),
  );
