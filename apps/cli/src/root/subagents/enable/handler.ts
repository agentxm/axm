import { handleSetActivation } from "../../activation-handler.js";

export interface EnableSubagentHandlerArgs {
  readonly name: string;
  readonly preview: boolean;
}

export const handleEnableSubagent = (args: EnableSubagentHandlerArgs) =>
  handleSetActivation(
    { type: "subagent", name: args.name, enabled: true, preview: args.preview },
    {
      command: "subagents.enable",
      commandPath: ["subagents", "enable"],
      planName: "Enable subagent",
      suggestions: [
        { description: "Inspect installed subagents", cmd: "axm subagents list" },
        { description: "Undo", cmd: `axm subagents disable ${args.name}` },
      ],
    },
  );
