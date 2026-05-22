import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Option from "effect/Option";
import { Argument, Command, Flag } from "effect/unstable/cli";
import * as Effect from "effect/Effect";
import { CodingAgentRepository } from "@agentxm/client-core/unstable/agents";
import { CliRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { enableMcpServer } from "@agentxm/client-core/unstable/mcps";
import {
  previewOrApplyPlan,
  type Plan,
  type PlannedJobStep,
} from "@agentxm/client-core/unstable/plan";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import { forceFlag, previewFlag, yesFlag } from "@agentxm/client-core/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { emitPlanResolutionResult } from "../../json-output.js";
import { scopeFlag } from "../../cli-flags.js";
import { withRuntime, withWorkspace } from "../../runtime.js";

export const handleEnableMcpServer = Effect.fn("EnableMcpServer.handle")(function* (args: {
  readonly name: string;
  readonly yes: boolean;
  readonly force: boolean;
  readonly preview: boolean;
}) {
  const ws = yield* WorkspaceMutations;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const renderer = yield* CliRenderer;
  const agentRepo = yield* CodingAgentRepository;

  const step: PlannedJobStep = {
    readiness: "ready",
    label: args.name,
    run: enableMcpServer({ name: "enable-mcp-server", args: { serverName: args.name } }).pipe(
      Effect.provideService(WorkspaceMutations, ws),
      Effect.provideService(FileSystem.FileSystem, fs),
      Effect.provideService(Path.Path, path),
      Effect.provideService(CliRenderer, renderer),
      Effect.provideService(CodingAgentRepository, agentRepo),
    ),
  };
  const plan: Plan = {
    _tag: "Plan",
    name: "Enable MCP server",
    description: Option.some(`Enable ${args.name}`),
    jobs: [{ concurrency: 1 as const, steps: [step] }],
  };
  const resolution = yield* previewOrApplyPlan(plan, args);
  yield* emitPlanResolutionResult("mcps.enable", resolution);
});

const enableConfig = {
  name: Argument.string("name").pipe(Argument.withDescription("Name of the MCP server to enable")),
  scope: scopeFlag.pipe(
    Flag.withDescription("Enable in project (default) or user-level configuration"),
  ),
  yes: yesFlag.pipe(Flag.withDescription("Enable without confirmation")),
  force: forceFlag,
  preview: previewFlag,
} as const;

export const enableCommand = Command.make(
  "enable",
  enableConfig,
  ({ name, scope, yes, force, preview }) =>
    handleEnableMcpServer({ name, yes, force, preview }).pipe(
      withWorkspace(scope),
      withRuntime("mcps enable"),
    ),
).pipe(
  withArgvTracking(enableConfig),
  Command.withDescription("Enable a disabled MCP server"),
  Command.withExamples([
    { command: "axm mcps enable context", description: "Enable an MCP server" },
    {
      command: "axm mcps enable context --preview",
      description: "Preview enabling an MCP server",
    },
  ]),
);
