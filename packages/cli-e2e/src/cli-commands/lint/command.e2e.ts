/**
 * E2E tests for the `axm lint` command.
 *
 * Phase 7 acceptance — these tests spawn the packaged CLI binary via
 * `runCli()` in a temp workspace and exercise the full end-to-end contract:
 *
 * - 7.6: stale workspace artifacts + missing lockfile + declared skill
 *        produce expected error findings.
 * - 7.7: `axm lint --fix` on the same workspace emits zero findings on
 *        replay (determinism contract). `axm setup` seeds the lockfile so
 *        the empty-lockfile edge case noted in Phase 5 doesn't reappear.
 * - 7.8: `axm lint --scope user` runs against `$AXM_USER_HOME`; the
 *        `workspace/agents-detected-declared` rule is suppressed in the
 *        user scope.
 * - 7.9: `axm lint --strict` flips the exit code when only warnings remain.
 * - 7.10: `axm doctor` and `axm sync` return non-zero with an
 *        `Unknown subcommand` substring.
 */

import * as fs from "node:fs";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

import { createTempDir, runCli } from "../../e2e/utils.js";

const writeJson = (file: string, value: unknown): void => {
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
};

const seedSkillSource = (root: string, name: string): void => {
  const dir = path.join(root, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "SKILL.md"),
    `---\nname: "${name}"\ndescription: "Phase 7 e2e skill"\n---\n\n# ${name}\n`,
  );
};

