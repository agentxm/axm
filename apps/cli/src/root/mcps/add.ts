import { withParameterDefault, withParameterDescription } from "../../cli-parameters.js";
import { Argument, Command, Flag } from "effect/cli";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { makeAppError } from "../../app-error/index.js";
import { AddInlineMcpServer } from "@agentxm/workspace-features/configuration";
import { acceptWarningsFlag } from "../../cli-flags/index.js";
import { withArgvTracking } from "../../cli-runtime/index.js";
import {
  previewCapabilityFlag,
  previewableCapabilities,
  withCommandCapabilities,
} from "../shared/command-capabilities.js";
import { emitNoOpOutcome, emitOperationResolution } from "../../operation-output.js";
import { scopeFlag } from "../../cli-flags/scope-flag.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { makePlanInvocation } from "../shared/confirmation-recovery.js";
import { withOperationLifecycle } from "../../operation-lifecycle.js";
import { failureToAppError } from "../../app-error/conversions.js";

export interface McpsAddArgs {
  readonly name: string;
  readonly connection: Option.Option<string>;
  readonly transport: Option.Option<"stdio" | "streamable-http" | "sse">;
  readonly arg: ReadonlyArray<string>;
  readonly cwd: Option.Option<string>;
  readonly headerEnv: ReadonlyArray<string>;
  readonly nativeOauth: boolean;
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
  const connection: unknown = Option.isSome(args.connection)
    ? yield* Effect.try({
        try: () => JSON.parse(args.connection.pipe(Option.getOrElse(() => ""))),
        catch: () =>
          makeAppError({ code: "usage", detail: "--connection requires a JSON connection object" }),
      })
    : undefined;
  const candidate = yield* AddInlineMcpServer.prepare({
    ...(connection === undefined ? {} : { connection }),
    ...(Option.isSome(args.transport) ? { transport: args.transport.value } : {}),
    args: args.arg,
    ...(Option.isSome(args.cwd) ? { cwd: args.cwd.value } : {}),
    headerEnv: args.headerEnv,
    ...(args.nativeOauth ? { auth: { type: "native-oauth" } as const } : {}),
    name: args.name,
    ...(Option.isSome(args.command) ? { command: args.command.value } : {}),
    ...(Option.isSome(args.url) ? { url: args.url.value } : {}),
    env: args.env,
    headers: args.header,
  }).pipe(Effect.mapError(failureToAppError));

  if (candidate._tag === "Unchanged") {
    yield* emitNoOpOutcome({
      planName: PLAN_NAME,
      planDescription: `Configure ${args.name} and sync agent MCP configs`,
      message: candidate.message,
    });
    return;
  }

  const { execution, recovery } = yield* makePlanInvocation(
    { preview: args.preview },
    { command: [], arguments: [] },
    args.force ? ["accept-warnings"] : [],
  );
  const resolution = yield* AddInlineMcpServer.previewOrApply(candidate, execution).pipe(
    Effect.mapError(failureToAppError),
  );
  yield* emitOperationResolution(resolution, { recovery });
});

const addConfig = {
  name: Argument.String("name").pipe(withParameterDescription("Name of the MCP server to add")),
  scope: scopeFlag,
  connection: Flag.String("connection").pipe(
    Flag.optional,
    withParameterDescription(
      "JSON connection object with env and template values; excludes per-field connection flags",
    ),
  ),
  transport: Flag.Literals("transport", ["stdio", "streamable-http", "sse"]).pipe(
    Flag.optional,
    withParameterDescription(
      "Connection transport, inferred from --command or --url; required when the URL serves SSE",
    ),
  ),
  arg: Flag.String("arg").pipe(
    Flag.atLeast(0),
    withParameterDescription("One literal process argument; repeat in invocation order"),
  ),
  cwd: Flag.String("cwd").pipe(
    Flag.optional,
    withParameterDescription("Working directory; relative paths use the selected scope root"),
  ),
  headerEnv: Flag.String("header-env").pipe(
    Flag.atLeast(0),
    withParameterDescription("Native environment header binding NAME=ENV_NAME"),
  ),
  nativeOauth: Flag.Boolean("native-oauth").pipe(
    withParameterDefault(false),
    withParameterDescription("Use the native MCP host's OAuth; excludes an Authorization header"),
  ),
  command: Flag.optional(Flag.String("command")).pipe(
    withParameterDescription("Single literal executable, such as npx"),
  ),
  url: Flag.optional(Flag.String("url")).pipe(
    withParameterDescription("Inline remote MCP server URL"),
  ),
  env: Flag.String("env").pipe(
    withParameterDescription("Host environment reference NAME, or literal KEY=VALUE"),
    Flag.atLeast(0),
  ),
  header: Flag.String("header").pipe(
    withParameterDescription("Remote header as NAME=VALUE"),
    Flag.atLeast(0),
  ),
  force: acceptWarningsFlag,
  preview: previewCapabilityFlag(),
} as const;

export const addCommand = Command.make("add", addConfig, ({ scope, ...args }) =>
  handleMcpsAdd(args).pipe(withWorkspace(scope), withRuntime("mcps add")),
).pipe(
  withArgvTracking(addConfig),
  withCommandCapabilities(previewableCapabilities("workspace")),
  Command.withDescription("Add an inline MCP server"),
  Command.withExamples([
    {
      command:
        "axm mcps add linear --command npx --arg=-y --arg=linear-mcp-server --env LINEAR_API_KEY",
      description: "Add an inline stdio MCP server",
    },
    {
      command:
        "axm mcps add sentry --transport sse --url https://mcp.sentry.dev/sse --native-oauth",
      description: "Add an inline remote MCP server",
    },
  ]),
);
