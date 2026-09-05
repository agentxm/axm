import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";
import {
  AgentsListOutputSchema,
  InstructionsStatusOutputSchema,
} from "axm.sh/specification-harness";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeDirectoryFixture } from "../support/directory-harness.js";
import { writeLocalSkillPackage } from "../support/install-harness.js";
import { snapshotWorkspaceContent } from "../support/workspace-fixtures.js";

export const specification = defineSpecification({
  requirement: "cli/installed-state-stays-in-selected-scope",
  title: "Installed extensions, coding agents, and instruction files stay in the selected scope",
  statement:
    "Installed-extension operations, coding-agent listing and membership changes, and instruction-file inspection, enablement, and disablement shall use the selected project or user workspace and its native files for workspace results and changes, default to project scope when no workspace scope is selected, and preserve the other scope's workspace and native files.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "safe-repetition"],
  boundary: "process",
  boundaryRationale:
    "Separate built CLI invocations establish explicit and default workspace scope through the registered commands, observe persisted extension state, agent membership, and instruction-file settings, and read actual project-versus-home native output content.",
  methods: ["decision-table", "example"],
  derivedFrom: [
    "packages/cli/src/root/scope-contract.ts",
    "packages/cli/src/root/agents/list.ts",
    "packages/cli/src/root/agents/add.ts",
    "packages/cli/src/root/agents/remove.ts",
    "packages/cli/src/root/instructions.ts",
    "docs/architecture/workspace/agents.md",
    "docs/architecture/workspace/instruction-files.md",
    "packages/cli-e2e/src/scope-consistency.e2e.test.ts",
    "packages/cli-e2e/src/activation-lifecycle.e2e.test.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Installed state stays in the selected scope", () => {
  for (const scope of ["project", "user"] as const) {
    it(`${scope} lifecycle preserves the other workspace and native files`, async () => {
      const fixture = makeDirectoryFixture();
      try {
        const run = (args: ReadonlyArray<string>) =>
          fixture.run(["-C", fixture.selected, ...args, "--non-interactive", "--json"]);
        for (const initializedScope of ["project", "user"]) {
          const setup = await run([
            "setup",
            "--yes",
            "--scope",
            initializedScope,
            "--agent",
            "claude-code",
          ]);
          expect(setup.exitCode, setup.stdout + setup.stderr).toBe(0);
        }
        const userWorkspace = path.join(fixture.home, ".axm", "workspace");
        const selectedWorkspace = scope === "project" ? fixture.selected : userWorkspace;
        const otherWorkspace = scope === "project" ? userWorkspace : fixture.selected;
        const selectedNative = path.join(
          scope === "project" ? fixture.selected : fixture.home,
          ".claude",
        );
        const otherNative = path.join(
          scope === "project" ? fixture.home : fixture.selected,
          ".claude",
        );
        fs.mkdirSync(otherNative, { recursive: true });
        fs.writeFileSync(path.join(otherNative, "keep.txt"), "Unowned native content");
        const otherName = scope === "project" ? "user-other-review" : "project-other-review";
        const otherSource = writeLocalSkillPackage(fixture.root, { name: otherName });
        const otherInstall = await run([
          "install",
          otherSource,
          "--scope",
          scope === "project" ? "user" : "project",
        ]);
        expect(otherInstall.exitCode, otherInstall.stdout + otherInstall.stderr).toBe(0);
        const beforeWorkspace = snapshotWorkspaceContent(otherWorkspace);
        const beforeNative = snapshotWorkspaceContent(otherNative);
        const name = `${scope}-review`;
        const source = writeLocalSkillPackage(fixture.root, { name });
        const sourceText = fs.readFileSync(path.join(source, "src", "SKILL.md"), "utf8");
        const installed = await run(["install", source, "--scope", scope]);
        expect(installed.exitCode, installed.stdout + installed.stderr).toBe(0);
        expect(
          fs.existsSync(path.join(selectedNative, "skills", name, "SKILL.md")),
          installed.stdout + installed.stderr,
        ).toBe(true);
        expect(fs.readFileSync(path.join(selectedNative, "skills", name, "SKILL.md"), "utf8")).toBe(
          sourceText,
        );
        const settings: unknown = JSON.parse(
          fs.readFileSync(path.join(selectedWorkspace, "axm.json"), "utf8"),
        );
        expect(settings).toMatchObject({ skills: { [name]: expect.anything() } });

        for (const args of [
          ["list"],
          ["skills", "list"],
          ["skills", "show", name],
          ["skills", "disable", name],
          ["sync"],
          ["skills", "enable", name],
          ["lint"],
        ]) {
          const result = await run([...args, "--scope", scope]);
          expect(result.exitCode, `${args.join(" ")}\n${result.stdout}${result.stderr}`).toBe(0);
          if (args[0] === "list" || args[1] === "list" || args[1] === "show") {
            expect(result.stdout).toContain(name);
            expect(result.stdout).not.toContain(otherName);
          }
          if (args[1] === "disable" || args[0] === "sync") {
            expect(fs.existsSync(path.join(selectedNative, "skills", name))).toBe(false);
          }
          if (args[1] === "enable") {
            expect(
              fs.existsSync(path.join(selectedNative, "skills", name, "SKILL.md")),
              result.stdout + result.stderr,
            ).toBe(true);
            expect(
              fs.readFileSync(path.join(selectedNative, "skills", name, "SKILL.md"), "utf8"),
            ).toBe(sourceText);
          }
          expect(snapshotWorkspaceContent(otherWorkspace)).toEqual(beforeWorkspace);
          expect(snapshotWorkspaceContent(otherNative)).toEqual(beforeNative);
        }
        const removed = await run(["uninstall", `@acme/skills/${name}`, "--scope", scope]);
        expect(removed.exitCode, removed.stdout + removed.stderr).toBe(0);
        expect(fs.existsSync(path.join(selectedNative, "skills", name))).toBe(false);
        expect(snapshotWorkspaceContent(otherWorkspace)).toEqual(beforeWorkspace);
        expect(snapshotWorkspaceContent(otherNative)).toEqual(beforeNative);
      } finally {
        fixture.cleanup();
      }
    }, 30000);
  }
});

const configurationSelections = ["default", "project", "user"] as const;
type ConfigurationSelection = (typeof configurationSelections)[number];

const makeConfigurationScopeFixture = async (selection: ConfigurationSelection) => {
  const fixture = makeDirectoryFixture();
  try {
    // Initialize the process runtime before snapshots include the isolated home;
    // Bun's first launch may populate its own transpiler cache there.
    const prepared = await fixture.run(["--version"]);
    expect(prepared.exitCode, prepared.stdout + prepared.stderr).toBe(0);
    const userWorkspace = path.join(fixture.home, ".axm", "workspace");
    fs.mkdirSync(userWorkspace, { recursive: true });
    const settings = {
      project: { owner: "@acme", agents: ["claude-code", "codex"], instructionFiles: false },
      user: { owner: "@acme", agents: ["claude-code", "cursor"], instructionFiles: false },
    };
    const sources = { project: "PROJECT.md", user: "USER.md" };
    const bodies = {
      project: "Project authored instructions.\n",
      user: "User authored instructions.\n",
    };
    for (const scope of ["project", "user"] as const) {
      const workspace = scope === "project" ? fixture.selected : userWorkspace;
      const native = scope === "project" ? fixture.selected : fixture.home;
      fs.writeFileSync(
        path.join(workspace, "axm.json"),
        `${JSON.stringify(settings[scope], null, 2)}\n`,
      );
      fs.writeFileSync(path.join(native, sources[scope]), bodies[scope]);
      fs.writeFileSync(path.join(native, "untouched.txt"), `${scope} unowned native content\n`);
    }
    // Detection evidence exists only in the user scope, independently of membership.
    fs.mkdirSync(path.join(fixture.home, ".gemini"));
    const scope = selection === "default" ? "project" : selection;
    const otherScope: "project" | "user" = scope === "project" ? "user" : "project";
    const selectedWorkspace = scope === "project" ? fixture.selected : userWorkspace;
    const selectedNative = scope === "project" ? fixture.selected : fixture.home;
    const otherNative = scope === "project" ? fixture.home : fixture.selected;
    const run = (args: ReadonlyArray<string>, selected: ConfigurationSelection = selection) =>
      fixture.run([
        "-C",
        fixture.selected,
        ...args,
        ...(selected === "default" ? [] : ["--scope", selected]),
        "--non-interactive",
        "--json",
      ]);
    const readSettings = (): unknown =>
      JSON.parse(fs.readFileSync(path.join(selectedWorkspace, "axm.json"), "utf8"));
    return {
      ...fixture,
      scope,
      otherScope,
      selectedNative,
      otherNative,
      run,
      readSettings,
      expectedSettings: settings[scope],
      sources,
      bodies,
    };
  } catch (error) {
    fixture.cleanup();
    throw error;
  }
};

const decodeAgentScopeResult = Schema.decodeUnknownSync(
  Schema.Struct({ ok: Schema.Literal(true), result: AgentsListOutputSchema }),
);
const decodeInstructionScopeResult = Schema.decodeUnknownSync(
  Schema.Struct({ ok: Schema.Literal(true), result: InstructionsStatusOutputSchema }),
);

describe("Agent membership and instruction files stay in the selected scope", () => {
  for (const selection of configurationSelections) {
    it(`${selection} agent commands use only the selected configuration without installed extensions`, async () => {
      const fixture = await makeConfigurationScopeFixture(selection);
      try {
        const selectedBefore = snapshotWorkspaceContent(fixture.selectedNative);
        const otherBefore = snapshotWorkspaceContent(fixture.otherNative);

        const listed = await fixture.run(["agents", "list"]);

        expect(listed.exitCode, listed.stdout + listed.stderr).toBe(0);
        const parsed: unknown = JSON.parse(listed.stdout);
        const list = decodeAgentScopeResult(parsed).result;
        expect(list.configured).toEqual(fixture.expectedSettings.agents);
        if (fixture.scope === "user") expect(list.detected).toContain("gemini-cli");
        else expect(list.detected).not.toContain("gemini-cli");
        expect(snapshotWorkspaceContent(fixture.selectedNative)).toEqual(selectedBefore);
        expect(snapshotWorkspaceContent(fixture.otherNative)).toEqual(otherBefore);

        const added = await fixture.run(["agents", "add", "opencode"]);

        expect(added.exitCode, added.stdout + added.stderr).toBe(0);
        expect(fixture.readSettings()).toEqual({
          ...fixture.expectedSettings,
          agents: [...fixture.expectedSettings.agents, "opencode"],
        });
        expect(snapshotWorkspaceContent(fixture.otherNative)).toEqual(otherBefore);

        const removed = await fixture.run(["agents", "remove", "opencode"]);

        expect(removed.exitCode, removed.stdout + removed.stderr).toBe(0);
        expect(fixture.readSettings()).toEqual(fixture.expectedSettings);
        expect(snapshotWorkspaceContent(fixture.otherNative)).toEqual(otherBefore);
      } finally {
        fixture.cleanup();
      }
    }, 30000);

    it(`${selection} instruction commands use selected settings and actual aliases while preserving the other scope`, async () => {
      const fixture = await makeConfigurationScopeFixture(selection);
      try {
        const otherEnable = await fixture.run(
          [
            "instructions",
            "enable",
            "--file",
            fixture.sources[fixture.otherScope],
            "--no-gitignore",
          ],
          fixture.otherScope,
        );
        expect(otherEnable.exitCode, otherEnable.stdout + otherEnable.stderr).toBe(0);
        const otherAlias = path.join(fixture.otherNative, "CLAUDE.md");
        expect(fs.readFileSync(otherAlias, "utf8")).toContain(fixture.bodies[fixture.otherScope]);
        const otherBefore = snapshotWorkspaceContent(fixture.otherNative);
        const beforeRead = snapshotWorkspaceContent(fixture.selectedNative);

        const disabled = await fixture.run(["instructions"]);

        expect(disabled.exitCode, disabled.stdout + disabled.stderr).toBe(0);
        const disabledJson: unknown = JSON.parse(disabled.stdout);
        expect(decodeInstructionScopeResult(disabledJson).result).toMatchObject({ enabled: false });
        expect(snapshotWorkspaceContent(fixture.selectedNative)).toEqual(beforeRead);
        expect(snapshotWorkspaceContent(fixture.otherNative)).toEqual(otherBefore);

        const enabled = await fixture.run([
          "instructions",
          "enable",
          "--file",
          fixture.sources[fixture.scope],
          "--no-gitignore",
        ]);

        expect(enabled.exitCode, enabled.stdout + enabled.stderr).toBe(0);
        expect(fixture.readSettings()).toEqual({
          ...fixture.expectedSettings,
          instructionFiles: { fileName: fixture.sources[fixture.scope], gitignoreAliases: false },
        });
        expect(snapshotWorkspaceContent(fixture.otherNative)).toEqual(otherBefore);
        const enabledBeforeRead = snapshotWorkspaceContent(fixture.selectedNative);

        const inspected = await fixture.run(["instructions"]);

        expect(inspected.exitCode, inspected.stdout + inspected.stderr).toBe(0);
        const inspectedJson: unknown = JSON.parse(inspected.stdout);
        const status = decodeInstructionScopeResult(inspectedJson).result;
        expect(status).toMatchObject({
          enabled: true,
          sourceFileName: fixture.sources[fixture.scope],
        });
        expect(status.roots).toEqual([fixture.selectedNative]);
        const alias = status.items.find((item) => item.agentId === "claude-code");
        if (alias === undefined)
          throw new Error("Expected the configured Claude Code instruction target");
        expect(alias.sourceFile).toBe(
          path.join(fixture.selectedNative, fixture.sources[fixture.scope]),
        );
        expect(alias.targetFile).toBe(path.join(fixture.selectedNative, "CLAUDE.md"));
        expect(fs.readFileSync(alias.targetFile, "utf8")).toContain(fixture.bodies[fixture.scope]);
        expect(snapshotWorkspaceContent(fixture.selectedNative)).toEqual(enabledBeforeRead);
        expect(snapshotWorkspaceContent(fixture.otherNative)).toEqual(otherBefore);

        const turnedOff = await fixture.run(["instructions", "disable"]);

        expect(turnedOff.exitCode, turnedOff.stdout + turnedOff.stderr).toBe(0);
        expect(fixture.readSettings()).toEqual(fixture.expectedSettings);
        expect(fs.existsSync(alias.targetFile)).toBe(false);
        expect(fs.readFileSync(alias.sourceFile, "utf8")).toBe(fixture.bodies[fixture.scope]);
        expect(snapshotWorkspaceContent(fixture.otherNative)).toEqual(otherBefore);
      } finally {
        fixture.cleanup();
      }
    }, 30000);
  }
});
