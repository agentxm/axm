import { registryFlag } from "../../cli-flags/index.js";
import { withParameterDescription } from "../../cli-parameters.js";
import { Argument, Command } from "effect/cli";

import { withArgvTracking } from "../../cli-runtime/index.js";
import { DEFAULT_WORKSPACE_SCOPE } from "@agentxm/extension-model/unstable/workspace-scope";

import { withRuntime, withWorkspace } from "../../runtime.js";
import {
  directWriteCapabilities,
  groupCapabilities,
  readOnlyCapabilities,
  withCommandCapabilities,
} from "../shared/command-capabilities.js";
import {
  handleVisibilityReconcile,
  handleVisibilitySet,
  handleVisibilityStatus,
} from "./handler.js";

const targetArgument = Argument.String("extension").pipe(
  withParameterDescription("Extension FQN in @owner/<plural-type>/<name> form"),
);

const statusConfig = { registry: registryFlag, fqn: targetArgument } as const;
const statusCommand = Command.make("status", statusConfig, ({ fqn, registry }) =>
  handleVisibilityStatus(fqn).pipe(
    withWorkspace(DEFAULT_WORKSPACE_SCOPE),
    withRuntime("visibility status", { registry }),
  ),
).pipe(
  withArgvTracking(statusConfig),
  withCommandCapabilities(readOnlyCapabilities()),
  Command.withDescription("Compare source intent with registry visibility"),
);
const statusCommandWithExamples = statusCommand.pipe(
  Command.withExamples([
    {
      description: "Compare source and registry visibility",
      command: "axm visibility status @acme/skills/review",
    },
  ]),
);

const setConfig = {
  registry: registryFlag,
  fqn: targetArgument,
  visibility: Argument.Literals("visibility", ["public", "private"] as const).pipe(
    withParameterDescription("Visibility to set"),
  ),
} as const;
const setCommand = Command.make("set", setConfig, ({ fqn, visibility, registry }) =>
  handleVisibilitySet(fqn, visibility).pipe(withRuntime("visibility set", { registry })),
).pipe(
  withArgvTracking(setConfig),
  withCommandCapabilities(directWriteCapabilities("registry")),
  Command.withDescription("Set established registry visibility"),
);
const setCommandWithExamples = setCommand.pipe(
  Command.withExamples([
    {
      description: "Make an extension private",
      command: "axm visibility set @acme/skills/review private",
    },
  ]),
);

const reconcileConfig = {
  registry: registryFlag,
  fqn: targetArgument,
} as const;
const reconcileCommand = Command.make("reconcile", reconcileConfig, ({ fqn, registry }) =>
  handleVisibilityReconcile(fqn).pipe(
    withWorkspace(DEFAULT_WORKSPACE_SCOPE),
    withRuntime("visibility reconcile", { registry }),
  ),
).pipe(
  withArgvTracking(reconcileConfig),
  withCommandCapabilities(directWriteCapabilities("registry")),
  Command.withDescription("Apply repository visibility intent to the registry"),
);
const reconcileCommandWithExamples = reconcileCommand.pipe(
  Command.withExamples([
    {
      description: "Apply declared visibility",
      command: "axm visibility reconcile @acme/skills/review",
    },
  ]),
);

export const visibilityCommand = Command.make("visibility").pipe(
  Command.withDescription("Inspect and manage whole-extension registry visibility"),
  Command.withShortDescription("Inspect or change registry visibility"),
  withCommandCapabilities(groupCapabilities),
  Command.withExamples([
    { description: "Inspect visibility", command: "axm visibility status @acme/skills/review" },
  ]),
  Command.withSubcommands([
    statusCommandWithExamples,
    setCommandWithExamples,
    reconcileCommandWithExamples,
  ]),
);
