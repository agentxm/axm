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

const inputName = (
  input: McpRegistryInput | McpRegistryKeyValueInput | McpRegistryArgument,
): string | undefined => {
  if ("name" in input) return input.name;
  if ("valueHint" in input) return input.valueHint;
  return undefined;
};

export interface ManifestInput {
  readonly name: string;
  readonly isSecret: boolean;
  readonly isRequired: boolean;
  readonly hasValue: boolean;
}

/** Enumerate named inputs across package and remote manifest transports. */
export const manifestInputs = (manifest: McpServerManifest): ReadonlyArray<ManifestInput> => {
  const inputs: Array<ManifestInput> = [];
  const add = (input: McpRegistryInput | McpRegistryKeyValueInput | McpRegistryArgument) => {
    const name = inputName(input);
    if (name === undefined) return;
    inputs.push({
      name,
      isSecret: input.isSecret === true,
      isRequired: input.isRequired === true,
      hasValue: input.value !== undefined || input.default !== undefined,
    });
  };

  for (const pkg of manifest.server.packages ?? []) {
    for (const input of pkg.environmentVariables ?? []) add(input);
    for (const input of pkg.runtimeArguments ?? []) add(input);
    for (const input of pkg.packageArguments ?? []) add(input);
  }

  for (const remote of manifest.server.remotes ?? []) {
    for (const input of remote.headers ?? []) add(input);
    for (const [name, input] of Object.entries(remote.variables ?? {})) {
      inputs.push({
        name,
        isSecret: input.isSecret === true,
        isRequired: input.isRequired === true,
        hasValue: input.value !== undefined || input.default !== undefined,
      });
    }
  }

  return inputs;
};

/** Every input the manifest marks secret, by the name a value is supplied under. */
export const collectSecretInputNames = (manifest: McpServerManifest): ReadonlySet<string> =>
  new Set(
    manifestInputs(manifest)
      .filter((input) => input.isSecret)
      .map((input) => input.name),
  );

/** Required named inputs without a value or default in the manifest. */
export const collectRequiredInputNames = (manifest: McpServerManifest): ReadonlySet<string> =>
  new Set(
    manifestInputs(manifest)
      .filter((input) => input.isRequired && !input.hasValue)
      .map((input) => input.name),
  );

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
