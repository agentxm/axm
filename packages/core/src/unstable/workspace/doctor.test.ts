import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { afterEach, beforeEach } from "vitest";
import { CodingAgentRepositoryLive } from "../agents/index.js";
import { TestFlagsLayer } from "../cli-flags/index.js";
import { TestRenderer } from "../cli-renderer/index.js";
import {
  type SourceHostProvidersService,
  SourceHostProviders,
} from "../source-resolution/index.js";
import { buildRegistryCommandRef } from "../commands/index.js";
import {
  decodeHandleSync,
  decodeExtensionNameSync,
  type ExtensionRef,
} from "../extensions/index.js";
import { buildRegistryMcpServerRef } from "../mcp-servers/index.js";
import type { ExtensionPackRef } from "../packs/index.js";
import { buildRegistrySkillRef } from "../skills/index.js";
import { buildRegistrySubagentRef } from "../subagents/index.js";
import { writeWorkspaceFiles } from "./test-stubs.js";
import { diagnoseWorkspaceDoctor } from "./doctor.js";
import { layer as workspaceLayer } from "./service.js";
import { decodeExactSemverVersionSync } from "../version-constraints/version-constraints.js";

describe("workspace doctor", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-doctor-test-"));
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

  const makeCommandRef = (name = "example-command") =>
    buildRegistryCommandRef(
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

  const makeMcpServerRef = (name = "example-server") =>
    buildRegistryMcpServerRef(
      decodeHandleSync("@axm"),
      decodeExtensionNameSync(name),
      decodeExactSemverVersionSync("0.0.1"),
      registrySource,
      [],
    );

  const makePackRef = (name = "example-pack") =>
    ({
      type: "pack",
      refType: "registry",
      source: registrySource,
      owner: decodeHandleSync("@axm"),
      pack: {
        name: decodeExtensionNameSync(name),
        skills: {},
        commands: {},
        mcpServers: {},
        subagents: {},
      },
      name: decodeExtensionNameSync(name),
      version: decodeExactSemverVersionSync("0.0.1"),
      integrity: Option.none(),
      compatiblePackages: [],
    }) satisfies ExtensionPackRef;

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
            (options.skillNames.length === 0 || options.skillNames.includes(extensionRefName(ref))),
        ),
      ),
    fetch: () => Effect.die("unused in doctor tests"),
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

  const createSkillWorkspace = () => {
    createWorkspace({
      skills: {
        "example-skill": "@axm/skills/example-skill",
      },
    });
  };

  const createCommandWorkspace = () => {
    createWorkspace({
      commands: {
        "example-command": "@axm/commands/example-command",
      },
    });
  };

  const createSubagentWorkspace = () => {
    createWorkspace({
      subagents: {
        "example-subagent": "@axm/subagents/example-subagent",
      },
    });
  };

  const createMcpServerWorkspace = () => {
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
  };

  const createPackWorkspace = () => {
    createWorkspace({
      packs: {
        "example-pack": "@axm/packs/example-pack",
      },
    });
  };

  const installCanonicalSkill = () => {
    const canonicalDir = path.join(
      tempDir,
      ".axm",
      "extensions",
      "@axm",
      "skills",
      "example-skill",
    );
    fs.mkdirSync(path.join(canonicalDir, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(canonicalDir, "skill.json"),
      JSON.stringify(
        {
          owner: "@axm",
          type: "skill",
          name: "example-skill",
          version: "0.0.1",
        },
        null,
        2,
      ) + "\n",
    );
    fs.writeFileSync(path.join(canonicalDir, "src", "SKILL.md"), "name: example-skill\n");
  };

  const installAgentSkillArtifact = () => {
    fs.mkdirSync(path.join(tempDir, ".claude", "skills", "example-skill"), { recursive: true });
  };

  it.effect("reports install drift separately from resolution", () =>
    (() => {
      createSkillWorkspace();

      return Effect.gen(function* () {
        const diagnosis = yield* diagnoseWorkspaceDoctor();

        expect(diagnosis.diagnostics).toMatchObject([
          {
            code: "SKILL_NOT_INSTALLED",
            severity: "fail",
            subject: "skill:example-skill",
            hint: 'Run `axm install` to install "example-skill".',
          },
        ]);
        expect(diagnosis.failed).toBe(1);
        expect(diagnosis.warned).toBe(0);
        expect(diagnosis.canSync).toBe(true);
      }).pipe(Effect.provide(makeLayers(makeSourceProviders([makeSkillRef()]))));
    })(),
  );

  it.effect("reports missing command installs", () =>
    (() => {
      createCommandWorkspace();

      return Effect.gen(function* () {
        const diagnosis = yield* diagnoseWorkspaceDoctor();

        expect(diagnosis.diagnostics).toMatchObject([
          {
            code: "COMMAND_NOT_INSTALLED",
            severity: "fail",
            subject: "command:example-command",
            hint: 'Run `axm install` to install "example-command".',
          },
        ]);
        expect(diagnosis.failed).toBe(1);
        expect(diagnosis.warned).toBe(0);
        expect(diagnosis.canSync).toBe(true);
      }).pipe(Effect.provide(makeLayers(makeSourceProviders([makeCommandRef()]))));
    })(),
  );

  it.effect("reports missing subagent installs", () =>
    (() => {
      createSubagentWorkspace();

      return Effect.gen(function* () {
        const diagnosis = yield* diagnoseWorkspaceDoctor();

        expect(diagnosis.diagnostics).toMatchObject([
          {
            code: "SUBAGENT_NOT_INSTALLED",
            severity: "fail",
            subject: "subagent:example-subagent",
            hint: 'Run `axm install` to install "example-subagent".',
          },
        ]);
        expect(diagnosis.failed).toBe(1);
        expect(diagnosis.warned).toBe(0);
        expect(diagnosis.canSync).toBe(true);
      }).pipe(Effect.provide(makeLayers(makeSourceProviders([makeSubagentRef()]))));
    })(),
  );

  it.effect("reports a missing lockfile", () =>
    (() => {
      createWorkspace({});
      fs.rmSync(path.join(tempDir, ".axm", "axm-lock.yaml"));

      return Effect.gen(function* () {
        const diagnosis = yield* diagnoseWorkspaceDoctor();

        expect(diagnosis.failed).toBe(1);
        expect(diagnosis.warned).toBe(0);
        expect(diagnosis.canSync).toBe(true);
        expect(diagnosis.diagnostics).toMatchObject([
          {
            code: "LOCKFILE_MISSING",
            severity: "fail",
            subject: "lockfile:axm-lock.yaml",
            message: "axm-lock.yaml is missing.",
            hint: "Run `axm sync` to recreate it.",
          },
        ]);
      }).pipe(Effect.provide(makeLayers(makeSourceProviders([]))));
    })(),
  );

  it.effect("reports an invalid lockfile without masking invalid entries", () =>
    (() => {
      createWorkspace({
        commands: {
          "example-command": "^1.0.0",
        },
      });
      fs.writeFileSync(path.join(tempDir, ".axm", "axm-lock.yaml"), "lockfileVersion: [");

      return Effect.gen(function* () {
        const diagnosis = yield* diagnoseWorkspaceDoctor();

        expect(diagnosis.failed).toBe(2);
        expect(diagnosis.warned).toBe(0);
        expect(diagnosis.canSync).toBe(false);
        expect(diagnosis.diagnostics).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              code: "LOCKFILE_INVALID",
              subject: "lockfile:axm-lock.yaml",
              hint: "Run `axm sync` to rebuild it.",
            }),
            expect.objectContaining({
              code: "COMMAND_ENTRY_INVALID",
              subject: "command:example-command",
            }),
          ]),
        );
      }).pipe(Effect.provide(makeLayers(makeSourceProviders([]))));
    })(),
  );

  it.effect("blocks sync when a configured command uses shorthand", () =>
    (() => {
      createWorkspace({
        commands: {
          "example-command": "^1.0.0",
        },
      });

      return Effect.gen(function* () {
        const diagnosis = yield* diagnoseWorkspaceDoctor();

        expect(diagnosis.failed).toBe(1);
        expect(diagnosis.warned).toBe(0);
        expect(diagnosis.canSync).toBe(false);
        expect(diagnosis.diagnostics).toMatchObject([
          {
            code: "COMMAND_ENTRY_INVALID",
            severity: "fail",
            subject: "command:example-command",
            message: 'The command entry "example-command" is invalid.',
            hint: 'Use a name like "@owner/commands/name".',
          },
        ]);
      }).pipe(Effect.provide(makeLayers(makeSourceProviders([]))));
    })(),
  );

  it.effect("blocks sync when declared subagent and pack entries are invalid", () =>
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
        const diagnosis = yield* diagnoseWorkspaceDoctor();

        expect(diagnosis.failed).toBe(2);
        expect(diagnosis.warned).toBe(0);
        expect(diagnosis.canSync).toBe(false);
        expect(diagnosis.diagnostics).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              code: "SUBAGENT_ENTRY_INVALID",
              subject: "subagent:example-subagent",
              hint: 'Use a name like "@owner/subagents/name".',
            }),
            expect.objectContaining({
              code: "PACK_ENTRY_INVALID",
              subject: "pack:example-pack",
              hint: 'Use a name like "@owner/packs/name".',
            }),
          ]),
        );
      }).pipe(Effect.provide(makeLayers(makeSourceProviders([]))));
    })(),
  );

  it.effect("blocks sync when a declared MCP server entry is invalid", () =>
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
        const diagnosis = yield* diagnoseWorkspaceDoctor();

        expect(diagnosis.failed).toBe(1);
        expect(diagnosis.warned).toBe(0);
        expect(diagnosis.canSync).toBe(false);
        expect(diagnosis.diagnostics).toMatchObject([
          {
            code: "MCP_SERVER_ENTRY_INVALID",
            severity: "fail",
            subject: "mcp-server:example-server",
            message: 'The MCP server entry "example-server" is invalid.',
            hint: 'Use a name like "@owner/mcp-servers/name".',
          },
        ]);
      }).pipe(Effect.provide(makeLayers(makeSourceProviders([]))));
    })(),
  );

  it.effect("reports missing MCP server installs", () =>
    (() => {
      createMcpServerWorkspace();

      return Effect.gen(function* () {
        const diagnosis = yield* diagnoseWorkspaceDoctor();

        expect(diagnosis.diagnostics).toMatchObject([
          {
            code: "MCP_SERVER_NOT_INSTALLED",
            severity: "fail",
            subject: "mcp-server:example-server",
            hint: 'Run `axm install` to install "example-server".',
          },
        ]);
        expect(diagnosis.failed).toBe(1);
        expect(diagnosis.warned).toBe(0);
        expect(diagnosis.canSync).toBe(true);
      }).pipe(Effect.provide(makeLayers(makeSourceProviders([makeMcpServerRef()]))));
    })(),
  );

  it.effect("reports missing pack installs", () =>
    (() => {
      createPackWorkspace();

      return Effect.gen(function* () {
        const diagnosis = yield* diagnoseWorkspaceDoctor();

        expect(diagnosis.diagnostics).toMatchObject([
          {
            code: "PACK_NOT_INSTALLED",
            severity: "fail",
            subject: "pack:example-pack",
            hint: 'Run `axm install` to install "example-pack".',
          },
        ]);
        expect(diagnosis.failed).toBe(1);
        expect(diagnosis.warned).toBe(0);
        expect(diagnosis.canSync).toBe(true);
      }).pipe(Effect.provide(makeLayers(makeSourceProviders([makePackRef()]))));
    })(),
  );
  const makeLayers = (providers: SourceHostProvidersService) =>
    (() => {
      const { layer: rendererLayer } = TestRenderer.make();
      const baseLayer = Layer.mergeAll(NodeServices.layer, TestFlagsLayer(), rendererLayer);
      const wsLayer = Layer.provide(
        workspaceLayer({
          scope: "project",
          builtInSources: [
            {
              name: "default",
              type: "registry",
              location: new URL("https://registry.agentxm.ai"),
            },
          ],
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

  it.effect("reports enablement drift separately from installation", () =>
    (() => {
      createSkillWorkspace();
      installCanonicalSkill();

      return Effect.gen(function* () {
        const diagnosis = yield* diagnoseWorkspaceDoctor();

        expect(diagnosis.diagnostics).toMatchObject([
          {
            code: "SKILL_ENABLEMENT_MISMATCH",
            severity: "fail",
            subject: "skill:example-skill@claude-code",
            hint: 'Run `axm sync` to reconcile "example-skill" for "claude-code".',
          },
        ]);
        expect(diagnosis.failed).toBe(1);
        expect(diagnosis.warned).toBe(0);
        expect(diagnosis.canSync).toBe(true);
      }).pipe(Effect.provide(makeLayers(makeSourceProviders([makeSkillRef()]))));
    })(),
  );

  it.effect("blocks sync when a declared skill cannot be resolved", () =>
    (() => {
      createSkillWorkspace();

      return Effect.gen(function* () {
        const diagnosis = yield* diagnoseWorkspaceDoctor();

        expect(diagnosis.failed).toBe(1);
        expect(diagnosis.warned).toBe(0);
        expect(diagnosis.canSync).toBe(false);
        expect(diagnosis.diagnostics).toMatchObject([
          {
            code: "SKILL_SOURCE_UNRESOLVABLE",
            severity: "fail",
            subject: "skill:example-skill",
            hint: 'Check that "@axm/skills/example-skill" points to the correct skill, or remove "example-skill" from settings.json.',
          },
        ]);
      }).pipe(Effect.provide(makeLayers(makeSourceProviders([]))));
    })(),
  );

  it.effect("reports ambiguous skill sources without parsing reason strings", () =>
    (() => {
      createSkillWorkspace();

      return Effect.gen(function* () {
        const diagnosis = yield* diagnoseWorkspaceDoctor();

        expect(diagnosis.diagnostics).toMatchObject([
          {
            code: "SKILL_SOURCE_UNRESOLVABLE",
            severity: "fail",
            subject: "skill:example-skill",
            message: 'The source "@axm/skills/example-skill" matches more than one skill.',
            hint: 'Narrow the source for "example-skill" in settings.json so it identifies exactly one skill.',
          },
        ]);
        expect(diagnosis.failed).toBe(1);
        expect(diagnosis.warned).toBe(0);
        expect(diagnosis.canSync).toBe(false);
      }).pipe(Effect.provide(makeLayers(makeSourceProviders([makeSkillRef(), makeSkillRef()]))));
    })(),
  );

  it.effect("returns no diagnostics when the workspace is healthy", () =>
    (() => {
      createSkillWorkspace();
      installCanonicalSkill();
      installAgentSkillArtifact();

      return Effect.gen(function* () {
        const diagnosis = yield* diagnoseWorkspaceDoctor();

        expect(diagnosis.diagnostics).toEqual([]);
        expect(diagnosis.failed).toBe(0);
        expect(diagnosis.warned).toBe(0);
        expect(diagnosis.canSync).toBe(true);
      }).pipe(Effect.provide(makeLayers(makeSourceProviders([makeSkillRef()]))));
    })(),
  );
});
