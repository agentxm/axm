import { Argument, Command, Flag } from "effect/unstable/cli";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { previewFlag, yesFlag } from "@agentxm/client-core/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import {
  previewOrApplyPlan,
  type JobStepArtifact,
  type JobStepResult,
  type Plan,
  type PlannedJobStep,
} from "@agentxm/client-core/unstable/plan";
import { RuleManager } from "@agentxm/client-core/unstable/rules";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import { scopeFlag } from "../../cli-flags.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { emitAppliedPlanOutcome } from "../shared/applied-plan-output.js";
import { makePublicPositionalPlanExecution } from "../shared/confirmation-recovery.js";
import { emitNoOpOutcome } from "../shared/no-op-output.js";
import {
  activeInstructionsConfig,
  instructionReconciliationReadiness,
  observeInstructions,
  reconcileInstructionTransition,
} from "../instruction-reconciliation.js";

export const handleDisableRule = Effect.fn("DisableRule.handle")(function* (args: {
  readonly name: string;
  readonly yes: boolean;
  readonly preview: boolean;
}) {
  const ws = yield* WorkspaceMutations;
  const ruleManager = yield* RuleManager;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const scope = ws.scope;
  const configured = yield* ws.getConfiguredRuleEntries();
  const entry = configured[args.name];
  if (entry === undefined) {
    yield* emitNoOpOutcome("rules.disable", {
      planName: "Disable rules",
      message: `rule "${args.name}" is not configured`,
    });
    return;
  }
  if (!entry.enabled) {
    yield* emitNoOpOutcome("rules.disable", {
      planName: "Disable rules",
      message: `rule "${args.name}" is already disabled`,
    });
    return;
  }

  const instructionsConfig = yield* activeInstructionsConfig(ws);
  const readiness = Option.isSome(instructionsConfig)
    ? yield* instructionReconciliationReadiness({
        ws,
        snapshot: yield* observeInstructions({ ws, config: instructionsConfig.value }),
      })
    : Option.none();
  const disableTransition = Effect.gen(function* () {
    yield* ws.updateRuleEntry(args.name, (current) => ({
      ...current,
      enabled: false,
    }));
    yield* ruleManager.materializeDeactivate({
      target: { type: "rule", name: args.name },
    });
    return {
      result: "success",
      message: `Disabled ${args.name}`,
      artifact: {
        path: ".axm/settings.json",
        scope,
        change: "updated",
      } satisfies JobStepArtifact,
    } satisfies JobStepResult;
  });
  const activationStep: PlannedJobStep = Option.match(readiness, {
    onSome: (error) => ({
      label: args.name,
      readiness: "error",
      errorMessage: error.detail,
    }),
    onNone: () => ({
      readiness: "ready",
      label: args.name,
      run: ruleManager.runTransaction({
        transition: Option.isSome(instructionsConfig)
          ? reconcileInstructionTransition({
              ws,
              config: instructionsConfig.value,
              transition: disableTransition,
            }).pipe(
              Effect.provideService(FileSystem.FileSystem, fs),
              Effect.provideService(Path.Path, path),
            )
          : disableTransition,
        validate: () => Effect.void,
      }),
    }),
  });
  const plan: Plan = {
    _tag: "Plan",
    name: "Disable rules",
    description: Option.some(`Disable rule ${args.name}`),
    jobs: [
      {
        concurrency: 1,
        steps: [activationStep],
      },
    ],
  };
  const execution = yield* makePublicPositionalPlanExecution(
    args,
    ["rules", "disable"],
    [args.name],
  );
  const resolution = yield* previewOrApplyPlan(plan, { execution, displayApplied: false });
  yield* emitAppliedPlanOutcome({
    command: "rules.disable",
    headline: `Disabled rule ${args.name}`,
    resolution,
    suggestions: [
      { description: "Inspect installed rules", cmd: "axm rules list" },
      { description: "Undo", cmd: `axm rules enable ${args.name}` },
    ],
  });
});

const disableConfig = {
  name: Argument.string("name").pipe(Argument.withDescription("Name of the rule")),
  scope: scopeFlag.pipe(
    Flag.withDescription("Disable in project (default) or user-level configuration"),
  ),
  yes: yesFlag.pipe(Flag.withDescription("Disable without confirmation")),
  preview: previewFlag.pipe(Flag.withDescription("Show what would change without disabling")),
} as const;

export const disableCommand = Command.make(
  "disable",
  disableConfig,
  ({ name, scope, yes, preview }) =>
    handleDisableRule({ name, yes, preview }).pipe(
      withWorkspace(scope),
      withRuntime("rules disable"),
    ),
).pipe(
  withArgvTracking(disableConfig),
  Command.withDescription("Disable a rule without uninstalling it"),
  Command.withExamples([
    {
      command: "axm rules disable commit-style",
      description: "Disable a configured rule",
    },
  ]),
);
