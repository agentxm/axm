import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Argument, Command, Flag } from "effect/unstable/cli";

import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import type { WorkspaceScope } from "@agentxm/client-core/unstable/workspace";

import { scopeFlag } from "../../cli-flags.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { handleLint } from "./handler.js";
import { materializeStagedWorkspace } from "./staged-workspace.js";

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
  staged: Flag.boolean("staged").pipe(
    Flag.withDescription("Lint the complete project workspace represented by the Git index."),
  ),
} as const;

interface RunLintCommandArgs {
  readonly path: Option.Option<string>;
  readonly scope: WorkspaceScope;
  readonly fix: boolean;
  readonly strict: boolean;
  readonly details: boolean;
  readonly staged: boolean;
}

const runLintCommand = Effect.fn("Lint.command")(function* (args: RunLintCommandArgs) {
  if (args.staged && args.fix) {
    return yield* makeAppError({
      code: "validation",
      detail: "--staged cannot be combined with --fix because staged lint is read-only",
    });
  }
  if (args.staged && args.scope === "user") {
    return yield* makeAppError({
      code: "validation",
      detail:
        "--staged cannot be combined with --scope user because Git indexes are project-scoped",
    });
  }

  if (args.staged) {
    const startPath = Option.getOrElse(args.path, () => process.cwd());
    const snapshot = yield* materializeStagedWorkspace(startPath);
    return yield* handleLint({
      pathArg: Option.some(snapshot.workspaceRoot),
      scope: "project",
      fix: false,
      strict: args.strict,
      details: args.details,
      displayWorkspaceRoot: snapshot.gitRoot,
      // Instruction aliases are generated, intentionally gitignored workspace
      // state, so they cannot be evaluated from the exact Git index. Full
      // `axm lint --strict` (recommended for pre-push and CI) still checks them.
      ruleOverrides: { "workspace/instructions-target-current": "off" },
    }).pipe(withWorkspace({ scope: "project", projectRoot: snapshot.workspaceRoot }));
  }

  const workspaceOptions =
    args.scope === "project" && Option.isSome(args.path)
      ? { scope: args.scope, projectRoot: args.path.value }
      : { scope: args.scope };
  return yield* handleLint({
    pathArg: args.path,
    scope: args.scope,
    fix: args.fix,
    strict: args.strict,
    details: args.details,
  }).pipe(withWorkspace(workspaceOptions));
});

export const lintCommand = Command.make(
  "lint",
  lintConfig,
  ({ path, scope, fix, strict, details, staged }) =>
    runLintCommand({ path, scope, fix, strict, details, staged }).pipe(withRuntime("lint")),
).pipe(
  withArgvTracking(lintConfig),
  Command.withDescription("Check and fix workspace configuration"),
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
      command: "axm lint --staged",
      description: "Lint the complete workspace represented by the Git index",
    },
    {
      command: "axm lint --json",
      description: "Emit findings as a structured JSON document",
    },
  ]),
);
