import { withParameterDefault, withParameterDescription } from "../../cli-parameters.js";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { Argument, Command, Flag } from "effect/cli";

import { withArgvTracking } from "../../cli-runtime/index.js";
import type { WorkspaceScope } from "@agentxm/extension-model/unstable/workspace-scope";
import {
  LintWorkspace,
  lintSelectionRoot,
  lintSelectionLayer,
  type LintView,
} from "@agentxm/workspace-features/linting";
import { resolveUserHome } from "@agentxm/workspace-kernel/workspace-state";

import { scopeFlag } from "../../cli-flags/scope-flag.js";
import { previewFlag } from "../../cli-flags/index.js";
import { makeAppError } from "../../app-error/index.js";
import {
  withCommandCapabilities,
  type CommandCapabilities,
} from "../shared/command-capabilities.js";
import { ExecutionDirectory, resolveExecutionPath } from "../../execution-directory.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { handleLint } from "./handler.js";
import { lintFailureToAppError } from "../../feature-errors.js";

const lintConfig = {
  path: Argument.String("workspace").pipe(
    withParameterDescription(
      "Exact workspace root to lint; omit to select from the working directory",
    ),
    Argument.optional,
  ),
  scope: scopeFlag,
  strict: Flag.Boolean("strict").pipe(
    withParameterDescription("Treat warnings as failing for exit code."),
    withParameterDefault(false),
  ),
  fix: Flag.Boolean("fix").pipe(
    withParameterDescription("Normalize local instruction aliases, then report remaining findings"),
    withParameterDefault(false),
  ),
  preview: previewFlag,
  staged: Flag.Boolean("staged").pipe(
    withParameterDescription(
      "Check the complete workspace from the Git index, including unchanged files",
    ),
    withParameterDefault(false),
  ),
} as const;

export interface RunLintCommandArgs {
  readonly path: Option.Option<string>;
  readonly scope: WorkspaceScope;
  readonly strict: boolean;
  readonly fix: boolean;
  readonly view: LintView;
  readonly preview: boolean;
}

export const runLintCommand = Effect.fn("Lint.command")(function* (args: RunLintCommandArgs) {
  if (args.preview && !args.fix) {
    return yield* makeAppError({ code: "usage", detail: "--preview requires --fix" });
  }
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
    preview: args.preview,
  }).pipe(
    // Lint reports a scope without settings as a finding rather than refusing to run.
    withWorkspace({
      observationView: selection.nativeView,
      scope: selection.scope,
      projectRoot: lintSelectionRoot(selection),
      allowUninitialized: true,
    }),
    Effect.provide(lintSelectionLayer(selection)),
  );
});

/** Lint reports facts by default; `--fix` switches it into repairing determined workspace state. */
const lintCapabilities: CommandCapabilities = {
  preview: true,
  preapproval: null,
  trust: [],
  inputs: "explicit",
  effect: "none",
  modes: [{ flag: "--fix", effect: "workspace" }],
};

export const lintCommand = Command.make(
  "lint",
  lintConfig,
  ({ path, scope, strict, fix, staged, preview }) =>
    runLintCommand({
      path,
      scope,
      strict,
      fix,
      preview,
      view: staged ? "git-index" : "filesystem",
    }).pipe(withRuntime("lint")),
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
      command: "axm lint --verbose",
      description: "List every finding with its full detail",
    },
    {
      command: "axm lint --fix",
      description: "Normalize managed instruction aliases",
    },
    {
      command: "axm lint --fix --preview",
      description: "Preview instruction-alias normalization without applying it",
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
