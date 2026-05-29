import { Command } from "effect/unstable/cli";
import * as Effect from "effect/Effect";
import { CliRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { withRuntime, withWorkspace } from "../../runtime.js";
import {
  handleRulesDisable,
  handleRulesEnable,
  handleRulesStatus,
  rulesDisableConfig,
  rulesEnableConfig,
  rulesStatusConfig,
} from "../rules/command.js";

const warnDeprecatedInstructionsCommand = Effect.fn("Agents.instructions.deprecated")(function* () {
  const renderer = yield* CliRenderer;
  yield* renderer.warn("`axm agents instructions` is deprecated. Use `axm rules` instead.");
});

export const instructionsEnableCommand = Command.make(
  "enable",
  rulesEnableConfig,
  ({ scope, fileName, gitignore }) =>
    Effect.gen(function* () {
      yield* warnDeprecatedInstructionsCommand();
      yield* handleRulesEnable({ fileName, gitignore });
    }).pipe(withWorkspace(scope), withRuntime("agents instructions enable")),
).pipe(
  withArgvTracking(rulesEnableConfig),
  Command.withDescription("Deprecated alias for `axm rules enable`"),
  Command.withExamples([
    { command: "axm rules enable", description: "Enable instruction files" },
    {
      command: "axm rules enable --no-gitignore",
      description: "Enable without writing gitignore entries",
    },
  ]),
);

export const instructionsDisableCommand = Command.make("disable", rulesDisableConfig, ({ scope }) =>
  Effect.gen(function* () {
    yield* warnDeprecatedInstructionsCommand();
    yield* handleRulesDisable();
  }).pipe(withWorkspace(scope), withRuntime("agents instructions disable")),
).pipe(
  withArgvTracking(rulesDisableConfig),
  Command.withDescription("Deprecated alias for `axm rules disable`"),
  Command.withExamples([
    { command: "axm rules disable", description: "Disable instruction files" },
  ]),
);

export const instructionsCommand = Command.make("instructions", rulesStatusConfig, ({ scope }) =>
  Effect.gen(function* () {
    yield* warnDeprecatedInstructionsCommand();
    yield* handleRulesStatus();
  }).pipe(withWorkspace(scope), withRuntime("agents instructions")),
).pipe(
  withArgvTracking(rulesStatusConfig),
  Command.withDescription("Deprecated alias for `axm rules`"),
  Command.withExamples([
    { command: "axm rules", description: "Inspect instruction files" },
    {
      command: "axm lint --fix",
      description: "Repair instruction-file drift",
    },
  ]),
  Command.withSubcommands([instructionsEnableCommand, instructionsDisableCommand]),
);
