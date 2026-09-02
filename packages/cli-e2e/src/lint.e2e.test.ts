import "./cli-commands/lint/command.e2e.js";

/**
 * Binds this file's evidence to the requirement identities it executes at the
 * process boundary. The literal shape is read by the specification catalog;
 * cli-e2e deliberately has no code dependency on the specifications package.
 */
export const executionBinding = {
  requirements: [
    "cli/lint/reports-facts-without-mutation",
    "cli/lint/findings-name-the-violated-invariant",
    "cli/lint/honors-configured-rule-severities",
    "cli/lint/observes-selected-filesystem-view",
  ],
  boundary: "process",
  rationale:
    "Runs the real lint process against built workspaces and Git repositories, proving exit codes, human and machine channel output, git-index views, and untouched on-disk and staged state that the in-memory entry cannot observe.",
} as const;
