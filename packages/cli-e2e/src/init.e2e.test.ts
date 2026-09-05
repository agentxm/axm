import "./cli-commands/setup/command.e2e.js";

export const executionBinding = {
  requirements: [
    "cli/setup/initializes-selected-workspace",
    "cli/setup/unattended-apply-requires-explicit-intent",
    "cli/setup/rerun-preserves-existing-configuration",
  ],
  boundary: "process",
  rationale:
    "This Vitest entrypoint executes the imported cli-commands/setup/command.e2e.ts scenarios through real CLI processes. They observe selected-directory argv, bundled files, unattended setup prerequisites, and repeat setup preserving declared configuration. Imported source bytes remain part of the repository execution inputs; this binding attributes evidence to the selected entrypoint, not to an import alone.",
} as const;
