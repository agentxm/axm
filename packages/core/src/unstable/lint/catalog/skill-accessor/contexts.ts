/**
 * `buildSkillRuleContexts` — build `SkillRuleContext[]` from a
 * `WorkspaceIndex`-shaped input.
 *
 * Phase 3c owns `WorkspaceIndex`; Phase 3a pins the minimal shape
 * `buildSkillRuleContexts` consumes so Phase 3c can satisfy it without
 * renegotiation. The minimal shape is **exactly** the set of fields the
 * function reads per installed skill:
 *
 * - `isNative` — whether the skill is expected to expose `skill.json`
 *   (registry-installed natives: `true`; managed external: `false`).
 * - `skillJson` — pre-decoded `skill.json` when present (caller decodes
 *   once per skill, so rules don't re-read + re-parse).
 * - `displayRoot` — posix-relative root used by the renderer; the caller
 *   picks per provenance (see the table below).
 * - `files` — the pre-bound `SkillFileAccessor`. The caller chooses VFT or
 *   platform-backed.
 *
 * Provenance → `displayRoot` table:
 *
 * | Surface                                   | `displayRoot`                                 |
 * | ----------------------------------------- | --------------------------------------------- |
 * | Publish (Phase 4)                         | `""`                                          |
 * | Registry-installed native skill           | `.axm/extensions/<@owner>/skills/<name>/src`  |
 * | External skill                            | `.axm/extensions/external/skills/<name>`      |
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { SkillFileAccessor, SkillRuleContext } from "../../context.js";

// -----------------------------------------------------------------------------
// WorkspaceIndex-facing shape
// -----------------------------------------------------------------------------

/**
 * Minimal structural shape `buildSkillRuleContexts` needs per installed
 * skill. Phase 3c's `WorkspaceIndex` satisfies this by construction — its
 * `installedSkills` field is `ReadonlyArray<InstalledSkillInfo>`.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface InstalledSkillInfo {
  readonly isNative: boolean;
  readonly skillJson: unknown;
  readonly displayRoot: string;
  readonly files: SkillFileAccessor;
}

/**
 * Minimal structural shape of the WorkspaceIndex subset `buildSkillRuleContexts`
 * consumes. Keeping the function input narrow keeps Phase 3a and Phase 3c
 * decoupled: the index implementation (Phase 3c) can add more methods
 * without affecting this call site.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface SkillIndexView {
  readonly installedSkills: ReadonlyArray<InstalledSkillInfo>;
}

// -----------------------------------------------------------------------------
// buildSkillRuleContexts
// -----------------------------------------------------------------------------

/**
 * Project an index's `installedSkills` into `SkillRuleContext`s with their
 * `displayRoot` and `subject` fields pre-populated.
 *
 * Publish callers bypass this helper and construct a single context directly
 * — they have exactly one skill in play and no workspace.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const buildSkillRuleContexts = (index: SkillIndexView): ReadonlyArray<SkillRuleContext> =>
  index.installedSkills.map(
    (info): SkillRuleContext => ({
      subject: {
        isNative: info.isNative,
        skillJson: info.skillJson,
      },
      files: info.files,
      displayRoot: info.displayRoot,
    }),
  );
