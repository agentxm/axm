import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Command, Flag } from "effect/unstable/cli";
import { HandoffSkills, type HandoffRequest } from "@agentxm/workspace-features/lifecycle";
import { SettingsReader } from "@agentxm/workspace-kernel/workspace-state";
import {
  protectedRecoveryValue,
  publicRecoveryValue,
  recoveryOption,
  recoverySwitch,
} from "@agentxm/workspace-kernel/operations";
import { agentFlag } from "../../cli-flags/index.js";
import { scopeFlag } from "../../cli-flags/scope-flag.js";
import { withArgvTracking } from "../../cli-runtime/index.js";
import { failureToAppError } from "../../app-error/conversions.js";
import { makeAppError } from "../../app-error/index.js";
import { emitOperationResolution } from "../../operation-output.js";
import { withOperationLifecycle } from "../../operation-lifecycle.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import {
  previewCapabilityFlag,
  previewableCapabilities,
  withCommandCapabilities,
} from "../shared/command-capabilities.js";
import { makeConfirmationRecovery, makePlanInvocation } from "../shared/confirmation-recovery.js";

export const handleHandoff = (
  args: HandoffRequest & {
    readonly preview: boolean;
    readonly agents: ReadonlyArray<string>;
  },
) =>
  withOperationLifecycle(
    {
      command: "skills handoff",
      mode: args.preview ? "preview" : "apply",
      planName: "Transfer skill management",
    },
    Effect.gen(function* () {
      const configured = yield* (yield* SettingsReader).configuredAgents;
      if (
        args.agents.length > 0 &&
        (args.agents.some((agent) => !configured.includes(agent)) ||
          configured.some((agent) => !args.agents.includes(agent)))
      )
        return yield* makeAppError({
          code: "usage",
          detail:
            "--agent initializes workspace destinations; the existing workspace has a different configured agent set",
        });
      const candidate = yield* HandoffSkills.prepare(args).pipe(Effect.mapError(failureToAppError));
      const { execution, recovery } = yield* makePlanInvocation(
        { preview: args.preview },
        makeConfirmationRecovery(
          ["skills", "handoff"],
          [
            ...args.skills.map((name) => recoveryOption("--skill", publicRecoveryValue(name))),
            ...(args.all ? [recoverySwitch("--all", true)] : []),
            ...(args.lockPath === undefined
              ? []
              : [recoveryOption("--lock", protectedRecoveryValue())]),
          ],
        ),
      );
      const result = yield* HandoffSkills.previewOrApply(candidate, execution).pipe(
        Effect.mapError(failureToAppError),
      );
      yield* emitOperationResolution(result, { recovery });
    }),
  );

const config = {
  skill: Flag.String("skill").pipe(
    Flag.withDescription("Transfer this installed Skills-manager entry; repeatable"),
    Flag.atLeast(0),
  ),
  all: Flag.Boolean("all").pipe(
    Flag.withDescription("Transfer every verified entry in the selected manager lock"),
    Flag.withDefault(false),
  ),
  lock: Flag.String("lock").pipe(
    Flag.withDescription("Skills manager lock path; defaults to the selected scope's lock"),
    Flag.optional,
  ),
  scope: scopeFlag,
  agent: agentFlag.pipe(Flag.withDescription("Configure an agent on first handoff; repeatable")),
  preview: previewCapabilityFlag(),
} as const;

export const handoffCommand = Command.make("handoff", config, (args) =>
  handleHandoff({
    skills: args.skill,
    all: args.all,
    agents: args.agent,
    preview: args.preview,
    ...(Option.isSome(args.lock) ? { lockPath: args.lock.value } : {}),
  }).pipe(
    withWorkspace({
      scope: args.scope,
      initialSettings: { agents: [...args.agent], instructionFiles: false },
    }),
    withRuntime("skills handoff"),
  ),
).pipe(
  withArgvTracking(config),
  withCommandCapabilities(previewableCapabilities("workspace")),
  Command.withDescription(
    "Transfer verified Skills-manager installations into AXM without claiming authorship",
  ),
  Command.withExamples([
    {
      command: "axm skills handoff --skill review --agent claude-code --preview",
      description: "Preview management transfer of an existing installation",
    },
  ]),
);
