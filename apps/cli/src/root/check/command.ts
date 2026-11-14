import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Command, Flag } from "effect/cli";
import {
  installableExtensionTypes,
  type InstallableExtensionType,
} from "@agentxm/extension-model/unstable/extensions/installable-types";
import {
  checkLocal,
  LocalCheckDocumentSchema,
  parseCheckSelection,
  type LocalCheckRequest,
} from "@agentxm/workspace-features/inspection";
import { resolveUserHome } from "@agentxm/workspace-kernel/workspace-state";
import { makeAppError } from "../../app-error/index.js";
import { withParameterDefault, withParameterDescription } from "../../cli-parameters.js";
import { processOutcome, withArgvTracking } from "../../cli-runtime/index.js";
import { inspectionFailureToAppError } from "../../feature-errors.js";
import { withLiveOperation } from "../../operation-lifecycle.js";
import { emitResult } from "../../screen/index.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { extensionTypePresentation } from "../extension-type-presentation.js";
import { readOnlyCapabilities, withCommandCapabilities } from "../shared/command-capabilities.js";
import { localShowConfig, selectLocalInspection } from "../show/command.js";
import { localCheckDoc } from "./view.js";
import { localCheckOwners } from "./owners.js";

export const handleLocalCheck = Effect.fn("Check.handle")(function* (request: LocalCheckRequest) {
  const userHome = yield* resolveUserHome();
  const result = yield* withLiveOperation(
    { name: "Assess local subjects", mode: "query" },
    checkLocal({ ...request, userHome }, localCheckOwners).pipe(
      Effect.catchTag("InvalidInspectionSelection", (failure) =>
        Effect.fail(makeAppError({ code: "usage", detail: failure.detail })),
      ),
      Effect.mapError(inspectionFailureToAppError),
    ),
    (document) => ({ mode: "query", outcome: "completed", exitCode: document.verdict.ok ? 0 : 1 }),
  );
  const exitCode = result.verdict.ok ? 0 : 1;
  yield* emitResult(result, LocalCheckDocumentSchema, () => localCheckDoc(result), {
    completion: { mode: "query", outcome: "completed", exitCode },
  });
  return processOutcome(exitCode);
});

export const makeLocalCheckCommand = (type?: InstallableExtensionType) => {
  const route = type === undefined ? [] : [extensionTypePresentation(type).route];
  const config = {
    ...localShowConfig,
    checks: Flag.String("checks").pipe(
      withParameterDescription(
        "Comma-separated assessments: compatibility,ownership,lint,convergence; default: all",
      ),
      Flag.optional,
    ),
    strict: Flag.Boolean("strict").pipe(
      withParameterDescription("Fail the assessment on applicable warnings"),
      withParameterDefault(false),
    ),
    ...(type === undefined
      ? {
          type: Flag.Literals("type", [...installableExtensionTypes]).pipe(
            withParameterDescription("Restrict local candidates to this extension type"),
            Flag.atLeast(0),
          ),
        }
      : {}),
  };
  return Command.make("check", config, (args) =>
    Effect.gen(function* () {
      const selection = yield* selectLocalInspection(args, route, "check");
      const checks = yield* parseCheckSelection(Option.getOrUndefined(args.checks)).pipe(
        Effect.mapError((failure) => makeAppError({ code: "usage", detail: failure.detail })),
      );
      return yield* handleLocalCheck({
        selection,
        checks,
        strict: args.strict,
        types: type === undefined ? (args.type ?? []) : [type],
        agents: args.agent,
      }).pipe(withWorkspace({ scope: args.scope, allowUninitialized: true }), withRuntime());
    }),
  ).pipe(
    withArgvTracking(config),
    withCommandCapabilities(readOnlyCapabilities()),
    Command.withDescription(
      "Assess selected local compatibility, ownership, lint, and convergence without repair or acquisition",
    ),
    Command.withExamples([
      {
        command: `axm ${[...route, "check", "review"].join(" ")} --json`,
        description: "Assess an exact local subject and required contributors",
      },
      {
        command: `axm ${[...route, "check"].join(" ")} --all --checks lint --strict`,
        description: "Assess local lint; warnings fail the verdict",
      },
      {
        command: `axm ${[...route, "check"].join(" ")} --path AGENTS.md --json`,
        description: "Assess known local owners of a path",
      },
    ]),
  );
};
export const checkCommand = makeLocalCheckCommand();
