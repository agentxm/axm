import * as fs from "node:fs";
import * as nodePath from "node:path";

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";
import YAML from "yaml";

import { defineSpecification } from "@agentxm/specification-metadata";

import { ExtensionSelectionInteraction } from "../../install/selection-interaction.js";
import {
  applyInstall,
  contentUnder,
  installRequest,
  makeInstallWorld,
  readSettings,
  type InstallWorld,
} from "../../install/test-helpers.js";
import { writeLocalSkillPackage } from "../../testing.js";

export const specification = defineSpecification({
  requirement: "cli/skills/install/selects-requested-source-skills",
  title: "Skill installation selects the requested skills from a source",
  statement:
    "For an installable source containing several skills, a request that names one or more skills shall install exactly the named skills when every name exists in the source, and a request that selects all of them shall install every discovered skill without opening a selection interaction.",
  class: "functional",
  role: "experience",
  goals: ["extension-adoption", "workspace-intent-fidelity"],
  methods: ["decision-table", "example"],
  derivedFrom: [
    "packages/core/extension-lifecycle/src/skills/install/select-skills.ts",
    // The flag spellings that build these requests (`--skill`, repeated
    // `--skill`, `--all`) stay CLI grammar; process evidence for them is
    // apps/cli-e2e/src/cli-commands/skills/install/command.e2e.ts.
    "apps/cli-e2e/src/cli-commands/skills/install/command.e2e.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [
    "Does a named skill promise glob matching, and what matching grammar applies?",
    "Must a request containing both matched and unmatched names fail as a whole or install its matches, and how should a wholly unmatched request be reported?",
    "Does unattended operation with neither a name selection nor an all selection select every discovered skill?",
    "How should an all selection and a name selection be combined or refused when both are supplied?",
  ],
  limitations: [
    {
      limitation:
        "The source population is a local native .agents/skills tree with three valid uniquely named skills. These examples do not establish discovery or selection through remote Git/Registry providers, collision handling, invalid sibling packages, or an actual interactive terminal session.",
      retirementCondition:
        "Add distinct source-provider and interaction evidence when those selection conditions are allocated; keep unresolved selector policies explicit until decided.",
    },
  ],
});

const sourceSkills = ["draft-changelog", "inspect-patch", "trace-failure"] as const;

const skillDocument = (name: string): string =>
  `---\nname: ${name}\ndescription: The ${name} source skill\n---\n\n# ${name}\n\nSource-specific guidance for ${name}.\n`;

/** A native `.agents/skills` tree holding three uniquely named skills. */
const writeMultiSkillSource = (workspaceRoot: string): string => {
  const sourceRoot = nodePath.join(workspaceRoot, "vendor", "native-skill-source");
  for (const name of sourceSkills) {
    const skillRoot = nodePath.join(sourceRoot, ".agents", "skills", name);
    fs.mkdirSync(skillRoot, { recursive: true });
    fs.writeFileSync(nodePath.join(skillRoot, "SKILL.md"), skillDocument(name));
  }
  return sourceRoot;
};

/** Every file under one absolute directory, keyed by directory-relative path. */
const snapshotDirectory = (root: string): Readonly<Record<string, string>> => {
  const files: Record<string, string> = {};
  const walk = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = nodePath.join(directory, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else files[nodePath.relative(root, absolute)] = fs.readFileSync(absolute, "utf8");
    }
  };
  walk(root);
  return files;
};

const acceptedSkillResolutions = (world: InstallWorld): Readonly<Record<string, unknown>> => {
  const lockfile: unknown = YAML.parse(world.workspace.readFile("axm-lock.yaml"));
  if (typeof lockfile !== "object" || lockfile === null || !("skills" in lockfile))
    throw new Error("Expected a skill resolution map");
  const skills = lockfile.skills;
  if (typeof skills !== "object" || skills === null) throw new Error("Expected a resolution map");
  return { ...skills };
};

const configuredSkills = (world: InstallWorld): Readonly<Record<string, unknown>> => {
  const skills = readSettings(world.workspace)["skills"];
  if (typeof skills !== "object" || skills === null) throw new Error("Expected configured skills");
  return { ...skills };
};

/**
 * Exactly the named skills are acquired, declared, resolved and projected;
 * every other skill in the source is absent from all four.
 */
const expectSelection = (world: InstallWorld, selected: ReadonlyArray<string>): void => {
  const canonical = contentUnder(world.workspace, "agent_extensions").map(([, body]) => body);
  const settings = configuredSkills(world);
  const resolutions = acceptedSkillResolutions(world);
  for (const name of sourceSkills) {
    const isSelected = selected.includes(name);
    const content = skillDocument(name);
    expect(canonical.includes(content), `${name} canonical content`).toBe(isSelected);
    expect(settings[name] !== undefined, `${name} settings entry`).toBe(isSelected);
    expect(resolutions[name] !== undefined, `${name} accepted resolution`).toBe(isSelected);
    for (const agent of [".claude", ".agents"]) {
      const projected = `${agent}/skills/${name}/SKILL.md`;
      expect(world.workspace.exists(projected), projected).toBe(isSelected);
      if (isSelected) expect(world.workspace.readFile(projected)).toBe(content);
    }
  }
};

