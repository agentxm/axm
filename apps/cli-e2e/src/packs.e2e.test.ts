import "./cli-commands/packs/packs.e2e.js";
import "./cli-commands/packs/publish/publish.e2e.js";

/**
 * Binds this file's evidence to the requirement identities it executes at the
 * process boundary. The literal shape is read by the specification catalog;
 * cli-e2e deliberately has no code dependency on the specifications package.
 */
export const executionBinding = {
  requirements: [
    "cli/packs/new/records-workspace-authorship",
    "cli/packs/add/records-member-as-pack-dependency",
    "cli/sync/reports-aggregate-projection-drift-at-unit-precision",
  ],
  boundary: "process",
  rationale:
    "Runs pack authoring, membership editing, publish, install, unpack, and uninstall through the real CLI process against a file Registry, proving argv parsing, confirmation flows, exit codes, and on-disk manifest and workspace state that in-memory execution cannot observe, including the exact Rules region two packs compose and how sync previews, repairs, and preserves it.",
} as const;
