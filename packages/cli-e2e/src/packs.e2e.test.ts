import "./cli-commands/packs/packs.e2e.js";
import "./cli-commands/packs/publish/publish.e2e.js";

/**
 * Binds this file's evidence to the requirement identities it executes at the
 * process boundary. The literal shape is read by the specification catalog;
 * cli-e2e deliberately has no code dependency on the specifications package.
 */
export const executionBinding = {
  requirements: ["cli/extension-types/authored-packs-expand-membership"],
  boundary: "process",
  rationale:
    "Runs pack authoring, membership editing, publish, install, unpack, and uninstall through the real CLI process against a file Registry, proving argv parsing, confirmation flows, exit codes, and on-disk manifest and workspace state that in-memory execution cannot observe.",
} as const;
