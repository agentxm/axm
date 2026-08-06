import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Option from "effect/Option";
import { Argument, Command, Flag } from "effect/unstable/cli";
import * as Effect from "effect/Effect";
import { CodingAgentRepository } from "@agentxm/client-core/unstable/agents";
import { CliRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { disableMcpServer } from "@agentxm/client-core/unstable/mcps";
import {
  previewOrApplyPlan,
  type Plan,
  type PlannedJobStep,
} from "@agentxm/client-core/unstable/plan";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import { forceFlag, previewFlag, yesFlag } from "@agentxm/client-core/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { scopeFlag } from "../../cli-flags.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { emitAppliedPlanOutcome } from "../shared/applied-plan-output.js";
import { emitNoOpOutcome } from "../shared/no-op-output.js";

export const handleDisableMcpServer = Effect.fn("DisableMcpServer.handle")(function* (args: {
  readonly name: string;
  readonly yes: boolean;
  readonly force: boolean;
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
    jobs: [{ concurrency: 1 as const, steps: [step] }],
  };
  const resolution = yield* previewOrApplyPlan(plan, {
    yes: args.yes,
    preview: args.preview,
    displayApplied: false,
  });
  yield* emitAppliedPlanOutcome({
    command: "mcps.disable",
    headline: `Disabled MCP server ${args.name}`,
    resolution,
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
  force: forceFlag,
  preview: previewFlag,
} as const;

export const disableCommand = Command.make(
  "disable",
  disableConfig,
  ({ name, scope, yes, force, preview }) =>
    handleDisableMcpServer({ name, yes, force, preview }).pipe(
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
