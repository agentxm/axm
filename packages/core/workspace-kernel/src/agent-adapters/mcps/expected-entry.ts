import type {
  McpActivationField,
  McpEnvExpansion,
  McpRemoteDialect,
  McpStdioDialect,
} from "@agentxm/extension-model/unstable/agent-capabilities";
import {
  normalizeMcpValue,
  validateMcpConnection,
  type McpAuth,
  type McpBinding,
  type McpConnection,
  type McpDistribution,
  type McpValue,
} from "./connection.js";

/** Desired preferences plus the invocation resolved once before native projection. */
export interface McpServerDeclaration {
  readonly kind?: "configuration" | "inline" | "sourced" | undefined;
  readonly source?: string | undefined;
  readonly connection?: McpConnection | undefined;
  readonly distribution?: McpDistribution | undefined;
  readonly bindings?: ReadonlyArray<McpBinding> | undefined;
  readonly auth?: McpAuth | undefined;
  readonly enabled?: boolean | undefined;
}
export type InlineRemoteTransport = "streamable-http" | "sse";
export type ExpectedAgentEntry =
  | {
      readonly _tag: "projected";
      readonly entry: Readonly<Record<string, unknown>>;
      readonly warnings: ReadonlyArray<string>;
    }
  | { readonly _tag: "unsupported"; readonly reason: string };

export interface ProjectExpectedEntryArgs {
  readonly serverName: string;
  readonly entry: McpServerDeclaration;
  readonly stdio: McpStdioDialect | null;
  readonly remote: McpRemoteDialect | null;
  readonly activationField: McpActivationField;
  readonly envExpansion?: McpEnvExpansion | undefined;
  /** Absolute cwd resolved against the captured scope root by the location owner. */
  readonly resolvedCwd?: string | undefined;
}

type ValueField = "command" | "args" | "env" | "url" | "headers" | "cwd";
const noExpansion: McpEnvExpansion = { variables: "none", defaults: false };

