/** Interpret proposed entries with each declared reader's validated recipe. */
import type {
  McpEntryDialect,
  McpEnvExpansion,
  McpTransport,
  McpTypeField,
  McpTypeFieldRepresentation,
} from "@agentxm/extension-model/unstable/agent-capabilities";
import * as Option from "effect/Option";

const record = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const strings = (value: unknown): value is ReadonlyArray<string> =>
  Array.isArray(value) && value.every((item) => typeof item === "string");
const stringMap = (value: unknown): value is Readonly<Record<string, string>> =>
  record(value) && Object.values(value).every((item) => typeof item === "string");
type Transport = "stdio" | "streamable-http" | "sse";
const discriminatorValue = (field: McpTypeFieldRepresentation, transport: Transport) =>
  typeof field.value === "string"
    ? field.value
    : transport === "stdio"
      ? undefined
      : field.value[transport];
const acceptsType = (
  entry: Readonly<Record<string, unknown>>,
  field: McpTypeField,
  transport: Transport,
) => {
  const names = field.accepted.flatMap((value) => (value === null ? [] : [value.name]));
  return field.accepted.some((value) =>
    value === null
      ? names.every((name) => entry[name] === undefined)
      : discriminatorValue(value, transport) !== undefined &&
        entry[value.name] === discriminatorValue(value, transport),
  );
};

/** Keep literal placeholders distinct from substitutions when readers use different spellings. */
const environmentMeaning = (
  value: string,
  expansion: McpEnvExpansion | undefined,
  field: "command" | "args" | "env" | "headers" | "url" | "cwd",
) => {
  if (expansion?.fields !== undefined && !expansion.fields.includes(field)) return value;
  if (expansion === undefined || expansion.variables === "none") return value;
  const references =
    expansion.variables === "env-tag"
      ? /\{env:([A-Za-z_][A-Za-z0-9_]*)\}/g
      : expansion.variables === "env-colon"
        ? /\$\{env:([A-Za-z_][A-Za-z0-9_]*)\}/g
        : /\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-|\})/g;
  const parts: Array<string | { readonly variable: string; readonly defaultValue?: string }> = [];
  let copiedUntil = 0;
  let match: RegExpExecArray | null;
  while ((match = references.exec(value)) !== null) {
    const variable = match[1];
    if (variable === undefined) continue;
    const hasDefault = match[0].endsWith(":-");
    const end = hasDefault ? value.indexOf("}", references.lastIndex) : references.lastIndex - 1;
    if (end === -1) break;
    if (hasDefault && !expansion.defaults) {
      references.lastIndex = end + 1;
      continue;
    }
    if (match.index > copiedUntil) parts.push(value.slice(copiedUntil, match.index));
    parts.push({
      variable,
      ...(hasDefault ? { defaultValue: value.slice(references.lastIndex, end) } : {}),
    });
    copiedUntil = end + 1;
    references.lastIndex = copiedUntil;
  }
  if (parts.length === 0) return value;
  if (copiedUntil < value.length) parts.push(value.slice(copiedUntil));
  return { environmentTemplate: parts };
};

