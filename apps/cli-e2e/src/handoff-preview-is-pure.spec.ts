import { defineSpecification } from "@agentxm/specification-metadata";
import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { makeEnvironmentProcessFixture } from "./test-support/environment-process-fixture.js";

export const specification = defineSpecification({
  requirement: "cli/skills/handoff/preview-is-pure",
  title: "Handoff preview preserves both managers' authority",
  statement:
    "Skills handoff preview shall describe the selected transfer without creating AXM settings or changing the former manager lock or native payload; applying the same explicit selection shall transfer management while preserving unrelated records.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "workspace-intent-fidelity"],
  boundary: "process",
  boundaryRationale:
    "The shipped CLI owns selecting the manager's default scope, first-use workspace state, preview mode, and the subsequent apply invocation.",
  methods: ["example", "decision-table"],
  derivedFrom: ["cli/skills/handoff-preserves-selected-ownership"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Skills handoff command", () => {
  for (const scope of ["project", "user"] as const) {
    it(`previews and transfers ${scope} ownership without setup`, async () => {
      const fixture = makeEnvironmentProcessFixture();
      try {
        const root = scope === "project" ? fixture.invoking : fixture.applicationHome;
        const source = path.join(fixture.root, "upstream", "review");
        const native = path.join(root, ".agents", "skills", "review");
        const projected = path.join(root, ".claude", "skills", "review");
        const body = "---\nname: review\ncustom: keep\n---\n# Review\n";
        fs.mkdirSync(source, { recursive: true });
        fs.mkdirSync(native, { recursive: true });
        fs.mkdirSync(path.dirname(projected), { recursive: true });
        fs.writeFileSync(path.join(source, "SKILL.md"), body);
        fs.writeFileSync(path.join(native, "SKILL.md"), body);
        fs.symlinkSync(path.relative(path.dirname(projected), native), projected);
        const foreignLock = path.join(
          root,
          scope === "project" ? "skills-lock.json" : ".agents/.skill-lock.json",
        );
        const original = JSON.stringify({
          version: scope === "project" ? 1 : 3,
          custom: { keep: true },
          skills: {
            review: {
              source,
              sourceUrl: source,
              sourceType: "local",
              ...(scope === "project"
                ? {
                    computedHash: createHash("sha256")
                      .update("SKILL.md")
                      .update(body)
                      .digest("hex"),
                  }
                : { skillFolderHash: "a".repeat(40) }),
            },
            unrelated: { sourceType: "future", source: "keep" },
          },
        });
        fs.writeFileSync(foreignLock, original);
        const args = [
          "skills",
          "handoff",
          "--skill",
          "review",
          "--scope",
          scope,
          "--agent",
          "claude-code",
          "--json",
          "--non-interactive",
        ];
        const environment = { XDG_STATE_HOME: "" };
        const preview = await fixture.run([...args, "--preview"], environment);
        expect(preview.exitCode, preview.stdout + preview.stderr).toBe(0);
        expect(fs.readFileSync(foreignLock, "utf8")).toBe(original);
        expect(fs.readFileSync(path.join(native, "SKILL.md"), "utf8")).toBe(body);
        expect(fs.realpathSync(projected)).toBe(native);
        const workspace = scope === "project" ? root : path.join(root, ".axm", "workspace");
        expect(fs.existsSync(path.join(workspace, "axm.json"))).toBe(false);
        const applied = await fixture.run(args, environment);
        expect(applied.exitCode, applied.stdout + applied.stderr).toBe(0);
        expect(fs.readFileSync(path.join(projected, "SKILL.md"), "utf8")).toBe(body);
        const remaining: unknown = JSON.parse(fs.readFileSync(foreignLock, "utf8"));
        expect(remaining).toEqual({
          version: scope === "project" ? 1 : 3,
          custom: { keep: true },
          skills: { unrelated: { sourceType: "future", source: "keep" } },
        });
        const settings: unknown = JSON.parse(
          fs.readFileSync(path.join(workspace, "axm.json"), "utf8"),
        );
        expect(settings).toMatchObject({ agents: ["claude-code"] });
        expect(settings).not.toHaveProperty("instructionFiles");
        expect(settings).toHaveProperty("skills.review");
        expect(settings).not.toHaveProperty("skills.axm");
      } finally {
        fixture.cleanup();
      }
    });
  }
});
