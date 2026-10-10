import type * as DateTime from "effect/DateTime";
import * as Schema from "effect/Schema";
import * as Result from "effect/Result";
import type {
  McpConfigTarget,
  McpEnvExpansion,
  McpServersPath,
  McpEntryDialect,
} from "@agentxm/extension-model/unstable/agent-capabilities";
import {
  normalizeNativeMcpEnvValue,
  renderEnvValue,
  McpConnectionSchema,
  validateMcpConnection,
  type McpConnection,
  type McpAuth,
  type McpValue,
} from "@agentxm/workspace-kernel/agent-adapters";

export type InlineMcpDefinition = McpConnection;
export interface McpNativeSource {
  readonly agentId: string;
  readonly dialect: McpEntryDialect;
  readonly workspaceRoot: string;
  readonly envExpansion?: McpEnvExpansion;
  readonly fingerprint: string;
  readonly filePath: string;
  readonly serversPath: McpServersPath;
  readonly target: McpConfigTarget;
  readonly servers: Readonly<Record<string, unknown>>;
}
export interface McpNativeAdoption {
  readonly fingerprint: string;
  readonly filePath: string;
  readonly serversPath: McpServersPath;
  readonly name: string;
  readonly target: McpConfigTarget;
  readonly expectedEntry: Readonly<Record<string, unknown>>;
}
export interface McpAdoptionCandidate {
  readonly name: string;
  readonly definition: McpConnection;
  readonly enabled: boolean;
  readonly auth?: McpAuth;
  readonly adoptions: ReadonlyArray<McpNativeAdoption>;
}
export interface McpAdoptionFinding {
  readonly name: string;
  readonly reason: string;
}
export interface McpAdoptionPreflight {
  readonly candidates: ReadonlyArray<McpAdoptionCandidate>;
  readonly skipped: ReadonlyArray<McpAdoptionFinding>;
  readonly conflicts: ReadonlyArray<McpAdoptionFinding>;
}
const record = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const strings = (value: unknown): value is ReadonlyArray<string> =>
  Array.isArray(value) && value.every((item) => typeof item === "string");
type NormalizedServer =
  | { readonly _tag: "candidate"; readonly candidate: McpAdoptionCandidate }
  | { readonly _tag: "skip"; readonly finding: McpAdoptionFinding }
  | { readonly _tag: "conflict"; readonly finding: McpAdoptionFinding };

