import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { Argument, Command, Flag } from "effect/unstable/cli";
import { withAuthGuard } from "@agentxm/client-core/unstable/auth";
import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import { previewFlag, Verbosity, yesFlag } from "@agentxm/client-core/unstable/cli-flags";
import { CliRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { publishHook } from "@agentxm/client-core/unstable/hooks";
import {
  previewOrApplyPlan,
  type JobStepArtifact,
  type JobStepResult,
  type Plan,
  type PlannedJobStep,
} from "@agentxm/client-core/unstable/plan";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import { scopeFlag } from "../../cli-flags.js";
import { emitPlanResolutionResult } from "../../json-output.js";
import { AuthLayer, withRuntime, withWorkspace } from "../../runtime.js";
import { resolveManifestVersionInfo } from "../shared/extension-version.js";
import { checkPublishVersionPreflight } from "../shared/publish-preflight.js";
import { publishSuccessRender } from "../shared/publish-success.js";

const publishArtifact = (args: {
  readonly path: string;
  readonly scope: JobStepArtifact["scope"];
  readonly version: string;
}): JobStepArtifact => ({
  path: args.path,
  scope: args.scope,
  version: args.version,
  change: "created",
  targets: [{ path: args.path, change: "created" }],
});

const withPublishArtifact = (args: {
  readonly result: JobStepResult;
  readonly fqn: string;
  readonly scope: JobStepArtifact["scope"];
  readonly version: string;
}): JobStepResult => {
  if (args.result.result === "error") return args.result;

  const publishedPath = args.result.links?.html ?? `${args.fqn}@${args.version}`;
  return {
    ...args.result,
    artifact: publishArtifact({
      path: publishedPath,
      scope: args.scope,
      version: args.version,
    }),
  } satisfies JobStepResult;
};

export const handlePublishHook = Effect.fn("PublishHook.handle")(function* (args: {
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
  if (Option.isNone(target) || target.value.type !== "registry") {
    return yield* makeAppError({
      code: "not_found",
      detail: `Registry source "${args.registry}" not found or not a registry source`,
    });
  }
  yield* checkPublishVersionPreflight({
    fqn: args.name,
    type: "hook",
    registryName: args.registry,
    registryUrl: target.value.location.href,
    force: false,
  });
  const versionInfo = yield* resolveManifestVersionInfo(args.name, "hook");

  const runPublishPlan = Effect.gen(function* () {
    const step: PlannedJobStep = {
      readiness: "ready",
      label: `Publish ${versionInfo.fqn}`,
      run: publishHook({
        name: "publish-hook",
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
      name: "Publish hooks",
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
    const emitted = yield* emitPlanResolutionResult("hooks.publish", resolution, {
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
    registryUrl: target.value.location.href,
  });
});

const publishConfig = {
  name: Argument.string("name").pipe(Argument.withDescription("Hook FQN (@owner/hooks/name)")),
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
    handlePublishHook({ name, registry, yes, preview }).pipe(
      withWorkspace(scope),
      Effect.provide(AuthLayer),
      withRuntime("hooks publish"),
    ),
).pipe(
  withArgvTracking(publishConfig),
  Command.withDescription("Publish a hook"),
  Command.withExamples([
    {
      command: "axm hooks publish @acme/hooks/block-secrets",
      description: "Publish a hook",
    },
    {
      command: "axm hooks publish @acme/hooks/block-secrets --preview",
      description: "Preview publishing a hook",
    },
  ]),
);
