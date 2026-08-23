import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Option from "effect/Option";
import * as Effect from "effect/Effect";
import { Argument, Command, Flag } from "effect/unstable/cli";
import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import {
  buildNewExtensionStep,
  computeSourceHash,
  decodeExtensionNameSync,
  formatFqn,
  normalizeHandle,
  preflightCreateOnly,
  REGISTRY_EXTENSIONS_DIR,
  type ExtensionName,
} from "@agentxm/client-core/unstable/extensions";
import type {
  InstallableSkillTarget,
  NewSkillOperation,
  WorkspaceSkillRef,
} from "@agentxm/client-core/unstable/skills";
import {
  artifactAgentIdsFromTargets,
  artifactTargetAgentIds,
  groupInstallTargetsByDirectory,
  MANIFEST_FILENAME,
  newSkill,
  SkillManager,
  uninstallSkill,
} from "@agentxm/client-core/unstable/skills";
import { CodingAgentRepository } from "@agentxm/client-core/unstable/agents";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import { previewFlag, yesFlag } from "@agentxm/client-core/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { DEFAULT_WORKSPACE_SCOPE } from "@agentxm/client-core/unstable/workspace";
import type {
  JobStepArtifact,
  JobStepArtifactTarget,
  Plan,
  PlannedJobStep,
} from "@agentxm/client-core/unstable/plan";
import { operationPresentation } from "@agentxm/client-core/unstable/plan";
import { emitOperationResolution } from "../../operation-output.js";
import { withOperationLifecycle } from "../shared/operation-lifecycle.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { joinDisplayPath } from "../shared/display-path.js";
import { previewOrApplyLocalPlan } from "../shared/local-plan.js";
import { resolveOwnerForNewContent } from "../shared/resolve-owner.js";
import { SKILL_NAME_RULES } from "../suggested-actions.js";
import { decodeVersionSync } from "@agentxm/client-core/unstable/version-constraints";

const NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const MAX_NAME_LENGTH = 64;

export interface SkillsNewHandlerArgs {
  readonly name: ExtensionName;
  readonly owner: Option.Option<string>;
  readonly agents: Option.Option<readonly string[]>;
  readonly yes: boolean;
  readonly preview: boolean;
}

const normalizeOwner = (s: string) => normalizeHandle(s.startsWith("@") ? s : `@${s}`);

export const handleSkillsNew = (args: SkillsNewHandlerArgs) =>
  withOperationLifecycle(
    {
      command: "skills.new",
      mode: args.preview ? "preview" : "apply",
      planName: "New skill",
    },
    handleSkillsNewBody(args),
  );