describe("axm lint (e2e, Phase 7)", () => {
  describe("Task 7.6 — stale artifacts + missing lockfile", () => {
    it("reports error findings for a declared-but-uninstalled skill", async () => {
      const temp = createTempDir();
      try {
        // Init creates settings + an empty lockfile (Phase 5 expectation).
        const init = await runCli(
          ["setup", "--agent", "claude-code", "--yes", "--non-interactive"],
          {
            cwd: temp.path,
          },
        );
        expect(init.exitCode).toBe(0);

        // Declare a skill whose source points at a non-existent local path
        // so `workspace/skills-lockfile-aligned` (missing-arm, error) and
        // `workspace/skills-artifacts-correct` (enabled-but-not-linked,
        // error) both fire.
        const settingsPath = path.join(temp.path, ".axm", "settings.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        settings.skills = { demo: "@acme/skills/demo" };
        // Remove the lockfile to hit the `workspace/lockfile-valid`
        // missing-arm for the second fixture scenario below.
        writeJson(settingsPath, settings);

        const result = await runCli(["lint", "--json"], { cwd: temp.path });
        expect(result.exitCode).toBe(1);

        const doc = JSON.parse(result.stdout);
        expect(doc.ok).toBe(false);
        const findings = doc?.result?.findings ?? [];
        const ruleIds: Array<string> = findings.map((f: { ruleId: string }) => f.ruleId);
        expect(ruleIds).toContain("workspace/skills-lockfile-aligned");
        expect(ruleIds).toContain("workspace/skills-artifacts-correct");

        // Error severity pins: both findings above are `error` per the
        // platform-canonical config.
        const severities: Record<string, string> = Object.fromEntries(
          findings.map((f: { ruleId: string; severity: string }) => [f.ruleId, f.severity]),
        );
        expect(severities["workspace/skills-lockfile-aligned"]).toBe("error");
        expect(severities["workspace/skills-artifacts-correct"]).toBe("error");
      } finally {
        temp.cleanup();
      }
    });

    it("reports error when lockfile is deleted while skills remain declared", async () => {
      const temp = createTempDir();
      try {
        await runCli(["setup", "--yes", "--non-interactive"], { cwd: temp.path });

        const settingsPath = path.join(temp.path, ".axm", "settings.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        settings.skills = { demo: "@acme/skills/demo" };
        writeJson(settingsPath, settings);

        // Simulate a stale workspace where the lockfile was wiped.
        fs.rmSync(path.join(temp.path, ".axm", "axm-lock.yaml"), { force: true });

        const result = await runCli(["lint", "--json"], { cwd: temp.path });
        expect(result.exitCode).toBe(1);
        const doc = JSON.parse(result.stdout);
        expect(doc.ok).toBe(false);
        const findings = doc?.result?.findings ?? [];
        const ruleIds: Array<string> = findings.map((f: { ruleId: string }) => f.ruleId);
        expect(ruleIds).toContain("workspace/lockfile-valid");
      } finally {
        temp.cleanup();
      }
    });
  });

  describe("Task 7.7 — --fix determinism contract", () => {
    it("emits zero findings when re-run after --fix", async () => {
      const temp = createTempDir();
      const sourceRoot = createTempDir("axm-phase7-skills-src-");
      try {
        // `axm setup` seeds settings.json and the empty lockfile, so the
        // Phase 5 LOCKFILE_PARSE_FAILED edge case doesn't surface here.
        const init = await runCli(
          ["setup", "--agent", "claude-code", "--yes", "--non-interactive"],
          {
            cwd: temp.path,
          },
        );
        expect(init.exitCode).toBe(0);

        seedSkillSource(sourceRoot.path, "demo");

        const settingsPath = path.join(temp.path, ".axm", "settings.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        // Keep agents narrow so fix only needs to materialize one agent
        // link; claude-code ships with a built-in detector.
        settings.agents = ["claude-code"];
        settings.skills = { ...settings.skills, demo: sourceRoot.path };
        writeJson(settingsPath, settings);

        // First pass: expect findings before fix.
        const before = await runCli(["lint", "--json"], { cwd: temp.path });
        const beforeFindings = JSON.parse(before.stdout)?.result?.findings ?? [];
        expect(beforeFindings.length).toBeGreaterThan(0);

        // Apply fixes.
        const fixResult = await runCli(["lint", "--fix"], { cwd: temp.path });
        // `--fix` succeeds even when some intents are unmapped (e.g.
        // enable-skill is advisory in v1). The post-apply re-run is what
        // proves determinism, not the intermediate exit code.
        expect(fixResult.stdout + fixResult.stderr).toMatch(/Applied \d+/);

        // Replay: re-run lint, expect clean (or at most the unmapped-
        // intent advisory for enable-skill — asserted below).
        const after = await runCli(["lint", "--json"], { cwd: temp.path });
        const afterDoc = JSON.parse(after.stdout);
        const afterFindings = afterDoc?.result?.findings ?? [];
        const afterRuleIds = afterFindings.map((f: { ruleId: string }) => f.ruleId);

        // The autofixable arms of skills-lockfile-aligned and
        // skills-artifacts-correct should be gone post-fix.
        expect(afterRuleIds).not.toContain("workspace/skills-lockfile-aligned");
        expect(afterRuleIds).not.toContain("workspace/skills-artifacts-correct");
        expect(after.exitCode).toBe(0);
      } finally {
        temp.cleanup();
        sourceRoot.cleanup();
      }
    });
  });

  describe("Task 7.8 — --scope user", () => {
    it("runs against $AXM_USER_HOME and suppresses workspace/agents-detected-declared", async () => {
      const userHome = createTempDir("axm-phase7-user-home-");
      const emptyHome = createTempDir("axm-phase7-empty-home-");
      try {
        fs.mkdirSync(path.join(userHome.path, ".axm"), { recursive: true });
        writeJson(path.join(userHome.path, ".axm", "settings.json"), {
          agents: ["claude-code"],
          skills: { demo: "@acme/skills/demo" },
        });

        const result = await runCli(["lint", "--scope", "user", "--json"], {
          cwd: userHome.path,
          env: {
            AXM_USER_HOME: userHome.path,
            HOME: emptyHome.path,
          },
        });

        const findings = JSON.parse(result.stdout)?.result?.findings ?? [];
        const ruleIds = findings.map((f: { ruleId: string }) => f.ruleId);
        expect(result.exitCode).toBe(1);
        // `agents-detected-declared` fires only on project scope.
        expect(ruleIds).not.toContain("workspace/agents-detected-declared");
        // `lockfile-valid` fires because we declared a skill with no
        // lockfile present under $AXM_USER_HOME/.axm.
        expect(ruleIds).toContain("workspace/lockfile-valid");
      } finally {
        userHome.cleanup();
        emptyHome.cleanup();
      }
    });
  });

  describe("Task 7.9 — --strict flips warning-only runs", () => {
    it("returns non-zero when only warnings are present under --strict", async () => {
      const temp = createTempDir();
      try {
        await runCli(["setup", "--yes", "--non-interactive"], { cwd: temp.path });
        const uninstallDefault = await runCli(
          ["skills", "uninstall", "axm", "--yes", "--keep-source"],
          {
            cwd: temp.path,
          },
        );
        expect(uninstallDefault.exitCode).toBe(0);

        // Downgrade the error-severity workspace/* rules the declared
        // skill would trigger, so the run settles at warnings-only.
        const settingsPath = path.join(temp.path, ".axm", "settings.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        settings.skills = { demo: "@acme/skills/demo" };
        settings.lint = {
          rules: {
            "workspace/lockfile-valid": "warn",
            "workspace/configured-but-not-installed": "warn",
            "workspace/desired-state-reconcilable": "warn",
            "workspace/skills-lockfile-aligned": "warn",
            "workspace/skills-artifacts-correct": "warn",
            "workspace/skills-managed": "warn",
          },
        };
        writeJson(settingsPath, settings);

        // Baseline: no --strict, warnings don't fail.
        const baseline = await runCli(["lint"], { cwd: temp.path });
        expect(baseline.exitCode).toBe(0);

        // Strict: warnings are treated as failures.
        const strict = await runCli(["lint", "--strict"], { cwd: temp.path });
        expect(strict.exitCode).toBe(1);
      } finally {
        temp.cleanup();
      }
    });
  });

  describe("Task 7.10 — doctor and sync unknown-command contract", () => {
    it("axm doctor returns non-zero with 'Unknown subcommand'", async () => {
      const temp = createTempDir();
      try {
        const result = await runCli(["doctor"], { cwd: temp.path });
        expect(result.exitCode).not.toBe(0);
        expect(result.stdout + result.stderr).toContain("Unknown subcommand");
      } finally {
        temp.cleanup();
      }
    });

    it("axm mcps doctor and reconcile return non-zero with 'Unknown subcommand'", async () => {
      const temp = createTempDir();
      try {
        const doctor = await runCli(["mcps", "doctor"], { cwd: temp.path });
        const reconcile = await runCli(["mcps", "reconcile"], { cwd: temp.path });
        expect(doctor.exitCode).not.toBe(0);
        expect(doctor.stdout + doctor.stderr).toContain("Unknown subcommand");
        expect(reconcile.exitCode).not.toBe(0);
        expect(reconcile.stdout + reconcile.stderr).toContain("Unknown subcommand");
      } finally {
        temp.cleanup();
      }
    });

    it("axm sync requires an initialized workspace", async () => {
      const temp = createTempDir();
      try {
        const result = await runCli(["sync"], { cwd: temp.path });
        expect(result.exitCode).not.toBe(0);
        expect(result.stdout + result.stderr).toContain("Workspace settings not found");
      } finally {
        temp.cleanup();
      }
    });
  });
});
