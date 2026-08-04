import { Argument, Command, Flag } from "effect/unstable/cli";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { forceFlag, previewFlag, yesFlag } from "@agentxm/client-core/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import {
  previewOrApplyPlan,
  type JobStepArtifact,
  type JobStepResult,
  type Plan,
} from "@agentxm/client-core/unstable/plan";
import { RuleManager } from "@agentxm/client-core/unstable/rules";
import { isWorkspaceSourceLocator } from "@agentxm/client-core/unstable/sources";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import { scopeFlag } from "../../cli-flags.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { emitAppliedPlanOutcome } from "../shared/applied-plan-output.js";
import { emitNoOpOutcome } from "../shared/no-op-output.js";
import { requireRuleName } from "./activation-argument.js";

export const handleDisableRule = Effect.fn("DisableRule.handle")(function* (args: {
  readonly name: string;
  readonly yes: boolean;
  readonly force: boolean;
  readonly preview: boolean;
}) {
  const ws = yield* WorkspaceMutations;
  const ruleManager = yield* RuleManager;
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

  const plan: Plan = {
    _tag: "Plan",
    name: "Disable rules",
    description: Option.some(`Disable rule ${args.name}`),
    jobs: [
      {
        concurrency: 1,
        steps: [
          {
            readiness: "ready",
            label: args.name,
            run: Effect.gen(function* () {
              yield* ws.updateRuleEntry(args.name, (current) => ({
                ...current,
                enabled: false,
              }));
              yield* ruleManager.materializeUninstall({
                target: { type: "rule", name: args.name },
                preserveSource: isWorkspaceSourceLocator(entry.source),
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
            }),
          },
        ],
      },
    ],
  };
  const resolution = yield* previewOrApplyPlan(plan, { ...args, displayApplied: false });
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
  name: Argument.string("name").pipe(
    Argument.withDescription("Name of the rule"),
    Argument.optional,
  ),
  scope: scopeFlag.pipe(
    Flag.withDescription("Disable in project (default) or user-level configuration"),
  ),
  yes: yesFlag.pipe(Flag.withDescription("Disable without confirmation")),
  force: forceFlag.pipe(Flag.withDescription("Disable even if retained dependencies exist")),
  preview: previewFlag.pipe(Flag.withDescription("Show what would change without disabling")),
} as const;

export const disableCommand = Command.make(
  "disable",
  disableConfig,
  ({ name, scope, yes, force, preview }) =>
    Effect.gen(function* () {
      const ruleName = yield* requireRuleName(name, "disable");
      yield* handleDisableRule({ name: ruleName, yes, force, preview });
    }).pipe(withWorkspace(scope), withRuntime("rules disable")),
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