const handleSkillsNewBody = Effect.fn("SkillsNew.handle")(function* (args: SkillsNewHandlerArgs) {
  const ws = yield* WorkspaceMutations;
  const manager = yield* SkillManager;
  const agentRepo = yield* CodingAgentRepository;

  // 1. Resolve owner
  const owner = Option.isSome(args.owner)
    ? normalizeOwner(args.owner.value)
    : yield* resolveOwnerForNewContent("skill creation");

  // 2. Validate name
  if (
    args.name.length === 0 ||
    args.name.length > MAX_NAME_LENGTH ||
    !NAME_PATTERN.test(args.name)
  ) {
    return yield* makeAppError({
      code: "validation",
      detail: `Invalid skill name: "${args.name}"`,
      recover: SKILL_NAME_RULES,
    });
  }

  const configuredSkills = yield* ws.getConfiguredSkillEntries();
  const requestedAgents = Option.getOrUndefined(args.agents);
  const agents = requestedAgents ?? (yield* ws.getConfiguredAgents());

  // 5. Capture services for run closure
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const canonicalPath = path.join(ws.baseDir, REGISTRY_EXTENSIONS_DIR, owner, "skills", args.name);
  yield* preflightCreateOnly({
    subject: "Skill",
    name: args.name,
    configured: Object.hasOwn(configuredSkills, args.name),
    destinations: [canonicalPath],
  });

  // 6. Build operation
  const op = {
    name: "new-skill",
    args: { name: args.name, owner, agents: [...agents] },
  } satisfies NewSkillOperation;

  // 7. Build plan with inline run closure
  const fqn = `${owner}/skills/${args.name}`;
  const version = decodeVersionSync("0.0.1");
  const ref: WorkspaceSkillRef = {
    type: "skill",
    refType: "workspace",
    source: { type: "workspace", owner, extensionType: "skill", name: args.name },
    scope: ws.scope,
    owner,
    name: args.name,
    version,
    sourceHash: computeSourceHash("scaffold"),
    location: canonicalPath,
    skill: {
      name: args.name,
      description: Option.none(),
      metadata: Option.none(),
    },
  };
  const previewAgents = yield* agentRepo
    .getMaterializationAgents()
    .pipe(Effect.provideService(WorkspaceMutations, ws));
  const previewResolvedAgents = yield* Effect.forEach(
    previewAgents,
    (agent) =>
      agent
        .resolveEffectiveSkillsDir({ workspaceRoot: ws.baseDir })
        .pipe(Effect.map((outcome) => ({ agentId: agent.id, outcome }))),
    { concurrency: "unbounded" },
  );
  const previewInstallableTargets: Array<InstallableSkillTarget> = [];
  for (const { agentId, outcome } of previewResolvedAgents) {
    if (outcome._tag === "supported") {
      previewInstallableTargets.push({ agentId, targetDir: path.normalize(outcome.dir) });
    }
  }
  const previewTargetLocations = yield* groupInstallTargetsByDirectory(
    previewInstallableTargets,
    ws.baseDir,
  );
  const previewArtifact: JobStepArtifact = {
    path: path.relative(ws.baseDir, canonicalPath),
    scope: ws.scope,
    version: "0.0.1",
    change: "created",
    fileCount: 2,
    targets: [
      {
        path: path.relative(ws.baseDir, path.join(canonicalPath, MANIFEST_FILENAME)),
        change: "created",
      },
      {
        path: path.relative(ws.baseDir, path.join(canonicalPath, "src", "SKILL.md")),
        change: "created",
      },
      { path: ".axm (config/lockfile)", change: "created" },
      ...previewTargetLocations.map((location) => {
        const agentIds = artifactTargetAgentIds(location.agentIds);
        return {
          path: path.relative(ws.baseDir, path.join(location.targetDir, args.name)),
          change: "created" as const,
          ...(agentIds.length > 0 ? { agentIds } : {}),
        };
      }),
    ],
  };

  const step = buildNewExtensionStep(manager, {
    ref,
    target: { type: "skill", name: args.name },
    versionRange: Option.none(),
    label: fqn,
    message: `Created skill ${fqn}`,
    plannedArtifact: previewArtifact,
    preflight: Effect.gen(function* () {
      const current = yield* ws.getConfiguredSkillEntries();
      yield* preflightCreateOnly({
        subject: "Skill",
        name: args.name,
        configured: Object.hasOwn(current, args.name),
        destinations: [canonicalPath],
      }).pipe(Effect.provideService(FileSystem.FileSystem, fs));
    }),
    markAuthored: ws.setSkillEntry(args.name, {
      source: `workspace:${formatFqn({ owner, type: "skill", name: args.name })}`,
      enabled: true,
    }),
    scaffold: newSkill(op).pipe(
      Effect.provideService(WorkspaceMutations, ws),
      Effect.provideService(FileSystem.FileSystem, fs),
      Effect.provideService(Path.Path, path),
    ),
    buildArtifact: ({ installedBefore }) =>
      Effect.gen(function* () {
        const configuredAgents = yield* agentRepo
          .getMaterializationAgents()
          .pipe(Effect.provideService(WorkspaceMutations, ws));
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
        const targetLocations = yield* groupInstallTargetsByDirectory(
          installableTargets,
          ws.baseDir,
        );
        const change = installedBefore ? "updated" : "created";
        const sourceTarget: JobStepArtifactTarget = {
          path: joinDisplayPath(path, ".axm", "extensions", owner, "skills", args.name),
          change,
        };
        const configTarget: JobStepArtifactTarget = {
          path: ".axm (config/lockfile)",
          change,
        };
        const materializedTargets: Array<JobStepArtifactTarget> = targetLocations.map(
          (location) => {
            const agentIds = artifactTargetAgentIds(location.agentIds);
            return {
              path: path.relative(ws.baseDir, path.join(location.targetDir, args.name)),
              change,
              ...(agentIds.length > 0 ? { agentIds } : {}),
            };
          },
        );
        const agents = artifactAgentIdsFromTargets(installableTargets);
        return {
          path: sourceTarget.path,
          scope: ws.scope,
          ...(agents.length > 0 ? { agents } : {}),
          version: "0.0.1",
          change,
          targets: [sourceTarget, configTarget, ...materializedTargets],
        } satisfies JobStepArtifact;
      }).pipe(
        Effect.provideService(FileSystem.FileSystem, fs),
        Effect.provideService(Path.Path, path),
        Effect.provideService(WorkspaceMutations, ws),
      ),
  });

  const steps: PlannedJobStep[] = [step];
  if (requestedAgents !== undefined) {
    const requestedAgentSet = new Set(requestedAgents);
    steps.push({
      key: `skill-agent-scope:${args.name}`,
      label: `${fqn} agent scope`,
      readiness: "ready",
      run: Effect.gen(function* () {
        const materializationAgentIds = (yield* agentRepo
          .getMaterializationAgents()
          .pipe(Effect.provideService(WorkspaceMutations, ws))).map((agent) => agent.id);
        const agentsToRemove = materializationAgentIds.filter(
          (agent) => !requestedAgentSet.has(agent),
        );
        if (agentsToRemove.length === 0) {
          return {
            result: "success" as const,
            message: `Scoped skill ${fqn}`,
          };
        }

        yield* uninstallSkill({
          name: "uninstall-skill",
          args: { skillName: args.name, agents: agentsToRemove },
        }).pipe(
          Effect.provideService(WorkspaceMutations, ws),
          Effect.provideService(FileSystem.FileSystem, fs),
          Effect.provideService(Path.Path, path),
        );

        return {
          result: "success" as const,
          message: `Scoped skill ${fqn}`,
        };
      }),
    });
  }

  const plan: Plan = {
    _tag: "Plan",
    name: "New skill",
    description: Option.some(`Create ${fqn}`),
    presentation: operationPresentation(
      { imperative: "create", past: "Created", gerund: "Creating" },
      "skill",
    ),
    jobs: [{ concurrency: 1 as const, steps }],
  };

  const resolution = yield* previewOrApplyLocalPlan(plan, {
    preview: args.preview,
    yes: args.yes,
  });

  const suggestions = [
    {
      description: `Edit \`${joinDisplayPath(path, ".axm", "extensions", owner, "skills", args.name, "src", "SKILL.md")}\` to fill in instructions`,
    },
  ];
  yield* emitOperationResolution("skills.new", resolution, { suggestions });
});

