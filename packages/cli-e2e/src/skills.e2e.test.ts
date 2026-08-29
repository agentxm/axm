import "./cli-commands/skills/command.e2e.js";
import "./cli-commands/skills/disable/command.e2e.js";
import "./cli-commands/skills/enable/command.e2e.js";
import "./cli-commands/skills/install/command.e2e.js";
import "./cli-commands/skills/install/preview.e2e.js";
import "./cli-commands/skills/install/rebuild-lockfile.e2e.js";
import "./cli-commands/skills/list/command.e2e.js";
import "./cli-commands/skills/new/command.e2e.js";
import "./cli-commands/skills/publish/publish.e2e.js";
import "./cli-commands/skills/sync/command.e2e.js";
import "./cli-commands/skills/uninstall/command.e2e.js";
import "./cli-commands/skills/update/command.e2e.js";

/**
 * Binds this file's evidence to the requirement identities it executes at the
 * process boundary. The literal shape is read by the specification catalog;
 * cli-e2e deliberately has no code dependency on the specifications package.
 */
export const executionBinding = {
  requirements: ["cli/update/advances-resolution-within-intent"],
  boundary: "process",
  rationale:
    "Runs the real skills update command against a changed local source, proving the accepted content identity advances while configuration stays byte-identical, disabled entries are skipped, and preview applies nothing — local-source advancement the in-memory root update surface does not expose.",
} as const;
