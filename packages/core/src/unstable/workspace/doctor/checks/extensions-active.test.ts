// TODO: (#51) Uses node:fs/node:os/node:path directly. Migrate to @effect/platform
// test utilities when available.
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { CodingAgentRepositoryLive } from "../../../agents/index.js";
import {
  decodeExtensionNameSync,
  decodeHandleSync,
  type ExtensionRef,
} from "../../../extensions/index.js";
import { normalizeHandle } from "../../../extensions/handle.js";
import { buildRegistrySkillRef } from "../../../skills/index.js";
import {
  type SourceHostProvidersService,
  SourceHostProviders,
} from "../../../source-resolution/index.js";
import { decodeExactSemverVersionSync } from "../../../version-constraints/version-constraints.js";
import { diagnoseWorkspaceDoctor } from "../diagnose.js";
import type { Check } from "../types.js";
import { makeRegistrySkillLockEntry, writeWorkspaceFiles } from "../../test-stubs.js";

const findCheck = (checks: ReadonlyArray<Check>, id: string): Check => {
  const match = checks.find((check) => check.id === id);
  if (match === undefined) {
    throw new Error(`expected a check with id "${id}"`);
  }
  return match;
};

describe("extensionsActiveCheck", () => {
  let tempDir: string;
  let axmDir: string;
  let originalCwd: string;
  let originalClaudeSkillsDir: string | undefined;

  beforeEach(() => {
    originalCwd = process.cwd();
    originalClaudeSkillsDir = process.env["AXM_CLAUDE_SKILLS_DIR"];
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "axm-doctor-extensions-active-"));
    axmDir = path.join(tempDir, ".axm");
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (originalClaudeSkillsDir === undefined) {
      delete process.env["AXM_CLAUDE_SKILLS_DIR"];
    } else {
      process.env["AXM_CLAUDE_SKILLS_DIR"] = originalClaudeSkillsDir;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const registrySources = [
    {
      name: "default",
      type: "registry" as const,
      location: new URL("https://registry.agentxm.ai"),
    },
  ];

  const registrySource = {
    type: "registry" as const,
    location: new URL("https://registry.agentxm.ai"),
    owner: Option.none(),
  };

  const makeSkillRef = (name = "code-review") =>
    buildRegistrySkillRef(
      decodeHandleSync("@acme"),
      decodeExtensionNameSync(name),
      decodeExactSemverVersionSync("1.0.0"),
      registrySource,
      [],
    );

  const makeLayers = (refs: ReadonlyArray<ExtensionRef> = []) => {
    const providers: SourceHostProvidersService = {
      find: (_source, options) =>
        Effect.succeed(refs.filter((ref) => options.type === "*" || ref.type === options.type)),
      fetch: () => Effect.die("unused in extensions-active tests"),
      cloneUrl: () => Option.none(),
      origin: () => "test",
    };
    return Layer.mergeAll(
      NodeServices.layer,
      CodingAgentRepositoryLive,
      Layer.succeed(SourceHostProviders, providers),
    );
  };

  const runDoctor = (refs: ReadonlyArray<ExtensionRef> = []) =>
    diagnoseWorkspaceDoctor({
      scope: "project",
      builtInSources: registrySources,
    }).pipe(Effect.provide(makeLayers(refs)));

  it.effect("passes when no extensions are declared", () =>
    Effect.gen(function* () {
      writeWorkspaceFiles(axmDir, { agents: ["claude-code"] });
      const skillsDir = path.join(tempDir, ".claude", "skills");
      fs.mkdirSync(skillsDir, { recursive: true });
      process.env["AXM_CLAUDE_SKILLS_DIR"] = skillsDir;

      const report = yield* runDoctor();
      const check = findCheck(report.checks, "extensions-active");

      expect(check.status).toBe("pass");
      expect(check.findings).toHaveLength(0);
    }),
  );

  it.effect("passes when enabled skill is linked in agent dir", () =>
    Effect.gen(function* () {
      writeWorkspaceFiles(axmDir, {
        agents: ["claude-code"],
        skills: { "code-review": "@acme/skills/code-review" },
        lockfileSkills: {
          "code-review": makeRegistrySkillLockEntry({
            owner: normalizeHandle("@acme"),
            name: "code-review",
          }),
        },
      });

      const canonicalDir = path.join(axmDir, "extensions", "@acme", "skills", "code-review");
      const srcDir = path.join(canonicalDir, "src");
      fs.mkdirSync(srcDir, { recursive: true });

      const skillsDir = path.join(tempDir, ".claude", "skills");
      fs.mkdirSync(skillsDir, { recursive: true });
      process.env["AXM_CLAUDE_SKILLS_DIR"] = skillsDir;

      fs.symlinkSync(srcDir, path.join(skillsDir, "code-review"));

      const report = yield* runDoctor([makeSkillRef("code-review")]);
      const check = findCheck(report.checks, "extensions-active");

      expect(check.status).toBe("pass");
      expect(
        check.findings.filter((f) => f.id === "extensions-active.enabled-not-linked"),
      ).toHaveLength(0);
    }),
  );

  it.effect("flags enabled skill not linked in agent dir", () =>
    Effect.gen(function* () {
      writeWorkspaceFiles(axmDir, {
        agents: ["claude-code"],
        skills: { "code-review": "@acme/skills/code-review" },
        lockfileSkills: {
          "code-review": makeRegistrySkillLockEntry({
            owner: normalizeHandle("@acme"),
            name: "code-review",
          }),
        },
      });

      const canonicalDir = path.join(axmDir, "extensions", "@acme", "skills", "code-review");
      const srcDir = path.join(canonicalDir, "src");
      fs.mkdirSync(srcDir, { recursive: true });

      const skillsDir = path.join(tempDir, ".claude", "skills");
      fs.mkdirSync(skillsDir, { recursive: true });
      process.env["AXM_CLAUDE_SKILLS_DIR"] = skillsDir;

      const report = yield* runDoctor([makeSkillRef("code-review")]);
      const check = findCheck(report.checks, "extensions-active");

      expect(check.status).toBe("fail");
      expect(check.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "extensions-active.enabled-not-linked",
            severity: "error",
            subject: { kind: "extension", ref: "skill:code-review" },
          }),
        ]),
      );
    }),
  );

  it.effect("flags disabled skill still present in agent dir", () =>
    Effect.gen(function* () {
      writeWorkspaceFiles(axmDir, {
        agents: ["claude-code"],
        skills: {
          "code-review": { source: "@acme/skills/code-review", enabled: false },
        },
        lockfileSkills: {
          "code-review": makeRegistrySkillLockEntry({
            owner: normalizeHandle("@acme"),
            name: "code-review",
          }),
        },
      });

      const canonicalDir = path.join(axmDir, "extensions", "@acme", "skills", "code-review");
      const srcDir = path.join(canonicalDir, "src");
      fs.mkdirSync(srcDir, { recursive: true });

      const skillsDir = path.join(tempDir, ".claude", "skills");
      fs.mkdirSync(skillsDir, { recursive: true });
      process.env["AXM_CLAUDE_SKILLS_DIR"] = skillsDir;

      fs.symlinkSync(srcDir, path.join(skillsDir, "code-review"));

      const report = yield* runDoctor([makeSkillRef("code-review")]);
      const check = findCheck(report.checks, "extensions-active");

      expect(check.status).toBe("fail");
      expect(check.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "extensions-active.disabled-still-present",
            severity: "error",
            subject: { kind: "extension", ref: "skill:code-review" },
          }),
        ]),
      );
    }),
  );

  it.effect("flags broken symlink in agent dir", () =>
    Effect.gen(function* () {
      writeWorkspaceFiles(axmDir, { agents: ["claude-code"] });

      const skillsDir = path.join(tempDir, ".claude", "skills");
      fs.mkdirSync(skillsDir, { recursive: true });
      process.env["AXM_CLAUDE_SKILLS_DIR"] = skillsDir;

      fs.symlinkSync("/nonexistent/path", path.join(skillsDir, "broken-skill"));

      const report = yield* runDoctor();
      const check = findCheck(report.checks, "extensions-active");

      expect(check.status).toBe("fail");
      expect(check.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "extensions-active.broken-symlink",
            severity: "error",
            subject: { kind: "file", ref: path.join(skillsDir, "broken-skill") },
          }),
        ]),
      );
    }),
  );

  it.effect("flags stale artifact in agent dir", () =>
    Effect.gen(function* () {
      writeWorkspaceFiles(axmDir, { agents: ["claude-code"] });

      const skillsDir = path.join(tempDir, ".claude", "skills");
      fs.mkdirSync(skillsDir, { recursive: true });
      process.env["AXM_CLAUDE_SKILLS_DIR"] = skillsDir;

      fs.mkdirSync(path.join(skillsDir, "old-leftover"), { recursive: true });

      const report = yield* runDoctor();
      const check = findCheck(report.checks, "extensions-active");

      expect(check.status).toBe("warn");
      expect(check.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "extensions-active.stale-artifact",
            severity: "warn",
            subject: { kind: "file", ref: path.join(skillsDir, "old-leftover") },
          }),
        ]),
      );
    }),
  );

  // The name-mismatch diagnostic fires when sanitizeName(settingsKey) differs
  // from path.basename(canonicalPath). For registry skills, canonicalPath is
  // derived from sanitizeName(ref.skill.name), and resolveConfiguredSkill
  // requires ref.skill.name === settingsKey. So for registry-only resolution,
  // the two are always equal and the diagnostic cannot fire. This test verifies
  // it stays silent as a guard against false positives.
  it.effect("does not flag name mismatch when settings key matches ref name", () =>
    Effect.gen(function* () {
      writeWorkspaceFiles(axmDir, {
        agents: ["claude-code"],
        skills: { "code-review": "@acme/skills/code-review" },
        lockfileSkills: {
          "code-review": makeRegistrySkillLockEntry({
            owner: normalizeHandle("@acme"),
            name: "code-review",
          }),
        },
      });

      const canonicalDir = path.join(axmDir, "extensions", "@acme", "skills", "code-review");
      const srcDir = path.join(canonicalDir, "src");
      fs.mkdirSync(srcDir, { recursive: true });

      const skillsDir = path.join(tempDir, ".claude", "skills");
      fs.mkdirSync(skillsDir, { recursive: true });
      process.env["AXM_CLAUDE_SKILLS_DIR"] = skillsDir;

      fs.symlinkSync(srcDir, path.join(skillsDir, "code-review"));

      const report = yield* runDoctor([makeSkillRef("code-review")]);
      const check = findCheck(report.checks, "extensions-active");

      expect(check.findings.filter((f) => f.id === "extensions-active.name-mismatch")).toHaveLength(
        0,
      );
    }),
  );

  // cross-agent-inconsistent requires 2+ agent skill directories. The current
  // codebase only resolves a single supported dir for "claude-code", so this
  // diagnostic always returns empty findings. Verified here as a no-op guard.
  it.effect("does not flag cross-agent inconsistency with a single agent", () =>
    Effect.gen(function* () {
      writeWorkspaceFiles(axmDir, {
        agents: ["claude-code"],
        skills: { "code-review": "@acme/skills/code-review" },
        lockfileSkills: {
          "code-review": makeRegistrySkillLockEntry({
            owner: normalizeHandle("@acme"),
            name: "code-review",
          }),
        },
      });

      const canonicalDir = path.join(axmDir, "extensions", "@acme", "skills", "code-review");
      const srcDir = path.join(canonicalDir, "src");
      fs.mkdirSync(srcDir, { recursive: true });

      const skillsDir = path.join(tempDir, ".claude", "skills");
      fs.mkdirSync(skillsDir, { recursive: true });
      process.env["AXM_CLAUDE_SKILLS_DIR"] = skillsDir;

      fs.symlinkSync(srcDir, path.join(skillsDir, "code-review"));

      const report = yield* runDoctor([makeSkillRef("code-review")]);
      const check = findCheck(report.checks, "extensions-active");

      expect(
        check.findings.filter((f) => f.id === "extensions-active.cross-agent-inconsistent"),
      ).toHaveLength(0);
    }),
  );

  it.effect("skips when extensions-installed fails", () =>
    Effect.gen(function* () {
      writeWorkspaceFiles(axmDir, {
        agents: ["claude-code"],
        skills: { "bad-skill": "bare-name" },
      });

      const skillsDir = path.join(tempDir, ".claude", "skills");
      fs.mkdirSync(skillsDir, { recursive: true });
      process.env["AXM_CLAUDE_SKILLS_DIR"] = skillsDir;

      const report = yield* runDoctor();
      const installedCheck = findCheck(report.checks, "extensions-installed");
      const activeCheck = findCheck(report.checks, "extensions-active");

      expect(installedCheck.status).toBe("fail");
      expect(activeCheck.status).toBe("skip");
    }),
  );

  it.effect("skips when agents-configured fails", () =>
    Effect.gen(function* () {
      writeWorkspaceFiles(axmDir, {
        agents: ["claude-code"],
        skills: { "code-review": "@acme/skills/code-review" },
        lockfileSkills: {
          "code-review": makeRegistrySkillLockEntry({
            owner: normalizeHandle("@acme"),
            name: "code-review",
          }),
        },
      });

      // Don't create the skills dir so agents-configured fails with target-dir-missing

      const report = yield* runDoctor([makeSkillRef("code-review")]);
      const agentsCheck = findCheck(report.checks, "agents-configured");
      const activeCheck = findCheck(report.checks, "extensions-active");

      expect(agentsCheck.status).toBe("fail");
      expect(activeCheck.status).toBe("skip");
    }),
  );
});
