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
  requirements: [
    "cli/update/advances-resolution-within-intent",
    "cli/publish/requires-explicit-acceptance-for-non-head-source",
  ],
  boundary: "process",
  rationale:
    "Runs real skills update and publish commands, proving local-source advancement plus Git HEAD source review, explicit warning acceptance, process exit codes, machine output, and Registry effects that in-memory execution cannot expose.",
} as const;
