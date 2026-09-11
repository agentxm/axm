import { Argument, Command, Flag } from "effect/unstable/cli";

import { ignoreReleaseAgeFlag } from "../../cli-flags/index.js";
import { withArgvTracking } from "../../cli-runtime/index.js";
import { scopeFlag } from "../../cli-flags/scope-flag.js";
import { withReleaseAgePosture, withRuntime, withWorkspace } from "../../runtime.js";
import { handleSetActivation } from "../activation-handler.js";
import {
  previewCapabilityFlag,
  previewableCapabilities,
  withCommandCapabilities,
} from "../shared/command-capabilities.js";

interface PackActivationArgs {
  readonly name: string;
  readonly enabled: boolean;
  readonly preview: boolean;
}

export const handlePackActivation = (args: PackActivationArgs) =>
  handleSetActivation(
    { type: "pack", name: args.name, enabled: args.enabled, preview: args.preview },
    {
      command: args.enabled ? "packs.enable" : "packs.disable",
      commandPath: ["packs", args.enabled ? "enable" : "disable"],
      planName: args.enabled ? "Enable pack" : "Disable pack",
      suggestions: [
        { description: "Inspect installed packs", cmd: "axm packs list" },
        {
          description: "Undo",
          cmd: `axm packs ${args.enabled ? "disable" : "enable"} ${args.name}`,
        },
      ],
    },
  );

const activationConfig = {
  name: Argument.string("name").pipe(Argument.withDescription("Name of the pack")),
  scope: scopeFlag.pipe(Flag.withDescription("Use project (default) or user-level configuration")),
  preview: previewCapabilityFlag("Show what would change without applying"),
  ignoreReleaseAge: ignoreReleaseAgeFlag,
} as const;

const makeActivationCommand = (enabled: boolean) => {
  const verb = enabled ? "enable" : "disable";
  return Command.make(verb, activationConfig, ({ name, scope, preview, ignoreReleaseAge }) =>
    handlePackActivation({ name, enabled, preview }).pipe(
      withReleaseAgePosture(ignoreReleaseAge),
      withWorkspace(scope),
      withRuntime(`packs ${verb}`),
    ),
  ).pipe(
    withArgvTracking(activationConfig),
    withCommandCapabilities(previewableCapabilities("workspace")),
    Command.withDescription(
      `${enabled ? "Enable" : "Disable"} a pack without changing locked versions`,
    ),
    Command.withExamples([
      {
        command: `axm packs ${verb} frontend-tools --preview`,
        description: `Preview ${verb} effects and dependency provenance`,
      },
    ]),
  );
};

export const enableCommand = makeActivationCommand(true);
export const disableCommand = makeActivationCommand(false);
