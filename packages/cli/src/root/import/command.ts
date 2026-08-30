import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import { Argument, Command, Flag } from "effect/unstable/cli";

import { SkillManager } from "@agentxm/extension-management/unstable/skills";
import { SubagentManager } from "@agentxm/extension-management/unstable/subagents";
import { makeAppError } from "@agentxm/extension-management/unstable/app-error";
import { previewFlag, yesFlag } from "@agentxm/extension-management/unstable/cli-flags";
import {
  credentialFreeLocatorRecoveryValue,
  publicRecoveryValue,
  recoveryPositional,
  recoverySwitch,
  withArgvTracking,
} from "@agentxm/extension-management/unstable/cli-runtime";
import {
  buildAuthoredExtensionStep,
  computePackageContentHash,
  copyExtensionDirectory,
  createCanonicalDirectory,
  importNativeExtensionPackage,
  preflightCreateOnly,
  recoverCanonicalDirectory,
} from "@agentxm/extension-management/unstable/extensions";
import {
  extensionTypeToPlural,
  formatFqn,
  parseFqn,
} from "@agentxm/extension-model/unstable/extensions";
import { fqnInvalidErrorToAppError } from "@agentxm/extension-management/unstable/app-error/conversions";
import type {
  JobStepArtifact,
  Plan,
  PlannedJobStep,
} from "@agentxm/extension-management/unstable/plan";
import {
  operationPresentation,
  previewOrApplyPlan,
} from "@agentxm/extension-management/unstable/plan";
import {
  acquireExternalSource,
  resolveSource,
} from "@agentxm/extension-management/unstable/source-resolution";
import { WorkspaceMutations } from "@agentxm/extension-management/unstable/workspace";

import { emitOperationResolution } from "../../operation-output.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { makeConfirmationRecovery, makePlanExecution } from "../shared/confirmation-recovery.js";
import { requireAuthoredOwner } from "../shared/authored-owner.js";
import { withOperationLifecycle } from "../shared/operation-lifecycle.js";
import { workspaceSettingsPath } from "../shared/workspace-display-paths.js";

type NativeImportType = "skill" | "subagent";

interface ImportHandlerArgs {
  readonly type: NativeImportType;
  readonly source: string;
  readonly target: string;
  readonly enable: boolean;
  readonly yes: boolean;
  readonly preview: boolean;
}

export const handleImport = (args: ImportHandlerArgs) =>
  withOperationLifecycle(
    {
      command: `${extensionTypeToPlural[args.type]} import`,
      mode: args.preview ? "preview" : "apply",
      planName: "Import native extension",
    },
    handleImportBody(args),
  );

