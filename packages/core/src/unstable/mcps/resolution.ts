/**
 * MCP server manifest resolver.
 *
 * Converts upstream MCP registry `ServerDetail` distributions into an
 * agent-neutral invocation, then projects that invocation through an agent
 * capability dialect.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type {
  McpExtensionCapability,
  McpConfig,
  McpRemoteDialect,
  McpStdioDialect,
  McpTransport,
} from "../agent-capabilities/index.js";
import type {
  McpRegistryArgument,
  McpRegistryInput,
  McpRegistryKeyValueInput,
  McpRegistryPackage,
  McpRegistryRemoteTransport,
  McpServerManifest,
} from "./manifest-schema.js";

type UpstreamRemoteTransport = "streamable-http" | "sse";
type ConfiguredMcpCapability = McpExtensionCapability & {
  readonly config: McpConfig;
  readonly transports: ReadonlyArray<McpTransport>;
};

export type McpResolution =
  | {
      readonly _tag: "resolved";
      readonly entry: Readonly<Record<string, unknown>>;
      readonly transport: "stdio" | UpstreamRemoteTransport;
      readonly shimmed: boolean;
      readonly warnings: ReadonlyArray<string>;
    }
  | { readonly _tag: "nothing-runnable"; readonly reason: string }
  | { readonly _tag: "no-distribution"; readonly reason: string }
  | {
      readonly _tag: "needs-input";
      readonly entry: Readonly<Record<string, unknown>>;
      readonly transport: "stdio" | UpstreamRemoteTransport;
      readonly shimmed: boolean;
      readonly missing: ReadonlyArray<string>;
      readonly warnings: ReadonlyArray<string>;
    };

export interface ResolveMcpServerArgs {
  readonly manifest: McpServerManifest;
  readonly capability: McpExtensionCapability;
  readonly values: Readonly<Record<string, string>>;
  readonly enabled: boolean;
}

type Candidate =
  | {
      readonly kind: "remote";
      readonly rank: number;
      readonly remote: McpRegistryRemoteTransport;
      readonly shimmed: boolean;
    }
  | {
      readonly kind: "package";
      readonly rank: number;
      readonly pkg: McpRegistryPackage;
    };

interface ResolvedInput {
  readonly value: string;
  readonly missing: boolean;
}

const packageVersionSuffix = (version: string | undefined, separator: "@" | ":"): string =>
  version === undefined ? "" : `${separator}${version}`;

const capabilitySupportsUpstream = (
  transports: ReadonlyArray<McpTransport>,
  transport: UpstreamRemoteTransport,
): boolean => transports.includes(transport === "streamable-http" ? "http" : transport);

const hasMcpConfig = (capability: McpExtensionCapability): capability is ConfiguredMcpCapability =>
  "config" in capability && capability.config !== undefined && "transports" in capability;

const isRemoteTransport = (transport: string): transport is UpstreamRemoteTransport =>
  transport === "streamable-http" || transport === "sse";

const selectCandidate = (
  manifest: McpServerManifest,
  capability: ConfiguredMcpCapability,
): Candidate | undefined => {
  const candidates: Array<Candidate> = [];
  const remotes = manifest.server.remotes ?? [];
  const packages = manifest.server.packages ?? [];

  for (const remote of remotes) {
    if (capabilitySupportsUpstream(capability.transports, remote.type)) {
      candidates.push({ kind: "remote", rank: 1, remote, shimmed: false });
    } else if (capability.transports.includes("stdio")) {
      candidates.push({ kind: "remote", rank: 3, remote, shimmed: true });
    }
  }

  for (const pkg of packages) {
    if (capability.transports.includes("stdio")) {
      candidates.push({ kind: "package", rank: 2, pkg });
    }
  }

  return candidates.sort((left, right) => left.rank - right.rank)[0];
};

const inputName = (input: McpRegistryKeyValueInput | McpRegistryArgument): string | undefined => {
  if ("name" in input) return input.name;
  if ("valueHint" in input) return input.valueHint;
  return undefined;
};

const resolveInput = (
  name: string,
  input: McpRegistryInput | McpRegistryKeyValueInput | McpRegistryArgument,
  values: Readonly<Record<string, string>>,
): ResolvedInput => {
  if (input.value !== undefined)
    return { value: substituteVariables(input.value, values), missing: false };
  const configured = values[name];
  if (configured !== undefined) return { value: configured, missing: false };
  if (input.default !== undefined) return { value: input.default, missing: false };
  if (input.isRequired === true) return { value: `\${${name}}`, missing: true };
  return { value: `\${${name}}`, missing: false };
};

const substituteVariables = (value: string, values: Readonly<Record<string, string>>): string =>
  value.replaceAll(/\{([^{}]+)\}/g, (match, key: string) => values[key] ?? match);

const materializeArgument = (
  argument: McpRegistryArgument,
  values: Readonly<Record<string, string>>,
): { readonly args: ReadonlyArray<string>; readonly missing: ReadonlyArray<string> } => {
  const name = inputName(argument);
  if (argument.type === "named") {
    if (name === undefined) return { args: [], missing: [] };
    const resolved = resolveInput(name, argument, values);
    return {
      args: [argument.name, resolved.value],
      missing: resolved.missing ? [name] : [],
    };
  }

  if (argument.value !== undefined) {
    return { args: [substituteVariables(argument.value, values)], missing: [] };
  }
  if (name === undefined) return { args: [], missing: [] };
  const resolved = resolveInput(name, argument, values);
  return {
    args: [resolved.value],
    missing: resolved.missing ? [name] : [],
  };
};

const materializeArguments = (
  arguments_: ReadonlyArray<McpRegistryArgument> | undefined,
  values: Readonly<Record<string, string>>,
): { readonly args: ReadonlyArray<string>; readonly missing: ReadonlyArray<string> } => {
  const args: Array<string> = [];
  const missing: Array<string> = [];
  for (const argument of arguments_ ?? []) {
    const resolved = materializeArgument(argument, values);
    args.push(...resolved.args);
    missing.push(...resolved.missing);
  }
  return { args, missing };
};

const materializeEnv = (
  environmentVariables: ReadonlyArray<McpRegistryKeyValueInput> | undefined,
  values: Readonly<Record<string, string>>,
): { readonly env: Readonly<Record<string, string>>; readonly missing: ReadonlyArray<string> } => {
  const env: Record<string, string> = {};
  const missing: Array<string> = [];
  for (const input of environmentVariables ?? []) {
    const resolved = resolveInput(input.name, input, values);
    env[input.name] = resolved.value;
    if (resolved.missing) missing.push(input.name);
  }
  return { env, missing };
};

const materializeHeaders = (
  headers: ReadonlyArray<McpRegistryKeyValueInput> | undefined,
  values: Readonly<Record<string, string>>,
): {
  readonly headers: Readonly<Record<string, string>>;
  readonly missing: ReadonlyArray<string>;
} => {
  const result: Record<string, string> = {};
  const missing: Array<string> = [];
  for (const input of headers ?? []) {
    const resolved = resolveInput(input.name, input, values);
    result[input.name] = resolved.value;
    if (resolved.missing) missing.push(input.name);
  }
  return { headers: result, missing };
};

const packageCommand = (pkg: McpRegistryPackage): ReadonlyArray<string> | undefined => {
  const runtime = pkg.runtimeHint ?? pkg.registryType;
  switch (runtime) {
    case "npm":
    case "npx":
      return ["npx", "-y", `${pkg.identifier}${packageVersionSuffix(pkg.version, "@")}`];
    case "pypi":
    case "uvx":
      return ["uvx", `${pkg.identifier}${packageVersionSuffix(pkg.version, "@")}`];
    case "oci":
    case "docker":
      return [
        "docker",
        "run",
        "-i",
        "--rm",
        `${pkg.identifier}${packageVersionSuffix(pkg.version, ":")}`,
      ];
    case "nuget":
    case "dnx":
      return ["dnx", `${pkg.identifier}${packageVersionSuffix(pkg.version, "@")}`];
    case "mcpb":
      return ["npx", "-y", "@modelcontextprotocol/mcpb", pkg.identifier];
    default:
      return undefined;
  }
};

const addTypeField = (
  entry: Record<string, unknown>,
  typeField: McpStdioDialect["typeField"] | McpRemoteDialect["typeField"],
  transport: "stdio" | UpstreamRemoteTransport,
): void => {
  if (typeField === null) return;
  if (typeof typeField.value === "string") {
    entry[typeField.name] = typeField.value;
    return;
  }
  if (transport !== "stdio") {
    const value = typeField.value[transport];
    if (value !== undefined) entry[typeField.name] = value;
  }
};

const projectStdio = (args: {
  readonly dialect: McpStdioDialect;
  readonly command: ReadonlyArray<string>;
  readonly env: Readonly<Record<string, string>>;
  readonly enabled: boolean;
  readonly nativeEnabled: boolean;
}): Readonly<Record<string, unknown>> => {
  const [command, ...rest] = args.command;
  const entry: Record<string, unknown> = { managedBy: "axm" };
  addTypeField(entry, args.dialect.typeField, "stdio");
  if (args.nativeEnabled) entry["enabled"] = args.enabled;
  if (args.dialect.command === "array") {
    entry["command"] = args.command;
  } else {
    entry["command"] = command ?? "";
    if (rest.length > 0) entry["args"] = rest;
  }
  if (Object.keys(args.env).length > 0 && args.dialect.envKey !== null) {
    entry[args.dialect.envKey] = args.env;
  }
  return entry;
};

const projectRemote = (args: {
  readonly dialect: McpRemoteDialect;
  readonly urlKey: string;
  readonly remote: McpRegistryRemoteTransport;
  readonly headers: Readonly<Record<string, string>>;
  readonly values: Readonly<Record<string, string>>;
  readonly enabled: boolean;
  readonly nativeEnabled: boolean;
}): Readonly<Record<string, unknown>> => {
  const entry: Record<string, unknown> = { managedBy: "axm" };
  addTypeField(entry, args.dialect.typeField, args.remote.type);
  if (args.nativeEnabled) entry["enabled"] = args.enabled;
  entry[args.urlKey] = substituteVariables(args.remote.url, args.values);
  if (Object.keys(args.headers).length > 0 && args.dialect.headersKey !== null) {
    entry[args.dialect.headersKey] = args.headers;
  }
  return entry;
};

const resolveRemoteVariables = (
  remote: McpRegistryRemoteTransport,
  values: Readonly<Record<string, string>>,
): ReadonlyArray<string> => {
  const missing: Array<string> = [];
  for (const [name, input] of Object.entries(remote.variables ?? {})) {
    if (resolveInput(name, input, values).missing) missing.push(name);
  }
  return missing;
};

const resolvePackage = (
  pkg: McpRegistryPackage,
  config: McpConfig,
  values: Readonly<Record<string, string>>,
  enabled: boolean,
): McpResolution => {
  if (config.stdio === null) {
    return { _tag: "no-distribution", reason: "agent has no stdio MCP config dialect" };
  }

  const command = packageCommand(pkg);
  if (command === undefined) {
    return {
      _tag: "no-distribution",
      reason: `unsupported MCP package registryType: ${pkg.registryType}`,
    };
  }

  const runtimeArgs = materializeArguments(pkg.runtimeArguments, values);
  const packageArgs = materializeArguments(pkg.packageArguments, values);
  const env = materializeEnv(pkg.environmentVariables, values);
  const missing = [...runtimeArgs.missing, ...packageArgs.missing, ...env.missing];
  const invocation =
    pkg.registryType === "oci" || pkg.runtimeHint === "docker"
      ? [
          ...command.slice(0, 3),
          ...Object.keys(env.env).flatMap((name) => ["-e", name]),
          ...command.slice(3),
          ...runtimeArgs.args,
          ...packageArgs.args,
        ]
      : [...command.slice(0, 1), ...runtimeArgs.args, ...command.slice(1), ...packageArgs.args];
  const entry = projectStdio({
    dialect: config.stdio,
    command: invocation,
    env: env.env,
    enabled,
    nativeEnabled: config.nativeEnabled,
  });
  if (missing.length > 0) {
    return {
      _tag: "needs-input",
      entry,
      transport: "stdio",
      shimmed: false,
      missing,
      warnings: [`missing required MCP input values: ${missing.join(", ")}`],
    };
  }
  return { _tag: "resolved", entry, transport: "stdio", shimmed: false, warnings: [] };
};

const resolveRemote = (
  remote: McpRegistryRemoteTransport,
  config: McpConfig,
  values: Readonly<Record<string, string>>,
  enabled: boolean,
  shimmed: boolean,
): McpResolution => {
  const headers = materializeHeaders(remote.headers, values);
  const missing = [...headers.missing, ...resolveRemoteVariables(remote, values)];
  if (shimmed) {
    if (config.stdio === null) {
      return { _tag: "no-distribution", reason: "agent has no stdio MCP config dialect" };
    }
    const command = [
      "npx",
      "-y",
      "mcp-remote",
      substituteVariables(remote.url, values),
      ...Object.entries(headers.headers).flatMap(([name, value]) => [
        "--header",
        `${name}: ${value}`,
      ]),
    ];
    const entry = projectStdio({
      dialect: config.stdio,
      command,
      env: {},
      enabled,
      nativeEnabled: config.nativeEnabled,
    });
    return missing.length > 0
      ? {
          _tag: "needs-input",
          entry,
          transport: "stdio",
          shimmed: true,
          missing,
          warnings: [`missing required MCP input values: ${missing.join(", ")}`],
        }
      : {
          _tag: "resolved",
          entry,
          transport: "stdio",
          shimmed: true,
          warnings: [`using stdio shim for ${remote.type}`],
        };
  }

  if (config.remote === null) {
    return { _tag: "no-distribution", reason: "agent has no remote MCP config dialect" };
  }
  const urlKey = config.remote.urlKey[remote.type];
  if (urlKey === undefined) {
    return {
      _tag: "no-distribution",
      reason: `agent does not support the ${remote.type} remote transport`,
    };
  }
  const entry = projectRemote({
    dialect: config.remote,
    urlKey,
    remote,
    headers: headers.headers,
    values,
    enabled,
    nativeEnabled: config.nativeEnabled,
  });
  return missing.length > 0
    ? {
        _tag: "needs-input",
        entry,
        transport: remote.type,
        shimmed: false,
        missing,
        warnings: [`missing required MCP input values: ${missing.join(", ")}`],
      }
    : { _tag: "resolved", entry, transport: remote.type, shimmed: false, warnings: [] };
};

export const resolveMcpServer = (args: ResolveMcpServerArgs): McpResolution => {
  if (!hasMcpConfig(args.capability)) {
    return { _tag: "no-distribution", reason: "agent does not have MCP config support" };
  }
  const capability = args.capability;
  const config = capability.config;

  const hasPackages = (args.manifest.server.packages ?? []).length > 0;
  const hasRemotes = (args.manifest.server.remotes ?? []).length > 0;
  if (!hasPackages && !hasRemotes) {
    return {
      _tag: "nothing-runnable",
      reason: "manifest server has no packages or remotes",
    };
  }

  const candidate = selectCandidate(args.manifest, capability);
  if (candidate === undefined) {
    return {
      _tag: "no-distribution",
      reason: "no MCP distribution is viable for this agent",
    };
  }

  if (candidate.kind === "package") {
    return resolvePackage(candidate.pkg, config, args.values, args.enabled);
  }

  if (!isRemoteTransport(candidate.remote.type)) {
    return {
      _tag: "no-distribution",
      reason: `unsupported remote transport: ${candidate.remote.type}`,
    };
  }
  return resolveRemote(candidate.remote, config, args.values, args.enabled, candidate.shimmed);
};
