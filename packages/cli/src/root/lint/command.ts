import { Argument, Command, Flag } from "effect/unstable/cli";

import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";

import { scopeFlag } from "../../cli-flags.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { handleLint } from "./handler.js";

const lintConfig = {
  path: Argument.string("path").pipe(
    Argument.withDescription(
      "Workspace directory to lint (defaults to the current working directory).",
    ),
    Argument.optional,
  ),
  scope: scopeFlag.pipe(
    Flag.withDescription(
      "Scope of the lint run: project (default) or user (lints $AXM_USER_HOME/.axm or $HOME/.axm).",
    ),
  ),
  fix: Flag.boolean("fix").pipe(
    Flag.withDescription(
      "Apply every autofixable finding non-interactively via the plan pipeline.",
    ),
  ),
  strict: Flag.boolean("strict").pipe(
    Flag.withDescription("Treat warnings as failing for exit code."),
  ),
  details: Flag.boolean("details").pipe(
    Flag.withDescription("Show the full human report instead of the grouped summary."),
  ),
} as const;

export const lintCommand = Command.make(
  "lint",
  lintConfig,
  ({ path, scope, fix, strict, details }) =>
    handleLint({ pathArg: path, scope, fix, strict, details }).pipe(
      withWorkspace(scope),
      withRuntime("lint"),
    ),
).pipe(
  withArgvTracking(lintConfig),
  Command.withDescription(
    "Lint the workspace and (optionally) autofix findings by replaying the per-extension plan pipeline.",
  ),
  Command.withExamples([
    { command: "axm lint", description: "Lint the current project workspace" },
    {
      command: "axm lint --fix",
      description: "Lint, then apply every autofixable finding non-interactively",
    },
    {
      command: "axm lint --scope user",
      description: "Lint the user-scope workspace under $HOME/.axm",
    },
    {
      command: "axm lint --strict",
      description: "Treat warnings as failing for exit code",
    },
    {
      command: "axm lint --details",
      description: "Show the detailed path-by-path report",
    },
    {
      command: "axm lint --json",
      description: "Emit findings as a structured JSON document",
    },
  ]),
);
