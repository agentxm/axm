import { Command } from "effect/unstable/cli";

import type { RuntimeCapabilities } from "./runtime.js";
import { JsonOutputSupported } from "./json-output.js";

const annotateJsonOutput = Command.annotate(JsonOutputSupported, true);
const identityCommand: typeof annotateJsonOutput = (command) => command;

const resolveCapabilities = (capabilities?: Partial<RuntimeCapabilities>): RuntimeCapabilities => ({
  json: capabilities?.json === true,
});

export const spikeCommandMeta = (command: string, capabilities?: Partial<RuntimeCapabilities>) => {
  const resolvedCapabilities = resolveCapabilities(capabilities);

  return {
    command,
    capabilities: resolvedCapabilities,
    annotate: resolvedCapabilities.json ? annotateJsonOutput : identityCommand,
  };
};

export type CommandMeta = ReturnType<typeof spikeCommandMeta>;

export const annotateCommandMeta = (meta: CommandMeta): typeof annotateJsonOutput => meta.annotate;
