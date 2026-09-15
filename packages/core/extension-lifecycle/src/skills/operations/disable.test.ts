import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { afterEach, beforeEach, vi } from "vitest";
import type { ConfigurableAgentId } from "@agentxm/extension-model/unstable/extensions";
import {
  SettingsWriter,
  WorkspaceRecords,
  type DesiredStateGraph,
  type ReadModelRecordRow,
} from "@agentxm/workspace/desired-state";
import {
  implicitRow,
  MockWorkspaceTransactionScope,
  WorkspaceReadTest,
} from "@agentxm/workspace/desired-state/testing";
import type { DisableSkillOperation } from "./disable.js";
import { disableSkill } from "./disable.js";
import { TestStepFailureConversion } from "../../test-helpers.js";
import { CodingAgentRepository, DefaultCodingAgentRepository } from "@agentxm/workspace/projection";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

interface DisableSkillTestFacts {
  readonly configuredAgents?: ReadonlyArray<ConfigurableAgentId>;
  readonly rows?: ReadonlyArray<ReadModelRecordRow>;
  readonly graph?: DesiredStateGraph;
  readonly onUpdateEntry?: (type: string, name: string) => void;
  readonly onSetEntry?: (type: string, name: string, entry: unknown) => void;
}

/** Provides the owned read, write, agent, and transaction capabilities used by disable. */
const withServices = (axmDir: string, facts: DisableSkillTestFacts = {}) => {
  return Layer.mergeAll(
    WorkspaceReadTest({
      baseDir: path.dirname(axmDir),
      runtimeDir: axmDir,
      settings: { agents: facts.configuredAgents ?? ["claude-code"] },
      ...(facts.graph === undefined ? {} : { graph: facts.graph }),
    }),
    Layer.mock(WorkspaceRecords, { rows: () => Effect.succeed(facts.rows ?? []) }),
    Layer.mock(SettingsWriter, {
      updateEntry: (type, name, _update) => Effect.sync(() => facts.onUpdateEntry?.(type, name)),
      setEntry: (type, name, entry) => Effect.sync(() => facts.onSetEntry?.(type, name, entry)),
    }),
    Layer.succeed(CodingAgentRepository, DefaultCodingAgentRepository),
    MockWorkspaceTransactionScope(axmDir),
    TestStepFailureConversion,
  ).pipe(Layer.provideMerge(NodeServices.layer));
};

