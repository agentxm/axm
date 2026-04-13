import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as TestClock from "effect/testing/TestClock";
import { CodingAgentRepositoryLive } from "../../agents/index.js";
import { TestFlagsLayer } from "../../cli-flags/index.js";
import { TestRenderer } from "../../cli-renderer/index.js";
import {
  type SourceHostProvidersService,
  SourceHostProviders,
} from "../../source-resolution/index.js";
import {
  decodeHandleSync,
  decodeExtensionNameSync,
  type ExtensionRef,
} from "../../extensions/index.js";
import { buildRegistrySkillRef } from "../../skills/index.js";
import { buildRegistrySubagentRef } from "../../subagents/index.js";
import { decodeExactSemverVersionSync } from "../../version-constraints/version-constraints.js";
import type { SourceHostConfig } from "../../settings/index.js";
import { writeWorkspaceFiles } from "../test-stubs.js";
import { layer as workspaceLayer } from "../service.js";
import { detectSettingsEntryBlockers } from "./detect-blockers.js";

describe("detectSettingsEntryBlockers", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "settings-validation-test-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const registrySource = {
    type: "registry" as const,
    location: new URL("https://registry.agentxm.ai"),
    owner: Option.none(),
  };

  const makeSkillRef = (name = "example-skill") =>
    buildRegistrySkillRef(
      decodeHandleSync("@axm"),
      decodeExtensionNameSync(name),
      decodeExactSemverVersionSync("0.0.1"),
      registrySource,
      [],
    );

  const makeSubagentRef = (name = "example-subagent") =>
    buildRegistrySubagentRef(
      decodeHandleSync("@axm"),
      decodeExtensionNameSync(name),
      decodeExactSemverVersionSync("0.0.1"),
      registrySource,
      [],
    );

  const extensionRefName = (ref: ExtensionRef): string => {
    switch (ref.type) {
      case "skill":
        return ref.skill.name;
      case "command":
        return ref.command.name;
      case "subagent":
        return ref.subagent.name;
      case "mcp-server":
        return ref.server.name;
      case "pack":
        return ref.pack.name;
    }
  };

  const makeSourceProviders = (refs: ReadonlyArray<ExtensionRef>): SourceHostProvidersService => ({
    find: (_source, options) =>
      Effect.succeed(
        refs.filter(
          (ref) =>
            (options.type === "*" || ref.type === options.type) &&
            (options.names.length === 0 || options.names.includes(extensionRefName(ref))),
        ),
      ),
    fetch: () => Effect.die("unused in settings-validation tests"),
    cloneUrl: () => Option.none(),
    origin: () => "test",
  });

  const createWorkspace = (options: Parameters<typeof writeWorkspaceFiles>[1]) => {
    const axmDir = path.join(tempDir, ".axm");
    writeWorkspaceFiles(axmDir, {
      agents: ["claude-code"],
      ...options,
    });
  };

  const makeLayers = (
    providers: SourceHostProvidersService,
    builtInSources: ReadonlyArray<SourceHostConfig> = [
      {
        name: "default",
        type: "registry",
        location: new URL("https://registry.agentxm.ai"),
      },
    ],
  ) =>
    (() => {
      const { layer: rendererLayer } = TestRenderer.make();
      const baseLayer = Layer.mergeAll(NodeServices.layer, TestFlagsLayer(), rendererLayer);
      const wsLayer = Layer.provide(
        workspaceLayer({
          scope: "project",
          builtInSources,
        }),
        baseLayer,
      );
      return Layer.mergeAll(
        baseLayer,
        wsLayer,
        CodingAgentRepositoryLive,
        Layer.succeed(SourceHostProviders, providers),
      );
    })();

  it.effect("emits entry-malformed when command entry is malformed", () =>
    (() => {
      createWorkspace({
        commands: {
          "example-command": "^1.0.0",
        },
      });

      return Effect.gen(function* () {
        const blockers = yield* detectSettingsEntryBlockers();

        expect(blockers).toMatchObject([
          {
            reason: "entry-malformed",
            subject: { kind: "extension", ref: "command:example-command" },
            message: 'The command entry "example-command" has a malformed source.',
            hint: 'Use a name like "@owner/commands/name".',
          },
        ]);
      }).pipe(Effect.provide(makeLayers(makeSourceProviders([]))));
    })(),
  );

  it.effect("emits source-resolution-failed when a subagent source cannot be resolved", () =>
    (() => {
      createWorkspace({
        subagents: {
          "example-subagent": "github:acme/example-subagent",
        },
      });

      return Effect.gen(function* () {
        const blockers = yield* detectSettingsEntryBlockers();

        expect(blockers).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              reason: "source-resolution-failed",
              subject: { kind: "extension", ref: "subagent:example-subagent" },
              message: 'Could not resolve the source for subagent "example-subagent".',
              hint: 'Check the source for subagent "example-subagent" in settings.json.',
            }),
          ]),
        );
      }).pipe(Effect.provide(makeLayers(makeSourceProviders([]))));
    })(),
  );

  it.effect("returns no blocker for a resolvable non-registry subagent source", () =>
    (() => {
      createWorkspace({
        subagents: {
          "example-subagent": "github:acme/example-subagent",
        },
      });

      return Effect.gen(function* () {
        const blockers = yield* detectSettingsEntryBlockers();

        expect(blockers).toEqual([]);
      }).pipe(
        Effect.provide(
          makeLayers(makeSourceProviders([makeSubagentRef()]), [
            { name: "default", type: "registry", location: new URL("https://registry.agentxm.ai") },
            { name: "github", type: "github", url: new URL("https://github.com") },
          ]),
        ),
      );
    })(),
  );

  it.effect("emits entry-malformed when pack entry is malformed", () =>
    (() => {
      createWorkspace({
        packs: {
          "example-pack": "^1.0.0",
        },
      });

      return Effect.gen(function* () {
        const blockers = yield* detectSettingsEntryBlockers();

        expect(blockers).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              reason: "entry-malformed",
              subject: { kind: "extension", ref: "pack:example-pack" },
              message: 'The extension pack entry "example-pack" has a malformed source.',
              hint: 'Use a name like "@owner/packs/name".',
            }),
          ]),
        );
      }).pipe(Effect.provide(makeLayers(makeSourceProviders([]))));
    })(),
  );

  it.effect("emits entry-malformed when mcp-server entry is malformed", () =>
    (() => {
      const axmDir = path.join(tempDir, ".axm");
      fs.mkdirSync(axmDir, { recursive: true });
      fs.writeFileSync(
        path.join(axmDir, "settings.json"),
        JSON.stringify({
          agents: ["claude-code"],
          mcpServers: {
            "example-server": "github:acme/example-server",
          },
        }),
      );
      fs.writeFileSync(path.join(axmDir, "axm-lock.yaml"), "lockfileVersion: 1\nskills: {}\n");

      return Effect.gen(function* () {
        const blockers = yield* detectSettingsEntryBlockers();

        expect(blockers).toMatchObject([
          {
            reason: "entry-malformed",
            subject: { kind: "extension", ref: "mcp-server:example-server" },
            message: 'The MCP server entry "example-server" has a malformed source.',
            hint: 'Use a name like "@owner/mcp-servers/name".',
          },
        ]);
      }).pipe(Effect.provide(makeLayers(makeSourceProviders([]))));
    })(),
  );

  it.effect("emits source-not-found when skill source does not resolve", () =>
    (() => {
      createWorkspace({
        skills: {
          "example-skill": "@axm/skills/example-skill",
        },
      });

      return Effect.gen(function* () {
        const blockers = yield* detectSettingsEntryBlockers();

        expect(blockers).toMatchObject([
          {
            reason: "source-not-found",
            subject: { kind: "extension", ref: "skill:example-skill" },
            message: 'No skill named "example-skill" was found at "@axm/skills/example-skill".',
            hint: 'Check that the source points to the correct extension, or remove "example-skill" from settings.json.',
          },
        ]);
      }).pipe(Effect.provide(makeLayers(makeSourceProviders([]))));
    })(),
  );

  it.effect("does not block when a skill source resolves to multiple matching refs", () =>
    (() => {
      createWorkspace({
        skills: {
          "example-skill": "@axm/skills/example-skill",
        },
      });

      return Effect.gen(function* () {
        const blockers = yield* detectSettingsEntryBlockers();

        expect(blockers).toEqual([]);
      }).pipe(Effect.provide(makeLayers(makeSourceProviders([makeSkillRef(), makeSkillRef()]))));
    })(),
  );

  it.effect("blocks when a configured skill name does not match the resolved skill name", () =>
    (() => {
      createWorkspace({
        skills: {
          alias: "@axm/skills/example-skill",
        },
      });

      return Effect.gen(function* () {
        const blockers = yield* detectSettingsEntryBlockers();

        expect(blockers).toMatchObject([
          {
            reason: "source-not-found",
            subject: { kind: "extension", ref: "skill:alias" },
            message: 'No skill named "alias" was found at "@axm/skills/example-skill".',
            hint: 'Check that the source points to the correct extension, or remove "alias" from settings.json.',
          },
        ]);
      }).pipe(Effect.provide(makeLayers(makeSourceProviders([makeSkillRef()]))));
    })(),
  );

  it.effect("returns no blockers when the workspace settings are healthy", () =>
    (() => {
      createWorkspace({});

      return Effect.gen(function* () {
        const blockers = yield* detectSettingsEntryBlockers();
        expect(blockers).toEqual([]);
      }).pipe(Effect.provide(makeLayers(makeSourceProviders([]))));
    })(),
  );

  it.effect("emits multiple blockers when both subagent and pack entries are invalid", () =>
    (() => {
      createWorkspace({
        subagents: {
          "example-subagent": "github:acme/example-subagent",
        },
        packs: {
          "example-pack": "^1.0.0",
        },
      });

      return Effect.gen(function* () {
        const blockers = yield* detectSettingsEntryBlockers();

        expect(blockers).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              reason: "source-resolution-failed",
              subject: { kind: "extension", ref: "subagent:example-subagent" },
              hint: 'Check the source for subagent "example-subagent" in settings.json.',
            }),
            expect.objectContaining({
              reason: "entry-malformed",
              subject: { kind: "extension", ref: "pack:example-pack" },
              hint: 'Use a name like "@owner/packs/name".',
            }),
          ]),
        );
        expect(blockers).toHaveLength(2);
      }).pipe(Effect.provide(makeLayers(makeSourceProviders([]))));
    })(),
  );

  it.effect("emits source-not-found when command source has no matches", () =>
    (() => {
      createWorkspace({
        commands: {
          "example-cmd": "@axm/commands/example-cmd",
        },
      });

      return Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(detectSettingsEntryBlockers());
        yield* TestClock.adjust("3 seconds");
        const blockers = yield* Fiber.join(fiber);

        expect(blockers).toMatchObject([
          {
            reason: "source-not-found",
            subject: { kind: "extension", ref: "command:example-cmd" },
            message: 'No command named "example-cmd" was found at "@axm/commands/example-cmd".',
            hint: 'Check that the source points to the correct extension, or remove "example-cmd" from settings.json.',
          },
        ]);
      }).pipe(Effect.provide(makeLayers(makeSourceProviders([]))));
    })(),
  );

  it.effect("emits source-not-found when subagent source has no matches", () =>
    (() => {
      createWorkspace({
        subagents: {
          "example-agent": "@axm/subagents/example-agent",
        },
      });

      return Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(detectSettingsEntryBlockers());
        yield* TestClock.adjust("3 seconds");
        const blockers = yield* Fiber.join(fiber);

        expect(blockers).toMatchObject([
          {
            reason: "source-not-found",
            subject: { kind: "extension", ref: "subagent:example-agent" },
            message:
              'No subagent named "example-agent" was found at "@axm/subagents/example-agent".',
            hint: 'Check that the source points to the correct extension, or remove "example-agent" from settings.json.',
          },
        ]);
      }).pipe(Effect.provide(makeLayers(makeSourceProviders([]))));
    })(),
  );

  it.effect("emits source-not-found when mcp-server source has no matches", () =>
    (() => {
      const axmDir = path.join(tempDir, ".axm");
      fs.mkdirSync(axmDir, { recursive: true });
      fs.writeFileSync(
        path.join(axmDir, "settings.json"),
        JSON.stringify({
          agents: ["claude-code"],
          mcpServers: {
            "example-server": "@axm/mcp-servers/example-server",
          },
        }),
      );
      fs.writeFileSync(path.join(axmDir, "axm-lock.yaml"), "lockfileVersion: 1\nskills: {}\n");

      return Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(detectSettingsEntryBlockers());
        yield* TestClock.adjust("3 seconds");
        const blockers = yield* Fiber.join(fiber);

        expect(blockers).toMatchObject([
          {
            reason: "source-not-found",
            subject: { kind: "extension", ref: "mcp-server:example-server" },
            message:
              'No MCP server named "example-server" was found at "@axm/mcp-servers/example-server".',
            hint: 'Check that the source points to the correct extension, or remove "example-server" from settings.json.',
          },
        ]);
      }).pipe(Effect.provide(makeLayers(makeSourceProviders([]))));
    })(),
  );

  it.effect("emits source-not-found when pack source has no matches", () =>
    (() => {
      createWorkspace({
        packs: {
          "example-pack": "@axm/packs/example-pack",
        },
      });

      return Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(detectSettingsEntryBlockers());
        yield* TestClock.adjust("3 seconds");
        const blockers = yield* Fiber.join(fiber);

        expect(blockers).toMatchObject([
          {
            reason: "source-not-found",
            subject: { kind: "extension", ref: "pack:example-pack" },
            message:
              'No extension pack named "example-pack" was found at "@axm/packs/example-pack".',
            hint: 'Check that the source points to the correct extension, or remove "example-pack" from settings.json.',
          },
        ]);
      }).pipe(Effect.provide(makeLayers(makeSourceProviders([]))));
    })(),
  );

  it.effect("emits source-resolution-failed when provider find fails for command", () =>
    (() => {
      createWorkspace({
        commands: {
          "example-cmd": "@axm/commands/example-cmd",
        },
      });

      const providers: SourceHostProvidersService = {
        find: () =>
          Effect.fail({
            _tag: "AppError",
            code: "SOURCE_RESOLUTION_FAILED",
            what: "Provider find failed",
            details: [],
          } as never),
        fetch: () => Effect.die("unused in settings-validation tests"),
        cloneUrl: () => Option.none(),
        origin: () => "test",
      };

      return Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(detectSettingsEntryBlockers());
        yield* TestClock.adjust("3 seconds");
        const blockers = yield* Fiber.join(fiber);

        expect(blockers).toMatchObject([
          {
            reason: "source-resolution-failed",
            subject: { kind: "extension", ref: "command:example-cmd" },
            message: 'Could not resolve the source for command "example-cmd".',
            hint: 'Check the source for command "example-cmd" in settings.json.',
          },
        ]);
      }).pipe(Effect.provide(makeLayers(providers)));
    })(),
  );

  it.effect("emits source-timeout when provider find hangs for command", () =>
    (() => {
      createWorkspace({
        commands: {
          "example-cmd": "@axm/commands/example-cmd",
        },
      });

      const providers: SourceHostProvidersService = {
        find: () => Effect.never,
        fetch: () => Effect.die("unused in settings-validation tests"),
        cloneUrl: () => Option.none(),
        origin: () => "test",
      };

      return Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(detectSettingsEntryBlockers());
        // Advance the clock in small increments to give deeply nested fibers
        // (inside Effect.all + Effect.forEach + raceFirst) time to start and
        // register their sleeps with the TestClock before advancing past them.
        for (let i = 0; i < 10; i++) {
          yield* TestClock.adjust("500 millis");
        }
        const blockers = yield* Fiber.join(fiber);

        expect(blockers).toMatchObject([
          {
            reason: "source-timeout",
            subject: { kind: "extension", ref: "command:example-cmd" },
            message: 'Timed out while checking the command "@axm/commands/example-cmd".',
            hint: "Check that the source is reachable, then run `axm doctor` again.",
          },
        ]);
      }).pipe(Effect.provide(makeLayers(providers)));
    })(),
  );
});
