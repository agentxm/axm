import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { afterEach, beforeEach, vi } from "vitest";
import { TestRenderer } from "../../cli-renderer/index.js";
import {
  WorkspaceMutations,
  type WorkspaceMutationsService,
} from "../../workspace/service-interface.js";
import { makeBaseWorkspaceMock } from "../../workspace/test-stubs.js";
import { handle } from "../../test-helpers.js";
import type { NewSkillOperation } from "./new-skill.js";
import { newSkill } from "./new-skill.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/** Creates a workspace mock for new-skill tests. */
const makeWorkspaceMock = (
  axmDir: string,
  opts: {
    configuredAgents?: ReadonlyArray<string>;
    configuredProfile?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper
    configuredSkills?: Record<string, any>;
    setSkillEntryFn?: WorkspaceMutationsService["setSkillEntry"];
  } = {},
): WorkspaceMutationsService => {
  const configuredAgents = opts.configuredAgents ?? ["claude-code"];
  const configuredProfile = opts.configuredProfile ?? "@myorg";
  const configuredSkills = opts.configuredSkills ?? {};

  return makeBaseWorkspaceMock(axmDir, {
    getConfiguredOwner: () => Effect.succeed(Option.some(handle(configuredProfile))),
    getConfiguredSkills: () =>
      Effect.succeed(
        Object.fromEntries(
          Object.entries(configuredSkills).map(([k, v]) => [
            k,
            {
              source: typeof v === "string" ? v : (v?.source ?? ""),
              enabled: typeof v === "string" ? true : (v?.enabled ?? true),
              packagingKind: "non-native" as const,
            },
          ]),
        ),
      ),
    getConfiguredSkillEntries: () =>
      Effect.succeed(
        Object.fromEntries(
          Object.entries(configuredSkills).map(([k, v]) => [
            k,
            {
              source: typeof v === "string" ? v : (v?.source ?? ""),
              enabled: typeof v === "string" ? true : (v?.enabled ?? true),
              authored: typeof v === "string" ? false : (v?.authored ?? false),
            },
          ]),
        ),
      ),
    getConfiguredAgents: () => Effect.succeed(configuredAgents),
    setSkillEntry: opts.setSkillEntryFn ?? (() => Effect.void),
  });
};

/** Creates a layer providing FileSystem + a minimal WorkspaceMutations service. */
const withServices = (axmDir: string, wsOpts?: Parameters<typeof makeWorkspaceMock>[1]) => {
  const mockWs = makeWorkspaceMock(axmDir, wsOpts);
  const { layer: outputLayer } = TestRenderer.make();
  return Layer.mergeAll(NodeServices.layer, WorkspaceMutations.layer(mockWs), outputLayer);
};

/** Creates a minimal NewSkillOperation for testing. */
const makeOp = (overrides: Partial<NewSkillOperation["args"]> = {}): NewSkillOperation => ({
  name: "new-skill",
  args: {
    name: overrides.name ?? "my-skill",
    owner: overrides.owner ?? handle("@myorg"),
    agents: overrides.agents ?? ["claude-code"],
  },
});

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("newSkill", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "new-skill-")));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const setupBase = () => {
    const base = path.join(tmpDir, "project");
    const axmDir = path.join(base, ".axm");
    fs.mkdirSync(axmDir, { recursive: true });
    return { base, axmDir };
  };

  describe("happy path", () => {
    it.effect("creates skill directory with manifest and SKILL.md", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();

        const result = yield* newSkill(makeOp()).pipe(Effect.provide(withServices(axmDir)));

        expect(result.result).toBe("success");

        // Verify skill directory was created under registry path
        const skillDir = path.join(base, ".axm", "extensions", "@myorg", "skills", "my-skill");
        expect(fs.existsSync(path.join(skillDir, "src", "SKILL.md"))).toBe(true);
      }),
    );

    it.effect("creates agent symlinks for configured agents", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();

        const result = yield* newSkill(makeOp({ agents: ["claude-code", "cursor"] })).pipe(
          Effect.provide(withServices(axmDir, { configuredAgents: ["claude-code", "cursor"] })),
        );

        expect(result.result).toBe("success");

        // Agent symlinks should exist
        expect(fs.existsSync(path.join(base, ".claude", "skills", "my-skill"))).toBe(true);
        expect(fs.existsSync(path.join(base, ".cursor", "skills", "my-skill"))).toBe(true);
      }),
    );

    it.effect("registers skill in settings via setSkillEntry", () =>
      Effect.gen(function* () {
        const { axmDir } = setupBase();
        const setSkillEntryFn = vi.fn<WorkspaceMutationsService["setSkillEntry"]>(
          (_name, _entry) => Effect.void,
        );

        const result = yield* newSkill(makeOp()).pipe(
          Effect.provide(withServices(axmDir, { setSkillEntryFn })),
        );

        expect(result.result).toBe("success");
        expect(setSkillEntryFn).toHaveBeenCalledOnce();
        expect(setSkillEntryFn).toHaveBeenCalledWith(
          "my-skill",
          expect.objectContaining({
            source: "@myorg/skills/my-skill",
            enabled: true,
          }),
        );
      }),
    );

    it.effect("writes correct manifest identity fields and version", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();

        const result = yield* newSkill(makeOp()).pipe(Effect.provide(withServices(axmDir)));

        expect(result.result).toBe("success");

        // Check manifest content
        const manifestPath = path.join(
          base,
          ".axm",
          "extensions",
          "@myorg",
          "skills",
          "my-skill",
          "skill.json",
        );
        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
        expect(manifest.owner).toBe("@myorg");
        expect(manifest.type).toBe("skill");
        expect(manifest.name).toBe("my-skill");
        expect(manifest.version).toBe("0.0.1");
      }),
    );
  });

  describe("managed marker", () => {
    it.effect("does NOT include managed marker in scaffolded SKILL.md", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();

        const result = yield* newSkill(makeOp()).pipe(Effect.provide(withServices(axmDir)));

        expect(result.result).toBe("success");

        const skillMdPath = path.join(
          base,
          ".axm",
          "extensions",
          "@myorg",
          "skills",
          "my-skill",
          "src",
          "SKILL.md",
        );
        const content = fs.readFileSync(skillMdPath, "utf-8");
        expect(content).not.toContain("Managed by axm");
      }),
    );
  });

  describe("error cases", () => {
    it.effect("fails when skill directory already exists", () =>
      Effect.gen(function* () {
        const { axmDir } = setupBase();

        const result = yield* newSkill(makeOp()).pipe(
          Effect.provide(
            withServices(axmDir, {
              configuredSkills: { "my-skill": "@myorg/skills/my-skill" },
            }),
          ),
          Effect.catch((e) => Effect.succeed({ result: "error" as const, message: e.detail })),
        );

        // Should fail because skill already exists in settings
        expect(result.result).toBe("error");
      }),
    );
  });
});
