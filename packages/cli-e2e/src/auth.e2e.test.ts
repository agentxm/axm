import "./cli-commands/auth/auth.e2e.js";
import "./cli-commands/auth/login/login.e2e.test.js";
import "./cli-commands/auth/logout/logout.e2e.js";
import "./cli-commands/auth/token/token.e2e.js";
import "./cli-commands/auth/whoami/whoami.e2e.js";

export const executionBinding = {
  requirements: [
    "cli/token/returns-effective-token",
    "cli/credentials-follow-explicit-source-precedence",
    "cli/token/completes-required-human-verification",
  ],
  boundary: "process",
  rationale:
    "This Vitest entrypoint executes the imported cli-commands/auth/token/token.e2e.ts scenarios through real CLI processes. They observe raw/JSON token stdout and HTTP verification followed by token creation. Imported source bytes remain part of the repository execution inputs; this binding attributes evidence to the selected entrypoint, not to an import alone.",
} as const;
