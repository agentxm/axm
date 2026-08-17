import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { Argument, Command, Flag } from "effect/unstable/cli";

import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import type { WorkspaceScope } from "@agentxm/client-core/unstable/workspace";
import type { LintView } from "@agentxm/client-core/unstable/lint";
import { decodeAbsolutePathSync } from "@agentxm/client-core/unstable/utils";

import { scopeFlag } from "../../cli-flags.js";
import { ExecutionDirectory, resolveExecutionPath } from "../../execution-directory.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { handleLint } from "./handler.js";
import { materializeGitIndexWorkspace } from "./staged-workspace.js";

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
  strict: Flag.boolean("strict").pipe(
    Flag.withDescription("Treat warnings as failing for exit code."),
    Flag.withDefault(false),
  ),
  details: Flag.boolean("details").pipe(
    Flag.withDescription("Show the full human report instead of the grouped summary."),
    Flag.withDefault(false),
  ),
  view: Flag.choice("view", ["workspace", "git-index"] as const).pipe(
    Flag.withDescription("Filesystem view to lint: workspace (default) or the complete Git index."),
    Flag.withDefault("workspace"),
  ),
} as const;

interface RunLintCommandArgs {
  readonly path: Option.Option<string>;
  readonly scope: WorkspaceScope;
  readonly strict: boolean;
  readonly details: boolean;
  readonly view: LintView;
}

const runLintCommand = Effect.fn("Lint.command")(function* (args: RunLintCommandArgs) {
  const executionDirectory = yield* ExecutionDirectory;
  const path = yield* Path.Path;
  const projectRoot = Option.match(args.path, {
    onNone: () => executionDirectory.path,
    onSome: (value) => resolveExecutionPath(path, executionDirectory, value),
  });

  if (args.view === "git-index" && args.scope === "user") {
    return yield* makeAppError({
      code: "validation",
      detail:
        "--view git-index cannot be combined with --scope user because Git indexes are project-scoped",
    });
  }

  if (args.view === "git-index") {
    const snapshot = yield* materializeGitIndexWorkspace(projectRoot, {
      selectRepositoryRoot: Option.isNone(args.path),
    });
    const snapshotRoot = decodeAbsolutePathSync(snapshot.workspaceRoot);
    return yield* handleLint({
      pathArg: Option.some(snapshotRoot),
      scope: "project",
      strict: args.strict,
      details: args.details,
      displayWorkspaceRoot: snapshot.displayWorkspaceRoot,
      input: { view: "git-index", fingerprint: snapshot.fingerprint },
    }).pipe(withWorkspace({ scope: "project", projectRoot: snapshotRoot }));
  }

  return yield* handleLint({
    pathArg: args.scope === "project" ? Option.some(projectRoot) : args.path,
    scope: args.scope,
    strict: args.strict,
    details: args.details,
    input: { view: "workspace" },
  }).pipe(withWorkspace({ scope: args.scope, projectRoot }));
});

export const lintCommand = Command.make(
  "lint",
  lintConfig,
  ({ path, scope, strict, details, view }) =>
    runLintCommand({ path, scope, strict, details, view }).pipe(withRuntime("lint")),
).pipe(
  withArgvTracking(lintConfig),
  Command.withDescription("Check workspace configuration"),
  Command.withExamples([
    { command: "axm lint", description: "Lint the current project workspace" },
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
      command: "axm lint --view git-index",
      description: "Lint the complete workspace represented by the Git index",
    },
    {
      command: "axm lint --json",
      description: "Emit findings as a structured JSON document",
    },
  ]),
);
