import * as DateTime from "effect/DateTime";
import type {
  McpConfigTarget,
  McpEnvExpansion,
  McpServersPath,
} from "@agentxm/extension-model/unstable/agent-capabilities";

import {
  isAxmManagedMcpEntry,
  normalizeNativeMcpEnvValue,
} from "@agentxm/workspace-kernel/agent-adapters";
export type InlineMcpDefinition =
  | {
      readonly type: "stdio";
      readonly command: string;
      readonly args: ReadonlyArray<string>;
    }
  | {
      readonly type: "http";
      readonly url: string;
      readonly headers: Readonly<Record<string, string>>;
    };

export interface McpImportSource {
  readonly envExpansion?: McpEnvExpansion;
  readonly filePath: string;
  readonly serversPath: McpServersPath;
  readonly target: McpConfigTarget;
  readonly servers: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
}

export interface McpImportAdoption {
  readonly filePath: string;
  readonly serversPath: McpServersPath;
  readonly name: string;
  readonly target: McpConfigTarget;
  readonly expectedEntry: Readonly<Record<string, unknown>>;
}

export interface McpImportCandidate {
  readonly name: string;
  readonly definition: InlineMcpDefinition;
  readonly env: Readonly<Record<string, string>>;
  readonly adoptions: ReadonlyArray<McpImportAdoption>;
}

export interface McpImportFinding {
  readonly name: string;
  readonly reason: string;
}

export interface McpImportPreflight {
  readonly candidates: ReadonlyArray<McpImportCandidate>;
  readonly skipped: ReadonlyArray<McpImportFinding>;
  readonly conflicts: ReadonlyArray<McpImportFinding>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const stringArray = (value: unknown): ReadonlyArray<string> | undefined =>
  Array.isArray(value) && value.every((item) => typeof item === "string") ? value : undefined;

const stringRecord = (value: unknown): Readonly<Record<string, string>> | undefined => {
  if (!isRecord(value)) return undefined;
  const entries = Object.entries(value);
  if (entries.some(([, item]) => typeof item !== "string")) return undefined;
  return Object.fromEntries(entries.map(([key, item]) => [key, String(item)]));
};

const sortedRecord = (value: Readonly<Record<string, string>>): Readonly<Record<string, string>> =>
  Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)));

const envRefs = (
  value: unknown,
  expansion: McpEnvExpansion | undefined,
): Readonly<Record<string, string>> | undefined => {
  const env = value === undefined ? {} : stringRecord(value);
  if (env === undefined) return undefined;
  return Object.fromEntries(
    Object.keys(env)
      .sort((left, right) => left.localeCompare(right))
      .map((name) => {
        const normalized = normalizeNativeMcpEnvValue(env[name] ?? "", expansion);
        return [
          name,
          /\$\{[A-Za-z_][A-Za-z0-9_]*\}/u.test(normalized) ? normalized : `\${${name}}`,
        ];
      }),
  );
};

const isSensitiveName = (name: string): boolean =>
  /(?:authorization|cookie|credential|password|secret|token|api[-_]?key)/iu.test(name);

const hasEnvironmentReference = (value: string): boolean =>
  /\$\{[A-Za-z_][A-Za-z0-9_]*\}/u.test(value);

const literalSensitiveField = (
  config: Readonly<Record<string, unknown>>,
): McpImportFinding | undefined => {
  const entry = Object.entries(config).find(
    ([name, value]) =>
      isSensitiveName(name) && typeof value === "string" && !hasEnvironmentReference(value),
  );
  return entry === undefined
    ? undefined
    : {
        name: entry[0],
        reason: `Sensitive field ${entry[0]} must use an environment reference`,
      };
};

