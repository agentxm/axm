/**
 * `buildPackRuleContexts` — build `PackRuleContext[]` from a
 * `WorkspaceIndex`-shaped input.
 *
 * Phase 3c owns `WorkspaceIndex`; Phase 3b pins the minimal shape
 * `buildPackRuleContexts` consumes so Phase 3c can satisfy it without
 * renegotiation. The minimal shape is **exactly** the set of fields the
 * function reads per installed pack:
 *
 * - `packJson` — pre-decoded `extension-pack.json` when present (caller
 *   decodes once per pack, so rules don't re-read + re-parse).
 * - `displayRoot` — posix-relative root used by the renderer; the caller
 *   picks per provenance (see the table below).
 * - `files` — the pre-bound `PackFileAccessor`. The caller chooses VFT or
 *   platform-backed.
 *
 * Provenance → `displayRoot` table:
 *
 * | Surface                            | `displayRoot`                             |
 * | ---------------------------------- | ----------------------------------------- |
 * | Publish (Phase 4)                  | `""`                                      |
 * | Registry-installed pack            | `.axm/extensions/<@owner>/packs/<name>`   |
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { PackFileAccessor, PackRuleContext } from "../../context.js";

// -----------------------------------------------------------------------------
// WorkspaceIndex-facing shape
// -----------------------------------------------------------------------------

/**
 * Minimal structural shape `buildPackRuleContexts` needs per installed
 * pack. Phase 3c's `WorkspaceIndex` satisfies this by construction — its
 * `installedPacks` field is `ReadonlyArray<InstalledPackInfo>`.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface InstalledPackInfo {
  readonly packJson: unknown;
  readonly displayRoot: string;
  readonly files: PackFileAccessor;
}

/**
 * Minimal structural shape of the WorkspaceIndex subset `buildPackRuleContexts`
 * consumes. Keeping the function input narrow keeps Phase 3b and Phase 3c
 * decoupled: the index implementation (Phase 3c) can add more methods
 * without affecting this call site.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface PackIndexView {
  readonly installedPacks: ReadonlyArray<InstalledPackInfo>;
}

// -----------------------------------------------------------------------------
// buildPackRuleContexts
// -----------------------------------------------------------------------------

/**
 * Project an index's `installedPacks` into `PackRuleContext`s with their
 * `displayRoot` and `subject` fields pre-populated.
 *
 * Publish callers bypass this helper and construct a single context directly
 * — they have exactly one pack in play and no workspace.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const buildPackRuleContexts = (index: PackIndexView): ReadonlyArray<PackRuleContext> =>
  index.installedPacks.map(
    (info): PackRuleContext => ({
      subject: {
        packJson: info.packJson,
      },
      files: info.files,
      displayRoot: info.displayRoot,
    }),
  );
