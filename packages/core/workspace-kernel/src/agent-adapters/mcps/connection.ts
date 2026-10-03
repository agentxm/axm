import * as Schema from "effect/Schema";

/** Canonical values never acquire interpolation semantics from their spelling. */
const Text = Schema.String.check(Schema.isPattern(/^[^\0]*$/u));
const EnvName = Schema.String.check(Schema.isPattern(/^[A-Za-z_][A-Za-z0-9_]*$/u));
const EnvironmentReference = Schema.Struct({ env: EnvName });
const Segment = Schema.Union([Text, EnvironmentReference]);

export const McpValueSchema = Schema.Union([
  Text,
  EnvironmentReference,
  Schema.Struct({ template: Schema.NonEmptyArray(Segment) }),
]).annotate({
  identifier: "McpValue",
  description: "A literal, a host environment reference, or a bounded concatenation of both.",
});
export type McpValue = typeof McpValueSchema.Type;

export const normalizeMcpValue = (value: McpValue): McpValue => {
  if (typeof value === "string" || "env" in value) return value;
  const segments: Array<string | typeof EnvironmentReference.Type> = [];
  for (const segment of value.template) {
    const previous = segments.at(-1);
    if (typeof segment === "string" && typeof previous === "string") {
      segments[segments.length - 1] = previous + segment;
    } else {
      segments.push(segment);
    }
  }
  const first = segments[0];
  if (segments.length === 1 && first !== undefined) return first;
  return first === undefined ? "" : { template: [first, ...segments.slice(1)] };
};

export const mcpValueHasReference = (value: McpValue): boolean =>
  typeof value !== "string" &&
  ("env" in value || value.template.some((segment) => typeof segment !== "string"));

/** Credentials are wholly symbolic; only a conventional authentication scheme may be literal. */
export const isSymbolicMcpCredential = (raw: McpValue): boolean => {
  const value = normalizeMcpValue(raw);
  if (typeof value === "string") return false;
  if ("env" in value) return true;
  return (
    value.template.some((part) => typeof part !== "string") &&
    value.template.every(
      (part, index) =>
        typeof part !== "string" ||
        part === "" ||
        (index === 0 && /^(?:Bearer|Basic) $/u.test(part)),
    )
  );
};

const absolutePath = /^(?:\/|[A-Za-z]:[\\/]|\\\\)/u;
export const McpWorkingDirectorySchema = Schema.Union([
  Schema.Struct({
    base: Schema.Literal("scope"),
    path: Schema.NonEmptyString.check(
      Schema.makeFilter((path) =>
        !absolutePath.test(path) && !path.startsWith("~") && !path.includes("\0")
          ? undefined
          : "Scope directory must be a relative path without tilde expansion",
      ),
    ),
  }),
  Schema.Struct({
    base: Schema.Literal("absolute"),
    path: Schema.NonEmptyString.check(Schema.isPattern(absolutePath)),
  }),
]);

const Environment = Schema.Record(EnvName, McpValueSchema);
const HeaderName = Schema.String.check(Schema.isPattern(/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/u));
const Headers = Schema.Record(HeaderName, McpValueSchema);
const RemoteTransport = Schema.Literals(["streamable-http", "sse"]);

export const McpConnectionSchema = Schema.Union([
  Schema.Struct({
    transport: Schema.Literal("stdio"),
    command: Schema.NonEmptyString.check(Schema.isPattern(/^[^\0\r\n]+$/u)),
    args: Schema.optionalKey(Schema.Array(McpValueSchema)),
    cwd: Schema.optionalKey(McpWorkingDirectorySchema),
    env: Schema.optionalKey(Environment),
  }),
  Schema.Struct({
    transport: RemoteTransport,
    url: McpValueSchema,
    headers: Schema.optionalKey(Headers),
  }),
]).annotate({ identifier: "McpConnection" });
export type McpConnection = typeof McpConnectionSchema.Type;

export const McpAuthSchema = Schema.Struct({ type: Schema.Literal("native-oauth") });
export type McpAuth = typeof McpAuthSchema.Type;

export const McpDistributionSchema = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("remote"), transport: RemoteTransport, url: Text }),
  Schema.Struct({
    kind: Schema.Literal("package"),
    registryType: Schema.NonEmptyString,
    registryBaseUrl: Schema.optionalKey(Schema.NonEmptyString),
    identifier: Schema.NonEmptyString,
    runtimeHint: Schema.optionalKey(Schema.NonEmptyString),
    transport: Schema.Literals(["stdio", "streamable-http", "sse"]),
    url: Schema.optionalKey(Text),
  }).check(
    Schema.makeFilter((selector) =>
      selector.transport === "stdio"
        ? selector.url === undefined || "Stdio distribution cannot declare an endpoint"
        : selector.url !== undefined || "Remote package distribution requires an endpoint",
    ),
  ),
]).annotate({ identifier: "McpDistribution" });
export type McpDistribution = typeof McpDistributionSchema.Type;

