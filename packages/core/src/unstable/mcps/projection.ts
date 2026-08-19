/**
 * Pure MCP server projection helpers.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type {
  McpActivationField,
  McpEnvExpansion,
  McpRemoteDialect,
  McpStdioDialect,
} from "../agent-capabilities/index.js";
import type { McpServerEntry } from "../settings/index.js";
import {
  AXM_MCP_METADATA_KEY,
  buildAxmMcpMetadataFromSettingsSource,
  isAxmManagedMcpEntry,
} from "./metadata.js";

export type InlineRemoteTransport = "streamable-http" | "sse";

export type InlineRemoteTransportInference =
  | { readonly _tag: "supported"; readonly transport: InlineRemoteTransport }
  | { readonly _tag: "unsupported"; readonly reason: string };

export type ExpectedAgentEntry =
  | {
      readonly _tag: "projected";
      readonly entry: Readonly<Record<string, unknown>>;
      readonly warnings: ReadonlyArray<string>;
    }
  | {
      readonly _tag: "unsupported";
      readonly reason: string;
    };

export type DriftReport =
  | { readonly _tag: "absent" }
  | { readonly _tag: "match" }
  | { readonly _tag: "drift"; readonly fields: ReadonlyArray<string> }
  | { readonly _tag: "unmanaged" };

export interface ProjectExpectedEntryArgs {
  readonly serverName: string;
  readonly entry: McpServerEntry;
  readonly stdio: McpStdioDialect | null;
  readonly remote: McpRemoteDialect | null;
  readonly activationField: McpActivationField;
  readonly envExpansion?: McpEnvExpansion | undefined;
  readonly remoteTransport?: InlineRemoteTransport | undefined;
}

const ENV_REF_RE = /\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}/;
const FULL_ENV_REF_RE = /^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/;
const BEARER_ENV_REF_RE = /^Bearer\s+\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/i;
const DEFAULT_ENV_EXPANSION: McpEnvExpansion = {
  variables: "none",
  defaults: false,
};

const addInlineTypeField = (
  entry: Record<string, unknown>,
  typeField: McpStdioDialect["typeField"] | McpRemoteDialect["typeField"],
  transport: "stdio" | InlineRemoteTransport,
): void => {
  const required = typeField.required;
  if (required === null) return;
  if (typeof required.value === "string") {
    entry[required.name] = required.value;
    return;
  }
  if (transport !== "stdio") {
    const value = required.value[transport];
    if (value !== undefined) entry[required.name] = value;
  }
};

const addActivationField = (
  entry: Record<string, unknown>,
  activationField: McpActivationField,
  enabled: boolean,
): void => {
  const required = activationField.required;
  if (required === null) return;
  entry[required.name] = enabled ? required.enabled : required.disabled;
};

export const inferInlineRemoteTransport = (url: string): InlineRemoteTransportInference => {
  let protocol: string | undefined;
  try {
    protocol = new URL(url).protocol;
  } catch {
    protocol = undefined;
  }
  if (protocol === "ws:" || protocol === "wss:") {
    return { _tag: "unsupported", reason: "WebSocket MCP transport is not supported" };
  }
  if (protocol !== "http:" && protocol !== "https:") {
    return {
      _tag: "unsupported",
      reason: `Unsupported MCP URL scheme: ${protocol ?? "missing"}`,
    };
  }
  return {
    _tag: "supported",
    transport: url.endsWith("/sse") || url.includes("/sse?") ? "sse" : "streamable-http",
  };
};

export const renderEnvValue = (
  raw: string,
  capability: McpEnvExpansion,
): { readonly value: string; readonly warning?: string } => {
  const match = ENV_REF_RE.exec(raw);
  if (match === null) return { value: raw };
  const variableName = match[1];
  const defaultValue = match[2];
  if (variableName === undefined) return { value: raw };
  if (defaultValue !== undefined && (capability.variables === "none" || !capability.defaults)) {
    return {
      value: raw,
      warning: `does not expand environment default \${${variableName}:-${defaultValue}}`,
    };
  }
  if (capability.variables === "none") {
    return {
      value: raw,
      warning: `does not expand environment reference \${${variableName}}`,
    };
  }
  return { value: raw };
};

const projectEnvRecord = (args: {
  readonly values: Readonly<Record<string, string>>;
  readonly envExpansion: McpEnvExpansion;
  readonly field: string;
}):
  | { readonly _tag: "projected"; readonly values: Readonly<Record<string, string>> }
  | { readonly _tag: "unsupported"; readonly reason: string } => {
  const values: Record<string, string> = {};
  for (const [key, value] of Object.entries(args.values)) {
    const rendered = renderEnvValue(value, args.envExpansion);
    if (rendered.warning !== undefined) {
      return {
        _tag: "unsupported",
        reason: `${args.field}.${key}: ${rendered.warning}; secret references are never resolved into native config literals`,
      };
    }
    values[key] = rendered.value;
  }
  return { _tag: "projected", values };
};

const projectRemoteHeaders = (args: {
  readonly values: Readonly<Record<string, string>>;
  readonly dialect: McpRemoteDialect;
  readonly envExpansion: McpEnvExpansion;
}):
  | {
      readonly _tag: "projected";
      readonly literal: Readonly<Record<string, string>>;
      readonly env: Readonly<Record<string, string>>;
      readonly bearerTokenEnv: string | undefined;
    }
  | { readonly _tag: "unsupported"; readonly reason: string } => {
  const literal: Record<string, string> = {};
  const env: Record<string, string> = {};
  let bearerTokenEnv: string | undefined;

  for (const [name, value] of Object.entries(args.values)) {
    if (args.envExpansion.variables !== "none") {
      const rendered = renderEnvValue(value, args.envExpansion);
      if (rendered.warning !== undefined) {
        return {
          _tag: "unsupported",
          reason: `headers.${name}: ${rendered.warning}; secret references are never resolved into native config literals`,
        };
      }
      literal[name] = rendered.value;
      continue;
    }

    const bearerMatch =
      name.toLowerCase() === "authorization" ? BEARER_ENV_REF_RE.exec(value) : null;
    const bearerVariable = bearerMatch?.[1];
    if (bearerVariable !== undefined) {
      if (args.dialect.bearerTokenEnvKey !== undefined && args.dialect.bearerTokenEnvKey !== null) {
        bearerTokenEnv = bearerVariable;
      } else {
        return {
          _tag: "unsupported",
          reason: `headers.${name}: cannot project environment reference \${${bearerVariable}} for this agent`,
        };
      }
      continue;
    }

    const envMatch = FULL_ENV_REF_RE.exec(value);
    const envVariable = envMatch?.[1];
    if (envVariable !== undefined) {
      if (args.dialect.envHeadersKey !== undefined && args.dialect.envHeadersKey !== null) {
        env[name] = envVariable;
      } else {
        return {
          _tag: "unsupported",
          reason: `headers.${name}: cannot project environment reference \${${envVariable}} for this agent`,
        };
      }
      continue;
    }

    const rendered = renderEnvValue(value, args.envExpansion);
    if (rendered.warning === undefined) {
      literal[name] = rendered.value;
    } else {
      const reference = ENV_REF_RE.exec(value)?.[0] ?? value;
      return {
        _tag: "unsupported",
        reason: `headers.${name}: cannot project environment reference ${reference} for this agent`,
      };
    }
  }

  return { _tag: "projected", literal, env, bearerTokenEnv };
};

const projectInlineStdio = (args: {
  readonly dialect: McpStdioDialect;
  readonly command: string;
  readonly commandArgs: ReadonlyArray<string>;
  readonly env: Readonly<Record<string, string>>;
  readonly enabled: boolean;
  readonly activationField: McpActivationField;
  readonly envExpansion: McpEnvExpansion;
  readonly source: string;
  readonly serverName: string;
}):
  | { readonly _tag: "projected"; readonly entry: Readonly<Record<string, unknown>> }
  | { readonly _tag: "unsupported"; readonly reason: string } => {
  const invocation = [args.command, ...args.commandArgs];
  for (const [index, value] of invocation.entries()) {
    const rendered = renderEnvValue(value, args.envExpansion);
    if (rendered.warning !== undefined) {
      return {
        _tag: "unsupported",
        reason: `invocation.${index}: ${rendered.warning}; secret references are never resolved into native config literals`,
      };
    }
  }
  const entry: Record<string, unknown> = {
    [AXM_MCP_METADATA_KEY]: buildAxmMcpMetadataFromSettingsSource(args.source, args.serverName),
  };
  const env = projectEnvRecord({
    values: args.env,
    envExpansion: args.envExpansion,
    field: "env",
  });
  if (env._tag === "unsupported") return env;
  if (Object.keys(env.values).length > 0 && args.dialect.envKey === null) {
    return {
      _tag: "unsupported",
      reason: "agent cannot project MCP environment values",
    };
  }
  addInlineTypeField(entry, args.dialect.typeField, "stdio");
  addActivationField(entry, args.activationField, args.enabled);
  if (args.dialect.command === "array") {
    entry["command"] = invocation;
  } else {
    entry["command"] = args.command;
    if (args.commandArgs.length > 0) entry["args"] = args.commandArgs;
  }
  if (Object.keys(env.values).length > 0 && args.dialect.envKey !== null) {
    entry[args.dialect.envKey] = env.values;
  }
  return { _tag: "projected", entry };
};

const projectInlineRemote = (args: {
  readonly dialect: McpRemoteDialect;
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly enabled: boolean;
  readonly activationField: McpActivationField;
  readonly envExpansion: McpEnvExpansion;
  readonly source: string;
  readonly serverName: string;
  readonly transport?: InlineRemoteTransport | undefined;
}):
  | { readonly _tag: "projected"; readonly entry: Readonly<Record<string, unknown>> }
  | { readonly _tag: "unsupported"; readonly reason: string } => {
  const inference =
    args.transport === undefined
      ? inferInlineRemoteTransport(args.url)
      : ({ _tag: "supported", transport: args.transport } as const);
  if (inference._tag === "unsupported") return inference;
  const transport = inference.transport;
  const urlKey = args.dialect.urlKey[transport];
  if (urlKey === undefined) {
    return {
      _tag: "unsupported",
      reason: `agent does not support the ${transport} remote transport`,
    };
  }
  const entry: Record<string, unknown> = {
    [AXM_MCP_METADATA_KEY]: buildAxmMcpMetadataFromSettingsSource(args.source, args.serverName),
  };
  const headers = projectRemoteHeaders({
    values: args.headers,
    dialect: args.dialect,
    envExpansion: args.envExpansion,
  });
  if (headers._tag === "unsupported") return headers;
  if (Object.keys(headers.literal).length > 0 && args.dialect.headersKey === null) {
    return {
      _tag: "unsupported",
      reason: "agent cannot project literal MCP request headers",
    };
  }
  addInlineTypeField(entry, args.dialect.typeField, transport);
  addActivationField(entry, args.activationField, args.enabled);
  entry[urlKey] = args.url;
  if (Object.keys(headers.literal).length > 0 && args.dialect.headersKey !== null) {
    entry[args.dialect.headersKey] = headers.literal;
  }
  if (
    headers.bearerTokenEnv !== undefined &&
    args.dialect.bearerTokenEnvKey !== undefined &&
    args.dialect.bearerTokenEnvKey !== null
  ) {
    entry[args.dialect.bearerTokenEnvKey] = headers.bearerTokenEnv;
  }
  if (
    Object.keys(headers.env).length > 0 &&
    args.dialect.envHeadersKey !== undefined &&
    args.dialect.envHeadersKey !== null
  ) {
    entry[args.dialect.envHeadersKey] = headers.env;
  }
  return { _tag: "projected", entry };
};

export const projectExpectedEntry = (args: ProjectExpectedEntryArgs): ExpectedAgentEntry => {
  const envExpansion = args.envExpansion ?? DEFAULT_ENV_EXPANSION;
  if (args.entry.command !== undefined) {
    if (args.stdio === null) {
      return {
        _tag: "unsupported",
        reason: "agent does not support inline stdio MCP servers",
      };
    }
    const projected = projectInlineStdio({
      dialect: args.stdio,
      command: args.entry.command,
      commandArgs: args.entry.args ?? [],
      env: args.entry.env,
      enabled: args.entry.enabled,
      activationField: args.activationField,
      envExpansion,
      source: args.entry.source,
      serverName: args.serverName,
      ...(args.remoteTransport === undefined ? {} : { transport: args.remoteTransport }),
    });
    if (projected._tag === "unsupported") return projected;
    return {
      _tag: "projected",
      warnings: [],
      entry: projected.entry,
    };
  }
  if (args.entry.url !== undefined) {
    if (args.remote === null) {
      const headerRecovery =
        Object.keys(args.entry.headers ?? {}).length === 0
          ? ""
          : ' Preserve required headers by appending `--header "Header:${ENV_VAR}"` to the shim command and pass `ENV_VAR` with `--env ENV_VAR`.';
      return {
        _tag: "unsupported",
        reason: `this agent cannot project inline URL entries; use the supported stdio shim instead: \`axm mcps add ${args.serverName} --command "npx -y mcp-remote ${args.entry.url}"\`.${headerRecovery}`,
      };
    }
    const projected = projectInlineRemote({
      dialect: args.remote,
      url: args.entry.url,
      headers: args.entry.headers ?? {},
      enabled: args.entry.enabled,
      activationField: args.activationField,
      envExpansion,
      source: args.entry.source,
      serverName: args.serverName,
    });
    if (projected._tag === "unsupported") return projected;
    return {
      _tag: "projected",
      warnings: [],
      entry: projected.entry,
    };
  }
  return {
    _tag: "unsupported",
    reason: "MCP server has no inline command or URL",
  };
};

const normalizeForCompare = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(normalizeForCompare);
  if (typeof value !== "object" || value === null) return value;
  const sorted: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value).sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    sorted[key] = normalizeForCompare(item);
  }
  return sorted;
};

const normalize = (value: unknown): string => JSON.stringify(normalizeForCompare(value));

export const diffAgentEntry = (
  expected: ExpectedAgentEntry,
  actual: Readonly<Record<string, unknown>> | undefined,
): DriftReport => {
  if (actual === undefined) return { _tag: "absent" };
  if (!isAxmManagedMcpEntry(actual)) return { _tag: "unmanaged" };
  if (expected._tag !== "projected") {
    return { _tag: "drift", fields: ["transport"] };
  }
  const fields = new Set<string>();
  const expectedKeys = new Set(Object.keys(expected.entry));
  const actualKeys = new Set(Object.keys(actual));
  for (const key of expectedKeys) {
    if (normalize(expected.entry[key]) !== normalize(actual[key])) {
      fields.add(key);
    }
  }
  for (const key of actualKeys) {
    if (!expectedKeys.has(key)) {
      fields.add(key);
    }
  }
  return fields.size === 0 ? { _tag: "match" } : { _tag: "drift", fields: [...fields].sort() };
};
