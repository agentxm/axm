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
  type Plan,
  type PlannedJobStep,
} from "@agentxm/client-core/unstable/plan";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import { scopeFlag } from "../../cli-flags.js";
import { emitPublishResult } from "../../json-output.js";
import { AuthLayer, withRuntime, withWorkspace } from "../../runtime.js";
import { resolveManifestVersionInfo } from "../shared/extension-version.js";
import { withPublishArtifact } from "../shared/publish-artifact.js";
import { checkPublishVersionPreflight } from "../shared/publish-preflight.js";
import { skipExistingFlag } from "../shared/publish-flags.js";
import { recoverPublishConflictAsSkipExisting } from "../shared/publish-skip-existing.js";
import { publishSuccessRender } from "../shared/publish-success.js";

export const handlePublishHook = Effect.fn("PublishHook.handle")(function* (args: {
  readonly name: string;
  readonly registry: string;
  readonly yes: boolean;
  readonly preview: boolean;
  readonly skipExisting?: boolean;
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
  const registrySource = target.value;
  const preflightDecision = yield* checkPublishVersionPreflight({
    fqn: args.name,
    type: "hook",
    registryName: args.registry,
    registryUrl: registrySource.location.href,
    force: false,
    existingVersionPolicy: args.skipExisting === true ? "skip" : "error",
  });
  const versionInfo = yield* resolveManifestVersionInfo(args.name, "hook");

  if (preflightDecision.action === "skip") {
    const message = `Skipped ${preflightDecision.fqn}@${preflightDecision.identity.version}: version already published`;
    const emitted = yield* emitPublishResult("hooks.publish", {
      mode: args.preview ? "preview" : "apply",
      results: [
        {
          owner: preflightDecision.identity.owner,
          type: preflightDecision.identity.type,
          name: preflightDecision.identity.name,
          version: preflightDecision.identity.version,
          action: "skip",
          reason: preflightDecision.reason,
          ...(args.preview ? {} : { status: "success" }),
          message,
        },
      ],
    });
    if (emitted) return;
    yield* renderer.success(message);
    return;
  }

  if (args.preview) {
    const emitted = yield* emitPublishResult("hooks.publish", {
      mode: "preview",
      results: [
        {
          owner: preflightDecision.identity.owner,
          type: preflightDecision.identity.type,
          name: preflightDecision.identity.name,
          version: preflightDecision.identity.version,
          action: "publish",
        },
      ],
    });
    if (emitted) return;
  }

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
        Effect.catch(
          args.skipExisting === true
            ? recoverPublishConflictAsSkipExisting({
                registryUrl: registrySource.location.href,
                target: preflightDecision,
                scope: ws.scope,
              })
            : (error) => Effect.fail(error),
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
    const emitted = yield* emitPublishResult(
      "hooks.publish",
      {
        mode: args.preview ? "preview" : "apply",
        results: [
          {
            owner: preflightDecision.identity.owner,
            type: preflightDecision.identity.type,
            name: preflightDecision.identity.name,
            version: preflightDecision.identity.version,
            action: "publish",
            ...(resolution._tag === "ExecutedPlan" ? { status: "success" } : {}),
            ...(success?.message !== undefined ? { message: success.message } : {}),
          },
        ],
      },
      {
        ...(success?.suggestions !== undefined ? { suggestions: success.suggestions } : {}),
      },
    );
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
  skipExisting: skipExistingFlag,
} as const;

export const publishCommand = Command.make(
  "publish",
  publishConfig,
  ({ name, registry, scope, yes, preview, skipExisting }) =>
    handlePublishHook({ name, registry, yes, preview, skipExisting }).pipe(
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
