import * as fs from "node:fs";
import * as nodePath from "node:path";
import { observeConfiguredSkillLocations } from "@agentxm/workspace-kernel/projection";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";
import { SkillManifestSchema } from "@agentxm/extension-model/unstable/skills/manifest-schema";
import {
  deriveOperationOutcome,
  operationNativeLocations,
  type JobStepArtifactTarget,
  type ResolvedUnit,
} from "@agentxm/workspace-kernel/operations";

import { CreateExtension } from "../../index.js";
import {
  applyExecution,
  authoringWorkspaceLayer,
  makeAuthoringWorkspace,
  previewExecution,
  type AuthoringWorkspace,
} from "../../test-support/authoring-workspace.js";

export const specification = defineSpecification({
  requirement: "cli/skills/new/scaffolds-for-every-configured-agent",
  title:
    "A new skill is scaffolded for the shared Skill policy location and every configured agent",
  statement:
    "When a skill is created, AXM shall create its manifest, content, and enabled settings entry together, shall materialize it for the shared Skill policy location and every configured agent that can represent it, and shall report the same physical native units, aliases, configured consumers, and shared policy in preview and apply.",
  class: "functional",
  role: "experience",
  goals: ["authoring-and-creation", "agent-interoperability", "safe-repetition"],
  methods: ["example"],
  boundary: "memory",
  boundaryRationale:
    "Creation is decided and executed inside extension-authoring over the workspace-state services; a real project directory observes the files an author would see without running the built CLI.",
  derivedFrom: [
    "packages/core/workspace-features/src/authoring/create/create-extension.ts",
    "apps/cli-e2e/src/cli-commands/skills/new/command.e2e.ts",
  ],
  supersedes: [],
  assumptions: [
    "Claude Code and Cursor declare distinct native project skill directories, so two agent locations observe two configured agents beside the shared Skill policy location.",
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

  it.effect(
    "projects emerging targets through their declared directories and shared Skill policy",
    () =>
      Effect.gen(function* () {
        const created = makeAuthoringWorkspace({
          owner: "@acme",
          agents: ["fx", "muse-code", "mimo-code", "coder-agents"],
        });
        cleanups.push(created.cleanup);
        const resolution = yield* createSkill(created, "apply");
        expect(deriveOperationOutcome(resolution)).toBe("applied");
        const source = created.read(`${AUTHORED_ROOT}/src/SKILL.md`);
        for (const directory of [".fx/skills", ".mimocode/skills", ".agents/skills"]) {
          expect(created.read(`${directory}/${SKILL}/SKILL.md`)).toBe(source);
        }
      }),
  );

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

  it.effect(
    "materializes the skill for the shared Skill policy location and every configured agent",
    () =>
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

  it.effect("reports duplicate discovery and refuses currency for foreign native content", () =>
    Effect.gen(function* () {
      const created = workspace();
      yield* createSkill(created, "apply");
      const observe = () =>
        observeConfiguredSkillLocations({
          type: "skill",
          scope: "project",
          state: "current",
          agentIds: ["claude-code", "cursor"],
          rows: [{ name: SKILL, installed: true, targetState: "enabled" }],
        }).pipe(Effect.provide(authoringWorkspaceLayer(created)));
      const before = (yield* observe()).get(SKILL);
      expect(before?.agentOutcomes.every((outcome) => outcome.outcome === "current")).toBe(true);
      expect(
        before?.nativeLocations.filter((unit) => unit.configuredConsumers.includes("cursor"))
          .length,
      ).toBeGreaterThan(1);
      fs.rmSync(nodePath.join(created.root, AGENT_LOCATIONS.cursor));
      created.write(
        `${AGENT_LOCATIONS.cursor}/SKILL.md`,
        `---\nname: ${SKILL}\ndescription: Foreign content\n---\nDifferent content\n`,
      );
      const after = (yield* observe()).get(SKILL);
      expect(after?.agentOutcomes.find((outcome) => outcome.agentId === "cursor")?.outcome).toBe(
        "blocked",
      );
      expect(
        after?.nativeLocations.find((unit) => unit.address.path.endsWith(AGENT_LOCATIONS.cursor)),
      ).toMatchObject({ ownership: "unowned", state: "blocked" });
    }),
  );

  it.effect("previews exactly the locations an apply realizes", () =>
    Effect.gen(function* () {
      const created = workspace();

      const previewed = yield* createSkill(created, "preview");
      expect(deriveOperationOutcome(previewed)).toBe("previewed");
      expect(created.exists(AUTHORED_ROOT)).toBe(false);

      const applied = yield* createSkill(created, "apply");
      for (const resolution of [previewed, applied]) {
        const locations = operationNativeLocations(resolution);
        expect(locations).toHaveLength(3);
        expect(new Set(locations.flatMap((unit) => unit.configuredConsumers))).toEqual(
          new Set(["claude-code", "cursor"]),
        );
        expect(
          locations.find((unit) => unit.address.path.endsWith(UNIVERSAL_LOCATION))?.policyReasons,
        ).toContain("workspace-shared-skills");
      }
      expect(
        operationNativeLocations(previewed).every(
          (unit) => unit.state === "created" && unit.ownership === "absent",
        ),
      ).toBe(true);
      expect(
        operationNativeLocations(applied).every(
          (unit) => unit.state === "created" && unit.ownership === "owned",
        ),
      ).toBe(true);

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
