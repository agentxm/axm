import "./command.e2e.js";

/**
 * Binds this file's evidence to the requirement identities it executes at the
 * process boundary. The literal shape is read by the specification catalog;
 * cli-e2e deliberately has no code dependency on the specifications package.
 */
export const executionBinding = {
  requirements: ["cli/mcps/inline-lifecycle-is-idempotent"],
  boundary: "process",
  rationale:
    "Runs the built CLI end to end so the inline MCP add/uninstall cycle proves argv parsing, exit codes, JSON envelopes on stdout, and native agent config files on disk that in-memory execution cannot observe.",
} as const;
