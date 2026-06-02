import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { Argument, Command, Flag } from "effect/unstable/cli";
import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import { previewFlag, yesFlag } from "@agentxm/client-core/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { publishHook } from "@agentxm/client-core/unstable/hooks";
import {
  previewOrApplyPlan,
  type Plan,
  type PlannedJobStep,
} from "@agentxm/client-core/unstable/plan";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import { scopeFlag } from "../../cli-flags.js";
import { emitPlanResolutionResult } from "../../json-output.js";
import { withAuthRuntime, withWorkspace } from "../../runtime.js";
import { checkPublishVersionPreflight } from "../shared/publish-preflight.js";

export const handlePublishHook = Effect.fn("PublishHook.handle")(function* (args: {
  readonly name: string;
  readonly registry: string;
  readonly yes: boolean;
  readonly preview: boolean;
}) {
  const ws = yield* WorkspaceMutations;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
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

  const step: PlannedJobStep = {
    readiness: "ready",
    label: args.name,
    run: publishHook({
      name: "publish-hook",
      args: { name: args.name, registryName: args.registry },
    }).pipe(
      Effect.provideService(WorkspaceMutations, ws),
      Effect.provideService(FileSystem.FileSystem, fs),
      Effect.provideService(Path.Path, path),
    ),
  };
  const plan: Plan = {
    _tag: "Plan",
    name: "Publish hook",
    description: Option.some(`Publish ${args.name}`),
    jobs: [{ concurrency: 1 as const, steps: [step] }],
  };
  const resolution = yield* previewOrApplyPlan(plan, {
    yes: args.yes,
    force: false,
    preview: args.preview,
  });
  yield* emitPlanResolutionResult("hooks.publish", resolution);
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
      withAuthRuntime("hooks publish"),
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