/** Creates a minimal DisableSkillOperation for testing. */
const makeOp = (skillName = "my-skill"): DisableSkillOperation => ({
  name: "disable-skill",
  args: { skillName },
});

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("disableSkill", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "disable-skill-")));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  /** Sets up a workspace with canonical skill dir and agent symlinks. */
  const setupWorkspace = (
    opts: {
      skillName?: string;
      agents?: string[];
      createCanonical?: boolean;
      createSymlinks?: boolean;
    } = {},
  ) => {
    const skillName = opts.skillName ?? "my-skill";
    const agents = opts.agents ?? ["claude-code"];
    const createCanonical = opts.createCanonical ?? true;
    const createSymlinks = opts.createSymlinks ?? true;

    const base = path.join(tmpDir, "project");
    const axmDir = path.join(base, ".axm");
    fs.mkdirSync(axmDir, { recursive: true });

    // Create canonical skill dir
    const canonicalPath = path.join(base, "agent_extensions", "external", "skills", skillName);
    if (createCanonical) {
      fs.mkdirSync(canonicalPath, { recursive: true });
      fs.writeFileSync(path.join(canonicalPath, "SKILL.md"), `# ${skillName}`);
      const universalPath = path.join(base, ".agents", "skills", skillName);
      fs.mkdirSync(path.dirname(universalPath), { recursive: true });
      fs.symlinkSync(canonicalPath, universalPath);
    }

    // Create agent symlinks
    if (createSymlinks && createCanonical) {
      for (const agentId of agents) {
        const agentDirMap: Record<string, string> = {
          "claude-code": ".claude/skills",
          cursor: ".cursor/skills",
        };
        const agentSkillsDir = agentDirMap[agentId];
        if (agentSkillsDir) {
          const agentSkillPath = path.join(base, agentSkillsDir, skillName);
          fs.mkdirSync(path.dirname(agentSkillPath), { recursive: true });
          fs.symlinkSync(canonicalPath, agentSkillPath);
        }
      }
    }

    return { base, axmDir, canonicalPath };
  };

  describe("happy path", () => {
    it.effect("removes agent symlinks but preserves canonical directory", () =>
      Effect.gen(function* () {
        const { axmDir, base, canonicalPath } = setupWorkspace({ agents: ["claude-code"] });

        const result = yield* disableSkill(makeOp()).pipe(
          Effect.provide(
            withServices(axmDir, {
              configuredAgents: ["claude-code"],
            }),
          ),
        );

        expect(result.result).toBe("success");
        expect(result.message).toContain("my-skill");

        // Canonical dir should be preserved for re-enablement
        expect(fs.existsSync(canonicalPath)).toBe(true);

        // Agent symlink should be removed
        expect(fs.existsSync(path.join(base, ".claude", "skills", "my-skill"))).toBe(false);
      }),
    );

    it.effect("removes symlinks for multiple agents but preserves canonical directory", () =>
      Effect.gen(function* () {
        const { axmDir, base, canonicalPath } = setupWorkspace({
          agents: ["claude-code", "cursor"],
        });

        const result = yield* disableSkill(makeOp()).pipe(
          Effect.provide(
            withServices(axmDir, {
              configuredAgents: ["claude-code", "cursor"],
            }),
          ),
        );

        expect(result.result).toBe("success");

        expect(fs.existsSync(path.join(base, ".claude", "skills", "my-skill"))).toBe(false);
        expect(fs.existsSync(path.join(base, ".cursor", "skills", "my-skill"))).toBe(false);
        // Canonical dir should be preserved
        expect(fs.existsSync(canonicalPath)).toBe(true);
      }),
    );

    it.effect("updates the skill preference to disabled", () =>
      Effect.gen(function* () {
        const { axmDir } = setupWorkspace();
        const onUpdateEntry = vi.fn<(type: string, name: string) => void>();

        yield* disableSkill(makeOp()).pipe(
          Effect.provide(
            withServices(axmDir, {
              configuredAgents: ["claude-code"],
              onUpdateEntry,
            }),
          ),
        );

        expect(onUpdateEntry).toHaveBeenCalledOnce();
        expect(onUpdateEntry).toHaveBeenCalledWith("skill", "my-skill");
      }),
    );
  });

  describe("registry source", () => {
    it.effect("preserves registry canonical directory but removes agent symlinks", () =>
      Effect.gen(function* () {
        const base = path.join(tmpDir, "project");
        const axmDir = path.join(base, ".axm");
        fs.mkdirSync(axmDir, { recursive: true });

        // Create registry canonical dir
        const registryPath = path.join(
          base,
          "agent_extensions",
          "local",
          "@community",
          "skills",
          "my-skill",
        );
        fs.mkdirSync(registryPath, { recursive: true });
        fs.writeFileSync(path.join(registryPath, "SKILL.md"), "# my-skill");

        // Create agent symlink pointing to registry location
        const agentSkillPath = path.join(base, ".claude", "skills", "my-skill");
        fs.mkdirSync(path.dirname(agentSkillPath), { recursive: true });
        fs.symlinkSync(registryPath, agentSkillPath);

        const result = yield* disableSkill(makeOp()).pipe(
          Effect.provide(
            withServices(axmDir, {
              configuredAgents: ["claude-code"],
            }),
          ),
        );

        expect(result.result).toBe("success");
        // Registry canonical dir should be preserved
        expect(fs.existsSync(registryPath)).toBe(true);
        // Agent symlink should be removed
        expect(fs.existsSync(agentSkillPath)).toBe(false);
      }),
    );
  });

  describe("missing files", () => {
    it.effect("succeeds when canonical dir does not exist", () =>
      Effect.gen(function* () {
        const { axmDir } = setupWorkspace({ createCanonical: false, createSymlinks: false });

        const result = yield* disableSkill(makeOp()).pipe(
          Effect.provide(
            withServices(axmDir, {
              configuredAgents: ["claude-code"],
            }),
          ),
        );

        expect(result.result).toBe("success");
      }),
    );

    it.effect("succeeds when agent symlinks do not exist", () =>
      Effect.gen(function* () {
        const { axmDir, canonicalPath } = setupWorkspace({ createSymlinks: false });

        const result = yield* disableSkill(makeOp()).pipe(
          Effect.provide(
            withServices(axmDir, {
              configuredAgents: ["claude-code"],
            }),
          ),
        );

        expect(result.result).toBe("success");
        // Canonical dir should be preserved
        expect(fs.existsSync(canonicalPath)).toBe(true);
      }),
    );
  });

  describe("settings-only disable (no lock entry)", () => {
    it.effect("updates settings to enabled: false without lockfile or symlink work", () =>
      Effect.gen(function* () {
        const base = path.join(tmpDir, "project");
        const axmDir = path.join(base, ".axm");
        fs.mkdirSync(axmDir, { recursive: true });

        const onUpdateEntry = vi.fn<(type: string, name: string) => void>();
        const result = yield* disableSkill(makeOp()).pipe(
          Effect.provide(
            withServices(axmDir, {
              configuredAgents: ["claude-code"],
              onUpdateEntry,
            }),
          ),
        );

        expect(result.result).toBe("success");
        // Settings should be updated
        expect(onUpdateEntry).toHaveBeenCalledOnce();
        expect(onUpdateEntry).toHaveBeenCalledWith("skill", "my-skill");
      }),
    );
  });

  describe("implicit promotion disable", () => {
    it.effect("promotes implicit skill to configured entry with enabled: false", () =>
      Effect.gen(function* () {
        const base = path.join(tmpDir, "project");
        const axmDir = path.join(base, ".axm");
        fs.mkdirSync(axmDir, { recursive: true });

        const onSetEntry = vi.fn<(type: string, name: string, entry: unknown) => void>();
        const rows = [
          implicitRow({
            type: "skill",
            name: "my-skill",
            source: "local:/tmp/source",
            packagingKind: "non-native",
          }),
        ];

        const result = yield* disableSkill(makeOp()).pipe(
          Effect.provide(withServices(axmDir, { rows, onSetEntry })),
        );

        expect(result.result).toBe("success");
        expect(onSetEntry).toHaveBeenCalledOnce();
        expect(onSetEntry).toHaveBeenCalledWith(
          "skill",
          "my-skill",
          expect.objectContaining({ enabled: false }),
        );
      }),
    );

    it.effect("derives a registry FQN when promoting an implicit registry skill", () =>
      Effect.gen(function* () {
        const base = path.join(tmpDir, "project");
        const axmDir = path.join(base, ".axm");
        fs.mkdirSync(axmDir, { recursive: true });

        const onSetEntry = vi.fn<(type: string, name: string, entry: unknown) => void>();
        const rows = [implicitRow({ type: "skill", name: "my-skill", packagingKind: "native" })];
        const graph: DesiredStateGraph = {
          complete: true,
          mcpSourceClosures: [],
          nodes: [
            {
              type: "skill",
              name: "my-skill",
              identity: "@community/skills/my-skill",
              source: "@community/skills/my-skill",
              enabled: true,
              constraints: [],
              origins: [
                {
                  type: "pack",
                  pack: "@community/packs/toolkit",
                  manifestPath:
                    "/project/agent_extensions/agentxm/@community/packs/toolkit/pack.json",
                  source: "@community/skills/my-skill",
                  constraint: "*",
                  enabled: true,
                },
              ],
            },
          ],
          problems: [],
        };

        const result = yield* disableSkill(makeOp()).pipe(
          Effect.provide(withServices(axmDir, { rows, graph, onSetEntry })),
        );

        expect(result.result).toBe("success");
        expect(onSetEntry).toHaveBeenCalledWith("skill", "my-skill", {
          source: "@community/skills/my-skill",
          enabled: false,
        });
      }),
    );

    it.effect("fails when implicit skill has no derivable source", () =>
      Effect.gen(function* () {
        const base = path.join(tmpDir, "project");
        const axmDir = path.join(base, ".axm");
        fs.mkdirSync(axmDir, { recursive: true });

        const rows = [
          implicitRow({ type: "skill", name: "my-skill", packagingKind: "non-native" }),
        ];

        const result = yield* disableSkill(makeOp()).pipe(
          Effect.provide(withServices(axmDir, { rows })),
          Effect.catch((e) => Effect.succeed({ result: "error" as const, message: e.detail })),
        );

        expect(result.result).toBe("error");
        expect(result.message).toContain("Cannot determine source");
      }),
    );
  });

  describe("rendered files tracking", () => {
    it.effect("removes copy-mode paths from renderedFiles while preserving canonical", () =>
      Effect.gen(function* () {
        const base = path.join(tmpDir, "project");
        const axmDir = path.join(base, ".axm");
        fs.mkdirSync(axmDir, { recursive: true });

        // Create the canonical source (should be preserved after disable)
        const canonicalPath = path.join(base, "agent_extensions", "external", "skills", "my-skill");
        fs.mkdirSync(canonicalPath, { recursive: true });
        fs.writeFileSync(path.join(canonicalPath, "SKILL.md"), "# my-skill");

        // Create the copied skill directory at a tracked rendered path
        const renderedPath = path.join(base, ".claude", "skills", "my-skill");
        fs.mkdirSync(renderedPath, { recursive: true });
        fs.writeFileSync(path.join(renderedPath, "SKILL.md"), "# my-skill");

        const result = yield* disableSkill(makeOp()).pipe(Effect.provide(withServices(axmDir)));

        expect(result.result).toBe("success");
        // The rendered agent path should be removed
        expect(fs.existsSync(renderedPath)).toBe(false);
        // The canonical source should be preserved
        expect(fs.existsSync(canonicalPath)).toBe(true);
        expect(fs.existsSync(path.join(canonicalPath, "SKILL.md"))).toBe(true);
      }),
    );

    it.effect("handles missing rendered files gracefully during disable", () =>
      Effect.gen(function* () {
        const base = path.join(tmpDir, "project");
        const axmDir = path.join(base, ".axm");
        fs.mkdirSync(axmDir, { recursive: true });

        // Don't create the rendered path — it doesn't exist on disk
        const result = yield* disableSkill(makeOp()).pipe(Effect.provide(withServices(axmDir)));

        // Should succeed even if rendered path doesn't exist
        expect(result.result).toBe("success");
      }),
    );
  });
});
