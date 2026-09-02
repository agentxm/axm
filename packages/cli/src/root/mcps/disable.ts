import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Option from "effect/Option";
import { Argument, Command, Flag } from "effect/unstable/cli";
import * as Effect from "effect/Effect";
import { CodingAgentRepository } from "@agentxm/extension-workspace";
import { CliRenderer } from "../../cli-renderer/index.js";
import { disableMcpServer } from "@agentxm/extension-lifecycle";
import {
  previewOrApplyPlan,
  operationPresentation,
  type Plan,
  type PlannedJobStep,
} from "@agentxm/workspace-operations";
import { WorkspaceMutations } from "@agentxm/workspace-state";
import { previewFlag, yesFlag } from "../../cli-flags/index.js";
import { withArgvTracking } from "../../cli-runtime/index.js";
import { scopeFlag } from "../../cli-flags/scope-flag.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { emitOperationResolution } from "../../operation-output.js";
import { makePublicPositionalPlanExecution } from "../shared/confirmation-recovery.js";
import { emitNoOpOutcome } from "../shared/no-op-output.js";
import { withOperationLifecycle } from "../shared/operation-lifecycle.js";
import { provideLifecycleFailureAdapter } from "../../feature-errors.js";

export const handleDisableMcpServer = (args: {
  readonly name: string;
  readonly yes: boolean;
  readonly preview: boolean;
}) =>
  withOperationLifecycle(
    {
      command: "mcps.disable",
      mode: args.preview ? "preview" : "apply",
      planName: "Disable MCP server",
    },
    handleDisableMcpServerBody(args),
  );

const handleDisableMcpServerBody = Effect.fn("DisableMcpServer.handle")(function* (args: {
  readonly name: string;
  readonly yes: boolean;
  readonly preview: boolean;
}) {
  const ws = yield* WorkspaceMutations;
  const configured = yield* ws.getConfiguredMcpServerEntries();
  const entry = configured[args.name];
  if (entry === undefined) {
    yield* emitNoOpOutcome("mcps.disable", {
      planName: "Disable MCP server",
      message: `MCP server "${args.name}" is not configured`,
    });
    return;
  }
  if (!entry.enabled) {
    yield* emitNoOpOutcome("mcps.disable", {
      planName: "Disable MCP server",
      message: `MCP server "${args.name}" is already disabled`,
    });
    return;
  }
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const renderer = yield* CliRenderer;
  const agentRepo = yield* CodingAgentRepository;

  const step: PlannedJobStep = {
    readiness: "ready",
    label: args.name,
    run: disableMcpServer({ name: "disable-mcp-server", args: { serverName: args.name } }).pipe(
      provideLifecycleFailureAdapter,
      Effect.provideService(WorkspaceMutations, ws),
      Effect.provideService(FileSystem.FileSystem, fs),
      Effect.provideService(Path.Path, path),
      Effect.provideService(CliRenderer, renderer),
      Effect.provideService(CodingAgentRepository, agentRepo),
    ),
  };
  const plan: Plan = {
    _tag: "Plan",
    name: "Disable MCP server",
    description: Option.some(`Disable ${args.name}`),
    presentation: operationPresentation(
      { imperative: "disable", past: "Disabled", gerund: "Disabling" },
      "mcp-server",
    ),
    jobs: [{ concurrency: 1 as const, steps: [step] }],
  };
  const execution = yield* makePublicPositionalPlanExecution(
    args,
    ["mcps", "disable"],
    [args.name],
  );
  const resolution = yield* previewOrApplyPlan(plan, { execution });
  yield* emitOperationResolution("mcps.disable", resolution, {
    suggestions: [
      { description: "Inspect MCP servers", cmd: "axm mcps list" },
      { description: "Undo", cmd: `axm mcps enable ${args.name}` },
    ],
  });
});

const disableConfig = {
  name: Argument.string("name").pipe(Argument.withDescription("Name of the MCP server to disable")),
  scope: scopeFlag.pipe(
    Flag.withDescription("Disable in project (default) or user-level configuration"),
  ),
  yes: yesFlag.pipe(Flag.withDescription("Disable without confirmation")),
  preview: previewFlag,
} as const;

export const disableCommand = Command.make(
  "disable",
  disableConfig,
  ({ name, scope, yes, preview }) =>
    handleDisableMcpServer({ name, yes, preview }).pipe(
      withWorkspace(scope),
      withRuntime("mcps disable"),
    ),
).pipe(
  withArgvTracking(disableConfig),
  Command.withDescription("Disable an MCP server"),
  Command.withExamples([
    { command: "axm mcps disable context", description: "Disable an MCP server" },
    {
      command: "axm mcps disable context --preview",
      description: "Preview disabling an MCP server",
    },
  ]),
);
