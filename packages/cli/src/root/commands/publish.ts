/**
 * Publish command handler -- Effect-based orchestration for `axm commands publish`.
 *
 * Publishes a managed command extension from `.axm/extensions/` to a target registry:
 * 1. Resolve extension name (bare name -> owner from settings)
 * 2. Validate managed extension exists (command.json + COMMAND.md)
 * 3. Sync COMMAND.md frontmatter fields to manifest
 * 4. Build plan with a single PublishCommandOperation
 * 5. Execute via resolvePlan
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Argument, Command, Flag } from "effect/unstable/cli";
import { withAuthGuard } from "@axm.sh/core/unstable/auth";
import { makeAppError } from "@axm.sh/core/unstable/app-error";
import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { forceFlag, previewFlag, yesFlag } from "@axm.sh/core/unstable/cli-flags";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";
import { DEFAULT_WORKSPACE_SCOPE } from "@axm.sh/core/unstable/workspace";
import { authCommandMeta, annotateCommandMeta, withCommandRuntime } from "../../command-meta.js";

import { Workspace } from "@axm.sh/core/unstable/workspace";
import type { PublishCommandOperation } from "@axm.sh/core/unstable/commands";
import {
  publishCommand as publishCommandOp,
  COMMAND_MANIFEST_FILENAME,
} from "@axm.sh/core/unstable/commands";
import type { Plan, PlannedJobStep } from "@axm.sh/core/unstable/workspace";
import { resolvePlan } from "@axm.sh/core/unstable/workspace";
import { REGISTRY_EXTENSIONS_DIR, parseFqn } from "@axm.sh/core/unstable/extensions";
import { expandGlobs, isGlobPattern } from "@axm.sh/core/unstable/utils";
import { emitNoOpResult, emitPlanResolutionResult } from "../../json-output.js";
import { withWorkspace } from "../../runtime.js";
import { toJobStepResult } from "./job-step-result.js";

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const COMMAND_MD_FILENAME = "COMMAND.md";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Arguments for the commands publish handler.
 */
export interface CommandsPublishHandlerArgs {
  /** Extension names, FQNs, or glob patterns. */
  readonly extensions: ReadonlyArray<string>;
  /** Named registry source to publish to. None = default/first configured. */
  readonly registry: Option.Option<string>;
  /** Auto-accept confirmation prompts. */
  readonly yes: boolean;
  /** Override constraints that would cause failure. */
  readonly force: boolean;
  /** Display plan without applying. */
  readonly preview: boolean;
}

interface TargetRegistry {
  readonly registryName: string;
  readonly registryUrl: string;
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const resolveExtensionInputs = (extensions: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const ws = yield* Workspace;
    const renderer = yield* CliRenderer;

    const globPatterns = extensions.filter((e) => isGlobPattern(e));
    const literalInputs = extensions.filter((e) => !isGlobPattern(e));

    if (globPatterns.length === 0) return literalInputs;

    const installedCommands = yield* ws.getInstalledCommands();
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
    const ws = yield* Workspace;
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

// -----------------------------------------------------------------------------
// Main Handler
// -----------------------------------------------------------------------------

/**
 * Handles the `axm commands publish` command.
 */
export const handleCommandsPublish = Effect.fn("CommandsPublish.handle")(function* (
  args: CommandsPublishHandlerArgs,
) {
  const targetRegistry = yield* resolveTargetRegistry(args.registry);
  yield* withAuthGuard(publishEffect(args, targetRegistry), {
    yes: args.yes,
    registryUrl: targetRegistry.registryUrl,
  });
});

const publishEffect = Effect.fn("CommandsPublish.publishEffect")(function* (
  args: CommandsPublishHandlerArgs,
  targetRegistry: TargetRegistry,
) {
  const ws = yield* Workspace;
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

  // Step 2: Resolve each name to FQN
  const extensionNames = yield* Effect.forEach(resolvedNames, (name) =>
    name.startsWith("@") && name.includes("/")
      ? Effect.succeed(name)
      : ws.getConfiguredProfile().pipe(
          Effect.map((owner) => `${owner}/commands/${name}`),
          Effect.mapError((e) =>
            makeAppError({
              code: "NAMESPACE_RESOLUTION_FAILED",
              what: `Failed to resolve owner: ${e._tag}`,
              howToFix: "Configure an owner in your settings with `axm init`.",
              cause: e,
            }),
          ),
        ),
  );

  // Step 3: Validate each extension (both command.json and COMMAND.md must exist)
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
                details: [`Expected at: ${extensionDir}`],
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
                details: [`Expected at: ${manifestPath}`],
                howToFix: `Ensure the extension has a valid ${COMMAND_MANIFEST_FILENAME} manifest.`,
              });
            }

            const commandMdPath = path.join(extensionDir, "src", COMMAND_MD_FILENAME);
            const commandMdExists = yield* fs
              .exists(commandMdPath)
              .pipe(Effect.orElseSucceed(() => false));

            if (!commandMdExists) {
              return yield* makeAppError({
                code: "MISSING_COMMAND_MD",
                what: `Missing ${COMMAND_MD_FILENAME}`,
                details: [`Expected at: ${commandMdPath}`],
                howToFix: `Ensure the extension has a ${COMMAND_MD_FILENAME} in its src/ directory.`,
              });
            }
          });
        });
      }),
    { successMessage: `Validated ${extensionNames.length} extension(s)` },
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
        Effect.provideService(Workspace, ws),
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

  const resolvedPlan = yield* resolvePlan(plan, {
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
      details: failedStepDetails,
    });
  }

  yield* emitPlanResolutionResult("commands.publish", resolvedPlan);

  if (resolvedPlan._tag === "ExecutedPlan") {
    yield* renderer.success("Done");
  }
});

// -----------------------------------------------------------------------------
// Command
// -----------------------------------------------------------------------------

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
const commandMeta = authCommandMeta("commands publish", { json: true });

export const publishCommand = Command.make(
  "publish",
  publishConfig,
  ({ extensions, registry, yes, force, preview }) =>
    handleCommandsPublish({ extensions: [...extensions], registry, yes, force, preview }).pipe(
      withWorkspace(DEFAULT_WORKSPACE_SCOPE),
      withCommandRuntime(commandMeta),
    ),
).pipe(
  withArgvTracking(publishConfig),
  annotateCommandMeta(commandMeta),
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
    { command: "", description: "See also: commands new" },
  ]),
);