const newConfig = {
  name: Argument.string("name").pipe(Argument.withDescription("Name of the skill (without owner)")),
  owner: Flag.string("owner").pipe(
    Flag.withDescription("Override the workspace owner (e.g., @acme)"),
    Flag.optional,
  ),
  agent: Flag.string("agent").pipe(
    Flag.withDescription("Agent IDs to target (can be repeated)"),
    Flag.atLeast(1),
    Flag.optional,
  ),
  yes: yesFlag.pipe(Flag.withDescription("Create the skill without confirmation")),
  preview: previewFlag.pipe(
    Flag.withDescription("Show what files would be created without creating them"),
  ),
} as const;

export const newCommand = Command.make("new", newConfig, ({ name, owner, agent, yes, preview }) =>
  handleSkillsNew({
    name: decodeExtensionNameSync(name),
    owner,
    agents: Option.map(agent, (value) => [...value]),
    yes,
    preview,
  }).pipe(withWorkspace(DEFAULT_WORKSPACE_SCOPE), withRuntime("skills new")),
).pipe(
  withArgvTracking(newConfig),
  Command.withDescription("Create a new skill in the project-workspace authoring root"),
  Command.withExamples([
    { command: "axm skills new my-skill", description: "Scaffold a new skill" },
    {
      command: "axm skills new my-skill --owner @acme",
      description: "Create under a specific owner",
    },
  ]),
);
