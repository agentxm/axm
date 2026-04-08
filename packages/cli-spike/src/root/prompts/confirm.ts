import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Command, Flag } from "effect/unstable/cli";

import { CliPrompt, fromFlagOrPrompt } from "@axm.sh/core/unstable/cli-prompt";
import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";

import { withRuntime } from "../../runtime.js";

const toBoolean = (value: "yes" | "no"): boolean => value === "yes";

const confirmConfig = {
  answer: Flag.choice("answer", ["yes", "no"] as const).pipe(
    Flag.withDescription("Bypass the prompt with an explicit answer"),
    Flag.optional,
  ),
  active: Flag.string("active").pipe(
    Flag.withDescription("Label for the active (true) option"),
    Flag.optional,
  ),
  inactive: Flag.string("inactive").pipe(
    Flag.withDescription("Label for the inactive (false) option"),
    Flag.optional,
  ),
  initial: Flag.choice("initial", ["yes", "no"] as const).pipe(
    Flag.withDescription("Initial value for the confirmation"),
    Flag.optional,
  ),
  vertical: Flag.boolean("vertical").pipe(Flag.withDescription("Display options vertically")),
} as const;

const handleConfirm = (args: {
  readonly answer: Option.Option<"yes" | "no">;
  readonly active: Option.Option<string>;
  readonly inactive: Option.Option<string>;
  readonly initial: Option.Option<"yes" | "no">;
  readonly vertical: boolean;
}) =>
  Effect.gen(function* () {
    const prompt = yield* CliPrompt;
    const renderer = yield* CliRenderer;
    const confirmed = yield* fromFlagOrPrompt(Option.map(args.answer, toBoolean), () =>
      prompt.confirm({
        message: "Do you want to continue?",
        ...(Option.isSome(args.active) && { active: args.active.value }),
        ...(Option.isSome(args.inactive) && { inactive: args.inactive.value }),
        ...(Option.isSome(args.initial) && { initialValue: toBoolean(args.initial.value) }),
        ...(args.vertical && { vertical: true }),
      }),
    );

    yield* renderer.success(`You chose: ${confirmed ? "Yes" : "No"}`);
  });

export const confirmCommand = Command.make(
  "confirm",
  confirmConfig,
  ({ answer, active, inactive, initial, vertical }) =>
    handleConfirm({ answer, active, inactive, initial, vertical }).pipe(
      withRuntime({ command: "prompts confirm" }),
    ),
).pipe(
  withArgvTracking(confirmConfig),
  Command.withDescription("Demo confirm prompt"),
  Command.withExamples([
    {
      command: "axm-spike prompts confirm",
      description: "Open the interactive confirm prompt",
    },
    {
      command: "axm-spike prompts confirm --answer yes",
      description: "Resolve the confirm prompt non-interactively",
    },
  ]),
);
