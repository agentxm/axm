import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Argument, Command, Flag } from "effect/unstable/cli";
import { withAuthGuard } from "@agentxm/client-core/unstable/auth";
import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import { CliRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { forceFlag, previewFlag, yesFlag } from "@agentxm/client-core/unstable/cli-flags";
import {
  setCommandSemanticProperties,
  summarizeCommandOutcome,
  withArgvTracking,
} from "@agentxm/client-core/unstable/cli-runtime";
import { DEFAULT_WORKSPACE_SCOPE } from "@agentxm/client-core/unstable/workspace";

import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import type { PublishCommandOperation } from "@agentxm/client-core/unstable/commands";
import {
  publishCommand as publishCommandOp,
  COMMAND_MANIFEST_FILENAME,
  commandContentFilename,
} from "@agentxm/client-core/unstable/commands";
import type { Plan, PlannedJobStep } from "@agentxm/client-core/unstable/plan";
import { previewOrApplyPlan } from "@agentxm/client-core/unstable/plan";
import {
  REGISTRY_EXTENSIONS_DIR,
  parseFqn,
  parseRegistrySourcePatternParts,
} from "@agentxm/client-core/unstable/extensions";
import { expandGlobs, isGlobPattern } from "@agentxm/client-core/unstable/utils";
import {
  emitNoOpResult,
  emitPlanResolutionResult,
  planResolutionToSummary,
} from "../../json-output.js";
import { checkPublishVersionPreflight } from "../shared/publish-preflight.js";
import { withAuthRuntime, withWorkspace } from "../../runtime.js";
import { toJobStepResult } from "./job-step-result.js";

export interface CommandsPublishHandlerArgs {
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
    const renderer = yield* CliRenderer;

    const globPatterns = extensions.filter((e) => isGlobPattern(e));
    const literalInputs = extensions.filter((e) => !isGlobPattern(e));

    if (globPatterns.length === 0) return literalInputs;

    const installedCommands = yield* ws.records.getInstalledCommands();
    const installedNames = Object.keys(installedCommands);
    const globMatches = expandGlobs(globPatterns, installedNames);

    if (globPatterns.length === extensions.length && globMatches.length === 0) {
      yield* renderer.warn(`No commands matched pattern "${globPatterns.join(", ")}"`);
      yield* renderer.success("Nothing to publish.");
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
          code: "REGISTRY_SOURCES_FAILED",
          what: `Failed to get registry sources: ${e._tag}`,
          cause: e,
        }),
      ),
    );

    const [defaultRegistry] = registrySources;
    if (defaultRegistry === undefined) {
      return yield* makeAppError({
        code: "NO_REGISTRY_CONFIGURED",
        what: "No registry sources configured",
        howToFix: "Run the registry guard first.",
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
          code: "PUBLISH_COMMAND_REGISTRY_LOOKUP_FAILED",
          what: `Failed to lookup registry source "${registry.value}"`,
          cause: e,
        }),
      ),
    );

    if (Option.isNone(namedRegistry) || namedRegistry.value.type !== "registry") {
      return yield* makeAppError({
        code: "PUBLISH_COMMAND_REGISTRY_NOT_FOUND",
        what: `Registry source "${registry.value}" not found or not a registry source`,
      });
    }

    return {
      registryName: registry.value,
      registryUrl: namedRegistry.value.location.href,
    } satisfies TargetRegistry;
  });

/**
 * Handles the `axm commands publish` command.
 */
export const handleCommandsPublish = Effect.fn("CommandsPublish.handle")(function* (
  args: CommandsPublishHandlerArgs,
) {
  const targetRegistry = yield* resolveTargetRegistry(args.registry);
  yield* withAuthGuard(publishEffect(args, targetRegistry), {
    registryUrl: targetRegistry.registryUrl,
  });
});

