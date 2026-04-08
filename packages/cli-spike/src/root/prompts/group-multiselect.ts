import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Command, Flag } from "effect/unstable/cli";

import { CliPrompt } from "@axm.sh/core/unstable/cli-prompt";
import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";

import { withRuntime } from "../../runtime.js";

const permissionValues = [
  "file:read",
  "file:write",
  "file:execute",
  "net:http",
  "net:ssh",
] as const;

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
  value: Flag.choice("value", permissionValues).pipe(
    Flag.withDescription("Bypass the prompt with explicit selections"),
    Flag.atLeast(0),
  ),
  "selectable-groups": Flag.boolean("selectable-groups").pipe(
    Flag.withDescription("Allow selecting entire groups at once"),
  ),
  "group-spacing": Flag.integer("group-spacing").pipe(
    Flag.withDescription("Spacing between groups"),
    Flag.optional,
  ),
  required: Flag.boolean("required").pipe(Flag.withDescription("Require at least one selection")),
} as const;

const handleGroupMultiselect = (args: {
  readonly value: ReadonlyArray<(typeof permissionValues)[number]>;
  readonly selectableGroups: boolean;
  readonly groupSpacing: Option.Option<number>;
  readonly required: boolean;
}) =>
  Effect.gen(function* () {
    const prompt = yield* CliPrompt;
    const renderer = yield* CliRenderer;
    const choices =
      args.value.length > 0
        ? args.value
        : yield* prompt.groupMultiselect({
            message: "Select permissions:",
            options: { ...permissionOptions },
            ...(args.selectableGroups && { selectableGroups: true }),
            ...(Option.isSome(args.groupSpacing) && {
              groupSpacing: args.groupSpacing.value,
            }),
            ...(args.required && { required: true }),
          });

    yield* renderer.success(`Selected: ${choices.length === 0 ? "(none)" : choices.join(", ")}`);
  });

export const groupMultiselectCommand = Command.make(
  "group-multiselect",
  groupMultiselectConfig,
  ({ value, ["selectable-groups"]: selectableGroups, ["group-spacing"]: groupSpacing, required }) =>
    handleGroupMultiselect({ value, selectableGroups, groupSpacing, required }).pipe(
      withRuntime({ command: "prompts group-multiselect" }),
    ),
).pipe(
  withArgvTracking(groupMultiselectConfig),
  Command.withDescription("Demo group multiselect prompt"),
  Command.withExamples([
    {
      command: "axm-spike prompts group-multiselect",
      description: "Open the interactive grouped multiselect prompt",
    },
    {
      command: "axm-spike prompts group-multiselect --value file:read --value net:http",
      description: "Resolve the grouped prompt non-interactively",
    },
  ]),
);
