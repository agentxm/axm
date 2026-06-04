import { Argument, Command, Flag } from "effect/unstable/cli";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { syncInlineMcpServerToAgent } from "@agentxm/client-core/unstable/agents";
import { makeAppError, type AppError } from "@agentxm/client-core/unstable/app-error";
import { forceFlag, previewFlag, yesFlag } from "@agentxm/client-core/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { count } from "@agentxm/client-core/unstable/cli-renderer";
import type { McpServerLockEntry } from "@agentxm/client-core/unstable/lockfile";
import {
  type JobStepResult,
  type Plan,
  type PlannedJobStep,
} from "@agentxm/client-core/unstable/plan";
import {
  WorkspaceMutations,
  type WorkspaceMutationsService,
} from "@agentxm/client-core/unstable/workspace";
import { emitPlanResolutionResult } from "../../json-output.js";
import { scopeFlag } from "../../cli-flags.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { previewOrApplyLocalPlan } from "../shared/local-plan.js";
import { handleInstallMcpServer } from "./install/handler.js";

export interface McpsAddArgs {
  readonly name: string;
  readonly command: Option.Option<string>;
  readonly url: Option.Option<string>;
  readonly env: ReadonlyArray<string>;
  readonly header: ReadonlyArray<string>;
  readonly yes: boolean;
  readonly force: boolean;
  readonly preview: boolean;
}

const splitCommand = (value: string): ReadonlyArray<string> =>
  value.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g)?.map((part) => {
    if (
      (part.startsWith('"') && part.endsWith('"')) ||
      (part.startsWith("'") && part.endsWith("'"))
    ) {
      return part.slice(1, -1);
    }
    return part;
  }) ?? [];

const parseEnv = (values: ReadonlyArray<string>): Readonly<Record<string, string>> =>
  Object.fromEntries(
    values.map((value) => {
      const separator = value.indexOf("=");
      if (separator > 0) {
        return [value.slice(0, separator), value.slice(separator + 1)];
      }
      return [value, `\${${value}}`];
    }),
  );

const parseHeader = (value: string): Effect.Effect<readonly [string, string], AppError> =>
  Effect.gen(function* () {
    const separator = value.indexOf(":");
    if (separator <= 0) {
      return yield* makeAppError({
        code: "usage",
        detail: `Invalid header "${value}". Use Name:Value.`,
      });
    }
    return [value.slice(0, separator).trim(), value.slice(separator + 1).trim()] as const;
  });

const parseHeaders = (
  values: ReadonlyArray<string>,
): Effect.Effect<Readonly<Record<string, string>>, AppError> =>
  Effect.map(Effect.forEach(values, parseHeader), (entries) => Object.fromEntries(entries));

const makeInlineLockEntry = (
  args: McpsAddArgs,
  headers: Readonly<Record<string, string>>,
): Effect.Effect<McpServerLockEntry, AppError> =>
  Effect.gen(function* () {
    const now = new Date();
    if (Option.isSome(args.command)) {
      const commandParts = splitCommand(args.command.value);
      const command = commandParts[0];
      if (command === undefined) {
        return yield* makeAppError({
          code: "usage",
          detail: "Inline MCP command cannot be empty.",
        });
      }
      return {
        type: "inline",
        command,
        args: commandParts.slice(1),
        installedAt: now,
        updatedAt: now,
        syncedAgents: [],
      } satisfies McpServerLockEntry;
    }
    if (Option.isSome(args.url)) {
      return {
        type: "inline",
        url: args.url.value,
        headers,
        installedAt: now,
        updatedAt: now,
        syncedAgents: [],
      } satisfies McpServerLockEntry;
    }
    return yield* makeAppError({
      code: "usage",
      detail: "Provide --command or --url for inline MCP servers.",
    });
  });

