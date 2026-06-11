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
import type { PublishSkillOperation } from "@agentxm/client-core/unstable/skills";
import { publishSkill } from "@agentxm/client-core/unstable/skills";
import type { PlannedJobStep } from "@agentxm/client-core/unstable/plan";
import {
  REGISTRY_EXTENSIONS_DIR,
  fqnInvalidErrorToAppError,
  parseFqn,
  parseRegistrySourcePatternParts,
} from "@agentxm/client-core/unstable/extensions";
import { MANIFEST_FILENAME } from "@agentxm/client-core/unstable/skills";
import { emitNoOpOutcome } from "../shared/no-op-output.js";
import {
  resolvePublishExtensionInputs,
  resolvePublishTargetRegistry,
  type TargetRegistry,
} from "../shared/publish-resolution.js";
import { runMultiExtensionPublishPlan } from "../shared/publish-runner.js";
import { toJobStepResult } from "../shared/job-step-result.js";
import { AuthLayer, withRuntime, withWorkspace } from "../../runtime.js";
import { ADD_REGISTRY_SOURCE, SCAFFOLD_MANAGED_SKILL } from "../suggested-actions.js";

export interface PublishHandlerArgs {
  readonly extensions: ReadonlyArray<string>;
  readonly registry: Option.Option<string>;
  readonly yes: boolean;
  readonly force: boolean;
  readonly preview: boolean;
}

/**
 * Handles the `axm skills publish` command.
 */
export const handlePublish = Effect.fn("Publish.handle")(function* (args: PublishHandlerArgs) {
  const targetRegistry = yield* resolvePublishTargetRegistry(args.registry, {
    noRegistryError: {
      code: "usage",
      detail: "No registry sources configured",
      recover: "Add a registry source.",
      cmd: ADD_REGISTRY_SOURCE.cmd,
    },
  });
  if (args.preview) {
    yield* publishEffect(args, targetRegistry);
    return;
  }

  yield* withAuthGuard(publishEffect(args, targetRegistry), {
    registryUrl: targetRegistry.registryUrl,
  });
});

const publishEffect = Effect.fn("Publish.publishEffect")(function* (
  args: PublishHandlerArgs,
  targetRegistry: TargetRegistry,
) {
  const ws = yield* WorkspaceMutations;
  const path = yield* Path.Path;
  const fs = yield* FileSystem.FileSystem;

  const base = ws.baseDir;

  // Step 1: Separate glob patterns from literal inputs, expand globs
  const resolvedNames = yield* resolvePublishExtensionInputs(args.extensions, (ws) =>
    Effect.map(ws.records.getInstalledSkills(), (installedSkills) => Object.keys(installedSkills)),
  );
  if (resolvedNames.length === 0) {
    yield* emitNoOpOutcome("skills.publish", {
      planName: "Publish skill",
      message: "No skills matched. No skills published.",
    });
    return;
  }

  // Step 2: Resolve each name to FQN. Bare names look up the installed skill
  // entry and parse its `source` to derive the owner.
  const configuredSkills = yield* ws.records.getConfiguredSkills();
  const extensionNames = yield* Effect.forEach(resolvedNames, (name) => {
    if (name.startsWith("@") && name.includes("/")) return Effect.succeed(name);

    const entry = configuredSkills[name];
    if (entry === undefined) {
      return Effect.fail(
        makeAppError({
          code: "not_found",
          detail: `Skill "${name}" is not installed in this workspace`,
          suggestions: [
            {
              description: "Use the fully-qualified name `@owner/skills/name`",
            },
            SCAFFOLD_MANAGED_SKILL,
          ],
        }),
      );
    }

    const parts = parseRegistrySourcePatternParts(entry.source);
    if (parts === undefined || parts.owner === undefined) {
      return Effect.fail(
        makeAppError({
          code: "not_found",
          detail: `Skill "${name}" cannot be published from a non-registry source`,
          recover:
            "Only skills sourced from a registry namespace (`@owner/skills/name`) can be published",
        }),
      );
    }

    return Effect.succeed(`${parts.owner}/skills/${name}`);
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
            detail: `Missing extension name for parsed FQN ${fqn.owner}/skills/${fqn.name}`,
          }),
        );
      }
      const extensionDir = path.join(base, REGISTRY_EXTENSIONS_DIR, fqn.owner, "skills", fqn.name);

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
                description: "Only managed extensions in `.axm/extensions/` can be published",
              },
              SCAFFOLD_MANAGED_SKILL,
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
            recover: `Ensure the extension has a valid \`${MANIFEST_FILENAME}\` manifest`,
          });
        }
      });
    });
  });

  yield* runMultiExtensionPublishPlan({
    command: "skills.publish",
    planName: "Publish skill",
    subjectType: "skill",
    sourceKind: "registry",
    noun: "skill",
    pluralNoun: "skills",
    preflightType: "skill",
    extensionNames,
    targetRegistry,
    yes: args.yes,
    force: args.force,
    preview: args.preview,
    makeStep: (extName): PlannedJobStep => {
      const op = {
        name: "publish-skill",
        args: { name: extName, registryName: targetRegistry.registryName },
      } satisfies PublishSkillOperation;

      return {
        readiness: "ready",
        label: `Publish ${extName}`,
        run: publishSkill(op).pipe(
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
      "Extension names or glob patterns (@owner/skills/name, bare name, or glob)",
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
    const program = handlePublish({
      extensions: [...extensions],
      registry,
      yes,
      force,
      preview,
    }).pipe(withWorkspace(DEFAULT_WORKSPACE_SCOPE));
    return program.pipe(Effect.provide(AuthLayer), withRuntime("skills publish"));
  },
).pipe(
  withArgvTracking(publishConfig),
  Command.withDescription("Publish extensions to a registry"),
  Command.withExamples([
    {
      command: "axm skills publish @acme/skills/code-review",
      description: "Publish a skill to the registry",
    },
    {
      command: "axm skills publish effect-* commit",
      description: "Publish multiple skills matching a pattern",
    },
    {
      command: "axm skills publish code-review --registry local",
      description: "Publish to a specific registry",
    },
  ]),
);
