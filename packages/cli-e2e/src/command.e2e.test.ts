import "./command.e2e.js";

/**
 * Binds this file's evidence to the requirement identities it executes at the
 * process boundary. The literal shape is read by the specification catalog;
 * cli-e2e deliberately has no code dependency on the specifications package.
 */
export const executionBinding = {
  requirements: [
    "cli/errors-do-not-disclose-credentials",
    "cli/mcps/inline-lifecycle-is-idempotent",
    "cli/mcps/add/records-and-realizes-inline-configuration",
    "cli/mcps/uninstall/preserves-unowned-native-entries",
  ],
  boundary: "process",
  rationale:
    "Runs the built CLI to observe inline MCP lifecycle argv, exit codes, JSON envelopes, and native files, and invokes the built error runtime with a synthetic secret to establish redaction in human verbose, debug, and quiet-precedence modes.",
} as const;
