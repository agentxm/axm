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
  type SourceHostProvidersService,
  SourceHostProviders,
} from "../../../source-resolution/index.js";
import { Workspace } from "../../service-interface.js";
import { makeBaseWorkspaceMock, writeWorkspaceFiles } from "../../test-stubs.js";
import { defineCheck } from "../check-def.js";
import { runCheckGraph } from "../runner.js";
import { agentsConfiguredCheck } from "./agents-configured.js";
import { diagnoseWorkspaceDoctor } from "../diagnose.js";
import type { Check } from "../types.js";

const findCheck = (checks: ReadonlyArray<Check>, id: string): Check => {
  const match = checks.find((check) => check.id === id);
  if (match === undefined) {
    throw new Error(`expected a check with id "${id}"`);
  }
  return match;
};

const tryMakeUnwritableDirectory = (dirPath: string): boolean => {
  try {
    fs.chmodSync(dirPath, 0o555);
  } catch {
    return false;
  }

  try {
    fs.writeFileSync(path.join(dirPath, ".probe"), "x");
    fs.rmSync(path.join(dirPath, ".probe"), { force: true });
    return false;
  } catch {
    return true;
  }
};

const restoreDirectoryPermissions = (dirPath: string): void => {
  try {
    fs.chmodSync(dirPath, 0o755);
  } catch {
    // best effort
  }
};

describe("agentsConfiguredCheck", () => {
  let tempDir: string;
  let axmDir: string;
  let originalCwd: string;
  let originalClaudeSkillsDir: string | undefined;

  beforeEach(() => {
    originalCwd = process.cwd();
    originalClaudeSkillsDir = process.env["AXM_CLAUDE_SKILLS_DIR"];
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "axm-doctor-agents-configured-"));
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

  const makeLayers = () => {
    const providers: SourceHostProvidersService = {
      find: () => Effect.succeed([]),
      fetch: () => Effect.die("unused in agents-configured tests"),
      cloneUrl: () => Option.none(),
      origin: () => "test",
    };

    return Layer.mergeAll(
      NodeServices.layer,
      CodingAgentRepositoryLive,
      Layer.succeed(SourceHostProviders, providers),
    );
  };

  const runDoctor = () =>
    diagnoseWorkspaceDoctor({
      scope: "project",
      builtInSources: registrySources,
    }).pipe(Effect.provide(makeLayers()));

  it.effect("fails when a configured agent id is unknown", () =>
    Effect.gen(function* () {
      const workspaceService = makeBaseWorkspaceMock(axmDir, {
        getConfiguredAgents: () => Effect.succeed(["unknown-agent"]),
      });
      const workspaceReadyCheck = defineCheck({
        id: "workspace-ready",
        title: "Workspace is ready",
        description: "stub",
        dependsOn: [],
        prepareContext: Effect.void,
        diagnostics: [
          {
            id: "workspace-ready.stub",
            run: () => Effect.succeed([]),
          },
        ],
      });
      const report = yield* runCheckGraph([workspaceReadyCheck, agentsConfiguredCheck], {
        scope: "project",
        path: axmDir,
        baseDir: tempDir,
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
            NodeServices.layer,
            Workspace.layer(workspaceService),
            CodingAgentRepositoryLive,
          ),
        ),
      );
      const check = findCheck(report.checks, "agents-configured");
      const finding = check.findings.find(
        (entry) => entry.id === "agents-configured.unrecognized-agent",
      );

      expect(check.status).toBe("fail");
      expect(finding).toMatchObject({
        severity: "error",
        subject: { kind: "agent", ref: "unknown-agent" },
      });
    }),
  );

  it.effect("fails when the configured target directory is missing", () =>
    Effect.gen(function* () {
      writeWorkspaceFiles(axmDir, { agents: ["claude-code"] });

      const report = yield* runDoctor();
      const check = findCheck(report.checks, "agents-configured");

      expect(check.status).toBe("fail");
      expect(check.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "agents-configured.target-dir-missing",
            severity: "error",
            action: expect.objectContaining({ command: "axm sync" }),
          }),
        ]),
      );
      expect(
        check.findings.some((finding) => finding.id === "agents-configured.declared-not-detected"),
      ).toBe(false);
    }),
  );

  it.effect("fails when the configured target directory is not writable", () =>
    Effect.gen(function* () {
      writeWorkspaceFiles(axmDir, { agents: ["claude-code"] });
      const claudeSkillsDir = path.join(tempDir, ".claude", "skills");
      fs.mkdirSync(claudeSkillsDir, { recursive: true });

      if (!tryMakeUnwritableDirectory(claudeSkillsDir)) {
        return;
      }

      const report = yield* runDoctor();
      const check = findCheck(report.checks, "agents-configured");

      expect(check.status).toBe("fail");
      expect(check.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "agents-configured.target-dir-not-writable",
            severity: "error",
          }),
        ]),
      );
    }).pipe(
      Effect.ensuring(
        Effect.sync(() => {
          restoreDirectoryPermissions(path.join(tempDir, ".claude", "skills"));
        }),
      ),
    ),
  );

  it.effect("emits info when an agent is declared but not detected on disk", () =>
    Effect.gen(function* () {
      process.env["AXM_CLAUDE_SKILLS_DIR"] = "custom-skills";
      writeWorkspaceFiles(axmDir, { agents: ["claude-code"] });
      fs.mkdirSync(path.join(tempDir, "custom-skills"), { recursive: true });

      const report = yield* runDoctor();
      const check = findCheck(report.checks, "agents-configured");

      expect(report.healthy).toBe(true);
      expect(check.status).toBe("pass");
      expect(check.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "agents-configured.declared-not-detected",
            severity: "info",
            subject: { kind: "agent", ref: "claude-code" },
          }),
        ]),
      );
    }),
  );

  it.effect("warns when an agent is detected but not configured", () =>
    Effect.gen(function* () {
      writeWorkspaceFiles(axmDir, { agents: [] });
      fs.mkdirSync(path.join(tempDir, ".claude"), { recursive: true });

      const report = yield* runDoctor();
      const check = findCheck(report.checks, "agents-configured");

      expect(report.healthy).toBe(true);
      expect(check.status).toBe("warn");
      expect(check.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "agents-configured.detected-not-declared",
            severity: "warn",
            subject: { kind: "agent", ref: "claude-code" },
          }),
        ]),
      );
    }),
  );
});
