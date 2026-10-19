import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import { makeEnvironmentProcessFixture } from "./test-support/environment-process-fixture.js";

export const specification = defineSpecification({
  requirement: "cli/setup/first-use-plan-and-migration",
  title: "First setup describes its writes and preserves instruction content",
  statement:
    "First setup shall describe the same configuration, bundled skill, native targets, instruction choice, migration, retained files, warnings and blockers in human and machine previews before approval, with a blocked preview remaining a successful read-only assessment and offering no apply command, report observed changes after apply, and replace only the regular instruction file used to seed its missing canonical source after verifying identical content, while preserving other instruction files and the Git index; a differing instruction file AXM has no record of writing stops setup before any write unless replacement is explicit.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "safe-repetition"],
  boundary: "process",
  boundaryRationale:
    "The shipped CLI owns the confirmation display, bundled installation, filesystem migration, and resulting report.",
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const document = Schema.Struct({
  result: Schema.Struct({
    steps: Schema.Array(
      Schema.Struct({
        artifact: Schema.optional(
          Schema.Struct({
            targets: Schema.optional(
              Schema.Array(Schema.Struct({ path: Schema.String, change: Schema.String })),
            ),
          }),
        ),
      }),
    ),
  }),
});
const targets = (stdout: string) =>
  Schema.decodeUnknownSync(document)(JSON.parse(stdout)).result.steps.flatMap(
    (step) => step.artifact?.targets ?? [],
  );

describe("First setup plan and migration", () => {
  it("sets up signed out without Git while reporting leftover links and preserving lazy state", async () => {
    const fixture = makeEnvironmentProcessFixture();
    try {
      const missingTarget = path.join(fixture.root, "removed-skill");
      const leftover = path.join(fixture.applicationHome, ".claude/skills/axm");
      fs.mkdirSync(path.dirname(leftover), { recursive: true });
      fs.symlinkSync(missingTarget, leftover, "dir");
      const args = ["setup", "--scope", "project", "--agent", "claude-code", "--non-interactive"];
      const human = await fixture.run([...args, "--preview"], { AXM_TELEMETRY: "off" });
      expect(human.exitCode, human.stdout + human.stderr).toBe(0);
      expect(human.stdout + human.stderr).toContain("Telemetry: off.");
      expect(human.stdout + human.stderr).toContain("Remove only this link");
      expect(fs.existsSync(path.join(fixture.invoking, "axm.json"))).toBe(false);
      const applied = await fixture.run([...args, "--yes", "--json"], { AXM_TELEMETRY: "off" });
      expect(applied.exitCode, applied.stderr).toBe(0);
      expect(JSON.parse(applied.stdout)).toMatchObject({
        result: { status: "initialized", telemetryEnabled: false },
      });
      for (const line of applied.stderr.trim().split("\n").filter(Boolean)) {
        expect(() => JSON.parse(line)).not.toThrow();
      }
      const settings: unknown = JSON.parse(
        fs.readFileSync(path.join(fixture.invoking, "axm.json"), "utf8"),
      );
      expect(settings).toMatchObject({ instructionFiles: { fileName: "AGENTS.md" } });
      expect(JSON.stringify(settings)).not.toContain("gitignoreAliases");
      expect(fs.existsSync(path.join(fixture.invoking, ".gitignore"))).toBe(false);
      expect(fs.existsSync(path.join(fixture.invoking, ".axm"))).toBe(false);
      expect(fs.readlinkSync(leftover)).toBe(missingTarget);
      const help = await fixture.run(["help", "basic-usage"]);
      expect(help.exitCode, help.stderr).toBe(0);
    } finally {
      fixture.cleanup();
    }
  });

  it("shows every target and migrates a tracked seed without changing the index", async () => {
    const fixture = makeEnvironmentProcessFixture();
    try {
      execFileSync("git", ["init", "-q"], { cwd: fixture.invoking });
      const payload = "# Team instructions\r\n\r\nKeep every byte.\r\n";
      fs.writeFileSync(path.join(fixture.invoking, "CLAUDE.md"), payload);
      fs.mkdirSync(path.join(fixture.invoking, "nested"));
      fs.writeFileSync(path.join(fixture.invoking, "nested/AGENTS.md"), "Nested instructions\n");
      execFileSync("git", ["add", "CLAUDE.md"], { cwd: fixture.invoking });
      const args = ["setup", "--scope", "project", "--agent", "claude-code", "--non-interactive"];
      const preview = await fixture.run([...args, "--preview", "--json"]);
      expect(preview.exitCode, preview.stdout + preview.stderr).toBe(0);
      const planned = targets(preview.stdout)
        .map((target) => target.path)
        .sort();
      expect(planned).toContain(".agents/skills/axm");
      expect(planned).toContain(".claude/skills/axm");
      expect(planned).toContain("axm.lock");
      expect(planned).toContain("nested/CLAUDE.md");
      const human = await fixture.run([...args, "--preview"]);
      expect(human.exitCode, human.stdout + human.stderr).toBe(0);
      for (const target of planned) expect(human.stdout + human.stderr).toContain(target);
      expect(human.stdout + human.stderr).toContain("replace seeded source with alias");
      expect(fs.existsSync(path.join(fixture.invoking, "AGENTS.md"))).toBe(false);
      const applied = await fixture.run([...args, "--yes", "--json"]);
      expect(applied.exitCode, applied.stdout + applied.stderr).toBe(0);
      expect(
        targets(applied.stdout)
          .map((target) => target.path)
          .sort(),
      ).toEqual(planned);
      expect(targets(applied.stdout)).toContainEqual({ path: "CLAUDE.md", change: "updated" });
      expect(targets(applied.stdout)).toContainEqual({ path: ".gitignore", change: "created" });
      expect(fs.readFileSync(path.join(fixture.invoking, "AGENTS.md"), "utf8")).toBe(payload);
      expect(fs.lstatSync(path.join(fixture.invoking, "CLAUDE.md")).isSymbolicLink()).toBe(true);
      expect(
        execFileSync("git", ["show", ":CLAUDE.md"], { cwd: fixture.invoking, encoding: "utf8" }),
      ).toBe(payload);
      expect(applied.stdout).toContain("git rm --cached");
      const lint = await fixture.run(["lint", "--json"]);
      expect(lint.stdout).not.toContain("workspace/instructions-target-unowned");
    } finally {
      fixture.cleanup();
    }
  });

  it("refuses a different unrecorded instruction file before writing until replacement is explicit", async () => {
    const fixture = makeEnvironmentProcessFixture();
    try {
      fs.writeFileSync(path.join(fixture.invoking, "AGENTS.md"), "Canonical instructions\n");
      fs.writeFileSync(path.join(fixture.invoking, "CLAUDE.md"), "Different instructions\n");
      const args = [
        "setup",
        "--yes",
        "--scope",
        "project",
        "--agent",
        "claude-code",
        "--non-interactive",
        "--json",
      ];
      const preview = await fixture.run([...args, "--preview"]);
      expect(preview.exitCode, preview.stdout + preview.stderr).toBe(0);
      const previewDocument: unknown = JSON.parse(preview.stdout);
      expect(previewDocument).toMatchObject({
        ok: true,
        result: {
          outcome: "previewed",
          blockedCount: 1,
          steps: expect.arrayContaining([
            expect.objectContaining({
              label: "Instruction files",
              status: "blocked",
              artifact: expect.objectContaining({
                targets: expect.arrayContaining([
                  expect.objectContaining({
                    path: "CLAUDE.md",
                    action: "blocked",
                    detail: expect.objectContaining({ blocked: true }),
                  }),
                ]),
              }),
            }),
          ]),
        },
      });
      expect(preview.stdout).not.toContain('"description": "Apply setup"');
      const human = await fixture.run(args.filter((arg) => arg !== "--json").concat("--preview"));
      expect(human.exitCode).toBe(0);
      expect(human.stdout + human.stderr).toContain("blocked");
      expect(human.stdout + human.stderr).toContain("CLAUDE.md");
      const refused = await fixture.run(args);
      expect(refused.exitCode, refused.stdout + refused.stderr).not.toBe(0);
      expect(refused.stdout).toContain('"code": "projection-output-unrecorded"');
      expect(refused.stdout).toContain("--replace-unrecorded");
      expect(fs.readFileSync(path.join(fixture.invoking, "CLAUDE.md"), "utf8")).toBe(
        "Different instructions\n",
      );
      expect(fs.readFileSync(path.join(fixture.invoking, "AGENTS.md"), "utf8")).toBe(
        "Canonical instructions\n",
      );
      expect(fs.existsSync(path.join(fixture.invoking, "axm.json"))).toBe(false);

      const replaced = await fixture.run([...args, "--replace-unrecorded"]);
      expect(replaced.exitCode, replaced.stdout + replaced.stderr).toBe(0);
      expect(targets(replaced.stdout)).toContainEqual({ path: "CLAUDE.md", change: "updated" });
      expect(targets(replaced.stdout)).toContainEqual({ path: "AGENTS.md", change: "unchanged" });
      expect(fs.readFileSync(path.join(fixture.invoking, "AGENTS.md"), "utf8")).toBe(
        "Canonical instructions\n",
      );
      expect(fs.readFileSync(path.join(fixture.invoking, "CLAUDE.md"), "utf8")).toBe(
        "Canonical instructions\n",
      );
    } finally {
      fixture.cleanup();
    }
  });
  it("keeps a fresh deferred workspace clean and reconciles its first source content", async () => {
    const fixture = makeEnvironmentProcessFixture();
    try {
      const args = [
        "setup",
        "--scope",
        "project",
        "--agent",
        "claude-code",
        "--instructions",
        "AGENTS.md",
        "--non-interactive",
        "--json",
      ];
      const preview = await fixture.run([...args, "--preview"]);
      expect(preview.exitCode, preview.stderr).toBe(0);
      expect(JSON.parse(preview.stdout)).toMatchObject({
        suggestions: [
          expect.objectContaining({
            description: "Apply setup",
            cmd: expect.stringContaining("--instructions AGENTS.md"),
          }),
        ],
      });
      expect(preview.stdout).toContain("--non-interactive --scope project --agent claude-code");
      const applied = await fixture.run([...args, "--yes"]);
      expect(applied.exitCode, applied.stderr).toBe(0);
      for (const file of ["AGENTS.md", "CLAUDE.md"])
        expect(fs.existsSync(path.join(fixture.invoking, file))).toBe(false);
      const lint = await fixture.run(["lint", "--json"]);
      expect(lint.exitCode, lint.stdout + lint.stderr).toBe(0);
      expect(JSON.parse(lint.stdout)).toMatchObject({ result: { findings: [] } });
      const sync = await fixture.run([
        "sync",
        "--preview",
        "--fail-on-change",
        "--json",
        "--non-interactive",
      ]);
      expect(sync.exitCode, sync.stdout + sync.stderr).toBe(0);
      expect(JSON.parse(sync.stdout)).toMatchObject({ result: { outcome: "no-op" } });
      const source = "First authored guidance.\n";
      fs.writeFileSync(path.join(fixture.invoking, "AGENTS.md"), source);
      const reconciled = await fixture.run(["sync", "--json", "--non-interactive"]);
      expect(reconciled.exitCode, reconciled.stdout + reconciled.stderr).toBe(0);
      expect(fs.readFileSync(path.join(fixture.invoking, "CLAUDE.md"), "utf8")).toBe(source);
      const again = await fixture.run([
        "sync",
        "--preview",
        "--fail-on-change",
        "--json",
        "--non-interactive",
      ]);
      expect(again.exitCode, again.stdout + again.stderr).toBe(0);
    } finally {
      fixture.cleanup();
    }
  });
  for (const choice of ["off", "./off"]) {
    it(`distinguishes instruction disablement from the literal source ${choice}`, async () => {
      const fixture = makeEnvironmentProcessFixture();
      try {
        const source = "Literal off source content.\n";
        fs.writeFileSync(path.join(fixture.invoking, "off"), source);
        const result = await fixture.run([
          "setup",
          "--scope",
          "project",
          "--agent",
          "claude-code",
          "--instructions",
          choice,
          "--yes",
          "--non-interactive",
          "--json",
        ]);
        expect(result.exitCode, result.stdout + result.stderr).toBe(0);
        expect(JSON.parse(result.stdout)).toMatchObject({
          result: {
            instructions:
              choice === "off" ? { enabled: false } : { enabled: true, fileName: "off" },
          },
        });
        expect(fs.readFileSync(path.join(fixture.invoking, "off"), "utf8")).toBe(source);
        expect(fs.existsSync(path.join(fixture.invoking, "AGENTS.md"))).toBe(false);
        expect(fs.existsSync(path.join(fixture.invoking, "CLAUDE.md"))).toBe(choice !== "off");
      } finally {
        fixture.cleanup();
      }
    });
  }
});
