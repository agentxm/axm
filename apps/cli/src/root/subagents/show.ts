import { withParameterDescription } from "../../cli-parameters.js";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Argument, Command, Flag } from "effect/cli";
import { AGENT_IDS } from "@agentxm/extension-model/unstable/agent-capabilities/identity";
import { RenderSubagent, SubagentRenderResultSchema } from "@agentxm/workspace-features/inspection";

import { processOutcome, withArgvTracking } from "../../cli-runtime/index.js";
import { makeAppError, ExitCode } from "../../app-error/index.js";
import { agentFlag } from "../../cli-flags/agent-flag.js";
import { scopeFlag } from "../../cli-flags/scope-flag.js";
import { inspectionFailureToAppError } from "../../feature-errors.js";
import { withLiveOperation } from "../../operation-lifecycle.js";
import { emitResult, headlineDoc, paragraphDoc, rawDoc } from "../../screen/index.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { extensionNotInstalledToAppError } from "../inspection-errors.js";
import { readOnlyCapabilities, withCommandCapabilities } from "../shared/command-capabilities.js";
import { handleExtensionShow } from "../shared/extension-show.js";

const config = {
  name: Argument.String("name").pipe(withParameterDescription("Name of the subagent to show")),
  scope: scopeFlag,
  agent: agentFlag.pipe(
    withParameterDescription(
      "Show only these agents' outcomes; unconfigured agents are reported as not configured",
    ),
  ),
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
    { command: "subagents.show", name: "Render subagent", mode: "query" },
    RenderSubagent.query(request).pipe(
      Effect.catchTag("ExtensionNotInstalled", (failure) =>
        Effect.fail(extensionNotInstalledToAppError(failure)),
      ),
      Effect.mapError(inspectionFailureToAppError),
    ),
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
    { ok: supported },
  );
  return processOutcome(supported ? ExitCode.Success : ExitCode.Issues);
});

export const showCommand = Command.make("show", config, ({ name, scope, render, agent }) =>
  Option.isSome(render) && agent.length > 0
    ? Effect.fail(
        makeAppError({ code: "usage", detail: "--agent and --render cannot be combined" }),
      ).pipe(withRuntime("subagents show"))
    : (Option.isSome(render)
        ? handleSubagentRender({ name, agentId: render.value })
        : handleExtensionShow({ type: "subagent", name, agents: agent })
      ).pipe(withWorkspace({ scope, allowUninitialized: true }), withRuntime("subagents show")),
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
