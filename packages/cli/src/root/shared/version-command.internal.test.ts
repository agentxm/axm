import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { afterEach, beforeEach } from "vitest";
import { writeWorkspaceFiles } from "../../test-stubs.js";
import {
  at,
  expectRecord,
  getAppError,
  makeWorkspaceHandlerTestContext,
  property,
} from "../../test-helpers.js";
import { handleRootVersion, handleVersion } from "./version-command.js";

const initWorkspace = (root: string) => {
  writeWorkspaceFiles(path.join(root, ".axm"), {
    owner: "@test",
    agents: ["claude-code"],
    sources: [],
  });
};

const MANIFEST_FILES = {
  skills: { filename: "skill.json", type: "skill" },
  subagents: { filename: "subagent.json", type: "subagent" },
  mcps: { filename: "mcp.json", type: "mcp-server" },
  rules: { filename: "rule.json", type: "rule" },
  hooks: { filename: "hook.json", type: "hook" },
  knowledge: { filename: "knowledge.json", type: "knowledge" },
  packs: { filename: "pack.json", type: "pack" },
} as const;

type ManifestPlural = keyof typeof MANIFEST_FILES;

const writeManifest = (root: string, type: ManifestPlural, name: string, version: string) => {
  const { filename, type: extType } = MANIFEST_FILES[type];
  const dir = path.join(root, type, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, filename),
    JSON.stringify({
      owner: "@test",
      type: extType,
      name,
      version,
      ...(type === "packs" ? { dependencies: {} } : {}),
    }),
  );
  const settingsPath = path.join(root, "axm.json");
  const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
  const settingsKey = type === "mcps" ? "mcpServers" : type;
  settings[settingsKey] = {
    ...(settings[settingsKey] ?? {}),
    [name]: "workspace",
  };
  fs.writeFileSync(settingsPath, JSON.stringify(settings));
  return path.join(dir, filename);
};

describe("version command handler", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "version-command-test-"));
    process.chdir(tempDir);
    initWorkspace(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it.effect("previews a skill version bump without writing", () => {
    const manifestPath = writeManifest(tempDir, "skills", "code-review", "1.2.3");
    const { provide, logs } = makeWorkspaceHandlerTestContext();

    return provide(
      Effect.gen(function* () {
        yield* handleVersion({
          type: "skill",
          handle: "@test/skills/code-review",
          bump: "minor",
          targetVersion: Option.none(),
          preview: true,
        });

        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
        expect(manifest.version).toBe("1.2.3");
        expect(logs.info).toContain(
          [
            "Would update skill @test/skills/code-review 1.2.3 -> 1.3.0",
            "  -> skills/code-review/skill.json",
          ].join("\n"),
        );
      }),
    );
  });

  it.effect("emits plan-resolution JSON for an applied version bump", () => {
    const manifestPath = writeManifest(tempDir, "skills", "code-review", "1.2.3");
    const { provide, rendererState } = makeWorkspaceHandlerTestContext({ machine: true });

    return provide(
      Effect.gen(function* () {
        yield* handleVersion({
          type: "skill",
          handle: "@test/skills/code-review",
          bump: "patch",
          targetVersion: Option.none(),
          preview: false,
        });

        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
        expect(manifest.version).toBe("1.2.4");

        const data = expectRecord(at(rendererState.results, 0).data);
        const result = expectRecord(property(data, "result"));
        expect(property(result, "outcome")).toBe("applied");
        expect(property(result, "planName")).toBe("Update extension version");
        const counts = expectRecord(property(result, "counts"));
        expect(property(counts, "committed")).toBe(1);

        const units = property(result, "units");
        if (!Array.isArray(units)) {
          throw new Error("Expected plan result units");
        }
        const unit = expectRecord(at(units, 0));
        expect(property(unit, "state")).toBe("committed");
        expect(property(unit, "message")).toBe("1.2.3 -> 1.2.4");

        const artifact = expectRecord(property(unit, "artifact"));
        expect(property(artifact, "path")).toBe("skills/code-review/skill.json");
        expect(property(artifact, "change")).toBe("updated");
        expect(property(artifact, "previousVersion")).toBe("1.2.3");
        expect(property(artifact, "version")).toBe("1.2.4");
      }),
    );
  });

  it.effect("emits no-op JSON when setting the current version", () => {
    const manifestPath = writeManifest(tempDir, "skills", "code-review", "1.2.3");
    const { provide, rendererState } = makeWorkspaceHandlerTestContext({ machine: true });

    return provide(
      Effect.gen(function* () {
        yield* handleVersion({
          type: "skill",
          handle: "@test/skills/code-review",
          bump: "set",
          targetVersion: Option.some("1.2.3"),
          preview: false,
        });

        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
        expect(manifest.version).toBe("1.2.3");

        const data = expectRecord(at(rendererState.results, 0).data);
        const result = expectRecord(property(data, "result"));
        expect(property(result, "outcome")).toBe("no-op");
        const counts = expectRecord(property(result, "counts"));
        expect(property(counts, "committed")).toBe(0);

        const units = property(result, "units");
        if (!Array.isArray(units)) {
          throw new Error("Expected plan result units");
        }
        const unit = expectRecord(at(units, 0));
        expect(property(unit, "state")).toBe("unchanged");

        const artifact = expectRecord(property(unit, "artifact"));
        expect(property(artifact, "change")).toBe("unchanged");
        expect(property(artifact, "version")).toBe("1.2.3");
      }),
    );
  });

  it.effect("rejects semver ranges for set", () => {
    writeManifest(tempDir, "skills", "code-review", "1.2.3");
    const { provide } = makeWorkspaceHandlerTestContext();

    return provide(
      Effect.gen(function* () {
        const result = yield* handleVersion({
          type: "skill",
          handle: "@test/skills/code-review",
          bump: "set",
          targetVersion: Option.some("^2.0.0"),
          preview: false,
        }).pipe(Effect.flip);
        expect(getAppError(result).detail).toContain("Invalid version");
      }),
    );
  });
});

