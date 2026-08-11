import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import { Argument, Command, Flag } from "effect/unstable/cli";

import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import { previewFlag, yesFlag } from "@agentxm/client-core/unstable/cli-flags";
import { CliRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import {
  credentialFreeLocatorRecoveryValue,
  publicRecoveryValue,
  recoveryOption,
  recoveryPositional,
  withArgvTracking,
} from "@agentxm/client-core/unstable/cli-runtime";
import {
  REGISTRY_EXTENSIONS_DIR,
  buildNewExtensionStep,
  computeSourceHash,
  extensionTypeToPlural,
  fqnInvalidErrorToAppError,
  formatFqn,
  parseFqn,
  preflightCreateOnly,
} from "@agentxm/client-core/unstable/extensions";
import type {
  JobStepArtifact,
  JobStepArtifactTarget,
  Plan,
  PlannedJobStep,
} from "@agentxm/client-core/unstable/plan";
import { previewOrApplyPlan } from "@agentxm/client-core/unstable/plan";
import { SourceHostProviders } from "@agentxm/client-core/unstable/source-resolution";
import {
  copySkill,
  artifactAgentIdsFromTargets,
  artifactTargetAgentIds,
  groupInstallTargetsByDirectory,
  SkillManager,
  type InstallableSkillTarget,
  type SkillExtensionRef,
  type WorkspaceSkillRef,
} from "@agentxm/client-core/unstable/skills";
import { CodingAgentRepository } from "@agentxm/client-core/unstable/agents";
import { decodeVersionSync } from "@agentxm/client-core/unstable/version-constraints";
import { parseInputPattern } from "@agentxm/client-core/unstable/sources";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";

import { emitPlanResolutionResult } from "../../json-output.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { makeConfirmationRecovery, makePlanExecution } from "../shared/confirmation-recovery.js";
import { resolveSkillInstallSource } from "./install/resolve-skill-install-source.js";

export const handleCopySkill = Effect.fn("CopySkill.handle")(function* (args: {
  readonly source: string;
  readonly target: string;
  readonly from: Option.Option<string>;
  readonly yes: boolean;
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
  const agentRepo = yield* CodingAgentRepository;
  const fqn = formatFqn(parsedTarget);
  const targetDir = path.join(
    ws.baseDir,
    REGISTRY_EXTENSIONS_DIR,
    parsedTarget.owner,
    extensionTypeToPlural.skill,
    parsedTarget.name,
  );
  const configuredSkills = yield* ws.getConfiguredSkillEntries();
  yield* preflightCreateOnly({
    subject: "Skill",
    name: parsedTarget.name,
    configured: Object.hasOwn(configuredSkills, parsedTarget.name),
    destinations: [targetDir],
  });

  const version = decodeVersionSync("0.1.0");
  const workspaceRef: WorkspaceSkillRef = {
    type: "skill",
    refType: "workspace",
    source: {
      type: "workspace",
      owner: parsedTarget.owner,
      extensionType: "skill",
      name: parsedTarget.name,
    },
    scope: ws.scope,
    owner: parsedTarget.owner,
    name: parsedTarget.name,
    version,
    sourceHash: computeSourceHash("copy"),
    location: targetDir,
    skill: { ...sourceRef.skill, name: parsedTarget.name },
  };
  const configuredAgents = yield* agentRepo.getMaterializationAgents();
  const resolvedAgents = yield* Effect.forEach(
    configuredAgents,
    (agent) =>
      agent
        .resolveEffectiveSkillsDir({ workspaceRoot: ws.baseDir })
        .pipe(Effect.map((outcome) => ({ agentId: agent.id, outcome }))),
    { concurrency: "unbounded" },
  );
  const installableTargets: Array<InstallableSkillTarget> = [];
  for (const { agentId, outcome } of resolvedAgents) {
    if (outcome._tag === "supported") {
      installableTargets.push({ agentId, targetDir: path.normalize(outcome.dir) });
    }
  }
  const targetLocations = yield* groupInstallTargetsByDirectory(installableTargets, ws.baseDir);
  const sourceTarget: JobStepArtifactTarget = {
    path: path.relative(ws.baseDir, targetDir),
    change: "created",
  };
  const materializedTargets: Array<JobStepArtifactTarget> = targetLocations.map((location) => {
    const agentIds = artifactTargetAgentIds(location.agentIds);
    return {
      path: path.relative(ws.baseDir, path.join(location.targetDir, parsedTarget.name)),
      change: "created",
      ...(agentIds.length > 0 ? { agentIds } : {}),
    };
  });
  const agents = artifactAgentIdsFromTargets(installableTargets);
  const artifact: JobStepArtifact = {
    path: sourceTarget.path,
    scope: ws.scope,
    ...(agents.length > 0 ? { agents } : {}),
    version,
    change: "created",
    targets: [
      sourceTarget,
      { path: ".axm (config/lockfile)", change: "created" },
      ...materializedTargets,
    ],
  };
  const step: PlannedJobStep = {
    ...buildNewExtensionStep(manager, {
      ref: workspaceRef,
      target: { type: "skill", name: parsedTarget.name },
      versionRange: Option.none(),
      label: `Copy ${fqn}`,
      message: `Copied ${fqn}`,
      preflight: Effect.gen(function* () {
        const current = yield* ws.getConfiguredSkillEntries();
        yield* preflightCreateOnly({
          subject: "Skill",
          name: parsedTarget.name,
          configured: Object.hasOwn(current, parsedTarget.name),
          destinations: [targetDir],
        }).pipe(Effect.provideService(FileSystem.FileSystem, fs));
      }),
      markAuthored: ws.setSkillEntry(parsedTarget.name, {
        source: `workspace:${fqn}`,
        enabled: true,
      }),
      scaffold: copySkill({
        name: "copy-skill",
        args: { ref: sourceRef, targetName: fqn },
      }).pipe(
        Effect.provideService(FileSystem.FileSystem, fs),
        Effect.provideService(Path.Path, path),
        Effect.provideService(WorkspaceMutations, ws),
      ),
      buildArtifact: () => Effect.succeed(artifact),
    }),
    artifact,
  };
  const plan: Plan = {
    _tag: "Plan",
    name: "Copy skill for authoring",
    description: Option.some(`Copy ${args.source} into ${fqn}`),
    jobs: [{ concurrency: 1, steps: [step] }],
  };
  const execution = yield* makePlanExecution(
    args,
    makeConfirmationRecovery(
      ["skills", "copy"],
      [
        ...Option.match(args.from, {
          onNone: () => [],
          onSome: (value) => [recoveryOption("--from", publicRecoveryValue(value))],
        }),
        recoveryPositional(credentialFreeLocatorRecoveryValue(args.source)),
        recoveryPositional(publicRecoveryValue(args.target)),
      ],
    ),
  );
  const resolution = yield* previewOrApplyPlan(plan, { execution });
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
  yes: yesFlag,
  preview: previewFlag,
} as const;

export const copyCommand = Command.make("copy", config, (parsed) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    yield* renderer.warn("axm skills copy is deprecated; use axm import <source> <target-fqn>");
    yield* handleCopySkill(parsed);
  }).pipe(withWorkspace("project"), withRuntime("skills copy")),
).pipe(
  withArgvTracking(config),
  Command.withDescription("Deprecated project-workspace skill authoring; use axm import instead"),
  Command.withExamples([
    {
      command: "axm skills copy ./external-skill @acme/skills/my-skill",
      description: "Legacy alias for native skill import",
    },
  ]),
);
