import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, layer } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { afterEach, beforeEach, vi } from "vitest";
import type { SkillLockEntry } from "../../../desired-state/index.js";
import { SettingsWriter } from "../../../desired-state/index.js";
import {
  makeRegistrySkillLockEntry,
  MockWorkspaceTransactionScope,
  TEST_CONTENT_IDENTITY,
  TEST_TREE_INTEGRITY,
  WorkspaceReadTest,
} from "../../../desired-state/testing.js";
import type { EnableSkillOperation } from "./enable.js";
import { enableSkill } from "./enable.js";
import {
  TestStepFailureConversion,
  computeMaterializedTreeIntegritySync,
  extensionName,
  handle,
} from "../../../lifecycle/test-helpers.js";
import { decodeRelativePathSync } from "@agentxm/extension-model/unstable/path-types";
import type { ConfigurableAgentId } from "@agentxm/extension-model/unstable/extensions";
import { computePackageContentHash } from "../../../desired-state/index.js";
import { type SourceHash } from "@agentxm/extension-model/unstable/sources/source-hash";
import { CodingAgentRepository, DefaultCodingAgentRepository } from "../../../projection/index.js";

type SettingsSkillValue =
  | string
  | {
      readonly source?: string | undefined;
      readonly enabled?: boolean | undefined;
    };

const getConfiguredSkillSource = (value: SettingsSkillValue): string =>
  typeof value === "string" ? value : (value.source ?? "");

const isConfiguredSkillEnabled = (value: SettingsSkillValue): boolean =>
  typeof value === "string" ? true : (value.enabled ?? true);

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

interface EnableSkillTestFacts {
  readonly configuredAgents?: ReadonlyArray<ConfigurableAgentId>;
  readonly lockfileSkills?: Record<string, SkillLockEntry>;
  readonly settingsSkills?: Record<string, SettingsSkillValue>;
  readonly onUpdateEntry?: (type: string, name: string) => void;
}

/** Provides the owned read, write, agent, and transaction capabilities used by enable. */
const withServices = (axmDir: string, facts: EnableSkillTestFacts = {}) => {
  const configuredAgents = facts.configuredAgents ?? ["claude-code"];
  const settingsSkills = facts.settingsSkills ?? {};
  const normalizedSettingsSkills = Object.fromEntries(
    Object.entries(settingsSkills).map(([name, value]) => [
      name,
      {
        source: getConfiguredSkillSource(value),
        enabled: isConfiguredSkillEnabled(value),
      },
    ]),
  );
  const graph = {
    complete: true as const,
    nodes: Object.entries(settingsSkills).map(([name, value]) => {
      const source = getConfiguredSkillSource(value);
      const enabled = isConfiguredSkillEnabled(value);
      return {
        type: "skill" as const,
        name,
        identity: source,
        source,
        enabled,
        constraints: [],
        origins: [{ type: "settings" as const, source, enabled }],
      };
    }),
    mcpSourceClosures: [],
    problems: [],
  };
  return Layer.mergeAll(
    WorkspaceReadTest({
      baseDir: path.dirname(axmDir),
      runtimeDir: axmDir,
      settings: { agents: configuredAgents, skills: normalizedSettingsSkills },
      lockfile: { lockfileVersion: 7, skills: facts.lockfileSkills ?? {} },
      graph,
    }),
    Layer.mock(SettingsWriter, {
      updateEntry: (type, name, _update) => Effect.sync(() => facts.onUpdateEntry?.(type, name)),
    }),
    Layer.succeed(CodingAgentRepository, DefaultCodingAgentRepository),
    MockWorkspaceTransactionScope(axmDir),
    TestStepFailureConversion,
  ).pipe(Layer.provideMerge(NodeServices.layer));
};

/** Creates a minimal EnableSkillOperation for testing. */
const makeOp = (skillName = "my-skill"): EnableSkillOperation => ({
  name: "enable-skill",
  args: { skillName },
});

/** Creates a local source accepted-resolution entry for the in-memory mock. */
const makeLocalLockEntry = (
  packageRoot?: string,
  sourcePath = "tmp/source",
  contentIdentity: SourceHash = TEST_CONTENT_IDENTITY,
): SkillLockEntry => ({
  type: "local" as const,
  sourceType: "local",
  sourceName: "local",
  extensionType: "skill",
  workspaceName: extensionName("my-skill"),
  packageFormat: "agentxm",
  packageOwner: handle("@community"),
  packageName: extensionName("my-skill"),
  path: decodeRelativePathSync(sourcePath),
  contentIdentity,
  treeIntegrity:
    packageRoot === undefined
      ? TEST_TREE_INTEGRITY
      : computeMaterializedTreeIntegritySync(packageRoot),
});

