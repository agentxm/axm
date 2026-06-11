import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import { withAuthGuard } from "@agentxm/client-core/unstable/auth";
import { makeAppError } from "@agentxm/client-core/unstable/app-error";

import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import type { PublishSubagentOperation } from "@agentxm/client-core/unstable/subagents";
import { publishSubagent, MANIFEST_FILENAME } from "@agentxm/client-core/unstable/subagents";
import type { PlannedJobStep } from "@agentxm/client-core/unstable/plan";
import {
  REGISTRY_EXTENSIONS_DIR,
  fqnInvalidErrorToAppError,
  parseFqn,
  parseRegistrySourcePatternParts,
} from "@agentxm/client-core/unstable/extensions";
import { emitNoOpOutcome } from "../../shared/no-op-output.js";
import {
  resolvePublishExtensionInputs,
  resolvePublishTargetRegistry,
  type TargetRegistry,
} from "../../shared/publish-resolution.js";
import { runMultiExtensionPublishPlan } from "../../shared/publish-runner.js";
import { toJobStepResult } from "../../shared/job-step-result.js";

export interface PublishHandlerArgs {
  readonly extensions: ReadonlyArray<string>;
  readonly registry: Option.Option<string>;
  readonly yes: boolean;
  readonly force: boolean;
  readonly preview: boolean;
}

/**
 * Handles the `axm subagents publish` command.
 */
export const handlePublish = Effect.fn("SubagentsPublish.handle")(function* (
  args: PublishHandlerArgs,
) {
  const targetRegistry = yield* resolvePublishTargetRegistry(args.registry);
  if (args.preview) {
    yield* publishEffect(args, targetRegistry);
    return;
  }

  yield* withAuthGuard(publishEffect(args, targetRegistry), {
    registryUrl: targetRegistry.registryUrl,
  });
});

const publishEffect = Effect.fn("SubagentsPublish.publishEffect")(function* (
  args: PublishHandlerArgs,
  targetRegistry: TargetRegistry,
) {
  const ws = yield* WorkspaceMutations;
  const path = yield* Path.Path;
  const fs = yield* FileSystem.FileSystem;

  const base = ws.baseDir;

  // Step 1: Separate glob patterns from literal inputs, expand globs
  const resolvedNames = yield* resolvePublishExtensionInputs(args.extensions, (ws) =>
    Effect.map(ws.getLockedSubagents(), (installedSubagents) => Object.keys(installedSubagents)),
  );
  if (resolvedNames.length === 0) {
    yield* emitNoOpOutcome("subagents.publish", {
      planName: "Publish subagent",
      message: "No subagents published.",
    });
    return;
  }

  // Step 2: Resolve each name to FQN. Bare names look up the installed
  // subagent entry and parse its `source` to derive the owner.
  const configuredSubagents = yield* ws.records.getConfiguredSubagents();
  const extensionNames = yield* Effect.forEach(resolvedNames, (name) => {
    if (name.startsWith("@") && name.includes("/")) return Effect.succeed(name);

    const entry = configuredSubagents[name];
    if (entry === undefined) {
      return Effect.fail(
        makeAppError({
          code: "not_found",
          detail: `Subagent "${name}" is not installed in this workspace`,
          suggestions: [
            {
              description: "Use a fully-qualified subagent name, or create the subagent first.",
              cmd: `axm subagents new ${name}`,
            },
          ],
        }),
      );
    }
    const parts = parseRegistrySourcePatternParts(entry.source);
    if (parts === undefined || parts.owner === undefined) {
      return Effect.fail(
        makeAppError({
          code: "not_found",
          detail: `Subagent "${name}" cannot be published from a non-registry source`,
          suggestions: [
            {
              description:
                "Only subagents sourced from a registry namespace (`@owner/subagents/name`) can be published.",
            },
          ],
        }),
      );
    }
    return Effect.succeed(`${parts.owner}/subagents/${name}`);
  });

  // Step 3: Validate each extension
  yield* Effect.gen(function* () {
    const fqns = yield* Effect.forEach(extensionNames, (extName) =>
      Effect.fromResult(Result.mapError(parseFqn(extName), fqnInvalidErrorToAppError)),
    );

    yield* Effect.forEach(fqns, (fqn, i) => {
      const extName = extensionNames[i];
      if (extName === undefined) {
        return Effect.fail(
          makeAppError({
            code: "not_found",
            detail: `Missing extension name for parsed FQN ${fqn.owner}/subagents/${fqn.name}`,
          }),
        );
      }
      const extensionDir = path.join(
        base,
        REGISTRY_EXTENSIONS_DIR,
        fqn.owner,
        "subagents",
        fqn.name,
      );

      return Effect.gen(function* () {
        const extensionDirExists = yield* fs
          .exists(extensionDir)
          .pipe(Effect.orElseSucceed(() => false));

        if (!extensionDirExists) {
          return yield* makeAppError({
            code: "not_found",
            detail: `Managed extension not found: ${extName}`,
            suggestions: [
              {
                description: "Only managed extensions in `.axm/extensions/` can be published.",
                cmd: "axm subagents new <name>",
              },
            ],
          });
        }

        const manifestPath = path.join(extensionDir, MANIFEST_FILENAME);
        const manifestExists = yield* fs
          .exists(manifestPath)
          .pipe(Effect.orElseSucceed(() => false));

        if (!manifestExists) {
          return yield* makeAppError({
            code: "not_found",
            detail: `Missing manifest: ${MANIFEST_FILENAME}`,
            suggestions: [
              {
                description: `Ensure the extension has a valid ${MANIFEST_FILENAME} manifest.`,
              },
            ],
          });
        }
      });
    });
  });

  yield* runMultiExtensionPublishPlan({
    command: "subagents.publish",
    planName: "Publish subagent",
    subjectType: "subagent",
    sourceKind: "registry",
    noun: "subagent",
    pluralNoun: "subagents",
    preflightType: "subagent",
    extensionNames,
    targetRegistry,
    yes: args.yes,
    force: args.force,
    preview: args.preview,
    includeSingleFailureSuggestions: true,
    makeStep: (extName): PlannedJobStep => {
      const op = {
        name: "publish-subagent",
        args: { name: extName, registryName: targetRegistry.registryName },
      } satisfies PublishSubagentOperation;

      return {
        readiness: "ready",
        label: `Publish ${extName}`,
        run: publishSubagent(op).pipe(
          Effect.map(toJobStepResult),
          Effect.provideService(WorkspaceMutations, ws),
          Effect.provideService(FileSystem.FileSystem, fs),
          Effect.provideService(Path.Path, path),
        ),
      };
    },
  });
});
