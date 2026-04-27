/**
 * `buildPackRuleContexts` — build `PackRuleContext[]` from a structural
 * `installedPacks` input. The full lint workspace view
 * (`LintWorkspaceView`) satisfies this by construction.
 *
 * The minimal shape is **exactly** the set of fields the function reads per
 * installed pack:
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
 * | Publish                            | `""`                                      |
 * | Registry-installed pack            | `.axm/extensions/<@owner>/packs/<name>`   |
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { PackFileAccessor, PackRuleContext } from "../../context.js";

// -----------------------------------------------------------------------------
// Installed-pack projection
// -----------------------------------------------------------------------------

/**
 * Minimal structural shape `buildPackRuleContexts` needs per installed
 * pack. The full lint workspace view exposes
 * `installedPacks: ReadonlyArray<InstalledPackInfo>`.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface InstalledPackInfo {
  readonly packJson: unknown;
  readonly displayRoot: string;
  readonly files: PackFileAccessor;
}

// -----------------------------------------------------------------------------
// buildPackRuleContexts
// -----------------------------------------------------------------------------

/**
 * Project an input's `installedPacks` into `PackRuleContext`s with their
 * `displayRoot` and `subject` fields pre-populated.
 *
 * Publish callers bypass this helper and construct a single context directly
 * — they have exactly one pack in play and no workspace.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const buildPackRuleContexts = (input: {
  readonly installedPacks: ReadonlyArray<InstalledPackInfo>;
}): ReadonlyArray<PackRuleContext> =>
  input.installedPacks.map(
    (info): PackRuleContext => ({
      subject: {
        packJson: info.packJson,
      },
      files: info.files,
      displayRoot: info.displayRoot,
    }),
  );
