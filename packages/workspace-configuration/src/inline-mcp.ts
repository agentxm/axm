/**
 * Inline MCP capability policy: parsing and validating inline server
 * definitions from user-supplied command, URL, environment, and header
 * inputs, and deciding whether a configured entry already matches a desired
 * inline definition.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import type { ConfigurableAgentId } from "@agentxm/extension-model/unstable/agent-capabilities";
import type { McpServerEntry } from "@agentxm/workspace-state";
import { WorkspaceConfigurationFailed } from "./errors.js";
import type { InlineMcpDefinition } from "./mcp-import-preflight.js";

export const splitCommand = (value: string): ReadonlyArray<string> =>
  value.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g)?.map((part) => {
    if (
      (part.startsWith('"') && part.endsWith('"')) ||
      (part.startsWith("'") && part.endsWith("'"))
    ) {
      return part.slice(1, -1);
    }
    return part;
  }) ?? [];

const isSensitiveName = (name: string): boolean =>
  /(?:authorization|cookie|credential|password|secret|token|api[-_]?key)/iu.test(name);

const hasEnvironmentReference = (value: string): boolean =>
  /\$\{[A-Za-z_][A-Za-z0-9_]*\}/u.test(value);

export const parseInlineMcpEnv = (
  values: ReadonlyArray<string>,
): Effect.Effect<Readonly<Record<string, string>>, WorkspaceConfigurationFailed> =>
  Effect.forEach(values, (value) =>
    Effect.gen(function* () {
      const separator = value.indexOf("=");
      if (separator > 0) {
        const name = value.slice(0, separator);
        const configured = value.slice(separator + 1);
        if (isSensitiveName(name) && !hasEnvironmentReference(configured)) {
          return yield* new WorkspaceConfigurationFailed({
            category: "usage",
            detail: `Sensitive MCP input ${name} must use an environment reference; pass --env ${name}`,
          });
        }
        return [name, configured] as const;
      }
      return [value, `\${${value}}`] as const;
    }),
  ).pipe(Effect.map((entries) => Object.fromEntries(entries)));

const parseInlineMcpHeader = (
  value: string,
): Effect.Effect<readonly [string, string], WorkspaceConfigurationFailed> =>
  Effect.gen(function* () {
    const separator = value.indexOf(":");
    if (separator <= 0) {
      return yield* new WorkspaceConfigurationFailed({
        category: "usage",
        detail: `Invalid header "${value}". Use Name:Value.`,
      });
    }
    const name = value.slice(0, separator).trim();
    const configured = value.slice(separator + 1).trim();
    if (isSensitiveName(name) && !hasEnvironmentReference(configured)) {
      return yield* new WorkspaceConfigurationFailed({
        category: "usage",
        detail: `Sensitive MCP header ${name} must use an environment reference`,
      });
    }
    return [name, configured] as const;
  });

export const parseInlineMcpHeaders = (
  values: ReadonlyArray<string>,
): Effect.Effect<Readonly<Record<string, string>>, WorkspaceConfigurationFailed> =>
  Effect.map(Effect.forEach(values, parseInlineMcpHeader), (entries) =>
    Object.fromEntries(entries),
  );

export const validateInlineMcpRemoteUrl = (
  value: string,
): Effect.Effect<void, WorkspaceConfigurationFailed> =>
  Effect.gen(function* () {
    const protocol = yield* Effect.try({
      try: () => new URL(value).protocol,
      catch: (cause) =>
        new WorkspaceConfigurationFailed({
          category: "usage",
          detail: `Invalid MCP server URL "${value}". Use an http(s):// streamable URL.`,
          cause,
        }),
    });
    if (protocol === "ws:" || protocol === "wss:") {
      return yield* new WorkspaceConfigurationFailed({
        category: "usage",
        detail: "WebSocket MCP transport is not supported; use an http(s):// streamable URL.",
      });
    }
    if (protocol !== "http:" && protocol !== "https:") {
      return yield* new WorkspaceConfigurationFailed({
        category: "usage",
        detail: `Unsupported MCP server URL scheme "${protocol}". Use an http(s):// streamable URL.`,
      });
    }
  });

const arraysEqual = (
  left: ReadonlyArray<string> | undefined,
  right: ReadonlyArray<string> | undefined,
): boolean => {
  const normalizedLeft = left ?? [];
  const normalizedRight = right ?? [];
  return (
    normalizedLeft.length === normalizedRight.length &&
    normalizedLeft.every((value, index) => value === normalizedRight[index])
  );
};

const recordsEqual = (
  left: Readonly<Record<string, string>> | undefined,
  right: Readonly<Record<string, string>> | undefined,
): boolean => {
  const normalizedLeft = left ?? {};
  const normalizedRight = right ?? {};
  const leftEntries = Object.entries(normalizedLeft).sort(([leftKey], [rightKey]) =>
    leftKey.localeCompare(rightKey),
  );
  const rightEntries = Object.entries(normalizedRight).sort(([leftKey], [rightKey]) =>
    leftKey.localeCompare(rightKey),
  );
  return (
    leftEntries.length === rightEntries.length &&
    leftEntries.every(([key, value], index) => {
      const rightEntry = rightEntries[index];
      return rightEntry !== undefined && key === rightEntry[0] && value === rightEntry[1];
    })
  );
};

export const matchesInlineMcpEntry = (args: {
  readonly existing: McpServerEntry | undefined;
  readonly definition: InlineMcpDefinition;
  readonly env: Readonly<Record<string, string>>;
  readonly agents: ReadonlyArray<ConfigurableAgentId> | undefined;
}): boolean =>
  args.existing !== undefined &&
  args.existing.kind === "inline" &&
  args.existing.enabled &&
  args.existing.command ===
    (args.definition.type === "stdio" ? args.definition.command : undefined) &&
  arraysEqual(
    args.existing.args,
    args.definition.type === "stdio" ? args.definition.args : undefined,
  ) &&
  args.existing.url === (args.definition.type === "http" ? args.definition.url : undefined) &&
  recordsEqual(
    args.existing.headers,
    args.definition.type === "http" ? args.definition.headers : undefined,
  ) &&
  recordsEqual(args.existing.env, args.env) &&
  arraysEqual(args.existing.agents, args.agents);

/** Derive the inline definition from the add command's mutually exclusive inputs. */
export const makeInlineMcpDefinition = (
  args: {
    readonly command: string | undefined;
    readonly url: string | undefined;
  },
  headers: Readonly<Record<string, string>>,
): Effect.Effect<InlineMcpDefinition, WorkspaceConfigurationFailed> =>
  Effect.gen(function* () {
    if (args.command !== undefined) {
      const commandParts = splitCommand(args.command);
      const command = commandParts[0];
      if (command === undefined) {
        return yield* new WorkspaceConfigurationFailed({
          category: "usage",
          detail: "Inline MCP command cannot be empty.",
        });
      }
      return {
        type: "stdio",
        command,
        args: commandParts.slice(1),
      } satisfies InlineMcpDefinition;
    }
    if (args.url !== undefined) {
      return {
        type: "http",
        url: args.url,
        headers,
      } satisfies InlineMcpDefinition;
    }
    return yield* new WorkspaceConfigurationFailed({
      category: "usage",
      detail: "Provide --command or --url for inline MCP servers.",
    });
  });