const handleImportBody = Effect.fn("Import.handle")(function* (args: ImportHandlerArgs) {
  const target = yield* Effect.fromResult(
    Result.mapError(parseFqn(args.target), fqnInvalidErrorToAppError),
  );
  if (target.type !== "skill" && target.type !== "subagent") {
    return yield* makeAppError({
      code: "validation",
      detail: `Expected a ${extensionTypeToPlural[args.type]} target FQN, got ${args.target}`,
    });
  }
  if (target.type !== args.type) {
    return yield* makeAppError({
      code: "validation",
      detail: `Expected a ${extensionTypeToPlural[args.type]} target FQN, got ${args.target}`,
    });
  }
  yield* requireAuthoredOwner(target.owner);
  const group = extensionTypeToPlural[args.type];
  const ws = yield* WorkspaceMutations;
  if (ws.layout.scope !== "project") {
    return yield* makeAppError({ code: "usage", detail: "Import requires project scope" });
  }
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const source = yield* resolveSource(args.source);
  const acquired = yield* acquireExternalSource(source);
  const targetDir = path.join(ws.layout.authoredRoot(target.type), target.name);
  yield* preflightCreateOnly({
    subject: "Import target",
    name: target.name,
    configured: false,
    destinations: [targetDir],
  });

  const stagingRoot = yield* fs.makeTempDirectoryScoped({ prefix: "axm-import-" }).pipe(
    Effect.mapError((cause) =>
      makeAppError({
        code: "internal",
        detail: "Import staging directory could not be created",
        cause,
      }),
    ),
  );
  const stagedPackage = path.join(stagingRoot, "package");
  yield* importNativeExtensionPackage({
    sourcePath: acquired.directory,
    targetDir: stagedPackage,
    target,
  });
  const stagedHash = yield* computePackageContentHash(stagedPackage);
  const fqn = formatFqn(target);
  const sourceLocator = "workspace";

  let enabled: boolean;
  let markAuthored: Effect.Effect<void, ReturnType<typeof makeAppError>>;
  let finalizeAuthored: Effect.Effect<void, ReturnType<typeof makeAppError>>;
  switch (target.type) {
    case "skill": {
      const current = yield* ws.getConfiguredSkillEntries();
      enabled = args.enable || (current[target.name]?.enabled ?? false);
      markAuthored = ws.setSkillEntry(target.name, { source: sourceLocator, enabled: true });
      finalizeAuthored = ws.setSkillEntry(target.name, { source: sourceLocator, enabled });
      break;
    }
    case "subagent": {
      const current = yield* ws.getConfiguredSubagentEntries();
      enabled = args.enable || (current[target.name]?.enabled ?? false);
      markAuthored = ws.setSubagentEntry(target.name, { source: sourceLocator, enabled: true });
      finalizeAuthored = ws.setSubagentEntry(target.name, { source: sourceLocator, enabled });
      break;
    }
  }

  const artifact: JobStepArtifact = {
    path: path.relative(ws.baseDir, targetDir),
    scope: ws.scope,
    version: "0.1.0",
    change: "created",
    targets: [
      { path: path.relative(ws.baseDir, targetDir), change: "created" },
      { path: workspaceSettingsPath(ws.scope), change: "created" },
    ],
  };
  const common = {
    location: targetDir,
    versionRange: Option.none<string>(),
    label: `Import ${acquired.origin} -> ${fqn}`,
    message: `Imported ${fqn}`,
    enabled,
    allowConfiguredSourceTransition: true,
    markAuthored,
    finalizeAuthored,
    plannedArtifact: artifact,
    buildArtifact: () => Effect.succeed(artifact),
    preflight: Effect.gen(function* () {
      yield* recoverCanonicalDirectory({ baseDir: ws.baseDir, canonicalPath: targetDir });
      yield* preflightCreateOnly({
        subject: "Import target",
        name: target.name,
        configured: false,
        destinations: [targetDir],
      });
    }).pipe(
      Effect.provideService(FileSystem.FileSystem, fs),
      Effect.provideService(Path.Path, path),
    ),
    scaffold: createCanonicalDirectory({
      baseDir: ws.baseDir,
      canonicalPath: targetDir,
      subject: "Import target",
      populate: (publicationPath) =>
        copyExtensionDirectory(stagedPackage, publicationPath).pipe(
          Effect.mapError((cause) =>
            makeAppError({
              code: "internal",
              detail: `Prepared import could not be staged for ${targetDir}`,
              cause,
            }),
          ),
        ),
      validate: (publicationPath) =>
        computePackageContentHash(publicationPath).pipe(
          Effect.flatMap((currentHash) =>
            currentHash === stagedHash
              ? Effect.void
              : makeAppError({
                  code: "conflict",
                  detail: "Prepared import content changed before it could be applied",
                }),
          ),
        ),
    }).pipe(
      Effect.asVoid,
      Effect.provideService(FileSystem.FileSystem, fs),
      Effect.provideService(Path.Path, path),
    ),
  };

  let step: PlannedJobStep;
  switch (target.type) {
    case "skill":
      step = buildAuthoredExtensionStep(yield* SkillManager, {
        ...common,
        target: { type: "skill", name: target.name },
      });
      break;
    case "subagent":
      step = buildAuthoredExtensionStep(yield* SubagentManager, {
        ...common,
        target: { type: "subagent", name: target.name },
      });
      break;
  }

  const plan: Plan = {
    _tag: "Plan",
    name: "Import native extension",
    description: Option.some(
      `Losslessly convert ${acquired.origin} into ${fqn}; the native source remains unchanged and the import starts ${enabled ? "enabled" : "disabled"}`,
    ),
    presentation: operationPresentation(
      { imperative: "import", past: "Imported", gerund: "Importing" },
      target.type,
    ),
    jobs: [{ concurrency: 1, steps: [step] }],
  };
  const execution = yield* makePlanExecution(
    args,
    makeConfirmationRecovery(
      [group, "import"],
      [
        recoverySwitch("--enable", args.enable),
        recoveryPositional(credentialFreeLocatorRecoveryValue(args.source)),
        recoveryPositional(publicRecoveryValue(args.target)),
      ],
    ),
  );
  const resolution = yield* previewOrApplyPlan(plan, { execution });
  yield* emitOperationResolution(`${group} import`, resolution);
});

const config = {
  source: Argument.string("source").pipe(
    Argument.withDescription("Local or Git native extension source"),
  ),
  target: Argument.string("extension").pipe(Argument.withDescription("New managed target FQN")),
  enable: Flag.boolean("enable").pipe(
    Flag.withDescription("Enable and materialize a newly imported extension"),
    Flag.withDefault(false),
  ),
  yes: yesFlag,
  preview: previewFlag,
} as const;

const makeNativeImportCommand = (type: NativeImportType) => {
  const group = extensionTypeToPlural[type];
  const noun = type === "skill" ? "skill" : "subagent";
  return Command.make("import", config, (parsed) =>
    handleImport({ ...parsed, type }).pipe(
      Effect.scoped,
      withWorkspace("project"),
      withRuntime(`${group} import`),
    ),
  ).pipe(
    withArgvTracking(config),
    Command.withDescription(
      `Convert a native ${noun} into a project-workspace AXM ${noun} package`,
    ),
    Command.withExamples([
      {
        command:
          type === "skill"
            ? "axm skills import ./review-skill @me/skills/review --enable"
            : "axm subagents import .claude/agents/reviewer.md @me/subagents/reviewer",
        description: `Import a native ${noun} without modifying the original source`,
      },
    ]),
  );
};

export const skillsImportCommand = makeNativeImportCommand("skill");
export const subagentsImportCommand = makeNativeImportCommand("subagent");
