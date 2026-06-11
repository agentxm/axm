import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import { Argument, Command, Flag } from "effect/unstable/cli";
import { withAuthGuard } from "@agentxm/client-core/unstable/auth";
import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import { forceFlag, previewFlag, yesFlag } from "@agentxm/client-core/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { DEFAULT_WORKSPACE_SCOPE } from "@agentxm/client-core/unstable/workspace";

import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import type { PublishCommandOperation } from "@agentxm/client-core/unstable/commands";
import {
  publishCommand as publishCommandOp,
  COMMAND_MANIFEST_FILENAME,
  commandContentFilename,
} from "@agentxm/client-core/unstable/commands";
import type { PlannedJobStep } from "@agentxm/client-core/unstable/plan";
import {
  REGISTRY_EXTENSIONS_DIR,
  fqnInvalidErrorToAppError,
  parseFqn,
  parseRegistrySourcePatternParts,
} from "@agentxm/client-core/unstable/extensions";
import { emitNoOpOutcome } from "../shared/no-op-output.js";
import {
  resolvePublishExtensionInputs,
  resolvePublishTargetRegistry,
  type TargetRegistry,
} from "../shared/publish-resolution.js";
import { runMultiExtensionPublishPlan } from "../shared/publish-runner.js";
import { AuthLayer, withRuntime, withWorkspace } from "../../runtime.js";
import { toJobStepResult } from "../shared/job-step-result.js";

export interface CommandsPublishHandlerArgs {
  readonly extensions: ReadonlyArray<string>;
  readonly registry: Option.Option<string>;
  readonly yes: boolean;
  readonly force: boolean;
  readonly preview: boolean;
}

/**
 * Handles the `axm commands publish` command.
 */
export const handleCommandsPublish = Effect.fn("CommandsPublish.handle")(function* (
  args: CommandsPublishHandlerArgs,
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

const publishEffect = Effect.fn("CommandsPublish.publishEffect")(function* (
  args: CommandsPublishHandlerArgs,
  targetRegistry: TargetRegistry,
) {
  const ws = yield* WorkspaceMutations;
  const path = yield* Path.Path;
  const fs = yield* FileSystem.FileSystem;

  const base = ws.baseDir;

  // Step 1: Separate glob patterns from literal inputs, expand globs
  const resolvedNames = yield* resolvePublishExtensionInputs(args.extensions, (ws) =>
    Effect.map(ws.records.getInstalledCommands(), (installedCommands) =>
      Object.keys(installedCommands),
    ),
  );
  if (resolvedNames.length === 0) {
    yield* emitNoOpOutcome("commands.publish", {
      planName: "Publish command",
      message: "No commands published.",
    });
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
          code: "not_found",
          detail: `Command "${name}" is not installed in this workspace`,
          suggestions: [
            {
              description: "Use a fully-qualified command name, or create the command first.",
              cmd: `axm commands new ${name}`,
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
          detail: `Command "${name}" cannot be published from a non-registry source`,
          suggestions: [
            {
              description:
                "Only commands sourced from a registry namespace (`@owner/commands/name`) can be published.",
            },
          ],
        }),
      );
    }
    return Effect.succeed(`${parts.owner}/commands/${name}`);
  });

  // Step 3: Validate each extension (command.json and the command content file
  // (`${name}.md`) must both exist)
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
            detail: `Missing extension name for parsed FQN ${fqn.owner}/commands/${fqn.name}`,
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
            code: "not_found",
            detail: `Managed extension not found: ${extName}`,
            suggestions: [
              {
                description: "Only managed extensions in `.axm/extensions/` can be published.",
                cmd: "axm commands new <name>",
              },
            ],
          });
        }

        const manifestPath = path.join(extensionDir, COMMAND_MANIFEST_FILENAME);
        const manifestExists = yield* fs
          .exists(manifestPath)
          .pipe(Effect.orElseSucceed(() => false));

        if (!manifestExists) {
          return yield* makeAppError({
            code: "not_found",
            detail: `Missing manifest: ${COMMAND_MANIFEST_FILENAME}`,
            suggestions: [
              {
                description: `Ensure the extension has a valid ${COMMAND_MANIFEST_FILENAME} manifest.`,
              },
            ],
          });
        }

        const contentFilename = commandContentFilename(fqn.name);
        const commandMdPath = path.join(extensionDir, "src", contentFilename);
        const commandMdExists = yield* fs
          .exists(commandMdPath)
          .pipe(Effect.orElseSucceed(() => false));

        if (!commandMdExists) {
          return yield* makeAppError({
            code: "not_found",
            detail: `Missing ${contentFilename}`,
            suggestions: [
              {
                description: `Ensure the extension has a ${contentFilename} in its src/ directory.`,
              },
            ],
          });
        }
      });
    });
  });

  yield* runMultiExtensionPublishPlan({
    command: "commands.publish",
    planName: "Publish command",
    subjectType: "command",
    sourceKind: "registry",
    noun: "command",
    pluralNoun: "commands",
    preflightType: "command",
    extensionNames,
    targetRegistry,
    yes: args.yes,
    force: args.force,
    preview: args.preview,
    makeStep: (extName): PlannedJobStep => {
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
    },
  });
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
    Flag.withDescription("Bypass version-order warnings; published versions remain immutable"),
  ),
  preview: previewFlag.pipe(Flag.withDescription("Show what would be published without uploading")),
} as const;

export const publishCommand = Command.make(
  "publish",
  publishConfig,
  ({ extensions, registry, yes, force, preview }) => {
    const program = handleCommandsPublish({
      extensions: [...extensions],
      registry,
      yes,
      force,
      preview,
    }).pipe(withWorkspace(DEFAULT_WORKSPACE_SCOPE));
    return program.pipe(Effect.provide(AuthLayer), withRuntime("commands publish"));
  },
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