export const interpretNativeMcpEntry = (args: {
  readonly entry: unknown;
  readonly config: McpEntryDialect;
  readonly transports: ReadonlyArray<McpTransport>;
  readonly envExpansion?: McpEnvExpansion;
}): Option.Option<Readonly<Record<string, unknown>>> => {
  const { entry, config } = args;
  if (!record(entry)) return Option.none();
  const activationNames = config.activationField.accepted.flatMap((field) =>
    field === null ? [] : [field.name],
  );
  const activations = config.activationField.accepted.flatMap((field) => {
    if (field === null)
      return activationNames.every((name) => entry[name] === undefined) ? [true] : [];
    return entry[field.name] === field.enabled
      ? [true]
      : entry[field.name] === field.disabled
        ? [false]
        : [];
  });
  const enabled = activations[0];
  if (enabled === undefined || activations.some((value) => value !== enabled)) return Option.none();
  const normalize = (
    value: string,
    field: "command" | "args" | "env" | "headers" | "url" | "cwd",
  ) => environmentMeaning(value, args.envExpansion, field);
  const normalizeMap = (value: Readonly<Record<string, string>>, field: "env" | "headers") =>
    Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalize(item, field)]));
  const candidates: Array<Readonly<Record<string, unknown>>> = [];
  if (
    config.stdio !== null &&
    args.transports.includes("stdio") &&
    acceptsType(entry, config.stdio.typeField, "stdio")
  ) {
    const command = entry["command"];
    const commandArgs = entry["args"];
    const env = config.stdio.envKey === null ? undefined : entry[config.stdio.envKey];
    const forwarded =
      config.stdio.envVarsKey === undefined ? undefined : entry[config.stdio.envVarsKey];
    const invocation =
      config.stdio.command === "array"
        ? strings(command) && command.length > 0 && commandArgs === undefined
          ? command
          : undefined
        : typeof command === "string" &&
            command.length > 0 &&
            (commandArgs === undefined || strings(commandArgs))
          ? [command, ...(commandArgs ?? [])]
          : undefined;
    if (
      invocation !== undefined &&
      (env === undefined || stringMap(env)) &&
      (forwarded === undefined || strings(forwarded))
    ) {
      candidates.push({
        transport: "stdio",
        invocation: invocation.map((item, index) =>
          normalize(item, index === 0 ? "command" : "args"),
        ),
        cwd:
          config.stdio.cwdKey === undefined || entry[config.stdio.cwdKey] === undefined
            ? { kind: "host-default" }
            : entry[config.stdio.cwdKey],
        env: normalizeMap(env ?? {}, "env"),
        forwarded: forwarded ?? [],
        enabled,
      });
    }
  }
  if (config.remote !== null)
    for (const transport of ["streamable-http", "sse"] as const) {
      if (
        !args.transports.includes(transport === "streamable-http" ? "http" : "sse") ||
        !acceptsType(entry, config.remote.typeField, transport)
      )
        continue;
      const urlKey = config.remote.urlKey[transport];
      const url = urlKey === undefined ? undefined : entry[urlKey];
      const headers =
        config.remote.headersKey === null ? undefined : entry[config.remote.headersKey];
      const bearer =
        config.remote.bearerTokenEnvKey == null
          ? undefined
          : entry[config.remote.bearerTokenEnvKey];
      const envHeaders =
        config.remote.envHeadersKey == null ? undefined : entry[config.remote.envHeadersKey];
      if (
        typeof url === "string" &&
        url.length > 0 &&
        (headers === undefined || stringMap(headers)) &&
        (bearer === undefined || typeof bearer === "string") &&
        (envHeaders === undefined || stringMap(envHeaders))
      ) {
        candidates.push({
          transport,
          url: normalize(url, "url"),
          headers: normalizeMap(headers ?? {}, "headers"),
          bearer: bearer ?? null,
          envHeaders: envHeaders ?? {},
          enabled,
        });
      }
    }
  const [first, second] = candidates;
  if (
    config.remote?.implicitTransport === "http-or-sse" &&
    candidates.length === 2 &&
    first !== undefined &&
    second !== undefined &&
    first["transport"] === "streamable-http" &&
    second["transport"] === "sse" &&
    config.remote.typeField.accepted.every(
      (field) => field === null || entry[field.name] === undefined,
    )
  ) {
    const interpretation = { ...first, transport: "http-or-sse" };
    if (
      JSON.stringify(interpretation) === JSON.stringify({ ...second, transport: "http-or-sse" })
    ) {
      return Option.some(interpretation);
    }
  }
  // Only an explicitly documented implicit mode can coalesce transport meanings.
  return candidates.length === 1 && candidates[0] !== undefined
    ? Option.some(candidates[0])
    : Option.none();
};
