import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Option from "effect/Option";
import { Argument, Command, Flag } from "effect/unstable/cli";
import * as Effect from "effect/Effect";
import { publishMcpServer } from "@agentxm/client-core/unstable/mcps";
import {
  previewOrApplyPlan,
  type Plan,
  type PlannedJobStep,
} from "@agentxm/client-core/unstable/plan";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import { previewFlag, yesFlag } from "@agentxm/client-core/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { emitPlanResolutionResult } from "../../json-output.js";
import { scopeFlag } from "../../cli-flags.js";
import { withAuthRuntime, withWorkspace } from "../../runtime.js";

export const handlePublishMcpServer = Effect.fn("PublishMcpServer.handle")(function* (args: {
  readonly name: string;
  readonly registry: string;
  readonly yes: boolean;
  readonly preview: boolean;
}) {
  const ws = yield* WorkspaceMutations;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const step: PlannedJobStep = {
    readiness: "ready",
    label: args.name,
    run: publishMcpServer({
      name: "publish-mcp-server",
      args: { name: args.name, registryName: args.registry },
    }).pipe(
      Effect.provideService(WorkspaceMutations, ws),
      Effect.provideService(FileSystem.FileSystem, fs),
      Effect.provideService(Path.Path, path),
    ),
  };
  const plan: Plan = {
    _tag: "Plan",
    name: "Publish MCP server",
    description: Option.some(`Publish ${args.name}`),
    jobs: [{ concurrency: 1 as const, steps: [step] }],
  };
  const resolution = yield* previewOrApplyPlan(plan, {
    yes: args.yes,
    force: false,
    preview: args.preview,
  });
  yield* emitPlanResolutionResult("mcps.publish", resolution);
});

const publishConfig = {
  name: Argument.string("name").pipe(Argument.withDescription("MCP server FQN (@owner/mcps/name)")),
  registry: Flag.string("registry").pipe(
    Flag.withDescription("Registry source name"),
    Flag.withDefault("default"),
  ),
  scope: scopeFlag,
  yes: yesFlag,
  preview: previewFlag,
} as const;

export const publishCommand = Command.make(
  "publish",
  publishConfig,
  ({ name, registry, scope, yes, preview }) =>
    handlePublishMcpServer({ name, registry, yes, preview }).pipe(
      withWorkspace(scope),
      withAuthRuntime("mcps publish"),
    ),
).pipe(
  withArgvTracking(publishConfig),
  Command.withDescription("Publish an MCP server"),
  Command.withExamples([
    {
      command: "axm mcps publish @acme/mcps/context",
      description: "Publish an MCP server",
    },
    {
      command: "axm mcps publish @acme/mcps/context --preview",
      description: "Preview publishing an MCP server",
    },
  ]),
);
