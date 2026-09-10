import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Option from "effect/Option";
import { Argument, Command, Flag } from "effect/unstable/cli";
import * as Effect from "effect/Effect";
import { CodingAgentRepository } from "@agentxm/extension-workspace";
import { Screen } from "../../screen/index.js";
import { enableMcpServer } from "@agentxm/extension-lifecycle";
import {
  previewOrApplyPlan,
  operationPresentation,
  type Plan,
  type PlannedJobStep,
} from "@agentxm/workspace-operations";
import { WorkspaceMutations } from "@agentxm/workspace-state";
import { withArgvTracking } from "../../cli-runtime/index.js";
import {
  previewCapabilityFlag,
  previewableCapabilities,
  withCommandCapabilities,
} from "../shared/command-capabilities.js";
import { scopeFlag } from "../../cli-flags/scope-flag.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { emitOperationResolution } from "../../operation-output.js";
import { makePublicPositionalPlanExecution } from "../shared/confirmation-recovery.js";
import { emitNoOpOutcome } from "../shared/no-op-output.js";
import { withOperationLifecycle } from "../shared/operation-lifecycle.js";
import { provideLifecycleFailureAdapter } from "../../feature-errors.js";

export const handleEnableMcpServer = (args: { readonly name: string; readonly preview: boolean }) =>
  withOperationLifecycle(
    {
      command: "mcps.enable",
      mode: args.preview ? "preview" : "apply",
      planName: "Enable MCP server",
    },
    handleEnableMcpServerBody(args),
  );

const handleEnableMcpServerBody = Effect.fn("EnableMcpServer.handle")(function* (args: {
  readonly name: string;
  readonly preview: boolean;
}) {
  const ws = yield* WorkspaceMutations;
  const configured = yield* ws.getConfiguredMcpServerEntries();
  const entry = configured[args.name];
  if (entry === undefined) {
    yield* emitNoOpOutcome("mcps.enable", {
      planName: "Enable MCP server",
      message: `MCP server "${args.name}" is not configured`,
    });
    return;
  }
  if (entry.enabled) {
    yield* emitNoOpOutcome("mcps.enable", {
      planName: "Enable MCP server",
      message: `MCP server "${args.name}" is already enabled`,
    });
    return;
  }
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const screen = yield* Screen;
  const agentRepo = yield* CodingAgentRepository;

  const step: PlannedJobStep = {
    readiness: "ready",
    label: args.name,
    run: enableMcpServer({ name: "enable-mcp-server", args: { serverName: args.name } }).pipe(
      provideLifecycleFailureAdapter,
      Effect.provideService(WorkspaceMutations, ws),
      Effect.provideService(FileSystem.FileSystem, fs),
      Effect.provideService(Path.Path, path),
      Effect.provideService(Screen, screen),
      Effect.provideService(CodingAgentRepository, agentRepo),
    ),
  };
  const plan: Plan = {
    _tag: "Plan",
    name: "Enable MCP server",
    description: Option.some(`Enable ${args.name}`),
    presentation: operationPresentation(
      { imperative: "enable", past: "Enabled", gerund: "Enabling" },
      "mcp-server",
    ),
    jobs: [{ concurrency: 1 as const, steps: [step] }],
  };
  const execution = yield* makePublicPositionalPlanExecution(args, ["mcps", "enable"], [args.name]);
  const resolution = yield* previewOrApplyPlan(plan, { execution });
  yield* emitOperationResolution("mcps.enable", resolution, {
    suggestions: [
      { description: "Inspect MCP servers", cmd: "axm mcps list" },
      { description: "Undo", cmd: `axm mcps disable ${args.name}` },
    ],
  });
});

const enableConfig = {
  name: Argument.string("name").pipe(Argument.withDescription("Name of the MCP server to enable")),
  scope: scopeFlag.pipe(
    Flag.withDescription("Enable in project (default) or user-level configuration"),
  ),
  preview: previewCapabilityFlag(),
} as const;

export const enableCommand = Command.make("enable", enableConfig, ({ name, scope, preview }) =>
  handleEnableMcpServer({ name, preview }).pipe(withWorkspace(scope), withRuntime("mcps enable")),
).pipe(
  withArgvTracking(enableConfig),
  withCommandCapabilities(previewableCapabilities("workspace")),
  Command.withDescription("Enable a disabled MCP server"),
  Command.withExamples([
    { command: "axm mcps enable context", description: "Enable an MCP server" },
    {
      command: "axm mcps enable context --preview",
      description: "Preview enabling an MCP server",
    },
  ]),
);
