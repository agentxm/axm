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

const tryMakeUnwritableDirectory = (dirPath: string): boolean => {
  try {
    fs.chmodSync(dirPath, 0o555);
  } catch {
    return false;
  }
  const probePath = path.join(dirPath, ".axm-write-probe");
  try {
    fs.writeFileSync(probePath, "probe");
    fs.rmSync(probePath, { force: true });
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

const restoreDirectoryPermissions = (dirPath: string): void => {
  try {
    fs.chmodSync(dirPath, 0o755);
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
      expect(finding?.action?.label).toBe("Edit settings.json");
      expect(finding?.action?.command).toBeUndefined();
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
      expect(finding?.action?.label).toBe("Edit settings.json");
      expect(finding?.action?.command).toBeUndefined();
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

  it.effect("emits not-writable when the workspace directory cannot be written", () =>
    Effect.gen(function* () {
      fs.mkdirSync(axmDir, { recursive: true });
      const settingsPath = path.join(axmDir, "settings.json");
      fs.writeFileSync(settingsPath, JSON.stringify({ agents: ["claude-code"] }));

      if (!tryMakeUnwritableDirectory(axmDir)) {
        return;
      }

      const report = yield* runCheck();
      const check = findCheck(report.checks, "workspace-ready");
      expect(check.status).toBe("fail");
      expect(check.findings).toHaveLength(1);
      const finding = check.findings[0];
      expect(finding?.id).toBe("workspace-ready.not-writable");
      expect(finding?.severity).toBe("error");
      expect(finding?.message).toContain("not writable");
      expect(finding?.action?.label).toBe("Fix filesystem permissions");
      expect(finding?.action?.command).toBeUndefined();
    }).pipe(
      Effect.ensuring(
        Effect.sync(() => {
          restoreDirectoryPermissions(axmDir);
        }),
      ),
    ),
  );

  it.effect("emits not-writable when settings.json is blocked by file permissions", () =>
    Effect.gen(function* () {
      fs.mkdirSync(axmDir, { recursive: true });
      const settingsPath = path.join(axmDir, "settings.json");
      fs.writeFileSync(settingsPath, JSON.stringify({ agents: ["claude-code"] }));

      if (!tryMakeUnreadable(settingsPath)) {
        return;
      }

      const report = yield* runCheck();
      const check = findCheck(report.checks, "workspace-ready");
      expect(check.status).toBe("fail");
      expect(check.findings).toHaveLength(1);
      const finding = check.findings[0];
      expect(finding?.id).toBe("workspace-ready.not-writable");
      expect(finding?.message).toContain("current file permissions");
      expect(finding?.action?.label).toBe("Fix filesystem permissions");
      expect(finding?.action?.command).toBeUndefined();
    }).pipe(
      Effect.ensuring(
        Effect.sync(() => {
          restorePermissions(path.join(axmDir, "settings.json"));
        }),
      ),
    ),
  );

  it.effect("emits settings-read-failure for non-permission filesystem read errors", () =>
    Effect.gen(function* () {
      fs.mkdirSync(axmDir, { recursive: true });
      fs.mkdirSync(path.join(axmDir, "settings.json"));

      const report = yield* runCheck();
      const check = findCheck(report.checks, "workspace-ready");
      expect(check.status).toBe("fail");
      expect(check.findings).toHaveLength(1);
      const finding = check.findings[0];
      expect(finding?.id).toBe("workspace-ready.settings-read-failure");
      expect(finding?.severity).toBe("error");
      expect(finding?.message).toContain("could not be read");
      expect(finding?.details).toBeDefined();
      expect(finding?.action?.label).toBe("Check filesystem access");
      expect(finding?.action?.command).toBeUndefined();
    }),
  );
});
