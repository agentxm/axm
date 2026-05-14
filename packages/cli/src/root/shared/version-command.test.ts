import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { afterEach, beforeEach } from "vitest";

import { getAppError, makeWorkspaceHandlerTestContext } from "../../test-helpers.js";
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
  "mcp-servers": { filename: "mcp-server.json", type: "mcp-server" },
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
        expect(logs.message).toContain("1.2.3 -> 1.2.4\n");
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
        expect(logs.message).toContain("1.2.3 -> 1.3.0\n");
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
        expect(logs.message).toContain("1.2.3 -> 1.2.4\n");
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
        expect(logs.message).toContain("1.2.3 -> 1.3.0\n");
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
        expect(logs.message).toContain("0.1.0 -> 0.1.1\n");
      }),
    );
  });

  it.effect("infers mcp-server type from FQN and bumps minor", () => {
    const manifestPath = writeManifest(tempDir, "mcp-servers", "my-server", "1.0.0");
    const { provide, logs } = makeWorkspaceHandlerTestContext();

    return provide(
      Effect.gen(function* () {
        yield* handleRootVersion({
          handle: "@test/mcp-servers/my-server",
          bump: "minor",
          targetVersion: Option.none(),
          preview: false,
        });

        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
        expect(manifest.version).toBe("1.1.0");
        expect(logs.message).toContain("1.0.0 -> 1.1.0\n");
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
        expect(logs.message).toContain("0.1.0 -> 2.0.0\n");
      }),
    );
  });

  it.effect("rejects non-versionable extension type", () => {
    const { provide } = makeWorkspaceHandlerTestContext();

    return provide(
      Effect.gen(function* () {
        const result = yield* handleRootVersion({
          handle: "@test/files/my-file",
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
