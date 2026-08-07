import { Argument, Command, Flag } from "effect/unstable/cli";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { previewFlag, yesFlag } from "@agentxm/client-core/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { buildInstallOperation } from "@agentxm/client-core/unstable/extensions";
import {
  previewOrApplyPlan,
  type JobStepArtifact,
  type Plan,
  type PlannedJobStep,
} from "@agentxm/client-core/unstable/plan";
import { RuleManager } from "@agentxm/client-core/unstable/rules";
import { resolveConfiguredRule, WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import { scopeFlag } from "../../cli-flags.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { emitAppliedPlanOutcome } from "../shared/applied-plan-output.js";
import { emitNoOpOutcome } from "../shared/no-op-output.js";
import {
  activeInstructionsConfig,
  instructionReconciliationReadiness,
  reconcileInstructionTransition,
} from "./instruction-reconciliation.js";

export const handleEnableRule = Effect.fn("EnableRule.handle")(function* (args: {
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
    yield* emitNoOpOutcome("rules.enable", {
      planName: "Enable rules",
      message: `rule "${args.name}" is not configured`,
    });
    return;
  }
  if (entry.enabled) {
    yield* emitNoOpOutcome("rules.enable", {
      planName: "Enable rules",
      message: `rule "${args.name}" is already enabled`,
    });
    return;
  }

  const { ref, versionRange } = yield* resolveConfiguredRule(args.name, entry.source);
  const installStep = buildInstallOperation(ruleManager, {
    ref,
    versionRange,
    message: `Enabled ${args.name}`,
    buildArtifact: () =>
      Effect.succeed({
        path: ".axm/settings.json",
        scope,
        change: "updated",
      } satisfies JobStepArtifact),
  });
  const instructionsConfig = yield* activeInstructionsConfig(ws);
  const readiness = Option.isSome(instructionsConfig)
    ? yield* instructionReconciliationReadiness({ ws, config: instructionsConfig.value })
    : Option.none();
  const activationStep: PlannedJobStep =
    installStep.readiness === "error"
      ? installStep
      : Option.match(readiness, {
          onSome: (error) => ({
            label: installStep.label,
            readiness: "error",
            errorMessage: error.detail,
          }),
          onNone: () => {
            const transition = Option.isSome(instructionsConfig)
              ? reconcileInstructionTransition({
                  ws,
                  config: instructionsConfig.value,
                  transition: installStep.run,
                }).pipe(
                  Effect.provideService(FileSystem.FileSystem, fs),
                  Effect.provideService(Path.Path, path),
                )
              : installStep.run;
            const run = ruleManager.runTransaction({ transition, validate: () => Effect.void });
            return installStep.readiness === "warn"
              ? {
                  label: installStep.label,
                  readiness: "warn",
                  warnMessage: installStep.warnMessage,
                  run,
                }
              : {
                  label: installStep.label,
                  readiness: "ready",
                  run,
                };
          },
        });
  const plan: Plan = {
    _tag: "Plan",
    name: "Enable rules",
    description: Option.some(`Enable rule ${args.name}`),
    jobs: [
      {
        concurrency: 1,
        steps: [activationStep],
      },
    ],
  };
  const resolution = yield* previewOrApplyPlan(plan, {
    yes: args.yes,
    preview: args.preview,
    displayApplied: false,
  });
  yield* emitAppliedPlanOutcome({
    command: "rules.enable",
    headline: `Enabled rule ${args.name}`,
    resolution,
    suggestions: [
      { description: "Inspect installed rules", cmd: "axm rules list" },
      { description: "Undo", cmd: `axm rules disable ${args.name}` },
    ],
  });
});

const enableConfig = {
  name: Argument.string("name").pipe(Argument.withDescription("Name of the rule")),
  scope: scopeFlag.pipe(
    Flag.withDescription("Enable in project (default) or user-level configuration"),
  ),
  yes: yesFlag.pipe(Flag.withDescription("Enable without confirmation")),
  preview: previewFlag.pipe(Flag.withDescription("Show what would change without enabling")),
} as const;

export const enableCommand = Command.make("enable", enableConfig, ({ name, scope, yes, preview }) =>
  handleEnableRule({ name, yes, preview }).pipe(withWorkspace(scope), withRuntime("rules enable")),
).pipe(
  withArgvTracking(enableConfig),
  Command.withDescription("Enable a rule"),
  Command.withExamples([
    {
      command: "axm rules enable commit-style",
      description: "Enable a configured rule",
    },
  ]),
);
