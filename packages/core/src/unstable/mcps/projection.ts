/**
 * Pure MCP server projection helpers.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type {
  McpEnvExpansion,
  McpRemoteDialect,
  McpStdioDialect,
} from "../agent-capabilities/index.js";
import type { McpServerEntry } from "../settings/index.js";

export type InlineRemoteTransport = "streamable-http" | "sse";

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
  readonly nativeEnabled: boolean;
  readonly envExpansion?: McpEnvExpansion | undefined;
}

const ENV_REF_RE = /^\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}$/;
const DEFAULT_ENV_EXPANSION: McpEnvExpansion = {
  variables: "none",
  defaults: false,
};

const addInlineTypeField = (
  entry: Record<string, unknown>,
  typeField: McpStdioDialect["typeField"] | McpRemoteDialect["typeField"],
  transport: "stdio" | InlineRemoteTransport,
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

export const inferInlineRemoteTransport = (url: string): InlineRemoteTransport => {
  let protocol: string | undefined;
  try {
    protocol = new URL(url).protocol;
  } catch {
    protocol = undefined;
  }
  if (protocol === "ws:" || protocol === "wss:") {
    throw new Error("WebSocket MCP transport is not supported");
  }
  if (protocol !== "http:" && protocol !== "https:") {
    throw new Error(`Unsupported MCP URL scheme: ${protocol ?? "missing"}`);
  }
  return url.endsWith("/sse") || url.includes("/sse?") ? "sse" : "streamable-http";
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
}): {
  readonly values: Readonly<Record<string, string>>;
  readonly warnings: ReadonlyArray<string>;
} => {
  const values: Record<string, string> = {};
  const warnings: Array<string> = [];
  for (const [key, value] of Object.entries(args.values)) {
    const rendered = renderEnvValue(value, args.envExpansion);
    values[key] = rendered.value;
    if (rendered.warning !== undefined) {
      warnings.push(`${args.field}.${key}: ${rendered.warning}`);
    }
  }
  return { values, warnings };
};

const projectInlineStdio = (args: {
  readonly dialect: McpStdioDialect;
  readonly command: string;
  readonly commandArgs: ReadonlyArray<string>;
  readonly env: Readonly<Record<string, string>>;
  readonly enabled: boolean;
  readonly nativeEnabled: boolean;
  readonly envExpansion: McpEnvExpansion;
}): {
  readonly entry: Readonly<Record<string, unknown>>;
  readonly warnings: ReadonlyArray<string>;
} => {
  const invocation = [args.command, ...args.commandArgs];
  const entry: Record<string, unknown> = { managedBy: "axm" };
  const env = projectEnvRecord({
    values: args.env,
    envExpansion: args.envExpansion,
    field: "env",
  });
  addInlineTypeField(entry, args.dialect.typeField, "stdio");
  if (args.nativeEnabled) entry["enabled"] = args.enabled;
  if (args.dialect.command === "array") {
    entry["command"] = invocation;
  } else {
    entry["command"] = args.command;
    if (args.commandArgs.length > 0) entry["args"] = args.commandArgs;
  }
  if (Object.keys(env.values).length > 0 && args.dialect.envKey !== null) {
    entry[args.dialect.envKey] = env.values;
  }
  return { entry, warnings: env.warnings };
};

const projectInlineRemote = (args: {
  readonly dialect: McpRemoteDialect;
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly enabled: boolean;
  readonly nativeEnabled: boolean;
  readonly envExpansion: McpEnvExpansion;
}):
  | {
      readonly entry: Readonly<Record<string, unknown>>;
      readonly warnings: ReadonlyArray<string>;
    }
  | {
      readonly _tag: "unsupported";
      readonly reason: string;
    } => {
  const transport = inferInlineRemoteTransport(args.url);
  const urlKey = args.dialect.urlKey[transport];
  if (urlKey === undefined) {
    return {
      _tag: "unsupported",
      reason: `agent does not support the ${transport} remote transport`,
    };
  }
  const entry: Record<string, unknown> = { managedBy: "axm" };
  const headers = projectEnvRecord({
    values: args.headers,
    envExpansion: args.envExpansion,
    field: "headers",
  });
  addInlineTypeField(entry, args.dialect.typeField, transport);
  if (args.nativeEnabled) entry["enabled"] = args.enabled;
  entry[urlKey] = args.url;
  if (Object.keys(headers.values).length > 0 && args.dialect.headersKey !== null) {
    entry[args.dialect.headersKey] = headers.values;
  }
  return { entry, warnings: headers.warnings };
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
      nativeEnabled: args.nativeEnabled,
      envExpansion,
    });
    return {
      _tag: "projected",
      warnings: projected.warnings,
      entry: projected.entry,
    };
  }
  if (args.entry.url !== undefined) {
    if (args.remote === null) {
      return {
        _tag: "unsupported",
        reason: "agent does not support inline remote MCP servers",
      };
    }
    const projected = projectInlineRemote({
      dialect: args.remote,
      url: args.entry.url,
      headers: args.entry.headers ?? {},
      enabled: args.entry.enabled,
      nativeEnabled: args.nativeEnabled,
      envExpansion,
    });
    if ("_tag" in projected) return projected;
    return {
      _tag: "projected",
      warnings: projected.warnings,
      entry: projected.entry,
    };
  }
  return {
    _tag: "unsupported",
    reason: "MCP server has no inline command or URL",
  };
};

const normalize = (value: unknown): string => JSON.stringify(value);

export const diffAgentEntry = (
  expected: ExpectedAgentEntry,
  actual: Readonly<Record<string, unknown>> | undefined,
): DriftReport => {
  if (actual === undefined) return { _tag: "absent" };
  if (actual["managedBy"] !== "axm") return { _tag: "unmanaged" };
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
