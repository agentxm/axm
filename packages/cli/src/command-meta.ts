import { Command } from "effect/unstable/cli";

import { JsonOutputSupported } from "./json-output.js";
import { type RuntimeCapabilities, withAuthRuntime, withRegistryRuntime } from "./runtime.js";

const annotateJsonOutput = Command.annotate(JsonOutputSupported, true);
const identityCommand: typeof annotateJsonOutput = (command) => command;

const resolveCapabilities = (capabilities?: Partial<RuntimeCapabilities>): RuntimeCapabilities => ({
  json: capabilities?.json === true,
});

export const authCommandMeta = (
  command: string,
  capabilities?: Partial<RuntimeCapabilities>,
): {
  readonly command: string;
  readonly runtime: "auth";
  readonly capabilities: RuntimeCapabilities;
  readonly annotate: typeof annotateJsonOutput;
} => {
  const resolvedCapabilities = resolveCapabilities(capabilities);
  return {
    command,
    runtime: "auth" as const,
    capabilities: resolvedCapabilities,
    annotate: resolvedCapabilities.json ? annotateJsonOutput : identityCommand,
  };
};

export const registryCommandMeta = (
  command: string,
  capabilities?: Partial<RuntimeCapabilities>,
): {
  readonly command: string;
  readonly runtime: "registry";
  readonly capabilities: RuntimeCapabilities;
  readonly annotate: typeof annotateJsonOutput;
} => {
  const resolvedCapabilities = resolveCapabilities(capabilities);
  return {
    command,
    runtime: "registry" as const,
    capabilities: resolvedCapabilities,
    annotate: resolvedCapabilities.json ? annotateJsonOutput : identityCommand,
  };
};

export type CommandMeta =
  | ReturnType<typeof authCommandMeta>
  | ReturnType<typeof registryCommandMeta>;

export const annotateCommandMeta = (meta: CommandMeta): typeof annotateJsonOutput => meta.annotate;

export function withCommandRuntime(
  meta: ReturnType<typeof authCommandMeta>,
): ReturnType<typeof withAuthRuntime>;
export function withCommandRuntime(
  meta: ReturnType<typeof registryCommandMeta>,
): ReturnType<typeof withRegistryRuntime>;
export function withCommandRuntime(meta: CommandMeta) {
  return meta.runtime === "auth"
    ? withAuthRuntime({
        command: meta.command,
        capabilities: meta.capabilities,
      })
    : withRegistryRuntime({
        command: meta.command,
        capabilities: meta.capabilities,
      });
}
