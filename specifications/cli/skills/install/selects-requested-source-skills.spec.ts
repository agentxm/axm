import * as fs from "node:fs";
import * as path from "node:path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import YAML from "yaml";
import { describe, expect, it } from "@effect/vitest";
import { LockfileSchema, Screen, handleSkillsInstall } from "axm.sh/specification-harness";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import {
  makeDirectoryFixture,
  unattendedProjectSetup,
} from "../../../support/directory-harness.js";
import { makeSpecWorkspace, writeLocalSkillPackage } from "../../../support/install-harness.js";
import { snapshotWorkspaceContent } from "../../../support/workspace-fixtures.js";

export const specification = defineSpecification({
  requirement: "cli/skills/install/selects-requested-source-skills",
  title: "Skill installation selects the requested skills from a source",
  statement:
    "For an installable source containing several skills, skills install shall install exactly the skills named by one or more --skill occurrences when every supplied name exists and --all is absent, or every discovered skill without a selection prompt when --all is supplied and --skill is absent.",
  class: "functional",
  role: "experience",
  goals: ["extension-adoption", "workspace-intent-fidelity"],
  boundary: "process",
  boundaryRationale:
    "Built CLI invocations parse single and repeated exact-name flags and explicit all against a real local native skill tree, then expose persisted canonical and projected bytes. An additional production-handler case sets interactive mode explicitly and rejects any attempted Screen prompt, so implicit unattended selection cannot supply the no-selection-prompt evidence for --all.",
  methods: ["decision-table", "example"],
  derivedFrom: [
    "apps/cli/src/root/skills/install/command.ts",
    "apps/cli/src/root/skills/install/select-skills.test.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [
    "Does --skill promise glob matching, and what matching grammar applies?",
    "Must a request containing both matched and unmatched names fail as a whole or install its matches, and how should a wholly unmatched request be reported?",
    "Does unattended operation without --skill or --all select every discovered skill?",
    "How should --all and --skill be combined or refused when both are supplied?",
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

const writeMultiSkillSource = (workspaceRoot: string): string => {
  const sourceRoot = path.join(workspaceRoot, "vendor", "native-skill-source");
  for (const name of sourceSkills) {
    const skillRoot = path.join(sourceRoot, ".agents", "skills", name);
    fs.mkdirSync(skillRoot, { recursive: true });
    fs.writeFileSync(path.join(skillRoot, "SKILL.md"), skillDocument(name));
  }
  return sourceRoot;
};

const canonicalSnapshot = (root: string) =>
  snapshotWorkspaceContent(path.join(root, "agent_extensions"));

const readLock = (root: string) =>
  Schema.decodeUnknownSync(LockfileSchema)(
    YAML.parse(fs.readFileSync(path.join(root, "axm-lock.yaml"), "utf8")),
  );

const readSkillSettings = (root: string) =>
  Schema.decodeUnknownSync(Schema.Struct({ skills: Schema.Record(Schema.String, Schema.Unknown) }))(
    JSON.parse(fs.readFileSync(path.join(root, "axm.json"), "utf8")),
  ).skills;

const expectSelection = (root: string, selected: ReadonlyArray<string>): void => {
  const canonical = Object.values(canonicalSnapshot(root));
  const settings = readSkillSettings(root);
  const lock = readLock(root);
  for (const name of sourceSkills) {
    const selectedName = selected.includes(name);
    const content = skillDocument(name);
    const encoded = `file:${Buffer.from(content).toString("base64")}`;
    if (selectedName) {
      expect(canonical).toContain(encoded);
      expect(settings[name]).toBeDefined();
      expect(lock.skills[name]).toBeDefined();
    } else {
      expect(canonical).not.toContain(encoded);
      expect(settings[name]).toBeUndefined();
      expect(lock.skills[name]).toBeUndefined();
    }
    for (const agent of [".claude", ".agents"]) {
      const projected = path.join(root, agent, "skills", name, "SKILL.md");
      expect(fs.existsSync(projected)).toBe(selectedName);
      if (selectedName) expect(fs.readFileSync(projected, "utf8")).toBe(content);
    }
  }
};

const selections = [
  { label: "one exact name", args: ["--skill", "inspect-patch"], selected: ["inspect-patch"] },
  {
    label: "two repeated exact names",
    args: ["--skill", "trace-failure", "--skill", "draft-changelog"],
    selected: ["trace-failure", "draft-changelog"],
  },
  { label: "explicit all without a name selector", args: ["--all"], selected: sourceSkills },
] as const;

describe("Select skills from a supplied source", () => {
  it.each(selections)(
    "$label selects actual source content",
    async ({ args, selected }) => {
      const fixture = makeDirectoryFixture();
      try {
        const run = (args: ReadonlyArray<string>) =>
          fixture.run(["-C", fixture.selected, ...args, "--non-interactive", "--json"]);
        const setup = await fixture.run(["-C", fixture.selected, ...unattendedProjectSetup]);
        expect(setup.exitCode, setup.stdout + setup.stderr).toBe(0);
        const unrelated = writeLocalSkillPackage(fixture.selected, {
          name: "existing-guidance",
          body: "Keep this unrelated installed guidance unchanged.",
        });
        const existing = await run(["install", unrelated]);
        expect(existing.exitCode, existing.stdout + existing.stderr).toBe(0);
        const unrelatedBytes = fs.readFileSync(path.join(unrelated, "src", "SKILL.md"), "utf8");
        expect(unrelatedBytes).toContain("Keep this unrelated installed guidance unchanged.");
        for (const agent of [".claude", ".agents"]) {
          expect(
            fs.readFileSync(
              path.join(fixture.selected, agent, "skills", "existing-guidance", "SKILL.md"),
              "utf8",
            ),
          ).toBe(unrelatedBytes);
        }
        const unrelatedSourceBefore = snapshotWorkspaceContent(unrelated);
        const unrelatedSettingsBefore = readSkillSettings(fixture.selected)["existing-guidance"];
        const unrelatedLockBefore = readLock(fixture.selected).skills["existing-guidance"];
        expect(unrelatedSettingsBefore).toBeDefined();
        expect(unrelatedLockBefore).toBeDefined();
        const source = writeMultiSkillSource(fixture.selected);
        const sourceBefore = snapshotWorkspaceContent(source);
        expect(Object.keys(sourceBefore).filter((file) => file.endsWith("SKILL.md"))).toHaveLength(
          3,
        );
        const canonicalBefore = canonicalSnapshot(fixture.selected);
        expect(Object.keys(canonicalBefore).length).toBeGreaterThan(0);

        const installed = await run(["skills", "install", source, ...args]);

        expect(installed.exitCode, installed.stdout + installed.stderr).toBe(0);
        expectSelection(fixture.selected, selected);
        expect(snapshotWorkspaceContent(source)).toEqual(sourceBefore);
        expect(snapshotWorkspaceContent(unrelated)).toEqual(unrelatedSourceBefore);
        expect(readSkillSettings(fixture.selected)["existing-guidance"]).toEqual(
          unrelatedSettingsBefore,
        );
        expect(readLock(fixture.selected).skills["existing-guidance"]).toEqual(unrelatedLockBefore);
        const canonicalAfter = canonicalSnapshot(fixture.selected);
        for (const [file, before] of Object.entries(canonicalBefore)) {
          expect(canonicalAfter[file]).toBe(before);
        }
        for (const agent of [".claude", ".agents"]) {
          expect(
            fs.readFileSync(
              path.join(fixture.selected, agent, "skills", "existing-guidance", "SKILL.md"),
              "utf8",
            ),
          ).toBe(unrelatedBytes);
        }
      } finally {
        fixture.cleanup();
      }
    },
    30000,
  );

  it.effect("explicit all requires no selection prompt even when interaction is available", () =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace({
        flags: { nonInteractive: false },
        prompt: { confirmResponses: [true] },
      });
      try {
        const source = writeMultiSkillSource(workspace.root);
        const before = snapshotWorkspaceContent(source);
        yield* Effect.gen(function* () {
          const screen = yield* Screen;
          yield* handleSkillsInstall(
            { source: Option.some(source), skills: [], all: true },
            { force: false, preview: false },
          ).pipe(
            Effect.provideService(Screen, {
              ...screen,
              prompt: () => Effect.die(new Error("Explicit --all attempted a selection prompt")),
            }),
          );
        }).pipe(Effect.provide(workspace.layer));
        expectSelection(workspace.root, sourceSkills);
        expect(snapshotWorkspaceContent(source)).toEqual(before);
      } finally {
        workspace.cleanup();
      }
    }),
  );
});
