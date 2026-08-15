import { Argument, Command } from "effect/unstable/cli";

import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { DEFAULT_WORKSPACE_SCOPE } from "@agentxm/client-core/unstable/workspace";

import { withRuntime, withWorkspace } from "../../runtime.js";
import {
  handleVisibilityReconcile,
  handleVisibilitySet,
  handleVisibilityStatus,
} from "./handler.js";

const targetArgument = Argument.string("fqn").pipe(
  Argument.withDescription("Exact extension FQN (@owner/<plural-type>/name)"),
);

const statusConfig = { fqn: targetArgument } as const;
const statusCommand = Command.make("status", statusConfig, ({ fqn }) =>
  handleVisibilityStatus(fqn).pipe(
    withWorkspace(DEFAULT_WORKSPACE_SCOPE),
    withRuntime("visibility status"),
  ),
).pipe(
  withArgvTracking(statusConfig),
  Command.withDescription("Compare source intent with Registry visibility"),
);
const statusCommandWithExamples = statusCommand.pipe(
  Command.withExamples([
    {
      description: "Compare source and Registry visibility",
      command: "axm visibility status @acme/skills/review",
    },
  ]),
);

const setConfig = {
  fqn: targetArgument,
  visibility: Argument.choice("visibility", ["public", "private"] as const),
} as const;
const setCommand = Command.make("set", setConfig, ({ fqn, visibility }) =>
  handleVisibilitySet(fqn, visibility).pipe(withRuntime("visibility set")),
).pipe(withArgvTracking(setConfig), Command.withDescription("Set established Registry visibility"));
const setCommandWithExamples = setCommand.pipe(
  Command.withExamples([
    {
      description: "Make an extension private",
      command: "axm visibility set @acme/skills/review private",
    },
  ]),
);

const reconcileConfig = { fqn: targetArgument } as const;
const reconcileCommand = Command.make("reconcile", reconcileConfig, ({ fqn }) =>
  handleVisibilityReconcile(fqn).pipe(
    withWorkspace(DEFAULT_WORKSPACE_SCOPE),
    withRuntime("visibility reconcile"),
  ),
).pipe(
  withArgvTracking(reconcileConfig),
  Command.withDescription("Apply repository visibility intent to the Registry"),
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
  Command.withDescription("Inspect and manage whole-Extension Registry visibility"),
  Command.withExamples([
    { description: "Inspect visibility", command: "axm visibility status @acme/skills/review" },
  ]),
  Command.withSubcommands([
    statusCommandWithExamples,
    setCommandWithExamples,
    reconcileCommandWithExamples,
  ]),
);