/** Literal metasyntax is refused unless a native escaping contract is known. */
export const renderEnvValue = (
  raw: McpValue,
  capability: McpEnvExpansion,
  field: ValueField = "env",
): { readonly value: string; readonly warning?: string } => {
  const value = normalizeMcpValue(raw);
  const expands = capability.fields === undefined || capability.fields.includes(field);
  const literalUnsafe = (literal: string): boolean =>
    (capability.homeExpansion === true && literal.startsWith("~/")) ||
    (capability.executableValues === true &&
      (field === "env" || field === "headers") &&
      literal.startsWith("!")) ||
    (expands &&
      (((capability.variables === "braced" || capability.variables === "env-colon") &&
        literal.includes("${")) ||
        (capability.variables === "env-tag" && /\{(?:env|file):/u.test(literal))));
  const segments = typeof value === "string" ? [value] : "env" in value ? [value] : value.template;
  let rendered = "";
  for (const segment of segments) {
    if (typeof segment === "string") {
      if (literalUnsafe(segment))
        return {
          value: "",
          warning: "literal native metasyntax cannot be preserved in this field",
        };
      rendered += segment;
    } else {
      if (!expands || capability.variables === "none")
        return {
          value: "",
          warning: "native environment references are unsupported in this field",
        };
      switch (capability.variables) {
        case "braced":
          rendered += `\${${segment.env}}`;
          break;
        case "env-colon":
          rendered += `\${env:${segment.env}}`;
          break;
        case "env-tag":
          rendered += `{env:${segment.env}}`;
          break;
      }
    }
  }
  return { value: rendered };
};

/** Decode only the selected host's documented reference grammar, without evaluation. */
export const normalizeNativeMcpEnvValue = (
  value: string,
  expansion: McpEnvExpansion | undefined,
  field: ValueField = "env",
): McpValue => {
  if (
    expansion === undefined ||
    expansion.variables === "none" ||
    (expansion.fields !== undefined && !expansion.fields.includes(field))
  )
    return value;
  const pattern =
    expansion.variables === "env-tag"
      ? /\{env:([A-Za-z_][A-Za-z0-9_]*)\}/gu
      : expansion.variables === "env-colon"
        ? /\$\{env:([A-Za-z_][A-Za-z0-9_]*)\}/gu
        : /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/gu;
  const segments: Array<string | { readonly env: string }> = [];
  let start = 0;
  for (const match of value.matchAll(pattern)) {
    const name = match[1];
    if (name === undefined) continue;
    if (match.index > start) segments.push(value.slice(start, match.index));
    segments.push({ env: name });
    start = match.index + match[0].length;
  }
  if (start === 0) return value;
  if (start < value.length) segments.push(value.slice(start));
  const first = segments[0];
  return first === undefined
    ? value
    : normalizeMcpValue({ template: [first, ...segments.slice(1)] });
};

const addType = (
  entry: Record<string, unknown>,
  dialect: McpStdioDialect | McpRemoteDialect,
  transport: McpConnection["transport"],
) => {
  const required = dialect.typeField.required;
  if (required === null) return;
  if (typeof required.value === "string") entry[required.name] = required.value;
  else if (transport !== "stdio") {
    const value = required.value[transport];
    if (value !== undefined) entry[required.name] = value;
  }
};

export const projectExpectedEntry = (args: ProjectExpectedEntryArgs): ExpectedAgentEntry => {
  const connection = args.entry.connection;
  if (connection === undefined)
    return { _tag: "unsupported", reason: "MCP connection has no resolved invocation" };
  const findings = validateMcpConnection(connection, args.entry.auth);
  if (findings.length > 0)
    return { _tag: "unsupported", reason: findings.map(({ message }) => message).join("; ") };
  const expansion = args.envExpansion ?? noExpansion;
  const entry: Record<string, unknown> = {};
  const activation = args.activationField.required;
  if (activation !== null)
    entry[activation.name] =
      args.entry.enabled === false ? activation.disabled : activation.enabled;
  // Hosts without an activation field are withdrawn by the lifecycle owner.
  if (activation === null && args.entry.enabled === false)
    return {
      _tag: "unsupported",
      reason: "Disabled connections must be withdrawn for this native host",
    };
  const unsupported = (field: string, reason: string): ExpectedAgentEntry => ({
    _tag: "unsupported",
    reason: `${field}: ${reason}`,
  });
  if (connection.transport === "stdio") {
    const dialect = args.stdio;
    if (dialect === null) return unsupported("transport", "agent has no stdio MCP representation");
    const invocation: Array<string> = [];
    for (const [index, value] of [connection.command, ...(connection.args ?? [])].entries()) {
      const rendered = renderEnvValue(value, expansion, index === 0 ? "command" : "args");
      if (rendered.warning !== undefined)
        return unsupported(index === 0 ? "command" : `args.${index - 1}`, rendered.warning);
      invocation.push(rendered.value);
    }
    const env: Record<string, string> = {};
    const forwarded: Array<string> = [];
    for (const [name, raw] of Object.entries(connection.env ?? {})) {
      const value = normalizeMcpValue(raw);
      if (
        dialect.envVarsKey !== undefined &&
        typeof value !== "string" &&
        "env" in value &&
        value.env === name
      ) {
        forwarded.push(name);
      } else {
        const rendered = renderEnvValue(value, expansion, "env");
        if (rendered.warning !== undefined) return unsupported(`env.${name}`, rendered.warning);
        env[name] = rendered.value;
      }
    }
    if (Object.keys(env).length > 0) {
      if (dialect.envKey === null)
        return unsupported("env", "agent cannot represent environment values");
      entry[dialect.envKey] = env;
    }
    if (forwarded.length > 0 && dialect.envVarsKey !== undefined)
      entry[dialect.envVarsKey] = forwarded.sort();
    if (connection.cwd !== undefined) {
      if (dialect.cwdKey === undefined)
        return unsupported("cwd", "agent cannot represent an explicit working directory");
      const cwd = connection.cwd.base === "absolute" ? connection.cwd.path : args.resolvedCwd;
      if (cwd === undefined) return unsupported("cwd", "scope directory has not been resolved");
      const rendered = renderEnvValue(cwd, expansion, "cwd");
      if (rendered.warning !== undefined) return unsupported("cwd", rendered.warning);
      entry[dialect.cwdKey] = rendered.value;
    }
    addType(entry, dialect, "stdio");
    entry["command"] = dialect.command === "array" ? invocation : invocation[0];
    if (dialect.command === "split" && invocation.length > 1) entry["args"] = invocation.slice(1);
  } else {
    const dialect = args.remote;
    if (dialect === null) return unsupported("transport", "agent has no remote MCP representation");
    const urlKey = dialect.urlKey[connection.transport];
    if (urlKey === undefined)
      return unsupported("transport", "agent cannot represent the selected remote transport");
    const url = renderEnvValue(connection.url, expansion, "url");
    if (url.warning !== undefined) return unsupported("url", url.warning);
    entry[urlKey] = url.value;
    const headers: Record<string, string> = {};
    const envHeaders: Record<string, string> = {};
    for (const [name, raw] of Object.entries(connection.headers ?? {})) {
      const value = normalizeMcpValue(raw);
      if (typeof value !== "string" && "env" in value && dialect.envHeadersKey != null) {
        envHeaders[name] = value.env;
        continue;
      }
      if (
        name.toLowerCase() === "authorization" &&
        typeof value !== "string" &&
        "template" in value &&
        value.template.length === 2 &&
        value.template[0] === "Bearer " &&
        dialect.bearerTokenEnvKey != null
      ) {
        const ref = value.template[1];
        if (ref !== undefined && typeof ref !== "string") {
          entry[dialect.bearerTokenEnvKey] = ref.env;
          continue;
        }
      }
      const rendered = renderEnvValue(value, expansion, "headers");
      if (rendered.warning !== undefined) return unsupported(`headers.${name}`, rendered.warning);
      headers[name] = rendered.value;
    }
    if (Object.keys(headers).length > 0) {
      if (dialect.headersKey === null)
        return unsupported("headers", "agent cannot represent request headers");
      entry[dialect.headersKey] = headers;
    }
    if (Object.keys(envHeaders).length > 0 && dialect.envHeadersKey != null)
      entry[dialect.envHeadersKey] = envHeaders;
    addType(entry, dialect, connection.transport);
  }
  return {
    _tag: "projected",
    entry,
    warnings:
      connection.transport === "stdio" && connection.cwd === undefined
        ? ["Working directory is unspecified; the native host default applies"]
        : [],
  };
};