const sensitiveArgumentConflict = (args: ReadonlyArray<string>): McpImportFinding | undefined => {
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index] ?? "";
    const assignment = /^(?:--)?([^=]+)=(.*)$/u.exec(argument);
    const assignedName = assignment?.[1];
    const assignedValue = assignment?.[2];
    if (
      assignedName !== undefined &&
      assignedValue !== undefined &&
      isSensitiveName(assignedName) &&
      !hasEnvironmentReference(assignedValue)
    ) {
      return {
        name: assignedName,
        reason: `Sensitive argument ${assignedName} must use an environment reference`,
      };
    }

    const flagName = argument.replace(/^-+/u, "");
    if (assignment === null && argument.startsWith("-") && isSensitiveName(flagName)) {
      const value = args[index + 1];
      if (value === undefined || !hasEnvironmentReference(value)) {
        return {
          name: flagName,
          reason: `Sensitive argument ${flagName} must use an environment reference`,
        };
      }
      index += 1;
    }
  }
  return undefined;
};

const sensitiveHeaderConflict = (
  headers: Readonly<Record<string, string>>,
): McpImportFinding | undefined => {
  const entry = Object.entries(headers).find(
    ([name, value]) => isSensitiveName(name) && !hasEnvironmentReference(value),
  );
  return entry === undefined
    ? undefined
    : {
        name: entry[0],
        reason: `Sensitive header ${entry[0]} must use an environment reference`,
      };
};

const sensitiveUrlConflict = (value: string): string | undefined => {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return "Unsupported MCP server URL scheme; use an http(s) URL";
    }
    const username = decodeURIComponent(url.username);
    const password = decodeURIComponent(url.password);
    if (
      (username.length > 0 && !hasEnvironmentReference(username)) ||
      (password.length > 0 && !hasEnvironmentReference(password))
    ) {
      return "MCP server URL credentials must use an environment reference";
    }
    const sensitiveParameter = Array.from(url.searchParams.keys()).find(isSensitiveName);
    if (
      sensitiveParameter !== undefined &&
      !hasEnvironmentReference(url.searchParams.get(sensitiveParameter) ?? "")
    ) {
      return `Sensitive URL parameter ${sensitiveParameter} must use an environment reference`;
    }
    return undefined;
  } catch {
    return "Unsupported MCP server URL";
  }
};

type NormalizedServer =
  | { readonly _tag: "candidate"; readonly candidate: McpImportCandidate }
  | { readonly _tag: "skip"; readonly finding: McpImportFinding }
  | { readonly _tag: "conflict"; readonly finding: McpImportFinding };

