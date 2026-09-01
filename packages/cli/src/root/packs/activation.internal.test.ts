import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import YAML from "yaml";
import { afterEach, beforeEach } from "vitest";

import { CodingAgentRepositoryLive } from "@agentxm/extension-management/unstable/agents";
import { HookManagerLive } from "@agentxm/extension-management/unstable/hooks";
import { KnowledgeManagerLive } from "@agentxm/extension-management/unstable/knowledge";
import { McpServerManagerLive } from "@agentxm/extension-management/unstable/mcps";
import { RuleManagerLive } from "@agentxm/extension-management/unstable/rules";
import { SkillManagerLive } from "@agentxm/extension-management/unstable/skills";
import { SourceHostProvidersLive } from "@agentxm/extension-management/unstable/source-resolution";
import { SubagentManagerLive } from "@agentxm/extension-management/unstable/subagents";

import { computeMaterializedTreeIntegritySync, writeWorkspaceFiles } from "../../test-stubs.js";
import {
  expectAppliedPlanResult,
  expectDefined,
  expectNoOpPlanResult,
  expectPreviewedPlanResult,
  expectRecord,
  makeEffectProvide,
  makeWorkspaceHandlerTestContext,
} from "../../test-helpers.js";
import { handlePackActivation } from "./activation.js";
import { buildAggregateProjectionStep } from "../shared/aggregate-projection-step.js";

const initializePack = (root: string) => {
  const axmDir = path.join(root, ".axm");
  writeWorkspaceFiles(axmDir, {
    owner: "@acme",
    agents: ["claude-code"],
    sources: [{ type: "registry", name: "agentxm", location: "file:///tmp/test-registry" }],
    packs: { toolkit: "workspace" },
  });
  const packDir = path.join(root, "packs", "toolkit");
  fs.mkdirSync(packDir, { recursive: true });
  fs.writeFileSync(
    path.join(packDir, "pack.json"),
    JSON.stringify({
      owner: "@acme",
      type: "pack",
      name: "toolkit",
      version: "1.0.0",
      dependencies: {},
    }),
  );
  const lockPath = path.join(root, "axm-lock.yaml");
  return { axmDir, packDir, lockPath };
};

