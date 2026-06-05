import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { afterEach, beforeEach } from "vitest";

import {
  at,
  expectRecord,
  getAppError,
  makeWorkspaceHandlerTestContext,
  property,
} from "../../test-helpers.js";
import { handleRootVersion, handleVersion } from "./version-command.js";

const initWorkspace = (root: string) => {
  fs.mkdirSync(path.join(root, ".axm"), { recursive: true });
  fs.writeFileSync(
    path.join(root, ".axm", "settings.json"),
    JSON.stringify({
      owner: "@test",
      agents: ["claude-code"],
      sources: [],
    }),
  );
  fs.writeFileSync(
    path.join(root, ".axm", "axm-lock.yaml"),
    "lockfileVersion: 1\nskills: {}\ncommands: {}\n",
  );
};

const MANIFEST_FILES = {
  commands: { filename: "command.json", type: "command" },
  skills: { filename: "skill.json", type: "skill" },
  subagents: { filename: "subagent.json", type: "subagent" },
  mcps: { filename: "mcp-server.json", type: "mcp-server" },
  packs: { filename: "pack.json", type: "pack" },
} as const;

type ManifestPlural = keyof typeof MANIFEST_FILES;

const writeManifest = (root: string, type: ManifestPlural, name: string, version: string) => {
  const { filename, type: extType } = MANIFEST_FILES[type];
  const dir = path.join(root, ".axm", "extensions", "@test", type, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, filename),
    JSON.stringify({
      owner: "@test",
      type: extType,
      name,
      version,
    }),
  );
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

  it.effect("bumps a command manifest patch version", () => {
    const manifestPath = writeManifest(tempDir, "commands", "my-cmd", "1.2.3");
    const { provide, logs } = makeWorkspaceHandlerTestContext();

    return provide(
      Effect.gen(function* () {
        yield* handleVersion({
          type: "command",
          handle: "@test/commands/my-cmd",
          bump: "patch",
          targetVersion: Option.none(),
          preview: false,
        });

        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
        expect(manifest.version).toBe("1.2.4");
        expect(logs.success).toContain("Updated command @test/commands/my-cmd 1.2.3 -> 1.2.4");
      }),
    );
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
            "  -> .axm/extensions/@test/skills/code-review/skill.json",
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
        expect(property(result, "appliedCount")).toBe(1);

        const steps = property(result, "steps");
        if (!Array.isArray(steps)) {
          throw new Error("Expected plan result steps");
        }
        const step = expectRecord(at(steps, 0));
        expect(property(step, "status")).toBe("applied");
        expect(property(step, "message")).toBe("1.2.3 -> 1.2.4");

        const artifact = expectRecord(property(step, "artifact"));
        expect(property(artifact, "path")).toBe(
          ".axm/extensions/@test/skills/code-review/skill.json",
        );
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
        expect(property(result, "appliedCount")).toBe(0);

        const steps = property(result, "steps");
        if (!Array.isArray(steps)) {
          throw new Error("Expected plan result steps");
        }
        const step = expectRecord(at(steps, 0));
        expect(property(step, "status")).toBe("unchanged");

        const artifact = expectRecord(property(step, "artifact"));
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

  it.effect("infers command type from FQN and bumps patch", () => {
    const manifestPath = writeManifest(tempDir, "commands", "my-cmd", "1.2.3");
    const { provide, logs } = makeWorkspaceHandlerTestContext();

    return provide(
      Effect.gen(function* () {
        yield* handleRootVersion({
          handle: "@test/commands/my-cmd",
          bump: "patch",
          targetVersion: Option.none(),
          preview: false,
        });

        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
        expect(manifest.version).toBe("1.2.4");
        expect(logs.success).toContain("Updated command @test/commands/my-cmd 1.2.3 -> 1.2.4");
      }),
    );
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
            "  -> .axm/extensions/@test/skills/code-review/skill.json",
          ].join("\n"),
        );
      }),
    );
  });

  it.effect("infers subagent type from FQN and bumps patch", () => {
    const manifestPath = writeManifest(tempDir, "subagents", "researcher", "0.1.0");
    const { provide, logs } = makeWorkspaceHandlerTestContext();

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
        expect(logs.success).toContain(
          "Updated subagent @test/subagents/researcher 0.1.0 -> 0.1.1",
        );
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
        expect(logs.success).toContain("Updated MCP server @test/mcps/my-server 1.0.0 -> 1.1.0");
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
        expect(logs.success).toContain("Updated pack @test/packs/frontend-tools 0.1.0 -> 2.0.0");
      }),
    );
  });

  it.effect("rejects non-versionable extension type", () => {
    const { provide } = makeWorkspaceHandlerTestContext();

    return provide(
      Effect.gen(function* () {
        const result = yield* handleRootVersion({
          handle: "@te/files/my-file",
          bump: "patch",
          targetVersion: Option.none(),
          preview: false,
        }).pipe(Effect.flip);
        expect(getAppError(result).code).toBe("validation");
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
