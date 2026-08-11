import { Argument, Command, Flag } from "effect/unstable/cli";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import {
  syncInlineMcpServerToAgents,
  type McpServerSyncTarget,
} from "@agentxm/client-core/unstable/agents";
import { makeAppError, type AppError } from "@agentxm/client-core/unstable/app-error";
import { acceptWarningsFlag, previewFlag, yesFlag } from "@agentxm/client-core/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { count } from "@agentxm/client-core/unstable/cli-renderer";
import type { McpServerLockEntry } from "@agentxm/client-core/unstable/lockfile";
import {
  type JobStepArtifact,
  type JobStepResult,
  type Plan,
  type PlannedJobStep,
} from "@agentxm/client-core/unstable/plan";
import type { McpServerEntry } from "@agentxm/client-core/unstable/settings";
import {
  WorkspaceMutations,
  type WorkspaceMutationsService,
} from "@agentxm/client-core/unstable/workspace";
import { emitPlanResolutionResult } from "../../json-output.js";
import { scopeFlag } from "../../cli-flags.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { previewOrApplyLocalPlan } from "../shared/local-plan.js";
import { emitNoOpOutcome } from "../shared/no-op-output.js";

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

const validateRemoteUrl = (value: string): Effect.Effect<void, AppError> =>
  Effect.gen(function* () {
    const protocol = yield* Effect.try({
      try: () => new URL(value).protocol,
      catch: (cause) =>
        makeAppError({
          code: "usage",
          detail: `Invalid MCP server URL "${value}". Use an http(s):// streamable URL.`,
          cause,
        }),
    });
    if (protocol === "ws:" || protocol === "wss:") {
      return yield* makeAppError({
        code: "usage",
        detail: "WebSocket MCP transport is not supported; use an http(s):// streamable URL.",
      });
    }
    if (protocol !== "http:" && protocol !== "https:") {
      return yield* makeAppError({
        code: "usage",
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

const matchesInlineMcpEntry = (args: {
  readonly existing: McpServerEntry | undefined;
  readonly lockEntry: McpServerLockEntry;
  readonly env: Readonly<Record<string, string>>;
}): boolean =>
  args.existing !== undefined &&
  args.lockEntry.type === "inline" &&
  args.existing.source === "inline" &&
  args.existing.enabled &&
  args.existing.command === args.lockEntry.command &&
  arraysEqual(args.existing.args, args.lockEntry.args) &&
  args.existing.url === args.lockEntry.url &&
  recordsEqual(args.existing.headers, args.lockEntry.headers) &&
  recordsEqual(args.existing.env, args.env);

const makeInlineLockEntry = (
  args: McpsAddArgs,
  headers: Readonly<Record<string, string>>,
): Effect.Effect<McpServerLockEntry, AppError> =>
  Effect.gen(function* () {
    const now = yield* DateTime.now;
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
      } satisfies McpServerLockEntry;
    }
    if (Option.isSome(args.url)) {
      return {
        type: "inline",
        url: args.url.value,
        headers,
        installedAt: now,
        updatedAt: now,
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
    const outcomes = yield* syncInlineMcpServerToAgents(agentIds, {
      workspaceRoot: ws.baseDir,
      serverName: name,
      entry,
      scope: ws.scope,
    }).pipe(
      Effect.provideService(FileSystem.FileSystem, fs),
      Effect.provideService(Path.Path, path),
    );
    const warningDetails = outcomes.flatMap((outcome, index) => {
      const agentId = agentIds[index] ?? "unknown";
      if (outcome._tag === "success") {
        return (outcome.warnings ?? []).map((warning) => `${agentId}: ${warning}`);
      }
      return [`${agentId}: ${outcome.reason}`];
    });
    const successfulAgentIds = outcomes.flatMap((outcome, index) => {
      const agentId = agentIds[index];
      return outcome._tag === "success" && agentId !== undefined ? [agentId] : [];
    });
    const groupedTargets = new Map<
      string,
      {
        readonly path: string;
        change: McpServerSyncTarget["change"];
        agentIds: Array<string>;
      }
    >();
    outcomes.forEach((outcome, index) => {
      const agentId = agentIds[index];
      if (outcome._tag !== "success" || agentId === undefined) return;

      (outcome.targets ?? []).forEach((target) => {
        const grouped = groupedTargets.get(target.path);
        if (grouped === undefined) {
          groupedTargets.set(target.path, {
            path: target.path,
            change: target.change,
            agentIds: [agentId],
          });
          return;
        }
        grouped.agentIds.push(agentId);
        if (grouped.change !== "created" && target.change === "created") {
          grouped.change = "created";
        }
      });
    });
    const syncTargets = Array.from(groupedTargets.values()).map((target) => ({
      path: target.path,
      change: target.change,
      agentIds: target.agentIds,
    }));
    const syncChange = syncTargets.some((target) => target.change === "created")
      ? "created"
      : "updated";
    const artifactPath =
      syncTargets.length === 1 ? (syncTargets[0]?.path ?? ".mcp.json") : "agent MCP configs";
    const artifact =
      successfulAgentIds.length === 0
        ? undefined
        : ({
            path: artifactPath,
            scope: ws.scope,
            agents: successfulAgentIds,
            change: syncChange,
            fileCount: syncTargets.length,
            targets: syncTargets,
          } satisfies JobStepArtifact);
    return {
      result: "success",
      message:
        warningDetails.length === 0
          ? `Synced ${name} to ${count(successfulAgentIds.length, "agent")}`
          : `Synced ${name} to ${count(successfulAgentIds.length, "agent")} with ${count(warningDetails.length, "warning")}`,
      ...(warningDetails.length > 0 ? { warnings: warningDetails } : {}),
      ...(artifact === undefined ? {} : { artifact }),
    } satisfies JobStepResult;
  }),
});

const configArtifact = (
  scope: "project" | "user",
  change: JobStepArtifact["change"],
): JobStepArtifact => ({
  path: ".axm (config/lockfile)",
  scope,
  change,
  targets: [{ path: ".axm (config/lockfile)", change }],
});

const makePlan = (name: string, steps: ReadonlyArray<PlannedJobStep>): Plan => ({
  _tag: "Plan",
  name: "Add MCP server",
  description: Option.some(`Configure ${name} and sync agent MCP configs`),
  jobs: [{ concurrency: 1, steps }],
});

export const handleMcpsAdd = Effect.fn("Mcps.add")(function* (args: McpsAddArgs) {
  if (Option.isNone(args.command) && Option.isNone(args.url)) {
    return yield* makeAppError({
      code: "usage",
      detail: `mcps add only configures inline MCP servers. Use axm mcps install ${args.name} for package or source locators.`,
      suggestions: [
        { description: "Install the MCP server package", cmd: `axm mcps install ${args.name}` },
      ],
    });
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
  if (Option.isSome(args.url)) {
    yield* validateRemoteUrl(args.url.value);
  }
  const lockEntry = yield* makeInlineLockEntry(args, headers);
  const configured = yield* ws.getConfiguredMcpServerEntries();
  const existingEntry = configured[args.name];
  if (matchesInlineMcpEntry({ existing: configured[args.name], lockEntry, env })) {
    yield* emitNoOpOutcome("mcps.add", {
      planName: "Add MCP server",
      planDescription: `Configure ${args.name} and sync agent MCP configs`,
      message: `MCP server ${args.name} is already configured`,
    });
    return;
  }

  const plan = makePlan(args.name, [
    {
      label: `Configure ${args.name}`,
      readiness: "ready",
      run: ws
        .setMcpServer({
          name: args.name,
          lockEntry,
          versionRange: Option.none(),
          env,
          enabled: true,
        })
        .pipe(
          Effect.as({
            result: "success",
            message: `Configured ${args.name}`,
            artifact: configArtifact(ws.scope, existingEntry === undefined ? "created" : "updated"),
          } satisfies JobStepResult),
        ),
    },
    syncStep(ws, fs, path, args.name),
  ]);

  const resolution = yield* previewOrApplyLocalPlan(plan, {
    preview: args.preview,
    yes: args.yes,
    acceptedPolicies: args.force ? ["accept-warnings"] : [],
  });
  yield* emitPlanResolutionResult("mcps.add", resolution);
});

const addConfig = {
  name: Argument.string("name").pipe(Argument.withDescription("Inline MCP server name")),
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
  force: acceptWarningsFlag,
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
  Command.withDescription("Add an inline MCP server"),
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
  ]),
);