const normalizeServer = (args: {
  readonly name: string;
  readonly config: Readonly<Record<string, unknown>>;
  readonly adoption: McpImportAdoption;
  readonly now: DateTime.Utc;
  readonly envExpansion?: McpEnvExpansion;
}): NormalizedServer => {
  if (isAxmManagedMcpEntry(args.config)) {
    return { _tag: "skip", finding: { name: args.name, reason: "Already managed by AXM" } };
  }

  if (args.envExpansion?.variables === "env-tag") {
    const text = [
      ...(typeof args.config["command"] === "string"
        ? [args.config["command"]]
        : (stringArray(args.config["command"]) ?? [])),
      ...(stringArray(args.config["args"]) ?? []),
      ...(typeof args.config["url"] === "string" ? [args.config["url"]] : []),
      ...Object.values(stringRecord(args.config["env"] ?? args.config["environment"]) ?? {}),
      ...Object.values(stringRecord(args.config["headers"] ?? args.config["http_headers"]) ?? {}),
    ];
    if (text.some((value) => /\$\{[A-Za-z_][A-Za-z0-9_]*(?::-|\})/u.test(value)))
      return {
        _tag: "conflict",
        finding: {
          name: args.name,
          reason:
            "Native literal uses workspace environment-reference syntax and cannot be imported without changing its meaning",
        },
      };
  }

  const sensitiveField = literalSensitiveField(args.config);
  if (sensitiveField !== undefined) {
    return {
      _tag: "conflict",
      finding: { name: args.name, reason: sensitiveField.reason },
    };
  }

  const env = envRefs(args.config["env"] ?? args.config["environment"], args.envExpansion);
  if (env === undefined) {
    return {
      _tag: "skip",
      finding: { name: args.name, reason: "Unsupported MCP server environment" },
    };
  }

  const nativeUrl = args.config["url"];
  const url =
    typeof nativeUrl === "string"
      ? normalizeNativeMcpEnvValue(nativeUrl, args.envExpansion)
      : nativeUrl;
  if (typeof url === "string") {
    const rawHeaders = args.config["headers"] ?? args.config["http_headers"];
    const decodedHeaders = rawHeaders === undefined ? {} : stringRecord(rawHeaders);
    const headers =
      decodedHeaders === undefined
        ? undefined
        : Object.fromEntries(
            Object.entries(decodedHeaders).map(([key, value]) => [
              key,
              normalizeNativeMcpEnvValue(value, args.envExpansion),
            ]),
          );
    if (headers === undefined) {
      return {
        _tag: "skip",
        finding: { name: args.name, reason: "Unsupported MCP server headers" },
      };
    }
    const headerConflict = sensitiveHeaderConflict(headers);
    if (headerConflict !== undefined) {
      return {
        _tag: "conflict",
        finding: { name: args.name, reason: headerConflict.reason },
      };
    }
    const urlConflict = sensitiveUrlConflict(url);
    if (urlConflict !== undefined) {
      return { _tag: "conflict", finding: { name: args.name, reason: urlConflict } };
    }
    return {
      _tag: "candidate",
      candidate: {
        name: args.name,
        definition: {
          type: "http",
          url,
          headers: sortedRecord(headers),
        },
        env,
        adoptions: [args.adoption],
      },
    };
  }

  const commandValue = args.config["command"];
  const separateArgs = args.config["args"] === undefined ? [] : stringArray(args.config["args"]);
  if (separateArgs === undefined) {
    return {
      _tag: "skip",
      finding: { name: args.name, reason: "Unsupported MCP server arguments" },
    };
  }
  const command =
    typeof commandValue === "string"
      ? { executable: commandValue, args: separateArgs }
      : (() => {
          const parts = stringArray(commandValue);
          if (parts === undefined) return undefined;
          const executable = parts[0];
          return executable === undefined ? undefined : { executable, args: parts.slice(1) };
        })();
  if (command === undefined || command.executable.length === 0) {
    return {
      _tag: "skip",
      finding: { name: args.name, reason: "Unsupported MCP server configuration" },
    };
  }
  const commandArgs = command.args.map((value) =>
    normalizeNativeMcpEnvValue(value, args.envExpansion),
  );
  const argumentConflict = sensitiveArgumentConflict(commandArgs);
  if (argumentConflict !== undefined) {
    return {
      _tag: "conflict",
      finding: { name: args.name, reason: argumentConflict.reason },
    };
  }
  return {
    _tag: "candidate",
    candidate: {
      name: args.name,
      definition: {
        type: "stdio",
        command: normalizeNativeMcpEnvValue(command.executable, args.envExpansion),
        args: commandArgs,
      },
      env,
      adoptions: [args.adoption],
    },
  };
};

const candidateIdentity = (candidate: McpImportCandidate): string => {
  const entry = candidate.definition;
  return JSON.stringify({
    type: entry.type,
    command: entry.type === "stdio" ? entry.command : undefined,
    args: entry.type === "stdio" ? entry.args : undefined,
    url: entry.type === "http" ? entry.url : undefined,
    headers: entry.type === "http" ? entry.headers : undefined,
    env: sortedRecord(candidate.env),
  });
};

const sortFindings = (findings: ReadonlyArray<McpImportFinding>): ReadonlyArray<McpImportFinding> =>
  [...findings].sort(
    (left, right) => left.name.localeCompare(right.name) || left.reason.localeCompare(right.reason),
  );

export const preflightMcpImports = (args: {
  readonly configuredNames: ReadonlySet<string>;
  readonly now: DateTime.Utc;
  readonly sources: ReadonlyArray<McpImportSource>;
}): McpImportPreflight => {
  const candidates = new Map<string, McpImportCandidate>();
  const conflictNames = new Set<string>();
  const skipped: Array<McpImportFinding> = [];
  const conflicts: Array<McpImportFinding> = [];

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
      const normalized = normalizeServer({
        name,
        config: value,
        adoption: {
          filePath: source.filePath,
          serversPath: source.serversPath,
          name,
          target: source.target,
          expectedEntry: value,
        },
        now: args.now,
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