const publishEffect = Effect.fn("CommandsPublish.publishEffect")(function* (
  args: CommandsPublishHandlerArgs,
  targetRegistry: TargetRegistry,
) {
  const ws = yield* WorkspaceMutations;
  const path = yield* Path.Path;
  const fs = yield* FileSystem.FileSystem;
  const renderer = yield* CliRenderer;

  const base = ws.baseDir;

  yield* renderer.info("axm commands publish");

  // Step 1: Separate glob patterns from literal inputs, expand globs
  const resolvedNames = yield* resolveExtensionInputs(args.extensions);
  if (resolvedNames.length === 0) {
    if (
      yield* emitNoOpResult("commands.publish", {
        planName: "Publish command",
        message: "Nothing to publish.",
      })
    ) {
      return;
    }
    yield* renderer.info("Nothing to publish.");
    return;
  }

  // Step 2: Resolve each name to FQN. Bare names look up the installed
  // command entry and parse its `source` to derive the owner.
  const configuredCommands = yield* ws.records.getConfiguredCommands();
  const extensionNames = yield* Effect.forEach(resolvedNames, (name) => {
    if (name.startsWith("@") && name.includes("/")) return Effect.succeed(name);

    const entry = configuredCommands[name];
    if (entry === undefined) {
      return Effect.fail(
        makeAppError({
          code: "EXTENSION_NOT_FOUND",
          what: `Command "${name}" is not installed in this workspace`,
          howToFix:
            "Use the fully-qualified name `@owner/commands/name`, or run `axm commands new ${name}` to create it first.",
        }),
      );
    }
    const parts = parseRegistrySourcePatternParts(entry.source);
    if (parts === undefined || parts.owner === undefined) {
      return Effect.fail(
        makeAppError({
          code: "EXTENSION_NOT_FOUND",
          what: `Command "${name}" cannot be published from a non-registry source`,
          howToFix:
            "Only commands sourced from a registry namespace (`@owner/commands/name`) can be published.",
        }),
      );
    }
    return Effect.succeed(`${parts.owner}/commands/${name}`);
  });

  // Step 3: Validate each extension (command.json and the command content file
  // (`${name}.md`) must both exist)
  yield* renderer.withSpinner(
    "Validating extensions...",
    () =>
      Effect.gen(function* () {
        const fqns = yield* Effect.forEach(extensionNames, (extName) => parseFqn(extName));

        yield* Effect.forEach(fqns, (fqn, i) => {
          const extName = extensionNames[i];
          if (extName === undefined) {
            return Effect.fail(
              makeAppError({
                code: "EXTENSION_NOT_FOUND",
                what: `Missing extension name for parsed FQN ${fqn.owner}/commands/${fqn.name}`,
              }),
            );
          }
          const extensionDir = path.join(
            base,
            REGISTRY_EXTENSIONS_DIR,
            fqn.owner,
            "commands",
            fqn.name,
          );

          return Effect.gen(function* () {
            const extensionDirExists = yield* fs
              .exists(extensionDir)
              .pipe(Effect.orElseSucceed(() => false));

            if (!extensionDirExists) {
              return yield* makeAppError({
                code: "EXTENSION_NOT_FOUND",
                what: `Managed extension not found: ${extName}`,
                howToFix:
                  "Only managed extensions (in .axm/extensions/) can be published. Create with `axm commands new` first.",
              });
            }

            const manifestPath = path.join(extensionDir, COMMAND_MANIFEST_FILENAME);
            const manifestExists = yield* fs
              .exists(manifestPath)
              .pipe(Effect.orElseSucceed(() => false));

            if (!manifestExists) {
              return yield* makeAppError({
                code: "MISSING_MANIFEST",
                what: `Missing manifest: ${COMMAND_MANIFEST_FILENAME}`,
                howToFix: `Ensure the extension has a valid ${COMMAND_MANIFEST_FILENAME} manifest.`,
              });
            }

            const contentFilename = commandContentFilename(fqn.name);
            const commandMdPath = path.join(extensionDir, "src", contentFilename);
            const commandMdExists = yield* fs
              .exists(commandMdPath)
              .pipe(Effect.orElseSucceed(() => false));

            if (!commandMdExists) {
              return yield* makeAppError({
                code: "MISSING_COMMAND_MD",
                what: `Missing ${contentFilename}`,
                howToFix: `Ensure the extension has a ${contentFilename} in its src/ directory.`,
              });
            }
          });
        });
      }),
    { successMessage: `Validated ${extensionNames.length} extension(s)` },
  );

  yield* renderer.withSpinner(
    "Checking published versions...",
    () =>
      Effect.forEach(
        extensionNames,
        (extName) =>
          checkPublishVersionPreflight({
            fqn: extName,
            type: "command",
            registryName: targetRegistry.registryName,
            registryUrl: targetRegistry.registryUrl,
            force: args.force,
          }),
        { concurrency: "unbounded" },
      ),
    { successMessage: "Version check complete" },
  );

  // Step 4: Build multi-step plan with inline run closures
  const steps: ReadonlyArray<PlannedJobStep> = extensionNames.map((extName): PlannedJobStep => {
    const op = {
      name: "publish-command",
      args: { name: extName, registryName: targetRegistry.registryName },
    } satisfies PublishCommandOperation;

    return {
      readiness: "ready",
      label: `Publish ${extName}`,
      run: publishCommandOp(op).pipe(
        Effect.map(toJobStepResult),
        Effect.provideService(WorkspaceMutations, ws),
        Effect.provideService(FileSystem.FileSystem, fs),
        Effect.provideService(Path.Path, path),
      ),
    };
  });

  const description =
    extensionNames.length === 1
      ? `Publish ${extensionNames[0]} to registry "${targetRegistry.registryName}"`
      : `Publish ${extensionNames.length} commands to registry "${targetRegistry.registryName}"`;

  const plan: Plan = {
    _tag: "Plan",
    name: "Publish command",
    description: Option.some(description),
    jobs: [{ steps, concurrency: 1 as const }],
  };

  const resolvedPlan = yield* previewOrApplyPlan(plan, {
    yes: args.yes,
    force: args.force,
    preview: args.preview,
  });

  const failedStepDetails =
    resolvedPlan._tag === "ExecutedPlan"
      ? resolvedPlan.jobs
          .flatMap((job) => job.steps)
          .flatMap((step) =>
            step.result.result === "error"
              ? [`${step.label}: ${step.result.error.what} (${step.result.error.code})`]
              : [],
          )
      : [];

  if (failedStepDetails.length > 0) {
    return yield* makeAppError({
      code: "PUBLISH_PLAN_FAILED",
      what: `Failed to publish ${failedStepDetails.length} command${failedStepDetails.length === 1 ? "" : "s"}`,
    });
  }

  yield* setCommandSemanticProperties(
    summarizeCommandOutcome(
      planResolutionToSummary(resolvedPlan, {
        subjectType: "command",
        sourceKind: "registry",
      }),
    ),
  );
  yield* emitPlanResolutionResult("commands.publish", resolvedPlan);

  if (resolvedPlan._tag === "ExecutedPlan") {
    yield* renderer.success("Done");
  }
});