/** Every native field is either translated, known nonsemantic metadata, or a blocker. */
const normalizeServer = (args: {
  readonly name: string;
  readonly config: Readonly<Record<string, unknown>>;
  readonly adoption: McpNativeAdoption;
  readonly agentId: string;
  readonly dialect: McpEntryDialect;
  readonly workspaceRoot: string;
  readonly envExpansion?: McpEnvExpansion;
}): NormalizedServer => {
  const { config, dialect } = args;
  const block = (reason: string): NormalizedServer => ({
    _tag: "conflict",
    finding: { name: args.name, reason },
  });
  const supported = new Set<string>(["description"]);
  let enabled = true;
  const activations = dialect.activationField.accepted.filter((field) => field !== null);
  for (const field of activations) {
    supported.add(field.name);
    const value = config[field.name];
    if (value !== undefined) {
      if (value !== field.enabled && value !== field.disabled)
        return block("Unsupported activation value");
      enabled = value === field.enabled;
    }
  }
  let valueProblem = false;
  const value = (
    raw: string,
    field: "command" | "args" | "env" | "headers" | "url" | "cwd",
  ): McpValue => {
    const normalized = normalizeNativeMcpEnvValue(raw, args.envExpansion, field);
    if (
      renderEnvValue(normalized, args.envExpansion ?? { variables: "none", defaults: false }, field)
        .warning !== undefined
    )
      valueProblem = true;
    return normalized;
  };
  const values = (
    raw: unknown,
    field: "env" | "headers",
  ): Readonly<Record<string, McpValue>> | undefined => {
    if (raw === undefined) return {};
    if (!record(raw)) return undefined;
    const result: Record<string, McpValue> = {};
    for (const [key, item] of Object.entries(raw).sort(([a], [b]) => a.localeCompare(b))) {
      if (typeof item !== "string") return undefined;
      result[key] = value(item, field);
    }
    return result;
  };
  const transports = ["stdio", "streamable-http", "sse"] as const;
  const possible = transports.filter((transport) => {
    const selected = transport === "stdio" ? dialect.stdio : dialect.remote;
    if (selected === null) return false;
    if (
      transport !== "stdio" &&
      (dialect.remote?.urlKey[transport] === undefined ||
        typeof config[dialect.remote.urlKey[transport] ?? ""] !== "string")
    )
      return false;
    if (transport === "stdio" && config["command"] === undefined) return false;
    const names = selected.typeField.accepted.flatMap((field) =>
      field === null ? [] : [field.name],
    );
    return selected.typeField.accepted.some((field) =>
      field === null
        ? names.every((name) => config[name] === undefined)
        : config[field.name] ===
          (typeof field.value === "string"
            ? field.value
            : transport === "stdio"
              ? undefined
              : field.value[transport]),
    );
  });
  const transport = possible[0];
  if (possible.length !== 1 || transport === undefined)
    return block(
      "Native transport is ambiguous or unsupported; declare its transport explicitly before import",
    );
  const selected = transport === "stdio" ? dialect.stdio : dialect.remote;
  if (selected === null) return block("Native transport is unsupported");
  for (const field of selected.typeField.accepted) if (field !== null) supported.add(field.name);
  let proposed: unknown;
  if (transport === "stdio" && dialect.stdio !== null) {
    const local = dialect.stdio;
    supported.add("command");
    const rawCommand = config["command"];
    let command: string | undefined;
    let rawArgs: ReadonlyArray<string>;
    if (local.command === "array") {
      if (!strings(rawCommand) || rawCommand.length === 0)
        return block("Native command must be a nonempty argument vector");
      command = rawCommand[0];
      rawArgs = rawCommand.slice(1);
    } else {
      supported.add("args");
      if (
        typeof rawCommand !== "string" ||
        (config["args"] !== undefined && !strings(config["args"]))
      )
        return block("Unsupported command or argument shape");
      command = rawCommand;
      rawArgs = strings(config["args"]) ? config["args"] : [];
    }
    if (command === undefined) return block("Missing native executable");
    const executable = value(command, "command");
    if (typeof executable !== "string")
      return block(
        "Executable environment substitution cannot be represented by a literal executable token",
      );
    const env = local.envKey === null ? {} : values(config[local.envKey], "env");
    if (env === undefined) return block("Unsupported environment value shape");
    if (local.envKey !== null) supported.add(local.envKey);
    const environment = { ...env };
    if (local.envVarsKey !== undefined) {
      supported.add(local.envVarsKey);
      const forwarded = config[local.envVarsKey];
      if (forwarded !== undefined && !strings(forwarded))
        return block("Unsupported native environment allowlist");
      for (const name of strings(forwarded) ? forwarded : []) {
        if (Object.hasOwn(environment, name))
          return block("Overlapping native environment bindings require source remediation");
        environment[name] = { env: name };
      }
    }
    const cwd = local.cwdKey === undefined ? undefined : config[local.cwdKey];
    if (local.cwdKey !== undefined) supported.add(local.cwdKey);
    if (cwd !== undefined && typeof cwd !== "string")
      return block("Native working directory must be a string");
    if (typeof cwd === "string" && (typeof value(cwd, "cwd") !== "string" || valueProblem))
      return block("Native working-directory substitutions require source remediation");
    if (
      args.agentId === "pi" &&
      (cwd === undefined || (typeof cwd === "string" && !/^(?:\/|[A-Za-z]:[\\/])/u.test(cwd)))
    )
      return block(
        "Pi uses the session directory; set an absolute cwd in the native source before import",
      );
    proposed = {
      transport,
      command: executable,
      args: rawArgs.map((item) => value(item, "args")),
      env: environment,
      ...(typeof cwd === "string"
        ? {
            cwd: /^(?:\/|[A-Za-z]:[\\/])/u.test(cwd)
              ? { base: "absolute", path: cwd }
              : { base: "scope", path: cwd },
          }
        : {}),
    };
  } else if (transport !== "stdio" && dialect.remote !== null) {
    const remote = dialect.remote;
    const urlKey = remote.urlKey[transport];
    const url = urlKey === undefined ? undefined : config[urlKey];
    if (urlKey === undefined || typeof url !== "string") return block("Missing native endpoint");
    supported.add(urlKey);
    const headers = remote.headersKey === null ? {} : values(config[remote.headersKey], "headers");
    if (headers === undefined) return block("Unsupported header value shape");
    if (remote.headersKey !== null) supported.add(remote.headersKey);
    const combined = { ...headers };
    if (remote.envHeadersKey != null) {
      supported.add(remote.envHeadersKey);
      const mappings = config[remote.envHeadersKey];
      if (mappings !== undefined && !record(mappings))
        return block("Unsupported environment header bindings");
      for (const [name, variable] of Object.entries(record(mappings) ? mappings : {})) {
        if (
          typeof variable !== "string" ||
          Object.keys(combined).some((key) => key.toLowerCase() === name.toLowerCase())
        )
          return block("Ambiguous native header bindings");
        combined[name] = { env: variable };
      }
    }
    if (remote.bearerTokenEnvKey != null) {
      supported.add(remote.bearerTokenEnvKey);
      const bearer = config[remote.bearerTokenEnvKey];
      if (bearer !== undefined) {
        if (
          typeof bearer !== "string" ||
          Object.keys(combined).some((name) => name.toLowerCase() === "authorization")
        )
          return block("Ambiguous native authorization bindings");
        combined["Authorization"] = { template: ["Bearer ", { env: bearer }] };
      }
    }
    proposed = { transport, url: value(url, "url"), headers: combined };
  }
  if (
    args.agentId === "github-copilot-cli" &&
    strings(config["tools"]) &&
    config["tools"].length === 1 &&
    config["tools"][0] === "*"
  )
    supported.add("tools");
  if (Object.keys(config).some((key) => !supported.has(key)))
    return block(
      "Native configuration contains fields whose semantics cannot be preserved; remediate the source before import",
    );
  if (valueProblem)
    return block("Native interpolation or executable-value syntax cannot be represented safely");
  const decoded = Schema.decodeUnknownResult(McpConnectionSchema, { onExcessProperty: "error" })(
    proposed,
  );
  if (Result.isFailure(decoded))
    return block("Native invocation cannot be represented by the canonical connection contract");
  const findings = validateMcpConnection(decoded.success);
  if (findings.length > 0) return block(findings.map(({ message }) => message).join("; "));
  return {
    _tag: "candidate",
    candidate: {
      name: args.name,
      definition: decoded.success,
      enabled,
      adoptions: [args.adoption],
    },
  };
};
const candidateIdentity = (candidate: McpAdoptionCandidate): string =>
  JSON.stringify({
    connection: candidate.definition,
    enabled: candidate.enabled,
    auth: candidate.auth,
  });

