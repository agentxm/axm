import { handleSetActivation } from "../../activation-handler.js";

export interface DisableSubagentHandlerArgs {
  readonly name: string;
  readonly preview: boolean;
}

export const handleDisableSubagent = (args: DisableSubagentHandlerArgs) =>
  handleSetActivation(
    { type: "subagent", name: args.name, enabled: false, preview: args.preview },
    {
      command: "subagents.disable",
      commandPath: ["subagents", "disable"],
      planName: "Disable subagent",
      suggestions: [
        { description: "Inspect installed subagents", cmd: "axm subagents list" },
        { description: "Undo", cmd: `axm subagents enable ${args.name}` },
      ],
    },
  );