const initializePackWithSkill = (root: string) => {
  const { axmDir, packDir, lockPath } = initializePack(root);
  const skillDir = path.join(root, "agent_extensions", "agentxm", "@acme", "skills", "review");
  fs.mkdirSync(path.join(skillDir, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(skillDir, "skill.json"),
    JSON.stringify({ owner: "@acme", type: "skill", name: "review", version: "1.0.0" }),
  );
  fs.writeFileSync(
    path.join(skillDir, "src", "SKILL.md"),
    "---\nname: review\ndescription: Review code\n---\n\n# Review\n",
  );
  fs.writeFileSync(
    path.join(packDir, "pack.json"),
    JSON.stringify({
      owner: "@acme",
      type: "pack",
      name: "toolkit",
      version: "1.0.0",
      dependencies: { "@acme/skills/review": "^1.0.0" },
    }),
  );

  const lock = expectRecord(YAML.parse(fs.readFileSync(lockPath, "utf8")));
  fs.writeFileSync(
    lockPath,
    YAML.stringify({
      ...lock,
      skills: {
        review: {
          type: "registry",
          sourceType: "registry",
          endpoint: "file:///tmp/test-registry",
          extensionType: "skill",
          workspaceName: "review",
          packageFormat: "agentxm",
          owner: "@acme",
          name: "review",
          resolvedVersion: "1.0.0",
          integrity: "sha512-AAAA==",
          sourceName: "agentxm",
          publisherBindingId: "hbnd_test",
          treeIntegrity: computeMaterializedTreeIntegritySync(skillDir),
        },
      },
    }),
  );

  const renderedSkill = path.join(root, ".claude", "skills", "review", "SKILL.md");
  fs.mkdirSync(path.dirname(renderedSkill), { recursive: true });
  fs.copyFileSync(path.join(skillDir, "src", "SKILL.md"), renderedSkill);
  return { axmDir, lockPath, renderedSkill, skillDir };
};

const packSetting = (axmDir: string): unknown => {
  const settings = expectRecord(
    JSON.parse(fs.readFileSync(path.join(path.dirname(axmDir), "axm.json"), "utf8")),
  );
  return expectRecord(settings["packs"])["toolkit"];
};

describe("packs activation", () => {
  let root: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    root = fs.mkdtempSync(path.join(os.tmpdir(), "packs-activation-test-"));
    process.chdir(root);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(root, { recursive: true, force: true });
  });

  const makeLayers = () => {
    const context = makeWorkspaceHandlerTestContext({ machine: true });
    const sourceProvidersLayer = Layer.provide(
      SourceHostProvidersLive,
      Layer.merge(context.baseLayer, context.wsLayer),
    );
    const managerDependencies = Layer.mergeAll(
      context.baseLayer,
      context.wsLayer,
      sourceProvidersLayer,
      CodingAgentRepositoryLive,
    );
    const managersLayer = Layer.provide(
      Layer.mergeAll(
        HookManagerLive,
        KnowledgeManagerLive,
        McpServerManagerLive,
        RuleManagerLive,
        SkillManagerLive,
        SubagentManagerLive,
      ),
      managerDependencies,
    );
    return {
      ...context,
      provide: makeEffectProvide(
        Layer.mergeAll(
          context.baseLayer,
          context.wsLayer,
          sourceProvidersLayer,
          CodingAgentRepositoryLive,
          managersLayer,
        ),
      ),
    };
  };

  it.effect("resolves projection contributors only when the trailing step runs", () =>
    Effect.gen(function* () {
      const { packDir } = initializePack(root);
      const { provide } = makeLayers();
      const stepOption = yield* provide(
        buildAggregateProjectionStep({ types: new Set<"rule">(["rule"]) }),
      );
      if (Option.isNone(stepOption)) {
        throw new Error("Expected a projection step for a Rule-bearing Pack");
      }
      if (stepOption.value.readiness === "error") {
        throw new Error(stepOption.value.errorMessage);
      }

      fs.rmSync(path.join(packDir, "pack.json"));
      const failure = yield* provide(stepOption.value.run).pipe(Effect.flip);

      expect(failure.category).toBe("conflict");
      expect(failure.detail).toContain("cannot be enumerated completely");
    }),
  );

  it.effect("previews disable without changing retained state", () =>
    Effect.gen(function* () {
      const { packDir, lockPath } = initializePack(root);
      const settingsBefore = fs.readFileSync(path.join(root, "axm.json"), "utf8");
      const lockBefore = fs.readFileSync(lockPath, "utf8");
      const { provide, rendererState } = makeLayers();

      yield* provide(
        handlePackActivation({
          name: "toolkit",
          enabled: false,
          yes: true,
          preview: true,
        }),
      );

      expect(fs.readFileSync(path.join(root, "axm.json"), "utf8")).toBe(settingsBefore);
      expect(fs.readFileSync(lockPath, "utf8")).toBe(lockBefore);
      expect(fs.existsSync(packDir)).toBe(true);
      expectPreviewedPlanResult(expectDefined(rendererState.results[0]).data, {
        planName: "Disable pack",
        totalSteps: 1,
      });
    }),
  );

  it.effect("disables, reports an idempotent no-op, and re-enables without changing the lock", () =>
    Effect.gen(function* () {
      const { axmDir, packDir, lockPath } = initializePack(root);
      const lockBefore = fs.readFileSync(lockPath, "utf8");
      const first = makeLayers();

      yield* first.provide(
        handlePackActivation({
          name: "toolkit",
          enabled: false,
          yes: true,
          preview: false,
        }),
      );

      expect(packSetting(axmDir)).toEqual({
        source: "workspace",
        enabled: false,
      });
      expect(fs.readFileSync(lockPath, "utf8")).toBe(lockBefore);
      expect(fs.existsSync(packDir)).toBe(true);

      const second = makeLayers();
      yield* second.provide(
        handlePackActivation({
          name: "toolkit",
          enabled: false,
          yes: true,
          preview: false,
        }),
      );
      expectNoOpPlanResult(expectDefined(second.rendererState.results[0]).data, {
        planName: "Disable pack",
        message: 'Pack "toolkit" is already disabled',
      });

      const third = makeLayers();
      yield* third.provide(
        handlePackActivation({
          name: "toolkit",
          enabled: true,
          yes: true,
          preview: false,
        }),
      );
      expect(packSetting(axmDir)).toBe("workspace");
      expect(fs.readFileSync(lockPath, "utf8")).toBe(lockBefore);
      expect(fs.existsSync(packDir)).toBe(true);
    }),
  );

  it.effect("deactivates an exclusive member projection and restores it from retained state", () =>
    Effect.gen(function* () {
      const { axmDir, lockPath, renderedSkill, skillDir } = initializePackWithSkill(root);
      const lockBefore = fs.readFileSync(lockPath, "utf8");
      const disable = makeLayers();

      yield* disable.provide(
        handlePackActivation({
          name: "toolkit",
          enabled: false,
          yes: true,
          preview: false,
        }),
      );

      expect(packSetting(axmDir)).toEqual({
        source: "workspace",
        enabled: false,
      });
      expect(fs.existsSync(renderedSkill)).toBe(false);
      expect(fs.existsSync(path.join(skillDir, "src", "SKILL.md"))).toBe(true);
      expect(fs.readFileSync(lockPath, "utf8")).toBe(lockBefore);

      const enable = makeLayers();
      yield* enable.provide(
        handlePackActivation({
          name: "toolkit",
          enabled: true,
          yes: true,
          preview: false,
        }),
      );

      const enableData = expectDefined(enable.rendererState.results[0]).data;
      const enableResult = expectRecord(expectRecord(enableData)["result"]);
      expect(enableResult["units"]).toMatchObject([{ state: "committed" }]);
      expectAppliedPlanResult(enableData, {
        planName: "Enable pack",
      });
      expect(packSetting(axmDir)).toBe("workspace");
      expect(fs.existsSync(renderedSkill)).toBe(true);
      expect(fs.readFileSync(lockPath, "utf8")).toBe(lockBefore);
    }),
  );
});