describe("root version command handler", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "version-root-test-"));
    process.chdir(tempDir);
    initWorkspace(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it.effect("infers skill type from FQN and previews minor", () => {
    const manifestPath = writeManifest(tempDir, "skills", "code-review", "1.2.3");
    const { provide, logs } = makeWorkspaceHandlerTestContext();

    return provide(
      Effect.gen(function* () {
        yield* handleRootVersion({
          handle: "@test/skills/code-review",
          bump: "minor",
          targetVersion: Option.none(),
          preview: true,
        });

        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
        expect(manifest.version).toBe("1.2.3");
        expect(logs.info).toContain(
          [
            "Would update skill @test/skills/code-review 1.2.3 -> 1.3.0",
            "  -> skills/code-review/skill.json",
          ].join("\n"),
        );
      }),
    );
  });

  it.effect("infers subagent type from FQN and bumps patch", () => {
    const manifestPath = writeManifest(tempDir, "subagents", "researcher", "0.1.0");
    const { provide, logs, rendererState } = makeWorkspaceHandlerTestContext();

    return provide(
      Effect.gen(function* () {
        yield* handleRootVersion({
          handle: "@test/subagents/researcher",
          bump: "patch",
          targetVersion: Option.none(),
          preview: false,
        });

        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
        expect(manifest.version).toBe("0.1.1");
        expect(logs.success).toContain("Updated 1 subagent");
        expect(rendererState.summaries).toEqual([
          "@test/subagents/researcher   0.1.1   updated   1 file   subagents/researcher/subagent.json",
        ]);
      }),
    );
  });

  it.effect("infers mcp-server type from FQN and bumps minor", () => {
    const manifestPath = writeManifest(tempDir, "mcps", "my-server", "1.0.0");
    const { provide, logs } = makeWorkspaceHandlerTestContext();

    return provide(
      Effect.gen(function* () {
        yield* handleRootVersion({
          handle: "@test/mcps/my-server",
          bump: "minor",
          targetVersion: Option.none(),
          preview: false,
        });

        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
        expect(manifest.version).toBe("1.1.0");
        expect(logs.success).toContain("Updated 1 MCP server");
      }),
    );
  });

  it.effect("infers pack type from FQN and sets exact version", () => {
    const manifestPath = writeManifest(tempDir, "packs", "frontend-tools", "0.1.0");
    const { provide, logs } = makeWorkspaceHandlerTestContext();

    return provide(
      Effect.gen(function* () {
        yield* handleRootVersion({
          handle: "@test/packs/frontend-tools",
          bump: "set",
          targetVersion: Option.some("2.0.0"),
          preview: false,
        });

        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
        expect(manifest.version).toBe("2.0.0");
        expect(logs.success).toContain("Updated 1 pack");
      }),
    );
  });

  it.effect("infers rule type from FQN and bumps patch", () => {
    const manifestPath = writeManifest(tempDir, "rules", "commit-style", "0.1.0");
    const { provide, logs } = makeWorkspaceHandlerTestContext();

    return provide(
      Effect.gen(function* () {
        yield* handleRootVersion({
          handle: "@test/rules/commit-style",
          bump: "patch",
          targetVersion: Option.none(),
          preview: false,
        });

        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
        expect(manifest.version).toBe("0.1.1");
        expect(logs.success).toContain("Updated 1 rule");
      }),
    );
  });

  it.effect("infers knowledge type from FQN and bumps minor", () => {
    const manifestPath = writeManifest(tempDir, "knowledge", "handbook", "1.0.0");
    const { provide, logs } = makeWorkspaceHandlerTestContext();

    return provide(
      Effect.gen(function* () {
        yield* handleRootVersion({
          handle: "@test/knowledge/handbook",
          bump: "minor",
          targetVersion: Option.none(),
          preview: false,
        });

        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
        expect(manifest.version).toBe("1.1.0");
        expect(logs.success).toContain("Updated 1 knowledge bundle");
      }),
    );
  });

  it.effect("rejects an invalid FQN", () => {
    const { provide } = makeWorkspaceHandlerTestContext();

    return provide(
      Effect.gen(function* () {
        const result = yield* handleRootVersion({
          handle: "not-an-fqn",
          bump: "patch",
          targetVersion: Option.none(),
          preview: false,
        }).pipe(Effect.flip);
        expect(getAppError(result).code).toBe("validation");
      }),
    );
  });
});
