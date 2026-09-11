import { Argument, Command, Flag } from "effect/unstable/cli";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { ConfigureAgents } from "@agentxm/workspace-configuration";
import { acceptWarningsFlag, ignoreReleaseAgeFlag } from "../../cli-flags/index.js";
import { withArgvTracking } from "../../cli-runtime/index.js";
import { Screen, headlineDoc } from "../../screen/index.js";
import { deriveOperationOutcome, observeUnit } from "@agentxm/workspace-operations";
import { scopeFlag } from "../../cli-flags/scope-flag.js";
import { withReleaseAgePosture, withRuntime, withWorkspace } from "../../runtime.js";
import { emitOperationResolution } from "../../operation-output.js";
import { withOperationLifecycle } from "../shared/operation-lifecycle.js";
import { makePublicPositionalPlanExecution } from "../shared/confirmation-recovery.js";
import {
  previewCapabilityFlag,
  previewableCapabilities,
  withCommandCapabilities,
} from "../shared/command-capabilities.js";
import { emitNoOpOutcome } from "../shared/no-op-output.js";
import { SyncWorkspace } from "@agentxm/workspace-sync";
import { buildPermissionSuggestions } from "./permission-suggestions.js";
import { configurationFailureToAppError, syncFailureToAppError } from "../../feature-errors.js";

export interface AgentsAddArgs {
  readonly ids: ReadonlyArray<string>;
  readonly detected: boolean;
  readonly force: boolean;
  readonly preview: boolean;
}

const PLAN_NAME = "Add coding agents";

export const handleAgentsAdd = (args: AgentsAddArgs) =>
  withOperationLifecycle(
    { command: "agents.add", mode: args.preview ? "preview" : "apply", planName: PLAN_NAME },
    handleAgentsAddBody(args),
  );

const handleAgentsAddBody = Effect.fn("Agents.add")(function* (args: AgentsAddArgs) {
  const screen = yield* Screen;
  const candidate = yield* ConfigureAgents.add
    .prepare({ ids: args.ids, detected: args.detected, acceptWarnings: args.force })
    .pipe(Effect.mapError(configurationFailureToAppError));

  for (const notice of candidate.retiredDetected) {
    yield* screen.note(headlineDoc("warn", notice.detail));
  }

  if (candidate._tag === "Unchanged") {
    yield* emitNoOpOutcome("agents.add", {
      planName: PLAN_NAME,
      planDescription: "Configure coding agents and materialize installed extensions",
      message: candidate.message,
      ...(candidate.retiredDetected.length === 0
        ? {}
        : {
            suggestions: candidate.retiredDetected.map(({ agentId }) => ({
              description: `Explicitly configure retired agent ${agentId}.`,
              cmd: `axm agents add ${agentId}`,
            })),
          }),
    });
    return;
  }

  for (const warning of candidate.lifecycleWarnings) {
    yield* screen.note(headlineDoc("warn", warning));
  }

  // The reconciliation feature plans the steps that realize installed
  // extensions for the resulting membership; the configuration feature
  // applies them inside the membership closure.
  const materialize = yield* observeUnit(
    { id: "materialization", label: "installed extension materialization" },
    SyncWorkspace.planMaterialization({
      selection: { target: Option.none(), type: Option.none() },
      configuredAgents: candidate.configuredAgents,
    }).pipe(Effect.mapError(syncFailureToAppError)),
  );

  // Goes through the reconciling resolver rather than the local one: adding an
  // agent materializes installed extensions, which needs a readable lockfile.
  const execution = yield* makePublicPositionalPlanExecution(
    args,
    ["agents", "add"],
    candidate.agentIds,
    args.force ? ["accept-warnings"] : [],
  );
  const resolution = yield* ConfigureAgents.add
    .previewOrApply(candidate, execution, { steps: materialize.steps })
    .pipe(Effect.mapError(configurationFailureToAppError));
  const outcome = deriveOperationOutcome(resolution);
  const suggestions =
    outcome === "applied" || outcome === "partial"
      ? buildPermissionSuggestions(candidate.agentIds, candidate.scope)
      : [];
  yield* emitOperationResolution("agents.add", resolution, { suggestions });
});

const addConfig = {
  ids: Argument.string("id").pipe(
    Argument.withDescription("Coding-agent IDs to configure, such as claude-code or cursor"),
    Argument.atLeast(0),
  ),
  scope: scopeFlag.pipe(
    Flag.withDescription("Add agents to project (default) or user-level configuration"),
  ),
  detected: Flag.boolean("detected").pipe(
    Flag.withDescription("Add detected agents"),
    Flag.withDefault(false),
  ),
  force: acceptWarningsFlag,
  preview: previewCapabilityFlag("Show what would change without applying"),
  ignoreReleaseAge: ignoreReleaseAgeFlag,
} as const;

export const addCommand = Command.make(
  "add",
  addConfig,
  ({ ids, scope, detected, force, preview, ignoreReleaseAge }) =>
    handleAgentsAdd({ ids: [...ids], detected, force, preview }).pipe(
      withReleaseAgePosture(ignoreReleaseAge),
      withWorkspace(scope),
      withRuntime("agents add"),
    ),
).pipe(
  withArgvTracking(addConfig),
  withCommandCapabilities(previewableCapabilities("workspace")),
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
