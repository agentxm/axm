import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeDirectoryFixture } from "../support/directory-harness.js";
import { writeLocalSkillPackage } from "../support/install-harness.js";
import { snapshotWorkspaceContent } from "../support/workspace-fixtures.js";

export const specification = defineSpecification({
  requirement: "cli/installed-state-stays-in-selected-scope",
  title: "Installed state stays in the selected scope",
  statement:
    "Commands that operate on installed extensions shall read and change the selected project or user workspace and its agent projections while preserving the other scope's workspace and projections.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "safe-repetition"],
  boundary: "process",
  boundaryRationale:
    "Separate CLI invocations establish scope selection, persisted settings and resolution, and project-versus-home native projection paths through the built entry point.",
  methods: ["decision-table", "example"],
  derivedFrom: [
    "packages/cli/src/root/scope-contract.ts",
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