const syncStep = (
  ws: WorkspaceMutationsService,
  fs: FileSystem.FileSystem,
  path: Path.Path,
  name: string,
): PlannedJobStep => ({
  label: `Sync ${name} to configured agents`,
  readiness: "ready",
  run: Effect.gen(function* () {
    const entries = yield* ws.getConfiguredMcpServerEntries();
    const entry = entries[name];
    if (entry === undefined) {
      return { result: "success", message: `${name} is not configured` } satisfies JobStepResult;
    }
    const agentIds = yield* ws.getConfiguredAgents();
    const outcomes = yield* Effect.forEach(
      agentIds,
      (agentId) =>
        syncInlineMcpServerToAgent(agentId, {
          workspaceRoot: ws.baseDir,
          serverName: name,
          entry,
          scope: ws.scope,
        }).pipe(
          Effect.provideService(FileSystem.FileSystem, fs),
          Effect.provideService(Path.Path, path),
        ),
      { concurrency: "unbounded" },
    );
    const warnings = outcomes.filter((outcome) => outcome._tag !== "success");
    return {
      result: "success",
      message:
        warnings.length === 0
          ? `Synced ${name} to ${count(agentIds.length, "agent")}`
          : `Synced ${name} with ${count(warnings.length, "warning")}`,
    } satisfies JobStepResult;
  }),
});

const makePlan = (name: string, steps: ReadonlyArray<PlannedJobStep>): Plan => ({
  _tag: "Plan",
  name: "Add MCP server",
  description: Option.some(`Configure ${name} and sync agent MCP configs`),
  jobs: [{ concurrency: 1, steps }],
});

export const handleMcpsAdd = Effect.fn("Mcps.add")(function* (args: McpsAddArgs) {
  if (Option.isNone(args.command) && Option.isNone(args.url)) {
    return yield* handleInstallMcpServer(
      { source: Option.some(args.name), env: Option.none(), nonInteractive: true },
      args,
    );
  }
  if (Option.isSome(args.command) && Option.isSome(args.url)) {
    return yield* makeAppError({
      code: "usage",
      detail: "Use exactly one of --command or --url.",
    });
  }

  const ws = yield* WorkspaceMutations;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const env = parseEnv(args.env);
  const headers = yield* parseHeaders(args.header);
  const lockEntry = yield* makeInlineLockEntry(args, headers);
  const plan = makePlan(args.name, [
    {
      label: `Configure ${args.name}`,
      readiness: "ready",
      run: ws
        .setMcpServer({
          name: args.name,
          lockEntry,
          env,
          enabled: true,
        })
        .pipe(
          Effect.as({
            result: "success",
            message: `Configured ${args.name}`,
          } satisfies JobStepResult),
        ),
    },
    syncStep(ws, fs, path, args.name),
  ]);

  const resolution = yield* previewOrApplyLocalPlan(plan, { preview: args.preview });
  yield* emitPlanResolutionResult("mcps.add", resolution);
});

const addConfig = {
  name: Argument.string("name").pipe(
    Argument.withDescription("MCP server name or registry reference"),
  ),
  scope: scopeFlag.pipe(
    Flag.withDescription("Add to project (default) or user-level configuration"),
  ),
  command: Flag.optional(Flag.string("command")).pipe(
    Flag.withDescription('Inline stdio command, such as "npx -y linear-mcp-server"'),
  ),
  url: Flag.optional(Flag.string("url")).pipe(Flag.withDescription("Inline remote MCP server URL")),
  env: Flag.string("env").pipe(
    Flag.withDescription("Environment variable name or KEY=VALUE; repeatable"),
    Flag.atLeast(0),
  ),
  header: Flag.string("header").pipe(
    Flag.withDescription("Remote header as Name:Value; repeatable"),
    Flag.atLeast(0),
  ),
  yes: yesFlag.pipe(Flag.withDescription("Apply without confirmation")),
  force: forceFlag.pipe(Flag.withDescription("Apply even if the plan has unresolved warnings")),
  preview: previewFlag.pipe(Flag.withDescription("Show what would change without applying")),
} as const;

export const addCommand = Command.make(
  "add",
  addConfig,
  ({ name, scope, command, url, env, header, yes, force, preview }) =>
    handleMcpsAdd({ name, command, url, env, header, yes, force, preview }).pipe(
      withWorkspace(scope),
      withRuntime("mcps add"),
    ),
).pipe(
  withArgvTracking(addConfig),
  Command.withDescription("Add an inline or registry MCP server"),
  Command.withExamples([
    {
      command: 'axm mcps add linear --command "npx -y linear-mcp-server" --env LINEAR_API_KEY',
      description: "Add an inline stdio MCP server",
    },
    {
      command:
        'axm mcps add sentry --url https://mcp.sentry.dev/sse --header "Authorization:Bearer ${SENTRY_TOKEN}"',
      description: "Add an inline remote MCP server",
    },
    {
      command: "axm mcps add @acme/mcps/github",
      description: "Install a registry MCP server",
    },
  ]),
);
