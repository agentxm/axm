import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Command, Flag } from "effect/unstable/cli";

import { CliPrompt } from "@axm.sh/core/unstable/cli-prompt";
import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { withRuntime } from "../../runtime.js";

const permissionOptions = {
  Files: [
    { value: "file:read", label: "Read" },
    { value: "file:write", label: "Write" },
    { value: "file:execute", label: "Execute" },
  ],
  Network: [
    { value: "net:http", label: "HTTP" },
    { value: "net:ssh", label: "SSH" },
  ],
} as const;

const groupMultiselectConfig = {
  "selectable-groups": Flag.boolean("selectable-groups").pipe(
    Flag.withDescription("Allow selecting entire groups at once"),
  ),
  "group-spacing": Flag.integer("group-spacing").pipe(
    Flag.withDescription("Spacing between groups"),
    Flag.optional,
  ),
  required: Flag.boolean("required").pipe(
    Flag.withDescription("Require at least one selection"),
  ),
} as const;

export const groupMultiselectCommand = Command.make(
  "group-multiselect",
  groupMultiselectConfig,
  (config) =>
    withRuntime(
      Effect.gen(function* () {
        const prompt = yield* CliPrompt;
        const renderer = yield* CliRenderer;
        const choices = yield* prompt.groupMultiselect({
          message: "Select permissions:",
          options: { ...permissionOptions },
          ...(config["selectable-groups"] && { selectableGroups: true }),
          ...(Option.isSome(config["group-spacing"]) && {
            groupSpacing: config["group-spacing"].value,
          }),
          ...(config.required && { required: true }),
        });
        yield* renderer.success(`Selected: ${choices.join(", ")}`);
      }),
      { command: "prompts group-multiselect" },
    ),
).pipe(Command.withDescription("Demo group multiselect prompt"));
