/**
 * The input values an MCP projection renders from.
 *
 * A projection never carries a secret: the resolver emits `${NAME}` for every
 * secret input whatever was supplied, and the install path rewrites stored
 * credentials to references before it writes. The writer and the currency
 * judgment therefore render from the same values when both supply every
 * manifest secret as its reference, which is what this module decides once.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type {
  McpRegistryArgument,
  McpRegistryInput,
  McpRegistryKeyValueInput,
  McpServerManifest,
} from "@agentxm/extension-model/unstable/mcps/manifest-schema";

const maybeSecretInputName = (
  input: McpRegistryInput | McpRegistryKeyValueInput | McpRegistryArgument,
): string | undefined => {
  if (input.isSecret !== true) return undefined;
  if ("name" in input) return input.name;
  if ("valueHint" in input) return input.valueHint;
  return undefined;
};

/** Every input the manifest marks secret, by the name a value is supplied under. */
export const collectSecretInputNames = (manifest: McpServerManifest): ReadonlySet<string> => {
  const names = new Set<string>();
  const add = (input: McpRegistryInput | McpRegistryKeyValueInput | McpRegistryArgument) => {
    const name = maybeSecretInputName(input);
    if (name !== undefined) names.add(name);
  };

  for (const pkg of manifest.server.packages ?? []) {
    for (const input of pkg.environmentVariables ?? []) add(input);
    for (const input of pkg.runtimeArguments ?? []) add(input);
    for (const input of pkg.packageArguments ?? []) add(input);
  }

  for (const remote of manifest.server.remotes ?? []) {
    for (const input of remote.headers ?? []) add(input);
    for (const [name, input] of Object.entries(remote.variables ?? {})) {
      if (input.isSecret === true) names.add(name);
    }
  }

  return names;
};

/**
 * The values a projection renders from: the connection's configured env with
 * every secret input supplied as its `${NAME}` reference, never as a value.
 */
export const mcpProjectionInputValues = (
  env: Readonly<Record<string, string>>,
  secretNames: ReadonlySet<string>,
): Readonly<Record<string, string>> =>
  Object.fromEntries([
    ...Object.entries(env),
    ...[...secretNames].map((name) => [name, `\${${name}}`] as const),
  ]);