const publishConfig = {
  extensions: Argument.string("extensions").pipe(
    Argument.withDescription(
      "Extension names or glob patterns (@owner/commands/name, bare name, or glob)",
    ),
    Argument.atLeast(1),
  ),
  registry: Flag.string("registry").pipe(
    Flag.withDescription("Target a specific named registry instead of the default"),
    Flag.optional,
  ),
  yes: yesFlag.pipe(Flag.withDescription("Publish without confirmation")),
  force: forceFlag.pipe(
    Flag.withDescription("Publish even if version already exists in the registry"),
  ),
  preview: previewFlag.pipe(Flag.withDescription("Show what would be published without uploading")),
} as const;

export const publishCommand = Command.make(
  "publish",
  publishConfig,
  ({ extensions, registry, yes, force, preview }) =>
    handleCommandsPublish({ extensions: [...extensions], registry, yes, force, preview }).pipe(
      withWorkspace(DEFAULT_WORKSPACE_SCOPE),
      withAuthRuntime("commands publish"),
    ),
).pipe(
  withArgvTracking(publishConfig),
  Command.withDescription("Publish command extensions to a registry"),
  Command.withExamples([
    {
      command: "axm commands publish @acme/commands/my-cmd",
      description: "Publish a command to the registry",
    },
    {
      command: "axm commands publish my-cmd --registry local",
      description: "Publish to a specific registry",
    },
  ]),
);
