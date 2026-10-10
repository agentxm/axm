/**
 * CLI command definition for `axm discover`.
 */

import { Command } from "effect/cli";
import { withArgvTracking } from "../../cli-runtime/index.js";
import { withRuntime } from "../../runtime.js";
import { readOnlyCapabilities, withCommandCapabilities } from "../shared/command-capabilities.js";

import { handleDiscover } from "./handler.js";

const discoverConfig = {};

export const discoverCommand = Command.make("discover", discoverConfig, () =>
  handleDiscover().pipe(withRuntime("discover")),
).pipe(
  withArgvTracking(discoverConfig),
  withCommandCapabilities(readOnlyCapabilities()),
  Command.withDescription("Find extensions for your project"),
  Command.withExamples([
    { command: "axm discover", description: "Discover extensions for the current project" },
    {
      command: "axm -C ./my-project discover",
      description: "Discover extensions for a specific directory",
    },
    {
      command: "axm discover --json",
      description: "Print discovery results as JSON",
    },
  ]),
);
