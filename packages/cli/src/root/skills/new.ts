import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Option from "effect/Option";
import * as Effect from "effect/Effect";
import { Argument, Command, Flag } from "effect/unstable/cli";
import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import {
  buildNewExtensionStep,
  decodeExtensionNameSync,
  formatFqn,
  normalizeHandle,
  type ExtensionName,
} from "@agentxm/client-core/unstable/extensions";
import type { NewSkillOperation, RegistrySkillRef } from "@agentxm/client-core/unstable/skills";
import { newSkill, SkillManager, uninstallSkill } from "@agentxm/client-core/unstable/skills";
import { CliRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import { forceFlag, previewFlag, yesFlag } from "@agentxm/client-core/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { DEFAULT_WORKSPACE_SCOPE } from "@agentxm/client-core/unstable/workspace";
import type { Plan, PlannedJobStep } from "@agentxm/client-core/unstable/plan";
import { emitPlanResolutionResult } from "../../json-output.js";
import { withAuthRuntime, withWorkspace } from "../../runtime.js";
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
  readonly force: boolean;
  readonly preview: boolean;
}

const normalizeOwner = (s: string) => normalizeHandle(s.startsWith("@") ? s : `@${s}`);

export const handleSkillsNew = Effect.fn("SkillsNew.handle")(function* (
  args: SkillsNewHandlerArgs,
) {
  const ws = yield* WorkspaceMutations;
  const renderer = yield* CliRenderer;
  const manager = yield* SkillManager;

  yield* renderer.info("axm skills new");

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

  // 3. Check existence
  const configuredSkills = yield* ws.getConfiguredSkillEntries();
  if (args.name in configuredSkills) {
    return yield* makeAppError({
      code: "conflict",
      detail: `Skill '${args.name}' already exists in settings`,
      recover: "Choose a different name or remove the existing skill first",
    });
  }

  // 4. Resolve agents
  const requestedAgents = Option.getOrUndefined(args.agents);
  const agents = requestedAgents ?? (yield* ws.getConfiguredAgents());

  // 5. Capture services for run closure
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  // 6. Build operation
  const op = {
    name: "new-skill",
    args: { name: args.name, owner, agents: [...agents] },
  } satisfies NewSkillOperation;

  // 7. Build plan with inline run closure
  const fqn = `${owner}/skills/${args.name}`;
  const version = decodeVersionSync("0.0.1");
  const ref: RegistrySkillRef = {
    type: "skill",
    refType: "registry",
    source: { type: "registry", location: new URL("file:///"), owner: Option.some(owner) },
    owner,
    name: args.name,
    version,
    integrity: Option.none(),
    packages: [],
    skill: {
      name: args.name,
      description: Option.none(),
      metadata: Option.none(),
    },
  };

  const step = buildNewExtensionStep(manager, {
    ref,
    versionRange: Option.none(),
    label: fqn,
    message: `Created skill ${fqn}`,
    markAuthored: ws.setSkillEntry(args.name, {
      source: formatFqn({ owner, type: "skill", name: args.name }),
      enabled: true,
      authored: true,
    }),
    scaffold: newSkill(op).pipe(
      Effect.provideService(WorkspaceMutations, ws),
      Effect.provideService(FileSystem.FileSystem, fs),
      Effect.provideService(Path.Path, path),
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
        const lockedSkill = yield* ws.getLockedSkill(args.name);
        if (Option.isNone(lockedSkill)) {
          return {
            result: "success" as const,
            message: `Scoped skill ${fqn}`,
          };
        }

        const agentsToRemove = lockedSkill.value.agents.filter(
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
    jobs: [{ concurrency: 1 as const, steps }],
  };

  const resolution = yield* previewOrApplyLocalPlan(plan, { preview: args.preview });

  const suggestions = [
    {
      description: `Edit \`${joinDisplayPath(path, ".axm", "extensions", owner, "skills", args.name, "src", "SKILL.md")}\` to fill in instructions`,
    },
  ];

  const emitted = yield* emitPlanResolutionResult(
    "skills.new",
    resolution,
    resolution._tag === "ExecutedPlan"
      ? { summary: `Created skill ${fqn}`, suggestions }
      : undefined,
  );

  if (resolution._tag === "ExecutedPlan") {
    yield* renderer.success(`Created skill ${fqn}`, { suggestions, withoutSuggestions: emitted });
  }
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
  force: forceFlag.pipe(Flag.withDescription("Overwrite if a skill with this name already exists")),
  preview: previewFlag.pipe(
    Flag.withDescription("Show what files would be created without creating them"),
  ),
} as const;

export const newCommand = Command.make(
  "new",
  newConfig,
  ({ name, owner, agent, yes, force, preview }) =>
    handleSkillsNew({
      name: decodeExtensionNameSync(name),
      owner,
      agents: Option.map(agent, (value) => [...value]),
      yes,
      force,
      preview,
    }).pipe(withWorkspace(DEFAULT_WORKSPACE_SCOPE), withAuthRuntime("skills new")),
).pipe(
  withArgvTracking(newConfig),
  Command.withDescription("Create a new skill"),
  Command.withExamples([
    { command: "axm skills new my-skill", description: "Scaffold a new skill" },
    {
      command: "axm skills new my-skill --owner @acme",
      description: "Create under a specific owner",
    },
  ]),
);
