import { Argument, Command, Flag } from "effect/unstable/cli";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import {
  syncInlineMcpServerToAgents,
  type McpServerSyncTarget,
} from "@agentxm/extension-workspace";
import { makeAppError } from "../../app-error/index.js";
import { acceptWarningsFlag } from "../../cli-flags/index.js";
import { withArgvTracking } from "../../cli-runtime/index.js";
import {
  previewCapabilityFlag,
  previewableCapabilities,
  withCommandCapabilities,
} from "../shared/command-capabilities.js";
import { count } from "../../screen/index.js";
import {
  operationPresentation,
  type JobStepArtifact,
  type JobStepResult,
  type Plan,
  type PlannedJobStep,
} from "@agentxm/workspace-operations";
import { WorkspaceMutations, type WorkspaceMutationsService } from "@agentxm/workspace-state";
import { emitOperationResolution } from "../../operation-output.js";
import { scopeFlag } from "../../cli-flags/scope-flag.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { previewOrApplyLocalPlan } from "../shared/local-plan.js";
import { emitNoOpOutcome } from "../shared/no-op-output.js";
import { withOperationLifecycle } from "../shared/operation-lifecycle.js";
import { workspaceSettingsPath } from "../shared/workspace-display-paths.js";
import {
  makeInlineMcpDefinition,
  matchesInlineMcpEntry,
  parseInlineMcpEnv,
  parseInlineMcpHeaders,
  validateInlineMcpRemoteUrl,
} from "@agentxm/workspace-configuration";
import { failureToStepFailure, toAppError } from "../../app-error/conversions.js";
import { configurationFailureToAppError } from "../../feature-errors.js";

export interface McpsAddArgs {
  readonly name: string;
  readonly command: Option.Option<string>;
  readonly url: Option.Option<string>;
  readonly env: ReadonlyArray<string>;
  readonly header: ReadonlyArray<string>;
  readonly force: boolean;
  readonly preview: boolean;
}

const syncStep = (
  ws: WorkspaceMutationsService,
  fs: FileSystem.FileSystem,
  path: Path.Path,
  name: string,
): PlannedJobStep => ({
  label: `Sync ${name} to configured agents`,
  readiness: "ready",
  run: Effect.gen(function* () {
    const entries = yield* ws.getConfiguredMcpServerEntries().pipe(Effect.mapError(toAppError));
    const entry = entries[name];
    if (entry === undefined) {
      return { result: "success", message: `${name} is not configured` } satisfies JobStepResult;
    }
    const agentIds = yield* ws.getConfiguredAgents().pipe(Effect.mapError(toAppError));
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
  }).pipe(Effect.mapError(failureToStepFailure)),
});

const configArtifact = (
  scope: "project" | "user",
  change: JobStepArtifact["change"],
): JobStepArtifact => ({
  path: workspaceSettingsPath(scope),
  scope,
  change,
  targets: [{ path: workspaceSettingsPath(scope), change }],
});

const makePlan = (name: string, steps: ReadonlyArray<PlannedJobStep>): Plan => ({
  _tag: "Plan",
  name: "Add MCP server",
  description: Option.some(`Configure ${name} and sync agent MCP configs`),
  presentation: operationPresentation(
    { imperative: "configure", past: "Configured", gerund: "Configuring" },
    "mcp-server",
  ),
  jobs: [{ concurrency: 1, steps }],
});

export const handleMcpsAdd = (args: McpsAddArgs) =>
  withOperationLifecycle(
    {
      command: "mcps.add",
      mode: args.preview ? "preview" : "apply",
      planName: "Add MCP server",
    },
    handleMcpsAddBody(args),
  );

const handleMcpsAddBody = Effect.fn("Mcps.add")(function* (args: McpsAddArgs) {
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
  const env = yield* parseInlineMcpEnv(args.env).pipe(
    Effect.mapError(configurationFailureToAppError),
  );
  const headers = yield* parseInlineMcpHeaders(args.header).pipe(
    Effect.mapError(configurationFailureToAppError),
  );
  if (Option.isSome(args.url)) {
    yield* validateInlineMcpRemoteUrl(args.url.value).pipe(
      Effect.mapError(configurationFailureToAppError),
    );
  }
  const definition = yield* makeInlineMcpDefinition(
    { command: Option.getOrUndefined(args.command), url: Option.getOrUndefined(args.url) },
    headers,
  ).pipe(Effect.mapError(configurationFailureToAppError));
  const configured = yield* ws.getConfiguredMcpServerEntries().pipe(Effect.mapError(toAppError));
  const existingEntry = configured[args.name];
  if (
    matchesInlineMcpEntry({
      existing: configured[args.name],
      definition,
      env,
    })
  ) {
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
        .setMcpServerEntry(args.name, {
          kind: "inline",
          ...(definition.type === "stdio"
            ? { command: definition.command, args: definition.args }
            : { url: definition.url, headers: definition.headers }),
          env,
          enabled: true,
        })
        .pipe(Effect.mapError(toAppError))
        .pipe(
          Effect.mapError(failureToStepFailure),
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
    acceptedPolicies: args.force ? ["accept-warnings"] : [],
  });
  yield* emitOperationResolution("mcps.add", resolution);
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
  force: acceptWarningsFlag,
  preview: previewCapabilityFlag("Show what would change without applying"),
} as const;

export const addCommand = Command.make(
  "add",
  addConfig,
  ({ name, scope, command, url, env, header, force, preview }) =>
    handleMcpsAdd({
      name,
      command,
      url,
      env,
      header,
      force,
      preview,
    }).pipe(withWorkspace(scope), withRuntime("mcps add")),
).pipe(
  withArgvTracking(addConfig),
  withCommandCapabilities(previewableCapabilities("workspace")),
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
