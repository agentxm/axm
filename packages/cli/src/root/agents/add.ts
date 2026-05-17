import { Argument, Command, Flag } from "effect/unstable/cli";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { detectAgents } from "@agentxm/client-core/unstable/agents";
import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import { forceFlag, previewFlag, yesFlag } from "@agentxm/client-core/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { CliRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import {
  type JobStepResult,
  type Plan,
  type PlannedJobStep,
} from "@agentxm/client-core/unstable/plan";
import {
  isMalformedWorkspaceLockfileRead,
  WorkspaceMutations,
  type WorkspaceMutationsService,
} from "@agentxm/client-core/unstable/workspace";
import { emitNoOpResult, emitPlanResolutionResult } from "../../json-output.js";
import { scopeFlag } from "../../cli-flags.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { previewOrApplyLocalPlan } from "../shared/local-plan.js";
import { collectMaterializeSteps } from "../sync/handler.js";
import { dedupe, validateAgentIds } from "./shared.js";

export interface AgentsAddArgs {
  readonly ids: ReadonlyArray<string>;
  readonly detected: boolean;
  readonly yes: boolean;
  readonly force: boolean;
  readonly preview: boolean;
}

const addAgentStep = (ws: WorkspaceMutationsService, agentId: string): PlannedJobStep => ({
  label: `Add ${agentId}`,
  readiness: "ready",
  run: ws.addConfiguredAgent(agentId).pipe(
    Effect.as({
      result: "success",
      message: `Configured ${agentId}`,
    } satisfies JobStepResult),
  ),
});

const makePlan = (agentIds: ReadonlyArray<string>, steps: ReadonlyArray<PlannedJobStep>): Plan => ({
  _tag: "Plan",
  name: "Add coding agents",
  description: Option.some(`Configure ${agentIds.join(", ")} and materialize installed extensions`),
  jobs: [{ concurrency: 1, steps }],
});

export const handleAgentsAdd = Effect.fn("Agents.add")(function* (args: AgentsAddArgs) {
  const renderer = yield* CliRenderer;
  const ws = yield* WorkspaceMutations;

  if (args.ids.length === 0 && !args.detected) {
    return yield* makeAppError({
      code: "usage",
      detail: "Provide one or more agent IDs, or pass --detected.",
      suggestions: [
        { description: "List supported IDs.", cmd: "axm agents list --available" },
        { description: "Configure detected agents.", cmd: "axm agents add --detected" },
      ],
    });
  }

  const requested = yield* validateAgentIds(args.ids);
  const configured = yield* ws.getConfiguredAgents();
  const configuredSet = new Set(configured);
  const detected = args.detected
    ? yield* detectAgents(ws.baseDir).pipe(Effect.map((agents) => agents.map((agent) => agent.id)))
    : [];
  const detectedConfigurable = yield* validateAgentIds(detected);
  const agentIds = dedupe([...requested, ...detectedConfigurable]).filter(
    (id) => !configuredSet.has(id),
  );

  if (agentIds.length === 0) {
    if (
      yield* emitNoOpResult("agents.add", {
        planName: "Add coding agents",
        planDescription: "Configure coding agents and materialize installed extensions",
        message: "All requested agents are already configured",
      })
    ) {
      return;
    }
    yield* renderer.success("All requested agents are already configured.");
    return;
  }

  const materialize = yield* collectMaterializeSteps().pipe(
    Effect.catchIf(isMalformedWorkspaceLockfileRead, (error) =>
      Effect.gen(function* () {
        yield* renderer.warn(
          `Skipping installed extension materialization: ${error.detail}. Run \`axm sync\` after fixing the workspace lockfile.`,
        );
        return {
          expectedSubagentNames: new Set<string>(),
          steps: [],
        };
      }),
    ),
  );
  const plan = makePlan(agentIds, [
    ...agentIds.map((agentId) => addAgentStep(ws, agentId)),
    ...materialize.steps,
  ]);

  const resolution = yield* previewOrApplyLocalPlan(plan, { preview: args.preview });
  yield* emitPlanResolutionResult("agents.add", resolution);
  yield* renderer.success("Done");
});

const addConfig = {
  ids: Argument.string("id").pipe(
    Argument.withDescription("Coding-agent ID(s) to configure, such as claude-code or cursor"),
    Argument.atLeast(0),
  ),
  scope: scopeFlag.pipe(
    Flag.withDescription("Add agents to project (default) or user-level configuration"),
  ),
  detected: Flag.boolean("detected").pipe(Flag.withDescription("Add detected agents")),
  yes: yesFlag.pipe(Flag.withDescription("Apply without confirmation")),
  force: forceFlag.pipe(Flag.withDescription("Apply even if the plan has unresolved warnings")),
  preview: previewFlag.pipe(Flag.withDescription("Show what would change without applying")),
} as const;

export const addCommand = Command.make(
  "add",
  addConfig,
  ({ ids, scope, detected, yes, force, preview }) =>
    handleAgentsAdd({ ids: [...ids], detected, yes, force, preview }).pipe(
      withWorkspace(scope),
      withRuntime("agents add"),
    ),
).pipe(
  withArgvTracking(addConfig),
  Command.withDescription("Configure coding-agent harnesses and materialize installed extensions"),
  Command.withExamples([
    { command: "axm agents add cursor", description: "Add Cursor to this workspace" },
    {
      command: "axm agents add cursor codex --preview",
      description: "Preview configuring multiple agents",
    },
    { command: "axm agents add --detected", description: "Configure all detected agents" },
  ]),
);