/** Creates a registry source lock entry for the in-memory mock (DateTime.Utc values). */
const makeRegistryLockEntry = (packageRoot: string): SkillLockEntry => ({
  ...makeRegistrySkillLockEntry({
    owner: handle("@community"),
    name: "my-skill",
    sourceName: "agentxm",
    publisherBindingId: "hbnd_test",
  }),
  treeIntegrity: computeMaterializedTreeIntegritySync(packageRoot),
});

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

layer(NodeServices.layer, { excludeTestServices: true })("enableSkill", (it) => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "enable-skill-")));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  /** Sets up a workspace with .axm dir and canonical skill files already present. */
  const setupWorkspace = (
    opts: {
      skillName?: string;
      agents?: string[];
    } = {},
  ) => {
    const skillName = opts.skillName ?? "my-skill";
    const agents = opts.agents ?? ["claude-code"];
    const base = path.join(tmpDir, "project");
    const axmDir = path.join(base, ".axm");
    fs.mkdirSync(axmDir, { recursive: true });

    const canonicalDir = path.join(base, "agent_extensions", "local", "tmp", "source");
    fs.mkdirSync(path.join(canonicalDir, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(canonicalDir, "skill.json"),
      JSON.stringify({ owner: "@community", type: "skill", name: skillName, version: "1.0.0" }),
    );
    fs.writeFileSync(path.join(canonicalDir, "src", "SKILL.md"), `# ${skillName}`);
    fs.writeFileSync(path.join(canonicalDir, "src", "prompt.md"), "prompt content");

    return { base, axmDir, canonicalDir, skillName, agents };
  };

  describe("happy path", () => {
    it.effect("creates agent symlinks from existing canonical directory", () =>
      Effect.gen(function* () {
        const { axmDir, base, canonicalDir } = setupWorkspace();
        const contentIdentity = yield* computePackageContentHash(canonicalDir);
        const result = yield* enableSkill(makeOp()).pipe(
          Effect.provide(
            withServices(axmDir, {
              configuredAgents: ["claude-code"],
              lockfileSkills: {
                "my-skill": makeLocalLockEntry(canonicalDir, "tmp/source", contentIdentity),
              },
              settingsSkills: {
                "my-skill": { source: "./tmp/source", enabled: false },
              },
            }),
          ),
        );

        expect(result.result).toBe("success");
        expect(result.message).toContain("my-skill");

        // Canonical location should still have files
        expect(fs.existsSync(path.join(canonicalDir, "src", "SKILL.md"))).toBe(true);

        // Agent symlink should exist
        const agentSkillDir = path.join(base, ".claude", "skills", "my-skill");
        expect(fs.existsSync(agentSkillDir)).toBe(true);
        expect(fs.lstatSync(agentSkillDir).isSymbolicLink()).toBe(true);
      }),
    );

    it.effect("handles multiple agents concurrently", () =>
      Effect.gen(function* () {
        const { axmDir, base, canonicalDir } = setupWorkspace({
          agents: ["claude-code", "cursor"],
        });
        const contentIdentity = yield* computePackageContentHash(canonicalDir);
        const result = yield* enableSkill(makeOp()).pipe(
          Effect.provide(
            withServices(axmDir, {
              configuredAgents: ["claude-code", "cursor"],
              lockfileSkills: {
                "my-skill": makeLocalLockEntry(canonicalDir, "tmp/source", contentIdentity),
              },
              settingsSkills: {
                "my-skill": { source: "./tmp/source", enabled: false },
              },
            }),
          ),
        );

        expect(result.result).toBe("success");

        // Both agent symlinks should exist
        expect(fs.existsSync(path.join(base, ".claude", "skills", "my-skill"))).toBe(true);
        expect(fs.existsSync(path.join(base, ".cursor", "skills", "my-skill"))).toBe(true);
      }),
    );

    it.effect("updates the skill preference to enabled", () =>
      Effect.gen(function* () {
        const { axmDir, canonicalDir } = setupWorkspace();
        const contentIdentity = yield* computePackageContentHash(canonicalDir);
        const onUpdateEntry = vi.fn<(type: string, name: string) => void>();

        yield* enableSkill(makeOp()).pipe(
          Effect.provide(
            withServices(axmDir, {
              configuredAgents: ["claude-code"],
              lockfileSkills: {
                "my-skill": makeLocalLockEntry(canonicalDir, "tmp/source", contentIdentity),
              },
              settingsSkills: {
                "my-skill": { source: "./tmp/source", enabled: false },
              },
              onUpdateEntry,
            }),
          ),
        );

        expect(onUpdateEntry).toHaveBeenCalledOnce();
        expect(onUpdateEntry).toHaveBeenCalledWith("skill", "my-skill");
      }),
    );
  });

  describe("missing canonical directory", () => {
    it.effect("fails when canonical directory does not exist", () =>
      Effect.gen(function* () {
        const base = path.join(tmpDir, "project");
        const axmDir = path.join(base, ".axm");
        fs.mkdirSync(axmDir, { recursive: true });
        // Do NOT create canonical directory

        const onUpdateEntry = vi.fn<(type: string, name: string) => void>();
        const result = yield* enableSkill(makeOp()).pipe(
          Effect.provide(
            withServices(axmDir, {
              configuredAgents: ["claude-code"],
              lockfileSkills: { "my-skill": makeLocalLockEntry() },
              settingsSkills: {
                "my-skill": { source: "./tmp/source", enabled: false },
              },
              onUpdateEntry,
            }),
          ),
          Effect.catch((e) => Effect.succeed({ result: "error" as const, message: e.detail })),
        );

        expect(result.result).toBe("error");
        expect(result.message).toContain("not usable");
        // State should NOT have been updated
        expect(onUpdateEntry).not.toHaveBeenCalled();
      }),
    );
  });

  describe("registry source", () => {
    it.effect("uses registry canonical path for registry lock entries", () =>
      Effect.gen(function* () {
        const base = path.join(tmpDir, "project");
        const axmDir = path.join(base, ".axm");

        // Create registry-style canonical directory with src subdirectory
        const registryCanonical = path.join(
          base,
          "agent_extensions",
          "agentxm",
          "@community",
          "skills",
          "my-skill",
        );
        const registrySrcDir = path.join(registryCanonical, "src");
        fs.mkdirSync(registrySrcDir, { recursive: true });
        fs.writeFileSync(
          path.join(registryCanonical, "skill.json"),
          JSON.stringify({
            owner: "@community",
            type: "skill",
            name: "my-skill",
            version: "1.0.0",
          }),
        );
        fs.writeFileSync(path.join(registrySrcDir, "SKILL.md"), "# my-skill");
        const result = yield* enableSkill(makeOp()).pipe(
          Effect.provide(
            withServices(axmDir, {
              configuredAgents: ["claude-code"],
              lockfileSkills: { "my-skill": makeRegistryLockEntry(registryCanonical) },
              settingsSkills: {
                "my-skill": {
                  source: "@community/skills/my-skill",
                  enabled: false,
                },
              },
            }),
          ),
        );

        expect(result.result).toBe("success");

        // Agent symlink should point to registry src path
        const agentSkillDir = path.join(base, ".claude", "skills", "my-skill");
        expect(fs.existsSync(agentSkillDir)).toBe(true);
      }),
    );
  });

  describe("settings-only enable (no lock entry)", () => {
    it.effect("fails without desired canonical content", () =>
      Effect.gen(function* () {
        const base = path.join(tmpDir, "project");
        const axmDir = path.join(base, ".axm");
        fs.mkdirSync(axmDir, { recursive: true });

        const onUpdateEntry = vi.fn<(type: string, name: string) => void>();
        const result = yield* enableSkill(makeOp()).pipe(
          Effect.provide(
            withServices(axmDir, {
              configuredAgents: ["claude-code"],
              lockfileSkills: {},
              settingsSkills: {
                "my-skill": { source: "./tmp/source", enabled: false },
              },
              onUpdateEntry,
            }),
          ),
          Effect.catch((error) => Effect.succeed({ result: "error" as const, error })),
        );

        expect(result.result).toBe("error");
        expect(onUpdateEntry).not.toHaveBeenCalled();
        // No agent symlinks should have been created (no canonical dir)
        expect(fs.existsSync(path.join(base, ".claude", "skills", "my-skill"))).toBe(false);
      }),
    );
  });

  describe("error cases", () => {
    it.effect("fails when canonical directory is missing (lock entry present)", () =>
      Effect.gen(function* () {
        const base = path.join(tmpDir, "project");
        const axmDir = path.join(base, ".axm");
        fs.mkdirSync(axmDir, { recursive: true });
        // Do NOT create canonical directory

        const result = yield* enableSkill(makeOp()).pipe(
          Effect.provide(
            withServices(axmDir, {
              configuredAgents: ["claude-code"],
              lockfileSkills: { "my-skill": makeLocalLockEntry() },
              settingsSkills: {
                "my-skill": { source: "./tmp/source", enabled: false },
              },
            }),
          ),
          Effect.catch((e) => Effect.succeed({ result: "error" as const, message: e.detail })),
        );

        expect(result.result).toBe("error");
        expect(result.message).toContain("not usable");
      }),
    );
  });
});
