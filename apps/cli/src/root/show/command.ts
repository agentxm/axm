import * as Effect from "effect/Effect";
import { Argument, CliError, Command, Flag } from "effect/cli";
import {
  installableExtensionTypes,
  type InstallableExtensionType,
} from "@agentxm/extension-model/unstable/extensions/installable-types";
import {
  LocalInspection,
  LocalInspectionDocumentSchema,
  inspectionSelectionIssue,
  type LocalInspectionDocument,
  type LocalInspectionRequest,
  type InspectionSelection,
} from "@agentxm/workspace-features/inspection";
import { makeAppError, type AppError } from "../../app-error/index.js";
import { agentFlag } from "../../cli-flags/agent-flag.js";
import { scopeFlag } from "../../cli-flags/scope-flag.js";
import { withParameterDefault, withParameterDescription } from "../../cli-parameters.js";
import { processOutcome, withArgvTracking } from "../../cli-runtime/index.js";
import { inspectionFailureToAppError } from "../../feature-errors.js";
import { withLiveOperation } from "../../operation-lifecycle.js";
import { emitResult } from "../../screen/index.js";
import { localInspectionDoc } from "./view.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { extensionTypePresentation } from "../extension-type-presentation.js";
import { readOnlyCapabilities, withCommandCapabilities } from "../shared/command-capabilities.js";

const inspectionExitCode = (document: LocalInspectionDocument): number => {
  const failures = document.requests.filter((request) => request.code !== 0);
  return failures.length === 0
    ? 0
    : document.requests.length === 1 && document.requests[0]?.kind !== "all"
      ? (failures[0]?.code ?? 1)
      : 1;
};
export const handleLocalInspection = Effect.fn("Show.handle")(function* (
  request: LocalInspectionRequest,
) {
  const result = yield* withLiveOperation(
    { name: "Inspect local subjects", mode: "query" },
    LocalInspection.query(request).pipe(
      Effect.catchTag("InvalidInspectionSelection", (failure) =>
        Effect.fail(makeAppError({ code: "usage", detail: failure.detail })),
      ),
      Effect.mapError(inspectionFailureToAppError),
    ),
    (document) => ({ mode: "query", outcome: "completed", exitCode: inspectionExitCode(document) }),
  );
  const exitCode = inspectionExitCode(result);
  yield* emitResult(result, LocalInspectionDocumentSchema, () => localInspectionDoc(result), {
    completion: { mode: "query", outcome: "completed", exitCode },
  });
  return processOutcome(exitCode);
});

export const localShowConfig = {
  name: Argument.String("name").pipe(
    withParameterDescription("Exact local name or identity; repeated operands retain their order"),
    Argument.atLeast(0),
  ),
  path: Flag.String("path").pipe(
    withParameterDescription("Inspect this exact local path; repeat to inspect several paths"),
    Flag.atLeast(0),
  ),
  all: Flag.Boolean("all").pipe(
    withParameterDescription("Inspect the complete local inventory"),
    withParameterDefault(false),
  ),
  scope: scopeFlag,
  agent: agentFlag.pipe(
    withParameterDescription(
      "Filter displayed agent outcomes while retaining ownership and retention facts",
    ),
  ),
};
export const selectLocalInspection = (
  args: {
    readonly name: ReadonlyArray<string>;
    readonly path: ReadonlyArray<string>;
    readonly all: boolean;
  },
  route: ReadonlyArray<string>,
  operation: "show" | "check" = "show",
): Effect.Effect<InspectionSelection, AppError | CliError.ShowHelp> => {
  const modes = Number(args.name.length > 0) + Number(args.path.length > 0) + Number(args.all);
  if (modes === 0)
    return Effect.fail(
      new CliError.ShowHelp({ commandPath: ["axm", ...route, operation], errors: [] }),
    );
  if (modes !== 1)
    return Effect.fail(
      makeAppError({
        code: "usage",
        detail: "Choose exactly one selection mode: identities, --path, or --all",
      }),
    );
  const selection: InspectionSelection = args.all
    ? { kind: "all" }
    : args.path.length > 0
      ? { kind: "paths", paths: args.path }
      : { kind: "identities", identities: args.name };
  const issue = inspectionSelectionIssue(selection);
  return issue === undefined
    ? Effect.succeed(selection)
    : Effect.fail(makeAppError({ code: "usage", detail: issue }));
};

export const makeLocalShowCommand = (type?: InstallableExtensionType) => {
  const route = type === undefined ? [] : [extensionTypePresentation(type).route];
  const config = {
    ...localShowConfig,
    ...(type === undefined
      ? {
          type: Flag.Literals("type", [...installableExtensionTypes]).pipe(
            withParameterDescription("Restrict local candidates to this extension type"),
            Flag.atLeast(0),
          ),
        }
      : {}),
  };
  return Command.make("show", config, (args) =>
    selectLocalInspection(args, route).pipe(
      Effect.flatMap((selection) =>
        handleLocalInspection({
          selection,
          types: type === undefined ? (args.type ?? []) : [type],
          agents: args.agent,
        }).pipe(withWorkspace({ scope: args.scope, allowUninitialized: true }), withRuntime()),
      ),
    ),
  ).pipe(
    withArgvTracking(config),
    withCommandCapabilities(readOnlyCapabilities()),
    Command.withDescription(
      "Inspect local identities, edit owners, native placement, and retention",
    ),
    Command.withExamples([
      {
        command: `axm ${[...route, "show", "review"].join(" ")} --json`,
        description: "Inspect an exact local subject",
      },
      {
        command: `axm ${[...route, "show"].join(" ")} --all --json`,
        description: "Inspect the complete local inventory",
      },
      {
        command: `axm ${[...route, "show"].join(" ")} --path AGENTS.md --json`,
        description: "Explain known ownership units at a local path",
      },
    ]),
  );
};
export const showCommand = makeLocalShowCommand();
