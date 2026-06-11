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
import { expandGlobs, isGlobPattern } from "@agentxm/client-core/unstable/utils";
import { checkPublishVersionPreflight } from "../../shared/publish-preflight.js";
import { emitNoOpOutcome } from "../../shared/no-op-output.js";
import {
  publishOperationResultToJobStepResult,
  runMultiExtensionPublishPlan,
} from "../../shared/multi-extension-publish-runner.js";

export interface PublishHandlerArgs {
  readonly extensions: ReadonlyArray<string>;
  readonly registry: Option.Option<string>;
  readonly yes: boolean;
  readonly force: boolean;
  readonly preview: boolean;
}

interface TargetRegistry {
  readonly registryName: string;
  readonly registryUrl: string;
}

const resolveExtensionInputs = (extensions: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;

    const globPatterns = extensions.filter((e) => isGlobPattern(e));
    const literalInputs = extensions.filter((e) => !isGlobPattern(e));

    if (globPatterns.length === 0) return literalInputs;

    const installedSubagents = yield* ws.getLockedSubagents();
    const installedNames = Object.keys(installedSubagents);
    const globMatches = expandGlobs(globPatterns, installedNames);

    if (globPatterns.length === extensions.length && globMatches.length === 0) {
      return [];
    }

    const seen = new Set<string>(globMatches);
    return [
      ...globMatches,
      ...literalInputs.filter((lit) => {
        if (seen.has(lit)) return false;
        seen.add(lit);
        return true;
      }),
    ];
  });

const resolveTargetRegistry = (registry: Option.Option<string>) =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const registrySources = yield* ws.getRegistrySourceHosts().pipe(
      Effect.mapError((e) =>
        makeAppError({
          code: "internal",
          detail: `Failed to get registry sources: ${e._tag}`,
          cause: e,
        }),
      ),
    );

    const [defaultRegistry] = registrySources;
    if (defaultRegistry === undefined) {
      return yield* makeAppError({
        code: "usage",
        detail: "No registry sources configured",
        suggestions: [{ description: "Run the registry guard first." }],
      });
    }

    if (Option.isNone(registry)) {
      return {
        registryName: defaultRegistry.name,
        registryUrl: defaultRegistry.location.href,
      } satisfies TargetRegistry;
    }

    const namedRegistry = yield* ws.getConfiguredSourceByName(registry.value).pipe(
      Effect.mapError((e) =>
        makeAppError({
          code: "internal",
          detail: `Failed to lookup registry source "${registry.value}"`,
          cause: e,
        }),
      ),
    );

    if (Option.isNone(namedRegistry) || namedRegistry.value.type !== "registry") {
      return yield* makeAppError({
        code: "not_found",
        detail: `Registry source "${registry.value}" not found or not a registry source`,
      });
    }

    return {
      registryName: registry.value,
      registryUrl: namedRegistry.value.location.href,
    } satisfies TargetRegistry;
  });

/**
 * Handles the `axm subagents publish` command.
 */
export const handlePublish = Effect.fn("SubagentsPublish.handle")(function* (
  args: PublishHandlerArgs,
) {
  const targetRegistry = yield* resolveTargetRegistry(args.registry);
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
  const resolvedNames = yield* resolveExtensionInputs(args.extensions);
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

  yield* Effect.forEach(
    extensionNames,
    (extName) =>
      checkPublishVersionPreflight({
        fqn: extName,
        type: "subagent",
        registryName: targetRegistry.registryName,
        registryUrl: targetRegistry.registryUrl,
        force: args.force,
      }),
    { concurrency: "unbounded" },
  );

  yield* runMultiExtensionPublishPlan({
    commandName: "subagents.publish",
    planName: "Publish subagent",
    subjectType: "subagent",
    extensionNames,
    registryName: targetRegistry.registryName,
    singularLabel: "subagent",
    pluralLabel: "subagents",
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
          Effect.map(publishOperationResultToJobStepResult),
          Effect.provideService(WorkspaceMutations, ws),
          Effect.provideService(FileSystem.FileSystem, fs),
          Effect.provideService(Path.Path, path),
        ),
      };
    },
  });
});
