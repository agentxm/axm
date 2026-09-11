import { Argument, Command, Flag } from "effect/unstable/cli";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { AddInlineMcpServer } from "@agentxm/workspace-configuration";
import { acceptWarningsFlag } from "../../cli-flags/index.js";
import { withArgvTracking } from "../../cli-runtime/index.js";
import {
  previewCapabilityFlag,
  previewableCapabilities,
  withCommandCapabilities,
} from "../shared/command-capabilities.js";
import { emitOperationResolution } from "../../operation-output.js";
import { scopeFlag } from "../../cli-flags/scope-flag.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { makePlanExecution } from "../shared/confirmation-recovery.js";
import { emitNoOpOutcome } from "../shared/no-op-output.js";
import { withOperationLifecycle } from "../../operation-lifecycle.js";
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

const PLAN_NAME = "Add MCP server";

export const handleMcpsAdd = (args: McpsAddArgs) =>
  withOperationLifecycle(
    { command: "mcps.add", mode: args.preview ? "preview" : "apply", planName: PLAN_NAME },
    handleMcpsAddBody(args),
  );

const handleMcpsAddBody = Effect.fn("Mcps.add")(function* (args: McpsAddArgs) {
  const candidate = yield* AddInlineMcpServer.prepare({
    name: args.name,
    ...(Option.isSome(args.command) ? { command: args.command.value } : {}),
    ...(Option.isSome(args.url) ? { url: args.url.value } : {}),
    env: args.env,
    headers: args.header,
  }).pipe(Effect.mapError(configurationFailureToAppError));

  if (candidate._tag === "Unchanged") {
    yield* emitNoOpOutcome("mcps.add", {
      planName: PLAN_NAME,
      planDescription: `Configure ${args.name} and sync agent MCP configs`,
      message: candidate.message,
    });
    return;
  }

  const execution = yield* makePlanExecution(
    { preview: args.preview },
    { command: [], arguments: [] },
    args.force ? ["accept-warnings"] : [],
  );
  const resolution = yield* AddInlineMcpServer.previewOrApply(candidate, execution).pipe(
    Effect.mapError(configurationFailureToAppError),
  );
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
