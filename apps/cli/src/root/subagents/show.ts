import { withParameterDescription } from "../../cli-parameters.js";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Command, Flag } from "effect/cli";
import { AGENT_IDS } from "@agentxm/extension-model/unstable/agent-capabilities/identity";
import { RenderSubagent, SubagentRenderResultSchema } from "@agentxm/workspace-features/inspection";

import { processOutcome, withArgvTracking } from "../../cli-runtime/index.js";
import { makeAppError, ExitCode } from "../../app-error/index.js";
import { inspectionFailureToAppError } from "../../feature-errors.js";
import { withLiveOperation } from "../../operation-lifecycle.js";
import { emitResult, headlineDoc, paragraphDoc, rawDoc } from "../../screen/index.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { extensionNotInstalledToAppError } from "../inspection-errors.js";
import { readOnlyCapabilities, withCommandCapabilities } from "../shared/command-capabilities.js";
import { handleLocalInspection, localShowConfig, selectLocalInspection } from "../show/command.js";

const config = {
  ...localShowConfig,
  render: Flag.Literals("render", AGENT_IDS).pipe(
    Flag.optional,
    withParameterDescription(
      "Render for one catalog agent, including hosted ones, without writing files",
    ),
  ),
};

export const handleSubagentRender = Effect.fn("Subagents.render")(function* (
  request: Parameters<typeof RenderSubagent.query>[0],
) {
  const result = yield* withLiveOperation(
    { name: "Render subagent", mode: "query" },
    RenderSubagent.query(request).pipe(
      Effect.catchTag("ExtensionNotInstalled", (failure) =>
        Effect.fail(extensionNotInstalledToAppError(failure)),
      ),
      Effect.mapError(inspectionFailureToAppError),
    ),
    (result) => ({
      mode: "query",
      outcome: "completed",
      exitCode: result.status === "rendered" ? ExitCode.Success : ExitCode.Issues,
    }),
  );
  const supported = result.status === "rendered";
  yield* emitResult(
    result,
    SubagentRenderResultSchema,
    () => [
      ...headlineDoc(
        supported ? "neutral" : "warn",
        `${result.fqn} for ${result.agentId}: ${result.status}`,
      ),
      ...paragraphDoc(
        result.status === "unsupported"
          ? result.reason
          : `Implementation: ${result.mode}; native name: ${result.nativeName}`,
      ),
      ...result.artifacts.flatMap((artifact) => [
        ...paragraphDoc(artifact.path),
        ...rawDoc(artifact.content),
      ]),
      ...result.qualifications.flatMap((qualification) => paragraphDoc(qualification)),
    ],
    {
      completion: {
        mode: "query",
        outcome: "completed",
        exitCode: supported ? ExitCode.Success : ExitCode.Issues,
      },
    },
  );
  return processOutcome(supported ? ExitCode.Success : ExitCode.Issues);
});

export const showCommand = Command.make("show", config, (args) =>
  Effect.gen(function* () {
    if (Option.isSome(args.render)) {
      const name = args.name[0];
      if (
        args.name.length !== 1 ||
        name === undefined ||
        args.path.length > 0 ||
        args.all ||
        args.agent.length > 0
      )
        return yield* makeAppError({
          code: "usage",
          detail:
            "--render requires exactly one subagent name and cannot combine with --path, --all, or --agent",
        });
      yield* selectLocalInspection(args, ["subagents"]);
      return yield* handleSubagentRender({ name, agentId: args.render.value }).pipe(
        withWorkspace({ scope: args.scope, allowUninitialized: true }),
        withRuntime(),
      );
    }
    const selection = yield* selectLocalInspection(args, ["subagents"]);
    return yield* handleLocalInspection({
      selection,
      types: ["subagent"],
      agents: args.agent,
    }).pipe(withWorkspace({ scope: args.scope, allowUninitialized: true }), withRuntime());
  }),
).pipe(
  withArgvTracking(config),
  withCommandCapabilities(readOnlyCapabilities()),
  Command.withDescription("Inspect a subagent or render one target implementation"),
  Command.withExamples([
    { command: "axm subagents show reviewer", description: "Inspect one installed subagent" },
    {
      command: "axm subagents show reviewer --render codex",
      description: "Preview the effective Codex implementation without writing files",
    },
  ]),
);
