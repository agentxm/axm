// TODO: (#51) Uses node:fs/node:os/node:path directly. Migrate to @effect/platform
// test utilities when available.
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import type { WorkspaceLocation } from "../../paths.js";
import { runCheckGraph } from "../runner.js";
import type { Check } from "../types.js";
import { makeWorkspaceReadyCheck } from "./workspace-ready.js";

const findCheck = (checks: ReadonlyArray<Check>, id: string): Check => {
  const match = checks.find((check) => check.id === id);
  if (match === undefined) {
    throw new Error(`expected a check with id "${id}"`);
  }
  return match;
};

// Attempts to chmod the file to 0 and confirms the kernel honored it (some CI
// environments running as root silently ignore chmod on files). Returns true
// if the file is now actually unreadable.
const tryMakeUnreadable = (filePath: string): boolean => {
  try {
    fs.chmodSync(filePath, 0o000);
  } catch {
    return false;
  }
  try {
    fs.readFileSync(filePath);
    return false;
  } catch {
    return true;
  }
};

// Best-effort restore of permissions so afterEach rmSync can clean up.
const restorePermissions = (filePath: string): void => {
  try {
    fs.chmodSync(filePath, 0o644);
  } catch {
    // best-effort; the tmp dir will still be removed
  }
};

describe("workspaceReadyCheck", () => {
  let tempDir: string;
  let axmDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "axm-doctor-workspace-ready-"));
    axmDir = path.join(tempDir, ".axm");
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const workspace = (): WorkspaceLocation => ({
    scope: "project",
    path: axmDir,
    baseDir: tempDir,
  });

  const runCheck = () =>
    runCheckGraph([makeWorkspaceReadyCheck(workspace())], workspace()).pipe(
      Effect.provide(NodeServices.layer),
    );

  it.effect("emits directory-missing when .axm is absent", () =>
    Effect.gen(function* () {
      const report = yield* runCheck();
      const check = findCheck(report.checks, "workspace-ready");
      expect(check.status).toBe("fail");
      const ids = check.findings.map((f) => f.id);
      expect(ids).toContain("workspace-ready.directory-missing");
      expect(check.findings).toHaveLength(1);
      const finding = check.findings[0];
      expect(finding?.severity).toBe("error");
      expect(finding?.message).toBe(".axm directory not found");
      expect(finding?.action?.command).toBe("axm init");
      expect(report.healthy).toBe(false);
    }),
  );

  it.effect("emits settings-missing when .axm exists without settings.json", () =>
    Effect.gen(function* () {
      fs.mkdirSync(axmDir, { recursive: true });
      const report = yield* runCheck();
      const check = findCheck(report.checks, "workspace-ready");
      expect(check.status).toBe("fail");
      expect(check.findings).toHaveLength(1);
      const finding = check.findings[0];
      expect(finding?.id).toBe("workspace-ready.settings-missing");
      expect(finding?.message).toContain("settings.json");
      expect(finding?.message).toContain(axmDir);
      expect(finding?.action?.command).toBe("axm init");
    }),
  );

  it.effect("emits settings-unparseable for malformed JSON", () =>
    Effect.gen(function* () {
      fs.mkdirSync(axmDir, { recursive: true });
      fs.writeFileSync(path.join(axmDir, "settings.json"), "{not json");
      const report = yield* runCheck();
      const check = findCheck(report.checks, "workspace-ready");
      expect(check.status).toBe("fail");
      expect(check.findings).toHaveLength(1);
      const finding = check.findings[0];
      expect(finding?.id).toBe("workspace-ready.settings-unparseable");
      expect(finding?.message).toContain("not valid JSON");
      expect(finding?.details).toBeDefined();
      expect(finding?.details?.length ?? 0).toBeGreaterThan(0);
      expect(finding?.action?.command).toBe("axm init");
    }),
  );

  it.effect("emits settings-schema-invalid for wrong shape", () =>
    Effect.gen(function* () {
      fs.mkdirSync(axmDir, { recursive: true });
      fs.writeFileSync(
        path.join(axmDir, "settings.json"),
        JSON.stringify({ agents: "not-an-array" }),
      );
      const report = yield* runCheck();
      const check = findCheck(report.checks, "workspace-ready");
      expect(check.status).toBe("fail");
      expect(check.findings).toHaveLength(1);
      const finding = check.findings[0];
      expect(finding?.id).toBe("workspace-ready.settings-schema-invalid");
      expect(finding?.message).toContain("schema");
      expect(finding?.details).toBeDefined();
      expect(finding?.details?.length ?? 0).toBeGreaterThan(0);
      expect(finding?.action?.command).toBe("axm init");
    }),
  );

  it.effect("emits no findings when workspace is clean and settings are valid", () =>
    Effect.gen(function* () {
      fs.mkdirSync(axmDir, { recursive: true });
      fs.writeFileSync(
        path.join(axmDir, "settings.json"),
        JSON.stringify({ agents: ["claude-code"] }),
      );
      const report = yield* runCheck();
      const check = findCheck(report.checks, "workspace-ready");
      expect(check.status).toBe("pass");
      expect(check.findings).toHaveLength(0);
      expect(report.healthy).toBe(true);
    }),
  );

  it.effect(
    "emits settings-read-failure when settings.json cannot be read due to permissions",
    () =>
      Effect.gen(function* () {
        fs.mkdirSync(axmDir, { recursive: true });
        const settingsPath = path.join(axmDir, "settings.json");
        fs.writeFileSync(settingsPath, JSON.stringify({ agents: ["claude-code"] }));

        // Some environments (e.g. CI running as root) ignore chmod 0 on files.
        // If we can't reliably trigger a read failure, skip the assertions.
        // TODO: (#51) platform-agnostic way to force a read failure.
        if (!tryMakeUnreadable(settingsPath)) {
          return;
        }

        const report = yield* runCheck();
        const check = findCheck(report.checks, "workspace-ready");
        expect(check.status).toBe("fail");
        expect(check.findings).toHaveLength(1);
        const finding = check.findings[0];
        expect(finding?.id).toBe("workspace-ready.settings-read-failure");
        expect(finding?.severity).toBe("error");
        expect(finding?.message).toContain("could not be read");
        expect(finding?.details).toBeDefined();
        expect(finding?.action?.command).toBe("axm init");
      }).pipe(
        Effect.ensuring(
          Effect.sync(() => {
            restorePermissions(path.join(axmDir, "settings.json"));
          }),
        ),
      ),
  );

  it.effect("all five diagnostics reference the same init action across states", () =>
    Effect.gen(function* () {
      const actions = new Set<unknown>();

      // State 1: .axm missing -> directory-missing
      let report = yield* runCheckGraph([makeWorkspaceReadyCheck(workspace())], workspace()).pipe(
        Effect.provide(NodeServices.layer),
      );
      for (const finding of findCheck(report.checks, "workspace-ready").findings) {
        expect(finding.action).toBeDefined();
        actions.add(finding.action);
      }

      // State 2: .axm exists, settings missing
      fs.mkdirSync(axmDir, { recursive: true });
      report = yield* runCheckGraph([makeWorkspaceReadyCheck(workspace())], workspace()).pipe(
        Effect.provide(NodeServices.layer),
      );
      for (const finding of findCheck(report.checks, "workspace-ready").findings) {
        expect(finding.action).toBeDefined();
        actions.add(finding.action);
      }

      // State 3: settings exists but read fails (permission denied). Some
      // environments (e.g. CI running as root) ignore chmod 0 on files; in
      // that case we skip State 3 — the other four states still prove all
      // diagnostics share the same action instance.
      const settingsPath = path.join(axmDir, "settings.json");
      fs.writeFileSync(settingsPath, JSON.stringify({ agents: ["claude-code"] }));
      if (tryMakeUnreadable(settingsPath)) {
        report = yield* runCheckGraph([makeWorkspaceReadyCheck(workspace())], workspace()).pipe(
          Effect.provide(NodeServices.layer),
        );
        for (const finding of findCheck(report.checks, "workspace-ready").findings) {
          expect(finding.action).toBeDefined();
          actions.add(finding.action);
        }
      }
      restorePermissions(settingsPath);

      // State 4: settings exists but unparseable
      fs.writeFileSync(settingsPath, "{not json");
      report = yield* runCheckGraph([makeWorkspaceReadyCheck(workspace())], workspace()).pipe(
        Effect.provide(NodeServices.layer),
      );
      for (const finding of findCheck(report.checks, "workspace-ready").findings) {
        expect(finding.action).toBeDefined();
        actions.add(finding.action);
      }

      // State 5: settings parseable but schema-invalid
      fs.writeFileSync(settingsPath, JSON.stringify({ agents: "not-an-array" }));
      report = yield* runCheckGraph([makeWorkspaceReadyCheck(workspace())], workspace()).pipe(
        Effect.provide(NodeServices.layer),
      );
      for (const finding of findCheck(report.checks, "workspace-ready").findings) {
        expect(finding.action).toBeDefined();
        actions.add(finding.action);
      }

      expect(actions.size).toBe(1);
    }),
  );
});
