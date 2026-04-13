/**
 * CLI command definition for `axm discover`.
 */

import { Command, Flag } from "effect/unstable/cli";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { withRuntime } from "../../runtime.js";

import { handleDiscover } from "./handler.js";

const discoverConfig = {
  path: Flag.string("path").pipe(
    Flag.optional,
    Flag.withDescription("Scan a different directory instead of the current working directory"),
  ),
} as const;

export const discoverCommand = Command.make("discover", discoverConfig, ({ path }) =>
  handleDiscover({ path }).pipe(withRuntime("discover")),
).pipe(
  withArgvTracking(discoverConfig),
  Command.withDescription("Discover compatible extensions for your project's dependencies"),
  Command.withExamples([
    { command: "axm discover", description: "Discover extensions for the current project" },
    {
      command: "axm discover --path ./my-project",
      description: "Discover extensions for a specific directory",
    },
    {
      command: "axm discover --json",
      description: "Emit { _version, command, items, count, totalDetected, registryAvailable }",
    },
  ]),
);
