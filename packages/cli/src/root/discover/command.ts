/**
 * CLI command definition for `axm discover`.
 */

import { Command, Flag } from "effect/unstable/cli";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";

import {
  annotateCommandMeta,
  registryCommandMeta,
  withCommandRuntime,
} from "../../command-meta.js";

import { handleDiscover } from "./handler.js";

const discoverConfig = {
  path: Flag.string("path").pipe(
    Flag.optional,
    Flag.withDescription("Scan a different directory instead of the current working directory"),
  ),
} as const;

const commandMeta = registryCommandMeta("discover", { json: true });

export const discoverCommand = Command.make("discover", discoverConfig, ({ path }) =>
  handleDiscover({ path }).pipe(withCommandRuntime(commandMeta)),
).pipe(
  withArgvTracking(discoverConfig),
  annotateCommandMeta(commandMeta),
  Command.withDescription("Discover compatible extensions for your project's dependencies"),
  Command.withExamples([
    { command: "axm discover", description: "Discover extensions for the current project" },
    {
      command: "axm discover --path ./my-project",
      description: "Discover extensions for a specific directory",
    },
    {
      command: "axm discover --json",
      description: "Output discovery results as JSON",
    },
  ]),
);
