import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { Argument, Command, Flag } from "effect/unstable/cli";

import { withArgvTracking } from "../../cli-runtime/index.js";
import type { WorkspaceScope } from "@agentxm/extension-model/unstable/workspace-scope";
import { LintWorkspace, lintSelectionRoot, type LintView } from "@agentxm/workspace-lint";
import { resolveUserHome } from "@agentxm/workspace-state";

import { scopeFlag } from "../../cli-flags/scope-flag.js";
import {
  withCommandCapabilities,
  type CommandCapabilities,
} from "../shared/command-capabilities.js";
import { ExecutionDirectory, resolveExecutionPath } from "../../execution-directory.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { handleLint } from "./handler.js";
import { lintFailureToAppError } from "../../feature-errors.js";

const lintConfig = {
  path: Argument.String("path").pipe(
    Argument.withDescription(
      "Workspace directory to lint (defaults to the current working directory).",
    ),
    Argument.optional,
  ),
  scope: scopeFlag.pipe(
    Flag.withDescription(
      "Scope of the lint run: project (default) or user (lints the .axm/workspace workspace under the selected home).",
    ),
  ),
  strict: Flag.Boolean("strict").pipe(
    Flag.withDescription("Treat warnings as failing for exit code."),
    Flag.withDefault(false),
  ),
  details: Flag.Boolean("details").pipe(
    Flag.withDescription("Show the full human report instead of the grouped summary."),
    Flag.withDefault(false),
  ),
  fix: Flag.Boolean("fix").pipe(
    Flag.withDescription(
      "Apply repairs whose desired state is already determined, then report what remains.",
    ),
    Flag.withDefault(false),
  ),
  view: Flag.Literals("view", ["workspace", "git-index"] as const).pipe(
    Flag.withDescription("Filesystem view to lint: workspace (default) or the complete Git index."),
    Flag.withDefault("workspace"),
  ),
} as const;

export interface RunLintCommandArgs {
  readonly path: Option.Option<string>;
  readonly scope: WorkspaceScope;
  readonly strict: boolean;
  readonly details: boolean;
  readonly fix: boolean;
  readonly view: LintView;
}

export const runLintCommand = Effect.fn("Lint.command")(function* (args: RunLintCommandArgs) {
  const executionDirectory = yield* ExecutionDirectory;
  const path = yield* Path.Path;
  const userHome = yield* resolveUserHome();
  const requestedPath = Option.map(args.path, (value) =>
    resolveExecutionPath(path, executionDirectory, value),
  );

  const selection = yield* LintWorkspace.admit({
    ...(Option.isSome(requestedPath) ? { path: requestedPath.value } : {}),
    scope: args.scope,
    view: args.view,
    fix: args.fix,
    cwd: executionDirectory.path,
    userHome,
  }).pipe(Effect.mapError(lintFailureToAppError));

  return yield* handleLint({
    selection,
    strict: args.strict,
    details: args.details,
  }).pipe(
    // Lint reports a scope without settings as a finding rather than refusing to run.
    withWorkspace({
      scope: selection.scope,
      projectRoot: lintSelectionRoot(selection),
      allowUninitialized: true,
    }),
  );
});

/** Lint reports facts by default; `--fix` switches it into repairing determined workspace state. */
const lintCapabilities: CommandCapabilities = {
  preview: false,
  preapproval: null,
  trust: [],
  inputs: "explicit",
  effect: "none",
  modes: [{ flag: "--fix", effect: "workspace" }],
};

export const lintCommand = Command.make(
  "lint",
  lintConfig,
  ({ path, scope, strict, details, fix, view }) =>
    runLintCommand({ path, scope, strict, details, fix, view }).pipe(withRuntime("lint")),
).pipe(
  withArgvTracking(lintConfig),
  withCommandCapabilities(lintCapabilities),
  Command.withDescription("Check workspace configuration"),
  Command.withExamples([
    { command: "axm lint", description: "Lint the current project workspace" },
    {
      command: "axm lint --scope user",
      description: "Lint the user workspace under $HOME/.axm/workspace",
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
      command: "axm lint --fix",
      description: "Restore determined state, such as missing agent instruction files",
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