const sortFindings = (
  findings: ReadonlyArray<McpAdoptionFinding>,
): ReadonlyArray<McpAdoptionFinding> =>
  [...findings].sort(
    (left, right) => left.name.localeCompare(right.name) || left.reason.localeCompare(right.reason),
  );

export const preflightMcpAdoptions = (args: {
  readonly configuredNames: ReadonlySet<string>;
  readonly now: DateTime.Utc;
  readonly sources: ReadonlyArray<McpNativeSource>;
}): McpAdoptionPreflight => {
  const candidates = new Map<string, McpAdoptionCandidate>();
  const conflictNames = new Set<string>();
  const skipped: Array<McpAdoptionFinding> = [];
  const conflicts: Array<McpAdoptionFinding> = [];

  const sources = [...args.sources].sort((left, right) =>
    left.filePath.localeCompare(right.filePath),
  );
  for (const source of sources) {
    for (const [name, value] of Object.entries(source.servers).sort(([left], [right]) =>
      left.localeCompare(right),
    )) {
      if (args.configuredNames.has(name)) {
        skipped.push({ name, reason: "Already configured" });
        continue;
      }
      if (!record(value)) {
        conflictNames.add(name);
        conflicts.push({ name, reason: "Native MCP entry is not an object" });
        continue;
      }
      const normalized = normalizeServer({
        name,
        config: value,
        adoption: {
          fingerprint: source.fingerprint,
          filePath: source.filePath,
          serversPath: source.serversPath,
          name,
          target: source.target,
          expectedEntry: value,
        },
        agentId: source.agentId,
        dialect: source.dialect,
        workspaceRoot: source.workspaceRoot,
        ...(source.envExpansion === undefined ? {} : { envExpansion: source.envExpansion }),
      });
      if (normalized._tag === "skip") {
        skipped.push(normalized.finding);
        continue;
      }
      if (normalized._tag === "conflict") {
        conflictNames.add(name);
        conflicts.push(normalized.finding);
        continue;
      }
      const existing = candidates.get(name);
      if (existing === undefined) {
        candidates.set(name, normalized.candidate);
        continue;
      }
      if (candidateIdentity(existing) !== candidateIdentity(normalized.candidate)) {
        conflictNames.add(name);
        conflicts.push({
          name,
          reason: `Conflicting unmanaged configurations were found for ${name}`,
        });
        continue;
      }
      candidates.set(name, {
        ...existing,
        adoptions: Array.from(
          new Map(
            [...existing.adoptions, ...normalized.candidate.adoptions].map((adoption) => [
              JSON.stringify([adoption.filePath, adoption.serversPath, adoption.name]),
              adoption,
            ]),
          ).values(),
        ),
      });
    }
  }

  const uniqueConflicts = Array.from(
    new Map(
      sortFindings(conflicts).map((finding) => [`${finding.name}\0${finding.reason}`, finding]),
    ).values(),
  );
  const uniqueSkipped = Array.from(
    new Map(
      sortFindings(skipped).map((finding) => [`${finding.name}\0${finding.reason}`, finding]),
    ).values(),
  );
  return {
    candidates: Array.from(candidates.values())
      .filter((candidate) => !conflictNames.has(candidate.name))
      .sort((left, right) => left.name.localeCompare(right.name)),
    skipped: uniqueSkipped,
    conflicts: uniqueConflicts,
  };
};
