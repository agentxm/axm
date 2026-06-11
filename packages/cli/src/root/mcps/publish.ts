import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Option from "effect/Option";
import { Argument, Command, Flag } from "effect/unstable/cli";
import * as Effect from "effect/Effect";
import { withAuthGuard } from "@agentxm/client-core/unstable/auth";
import { publishMcpServer } from "@agentxm/client-core/unstable/mcps";
import {
  previewOrApplyPlan,
  type Plan,
  type PlannedJobStep,
} from "@agentxm/client-core/unstable/plan";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import { previewFlag, Verbosity, yesFlag } from "@agentxm/client-core/unstable/cli-flags";
import { CliRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import { emitPlanResolutionResult } from "../../json-output.js";
import { scopeFlag } from "../../cli-flags.js";
import { resolveManifestVersionInfo } from "../shared/extension-version.js";
import { withPublishArtifact } from "../shared/publish-artifact.js";
import { checkPublishVersionPreflight } from "../shared/publish-preflight.js";
import { publishSuccessRender } from "../shared/publish-success.js";
import { AuthLayer, withRuntime, withWorkspace } from "../../runtime.js";

export const handlePublishMcpServer = Effect.fn("PublishMcpServer.handle")(function* (args: {
  readonly name: string;
  readonly registry: string;
  readonly yes: boolean;
  readonly preview: boolean;
}) {
  const ws = yield* WorkspaceMutations;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const renderer = yield* CliRenderer;
  const verbosity = yield* Verbosity;
  const target = yield* ws.getConfiguredSourceByName(args.registry);
  if (Option.isNone(target)) {
    return yield* makeAppError({
      code: "not_found",
      detail: `Registry source "${args.registry}" not found or not a registry source`,
    });
  }
  const source = target.value;
  if (source.type !== "registry") {
    return yield* makeAppError({
      code: "not_found",
      detail: `Registry source "${args.registry}" not found or not a registry source`,
    });
  }
  yield* checkPublishVersionPreflight({
    fqn: args.name,
    type: "mcp-server",
    registryName: args.registry,
    registryUrl: source.location.href,
    force: false,
  });
  const versionInfo = yield* resolveManifestVersionInfo(args.name, "mcp-server");

  const runPublishPlan = Effect.gen(function* () {
    const step: PlannedJobStep = {
      readiness: "ready",
      label: `Publish ${versionInfo.fqn}`,
      run: publishMcpServer({
        name: "publish-mcp-server",
        args: { name: versionInfo.fqn, registryName: args.registry },
      }).pipe(
        Effect.map((result) =>
          withPublishArtifact({
            result,
            fqn: versionInfo.fqn,
            scope: ws.scope,
            version: versionInfo.version,
          }),
        ),
        Effect.provideService(WorkspaceMutations, ws),
        Effect.provideService(FileSystem.FileSystem, fs),
        Effect.provideService(Path.Path, path),
      ),
    };
    const plan: Plan = {
      _tag: "Plan",
      name: "Publish MCP server",
      description: Option.some(`Publish ${versionInfo.fqn} to registry "${args.registry}"`),
      jobs: [{ concurrency: 1 as const, steps: [step] }],
    };
    const resolution = yield* previewOrApplyPlan(plan, {
      yes: args.yes,
      force: false,
      preview: args.preview,
      displayApplied: false,
    });
    const success =
      resolution._tag === "ExecutedPlan" ? publishSuccessRender(resolution) : undefined;
    const emitted = yield* emitPlanResolutionResult("mcps.publish", resolution, {
      ...(success?.suggestions !== undefined ? { suggestions: success.suggestions } : {}),
    });
    if (emitted) return;

    if (success !== undefined) {
      yield* renderer.success(
        success.message,
        verbosity.level === "quiet"
          ? undefined
          : {
              ...(success.suggestions !== undefined ? { suggestions: success.suggestions } : {}),
            },
      );
    }
  });

  if (args.preview) {
    yield* runPublishPlan;
    return;
  }

  yield* withAuthGuard(runPublishPlan, {
    registryUrl: source.location.href,
  });
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
      Effect.provide(AuthLayer),
      withRuntime("mcps publish"),
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
