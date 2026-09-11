import { Argument } from "effect/unstable/cli";

import { ignoreReleaseAgeFlag } from "../../cli-flags/index.js";
import { handleSetActivation } from "../activation-handler.js";
import { mutationFlags, scopeConfig } from "./flags.js";

export const activationConfig = {
  name: Argument.string("name").pipe(Argument.withDescription("Configured knowledge bundle name")),
  ...scopeConfig,
  preview: mutationFlags.preview,
  ignoreReleaseAge: ignoreReleaseAgeFlag,
} as const;

export const setKnowledgeEnabled = (name: string, enabled: boolean, preview: boolean) =>
  handleSetActivation(
    { type: "knowledge", name, enabled, preview },
    {
      command: enabled ? "knowledge.enable" : "knowledge.disable",
      commandPath: ["knowledge", enabled ? "enable" : "disable"],
      planName: `${enabled ? "Enable" : "Disable"} knowledge bundle`,
      suggestions: [{ description: "Browse installed Knowledge", cmd: "axm knowledge list" }],
    },
  );
