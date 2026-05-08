/**
 * Unit tests for the commands new handler.
 *
 * Tests profile resolution, name validation, manifest creation, ${name}.md content file,
 * and error paths.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { afterEach, beforeEach } from "vitest";
import { CodingAgentRepositoryLive } from "@agentxm/client-core/unstable/agents";
import type { ExtensionName } from "@agentxm/client-core/unstable/extensions";
import { extensionName, writeWorkspaceFiles } from "../../test-stubs.js";
import { makeEffectProvide } from "../../test-helpers.js";
import { getAppError, makeWorkspaceHandlerTestContext } from "../../test-helpers.js";
import { handleCommandsNew, type CommandsNewHandlerArgs } from "./new.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const initWorkspace = (
  axmDir: string,
  opts: {
    profile?: string;
  } = {},
) => {
  writeWorkspaceFiles(axmDir, {
    owner: opts.profile,
  });
};

const defaultArgs = (
  name: string,
  overrides: Partial<CommandsNewHandlerArgs> = {},
): CommandsNewHandlerArgs => ({
  name: extensionName(name),
  description: "",
  profile: Option.none(),
  yes: false,
  force: false,
  preview: false,
  ...overrides,
});

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("commands-new.handler", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "commands-new-handler-test-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const makeLayers = (flagsOverrides?: {
    verbose?: boolean;
    debug?: boolean;
    nonInteractive?: boolean;
  }) => {
    const ctx = makeWorkspaceHandlerTestContext({ flags: flagsOverrides });
    const fullLayer = Layer.mergeAll(ctx.fullLayer, CodingAgentRepositoryLive);

    return {
      ...ctx,
      provide: makeEffectProvide(fullLayer),
    };
  };

  describe("success", () => {
    it.effect("creates command with manifest and ${name}.md content file", () => {
      const { provide, logs, rendererState } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), { profile: "@acme" });

      return provide(
        Effect.gen(function* () {
          yield* handleCommandsNew(defaultArgs("my-command"));

          // Verify manifest
          const manifestPath = path.join(
            tempDir,
            ".axm",
            "extensions",
            "@acme",
            "commands",
            "my-command",
            "command.json",
          );
          expect(fs.existsSync(manifestPath)).toBe(true);
          const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
          expect(manifest.owner).toBe("@acme");
          expect(manifest.type).toBe("command");
          expect(manifest.name).toBe("my-command");
          expect(manifest.version).toBe("0.1.0");

          // Verify <name>.md content file
          const commandMdPath = path.join(
            tempDir,
            ".axm",
            "extensions",
            "@acme",
            "commands",
            "my-command",
            "src",
            "my-command.md",
          );
          expect(fs.existsSync(commandMdPath)).toBe(true);
          const commandMd = fs.readFileSync(commandMdPath, "utf-8");
          expect(commandMd).toContain("name: my-command");
          expect(commandMd).toContain("description: A new command");

          const renderedPath = path.join(tempDir, ".claude", "commands", "my-command.md");
          expect(fs.existsSync(renderedPath)).toBe(true);
          expect(fs.readFileSync(renderedPath, "utf-8")).toContain(
            "Describe what this command does",
          );

          const settings = JSON.parse(
            fs.readFileSync(path.join(tempDir, ".axm", "settings.json"), "utf-8"),
          );
          expect(settings.commands?.["my-command"]).toEqual({
            source: "@acme/commands/my-command",
            authored: true,
          });

          const lockfile = fs.readFileSync(path.join(tempDir, ".axm", "axm-lock.yaml"), "utf-8");
          expect(lockfile).toContain("my-command:");
          expect(lockfile).toContain("sourceName: local");
          expect(lockfile).toContain("claude-code");
          expect(lockfile).toContain(".claude/commands/my-command.md");

          expect(logs.success.some((m) => m.includes("@acme/commands/my-command"))).toBe(true);
          expect(rendererState.breadcrumbs).toEqual([
            {
              task: "edit",
              description:
                "Edit `.axm/extensions/@acme/commands/my-command/src/my-command.md` to fill in instructions",
            },
            {
              task: "sync",
              description: "Apply changes to your workspace",
              command: ["axm", "sync"],
            },
          ]);
        }),
      );
    });

    it.effect("creates command with custom description", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), { profile: "@acme" });

      return provide(
        Effect.gen(function* () {
          yield* handleCommandsNew(defaultArgs("my-command", { description: "Does cool stuff" }));

          const manifestPath = path.join(
            tempDir,
            ".axm",
            "extensions",
            "@acme",
            "commands",
            "my-command",
            "command.json",
          );
          const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
          expect(manifest.description).toBe("Does cool stuff");

          const commandMdPath = path.join(
            tempDir,
            ".axm",
            "extensions",
            "@acme",
            "commands",
            "my-command",
            "src",
            "my-command.md",
          );
          const commandMd = fs.readFileSync(commandMdPath, "utf-8");
          expect(commandMd).toContain("description: Does cool stuff");
        }),
      );
    });
  });

  describe("profile override", () => {
    it.effect("uses --profile override instead of workspace profile", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), { profile: "@acme" });

      return provide(
        Effect.gen(function* () {
          yield* handleCommandsNew(defaultArgs("my-command", { profile: Option.some("@corp") }));

          const manifestPath = path.join(
            tempDir,
            ".axm",
            "extensions",
            "@corp",
            "commands",
            "my-command",
            "command.json",
          );
          expect(fs.existsSync(manifestPath)).toBe(true);

          const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
          expect(manifest.owner).toBe("@corp");
          expect(manifest.type).toBe("command");
          expect(manifest.name).toBe("my-command");
        }),
      );
    });

    it.effect("normalizes profile without @ prefix", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), { profile: "@acme" });

      return provide(
        Effect.gen(function* () {
          yield* handleCommandsNew(defaultArgs("my-command", { profile: Option.some("corp") }));

          const manifestPath = path.join(
            tempDir,
            ".axm",
            "extensions",
            "@corp",
            "commands",
            "my-command",
            "command.json",
          );
          expect(fs.existsSync(manifestPath)).toBe(true);

          const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
          expect(manifest.owner).toBe("@corp");
        }),
      );
    });
  });

  describe("no profile configured", () => {
    it.effect("fails when no profile is configured and no --profile override", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"));

      return provide(
        Effect.gen(function* () {
          const error = yield* handleCommandsNew(defaultArgs("my-command")).pipe(Effect.flip);
          expect(getAppError(error).message).toContain("No owner configured");
        }),
      );
    });
  });

  describe("name validation", () => {
    it.effect("rejects name starting with hyphen", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), { profile: "@acme" });

      return provide(
        Effect.gen(function* () {
          const error = yield* handleCommandsNew({
            ...defaultArgs("valid-name"),
            // Assertion needed: testing invalid name validation
            name: "-bad-name" as unknown as ExtensionName,
          }).pipe(Effect.flip);
          expect(getAppError(error).code).toBe("validation");
        }),
      );
    });

    it.effect("rejects uppercase name", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), { profile: "@acme" });

      return provide(
        Effect.gen(function* () {
          const error = yield* handleCommandsNew({
            ...defaultArgs("valid-name"),
            // Assertion needed: testing invalid name validation
            name: "MyCommand" as unknown as ExtensionName,
          }).pipe(Effect.flip);
          expect(getAppError(error).code).toBe("validation");
        }),
      );
    });

    it.effect("rejects name exceeding 64 characters", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), { profile: "@acme" });
      const longName = "a".repeat(65);

      return provide(
        Effect.gen(function* () {
          const error = yield* handleCommandsNew({
            ...defaultArgs("valid-name"),
            // Assertion needed: testing invalid name validation
            name: longName as unknown as ExtensionName,
          }).pipe(Effect.flip);
          expect(getAppError(error).code).toBe("validation");
        }),
      );
    });
  });

  describe("directory already exists", () => {
    it.effect("fails when command directory already exists", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), { profile: "@acme" });

      // Pre-create the managed extension directory
      fs.mkdirSync(path.join(tempDir, ".axm", "extensions", "@acme", "commands", "my-command"), {
        recursive: true,
      });

      return provide(
        Effect.gen(function* () {
          const error = yield* handleCommandsNew(defaultArgs("my-command")).pipe(Effect.flip);
          expect(getAppError(error).message).toContain("already exists");
        }),
      );
    });
  });

  describe("content file", () => {
    it.effect("writes ${name}.md with frontmatter and placeholder body", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), { profile: "@acme" });

      return provide(
        Effect.gen(function* () {
          yield* handleCommandsNew(defaultArgs("my-tool"));

          const commandMdPath = path.join(
            tempDir,
            ".axm",
            "extensions",
            "@acme",
            "commands",
            "my-tool",
            "src",
            "my-tool.md",
          );
          const content = fs.readFileSync(commandMdPath, "utf-8");

          // Check frontmatter
          expect(content).toMatch(/^---\n/);
          expect(content).toContain("name: my-tool");
          expect(content).toContain("description: A new command");
          // Check body
          expect(content).toContain("Describe what this command does");
        }),
      );
    });
  });

  describe("preview mode", () => {
    it.effect("performs no writes when preview mode is active", () => {
      const { provide, logs } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), { profile: "@acme" });

      return provide(
        Effect.gen(function* () {
          yield* handleCommandsNew(defaultArgs("my-command", { preview: true }));

          // Manifest should NOT be created
          const manifestPath = path.join(
            tempDir,
            ".axm",
            "extensions",
            "@acme",
            "commands",
            "my-command",
            "command.json",
          );
          expect(fs.existsSync(manifestPath)).toBe(false);

          // Preview log message should appear
          expect(logs.info.some((m) => m.includes("Previewing"))).toBe(true);
        }),
      );
    });
  });
});