/** One row per way a request settles which of a source's skills to take. */
const selections = [
  { label: "one named skill", names: ["inspect-patch"], all: false, selected: ["inspect-patch"] },
  {
    label: "two named skills",
    names: ["trace-failure", "draft-changelog"],
    all: false,
    selected: ["trace-failure", "draft-changelog"],
  },
  { label: "every discovered skill", names: [], all: true, selected: sourceSkills },
] as const;

describe("Select skills from a supplied source", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  /** A workspace holding one unrelated installed skill that must not move. */
  const worldWithUnrelatedSkill = () =>
    Effect.gen(function* () {
      const world = makeInstallWorld();
      cleanups.push(world.cleanup);
      const unrelated = writeLocalSkillPackage(world.workspace.root, {
        name: "existing-guidance",
        description: "Keep this unrelated installed guidance unchanged.",
      });
      yield* world.workspace
        .provide(applyInstall(installRequest({ subject: { kind: "source", source: unrelated } })))
        .pipe(Effect.provide(NodeServices.layer));
      const unrelatedBytes = fs.readFileSync(nodePath.join(unrelated, "src", "SKILL.md"), "utf8");
      expect(unrelatedBytes).toContain("Keep this unrelated installed guidance unchanged.");
      for (const agent of [".claude", ".agents"])
        expect(world.workspace.readFile(`${agent}/skills/existing-guidance/SKILL.md`)).toBe(
          unrelatedBytes,
        );
      return {
        world,
        unrelated,
        before: {
          source: snapshotDirectory(unrelated),
          settings: configuredSkills(world)["existing-guidance"],
          resolution: acceptedSkillResolutions(world)["existing-guidance"],
          bytes: unrelatedBytes,
          canonical: contentUnder(world.workspace, "agent_extensions"),
        },
      };
    });

  const expectUnrelatedPreserved = (
    world: InstallWorld,
    unrelated: string,
    before: {
      readonly source: Readonly<Record<string, string>>;
      readonly settings: unknown;
      readonly resolution: unknown;
      readonly bytes: string;
      readonly canonical: ReadonlyArray<readonly [string, string]>;
    },
  ): void => {
    expect(snapshotDirectory(unrelated)).toEqual(before.source);
    expect(configuredSkills(world)["existing-guidance"]).toEqual(before.settings);
    expect(acceptedSkillResolutions(world)["existing-guidance"]).toEqual(before.resolution);
    for (const agent of [".claude", ".agents"])
      expect(world.workspace.readFile(`${agent}/skills/existing-guidance/SKILL.md`)).toBe(
        before.bytes,
      );
    const after = new Map(contentUnder(world.workspace, "agent_extensions"));
    for (const [file, body] of before.canonical) expect(after.get(file)).toBe(body);
  };

  it.effect.each(selections)("$label selects actual source content", (row) =>
    Effect.gen(function* () {
      const { world, unrelated, before } = yield* worldWithUnrelatedSkill();
      const source = writeMultiSkillSource(world.workspace.root);
      const sourceBefore = snapshotDirectory(source);
      expect(Object.keys(sourceBefore).filter((file) => file.endsWith("SKILL.md"))).toHaveLength(3);

      yield* world.workspace
        .provide(
          applyInstall(
            installRequest({
              type: "skill",
              subject: { kind: "source", source },
              names: row.names,
              all: row.all,
            }),
          ),
        )
        .pipe(Effect.provide(NodeServices.layer));

      expectSelection(world, row.selected);
      expect(snapshotDirectory(source)).toEqual(sourceBefore);
      expectUnrelatedPreserved(world, unrelated, before);
    }),
  );

  it.effect("selecting every skill opens no selection interaction even when one is available", () =>
    Effect.gen(function* () {
      const world = makeInstallWorld();
      cleanups.push(world.cleanup);
      const source = writeMultiSkillSource(world.workspace.root);
      const sourceBefore = snapshotDirectory(source);
      // A port that refuses to be opened: the only way this example passes is
      // if the all-selection never asks which skills to take.
      const refusingSelection = Layer.succeed(ExtensionSelectionInteraction, {
        selectSkills: () => Effect.die(new Error("An all selection opened a selection prompt")),
        selectSubagents: () => Effect.die(new Error("An all selection opened a selection prompt")),
      });

      yield* world.workspace
        .provide(
          applyInstall(
            installRequest({
              type: "skill",
              subject: { kind: "source", source },
              names: [],
              all: true,
              // Interaction is available: refusing to prompt is a decision,
              // not a consequence of unattended operation.
              nonInteractive: false,
            }),
          ).pipe(Effect.provide(refusingSelection)),
        )
        .pipe(Effect.provide(NodeServices.layer));

      expectSelection(world, sourceSkills);
      expect(snapshotDirectory(source)).toEqual(sourceBefore);
    }),
  );
});
