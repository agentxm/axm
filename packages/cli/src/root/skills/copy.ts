import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import { Argument, Command, Flag } from "effect/unstable/cli";

import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import { forceFlag, previewFlag, yesFlag } from "@agentxm/client-core/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import {
  REGISTRY_EXTENSIONS_DIR,
  extensionTypeToPlural,
  fqnInvalidErrorToAppError,
  formatFqn,
  parseFqn,
} from "@agentxm/client-core/unstable/extensions";
import type { JobStepResult, Plan } from "@agentxm/client-core/unstable/plan";
import { previewOrApplyPlan } from "@agentxm/client-core/unstable/plan";
import { SourceHostProviders } from "@agentxm/client-core/unstable/source-resolution";
import {
  copySkill,
  SkillManager,
  type SkillExtensionRef,
} from "@agentxm/client-core/unstable/skills";
import { parseInputPattern } from "@agentxm/client-core/unstable/sources";
import {
  WorkspaceMutations,
  resolveWorkspaceExtensionRef,
} from "@agentxm/client-core/unstable/workspace";

import { scopeFlag } from "../../cli-flags.js";
import { emitPlanResolutionResult } from "../../json-output.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { resolveSkillInstallSource } from "./install/resolve-skill-install-source.js";

export const handleCopySkill = Effect.fn("CopySkill.handle")(function* (args: {
  readonly source: string;
  readonly target: string;
  readonly from: Option.Option<string>;
  readonly yes: boolean;
  readonly force: boolean;
  readonly preview: boolean;
}) {
  const parsedTarget = yield* Effect.fromResult(
    Result.mapError(parseFqn(args.target), fqnInvalidErrorToAppError),
  );
  if (parsedTarget.type !== "skill") {
    return yield* makeAppError({
      code: "validation",
      detail: `Skill copy target must use the skills type: ${args.target}`,
    });
  }
  const parsedSource = parseInputPattern(args.source);
  if (Option.isNone(parsedSource)) {
    return yield* makeAppError({ code: "validation", detail: `Invalid source: ${args.source}` });
  }
  const source = yield* resolveSkillInstallSource(parsedSource.value);
  if (source.type === "registry" || source.type === "workspace") {
    return yield* makeAppError({
      code: "usage",
      detail: "Skill copy requires a local or git-hosted source",
    });
  }

  const providers = yield* SourceHostProviders;
  const refs = yield* Effect.scoped(
    providers.find(source, {
      names: Option.isSome(args.from) ? [args.from.value] : [],
      type: "skill",
      owner: Option.none(),
      versionRange: Option.none(),
    }),
  );
  const copyable = refs.filter(
    (ref): ref is SkillExtensionRef =>
      ref.type === "skill" && (ref.refType === "local" || ref.refType === "git-hosted"),
  );
  if (copyable.length !== 1) {
    return yield* makeAppError({
      code: "validation",
      detail:
        copyable.length === 0
          ? "No copyable skill was found in the source"
          : "The source contains multiple skills; select one with --from",
    });
  }
  const sourceRef = copyable[0];
  if (sourceRef === undefined) {
    return yield* makeAppError({ code: "internal", detail: "Resolved skill disappeared" });
  }

  const ws = yield* WorkspaceMutations;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const manager = yield* SkillManager;
  const fqn = formatFqn(parsedTarget);
  const targetDir = path.join(
    ws.baseDir,
    REGISTRY_EXTENSIONS_DIR,
    parsedTarget.owner,
    extensionTypeToPlural.skill,
    parsedTarget.name,
  );
  const exists = yield* fs.exists(targetDir).pipe(Effect.orElseSucceed(() => false));
  if (exists && !args.force) {
    return yield* makeAppError({
      code: "conflict",
      detail: `Workspace skill package already exists: ${targetDir}`,
    });
  }

  const step = {
    readiness: "ready" as const,
    label: `Copy ${fqn}`,
    run: Effect.gen(function* () {
      if (exists) yield* fs.remove(targetDir, { recursive: true });
      yield* copySkill({ name: "copy-skill", args: { ref: sourceRef, targetName: fqn } }).pipe(
        Effect.provideService(FileSystem.FileSystem, fs),
        Effect.provideService(Path.Path, path),
        Effect.provideService(WorkspaceMutations, ws),
      );
      const workspaceRef = yield* resolveWorkspaceExtensionRef({
        settingsName: parsedTarget.name,
        source: `workspace:${fqn}`,
        expectedType: "skill",
        baseDir: ws.baseDir,
        scope: ws.scope,
      }).pipe(
        Effect.provideService(FileSystem.FileSystem, fs),
        Effect.provideService(Path.Path, path),
      );
      if (workspaceRef.type !== "skill") {
        return yield* makeAppError({ code: "internal", detail: "Copied package is not a skill" });
      }
      yield* manager.materializeInstall({ ref: workspaceRef });
      yield* manager.upsertLockfileEntry({ ref: workspaceRef });
      return { result: "success", message: `Copied ${fqn}` } satisfies JobStepResult;
    }).pipe(
      Effect.mapError((cause) =>
        cause._tag === "AppError"
          ? cause
          : makeAppError({
              code: "internal",
              detail: `Could not copy skill into ${targetDir}`,
              cause,
            }),
      ),
    ),
  };
  const plan: Plan = {
    _tag: "Plan",
    name: "Copy skill for authoring",
    description: Option.some(`Copy ${args.source} into ${fqn}`),
    jobs: [{ concurrency: 1, steps: [step] }],
  };
  const resolution = yield* previewOrApplyPlan(plan, {
    yes: args.yes,
    force: args.force,
    preview: args.preview,
  });
  yield* emitPlanResolutionResult("skills.copy", resolution);
});

const config = {
  source: Argument.string("source").pipe(Argument.withDescription("Local or git-hosted source")),
  target: Argument.string("target").pipe(
    Argument.withDescription("Target FQN (@owner/skills/name)"),
  ),
  from: Flag.string("from").pipe(
    Flag.withDescription("Source skill name when the source contains more than one"),
    Flag.optional,
  ),
  scope: scopeFlag,
  yes: yesFlag,
  force: forceFlag,
  preview: previewFlag,
} as const;

export const copyCommand = Command.make("copy", config, (parsed) =>
  handleCopySkill(parsed).pipe(withWorkspace(parsed.scope), withRuntime("skills copy")),
).pipe(
  withArgvTracking(config),
  Command.withDescription("Copy a skill into workspace authorship"),
  Command.withExamples([
    {
      command: "axm skills copy ./external-skill @acme/skills/my-skill",
      description: "Copy a local skill for authoring",
    },
  ]),
);
