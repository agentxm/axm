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
  McpTransport,
} from "@agentxm/extension-model/unstable/agent-capabilities";
import type {
  McpRegistryArgument,
  McpRegistryInput,
  McpRegistryKeyValueInput,
  McpRegistryPackage,
  McpRegistryRemoteTransport,
  McpServerManifest,
} from "@agentxm/extension-model/unstable/mcps/manifest-schema";
import { buildAxmMcpMetadata } from "./metadata.js";
import { AXM_MCP_METADATA_KEY } from "../workspace/mcp-entry-semantics.js";
import { projectExpectedEntry, type InlineRemoteTransport } from "./projection.js";
import type { McpServerEntry } from "../settings/index.js";

type UpstreamRemoteTransport = "streamable-http" | "sse";
type ConfiguredMcpCapability = McpExtensionCapability & {
  readonly native: Extract<
    McpExtensionCapability["native"],
    { readonly transports: ReadonlyArray<McpTransport> }
  >;
  readonly axm: {
    readonly writer: {
      readonly config: McpConfig;
    };
  };
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
  capability.axm.writer !== null && "transports" in capability.native;

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
    if (capabilitySupportsUpstream(capability.native.transports, remote.type)) {
      candidates.push({ kind: "remote", rank: 1, remote, shimmed: false });
    } else if (capability.native.transports.includes("stdio")) {
      candidates.push({ kind: "remote", rank: 3, remote, shimmed: true });
    }
  }

  for (const pkg of packages) {
    if (capability.native.transports.includes("stdio")) {
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
  if (input.isSecret === true) {
    return {
      value: `\${${name}}`,
      missing: values[name] === undefined && input.isRequired === true,
    };
  }
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

const projectRegistryEntry = (args: {
  readonly capability: ConfiguredMcpCapability;
  readonly serverName: string;
  readonly entry: McpServerEntry;
  readonly ref: string;
  readonly remoteTransport?: InlineRemoteTransport | undefined;
}):
  | { readonly _tag: "projected"; readonly entry: Readonly<Record<string, unknown>> }
  | { readonly _tag: "unsupported"; readonly reason: string } => {
  const config = args.capability.axm.writer.config;
  const projected = projectExpectedEntry({
    serverName: args.serverName,
    entry: args.entry,
    stdio: config.stdio,
    remote: config.remote,
    activationField: config.activationField,
    envExpansion: args.capability.native.mcpEnvExpansion,
    ...(args.remoteTransport === undefined ? {} : { remoteTransport: args.remoteTransport }),
  });
  if (projected._tag === "unsupported") return projected;
  return {
    _tag: "projected",
    entry: {
      ...projected.entry,
      [AXM_MCP_METADATA_KEY]: buildAxmMcpMetadata({
        ext: args.ref,
        source: "registry",
        ref: args.ref,
      }),
    },
  };
};

const materializeRemote = (
  remote: McpRegistryRemoteTransport,
  values: Readonly<Record<string, string>>,
): { readonly url: string; readonly missing: ReadonlyArray<string> } => {
  const missing: Array<string> = [];
  const resolvedValues: Record<string, string> = { ...values };
  for (const [name, input] of Object.entries(remote.variables ?? {})) {
    const resolved = resolveInput(name, input, values);
    resolvedValues[name] = resolved.value;
    if (resolved.missing) missing.push(name);
  }
  return { url: substituteVariables(remote.url, resolvedValues), missing };
};

const resolvePackage = (
  manifest: McpServerManifest,
  pkg: McpRegistryPackage,
  capability: ConfiguredMcpCapability,
  values: Readonly<Record<string, string>>,
  enabled: boolean,
): McpResolution => {
  const config = capability.axm.writer.config;
  if (config.stdio === null) {
    return { _tag: "no-distribution", reason: "agent has no stdio MCP config dialect" };
  }

  const baseCommand = packageCommand(pkg);
  if (baseCommand === undefined) {
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
          ...baseCommand.slice(0, 3),
          ...Object.keys(env.env).flatMap((name) => ["-e", name]),
          ...baseCommand.slice(3),
          ...runtimeArgs.args,
          ...packageArgs.args,
        ]
      : [
          ...baseCommand.slice(0, 1),
          ...runtimeArgs.args,
          ...baseCommand.slice(1),
          ...packageArgs.args,
        ];
  const [command, ...commandArgs] = invocation;
  const projected = projectRegistryEntry({
    capability,
    serverName: manifest.name,
    entry: {
      kind: "sourced",
      source: "registry",
      command: command ?? "",
      args: commandArgs,
      env: env.env,
      enabled,
    },
    ref: `${manifest.owner}/mcps/${manifest.name}`,
  });
  if (projected._tag === "unsupported") {
    return { _tag: "no-distribution", reason: projected.reason };
  }
  const entry = projected.entry;
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
  manifest: McpServerManifest,
  remote: McpRegistryRemoteTransport,
  capability: ConfiguredMcpCapability,
  values: Readonly<Record<string, string>>,
  enabled: boolean,
  shimmed: boolean,
): McpResolution => {
  const config = capability.axm.writer.config;
  const headers = materializeHeaders(remote.headers, values);
  const materializedRemote = materializeRemote(remote, values);
  const missing = [...headers.missing, ...materializedRemote.missing];
  if (shimmed) {
    if (config.stdio === null) {
      return { _tag: "no-distribution", reason: "agent has no stdio MCP config dialect" };
    }
    const command = [
      "npx",
      "-y",
      "mcp-remote",
      materializedRemote.url,
      ...Object.entries(headers.headers).flatMap(([name, value]) => [
        "--header",
        `${name}: ${value}`,
      ]),
    ];
    const [executable, ...commandArgs] = command;
    const projected = projectRegistryEntry({
      capability,
      serverName: manifest.name,
      entry: {
        kind: "sourced",
        source: "registry",
        command: executable ?? "",
        args: commandArgs,
        env: {},
        enabled,
      },
      ref: `${manifest.owner}/mcps/${manifest.name}`,
    });
    if (projected._tag === "unsupported") {
      return { _tag: "no-distribution", reason: projected.reason };
    }
    const entry = projected.entry;
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
  const projected = projectRegistryEntry({
    capability,
    serverName: manifest.name,
    entry: {
      kind: "sourced",
      source: "registry",
      url: materializedRemote.url,
      headers: headers.headers,
      env: {},
      enabled,
    },
    ref: `${manifest.owner}/mcps/${manifest.name}`,
    remoteTransport: remote.type,
  });
  if (projected._tag === "unsupported") {
    return { _tag: "no-distribution", reason: projected.reason };
  }
  const entry = projected.entry;
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
    return resolvePackage(args.manifest, candidate.pkg, capability, args.values, args.enabled);
  }

  if (!isRemoteTransport(candidate.remote.type)) {
    return {
      _tag: "no-distribution",
      reason: `unsupported remote transport: ${candidate.remote.type}`,
    };
  }
  return resolveRemote(
    args.manifest,
    candidate.remote,
    capability,
    args.values,
    args.enabled,
    candidate.shimmed,
  );
};