const ArgumentLocator = Schema.Union([
  Schema.Struct({ type: Schema.Literal("named"), name: Schema.NonEmptyString }),
  Schema.Struct({ type: Schema.Literal("positional"), valueHint: Schema.NonEmptyString }),
  Schema.Struct({ type: Schema.Literal("positional"), value: Text }),
]);
const BindingTarget = Schema.Union([
  Schema.Struct({
    kind: Schema.Literals(["environment", "header", "url-variable"]),
    name: Schema.NonEmptyString,
    variable: Schema.optionalKey(Schema.NonEmptyString),
  }),
  Schema.Struct({
    kind: Schema.Literals(["runtime-argument", "package-argument"]),
    argument: ArgumentLocator,
    variable: Schema.optionalKey(Schema.NonEmptyString),
  }),
]);
export const McpBindingSchema = Schema.Union([
  Schema.Struct({ target: BindingTarget, value: McpValueSchema }),
  Schema.Struct({ target: BindingTarget, values: Schema.Array(McpValueSchema) }),
]).annotate({ identifier: "McpBinding" });
export type McpBinding = typeof McpBindingSchema.Type;

export interface McpConnectionFinding {
  readonly code: string;
  readonly path: ReadonlyArray<string | number>;
  readonly message: string;
}

const protocolHeaders = new Set([
  "mcp-protocol-version",
  "mcp-method",
  "mcp-name",
  "mcp-session-id",
  "accept",
  "content-type",
]);
const credentialName =
  /(?:^|[-_])(?:authorization|proxy-authorization|cookie|api[-_]?key|access[-_]?token|refresh[-_]?token|token|password|secret|credential)(?:$|[-_])/iu;

/** Used for known credential destinations; manifest sensitivity is additional authority. */
export const isMcpCredentialName = (name: string): boolean => credentialName.test(name);

/** Findings contain paths and rules only, never rejected input or token fragments. */
export const validateMcpConnection = (
  connection: McpConnection,
  auth?: McpAuth,
): ReadonlyArray<McpConnectionFinding> => {
  const findings: Array<McpConnectionFinding> = [];
  const report = (code: string, path: ReadonlyArray<string | number>, message: string) => {
    findings.push({ code, path, message });
  };
  const credentialReference = (value: McpValue) =>
    typeof value !== "string" &&
    ("env" in value
      ? isMcpCredentialName(value.env)
      : value.template.some((part) => typeof part !== "string" && isMcpCredentialName(part.env)));
  if (connection.transport === "stdio") {
    if (auth !== undefined)
      report("auth-transport", ["auth"], "Native OAuth requires a remote transport");
    for (const [name, value] of Object.entries(connection.env ?? {})) {
      if (isMcpCredentialName(name) && !isSymbolicMcpCredential(value)) {
        report(
          "literal-credential",
          ["env", name],
          "Use a native environment reference for credentials",
        );
      }
    }
    for (const [index, value] of (connection.args ?? []).entries()) {
      if (credentialReference(value))
        report(
          "argument-credential",
          ["args", index],
          "Known credentials cannot be delivered through process arguments",
        );
      const literal =
        typeof value === "string"
          ? value
          : "template" in value
            ? value.template.filter((segment) => typeof segment === "string").join("")
            : "";
      const destination = literal.replace(/^-+/u, "").split("=", 1)[0] ?? "";
      if (isMcpCredentialName(destination) && (literal.startsWith("-") || literal.includes("=")))
        report(
          "argument-credential",
          ["args", index],
          "Known credentials cannot be delivered through process arguments",
        );
    }
    return findings;
  }
  const seen = new Set<string>();
  for (const [name, value] of Object.entries(connection.headers ?? {})) {
    const lower = name.toLowerCase();
    if (seen.has(lower))
      report(
        "duplicate-header",
        ["headers", name],
        "Header names must be case-insensitively unique",
      );
    seen.add(lower);
    if (protocolHeaders.has(lower))
      report("protocol-header", ["headers", name], "Protocol metadata belongs to the native host");
    if (auth !== undefined && lower === "authorization")
      report(
        "auth-header-conflict",
        ["headers", name],
        "Native OAuth cannot coexist with an Authorization header",
      );
    if (isMcpCredentialName(name) && !isSymbolicMcpCredential(value))
      report(
        "literal-credential",
        ["headers", name],
        "Use a native environment reference or native OAuth for credentials",
      );
    const parts = typeof value === "string" ? [value] : "env" in value ? [] : value.template;
    if (parts.some((part) => typeof part === "string" && /[\r\n]/u.test(part)))
      report("header-newline", ["headers", name], "Header values cannot contain line breaks");
  }
  if (credentialReference(connection.url))
    report("url-credential", ["url"], "Credentials cannot be delivered in endpoint URLs");
  // Substitute inert sentinels only to inspect literal URL structure, never process values.
  const endpoint =
    typeof connection.url === "string"
      ? connection.url
      : "template" in connection.url
        ? connection.url.template
            .map((part) => (typeof part === "string" ? part : "axm-symbolic-value"))
            .join("")
        : undefined;
  if (endpoint !== undefined) {
    try {
      const url = new URL(endpoint);
      if (url.protocol !== "https:" && url.protocol !== "http:")
        report("url-scheme", ["url"], "MCP endpoints require HTTP or HTTPS");
      if (
        url.username !== "" ||
        url.password !== "" ||
        [...url.searchParams.keys()].some(isMcpCredentialName)
      )
        report("url-credential", ["url"], "Credentials cannot be delivered in endpoint URLs");
    } catch {
      report("url-invalid", ["url"], "MCP endpoint must be an absolute HTTP or HTTPS URL");
    }
  }
  return findings;
};
