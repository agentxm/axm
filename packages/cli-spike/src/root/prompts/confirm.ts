import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Command, Flag, Prompt } from "effect/unstable/cli";

import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";

import { fromFlagOrInteractivePrompt } from "./helpers.js";
import { withRuntime } from "../../runtime.js";

const toBoolean = (value: "yes" | "no"): boolean => value === "yes";

const confirmConfig = {
  answer: Flag.choice("answer", ["yes", "no"] as const).pipe(
    Flag.withDescription("Bypass the prompt with an explicit answer"),
    Flag.optional,
  ),
  active: Flag.string("active").pipe(
    Flag.withDescription("Label for the confirm option"),
    Flag.optional,
  ),
  inactive: Flag.string("inactive").pipe(
    Flag.withDescription("Label for the deny option"),
    Flag.optional,
  ),
  initial: Flag.choice("initial", ["yes", "no"] as const).pipe(
    Flag.withDescription("Initial value for the confirmation"),
    Flag.optional,
  ),
} as const;

const handleConfirm = (args: {
  readonly answer: Option.Option<"yes" | "no">;
  readonly active: Option.Option<string>;
  readonly inactive: Option.Option<string>;
  readonly initial: Option.Option<"yes" | "no">;
}) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    const message = "Confirm pet intake?";
    const confirmed = yield* fromFlagOrInteractivePrompt(
      Option.map(args.answer, toBoolean),
      Prompt.confirm({
        message,
        ...(Option.isSome(args.active) &&
          Option.isSome(args.inactive) && {
            label: { confirm: args.active.value, deny: args.inactive.value },
          }),
        ...(Option.isSome(args.active) &&
          Option.isNone(args.inactive) && {
            label: { confirm: args.active.value, deny: "No" },
          }),
        ...(Option.isNone(args.active) &&
          Option.isSome(args.inactive) && {
            label: { confirm: "Yes", deny: args.inactive.value },
          }),
        ...(Option.isSome(args.initial) && { initial: toBoolean(args.initial.value) }),
      }),
      { message },
    );

    yield* renderer.success(`You chose: ${confirmed ? "Yes" : "No"}`);
  });

export const confirmCommand = Command.make(
  "confirm",
  confirmConfig,
  ({ answer, active, inactive, initial }) =>
    handleConfirm({ answer, active, inactive, initial }).pipe(
      withRuntime({ command: "prompts confirm" }),
    ),
).pipe(
  withArgvTracking(confirmConfig),
  Command.withDescription("Demo confirm prompt"),
  Command.withExamples([
    {
      command: "axm-spike prompts confirm",
      description: "Open the interactive pet intake confirmation prompt",
    },
    {
      command: "axm-spike prompts confirm --answer yes",
      description: "Confirm pet intake non-interactively",
    },
  ]),
);
