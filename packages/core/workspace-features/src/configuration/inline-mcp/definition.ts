/** Literal CLI conveniences over the canonical typed MCP invocation contract. */
import * as Effect from "effect/Effect";
import * as Equal from "effect/Equal";
import * as Schema from "effect/Schema";
import {
  McpConnectionSchema,
  McpValueSchema,
  validateMcpConnection,
  type McpAuth,
  type McpConnection,
  type McpValue,
} from "@agentxm/workspace-kernel/agent-adapters";
import type { McpServerEntry } from "@agentxm/workspace-kernel/workspace-state";
import { WorkspaceConfigurationFailed } from "../errors.js";

const refused = (detail: string) => new WorkspaceConfigurationFailed({ category: "usage", detail });

export const parseInlineMcpEnv = (
  values: ReadonlyArray<string>,
): Effect.Effect<Readonly<Record<string, McpValue>>, WorkspaceConfigurationFailed> =>
  Effect.gen(function* () {
    const result: Record<string, McpValue> = {};
    for (const item of values) {
      const separator = item.indexOf("=");
      const name = separator < 0 ? item : item.slice(0, separator);
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(name) || Object.hasOwn(result, name))
        return yield* refused("Environment names must be valid and unique");
      result[name] = separator < 0 ? { env: name } : item.slice(separator + 1);
    }
    return result;
  });

export const parseInlineMcpHeaders = (
  values: ReadonlyArray<string>,
  references: ReadonlyArray<string> = [],
): Effect.Effect<Readonly<Record<string, McpValue>>, WorkspaceConfigurationFailed> =>
  Effect.gen(function* () {
    const result: Record<string, McpValue> = {};
    const names = new Set<string>();
    for (const [items, symbolic] of [
      [values, false],
      [references, true],
    ] as const) {
      for (const item of items) {
        const separator = item.indexOf(symbolic ? "=" : ":");
        if (separator <= 0)
          return yield* refused("Headers require Name:Literal or --header-env Name=ENV_NAME");
        const name = item.slice(0, separator).trim();
        if (names.has(name.toLowerCase()))
          return yield* refused("Header names must be unique ignoring case");
        names.add(name.toLowerCase());
        const raw = item.slice(separator + 1);
        result[name] = yield* Schema.decodeUnknownEffect(McpValueSchema)(
          symbolic ? { env: raw } : raw,
        ).pipe(Effect.mapError(() => refused("Invalid header reference")));
      }
    }
    return result;
  });

export const matchesInlineMcpEntry = (args: {
  readonly existing: McpServerEntry | undefined;
  readonly definition: McpConnection;
  readonly auth?: McpAuth;
}): boolean =>
  args.existing?.kind === "inline" &&
  args.existing.enabled &&
  Equal.equals(args.existing.connection, args.definition) &&
  Equal.equals(args.existing.auth, args.auth);

export const makeInlineMcpDefinition = (
  args: {
    readonly command?: string | undefined;
    readonly url?: string | undefined;
    readonly transport?: McpConnection["transport"] | undefined;
    readonly args?: ReadonlyArray<string> | undefined;
    readonly cwd?: string | undefined;
    readonly connection?: unknown;
    readonly auth?: McpAuth | undefined;
  },
  headers: Readonly<Record<string, McpValue>>,
  env: Readonly<Record<string, McpValue>> = {},
): Effect.Effect<McpConnection, WorkspaceConfigurationFailed> =>
  Effect.gen(function* () {
    if (
      args.connection !== undefined &&
      (args.command !== undefined ||
        args.url !== undefined ||
        args.transport !== undefined ||
        args.cwd !== undefined ||
        (args.args?.length ?? 0) > 0 ||
        Object.keys(env).length > 0 ||
        Object.keys(headers).length > 0)
    )
      return yield* refused("Use --connection alone for invocation fields");
    if (args.command !== undefined && args.url !== undefined)
      return yield* refused("Choose a command or a URL");
    if (args.command !== undefined && Object.keys(headers).length > 0)
      return yield* refused("Headers require a remote transport");
    if (
      args.command === undefined &&
      args.connection === undefined &&
      ((args.args?.length ?? 0) > 0 || args.cwd !== undefined || Object.keys(env).length > 0)
    )
      return yield* refused("Arguments, cwd and environment require stdio");
    const proposed =
      args.connection ??
      (args.command !== undefined
        ? {
            transport: args.transport ?? "stdio",
            command: args.command,
            args: args.args ?? [],
            env,
            ...(args.cwd === undefined
              ? {}
              : {
                  cwd: /^(?:\/|[A-Za-z]:[\\/])/u.test(args.cwd)
                    ? { base: "absolute", path: args.cwd }
                    : { base: "scope", path: args.cwd },
                }),
          }
        : { transport: args.transport ?? "streamable-http", url: args.url, headers });
    const connection = yield* Schema.decodeUnknownEffect(McpConnectionSchema, {
      onExcessProperty: "error",
    })(proposed).pipe(
      Effect.mapError(() =>
        refused(
          "Invalid MCP connection: use one explicit transport, a single executable token, typed arguments and bindings",
        ),
      ),
    );
    const findings = validateMcpConnection(connection, args.auth);
    if (findings.length > 0)
      return yield* refused(findings.map(({ message }) => message).join("; "));
    return connection;
  });
