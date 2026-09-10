import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";
import { SkillManifestSchema } from "@agentxm/extension-model/unstable/skills/manifest-schema";
import {
  deriveOperationOutcome,
  type JobStepArtifactTarget,
  type ResolvedUnit,
} from "@agentxm/workspace-operations";

import { CreateExtension } from "../../create/create-extension.js";
import {
  applyExecution,
  authoringWorkspaceLayer,
  makeAuthoringWorkspace,
  previewExecution,
  type AuthoringWorkspace,
} from "../../test-support/authoring-workspace.js";

export const specification = defineSpecification({
  requirement: "cli/skills/new/scaffolds-for-every-configured-agent",
  title: "A new skill is scaffolded for the universal location and every configured agent",
  statement:
    "When a skill is created, AXM shall create its manifest, content, and enabled settings entry together, shall materialize it for the universal location and every configured agent that can represent it, and shall list the same locations in preview and apply.",
  class: "functional",
  role: "experience",
  goals: ["authoring-and-creation", "agent-interoperability", "safe-repetition"],
  methods: ["example"],
  boundary: "memory",
  boundaryRationale:
    "Creation is decided and executed inside extension-authoring over the workspace-state services; a real project directory observes the files an author would see without running the built CLI.",
  derivedFrom: [
    "packages/core/extension-authoring/src/create/create-extension.ts",
    "apps/cli-e2e/src/cli-commands/skills/new/command.e2e.ts",
  ],
  supersedes: [],
  assumptions: [
    "Claude Code and Cursor declare distinct native project skill directories, so two agent locations observe two configured agents beside the universal location.",
  ],
  openQuestions: [],
});

const SKILL = "review-helper";
const AUTHORED_ROOT = `skills/${SKILL}`;
const UNIVERSAL_LOCATION = `.agents/skills/${SKILL}`;
const AGENT_LOCATIONS = {
  "claude-code": `.claude/skills/${SKILL}`,
  cursor: `.cursor/skills/${SKILL}`,
} as const;

/** The artifact targets one resolved unit reports, if it reported an artifact. */
const unitTargets = (unit: ResolvedUnit): ReadonlyArray<JobStepArtifactTarget> =>
  unit.artifact?.targets ?? [];

/** The locations a creation reports beyond its own package and settings. */
const projectedLocations = (
  targets: ReadonlyArray<JobStepArtifactTarget>,
): ReadonlyArray<JobStepArtifactTarget> =>
  [...targets]
    .filter((target) => !target.path.startsWith(AUTHORED_ROOT) && target.path !== "axm.json")
    .sort((left, right) => left.path.localeCompare(right.path));

describe("Creating a skill", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  /** A workspace `@acme` authors, with two agents that represent skills. */
  const workspace = (): AuthoringWorkspace => {
    const created = makeAuthoringWorkspace({
      owner: "@acme",
      agents: ["claude-code", "cursor"],
    });
    cleanups.push(created.cleanup);
    return created;
  };

  const createSkill = (target: AuthoringWorkspace, mode: "preview" | "apply") =>
    Effect.gen(function* () {
      const candidate = yield* CreateExtension.prepare({
        type: "skill",
        name: SKILL,
        owner: Option.none(),
      });
      return yield* CreateExtension.previewOrApply(
        candidate,
        mode === "preview" ? previewExecution : applyExecution,
      );
    }).pipe(Effect.provide(authoringWorkspaceLayer(target)));

  it.effect("records the manifest, content, and enabled settings entry together", () =>
    Effect.gen(function* () {
      const created = workspace();

      const resolution = yield* createSkill(created, "apply");

      expect(deriveOperationOutcome(resolution)).toBe("applied");
      const manifest = Schema.decodeUnknownSync(SkillManifestSchema)(
        JSON.parse(created.read(`${AUTHORED_ROOT}/skill.json`) ?? "null"),
      );
      expect(manifest).toMatchObject({ owner: "@acme", type: "skill", name: SKILL });
      expect(created.read(`${AUTHORED_ROOT}/src/SKILL.md`)).toContain(`name: ${SKILL}`);
      expect(created.settings()).toMatchObject({ skills: { [SKILL]: expect.anything() } });
      expect(JSON.stringify(created.settings())).not.toContain('"enabled":false');
    }),
  );

  it.effect("materializes the skill for the universal location and every configured agent", () =>
    Effect.gen(function* () {
      const created = workspace();

      yield* createSkill(created, "apply");

      const instructions = created.read(`${AUTHORED_ROOT}/src/SKILL.md`);
      expect(created.read(`${UNIVERSAL_LOCATION}/SKILL.md`)).toBe(instructions);
      for (const location of Object.values(AGENT_LOCATIONS)) {
        expect(created.read(`${location}/SKILL.md`), location).toBe(instructions);
      }
    }),
  );

  it.effect("previews exactly the locations an apply realizes", () =>
    Effect.gen(function* () {
      const created = workspace();

      const previewed = yield* createSkill(created, "preview");
      expect(deriveOperationOutcome(previewed)).toBe("previewed");
      expect(created.exists(AUTHORED_ROOT)).toBe(false);

      const applied = yield* createSkill(created, "apply");

      const previewedTargets = projectedLocations(previewed.units.flatMap(unitTargets));
      const appliedTargets = projectedLocations(applied.units.flatMap(unitTargets));
      expect(appliedTargets.map((target) => target.path)).toEqual(
        previewedTargets.map((target) => target.path),
      );
      const byPath = new Map(appliedTargets.map((target) => [target.path, target.agentIds]));
      expect(byPath.has(UNIVERSAL_LOCATION)).toBe(true);
      for (const [agentId, location] of Object.entries(AGENT_LOCATIONS)) {
        expect(byPath.get(location), location).toContain(agentId);
      }
    }),
  );
});
